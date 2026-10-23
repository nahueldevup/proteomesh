import json
import shutil
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
import sys
sys.path.insert(0, str(REPO_ROOT / "tools"))

from instance_manager import (
    LOCATION_PRESETS,
    parse_location,
    cmd_set_location,
    cmd_get_location,
    INSTANCES_DIR,
)
from render import render_bundle, find_template, find_carrier


class LocationParserTest(unittest.TestCase):
    def test_parse_presets(self):
        loc_ba = parse_location("cordoba")
        self.assertEqual(loc_ba["city"], "Córdoba, Argentina")
        self.assertAlmostEqual(loc_ba["latitude"], -31.420083)
        self.assertAlmostEqual(loc_ba["longitude"], -64.188776)
        self.assertEqual(loc_ba["timezone"], "America/Argentina/Cordoba")

        loc_miami = parse_location("miami")
        self.assertEqual(loc_miami["city"], "Miami, Florida, EE.UU.")
        self.assertAlmostEqual(loc_miami["latitude"], 25.761680)
        self.assertEqual(loc_miami["timezone"], "America/New_York")

        loc_madrid = parse_location("madrid")
        self.assertEqual(loc_madrid["city"], "Madrid, España")
        self.assertEqual(loc_madrid["timezone"], "Europe/Madrid")

    def test_parse_custom_coordinates(self):
        loc = parse_location("-32.95,-60.69")
        self.assertAlmostEqual(loc["latitude"], -32.95)
        self.assertAlmostEqual(loc["longitude"], -60.69)
        self.assertEqual(loc["altitude"], 25.0)

        loc3 = parse_location("40.4167,-3.7037,650.0")
        self.assertAlmostEqual(loc3["latitude"], 40.4167)
        self.assertAlmostEqual(loc3["longitude"], -3.7037)
        self.assertAlmostEqual(loc3["altitude"], 650.0)

    def test_reject_invalid_location(self):
        with self.assertRaises(SystemExit):
            parse_location("ciudad_inexistente_12345")

        with self.assertRaises(SystemExit):
            parse_location("95.0, -58.0")  # Latitud > 90

        with self.assertRaises(SystemExit):
            parse_location("-34.0, 195.0")  # Longitud > 180

        with self.assertRaises(SystemExit):
            parse_location("abc,def")


class LocationBundleTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp(prefix="proteomesh_loc_test_"))
        self.tmpl_path = find_template("samsung/a54x")
        self.carrier_path = find_carrier("ar_personal")

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_render_bundle_with_preset_location(self):
        res = render_bundle(
            template_path=self.tmpl_path,
            carrier_path=self.carrier_path,
            seed=42,
            instance_name="test-loc-inst",
            out_dir=self.temp_dir,
            location="cordoba"
        )
        self.assertIn("location", res["profile"])
        self.assertEqual(res["profile"]["location"]["city"], "Córdoba, Argentina")
        self.assertEqual(res["meta"]["location"]["city"], "Córdoba, Argentina")
        self.assertEqual(res["profile"]["location"]["timezone"], "America/Argentina/Cordoba")

        # Verificar persistencia en disco
        disk_profile = json.loads((self.temp_dir / "profile.json").read_text(encoding="utf-8"))
        disk_meta = json.loads((self.temp_dir / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(disk_profile["location"]["city"], "Córdoba, Argentina")
        self.assertEqual(disk_meta["location"]["city"], "Córdoba, Argentina")

    def test_render_bundle_with_custom_coordinates(self):
        res = render_bundle(
            template_path=self.tmpl_path,
            carrier_path=self.carrier_path,
            seed=42,
            instance_name="test-loc-custom",
            out_dir=self.temp_dir,
            location="25.7616,-80.1917,5.0"
        )
        self.assertIn("location", res["profile"])
        self.assertAlmostEqual(res["profile"]["location"]["latitude"], 25.7616)
        self.assertAlmostEqual(res["profile"]["location"]["longitude"], -80.1917)
        self.assertAlmostEqual(res["profile"]["location"]["altitude"], 5.0)


if __name__ == "__main__":
    unittest.main()
