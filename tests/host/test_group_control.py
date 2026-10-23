"""
Pruebas de endpoints de control de grupo (multi-touch y ciclo de vida masivo)
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from fastapi.testclient import TestClient
from server.main import app

client = TestClient(app)

GROUP_URL = "/api/v1/instances/group"


def test_group_tap_reports_per_instance_errors():
    """El tap de grupo debe responder 200 con un resultado por instancia (aunque fallen)."""
    response = client.post(f"{GROUP_URL}/input/tap", json={
        "instances": ["nonexistent-xyz", "nonexistent-abc"],
        "x": 100,
        "y": 200,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["action"] == "tap"
    assert data["total"] == 2
    assert data["succeeded"] == 0
    assert len(data["results"]) == 2
    assert all(r["ok"] is False for r in data["results"])
    assert all(r["error"] for r in data["results"])


def test_group_swipe_reports_per_instance_errors():
    """El swipe de grupo debe devolver resultados individuales."""
    response = client.post(f"{GROUP_URL}/input/swipe", json={
        "instances": ["nonexistent-xyz"],
        "x1": 10, "y1": 20, "x2": 300, "y2": 800,
        "duration_ms": 250,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["action"] == "swipe"
    assert data["total"] == 1
    assert data["results"][0]["ok"] is False


def test_group_key_reports_per_instance_errors():
    """La tecla de grupo debe devolver resultados individuales."""
    response = client.post(f"{GROUP_URL}/input/key", json={
        "instances": ["nonexistent-xyz"],
        "key": "home",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["action"] == "key"
    assert data["results"][0]["ok"] is False


def test_group_input_requires_instances():
    """La lista de instancias no puede estar vacía."""
    response = client.post(f"{GROUP_URL}/input/tap", json={"instances": [], "x": 1, "y": 2})
    assert response.status_code == 422


def test_group_lifecycle_rejects_invalid_action():
    """Acciones de ciclo de vida no permitidas deben responder 400."""
    response = client.post(f"{GROUP_URL}/destroy", json={"instances": ["nonexistent-xyz"]})
    assert response.status_code == 400


def test_group_lifecycle_reports_errors():
    """Stop masivo con nombre inválido reporta el error por instancia."""
    response = client.post(f"{GROUP_URL}/stop", json={"instances": ["INVALID NAME"]})
    assert response.status_code == 200
    data = response.json()
    assert data["action"] == "stop"
    assert data["total"] == 1
    assert data["results"][0]["ok"] is False
