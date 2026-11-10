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

        # Segunda corrida no debe reaplicar nada
        second_run = run_migrations(self.db_path)
        self.assertEqual(second_run, [])

        with get_connection(self.db_path) as conn:
            cur = conn.execute("SELECT version FROM _schema_version")
            versions = [r[0] for r in cur.fetchall()]
            self.assertEqual(versions, [1])

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


if __name__ == "__main__":
    unittest.main()
