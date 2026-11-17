"""
Tests para HI-3 (Aceleración de arranque de instancias):
- Reducción de subprocesos en wait_for_boot
- Marcador .cpu_perms_fixed para evitar invocaciones redundantes de chmod
- Reducción de tiempo muerto en reintento de stub
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(REPO_ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "tools"))

import instance_manager as im


class WaitForBootAccelTest(unittest.TestCase):
    """Valida la reducción de llamadas en wait_for_boot (HI-3)."""

    @patch("instance_manager._run")
    def test_single_command_when_boot_ready(self, mock_run):
        """Si el contenedor ya terminó de bootear, emite exactamente 1 llamada docker."""
        mock_run.return_value = MagicMock(returncode=0, stdout="READY\n", stderr="")

        res = im.wait_for_boot("phone-80", attempts=3)

        self.assertTrue(res)
        self.assertEqual(mock_run.call_count, 1)
        call_args = mock_run.call_args[0][0]
        self.assertEqual(call_args[:3], ["docker", "exec", "phone-80"])
        shell_script = call_args[5]
        self.assertIn("sys.boot_completed", shell_script)
        self.assertIn(".proteomesh_boot_done", shell_script)
        self.assertIn("READY", shell_script)

    @patch("instance_manager.time.sleep")
    @patch("instance_manager._run")
    def test_wait_for_boot_retries_then_succeeds(self, mock_run, mock_sleep):
        """Reintenta si la primera respuesta no es READY y tiene éxito en la segunda."""
        call_count = 0

        def fake_run(cmd, *args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return MagicMock(returncode=0, stdout="\n", stderr="")
            return MagicMock(returncode=0, stdout="READY\n", stderr="")

        mock_run.side_effect = fake_run

        res = im.wait_for_boot("phone-80", attempts=5)

        self.assertTrue(res)
        self.assertEqual(call_count, 2)
        mock_sleep.assert_called_once_with(2)

    @patch("instance_manager._run")
    def test_wait_for_boot_aborts_if_container_exited(self, mock_run):
        """Si docker exec falla y docker inspect reporta false, aborta inmediatamente."""
        def fake_run(cmd, *args, **kwargs):
            if "exec" in cmd:
                return MagicMock(returncode=125, stdout="", stderr="Error: No such container")
            if "inspect" in cmd:
                return MagicMock(returncode=0, stdout="false\n", stderr="")
            return MagicMock(returncode=0, stdout="", stderr="")

        mock_run.side_effect = fake_run

        res = im.wait_for_boot("phone-80", attempts=5)

        self.assertFalse(res)


class CpuSysfsPermsGuardTest(unittest.TestCase):
    """Valida la guarda .cpu_perms_fixed en cmd_start_instance (HI-3)."""

    def test_cpu_perms_command_has_marker_and_touch(self):
        """El script de normalización de CPU sysfs debe chequear y tocar el marcador."""
        script_path = REPO_ROOT / "tools" / "instance_manager.py"
        content = script_path.read_text(encoding="utf-8")

        self.assertIn(".cpu_perms_fixed", content,
                      "instance_manager.py debe usar el marcador .cpu_perms_fixed")
        self.assertIn("[ ! -f /data/local/tmp/.cpu_perms_fixed ]", content,
                      "Debe haber verificación de no existencia de .cpu_perms_fixed")
        self.assertIn("touch /data/local/tmp/.cpu_perms_fixed", content,
                      "Debe crearse el archivo .cpu_perms_fixed tras aplicar permisos")


if __name__ == "__main__":
    unittest.main()
