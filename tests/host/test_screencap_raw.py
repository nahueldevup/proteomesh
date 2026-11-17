"""
Tests unitarios para el parser y pipeline de screencap crudo (RAW RGBA_8888)
y mecanismo de fallback automático a 'screencap -p'.
"""
import io
import struct
import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from PIL import Image

from server.services.screencap_parser import (
    HAL_PIXEL_FORMAT_RGBA_8888,
    ScreencapParseError,
    parse_screencap_raw,
)
from server.services.manager_bridge import get_instance_screenshot


class ScreencapRawParserTest(unittest.TestCase):
    def test_parse_valid_16_byte_header(self):
        w, h, fmt, cs = 10, 20, HAL_PIXEL_FORMAT_RGBA_8888, 1
        payload = b"\xaa\xbb\xcc\xff" * (w * h)
        header = struct.pack("<IIII", w, h, fmt, cs)
        raw_buffer = header + payload

        out_w, out_h, out_pixels = parse_screencap_raw(raw_buffer)
        self.assertEqual(out_w, w)
        self.assertEqual(out_h, h)
        self.assertEqual(out_pixels, payload)

    def test_parse_valid_12_byte_header(self):
        w, h, fmt = 8, 16, HAL_PIXEL_FORMAT_RGBA_8888
        payload = b"\x11\x22\x33\x44" * (w * h)
        header = struct.pack("<III", w, h, fmt)
        raw_buffer = header + payload

        out_w, out_h, out_pixels = parse_screencap_raw(raw_buffer)
        self.assertEqual(out_w, w)
        self.assertEqual(out_h, h)
        self.assertEqual(out_pixels, payload)

    def test_rejects_unsupported_format(self):
        w, h, fmt = 10, 10, 4  # RGB_565
        payload = b"\x00" * (w * h * 4)
        header = struct.pack("<IIII", w, h, fmt, 0)
        with self.assertRaises(ScreencapParseError) as ctx:
            parse_screencap_raw(header + payload)
        self.assertIn("Formato de píxeles no soportado", str(ctx.exception))

    def test_rejects_truncated_payload(self):
        w, h, fmt = 10, 10, HAL_PIXEL_FORMAT_RGBA_8888
        payload = b"\x00" * ((w * h * 4) - 10)  # Incomplete
        header = struct.pack("<IIII", w, h, fmt, 0)
        with self.assertRaises(ScreencapParseError) as ctx:
            parse_screencap_raw(header + payload)
        self.assertIn("no coincide con dimensiones", str(ctx.exception))

    def test_rejects_invalid_dimensions(self):
        header = struct.pack("<III", 0, 10, HAL_PIXEL_FORMAT_RGBA_8888)
        with self.assertRaises(ScreencapParseError):
            parse_screencap_raw(header)

    def test_rejects_too_short_buffer(self):
        with self.assertRaises(ScreencapParseError):
            parse_screencap_raw(b"demasiado corto")


class ScreencapFallbackTest(unittest.TestCase):
    def setUp(self):
        # Create a tiny 4x4 red PNG
        img = Image.new("RGB", (4, 4), color="red")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        self.sample_png = buf.getvalue()

    @patch("server.services.manager_bridge.subprocess.run")
    def test_fallback_to_png_when_raw_fails(self, mock_run):
        # QW-2: docker ps eliminado — el pipeline arranca directamente con screencap raw.
        # Primera llamada: screencap raw -> falla con returncode 1
        # Segunda llamada: screencap -p -> exitosa con PNG válido
        def fake_run(cmd, *args, **kwargs):
            if cmd == ["docker", "exec", "phone-80", "screencap"]:
                return MagicMock(returncode=1, stdout=b"", stderr="error raw")
            if cmd == ["docker", "exec", "phone-80", "screencap", "-p"]:
                return MagicMock(returncode=0, stdout=self.sample_png, stderr="")
            return MagicMock(returncode=0, stdout="")

        mock_run.side_effect = fake_run

        data = get_instance_screenshot("phone-80", format="jpeg", max_width=540)
        self.assertTrue(len(data) > 0)
        # Verificar que se intentó raw y luego se cayó a -p
        called_cmds = [c[0][0] for c in mock_run.call_args_list]
        self.assertIn(["docker", "exec", "phone-80", "screencap"], called_cmds)
        self.assertIn(["docker", "exec", "phone-80", "screencap", "-p"], called_cmds)
        # Confirmar que NO se invocó docker ps (QW-2)
        self.assertNotIn(["docker", "ps", "-q", "-f", "name=^phone-80$"], called_cmds)

    @patch("server.services.manager_bridge.subprocess.run")
    def test_raw_fast_path_avoids_png_fallback(self, mock_run):
        # QW-2: docker ps eliminado — el pipeline arranca directamente con screencap raw.
        w, h = 4, 4
        header = struct.pack("<IIII", w, h, HAL_PIXEL_FORMAT_RGBA_8888, 1)
        pixels = b"\x00\xff\x00\xff" * (w * h)
        raw_payload = header + pixels

        def fake_run(cmd, *args, **kwargs):
            if cmd == ["docker", "exec", "phone-80", "screencap"]:
                return MagicMock(returncode=0, stdout=raw_payload, stderr="")
            if cmd == ["docker", "exec", "phone-80", "screencap", "-p"]:
                raise AssertionError("screencap -p NO debería llamarse en el fast path!")
            return MagicMock(returncode=0, stdout="")

        mock_run.side_effect = fake_run

        data = get_instance_screenshot("phone-80", format="jpeg", max_width=540)
        self.assertTrue(len(data) > 0)
        # Verificar que screencap -p NO fue llamado
        called_cmds = [c[0][0] for c in mock_run.call_args_list]
        self.assertIn(["docker", "exec", "phone-80", "screencap"], called_cmds)
        self.assertNotIn(["docker", "exec", "phone-80", "screencap", "-p"], called_cmds)
        # Confirmar que NO se invocó docker ps (QW-2)
        self.assertNotIn(["docker", "ps", "-q", "-f", "name=^phone-80$"], called_cmds)


if __name__ == "__main__":
    unittest.main()
