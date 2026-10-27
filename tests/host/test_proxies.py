"""
Test suite para el servicio y endpoints de Proxies Residenciales
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from server.services.proxy_service import parse_proxy_string, proxy_service
from server.models.schemas import ProxyConfig

try:
    from fastapi.testclient import TestClient
    from server.main import app
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False


class ProxyParsingTest(unittest.TestCase):
    def test_parse_socks5_url_with_auth(self):
        p = parse_proxy_string("socks5://alice:secret123@198.51.100.1:1080")
        self.assertEqual(p.type, "socks5")
        self.assertEqual(p.host, "198.51.100.1")
        self.assertEqual(p.port, 1080)
        self.assertEqual(p.username, "alice")
        self.assertEqual(p.password, "secret123")
        self.assertEqual(p.url, "socks5://alice:secret123@198.51.100.1:1080")

    def test_parse_http_url_without_auth(self):
        p = parse_proxy_string("http://198.51.100.2:8080")
        self.assertEqual(p.type, "http")
        self.assertEqual(p.host, "198.51.100.2")
        self.assertEqual(p.port, 8080)
        self.assertIsNone(p.username)
        self.assertIsNone(p.password)
        self.assertEqual(p.url, "http://198.51.100.2:8080")

    def test_parse_colon_delimited_four_parts(self):
        p = parse_proxy_string("198.51.100.3:5000:myuser:mypass")
        self.assertEqual(p.type, "socks5")
        self.assertEqual(p.host, "198.51.100.3")
        self.assertEqual(p.port, 5000)
        self.assertEqual(p.username, "myuser")
        self.assertEqual(p.password, "mypass")

    def test_parse_colon_delimited_two_parts(self):
        p = parse_proxy_string("198.51.100.4:9050", default_type="http")
        self.assertEqual(p.type, "http")
        self.assertEqual(p.host, "198.51.100.4")
        self.assertEqual(p.port, 9050)
        self.assertIsNone(p.username)

    def test_reject_invalid_format(self):
        with self.assertRaises(ValueError):
            parse_proxy_string("")

        with self.assertRaises(ValueError):
            parse_proxy_string("ftp://198.51.100.5:21")

        with self.assertRaises(ValueError):
            parse_proxy_string("solo_una_palabra_sin_puerto")


@unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI / TestClient no disponibles")
class ProxyApiEndpointsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        import json, shutil
        cls.inst_dir = REPO_ROOT / "instances" / "_test_proxy_api"
        if cls.inst_dir.exists():
            shutil.rmtree(cls.inst_dir, ignore_errors=True)
        cls.inst_dir.mkdir(parents=True)
        (cls.inst_dir / "meta.json").write_text(json.dumps({
            "instance_name": "_test_proxy_api",
            "template": "templates/samsung/a54x.json",
            "carrier": "ar_personal",
            "adb_port": 5599,
            "limits": {"memory": "2.5g", "cpus": "0-3"},
            "display": {"width": 1080, "height": 2340, "dpi": 450},
        }), encoding="utf-8")
        (cls.inst_dir / "profile.json").write_text("{}", encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        import shutil
        shutil.rmtree(cls.inst_dir, ignore_errors=True)

    def test_test_proxy_endpoint_invalid_format(self):
        res = self.client.post("/api/v1/proxies/test", json={"proxy_url": "formato_invalido"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data["ok"])
        self.assertIn("error", data)

    def test_get_and_update_instance_proxy(self):
        # 1. Obtener proxy inicial de f05-main (debe ser null o existente)
        res_init = self.client.get("/api/v1/instances/_test_proxy_api/proxy")
        self.assertEqual(res_init.status_code, 200)

        # 2. Asignar proxy residencial (offline: no tocar contenedores reales)
        payload = {
            "raw_proxy": "socks5://res_user:res_pass@198.51.100.50:1080",
            "auto_sync_location": False
        }
        with patch.object(proxy_service, "_container_running", return_value=False):
            res_set = self.client.post("/api/v1/instances/_test_proxy_api/proxy", json=payload)
            self.assertEqual(res_set.status_code, 200)
            set_data = res_set.json()
            self.assertEqual(set_data["status"], "ok")
            self.assertEqual(set_data["proxy"]["host"], "198.51.100.50")
            self.assertEqual(set_data["proxy"]["port"], 1080)
            self.assertEqual(set_data["proxy"]["username"], "res_user")

        # 3. Verificar que get_instance_proxy y get_single_instance reflejan el proxy
        res_get = self.client.get("/api/v1/instances/_test_proxy_api/proxy")
        self.assertEqual(res_get.status_code, 200)
        self.assertTrue(res_get.json()["has_proxy"])
        self.assertEqual(res_get.json()["proxy"]["host"], "198.51.100.50")

        # 4. Remover proxy de la instancia
        with patch.object(proxy_service, "_container_running", return_value=False):
            res_del = self.client.delete("/api/v1/instances/_test_proxy_api/proxy")
            self.assertEqual(res_del.status_code, 200)

        # 5. Verificar que quedó sin proxy
        res_after = self.client.get("/api/v1/instances/_test_proxy_api/proxy")
        self.assertEqual(res_after.status_code, 200)
        self.assertFalse(res_after.json()["has_proxy"])
        self.assertIsNone(res_after.json()["proxy"])


if __name__ == "__main__":
    unittest.main()
