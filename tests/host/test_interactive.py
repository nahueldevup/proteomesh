"""
Pruebas de endpoints para control interactivo y visualización de pantalla
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from fastapi.testclient import TestClient
from server.main import app

client = TestClient(app)

def test_screen_endpoint_running_or_stopped():
    """Verifica que el endpoint de pantalla responda 200 si corre o 404 si está offline."""
    response = client.get("/api/v1/instances/f05-main/screen?format=jpeg")
    assert response.status_code in (200, 404)
    if response.status_code == 200:
        assert response.headers["content-type"] == "image/jpeg"
        assert len(response.content) > 100

def test_screen_endpoint_nonexistent():
    """Instancia inexistente debe retornar 404."""
    response = client.get("/api/v1/instances/nonexistent-xyz/screen")
    assert response.status_code == 404

def test_input_key_validation():
    """Endpoint de teclas debe validar body."""
    response = client.post("/api/v1/instances/nonexistent-xyz/input/key", json={"key": "home"})
    assert response.status_code == 400

def test_input_tap_validation():
    """Endpoint de tap debe validar coordenadas."""
    response = client.post("/api/v1/instances/nonexistent-xyz/input/tap", json={"x": 100, "y": 200})
    assert response.status_code == 400

def test_input_text_validation():
    """Endpoint de texto debe validar body."""
    response = client.post("/api/v1/instances/nonexistent-xyz/input/text", json={"text": "test"})
    assert response.status_code == 400

def test_launch_scrcpy_nonexistent():
    """Lanzar scrcpy en instancia inexistente o detenida debe responder error."""
    response = client.post("/api/v1/instances/nonexistent-xyz/scrcpy")
    assert response.status_code in (400, 404)
