"""
Tests para QW-7 (Acotación y rotación de logs de Docker)
y QW-10 (Separación de scripts run_api.sh prod vs run_api_dev.sh dev).
"""
import os
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


# ─── QW-7: Acotación y Rotación de Logs de Docker ────────────────────────────

class DockerLogRotationTest(unittest.TestCase):
    """Valida que docker run incluye --log-driver y --log-opt (QW-7)."""

    def _setup_mock_instance(self, tmp_path: Path, inst_name: str, port: int = 5590):
        import json
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
    def test_log_driver_and_opts_in_run_cmd(self, mock_run):
        """docker run incluye --log-driver json-file, max-size=10m y max-file=3."""
        import instance_manager as im

        captured_cmds = []

        def fake_run(cmd, *args, **kwargs):
            cmd_list = list(cmd)
            captured_cmds.append(cmd_list)
            if len(cmd_list) > 1 and cmd_list[0] == "docker" and cmd_list[1] == "run":
                raise StopIteration("captured docker run")
            return MagicMock(returncode=0, stdout="", stderr="")

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

        # Validar --log-driver json-file
        self.assertIn("--log-driver", cmd)
        idx_driver = cmd.index("--log-driver")
        self.assertEqual(cmd[idx_driver + 1], "json-file")

        # Validar --log-opt max-size=10m
        self.assertIn("max-size=10m", cmd)
        # Validar --log-opt max-file=3
        self.assertIn("max-file=3", cmd)

    @patch("subprocess.run")
    def test_all_hardening_flags_coexist(self, mock_run):
        """QW-5 y QW-7 coexisten en el mismo docker run."""
        import instance_manager as im

        captured_cmds = []

        def fake_run(cmd, *args, **kwargs):
            cmd_list = list(cmd)
            captured_cmds.append(cmd_list)
            if len(cmd_list) > 1 and cmd_list[0] == "docker" and cmd_list[1] == "run":
                raise StopIteration("captured docker run")
            return MagicMock(returncode=0, stdout="", stderr="")

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
        self.assertTrue(docker_run_cmds)
        cmd = docker_run_cmds[0]

        # QW-5
        self.assertIn("--restart", cmd)
        self.assertIn("--shm-size", cmd)
        # QW-7
        self.assertIn("--log-driver", cmd)
        self.assertIn("max-size=10m", cmd)
        self.assertIn("max-file=3", cmd)


# ─── QW-10: Scripts de Lanzamiento Prod vs Dev ──────────────────────────────

class ApiLauncherScriptsTest(unittest.TestCase):
    """Valida la separación entre run_api.sh (producción) y run_api_dev.sh (desarrollo)."""

    def setUp(self):
        self.tools_dir = REPO_ROOT / "tools"
        self.prod_script = self.tools_dir / "run_api.sh"
        self.dev_script = self.tools_dir / "run_api_dev.sh"

    def test_both_scripts_exist(self):
        self.assertTrue(self.prod_script.exists(), "run_api.sh debe existir")
        self.assertTrue(self.dev_script.exists(), "run_api_dev.sh debe existir")

    def test_both_scripts_are_executable(self):
        self.assertTrue(os.access(self.prod_script, os.X_OK),
                        "run_api.sh debe tener permisos de ejecución (+x)")
        self.assertTrue(os.access(self.dev_script, os.X_OK),
                        "run_api_dev.sh debe tener permisos de ejecución (+x)")

    def test_prod_script_has_no_reload(self):
        """run_api.sh es para producción y NO debe contener el flag --reload."""
        content = self.prod_script.read_text(encoding="utf-8")
        # Verificar que la línea exec uv run uvicorn no incluya --reload
        for line in content.splitlines():
            line_s = line.strip()
            if line_s.startswith("exec ") and "uvicorn" in line_s:
                self.assertNotIn("--reload", line_s,
                                 "run_api.sh no debe incluir --reload en la línea exec")
            if "--reload" in line_s and not line_s.startswith("#"):
                self.fail(f"run_api.sh contiene '--reload' activo: {line_s}")

    def test_dev_script_has_reload_and_directories(self):
        """run_api_dev.sh debe incluir --reload y --reload-dir acotado."""
        content = self.dev_script.read_text(encoding="utf-8")
        self.assertIn("--reload", content)
        self.assertIn("--reload-dir server", content)
        self.assertIn("--reload-dir tools", content)


if __name__ == "__main__":
    unittest.main()
