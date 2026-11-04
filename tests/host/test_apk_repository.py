"""
Tests para el repositorio global de APKs y Bundles (WEB-017 / Bundles).

Usan unittest y monkeypatch para no depender de aapt2 ni de instancias reales.
"""
import io
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from typing import Generator
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from server.services.apk_repository import (
    ApkRepository,
    ApkTooLargeError,
    DuplicateApkError,
    InvalidApkError,
)
from server.services.bundle_parser import BadgingResult


def _pk_stream(size: int = 4096, seed: bytes = b"") -> Generator[bytes, None, None]:
    """Generador que produce bytes con cabecera ZIP válida (PK) para un APK monolítico."""
    payload = seed + b"A" * max(0, size - 4 - len(seed))
    chunk = b"PK" + b"\x03\x04" + payload
    yield chunk


def _synthetic_bundle_stream(package: str = "com.test.app") -> Generator[bytes, None, None]:
    """Generador que produce un bundle ZIP válido con base.apk y un split."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # base.apk
        base_buf = io.BytesIO()
        with zipfile.ZipFile(base_buf, "w") as bzf:
            bzf.writestr("AndroidManifest.xml", b"\x03\x00\x08\x00" + package.encode("utf-8") + b"\x00dummy")
        zf.writestr("base.apk", base_buf.getvalue())

        # split_config.x86_64.apk
        split_buf = io.BytesIO()
        with zipfile.ZipFile(split_buf, "w") as szf:
            szf.writestr("AndroidManifest.xml", b"\x03\x00\x08\x00" + package.encode("utf-8") + b"\x00dummy")
            szf.writestr("lib/x86_64/libtest.so", b"dummy so content")
        zf.writestr("split_config.x86_64.apk", split_buf.getvalue())

    data = buf.getvalue()
    chunk_size = 1024
    for i in range(0, len(data), chunk_size):
        yield data[i : i + chunk_size]


def _mock_bundle_badging(apk_path: Path) -> BadgingResult:
    if "base" in apk_path.name:
        return BadgingResult(
            package="com.test.app",
            version_name="1.0",
            version_code=1,
            is_base=True,
        )
    return BadgingResult(
        package="com.test.app",
        version_name="",
        version_code=1,
        split="config.x86_64",
        is_base=False,
    )


class ApkRepositoryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo_dir = Path(self.tmp.name) / "apk_repo"
        self.db_path = Path(self.tmp.name) / "apks.db"
        self.repo = ApkRepository(
            repo_dir=self.repo_dir,
            db_path=self.db_path,
            max_size=1024 * 1024,
        )

    def tearDown(self):
        self.tmp.cleanup()

    @patch.object(ApkRepository, "_extract_badging", return_value=("com.test.app", "1.0", 1))
    def test_upload_valid_apk(self, _mock_badging):
        result = self.repo.upload_apk("test.apk", _pk_stream(4096))
        self.assertEqual(result["package"], "com.test.app")
        self.assertEqual(result["version_name"], "1.0")
        self.assertEqual(result["version_code"], 1)
        self.assertEqual(result["entry_type"], "monolithic")
        self.assertIsNone(result["bundle_format"])
        self.assertFalse(result["is_default"])
        self.assertTrue((self.repo_dir / f"{result['sha256']}.apk").exists())

        # get_apk_files debe retornar [Path]
        files = self.repo.get_apk_files(result["sha256"])
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0], self.repo_dir / f"{result['sha256']}.apk")

        listed = self.repo.list_apks()
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["sha256"], result["sha256"])
        self.assertEqual(listed[0]["entry_type"], "monolithic")

    def test_upload_rejects_invalid_extensions(self):
        for name in ("app.exe", "app.tar", "app.rar", "app.txt"):
            with self.subTest(name=name):
                with self.assertRaises(InvalidApkError):
                    self.repo.upload_apk(name, _pk_stream(4096))

    @patch("server.services.bundle_parser.dump_badging", side_effect=_mock_bundle_badging)
    def test_upload_bundle_formats_accepted(self, _mock_badging):
        for ext in (".apkm", ".xapk", ".apks", ".zip"):
            with self.subTest(ext=ext):
                repo_tmp = tempfile.TemporaryDirectory()
                sub_repo = ApkRepository(
                    repo_dir=Path(repo_tmp.name) / "apk_repo",
                    db_path=Path(repo_tmp.name) / "apks.db",
                    max_size=1024 * 1024,
                )
                try:
                    name = f"test_bundle{ext}"
                    result = sub_repo.upload_apk(name, _synthetic_bundle_stream())
                    self.assertEqual(result["package"], "com.test.app")
                    self.assertEqual(result["entry_type"], "bundle")
                    self.assertEqual(result["bundle_format"], ext.lstrip("."))
                    self.assertIsNotNone(result["splits_info"])

                    # Directorio en disco
                    bundle_dir = sub_repo.repo_dir / result["sha256"]
                    self.assertTrue(bundle_dir.is_dir())
                    self.assertTrue((bundle_dir / "base.apk").exists())
                    self.assertTrue((bundle_dir / "split_config.x86_64.apk").exists())

                    # get_apk_files debe listar base.apk primero y luego el split
                    files = sub_repo.get_apk_files(result["sha256"])
                    self.assertEqual(len(files), 2)
                    self.assertEqual(files[0].name, "base.apk")

                    # get_apk_path debe retornar base.apk
                    main_path = sub_repo.get_apk_path(result["sha256"])
                    self.assertEqual(main_path.name, "base.apk")
                    self.assertTrue(main_path.exists())
                finally:
                    repo_tmp.cleanup()

    @patch("server.services.bundle_parser.dump_badging", side_effect=_mock_bundle_badging)
    def test_delete_bundle(self, _mock_badging):
        result = self.repo.upload_apk("delete_bundle.xapk", _synthetic_bundle_stream())
        bundle_dir = self.repo_dir / result["sha256"]
        self.assertTrue(bundle_dir.is_dir())

        ok = self.repo.delete_apk(result["id"])
        self.assertTrue(ok)
        self.assertFalse(bundle_dir.exists())
        self.assertIsNone(self.repo.get_apk(result["id"]))

    @patch.object(ApkRepository, "_extract_badging", return_value=("com.test.app", "1.0", 1))
    def test_upload_rejects_too_large(self, _mock_badging):
        small_repo = ApkRepository(
            repo_dir=self.repo_dir / "small",
            db_path=self.db_path.parent / "small.db",
            max_size=64,
        )
        with self.assertRaises(ApkTooLargeError):
            small_repo.upload_apk("big.apk", _pk_stream(4096))

    @patch.object(ApkRepository, "_extract_badging", return_value=("com.test.app", "1.0", 1))
    def test_upload_rejects_duplicate(self, _mock_badging):
        self.repo.upload_apk("first.apk", _pk_stream(4096))
        with self.assertRaises(DuplicateApkError):
            self.repo.upload_apk("second.apk", _pk_stream(4096))

    @patch.object(ApkRepository, "_extract_badging", return_value=("com.test.app", "1.0", 1))
    def test_delete_apk(self, _mock_badging):
        result = self.repo.upload_apk("delete.apk", _pk_stream(4096))
        apk_path = self.repo.get_apk_path(result["sha256"])
        self.assertTrue(apk_path.exists())

        ok = self.repo.delete_apk(result["id"])
        self.assertTrue(ok)
        self.assertFalse(apk_path.exists())
        self.assertIsNone(self.repo.get_apk(result["id"]))

    @patch.object(ApkRepository, "_extract_badging", return_value=("com.test.app", "1.0", 1))
    def test_set_default_apks(self, _mock_badging):
        a = self.repo.upload_apk("a.apk", _pk_stream(4096, seed=b"a"))
        b = self.repo.upload_apk("b.apk", _pk_stream(4096, seed=b"b"))
        c = self.repo.upload_apk("c.apk", _pk_stream(4096, seed=b"c"))

        marked = self.repo.set_default_apks([a["id"], c["id"]])
        self.assertEqual(marked, 2)

        defaults = self.repo.get_default_apk_ids()
        self.assertEqual(set(defaults), {a["id"], c["id"]})

        # Limpiar defaults
        self.repo.set_default_apks([])
        self.assertEqual(self.repo.get_default_apk_ids(), [])


if __name__ == "__main__":
    unittest.main()
