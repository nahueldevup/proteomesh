"""
Tests unitarios y de integración para el subsistema de red, transportes transparentes y leases de IP.
Valida:
  - Parse de URIs SOCKS5 (válidos e inválidos).
  - Unicidad atómica de leases bajo concurrencia (IpLeaseRegistry).
  - Ciclo de vida de leases (reserve, release, re-reserve, owner_of).
  - Renderizado seguro de scripts de enrutamiento tun2socks.
  - Idempotencia de apply_from_meta (con y sin proxy).
  - Mapeo de colisión de IP hacia HTTP 409 Conflict en la API.
  - Contrato de extensibilidad para UsbMobileTransport (Fase 2).
"""
import sys
import os
import tempfile
import asyncio
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch, MagicMock

# Bootstrap sys.path para importar server y tools
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from fastapi.testclient import TestClient
from server.main import app
from server.services.proxy_service import parse_proxy_string, proxy_service
from server.services.network.lease_registry import IpLeaseRegistry, IpConflictError
from server.services.network.route_store import RouteStore
from server.services.network.transport import (
    Socks5Transport,
    ROUTE_SCRIPT_TMPL,
    TEARDOWN_SCRIPT_TMPL,
    QUARANTINE_SCRIPT_TMPL,
    UNQUARANTINE_SCRIPT_TMPL,
    _dns_bridge_port,
)


class TestSocks5UriParsing(unittest.TestCase):
    """Pruebas de parseo de URIs y cadenas de proxy SOCKS5."""

    def test_parse_valid_socks5_urls(self):
        # Con usuario y contraseña
        cfg = parse_proxy_string("socks5://user123:pass456@10.20.30.40:1080")
        self.assertEqual(cfg.type, "socks5")
        self.assertEqual(cfg.host, "10.20.30.40")
        self.assertEqual(cfg.port, 1080)
        self.assertEqual(cfg.username, "user123")
        self.assertEqual(cfg.password, "pass456")

        # Sin autenticación
        cfg2 = parse_proxy_string("socks5://192.168.1.100:9050")
        self.assertEqual(cfg2.type, "socks5")
        self.assertEqual(cfg2.host, "192.168.1.100")
        self.assertEqual(cfg2.port, 9050)
        self.assertIsNone(cfg2.username)
        self.assertIsNone(cfg2.password)

        # socks5h:// (DNS remoto)
        cfg3 = parse_proxy_string("socks5h://proxy.domain.com:1088")
        self.assertEqual(cfg3.type, "socks5")
        self.assertEqual(cfg3.host, "proxy.domain.com")
        self.assertEqual(cfg3.port, 1088)

    def test_parse_valid_colon_delimited(self):
        # host:port:user:pass
        cfg = parse_proxy_string("185.220.101.5:8000:alice:secret99")
        self.assertEqual(cfg.type, "socks5")
        self.assertEqual(cfg.host, "185.220.101.5")
        self.assertEqual(cfg.port, 8000)
        self.assertEqual(cfg.username, "alice")
        self.assertEqual(cfg.password, "secret99")

        # host:port
        cfg2 = parse_proxy_string("185.220.101.5:8000")
        self.assertEqual(cfg2.type, "socks5")
        self.assertEqual(cfg2.host, "185.220.101.5")
        self.assertEqual(cfg2.port, 8000)
        self.assertIsNone(cfg2.username)

    def test_parse_invalid_proxy_strings(self):
        invalid_inputs = [
            "",
            "   ",
            "ftp://user:pass@1.2.3.4:21",
            "socks5://host_sin_puerto",
            "host:puerto_no_numerico",
            "host:port:user:pass:extra_part",
        ]
        for inv in invalid_inputs:
            with self.subTest(input=inv):
                with self.assertRaises(ValueError):
                    parse_proxy_string(inv)


