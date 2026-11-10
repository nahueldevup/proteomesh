"""
Pruebas unitarias para la infraestructura SQLite unificada y la migración de ubicaciones.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from server.db.connection import get_connection, transaction
from server.db.migrate import run_migrations, migrate_legacy_json_locations, init_db
from server.services.custom_location_service import CustomLocationService


class DbPersistenceTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_proteomesh.db"
        self.json_path = Path(self.temp_dir.name) / "test_locations.json"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_migrations_idempotency(self):
        """Verifica que las migraciones corran y sean idempotentes."""
        first_run = run_migrations(self.db_path)
        self.assertIn(1, first_run)
        self.assertIn(2, first_run)

        # Segunda corrida no debe reaplicar nada
        second_run = run_migrations(self.db_path)
        self.assertEqual(second_run, [])

        with get_connection(self.db_path) as conn:
            cur = conn.execute("SELECT version FROM _schema_version ORDER BY version ASC")
            versions = [r[0] for r in cur.fetchall()]
            self.assertEqual(versions, [1, 2])

    def test_json_bootstrap_and_service(self):
        """Verifica la migración automática de datos desde un archivo JSON legacy."""
        legacy_data = {
            "groups": [
                {"id": "grp_test", "name": "Grupo Test", "color": "#3b82f6", "description": "Desc test"}
            ],
            "locations": [
                {
                    "id": "loc_1",
                    "name": "Ubicación 1",
                    "group_id": "grp_test",
                    "city": "Test City",
                    "latitude": -34.5,
                    "longitude": -58.5,
                    "altitude": 30.0,
                    "accuracy": 3.0,
                    "timezone": "America/Argentina/Buenos_Aires",
                    "is_pinned": True,
                    "radius_km": 2.5,
                    "show_radius": True,
                }
            ],
            "pinned_presets": ["ba", "miami"],
            "default_location": {
                "id": "loc_1",
                "target_type": "custom",
                "name": "Ubicación 1",
                "city": "Test City",
                "latitude": -34.5,
                "longitude": -58.5,
            },
        }
        self.json_path.write_text(json.dumps(legacy_data), encoding="utf-8")

        # Inicializar el servicio apuntando a la base de datos temporal
        run_migrations(self.db_path)
        migrated = migrate_legacy_json_locations(self.db_path, self.json_path)
        self.assertTrue(migrated)

        service = CustomLocationService(db_path=self.db_path)
        catalog = service.get_catalog()

        self.assertEqual(len(catalog["groups"]), 1)
        self.assertEqual(catalog["groups"][0]["name"], "Grupo Test")
        self.assertEqual(len(catalog["locations"]), 1)
        loc = catalog["locations"][0]
        self.assertEqual(loc["name"], "Ubicación 1")
        self.assertEqual(loc["radius_km"], 2.5)
        self.assertTrue(loc["show_radius"])
        self.assertEqual(catalog["pinned_presets"], ["ba", "miami"])
        self.assertEqual(catalog["default_location"]["id"], "loc_1")

    def test_cascade_set_null_on_group_delete(self):
        """Verifica que al eliminar un grupo, sus ubicaciones queden con group_id = NULL."""
        init_db(self.db_path)
        service = CustomLocationService(db_path=self.db_path)

        grp = service.create_group({"name": "Grupo Temporal", "color": "#ef4444"})
        loc = service.create_location({
            "name": "Ubicación En Grupo",
            "group_id": grp["id"],
            "latitude": -31.0,
            "longitude": -64.0,
            "radius_km": 1.5,
            "show_radius": True,
        })
        self.assertEqual(loc["group_id"], grp["id"])

        # Borrar el grupo
        deleted = service.delete_group(grp["id"])
        self.assertTrue(deleted)

        # La ubicación debe persistir con group_id = None
        updated_loc = service.get_location(loc["id"])
        self.assertIsNotNone(updated_loc)
        self.assertIsNone(updated_loc["group_id"])

    def test_instance_store_crud(self):
        """Verifica la persistencia atómica de instancias y perfiles en SQLite y disco."""
        from server.db.instance_store import InstanceStore

        init_db(self.db_path)
        inst_dir = Path(self.temp_dir.name) / "instances"
        store = InstanceStore(db_path=self.db_path, instances_dir=inst_dir)

        test_meta = {
            "instance_name": "phone-alpha",
            "template": "samsung/a54x",
            "carrier": "ar_personal",
            "adb_port": 5580,
            "location": {
                "city": "Buenos Aires",
                "latitude": -34.6037,
                "longitude": -58.3816,
                "altitude": 25.0,
                "accuracy": 4.2,
                "timezone": "America/Argentina/Buenos_Aires",
            },
            "proxy": {"mode": "direct"},
            "limits": {"memory": "4g", "cpus": "2.0"},
            "default_apks_provisioned": False,
        }
        test_profile = {
            "build": {"brand": "samsung", "model": "SM-A546E"},
            "telephony": {"carrier": "ar_personal"},
        }

        # 1. Guardar instancia y perfil
        store.save_instance("phone-alpha", test_meta, test_profile)

        # Verificar en SQLite
        saved = store.get("phone-alpha")
        self.assertIsNotNone(saved)
        self.assertEqual(saved["instance_name"], "phone-alpha")
        self.assertEqual(saved["adb_port"], 5580)
        self.assertEqual(saved["location"]["city"], "Buenos Aires")
        self.assertFalse(store.is_apks_provisioned("phone-alpha"))

        # Verificar en disco
        meta_disk = json.loads((inst_dir / "phone-alpha" / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(meta_disk["instance_name"], "phone-alpha")

        # 2. Mutar meta atómicamente
        def _add_proxy(m):
            m["proxy"] = {"mode": "socks5", "host": "127.0.0.1", "port": 1080}
            m["default_apks_provisioned"] = True

        store.mutate_meta("phone-alpha", _add_proxy)
        updated = store.get("phone-alpha")
        self.assertEqual(updated["proxy"]["mode"], "socks5")
        self.assertTrue(store.is_apks_provisioned("phone-alpha"))

        # 3. Actualizar ubicación
        new_loc = {
            "city": "Córdoba",
            "latitude": -31.4201,
            "longitude": -64.1888,
            "altitude": 400.0,
            "timezone": "America/Argentina/Cordoba",
        }
        store.set_instance_location("phone-alpha", new_loc)
        loc_updated = store.get("phone-alpha")
        self.assertEqual(loc_updated["location"]["city"], "Córdoba")
        self.assertAlmostEqual(loc_updated["location"]["latitude"], -31.4201)

        # 4. Eliminar instancia (junto con su carpeta de disco en el test)
        deleted = store.delete("phone-alpha", delete_disk=True)
        self.assertTrue(deleted)
        self.assertIsNone(store.get("phone-alpha"))


if __name__ == "__main__":
    unittest.main()
