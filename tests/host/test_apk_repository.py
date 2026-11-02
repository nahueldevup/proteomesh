"""
Tests para el repositorio global de APKs (WEB-017).

Usan unittest y monkeypatch para no depender de aapt2 ni de instancias reales.
"""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from server.services.apk_repository import (
    ApkRepository,
    ApkTooLargeError,
    DuplicateApkError,
    InvalidApkError,
)


def _pk_stream(size: int = 4096, seed: bytes = b""):
    """Generador que produce bytes con cabecera ZIP válida (PK)."""
    payload = seed + b"A" * (size - 4 - len(seed))
    chunk = b"PK" + b"\x03\x04" + payload
    yield chunk


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
        self.assertFalse(result["is_default"])
        self.assertTrue((self.repo_dir / f"{result['sha256']}.apk").exists())

        listed = self.repo.list_apks()
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["sha256"], result["sha256"])

    def test_upload_rejects_bundle_extensions(self):
        for name in ("bundle.apks", "bundle.xapk"):
            with self.subTest(name=name):
                with self.assertRaises(InvalidApkError):
                    self.repo.upload_apk(name, _pk_stream(4096))

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
