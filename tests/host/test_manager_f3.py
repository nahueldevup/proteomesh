import sys
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "tools"))

from instance_manager import (
    validate_limits,
    cmd_create_instance,
    cmd_start_instance,
    verify_instance_health,
    compute_total_memory_swap,
    INSTANCES_DIR,
    BUNDLE_FORMAT_VERSION,
)
from render import render_bundle


class ResourceLimitsTest(unittest.TestCase):
    def test_valid_memory(self):
        self.assertEqual(validate_limits(memory="4g"), {"memory": "4g"})
        self.assertEqual(validate_limits(memory="2048m"), {"memory": "2048m"})
        self.assertEqual(validate_limits(memory="512M"), {"memory": "512m"})
        self.assertEqual(validate_limits(memory="2.5g"), {"memory": "2560m"})
        self.assertEqual(validate_limits(memory="2.0g"), {"memory": "2g"})
        self.assertEqual(validate_limits(memory="3.0g"), {"memory": "3g"})
        self.assertEqual(validate_limits(memory="4.0g"), {"memory": "4g"})
        self.assertEqual(validate_limits(memory="512m"), {"memory": "512m"})

    def test_rejects_invalid_memory(self):
        for bad in ("4gb", "invalid", "-1g", "4 g", "2..5g", "2.5.5g", ".5g", "g", "2.g", ""):
            with self.subTest(bad=bad):
                if bad == "":
                    self.assertEqual(validate_limits(memory=bad), {})
                else:
                    with self.assertRaises(SystemExit) as ctx:
                        validate_limits(memory=bad)
                    self.assertIn("Formato de --memory inválido", str(ctx.exception))

    def test_valid_cpus(self):
        self.assertEqual(validate_limits(cpus="2.0"), {"cpus": "2.0"})
        self.assertEqual(validate_limits(cpus="1"), {"cpus": "1"})
        self.assertEqual(validate_limits(cpus="0-3"), {"cpus": "0-3"})

    def test_rejects_invalid_cpus(self):
        for bad in ("abc", "2.0.0", "-1"):
            with self.subTest(bad=bad):
                with self.assertRaises(SystemExit) as ctx:
                    validate_limits(cpus=bad)
                self.assertIn("Formato de --cpus inválido", str(ctx.exception))

    def test_valid_pids_limit(self):
        self.assertEqual(validate_limits(pids_limit=2048), {"pids_limit": 2048})
        self.assertEqual(validate_limits(pids_limit=100), {"pids_limit": 100})

    def test_rejects_invalid_pids_limit(self):
        for bad in (99, -1, "not-a-number"):
            with self.subTest(bad=bad):
                with self.assertRaises(SystemExit) as ctx:
                    validate_limits(pids_limit=bad)
                self.assertIn("--pids-limit debe ser un entero >= 100", str(ctx.exception))


    def test_valid_swap(self):
        self.assertEqual(validate_limits(swap="700m"), {"swap": "700m"})
        self.assertEqual(validate_limits(swap="1g"), {"swap": "1g"})
        self.assertEqual(validate_limits(swap="512M"), {"swap": "512m"})
        self.assertEqual(validate_limits(swap="2.5g"), {"swap": "2560m"})
        self.assertEqual(validate_limits(swap="2.0g"), {"swap": "2g"})
        self.assertEqual(validate_limits(swap="0.5g"), {"swap": "512m"})

    def test_rejects_invalid_swap(self):
        for bad in ("700mb", "invalid", "-1m", "512 m", "1..5g", ".5g", "m", "1.m"):
            with self.subTest(bad=bad):
                with self.assertRaises(SystemExit) as ctx:
                    validate_limits(swap=bad)
                self.assertIn("Formato de --swap inválido", str(ctx.exception))

    def test_compute_total_memory_swap(self):
        self.assertEqual(compute_total_memory_swap("2560m", "700m"), "3260m")
        self.assertEqual(compute_total_memory_swap("4g", "1g"), "5120m")
        self.assertEqual(compute_total_memory_swap("2.5g", "512m"), "3072m")
        self.assertEqual(compute_total_memory_swap("2.5g", "700m"), "3260m")
        self.assertEqual(compute_total_memory_swap("2.0g", "0.5g"), "2560m")
        self.assertEqual(compute_total_memory_swap("512m", "256m"), "768m")


class CreateFromBundleTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp(prefix="proteomesh_f3_test_"))
        self.golden_bundle = REPO_ROOT / "tests" / "golden" / "bundles" / "a54x_personal_seed42"

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_create_rejects_nonexistent_bundle(self):
        args = type("Args", (), {
            "name": "fail-inst",
            "from_bundle": "/tmp/nonexistent_bundle_12345",
            "template": None,
            "port": 5599,
            "memory": None,
            "cpus": None,
            "pids_limit": None,
        })()
        with self.assertRaises(SystemExit) as ctx:
            cmd_create_instance(args)
        self.assertIn("no existe", str(ctx.exception))

    def test_create_rejects_bundle_without_profile(self):
        empty_bundle = self.temp_dir / "empty_bundle"
        empty_bundle.mkdir()
        args = type("Args", (), {
            "name": "fail-inst",
            "from_bundle": str(empty_bundle),
            "template": None,
            "port": 5599,
            "memory": None,
            "cpus": None,
            "pids_limit": None,
        })()
        with self.assertRaises(SystemExit) as ctx:
            cmd_create_instance(args)
        self.assertIn("no contiene profile.json", str(ctx.exception))

    def test_create_rejects_incompatible_bundle_format(self):
        bad_bundle = self.temp_dir / "bad_format_bundle"
        bad_bundle.mkdir()
        shutil.copy(self.golden_bundle / "profile.json", bad_bundle / "profile.json")
        (bad_bundle / "manifest.json").write_text(json.dumps({
            "bundle_format": 999,
            "runtime_min": "99.0"
        }))

        args = type("Args", (), {
            "name": "fail-inst",
            "from_bundle": str(bad_bundle),
            "template": None,
            "port": 5599,
            "memory": None,
            "cpus": None,
            "pids_limit": None,
        })()
        with self.assertRaises(SystemExit) as ctx:
            cmd_create_instance(args)
        self.assertIn("bundle_format=999 no soportado", str(ctx.exception))

    def test_create_persists_resource_limits(self):
        test_inst_name = "test-f3-limits"
        inst_target = self.temp_dir / test_inst_name
        with patch("instance_manager.INSTANCES_DIR", self.temp_dir):
            args = type("Args", (), {
                "name": test_inst_name,
                "from_bundle": str(self.golden_bundle),
                "template": None,
                "port": 5592,
                "memory": "4g",
                "cpus": "2.0",
                "pids_limit": 2048,
                "seed": None,
                "start": False,
            })()
            with patch("subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(returncode=0, stderr=b"")
                cmd_create_instance(args)

            meta_file = inst_target / "meta.json"
            self.assertTrue(meta_file.exists())
            meta = json.loads(meta_file.read_text())
            self.assertEqual(meta["limits"]["memory"], "4g")
            self.assertEqual(meta["limits"]["cpus"], "2.0")
            self.assertEqual(meta["limits"]["pids_limit"], 2048)

            profile_file = inst_target / "profile.json"
            self.assertTrue(profile_file.exists())
            prof = json.loads(profile_file.read_text())
            self.assertEqual(prof["instance"]["name"], test_inst_name)

    def test_create_applies_default_memory_when_omitted(self):
        test_inst_name = "test-default-mem"
        inst_target = self.temp_dir / test_inst_name
        with patch("instance_manager.INSTANCES_DIR", self.temp_dir):
            args = type("Args", (), {
                "name": test_inst_name,
                "from_bundle": str(self.golden_bundle),
                "template": None,
                "port": 5592,
                "memory": None,
                "cpus": None,
                "pids_limit": None,
                "seed": None,
                "start": False,
            })()
            with patch("subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(returncode=0, stderr=b"")
                cmd_create_instance(args)

            meta_file = inst_target / "meta.json"
            self.assertTrue(meta_file.exists())
            meta = json.loads(meta_file.read_text())
            self.assertEqual(meta["limits"]["memory"], "2560m")
            self.assertEqual(meta["limits"]["swap"], "700m")

    def test_create_respects_custom_default_memory_env(self):
        test_inst_name = "test-env-mem"
        inst_target = self.temp_dir / test_inst_name
        with patch("instance_manager.INSTANCES_DIR", self.temp_dir):
            with patch.dict("os.environ", {"PROTEOMESH_DEFAULT_MEMORY": "3072m"}):
                args = type("Args", (), {
                    "name": test_inst_name,
                    "from_bundle": str(self.golden_bundle),
                    "template": None,
                    "port": 5592,
                    "memory": None,
                    "cpus": None,
                    "pids_limit": None,
                    "seed": None,
                    "start": False,
                })()
                with patch("subprocess.run") as mock_run:
                    mock_run.return_value = MagicMock(returncode=0, stderr=b"")
                    cmd_create_instance(args)

                meta_file = inst_target / "meta.json"
                self.assertTrue(meta_file.exists())
                meta = json.loads(meta_file.read_text())
                self.assertEqual(meta["limits"]["memory"], "3072m")

    def test_create_respects_custom_default_swap_env(self):
        test_inst_name = "test-env-swap"
        inst_target = self.temp_dir / test_inst_name
        with patch("instance_manager.INSTANCES_DIR", self.temp_dir):
            with patch.dict("os.environ", {"PROTEOMESH_DEFAULT_SWAP": "1g"}):
                args = type("Args", (), {
                    "name": test_inst_name,
                    "from_bundle": str(self.golden_bundle),
                    "template": None,
                    "port": 5592,
                    "memory": None,
                    "cpus": None,
                    "pids_limit": None,
                    "seed": None,
                    "start": False,
                })()
                with patch("subprocess.run") as mock_run:
                    mock_run.return_value = MagicMock(returncode=0, stderr=b"")
                    cmd_create_instance(args)

                meta_file = inst_target / "meta.json"
                self.assertTrue(meta_file.exists())
                meta = json.loads(meta_file.read_text())
                self.assertEqual(meta["limits"]["swap"], "1g")


class StartWithLimitsTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp(prefix="proteomesh_f3_start_"))

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_start_passes_docker_limits(self):
        temp_inst = self.temp_dir / "f3-start-test"
        temp_inst.mkdir(parents=True, exist_ok=True)
        golden = REPO_ROOT / "tests" / "golden" / "bundles" / "a54x_personal_seed42"
        shutil.copy(golden / "profile.json", temp_inst / "profile.json")
        shutil.copy(golden / "manifest.json", temp_inst / "manifest.json")
        (temp_inst / "meta.json").write_text(json.dumps({
            "adb_port": 5593,
            "display": {"width": 1080, "height": 2340, "dpi": 450, "fps": 90},
            "limits": {"memory": "3g", "cpus": "0-3", "pids_limit": 4096}
        }))

        args = type("Args", (), {
            "name": "f3-start-test",
            "memory": None,
            "cpus": None,
            "pids_limit": None,
            "verify_health": False,
        })()

        with patch("instance_manager.INSTANCES_DIR", self.temp_dir):
            with patch("subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(returncode=1, stderr="stop test")
                cmd_start_instance(args)

                # Verificar que subprocess.run fue llamado con los argumentos de límites
                docker_calls = [call for call in mock_run.call_args_list if "docker" in call[0][0]]
                run_call = [call for call in docker_calls if "run" in call[0][0]][0]
                cmd_args = run_call[0][0]

                self.assertIn("--memory", cmd_args)
                self.assertEqual(cmd_args[cmd_args.index("--memory") + 1], "3g")
                self.assertIn("--cpuset-cpus", cmd_args)
                self.assertEqual(cmd_args[cmd_args.index("--cpuset-cpus") + 1], "0-3")
                self.assertIn("--pids-limit", cmd_args)
                self.assertEqual(cmd_args[cmd_args.index("--pids-limit") + 1], "4096")
                self.assertIn("--memory-swap", cmd_args)
                self.assertEqual(cmd_args[cmd_args.index("--memory-swap") + 1], "3772m")

    def test_start_applies_default_memory_if_missing_in_meta(self):
        temp_inst = self.temp_dir / "f3-start-nomem"
        temp_inst.mkdir(parents=True, exist_ok=True)
        golden = REPO_ROOT / "tests" / "golden" / "bundles" / "a54x_personal_seed42"
        shutil.copy(golden / "profile.json", temp_inst / "profile.json")
        shutil.copy(golden / "manifest.json", temp_inst / "manifest.json")
        (temp_inst / "meta.json").write_text(json.dumps({
            "adb_port": 5593,
            "display": {"width": 1080, "height": 2340, "dpi": 450, "fps": 90},
            "limits": {}
        }))

        args = type("Args", (), {
            "name": "f3-start-nomem",
            "memory": None,
            "cpus": None,
            "pids_limit": None,
            "verify_health": False,
        })()

        with patch("instance_manager.INSTANCES_DIR", self.temp_dir):
            with patch("subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(returncode=1, stderr="stop test")
                cmd_start_instance(args)

                docker_calls = [call for call in mock_run.call_args_list if "docker" in call[0][0]]
                run_call = [call for call in docker_calls if "run" in call[0][0]][0]
                cmd_args = run_call[0][0]

                self.assertIn("--memory", cmd_args)
                self.assertEqual(cmd_args[cmd_args.index("--memory") + 1], "2560m")
                self.assertIn("--memory-swap", cmd_args)
                self.assertEqual(cmd_args[cmd_args.index("--memory-swap") + 1], "3260m")


class VerifyHealthTest(unittest.TestCase):
    def test_verify_health_returns_false_for_missing_instance(self):
        ok, reports = verify_instance_health("nonexistent-inst-xyz")
        self.assertFalse(ok)
        self.assertTrue(any("no existe" in r for r in reports))


if __name__ == "__main__":
    unittest.main()
