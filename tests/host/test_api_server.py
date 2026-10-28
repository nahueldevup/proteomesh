"""
Test suite para el servidor Backend FastAPI de ProteoMesh
"""
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

try:
    from fastapi.testclient import TestClient
    from server.main import app
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False


@unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI / TestClient no disponibles en el intérprete actual")
class ApiServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_root_endpoint(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "online")
        self.assertEqual(data["docs_url"], "/docs")
        self.assertIn("ProteoMesh", data["service"])

    def test_health_endpoint(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "healthy", "service": "proteomesh-api"})

    def test_list_templates(self):
        res = self.client.get("/api/v1/templates")
        self.assertEqual(res.status_code, 200)
        catalog = res.json()
        self.assertIn("samsung", catalog)
        self.assertIn("xiaomi", catalog)
        self.assertIn("motorola", catalog)
        self.assertIn("google", catalog)
        # Verificar un modelo
        samsung_models = [m["name"] for m in catalog["samsung"]]
        self.assertTrue(any("A54" in name for name in samsung_models))

    def test_get_template_detail(self):
        res = self.client.get("/api/v1/templates/samsung/a54x")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["template"]["name"], "Samsung Galaxy A54 5G")
        self.assertEqual(data["device"]["brand"], "samsung")

    def test_get_template_not_found(self):
        res = self.client.get("/api/v1/templates/samsung/modelo_inexistente_999")
        self.assertEqual(res.status_code, 404)

    def test_list_carriers(self):
        res = self.client.get("/api/v1/carriers")
        self.assertEqual(res.status_code, 200)
        carriers = res.json()
        ids = [c["id"] for c in carriers]
        self.assertIn("ar_personal", ids)
        self.assertIn("ar_claro", ids)
        self.assertIn("us_verizon", ids)
        self.assertIn("es_movistar", ids)

    def test_list_locations(self):
        res = self.client.get("/api/v1/locations")
        self.assertEqual(res.status_code, 200)
        presets = res.json()
        self.assertIn("cordoba", presets)
        self.assertIn("miami", presets)
        self.assertIn("madrid", presets)
        self.assertIn("ba", presets)
        self.assertEqual(presets["cordoba"]["city"], "Córdoba, Argentina")

    def test_list_instances(self):
        res = self.client.get("/api/v1/instances")
        self.assertEqual(res.status_code, 200)
        instances = res.json()
        self.assertIsInstance(instances, list)
        self.assertGreater(len(instances), 0)

    def test_get_instance_detail(self):
        instances = self.client.get("/api/v1/instances").json()
        target = instances[0]["instance_name"]
        res = self.client.get(f"/api/v1/instances/{target}")
        self.assertEqual(res.status_code, 200)
        inst = res.json()
        self.assertEqual(inst["instance_name"], target)
        self.assertTrue(inst["adb_port"] > 0)

    def test_get_instance_location(self):
        instances = self.client.get("/api/v1/instances").json()
        target = instances[0]["instance_name"]
        res = self.client.get(f"/api/v1/locations/instances/{target}")
        self.assertEqual(res.status_code, 200)
        loc = res.json()
        self.assertEqual(loc["status"], "ok")
        self.assertEqual(loc["instance"], target)
        self.assertIn("latitude", loc["location"])
        self.assertIn("longitude", loc["location"])

    def test_update_instance_location_preset(self):
        instances = self.client.get("/api/v1/instances").json()
        target = instances[0]["instance_name"]
        # Actualizar ubicación con preset
        res = self.client.post(f"/api/v1/locations/instances/{target}", json={"location": "mendoza"})
        self.assertEqual(res.status_code, 200)
        loc = res.json()
        self.assertEqual(loc["location"]["city"], "Mendoza, Argentina")
        self.assertAlmostEqual(loc["location"]["latitude"], -32.889458)

        # Restaurar a Buenos Aires
        res_back = self.client.post(f"/api/v1/locations/instances/{target}", json={"location": "ba"})
        self.assertEqual(res_back.status_code, 200)
        self.assertEqual(res_back.json()["location"]["city"], "Buenos Aires, Argentina (Obelisco)")

    def test_update_instance_location_custom_coords(self):
        instances = self.client.get("/api/v1/instances").json()
        target = instances[0]["instance_name"]
        # Actualizar con coordenadas decimales personalizadas
        payload = {
            "latitude": -31.42,
            "longitude": -64.18,
            "altitude": 395.0,
            "city": "Córdoba Centro",
            "timezone": "America/Argentina/Cordoba"
        }
        res = self.client.post(f"/api/v1/locations/instances/{target}", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["location"]["city"], "Córdoba Centro")
        self.assertAlmostEqual(data["location"]["latitude"], -31.42)

        # Restaurar a Buenos Aires
        self.client.post(f"/api/v1/locations/instances/{target}", json={"location": "ba"})


if __name__ == "__main__":
    unittest.main()
