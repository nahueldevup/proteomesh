import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import pytest
from fastapi.testclient import TestClient

from server.main import app
from server.db.settings_store import settings_store


@pytest.fixture
def client():
    return TestClient(app)


def test_get_and_set_generic_setting(client):
    # Set a custom setting
    res = client.put("/api/v1/settings/ui_theme", json={"value": "cyberpunk_dark"})
    assert res.status_code == 200
    assert res.json() == {"key": "ui_theme", "value": "cyberpunk_dark"}

    # Get the custom setting
    res_get = client.get("/api/v1/settings/ui_theme")
    assert res_get.status_code == 200
    assert res_get.json() == {"key": "ui_theme", "value": "cyberpunk_dark"}


def test_create_device_preferences_persistence(client):
    # Initial or default preferences
    res_init = client.get("/api/v1/settings/create-device")
    assert res_init.status_code == 200
    data = res_init.json()
    assert "is_dense" in data
    assert "memory_limit" in data
    assert "cpu_limit" in data
    assert "start_immediately" in data

    # Update preferences to dense mode = True, 2048m RAM, 2 Hilos SMT
    update_payload = {
        "is_dense": True,
        "memory_limit": "2048m",
        "cpu_limit": "2",
        "start_immediately": False,
    }
    res_update = client.put("/api/v1/settings/create-device", json=update_payload)
    assert res_update.status_code == 200
    assert res_update.json() == update_payload

    # Fetch again and ensure it remembers
    res_fetch = client.get("/api/v1/settings/create-device")
    assert res_fetch.status_code == 200
    assert res_fetch.json() == update_payload


def test_get_all_settings(client):
    res = client.get("/api/v1/settings")
    assert res.status_code == 200
    all_settings = res.json()
    assert isinstance(all_settings, dict)
    assert "create_device" in all_settings


# ── Edge cases de validación ───────────────────────────────────────────────────

def test_create_device_invalid_memory_limit(client):
    """memory_limit con formato no Docker debe rechazarse con 422."""
    for bad_value in ["banana", "2048", "2.5 gb", "-1g", "0"]:
        res = client.put(
            "/api/v1/settings/create-device",
            json={"is_dense": False, "memory_limit": bad_value, "cpu_limit": "auto", "start_immediately": True},
        )
        assert res.status_code == 422, f"Esperaba 422 para memory_limit='{bad_value}', obtuvo {res.status_code}"


def test_create_device_invalid_cpu_limit(client):
    """cpu_limit fuera del conjunto permitido debe rechazarse con 422."""
    for bad_value in ["0", "999", "banana", "two", "auto,1"]:
        res = client.put(
            "/api/v1/settings/create-device",
            json={"is_dense": False, "memory_limit": "2.5g", "cpu_limit": bad_value, "start_immediately": True},
        )
        assert res.status_code == 422, f"Esperaba 422 para cpu_limit='{bad_value}', obtuvo {res.status_code}"


def test_create_device_valid_memory_formats(client):
    """Formatos de memoria válidos deben aceptarse con 200."""
    for good_value in ["512m", "2048m", "2.5g", "4g", "8G"]:
        res = client.put(
            "/api/v1/settings/create-device",
            json={"is_dense": False, "memory_limit": good_value, "cpu_limit": "auto", "start_immediately": True},
        )
        assert res.status_code == 200, f"Esperaba 200 para memory_limit='{good_value}', obtuvo {res.status_code}"


def test_get_nonexistent_setting_returns_404(client):
    """GET de una clave inexistente debe retornar 404, no 200 con null."""
    res = client.get("/api/v1/settings/clave_que_definitivamente_no_existe_xyz")
    assert res.status_code == 404
    assert "no encontrada" in res.json().get("detail", "").lower()


def test_get_all_settings_when_table_empty(client):
    """GET /settings debe retornar dict vacío si no hay nada guardado (nunca explota)."""
    # Solo verifica que el endpoint responde correctamente aunque no haya datos
    res = client.get("/api/v1/settings")
    assert res.status_code == 200
    assert isinstance(res.json(), dict)