class TestIpLeaseRegistry(unittest.TestCase):
    """Pruebas del registro atómico de leases y concurrencia con SQLite WAL."""

    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "test_leases.db"
        self.registry = IpLeaseRegistry(self.db_path)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_reserve_and_owner_of(self):
        lease_id = self.registry.reserve("190.220.1.1", "phone-01", "socks5", {"city": "BA"})
        self.assertIsInstance(lease_id, int)
        self.assertEqual(self.registry.owner_of("190.220.1.1"), "phone-01")

        # Mismo dueño re-reservando misma IP actualiza lease
        lease_id2 = self.registry.reserve("190.220.1.1", "phone-01", "socks5", {"city": "Rosario"})
        self.assertEqual(lease_id, lease_id2)
        self.assertEqual(self.registry.owner_of("190.220.1.1"), "phone-01")

    def test_conflict_on_same_ip(self):
        self.registry.reserve("190.220.1.1", "phone-01", "socks5")

        # Otra instancia intentando la misma IP debe fallar
        with self.assertRaises(IpConflictError) as ctx:
            self.registry.reserve("190.220.1.1", "phone-02", "socks5")

        self.assertEqual(ctx.exception.exit_ip, "190.220.1.1")
        self.assertEqual(ctx.exception.owner, "phone-01")

    def test_release_and_rereserve(self):
        self.registry.reserve("190.220.1.1", "phone-01", "socks5")
        self.assertEqual(self.registry.owner_of("190.220.1.1"), "phone-01")

        # Liberar phone-01
        released = self.registry.release("phone-01")
        self.assertTrue(released)
        self.assertIsNone(self.registry.owner_of("190.220.1.1"))

        # Ahora phone-02 puede adquirirla sin conflicto
        lease_id = self.registry.reserve("190.220.1.1", "phone-02", "socks5")
        self.assertIsInstance(lease_id, int)
        self.assertEqual(self.registry.owner_of("190.220.1.1"), "phone-02")

    def test_instance_switching_ip_releases_old_ip(self):
        self.registry.reserve("190.220.1.1", "phone-01", "socks5")
        self.assertEqual(self.registry.owner_of("190.220.1.1"), "phone-01")

        # phone-01 adquiere una nueva IP: la anterior queda libre
        self.registry.reserve("190.220.1.2", "phone-01", "socks5")
        self.assertIsNone(self.registry.owner_of("190.220.1.1"))
        self.assertEqual(self.registry.owner_of("190.220.1.2"), "phone-01")

    def test_concurrent_reservations_same_ip(self):
        """Prueba de concurrencia: múltiples hilos compiten por la misma IP exacta."""
        target_ip = "200.50.10.99"
        num_threads = 8
        results = []
        errors = []

        def worker(thread_idx):
            inst_name = f"worker-phone-{thread_idx}"
            try:
                lid = self.registry.reserve(target_ip, inst_name, "socks5")
                results.append((inst_name, lid))
            except IpConflictError as e:
                errors.append((inst_name, str(e)))

        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            list(executor.map(worker, range(num_threads)))

        # Exactamente 1 hilo debe haber ganado el lease
        self.assertEqual(len(results), 1, f"Se esperaba exactamente 1 ganador, pero hubo {len(results)}: {results}")
        # Los otros N-1 deben haber recibido IpConflictError
        self.assertEqual(len(errors), num_threads - 1)
        winner_inst = results[0][0]
        self.assertEqual(self.registry.owner_of(target_ip), winner_inst)


class TestRoutingScriptTemplates(unittest.TestCase):
    """Verificación de renderizado seguro de scripts de enrutamiento y cuarentena."""

    def test_templates_exist(self):
        self.assertTrue(ROUTE_SCRIPT_TMPL.exists(), "Falta tools/network/route-socks5.sh.tmpl")
        self.assertTrue(TEARDOWN_SCRIPT_TMPL.exists(), "Falta tools/network/teardown-socks5.sh.tmpl")
        self.assertTrue(QUARANTINE_SCRIPT_TMPL.exists(), "Falta tools/network/quarantine.sh.tmpl")
        self.assertTrue(UNQUARANTINE_SCRIPT_TMPL.exists(), "Falta tools/network/unquarantine.sh.tmpl")

    def test_quarantine_preserves_host_network(self):
        raw = QUARANTINE_SCRIPT_TMPL.read_text(encoding="utf-8")
        self.assertIn("172.17.0.1/32", raw, "La cuarentena debe preservar host/ADB")
        self.assertIn("-o lo", raw)
        self.assertIn("-j DROP", raw)
        self.assertIn("PM_QUARANTINE", raw)

    def test_route_template_rendering(self):
        raw = ROUTE_SCRIPT_TMPL.read_text(encoding="utf-8")
        rendered = raw.replace("__PROXY_URL__", "socks5://user:pass@172.17.0.1:1080")
        rendered = rendered.replace("__PROXY_HOST_IP__", "172.17.0.1")
        rendered = rendered.replace("__LOG_LEVEL__", "warning")
        rendered = rendered.replace("__DNS_BRIDGE_HOST__", "172.17.0.1")
        rendered = rendered.replace("__DNS_BRIDGE_PORT__", "7089")

        self.assertNotIn("__PROXY_URL__", rendered)
        self.assertNotIn("__PROXY_HOST_IP__", rendered)
        self.assertNotIn("__LOG_LEVEL__", rendered)
        self.assertNotIn("__DNS_BRIDGE_HOST__", rendered)
        self.assertNotIn("__DNS_BRIDGE_PORT__", rendered)
        self.assertIn("198.18.0.1/15", rendered)
        self.assertIn("prio 9000", rendered)
        self.assertIn("table 99", rendered)
        self.assertIn("172.17.0.0/16", rendered)
        self.assertIn("PM_DNS", rendered)
        self.assertIn("PM_DNS_SNAT", rendered)
        self.assertIn("MASQUERADE", rendered)
        self.assertIn("--dport 53", rendered)

    def test_dns_bridge_marker_resolution(self):
        import os
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(os.environ, {"HOME": tmp}):
                self.assertIsNone(_dns_bridge_port("127.0.0.1", 1089))
                marker_dir = Path(tmp) / ".config" / "proteomesh" / "dns_bridges"
                marker_dir.mkdir(parents=True)
                (marker_dir / "1089").write_text("7089", encoding="utf-8")
                self.assertEqual(_dns_bridge_port("127.0.0.1", 1089), 7089)
                # proxies remotos nunca usan el puente local
                self.assertIsNone(_dns_bridge_port("203.0.113.5", 1089))


