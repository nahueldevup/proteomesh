"""
Tests para endpoints REST de Backups de Bundles (server/routes/backups.py)
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import pytest
from fastapi.testclient import TestClient

from server.config import BACKUPS_DIR
from server.main import app

client = TestClient(app)


def test_list_backups():
    """GET /api/v1/backups retorna lista de backups."""
    res = client.get("/api/v1/backups")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_create_verify_and_download_backup(tmp_path, monkeypatch):
    """Ciclo completo: creación, verificación, descarga y eliminación."""
    monkeypatch.setattr("server.routes.backups.BACKUPS_DIR", tmp_path)

    passphrase = "test_api_pass_123"

    # 1. Crear backup cifrado
    create_res = client.post(
        "/api/v1/backups",
        json={
            "passphrase": passphrase,
            "keep": 3,
            "no_encrypt": False,
            "include_db": False,
        },
    )
    assert create_res.status_code == 201
    data = create_res.json()
    assert "filename" in data
    assert data["encrypted"] is True
    assert data["cipher"] == "aes-256-cbc"
    filename = data["filename"]

    # 2. Listar y verificar que aparece
    list_res = client.get("/api/v1/backups")
    assert list_res.status_code == 200
    filenames = [b["filename"] for b in list_res.json()]
    assert filename in filenames

    # 3. Verificar con la frase correcta
    v_res = client.post(
        "/api/v1/backups/verify",
        json={"filename": filename, "passphrase": passphrase},
    )
    assert v_res.status_code == 200
    assert v_res.json()["valid"] is True

    # 4. Verificar con frase errónea falla con 400
    v_bad = client.post(
        "/api/v1/backups/verify",
        json={"filename": filename, "passphrase": "wrong_password"},
    )
    assert v_bad.status_code == 400

    # 5. Descargar backup
    dl_res = client.get(f"/api/v1/backups/{filename}/download")
    assert dl_res.status_code == 200
    assert dl_res.headers["content-type"] == "application/octet-stream"
    assert len(dl_res.content) > 0

    # 6. Eliminar backup
    del_res = client.delete(f"/api/v1/backups/{filename}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "ok"

    # Verificar que ya no existe
    list_res2 = client.get("/api/v1/backups")
    assert filename not in [b["filename"] for b in list_res2.json()]


def test_backup_path_traversal_protection():
    """Verifica rechazo de nombres de archivo inválidos o sospechosos con HTTP 400."""
    bad_filename = "malicious_script.sh"
    res_dl = client.get(f"/api/v1/backups/{bad_filename}/download")
    assert res_dl.status_code == 400
    assert "inválido" in res_dl.json()["detail"]

    res_del = client.delete(f"/api/v1/backups/{bad_filename}")
    assert res_del.status_code == 400

    res_ver = client.post("/api/v1/backups/verify", json={"filename": bad_filename})
    assert res_ver.status_code == 400


def test_restore_backup(tmp_path, monkeypatch):
    """Verifica restauración de un backup en destino especificado."""
    monkeypatch.setattr("server.routes.backups.BACKUPS_DIR", tmp_path)

    # Crear backup sin cifrar
    create_res = client.post(
        "/api/v1/backups",
        json={"no_encrypt": True, "include_db": False, "keep": 2},
    )
    assert create_res.status_code == 201
    filename = create_res.json()["filename"]

    # Restaurar en directorio de prueba
    restore_target = tmp_path / "restored_dir"
    restore_res = client.post(
        "/api/v1/backups/restore",
        json={"filename": filename, "restore_dest": str(restore_target)},
    )
    assert restore_res.status_code == 200
    assert restore_res.json()["status"] == "ok"
    assert restore_target.exists()
