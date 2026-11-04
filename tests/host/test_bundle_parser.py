"""
Tests unitarios para el motor de inspección y seguridad de bundles (Fase 1).
"""
import io
import os
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from server.services.bundle_parser import (
    BadgingResult,
    BundleMetadata,
    InvalidBundleError,
    ZipBombError,
    ZipSlipSecurityError,
    inspect_split_abi,
    parse_and_extract_bundle,
)


def _create_synthetic_apk(
    package: str = "com.test.app",
    abi: str = None,
    extra_files: dict = None,
) -> bytes:
    """Crea un archivo ZIP en memoria que simula un APK con AndroidManifest.xml."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Dummy AndroidManifest con el package name en bytes
        manifest_content = b"\x03\x00\x08\x00" + package.encode("utf-8") + b"\x00dummy"
        zf.writestr("AndroidManifest.xml", manifest_content)
        if abi:
            zf.writestr(f"lib/{abi}/libdummy.so", b"dummy shared object")
        if extra_files:
            for fname, content in extra_files.items():
                zf.writestr(fname, content)
    return buf.getvalue()


class BundleParserTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.extract_dir = self.tmp_path / "extracted"

    def tearDown(self):
        self.tmp.cleanup()

    def test_zip_slip_relative_path_rejected(self):
        """Zip-Slip: Detecta y rechaza rutas con '..' antes de extraer."""
        bundle_path = self.tmp_path / "malicious.zip"
        with zipfile.ZipFile(bundle_path, "w") as zf:
            zf.writestr("../../etc/evil.apk", b"malicious payload")

        with self.assertRaises(ZipSlipSecurityError):
            parse_and_extract_bundle(bundle_path, self.extract_dir)

        self.assertFalse((self.tmp_path.parent / "etc" / "evil.apk").exists())

    def test_zip_slip_absolute_path_rejected(self):
        """Zip-Slip: Detecta y rechaza rutas que comienzan con '/'."""
        bundle_path = self.tmp_path / "malicious_abs.apkm"
        with zipfile.ZipFile(bundle_path, "w") as zf:
            zf.writestr("/root/evil.apk", b"malicious payload")

        with self.assertRaises(ZipSlipSecurityError):
            parse_and_extract_bundle(bundle_path, self.extract_dir)

    def test_zip_bomb_uncompressed_bytes_rejected(self):
        """Zip-Bomb: Aborta si los bytes reales en streaming superan el límite configurado."""
        bundle_path = self.tmp_path / "bomb.xapk"
        # 10 KB de datos repetidos
        large_content = b"0" * 10240
        with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("base.apk", large_content)

        # Límite estricto de 2 KB
        with self.assertRaises(ZipBombError):
            parse_and_extract_bundle(bundle_path, self.extract_dir, max_uncompressed_bytes=2048)

    def test_bundletool_splits_only_extracted(self):
        """Bundletool (.apks): Procesa únicamente splits/ e ignora standalones/."""
        bundle_path = self.tmp_path / "bundle.apks"
        base_apk_bytes = _create_synthetic_apk("com.test.app")
        split_es_bytes = _create_synthetic_apk("com.test.app")
        standalone_bytes = _create_synthetic_apk("com.test.app", abi="x86_64")

        with zipfile.ZipFile(bundle_path, "w") as zf:
            zf.writestr("splits/base-master.apk", base_apk_bytes)
            zf.writestr("splits/split_config.es.apk", split_es_bytes)
            zf.writestr("standalones/standalone-x86_64.apk", standalone_bytes)
            zf.writestr("toc.pb", b"table of contents dummy")

        def mock_badging(apk_path: Path):
            if "base-master" in apk_path.name:
                return BadgingResult(
                    package="com.test.app",
                    version_name="2.1.0",
                    version_code=42,
                    is_base=True,
                )
            return BadgingResult(
                package="com.test.app",
                version_name="",
                version_code=42,
                split="config.es",
                is_base=False,
            )

        with patch("server.services.bundle_parser.dump_badging", side_effect=mock_badging):
            meta = parse_and_extract_bundle(bundle_path, self.extract_dir)

        self.assertEqual(meta.package, "com.test.app")
        self.assertEqual(meta.version_name, "2.1.0")
        self.assertEqual(meta.version_code, 42)
        self.assertEqual(meta.base_apk, "base-master.apk")
        self.assertEqual(len(meta.splits), 1)
        self.assertEqual(meta.splits[0].filename, "split_config.es.apk")
        # El standalone NO debe haberse extraído
        self.assertFalse((self.extract_dir / "standalone-x86_64.apk").exists())

    def test_abi_detection_fast_inspection(self):
        """Detección rápida de ABI mediante zipfile sin llamar a aapt2."""
        apk_x86_64 = self.tmp_path / "split_x86_64.apk"
        apk_x86_64.write_bytes(_create_synthetic_apk(abi="x86_64"))

        apk_arm64 = self.tmp_path / "split_arm64.apk"
        apk_arm64.write_bytes(_create_synthetic_apk(abi="arm64-v8a"))

        apk_no_abi = self.tmp_path / "split_res.apk"
        apk_no_abi.write_bytes(_create_synthetic_apk())

        self.assertEqual(inspect_split_abi(apk_x86_64), "x86_64")
        self.assertEqual(inspect_split_abi(apk_arm64), "arm64-v8a")
        self.assertIsNone(inspect_split_abi(apk_no_abi))

    def test_obb_detection_and_warning(self):
        """Detección de OBB: detecta .obb, setea warning y no extrae el archivo OBB."""
        bundle_path = self.tmp_path / "game.xapk"
        base_apk_bytes = _create_synthetic_apk("com.game.test")

        with zipfile.ZipFile(bundle_path, "w") as zf:
            zf.writestr("base.apk", base_apk_bytes)
            zf.writestr("Android/obb/com.game.test/main.42.com.game.test.obb", b"heavy obb data")

        def mock_badging(apk_path: Path):
            return BadgingResult(
                package="com.game.test",
                version_name="1.0",
                version_code=1,
                is_base=True,
            )

        with patch("server.services.bundle_parser.dump_badging", side_effect=mock_badging):
            meta = parse_and_extract_bundle(bundle_path, self.extract_dir)

        self.assertTrue(meta.has_obb)
        self.assertIn("OBB", meta.warning)
        # El archivo .obb NO debe haber sido extraído a extract_dir
        self.assertFalse((self.extract_dir / "main.42.com.game.test.obb").exists())
        self.assertTrue((self.extract_dir / "base.apk").exists())

    def test_missing_base_apk_raises_error(self):
        """Bundle sin base.apk lanza InvalidBundleError y limpia el directorio temporal."""
        bundle_path = self.tmp_path / "nobase.zip"
        split_bytes = _create_synthetic_apk("com.test.app")
        with zipfile.ZipFile(bundle_path, "w") as zf:
            zf.writestr("split_config.es.apk", split_bytes)

        def mock_badging(apk_path: Path):
            return BadgingResult(
                package="com.test.app",
                version_name="",
                version_code=1,
                split="config.es",
                is_base=False,
            )

        with patch("server.services.bundle_parser.dump_badging", side_effect=mock_badging):
            with self.assertRaises(InvalidBundleError):
                parse_and_extract_bundle(bundle_path, self.extract_dir)

        # El directorio extract_dir debe haber sido limpiado
        self.assertFalse(self.extract_dir.exists())

    def test_split_package_mismatch_raises_error(self):
        """Split perteneciente a otro package es rechazado."""
        bundle_path = self.tmp_path / "mismatch.zip"
        base_bytes = _create_synthetic_apk("com.test.app")
        foreign_bytes = _create_synthetic_apk("com.foreign.attacker")

        with zipfile.ZipFile(bundle_path, "w") as zf:
            zf.writestr("base.apk", base_bytes)
            zf.writestr("split_config.es.apk", foreign_bytes)

        def mock_badging(apk_path: Path):
            return BadgingResult(
                package="com.test.app",
                version_name="1.0",
                version_code=1,
                is_base=True,
            )

        with patch("server.services.bundle_parser.dump_badging", side_effect=mock_badging):
            with self.assertRaises(InvalidBundleError):
                parse_and_extract_bundle(bundle_path, self.extract_dir)


if __name__ == "__main__":
    unittest.main()