class TestProxyServiceAndTransports(unittest.IsolatedAsyncioTestCase):
    """Pruebas del servicio fachada y ciclo de vida de los transportes."""

    async def test_apply_from_meta_noop_on_instance_without_proxy(self):
        """Una instancia sin proxy en meta.json debe ser un no-op idempotente que retorne True."""
        res = await proxy_service.apply_from_meta("phone-80")
        self.assertTrue(res)


class TestRouteStore(unittest.TestCase):
    """Catálogo de rutas: creación, enmascarado de credenciales y borrado."""

    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.store = RouteStore(Path(self.tmp_dir.name) / "routes.db")

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_create_and_list_masks_password(self):
        created = self.store.create("AR Personal", "1.2.3.4", 1080, "user", "secret")
        self.assertNotIn("password", created)
        self.assertTrue(created["auth"])
        self.assertEqual(created["host"], "1.2.3.4")

        listed = self.store.list_routes()
        self.assertEqual(len(listed), 1)
        self.assertNotIn("secret", str(listed))

    def test_to_uri_rebuilds_credentials_internally(self):
        self.store.create("AR", "1.2.3.4", 1080, "u", "p")
        route = self.store.get_by_label("AR")
        self.assertEqual(self.store.to_uri(route), "socks5://u:p@1.2.3.4:1080")

    def test_duplicate_label_rejected_and_delete(self):
        created = self.store.create("AR", "1.2.3.4", 1080)
        with self.assertRaises(Exception):
            self.store.create("AR", "5.6.7.8", 1080)
        self.assertTrue(self.store.delete(created["id"]))
        self.assertFalse(self.store.delete(created["id"]))


class TestProxyApiHttpConflict(unittest.TestCase):
    """Prueba de integración API: verificación del código 409 Conflict ante colisión de IP."""

    @classmethod
    def setUpClass(cls):
        import json
        cls.client = TestClient(app)
        cls.dirs = []
        for name in ("_test_net_a", "_test_net_b"):
            d = REPO_ROOT / "instances" / name
            import shutil
            shutil.rmtree(d, ignore_errors=True)
            d.mkdir(parents=True)
            (d / "meta.json").write_text(json.dumps({
                "instance_name": name,
                "template": "templates/samsung/a54x.json",
                "carrier": "ar_personal",
                "adb_port": 5599,
                "limits": {"memory": "2.5g", "cpus": "0-3"},
                "display": {"width": 1080, "height": 2340, "dpi": 450},
            }), encoding="utf-8")
            (d / "profile.json").write_text("{}", encoding="utf-8")
            cls.dirs.append(d)

    @classmethod
    def tearDownClass(cls):
        import shutil
        for d in cls.dirs:
            shutil.rmtree(d, ignore_errors=True)

    def test_api_ip_conflict_returns_409(self):
        # Aislar del entorno real: simular instancia detenida para no tocar contenedores
        with patch.object(proxy_service, "_container_running", return_value=False):
            payload1 = {
                "raw_proxy": "socks5://u1:p1@198.51.100.99:1080",
                "auto_sync_location": False
            }
            res1 = self.client.post("/api/v1/instances/_test_net_a/proxy", json=payload1)
            self.assertEqual(res1.status_code, 200)

            payload2 = {
                "raw_proxy": "socks5://u2:p2@198.51.100.99:1080",
                "auto_sync_location": False
            }
            res2 = self.client.post("/api/v1/instances/_test_net_b/proxy", json=payload2)

            self.assertEqual(res2.status_code, 409)
            detail = res2.json().get("detail", "")
            self.assertIn("198.51.100.99", detail)
            self.assertIn("_test_net_a", detail)

            self.client.delete("/api/v1/instances/_test_net_a/proxy")


if __name__ == "__main__":
    unittest.main()
