import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))

from instance_manager import validate_instance_name


class InstanceNameValidationTest(unittest.TestCase):
    def test_accepts_existing_names(self):
        for name in ("hide-test", "v-samsung_s21", "inst-note13", "a", "a" * 63):
            self.assertEqual(validate_instance_name(name), name)

    def test_rejects_unsafe_names(self):
        for name in ("../x", "a/b", "a b", "a.b", "A", "-x", "_x", "a" * 64, ""):
            with self.subTest(name=name):
                with self.assertRaises(SystemExit):
                    validate_instance_name(name)


if __name__ == "__main__":
    unittest.main()
