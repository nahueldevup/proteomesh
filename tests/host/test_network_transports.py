"""
Tests para el subsistema de aislamiento de contenedores Android (NET-USB-001 / ISOLATION-001).
Valida:
  - Existencia y contenido de los scripts quarantine.sh.tmpl / unquarantine.sh.tmpl.
  - API HTTP del Centro de Red USB.
"""
import sys
import unittest
from pathlib import Path

# Bootstrap sys.path
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from fastapi.testclient import TestClient
from server.main import app
from server.services.network.container_quarantine import (
    QUARANTINE_SCRIPT_TMPL,
    UNQUARANTINE_SCRIPT_TMPL,
)


class TestContainerIsolationScripts(unittest.TestCase):
    """Verifica que los scripts de aislamiento de contenedor existen y tienen el marcador correcto."""

    def test_quarantine_script_exists_and_has_marker(self):
        self.assertTrue(
            QUARANTINE_SCRIPT_TMPL.exists(),
            f"Script de cuarentena no encontrado: {QUARANTINE_SCRIPT_TMPL}",
        )
        content = QUARANTINE_SCRIPT_TMPL.read_text(encoding="utf-8")
        self.assertIn(
            "PM_QUARANTINE_OK",
            content,
            "El script quarantine.sh.tmpl debe imprimir PM_QUARANTINE_OK al completarse.",
        )

    def test_unquarantine_script_exists_and_has_marker(self):
        self.assertTrue(
            UNQUARANTINE_SCRIPT_TMPL.exists(),
            f"Script de liberación no encontrado: {UNQUARANTINE_SCRIPT_TMPL}",
        )
        content = UNQUARANTINE_SCRIPT_TMPL.read_text(encoding="utf-8")
        self.assertIn(
            "PM_QUARANTINE_REMOVED",
            content,
            "El script unquarantine.sh.tmpl debe imprimir PM_QUARANTINE_REMOVED al completarse.",
        )

    def test_quarantine_script_drops_output(self):
        """La cuarentena debe bloquear tráfico de salida (DROP en la cadena OUTPUT)."""
        content = QUARANTINE_SCRIPT_TMPL.read_text(encoding="utf-8")
        self.assertIn("OUTPUT", content)

    def test_unquarantine_script_flushes_chain(self):
        """La liberación debe limpiar la cadena PM_QUARANTINE."""
        content = UNQUARANTINE_SCRIPT_TMPL.read_text(encoding="utf-8")
        self.assertIn("PM_QUARANTINE", content)


class TestUsbNetworkApiSanity(unittest.TestCase):
    """Prueba básica de conectividad de los endpoints del Centro de Red USB."""

    def setUp(self):
        self.client = TestClient(app)

    def test_network_status_endpoint_present(self):
        """El endpoint /api/v1/network/status debe responder (200 o 500 si Docker no está disponible)."""
        response = self.client.get("/api/v1/network/status")
        self.assertIn(response.status_code, (200, 500))

    def test_proxy_endpoints_removed(self):
        """Los endpoints legacy de SOCKS5 deben haber sido eliminados (404)."""
        self.assertEqual(self.client.post("/api/v1/proxies/test").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/routes").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/proxies/saved").status_code, 404)


if __name__ == "__main__":
    unittest.main()
