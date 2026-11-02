"""
Test de humo para el arranque de la aplicación FastAPI.

Este test importa server.main, que a su vez importa todos los routers.
Si falta una dependencia obligatoria (por ejemplo python-multipart) o hay
un error de importación en cualquier módulo de rutas, el test falla antes
de que la aplicación se levante en producción.
"""
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


class MainSmokeTest(unittest.TestCase):
    def test_import_main_app(self):
        from server.main import app

        self.assertIsNotNone(app)
        # OpenAPI recorre todos los routers incluidos, con sus prefijos.
        paths = app.openapi()["paths"]
        self.assertIn("/api/v1/apks", paths)
        self.assertIn("/api/v1/files", paths)


if __name__ == "__main__":
    unittest.main()
