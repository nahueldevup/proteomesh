"""
Tests para QW-5 (--restart unless-stopped + --shm-size 128m)
y QW-6 (batching de pm disable-user en post_boot).
"""
import json
import sys
import types
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(REPO_ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "tools"))


# ─── QW-5: --restart unless-stopped + --shm-size 128m ───────────────────────

class DockerRunFlagsTest(unittest.TestCase):
    """Valida que docker run incluye --restart y --shm-size (QW-5)."""

    def _setup_mock_instance(self, tmp_path: Path, inst_name: str, port: int = 5590):
        inst_dir = tmp_path / inst_name
        inst_dir.mkdir(parents=True, exist_ok=True)
        meta = {
            "instance_name": inst_name,
            "port": port,
            "adb_port": port,
            "limits": {"memory": "2560m", "swap": "700m", "cpus": "1,9"},
            "display": {"width": 1080, "height": 2340, "dpi": 440, "fps": 90},
            "location": None,
        }
        (inst_dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
        (inst_dir / "profile.json").write_text(json.dumps({"valid": True}), encoding="utf-8")
        (inst_dir / "data").mkdir(exist_ok=True)
        return types.SimpleNamespace(name=inst_name, verify_health=False)

    @patch("subprocess.run")
    def test_restart_and_shm_in_run_cmd(self, mock_run):
        """docker run incluye tanto --restart unless-stopped como --shm-size 128m."""
        import instance_manager as im

        captured_cmds = []

        def fake_run(cmd, *args, **kwargs):
            cmd_list = list(cmd)
            captured_cmds.append(cmd_list)
            if len(cmd_list) > 1 and cmd_list[0] == "docker" and cmd_list[1] == "run":
                # Interrumpir después de capturar docker run para no entrar al loop de ADB connect
                raise StopIteration("captured docker run")
            return MagicMock(returncode=0, stdout="c1d000000000\n", stderr="")

        mock_run.side_effect = fake_run

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            args = self._setup_mock_instance(tmp_path, "phone-80")

            with patch("instance_manager.INSTANCES_DIR", tmp_path), \
                 patch("instance_manager.validate_bundle", return_value=({}, {})), \
                 patch("instance_manager.predict_next_container_ip", return_value=None), \
                 patch("instance_manager.verify_instance_health", return_value=None):
                try:
                    im.cmd_start_instance(args)
                except Exception:
                    pass

        docker_run_cmds = [
            c for c in captured_cmds
            if len(c) > 2 and c[0] == "docker" and c[1] == "run"
        ]
        self.assertTrue(docker_run_cmds, "No se encontró ningún comando 'docker run'")
        cmd = docker_run_cmds[0]

        # Validar --restart unless-stopped
        self.assertIn("--restart", cmd, f"--restart no presente en: {cmd}")
        idx_restart = cmd.index("--restart")
        self.assertEqual(cmd[idx_restart + 1], "unless-stopped")

        # Validar --shm-size 128m
        self.assertIn("--shm-size", cmd, f"--shm-size no presente en: {cmd}")
        idx_shm = cmd.index("--shm-size")
        self.assertEqual(cmd[idx_shm + 1], "128m")


# ─── QW-6: Batching pm disable-user ─────────────────────────────────────────

class PmDisableBatchingTest(unittest.TestCase):
    """Valida que apply_runtime_defaults batchea las deshabilitaciones (QW-6)."""

    def _meta(self):
        return {
            "display": {"width": 1080, "height": 2340, "dpi": 440},
        }

    @patch("instance_manager._run")
    def test_single_adb_call_for_all_missing(self, mock_run):
        """Con N paquetes faltantes debe emitirse UNA sola llamada batch 'for p in'."""
        import instance_manager as im

        captured_cmds = []

        def fake_run(cmd, *args, **kwargs):
            cmd_list = list(cmd)
            captured_cmds.append(cmd_list)
            # Simular display OK
            if "wm" in cmd_list:
                return MagicMock(returncode=0, stdout="Override size: 1080x2340\nOverride density: 440\n", stderr="")
            return MagicMock(returncode=0, stdout="", stderr="")

        mock_run.side_effect = fake_run

        with patch("instance_manager.get_disabled_packages", return_value=set()):
            im.apply_runtime_defaults("127.0.0.1:5590", self._meta(), read_only_verify=False)

        # Buscar llamadas con batch "for p in"
        batch_calls = [
            c for c in captured_cmds
            if any("for p in" in str(x) for x in c)
        ]
        self.assertEqual(len(batch_calls), 1,
            f"Esperaba exactamente 1 llamada batch, encontré {len(batch_calls)}")

        # No debe haber llamadas individuales
        individual_calls = [
            c for c in captured_cmds
            if "pm" in c and "disable-user" in c and "for" not in " ".join(str(x) for x in c)
        ]
        self.assertEqual(len(individual_calls), 0,
            f"Encontré llamadas individuales pm disable-user (QW-6 no aplicado)")

    @patch("instance_manager._run")
    def test_no_adb_call_when_all_already_disabled(self, mock_run):
        """Si todos los paquetes ya están deshabilitados, no se emite ninguna llamada batch."""
        import instance_manager as im

        captured_cmds = []

        def fake_run(cmd, *args, **kwargs):
            captured_cmds.append(list(cmd))
            return MagicMock(returncode=0, stdout="Override size: 1080x2340\nOverride density: 440\n", stderr="")

        mock_run.side_effect = fake_run

        all_pkgs = set(im.DISABLE_PACKAGES) | {"com.android.provision"}
        with patch("instance_manager.get_disabled_packages", return_value=all_pkgs):
            im.apply_runtime_defaults("127.0.0.1:5590", self._meta(), read_only_verify=False)

        batch_calls = [
            c for c in captured_cmds
            if any("for p in" in str(x) for x in c)
        ]
        self.assertEqual(len(batch_calls), 0,
            "No debe haber llamadas batch si todos los paquetes ya están deshabilitados")

    @patch("instance_manager._run")
    def test_batch_in_read_only_verify_path(self, mock_run):
        """read_only_verify=True también usa batch si hay paquetes faltantes (QW-6)."""
        import instance_manager as im

        captured_cmds = []

        def fake_run(cmd, *args, **kwargs):
            cmd_list = list(cmd)
            captured_cmds.append(cmd_list)
            if "wm" in cmd_list:
                return MagicMock(returncode=0, stdout="Override size: 1080x2340\nOverride density: 440\n", stderr="")
            return MagicMock(returncode=0, stdout="", stderr="")

        mock_run.side_effect = fake_run

        with patch("instance_manager.get_disabled_packages", return_value=set()):
            im.apply_runtime_defaults("127.0.0.1:5590", self._meta(), read_only_verify=True)

        batch_calls = [
            c for c in captured_cmds
            if any("for p in" in str(x) for x in c)
        ]
        self.assertEqual(len(batch_calls), 1,
            "El path read_only_verify=True debe usar 1 llamada batch")

        individual_calls = [
            c for c in captured_cmds
            if "pm" in c and "disable-user" in c and "for" not in " ".join(str(x) for x in c)
        ]
        self.assertEqual(len(individual_calls), 0)


if __name__ == "__main__":
    unittest.main()
