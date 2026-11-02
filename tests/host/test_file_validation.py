"""
Tests de validación de rutas del gestor de archivos (WEB-017).

Usan unittest y monkeypatch para simular las respuestas de `adb shell realpath`.
También incluye una prueba opcional contra la instancia real 'phone-80' si está
conectada.
"""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from server.services.file_manager import validate_phone_path, PathValidationError, FileManagerError
from server.config import ALLOWED_FILE_ROOTS


class FilePathValidationTest(unittest.TestCase):
    @staticmethod
    def _mock_realpath(roots_realpaths: dict):
        """Devuelve un side_effect para _adb_shell_output basado en la ruta pedida."""
        def side_effect(serial: str, cmd: str, *args):
            # args contiene la ruta tras 'realpath', '--', <path>
            if cmd != "realpath" or len(args) < 1:
                return ""
            path = args[-1]
            for root, real in roots_realpaths.items():
                if path == root:
                    return real
            # Para cualquier otra ruta devolvemos su realpath simulada
            if path.startswith("/sdcard/Download/"):
                return path.replace("/sdcard/Download", roots_realpaths["/sdcard/Download"])
            if path.startswith("/sdcard/Documents/"):
                return path.replace("/sdcard/Documents", roots_realpaths["/sdcard/Documents"])
            return path
        return side_effect

    def _patch_realpath(self, roots=None):
        roots = roots or {
            "/sdcard/Download": "/storage/emulated/0/Download",
            "/sdcard/Documents": "/storage/emulated/0/Documents",
        }
        patcher = patch(
            "server.services.file_manager._adb_shell_output",
            side_effect=self._mock_realpath(roots),
        )
        self.addCleanup(patcher.stop)
        return patcher.start()

    def test_accepts_valid_file_inside_root(self):
        self._patch_realpath()
        result = validate_phone_path("phone-80", "/sdcard/Download/foto.jpg")
        self.assertEqual(result, "/sdcard/Download/foto.jpg")

    def test_rejects_relative_path(self):
        self._patch_realpath()
        with self.assertRaises(PathValidationError):
            validate_phone_path("phone-80", "../Download/foto.jpg")

    def test_rejects_escape_with_dotdot(self):
        self._patch_realpath()
        with self.assertRaises(PathValidationError):
            validate_phone_path("phone-80", "/sdcard/Download/../../data")

    def test_rejects_similar_named_root(self):
        # /sdcard/Download2 no debe coincidir con /sdcard/Download
        self._patch_realpath()
        with self.assertRaises(PathValidationError):
            validate_phone_path("phone-80", "/sdcard/Download2/foto.jpg")

    def test_rejects_outside_whitelist(self):
        self._patch_realpath()
        with self.assertRaises(PathValidationError):
            validate_phone_path("phone-80", "/system/bin/su")

    def test_rejects_null_bytes(self):
        self._patch_realpath()
        with self.assertRaises(PathValidationError):
            validate_phone_path("phone-80", "/sdcard/Download/foto\x00.jpg")

    def test_rejects_deleting_root_itself(self):
        # Listar/subir en una raíz está permitido; borrarla no.
        self._patch_realpath()
        with patch(
            "server.services.file_manager._adb_serial_or_raise", return_value="127.0.0.1:5580"
        ), patch(
            "server.services.file_manager._stat_entry", return_value=("regular file", 0, 0)
        ):
            with self.assertRaises(FileManagerError):
                from server.services.file_manager import delete_file
                delete_file("phone-80", "/sdcard/Download")

    def test_accepts_dash_starting_path_with_dash_dash(self):
        # Los nombres que empiezan con '-' son seguros gracias al uso de --
        self._patch_realpath()
        result = validate_phone_path("phone-80", "/sdcard/Download/-foto.jpg")
        self.assertEqual(result, "/sdcard/Download/-foto.jpg")

    def test_accepts_unicode_and_special_but_safe_names(self):
        self._patch_realpath()
        for name in (
            "mi foto.jpg",
            "a;b.sh",
            "quote's.txt",
            'say"hello".bin',
            "café_日本語.png",
        ):
            with self.subTest(name=name):
                path = f"/sdcard/Download/{name}"
                result = validate_phone_path("phone-80", path)
                self.assertEqual(result, path)

    def test_rejects_when_realpath_escapes_root(self):
        # Simula un symlink dentro de Download que resuelve fuera
        roots = {
            "/sdcard/Download": "/storage/emulated/0/Download",
            "/sdcard/DCIM": "/storage/emulated/0/DCIM",
            "/sdcard/Pictures": "/storage/emulated/0/Pictures",
            "/sdcard/Documents": "/storage/emulated/0/Documents",
        }

        base_mock = self._mock_realpath(roots)

        def side_effect(serial, cmd, *args):
            path = args[-1]
            if path == "/sdcard/Download/link":
                return "/data/data/malicious"
            return base_mock(serial, cmd, *args)

        with patch("server.services.file_manager._adb_shell_output", side_effect=side_effect):
            with self.assertRaises(PathValidationError):
                validate_phone_path("phone-80", "/sdcard/Download/link")


@unittest.skipUnless(
    ALLOWED_FILE_ROOTS and Path("/usr/bin/adb").exists(),
    "Se requiere adb y raíces configuradas",
)
class FilePathRealDeviceTest(unittest.TestCase):
    """Pruebas contra la instancia real phone-80 si está disponible."""

    @classmethod
    def setUpClass(cls):
        cls.instance = "phone-80"
        cls.serial = "127.0.0.1:5580"
        import subprocess
        res = subprocess.run(
            ["adb", "-s", cls.serial, "shell", "getprop", "sys.boot_completed"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if res.returncode != 0 or res.stdout.strip() != "1":
            raise unittest.SkipTest("La instancia phone-80 no está lista")

    def test_realpath_resolves_download_root(self):
        result = validate_phone_path(self.instance, "/sdcard/Download/subdir")
        self.assertEqual(result, "/sdcard/Download/subdir")

    @unittest.skip("La imagen ReDroid no permite crear symlinks via adb shell (Function not implemented)")
    def test_symlink_escape_is_rejected(self):
        # Crear un symlink dentro de Download apuntando fuera de la raíz
        import subprocess
        symlink = "/sdcard/Download/test_link_escape"
        subprocess.run(
            ["adb", "-s", self.serial, "shell", "rm", "-f", symlink],
            capture_output=True,
            timeout=10,
        )
        subprocess.run(
            ["adb", "-s", self.serial, "shell", "ln", "-s", "/data/local/tmp", symlink],
            capture_output=True,
            timeout=10,
        )
        try:
            with self.assertRaises(PathValidationError):
                validate_phone_path(self.instance, symlink)
        finally:
            subprocess.run(
                ["adb", "-s", self.serial, "shell", "rm", "-f", symlink],
                capture_output=True,
                timeout=10,
            )


if __name__ == "__main__":
    unittest.main()
