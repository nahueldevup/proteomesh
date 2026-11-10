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


class CustomLocationServiceTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp(prefix="proteomesh_custom_loc_test_"))
        self.custom_file = self.temp_dir / "custom_locations.json"
        from server.services.custom_location_service import CustomLocationService
        self.service = CustomLocationService(self.custom_file)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_default_initialization(self):
        cat = self.service.get_catalog()
        self.assertIn("groups", cat)
        self.assertIn("locations", cat)
        self.assertTrue(len(cat["groups"]) >= 1)
        self.assertTrue(len(cat["locations"]) >= 1)

    def test_crud_groups(self):
        grp = self.service.create_group({
            "name": "Sucursales Bancarias",
            "color": "#3b82f6",
            "description": "Zonas de testing bancario"
        })
        self.assertIn("id", grp)
        self.assertEqual(grp["name"], "Sucursales Bancarias")
        self.assertEqual(grp["color"], "#3b82f6")

        # Actualizar grupo
        upd = self.service.update_group(grp["id"], {"name": "Bancos y Fintech"})
        self.assertEqual(upd["name"], "Bancos y Fintech")

        # Listar
        groups = self.service.list_groups()
        self.assertTrue(any(g["id"] == grp["id"] for g in groups))

        # Eliminar grupo
        deleted = self.service.delete_group(grp["id"])
        self.assertTrue(deleted)
        groups_after = self.service.list_groups()
        self.assertFalse(any(g["id"] == grp["id"] for g in groups_after))

    def test_crud_custom_locations(self):
        grp = self.service.create_group({"name": "Oficinas Microcentro", "color": "#10b981"})
        loc = self.service.create_location({
            "name": "HQ Corrientes",
            "group_id": grp["id"],
            "city": "Microcentro, CABA",
            "latitude": -34.604,
            "longitude": -58.378,
            "altitude": 30.0,
            "timezone": "America/Argentina/Buenos_Aires"
        })
        self.assertIn("id", loc)
        self.assertEqual(loc["name"], "HQ Corrientes")
        self.assertEqual(loc["group_id"], grp["id"])
        self.assertAlmostEqual(loc["latitude"], -34.604)

        # Buscar por id y por nombre
        found_id = self.service.find_location(loc["id"])
        self.assertIsNotNone(found_id)
        self.assertEqual(found_id["name"], "HQ Corrientes")

        found_name = self.service.find_location("hq corrientes")
        self.assertIsNotNone(found_name)
        self.assertEqual(found_name["id"], loc["id"])

        # Actualizar ubicación
        upd = self.service.update_location(loc["id"], {"name": "HQ Corrientes & Florida", "altitude": 35.0})
        self.assertEqual(upd["name"], "HQ Corrientes & Florida")
        self.assertEqual(upd["altitude"], 35.0)

        # Si se elimina el grupo, la ubicación no se borra, pasa a group_id = None
        self.service.delete_group(grp["id"])
        loc_after_grp_del = self.service.get_location(loc["id"])
        self.assertIsNotNone(loc_after_grp_del)
        self.assertIsNone(loc_after_grp_del["group_id"])

        # Pinar y despinar
        pinned_loc = self.service.toggle_custom_pin(loc["id"], True)
        self.assertTrue(pinned_loc["is_pinned"])
        unpinned_loc = self.service.toggle_custom_pin(loc["id"], False)
        self.assertFalse(unpinned_loc["is_pinned"])

        # Pinar y despinar presets
        pins = self.service.toggle_preset_pin("ba", False)
        self.assertNotIn("ba", pins)
        pins2 = self.service.toggle_preset_pin("ba", True)
        self.assertIn("ba", pins2)

        # Configurar como ubicación predeterminada del sistema
        def_loc = self.service.set_default_location({
            "target_type": "custom",
            "target_id": loc["id"]
        })
        self.assertEqual(def_loc["id"], loc["id"])
        self.assertEqual(def_loc["target_type"], "custom")
        self.assertAlmostEqual(def_loc["latitude"], -34.604)

        got_def = self.service.get_default_location()
        self.assertEqual(got_def["id"], loc["id"])

        # Eliminar ubicación
        del_loc = self.service.delete_location(loc["id"])
        self.assertTrue(del_loc)
        self.assertIsNone(self.service.get_location(loc["id"]))


try:
    from fastapi.testclient import TestClient
    from server.main import app
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False


@unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI / TestClient no disponibles")
class CustomLocationApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_custom_locations_api_flow(self):
        # 1. Obtener catálogo
        res = self.client.get("/api/v1/locations/custom")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("groups", data)
        self.assertIn("locations", data)

        grp_id = None
        loc_id = None
        prev_def = None
        try:
            # 2. Crear un grupo
            grp_res = self.client.post("/api/v1/locations/groups", json={
                "name": "Test Group API",
                "color": "#8b5cf6",
                "description": "Creado por test"
            })
            self.assertEqual(grp_res.status_code, 200)
            grp_data = grp_res.json()
            grp_id = grp_data["id"]

            # 3. Crear una custom location en ese grupo
            loc_res = self.client.post("/api/v1/locations/custom", json={
                "name": "Sede Test API",
                "group_id": grp_id,
                "city": "Nuñez, Buenos Aires",
                "latitude": -34.545,
                "longitude": -58.460,
                "altitude": 18.0
            })
            self.assertEqual(loc_res.status_code, 200)
            loc_data = loc_res.json()
            loc_id = loc_data["id"]
            self.assertEqual(loc_data["name"], "Sede Test API")
            self.assertEqual(loc_data["group_id"], grp_id)
            self.assertEqual(loc_data.get("radius_km"), 1.0)
            self.assertTrue(loc_data.get("show_radius"))

            # 4. Actualizar la custom location y toggle pin
            upd_res = self.client.put(f"/api/v1/locations/custom/{loc_id}", json={
                "name": "Sede Test API Modificada",
                "radius_km": 3.5,
                "show_radius": False
            })
            self.assertEqual(upd_res.status_code, 200)
            self.assertEqual(upd_res.json()["name"], "Sede Test API Modificada")
            self.assertEqual(upd_res.json()["radius_km"], 3.5)
            self.assertFalse(upd_res.json()["show_radius"])

            # Probar toggle pin de custom
            pin_res = self.client.post("/api/v1/locations/toggle-pin", json={
                "target_type": "custom",
                "target_id": loc_id,
                "pinned": True
            })
            self.assertEqual(pin_res.status_code, 200)
            self.assertTrue(pin_res.json()["location"]["is_pinned"])

            # Probar unpin y pin de preset
            unpin_pre_res = self.client.post("/api/v1/locations/toggle-pin", json={
                "target_type": "preset",
                "target_id": "ba",
                "pinned": False
            })
            self.assertEqual(unpin_pre_res.status_code, 200)
            self.assertNotIn("ba", unpin_pre_res.json()["pinned_presets"])

            # Probar PUT /api/v1/locations/pinned-presets
            put_presets_res = self.client.put("/api/v1/locations/pinned-presets", json={
                "pinned_presets": ["cordoba", "tokyo", "madrid"]
            })
            self.assertEqual(put_presets_res.status_code, 200)
            self.assertEqual(put_presets_res.json()["pinned_presets"], ["cordoba", "tokyo", "madrid"])

            # Restaurar pin de presets por defecto
            self.client.put("/api/v1/locations/pinned-presets", json={
                "pinned_presets": ["ba", "sao-paulo", "miami", "new-york"]
            })

            # 5. Asignar la ubicación custom a una instancia
            instances = self.client.get("/api/v1/instances").json()
            target_inst = instances[0]["instance_name"] if instances else None
            if target_inst:
                inst_res = self.client.post(f"/api/v1/locations/instances/{target_inst}", json={
                    "custom_location_id": loc_id
                })
                self.assertEqual(inst_res.status_code, 200)
                loc_applied = inst_res.json()["location"]
                self.assertEqual(loc_applied["custom_name"], "Sede Test API Modificada")
                self.assertEqual(loc_applied["custom_location_id"], loc_id)
                self.assertEqual(loc_applied["group_name"], "Test Group API")
                self.assertAlmostEqual(loc_applied["latitude"], -34.545)

            # 6. Probar endpoints de Default Location
            prev_def = self.client.get("/api/v1/locations/default").json()

            # Configurar default location usando un preset
            set_def_res = self.client.put("/api/v1/locations/default", json={
                "target_type": "preset",
                "target_id": "cordoba"
            })
            self.assertEqual(set_def_res.status_code, 200)
            new_def = set_def_res.json()
            self.assertEqual(new_def["id"], "cordoba")
            self.assertEqual(new_def["target_type"], "preset")
            self.assertAlmostEqual(new_def["latitude"], -31.420083)
        finally:
            # Restaurar default location previa si se cambió
            if prev_def and prev_def.get("target_type") and prev_def.get("id"):
                self.client.put("/api/v1/locations/default", json={
                    "target_type": prev_def["target_type"],
                    "target_id": prev_def["id"]
                })
            # 7. Borrar la custom location y el grupo creados por la prueba
            if loc_id:
                self.client.delete(f"/api/v1/locations/custom/{loc_id}")
            if grp_id:
                self.client.delete(f"/api/v1/locations/groups/{grp_id}")


if __name__ == "__main__":
    unittest.main()
