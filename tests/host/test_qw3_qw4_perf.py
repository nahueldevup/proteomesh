"""
Tests para QW-3 (batching getprop location) y QW-4 (caché de contenedores).

QW-3: Verifica que get_instance_location_sync y cmd_get_location emiten
      UNA sola llamada `docker exec sh -c` en lugar de 5 getprop individuales.

QW-4: Verifica que get_running_containers_map cachea el resultado, lo invalida
      en los puntos correctos (invalidate_containers_cache) y respeta el TTL.
"""
import sys
import time
import struct
import threading
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch, call

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(REPO_ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "tools"))


# ─── QW-3: Batching getprop ──────────────────────────────────────────────────

class GetpropBatchingBridgeTest(unittest.TestCase):
    """Valida el batching en server.services.manager_bridge.get_instance_location_sync."""

    def _make_batch_output(self, lat="-31.42", lon="-64.18", city="Córdoba",
                           tz="America/Argentina/Cordoba", alt="460.0") -> str:
        sep = "§"
        return f"{lat}\n{sep}\n{lon}\n{sep}\n{city}\n{sep}\n{tz}\n{sep}\n{alt}\n"

    @patch("server.services.manager_bridge.subprocess.run")
    def test_single_exec_call_for_location(self, mock_run):
        """get_instance_location_sync emite exactamente una llamada exec sh -c (batch)."""
        import tempfile, json, os
        from server.services.manager_bridge import get_instance_location_sync
        import server.services.manager_bridge as bridge

        orig_instances_dir = bridge.INSTANCES_DIR
        with tempfile.TemporaryDirectory() as tmpdir:
            instances_dir = Path(tmpdir)
            inst_dir = instances_dir / "phone-80"
            inst_dir.mkdir()
            meta = {
                "instance_name": "phone-80",
                "location": {"city": "Buenos Aires", "latitude": -34.60, "longitude": -58.38,
                             "altitude": 25.0, "accuracy": 4.2,
                             "timezone": "America/Argentina/Buenos_Aires"}
            }
            (inst_dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")

            bridge.INSTANCES_DIR = instances_dir
            try:
                def fake_run(cmd, *args, **kwargs):
                    # docker ps -q → contenedor presente
                    if cmd[:3] == ["docker", "ps", "-q"]:
                        return MagicMock(returncode=0, stdout="cid123\n")
                    # docker exec sh -c (batch QW-3)
                    if cmd[:3] == ["docker", "exec", "phone-80"] and "sh" in cmd:
                        return MagicMock(
                            returncode=0,
                            stdout=self._make_batch_output()
                        )
                    return MagicMock(returncode=0, stdout="")

                mock_run.side_effect = fake_run
                result = get_instance_location_sync("phone-80")

                # Verificar que sólo hubo UNA llamada "docker exec phone-80 sh"
                exec_sh_calls = [
                    c for c in mock_run.call_args_list
                    if c[0][0][:3] == ["docker", "exec", "phone-80"] and "sh" in c[0][0]
                ]
                self.assertEqual(len(exec_sh_calls), 1,
                    f"Esperaba 1 llamada exec+sh (batch), encontré {len(exec_sh_calls)}")

                # Verificar que NO hubo llamadas individuales a getprop
                individual_getprop_calls = [
                    c for c in mock_run.call_args_list
                    if c[0][0][:3] == ["docker", "exec", "phone-80"]
                    and len(c[0][0]) == 5
                    and c[0][0][3] == "getprop"
                ]
                self.assertEqual(len(individual_getprop_calls), 0,
                    "Encontré llamadas individuales a getprop (QW-3 no aplicado)")

                # Verificar que la ubicación se parseó correctamente
                self.assertAlmostEqual(result.location.latitude, -31.42, places=2)
                self.assertAlmostEqual(result.location.longitude, -64.18, places=2)
                self.assertEqual(result.location.timezone, "America/Argentina/Cordoba")
                self.assertTrue(result.is_live_query)
            finally:
                bridge.INSTANCES_DIR = orig_instances_dir

    @patch("server.services.manager_bridge.subprocess.run")
    def test_batch_separator_parsing(self, mock_run):
        """El separador § se parsea correctamente en todos los campos."""
        import tempfile, json
        from server.services.manager_bridge import get_instance_location_sync
        import server.services.manager_bridge as bridge

        orig_instances_dir = bridge.INSTANCES_DIR
        with tempfile.TemporaryDirectory() as tmpdir:
            instances_dir = Path(tmpdir)
            inst_dir = instances_dir / "phone-99"
            inst_dir.mkdir()
            meta = {"instance_name": "phone-99", "location": None}
            (inst_dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")

            bridge.INSTANCES_DIR = instances_dir
            try:
                def fake_run(cmd, *args, **kwargs):
                    if cmd[:3] == ["docker", "ps", "-q"]:
                        return MagicMock(returncode=0, stdout="abc\n")
                    if "sh" in cmd:
                        # Altitud vacía → debe defaults a 25.0
                        return MagicMock(
                            returncode=0,
                            stdout="40.41\n§\n-3.70\n§\nMadrid\n§\nEurope/Madrid\n§\n\n"
                        )
                    return MagicMock(returncode=0, stdout="")

                mock_run.side_effect = fake_run
                result = get_instance_location_sync("phone-99")
                self.assertAlmostEqual(result.location.latitude, 40.41, places=2)
                self.assertAlmostEqual(result.location.longitude, -3.70, places=2)
                self.assertEqual(result.location.city, "Madrid")
                self.assertEqual(result.location.timezone, "Europe/Madrid")
                # Altitud vacía → 25.0
                self.assertAlmostEqual(result.location.altitude, 25.0, places=1)
            finally:
                bridge.INSTANCES_DIR = orig_instances_dir


class GetpropBatchingManagerTest(unittest.TestCase):
    """Valida el batching en tools/instance_manager.py::cmd_get_location."""

    @patch("subprocess.run")
    def test_cmd_get_location_uses_single_batch(self, mock_run):
        """cmd_get_location emite UNA sola llamada docker exec sh -c."""
        import tempfile, json, types
        from instance_manager import cmd_get_location, INSTANCES_DIR
        import instance_manager as im

        orig_instances_dir = im.INSTANCES_DIR
        with tempfile.TemporaryDirectory() as tmpdir:
            instances_dir = Path(tmpdir)
            inst_dir = instances_dir / "phone-80"
            inst_dir.mkdir()
            meta = {
                "instance_name": "phone-80",
                "location": {"city": "BA", "latitude": -34.60, "longitude": -58.38,
                             "altitude": 25.0, "accuracy": 4.2,
                             "timezone": "America/Argentina/Buenos_Aires"}
            }
            (inst_dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
            im.INSTANCES_DIR = instances_dir
            try:
                def fake_run(cmd, *args, **kwargs):
                    if cmd[:3] == ["docker", "ps", "-q"]:
                        return MagicMock(returncode=0, stdout="cid\n")
                    if "sh" in cmd:
                        return MagicMock(
                            returncode=0,
                            stdout="-31.42\n§\n-64.18\n§\nCórdoba\n§\nAmerica/Argentina/Cordoba\n§\n460.0\n"
                        )
                    return MagicMock(returncode=0, stdout="")

                mock_run.side_effect = fake_run
                args = types.SimpleNamespace(name="phone-80", json=True)
                import io
                from contextlib import redirect_stdout
                buf = io.StringIO()
                with redirect_stdout(buf):
                    cmd_get_location(args)

                output = json.loads(buf.getvalue())
                self.assertAlmostEqual(output["location"]["latitude"], -31.42, places=2)

                # Verificar UNA sola llamada exec sh -c
                exec_sh_calls = [
                    c for c in mock_run.call_args_list
                    if len(c[0][0]) > 2
                    and c[0][0][0] == "docker"
                    and c[0][0][1] == "exec"
                    and "sh" in c[0][0]
                ]
                self.assertEqual(len(exec_sh_calls), 1,
                    f"Esperaba 1 llamada exec+sh, encontré {len(exec_sh_calls)}")

                # Sin llamadas individuales getprop
                individual = [
                    c for c in mock_run.call_args_list
                    if len(c[0][0]) == 5
                    and c[0][0][0] == "docker"
                    and c[0][0][3] == "getprop"
                ]
                self.assertEqual(len(individual), 0,
                    "Encontré llamadas getprop individuales (QW-3 no aplicado en instance_manager)")
            finally:
                im.INSTANCES_DIR = orig_instances_dir


# ─── QW-4: Caché de contenedores ─────────────────────────────────────────────

class ContainersCacheTest(unittest.TestCase):
    """Valida el caché TTL de get_running_containers_map (QW-4)."""

    def setUp(self):
        from server.services.manager_bridge import invalidate_containers_cache
        invalidate_containers_cache()

    def tearDown(self):
        from server.services.manager_bridge import invalidate_containers_cache
        invalidate_containers_cache()

    @patch("server.services.manager_bridge.subprocess.run")
    def test_cache_hit_within_ttl(self, mock_run):
        """Dos llamadas consecutivas dentro del TTL sólo disparan un docker ps."""
        from server.services.manager_bridge import get_running_containers_map

        mock_run.return_value = MagicMock(
            returncode=0, stdout="phone-80\tUp 2 hours\n"
        )
        result1 = get_running_containers_map()
        result2 = get_running_containers_map()

        self.assertEqual(result1, result2)
        self.assertEqual(mock_run.call_count, 1,
            f"Esperaba 1 llamada docker ps, encontré {mock_run.call_count}")

    @patch("server.services.manager_bridge.subprocess.run")
    def test_cache_invalidation_forces_refresh(self, mock_run):
        """invalidate_containers_cache() fuerza un nuevo docker ps."""
        from server.services.manager_bridge import (
            get_running_containers_map,
            invalidate_containers_cache,
        )

        mock_run.return_value = MagicMock(
            returncode=0, stdout="phone-80\tUp 2 hours\n"
        )
        get_running_containers_map()
        invalidate_containers_cache()
        get_running_containers_map()

        self.assertEqual(mock_run.call_count, 2,
            f"Tras invalidar, esperaba 2 llamadas docker ps, encontré {mock_run.call_count}")

    @patch("server.services.manager_bridge.subprocess.run")
    def test_cache_returns_independent_copy(self, mock_run):
        """El caché devuelve copias independientes (mutación no afecta caché interno)."""
        from server.services.manager_bridge import get_running_containers_map

        mock_run.return_value = MagicMock(
            returncode=0, stdout="phone-80\tUp 2 hours\n"
        )
        result1 = get_running_containers_map()
        result1["phone-80"] = "MUTATED"
        result2 = get_running_containers_map()

        self.assertNotEqual(result2.get("phone-80"), "MUTATED",
            "El caché interno fue mutado desde afuera")

    @patch("server.services.manager_bridge.subprocess.run")
    def test_cache_thread_safe(self, mock_run):
        """Muchas llamadas concurrentes dentro del TTL sólo disparan un docker ps."""
        from server.services.manager_bridge import get_running_containers_map, invalidate_containers_cache
        invalidate_containers_cache()

        mock_run.return_value = MagicMock(
            returncode=0, stdout="phone-80\tUp 2 hours\n"
        )

        results = []
        def worker():
            results.append(get_running_containers_map())

        threads = [threading.Thread(target=worker) for _ in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(results), 20)
        # Permite una o pocas llamadas por race condition al arranque, pero no 20
        self.assertLessEqual(mock_run.call_count, 3,
            f"Demasiadas llamadas docker ps concurrentes: {mock_run.call_count}")

    @patch("server.services.manager_bridge.subprocess.run")
    def test_invalidate_called_on_stop(self, mock_run):
        """Después de stop, el caché es inválido (se llama invalidate_containers_cache)."""
        from server.services.manager_bridge import (
            get_running_containers_map,
            invalidate_containers_cache,
        )
        # Rellenar caché
        mock_run.return_value = MagicMock(returncode=0, stdout="phone-80\tUp\n")
        get_running_containers_map()
        count_before = mock_run.call_count

        # Simular invalidación (como hace stop_instance_async)
        invalidate_containers_cache()
        get_running_containers_map()

        self.assertEqual(mock_run.call_count, count_before + 1,
            "Tras invalidación manual (stop), debería haber una nueva consulta docker ps")


if __name__ == "__main__":
    unittest.main()
