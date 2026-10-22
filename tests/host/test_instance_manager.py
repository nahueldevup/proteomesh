import sys
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "tools"))

from instance_manager import (
    validate_instance_name,
    validate_profile,
    validate_bundle,
    create_bundle_manifest,
    cmd_start_instance,
    calc_luhn,
    BUNDLE_FORMAT_VERSION,
)


class InstanceNameValidationTest(unittest.TestCase):
    def test_accepts_existing_names(self):
        for name in ("hide-test", "v-samsung_s21", "inst-note13", "f05-main", "a", "a" * 63):
            self.assertEqual(validate_instance_name(name), name)

    def test_rejects_unsafe_names(self):
        for name in ("../x", "a/b", "a b", "a.b", "A", "-x", "_x", "a" * 64, ""):
            with self.subTest(name=name):
                with self.assertRaises(SystemExit):
                    validate_instance_name(name)


class ProfileValidationTest(unittest.TestCase):
    def setUp(self):
        f05_profile = REPO_ROOT / "instances" / "f05-main" / "profile.json"
        self.valid_profile = json.loads(f05_profile.read_text())

    def test_accepts_valid_generated_profile(self):
        validated = validate_profile(self.valid_profile, "f05-main test")
        self.assertEqual(validated["device"]["brand"], "samsung")
        self.assertTrue(validated["generated_identity"]["imei"])

    def test_rejects_raw_template_without_identity(self):
        raw_template = REPO_ROOT / "templates" / "google" / "pixel5_redfin.json"
        raw_doc = json.loads(raw_template.read_text())
        with self.assertRaises(SystemExit) as ctx:
            validate_profile(raw_doc, "raw template")
        self.assertIn("generated_identity", str(ctx.exception))

    def test_rejects_invalid_imei_luhn(self):
        bad_profile = json.loads(json.dumps(self.valid_profile))
        imei = bad_profile["generated_identity"]["imei"]
        # Invert the last digit to break Luhn
        last_digit = int(imei[-1])
        bad_last = (last_digit + 1) % 10
        bad_profile["generated_identity"]["imei"] = imei[:-1] + str(bad_last)
        with self.assertRaises(SystemExit) as ctx:
            validate_profile(bad_profile, "bad imei")
        self.assertIn("Luhn", str(ctx.exception))

    def test_rejects_missing_serial(self):
        bad_profile = json.loads(json.dumps(self.valid_profile))
        bad_profile["generated_identity"]["serial"] = ""
        with self.assertRaises(SystemExit) as ctx:
            validate_profile(bad_profile, "missing serial")
        self.assertIn("serial", str(ctx.exception))

    def test_rejects_invalid_wifi_mac(self):
        bad_profile = json.loads(json.dumps(self.valid_profile))
        bad_profile["generated_identity"]["wifi_mac"] = "not-a-mac"
        with self.assertRaises(SystemExit) as ctx:
            validate_profile(bad_profile, "invalid mac")
        self.assertIn("wifi_mac", str(ctx.exception))

    def test_rejects_missing_device_fields(self):
        for field in ("brand", "model", "manufacturer", "fingerprint"):
            bad_profile = json.loads(json.dumps(self.valid_profile))
            bad_profile["device"][field] = ""
            with self.subTest(field=field):
                with self.assertRaises(SystemExit) as ctx:
                    validate_profile(bad_profile, f"missing {field}")
                self.assertIn(field, str(ctx.exception))

    def test_rejects_invalid_display(self):
        bad_profile = json.loads(json.dumps(self.valid_profile))
        bad_profile["display"]["width"] = -1
        with self.assertRaises(SystemExit) as ctx:
            validate_profile(bad_profile, "invalid width")
        self.assertIn("display.width", str(ctx.exception))


class BundleValidationTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp(prefix="proteomesh_bundle_test_"))
        f05_profile = REPO_ROOT / "instances" / "f05-main" / "profile.json"
        self.valid_profile_data = json.loads(f05_profile.read_text())

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_validates_existing_bundle(self):
        inst_dir = self.temp_dir / "test-inst"
        inst_dir.mkdir()
        (inst_dir / "profile.json").write_text(json.dumps(self.valid_profile_data))
        create_bundle_manifest(inst_dir, "templates/samsung/a54x.json", "test-inst")

        p, m = validate_bundle(inst_dir)
        self.assertEqual(p["device"]["model"], "SM-A546M")
        self.assertEqual(m["bundle_format"], BUNDLE_FORMAT_VERSION)
        self.assertEqual(m["instance_name"], "test-inst")

    def test_creates_retrocompatible_manifest_if_missing(self):
        inst_dir = self.temp_dir / "legacy-inst"
        inst_dir.mkdir()
        (inst_dir / "profile.json").write_text(json.dumps(self.valid_profile_data))

        manifest_path = inst_dir / "manifest.json"
        self.assertFalse(manifest_path.exists())

        p, m = validate_bundle(inst_dir)
        self.assertTrue(manifest_path.exists())
        self.assertEqual(m["bundle_format"], BUNDLE_FORMAT_VERSION)

    def test_rejects_missing_profile(self):
        inst_dir = self.temp_dir / "empty-inst"
        inst_dir.mkdir()
        with self.assertRaises(SystemExit) as ctx:
            validate_bundle(inst_dir)
        self.assertIn("no tiene profile.json", str(ctx.exception))

    def test_rejects_unsupported_bundle_format(self):
        inst_dir = self.temp_dir / "future-inst"
        inst_dir.mkdir()
        (inst_dir / "profile.json").write_text(json.dumps(self.valid_profile_data))
        (inst_dir / "manifest.json").write_text(json.dumps({
            "bundle_format": 999,
            "runtime_min": "99.0"
        }))
        with self.assertRaises(SystemExit) as ctx:
            validate_bundle(inst_dir)
        self.assertIn("bundle_format=999", str(ctx.exception))


class FailFastStartTest(unittest.TestCase):
    def test_start_fails_fast_on_missing_instance(self):
        args = type("Args", (), {"name": "inst-que-no-existe"})()
        with self.assertRaises(SystemExit) as ctx:
            with patch("subprocess.run") as mock_sub:
                cmd_start_instance(args)
                mock_sub.assert_not_called()
        self.assertIn("no existe", str(ctx.exception))

    def test_start_fails_fast_on_raw_template_profile(self):
        temp_inst = REPO_ROOT / "instances" / "tmp-fail-test"
        try:
            temp_inst.mkdir(parents=True, exist_ok=True)
            raw = json.loads((REPO_ROOT / "templates" / "google" / "pixel5_redfin.json").read_text())
            (temp_inst / "profile.json").write_text(json.dumps(raw))
            (temp_inst / "meta.json").write_text(json.dumps({"adb_port": 5599}))

            args = type("Args", (), {"name": "tmp-fail-test"})()
            with self.assertRaises(SystemExit) as ctx:
                with patch("subprocess.run") as mock_sub:
                    cmd_start_instance(args)
                    mock_sub.assert_not_called()
            self.assertIn("generated_identity", str(ctx.exception))
        finally:
            shutil.rmtree(temp_inst, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
