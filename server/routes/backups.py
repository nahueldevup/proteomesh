"""
Router de Gestión de Backups de Bundles e Identidades Congeladas (API v1).
========================================================================
Provee endpoints REST para listar, crear, verificar, restaurar, descargar
y depurar backups de hardware de alto valor con cifrado AES-256.
"""
from __future__ import annotations

import datetime
import logging
import os
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from server.config import BACKUPS_DIR, BACKUP_SCRIPT_PATH

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backups", tags=["Backups de Bundles"])

FILENAME_RE = re.compile(r"^proteomesh-bundles-[a-zA-Z0-9_.-]+\.tar\.gz(\.enc)?$")


def _format_size(size_bytes: int) -> str:
    """Retorna tamaño humanizado (KB, MB, GB)."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


class BackupItem(BaseModel):
    filename: str = Field(..., description="Nombre del archivo de backup")
    size_bytes: int = Field(..., description="Tamaño en bytes")
    size_human: str = Field(..., description="Tamaño legible para humanos")
    modified_at: str = Field(..., description="Fecha de última modificación en ISO 8601")
    encrypted: bool = Field(..., description="True si está cifrado con OpenSSL")
    cipher: Optional[str] = Field(None, description="Algoritmo de cifrado utilizado")


class CreateBackupPayload(BaseModel):
    passphrase: Optional[str] = Field(None, description="Frase de paso opcional para cifrado")
    keep: int = Field(5, ge=0, le=100, description="Cantidad de backups a retener en rotación")
    no_encrypt: bool = Field(False, description="True para exportar archivo .tar.gz plano sin cifrado")
    include_db: bool = Field(True, description="True para incluir copia atómica de proteomesh.db")
    source: Optional[str] = Field(None, description="Ruta específica a respaldar (opcional)")


class VerifyBackupPayload(BaseModel):
    filename: str = Field(..., description="Nombre del archivo a verificar")
    passphrase: Optional[str] = Field(None, description="Frase de paso si el archivo está cifrado")


class RestoreBackupPayload(BaseModel):
    filename: str = Field(..., description="Nombre del archivo a restaurar")
    restore_dest: str = Field(..., description="Directorio de destino en el host")
    passphrase: Optional[str] = Field(None, description="Frase de paso si el archivo está cifrado")


def _validate_filename(filename: str) -> Path:
    """Verifica que el nombre de archivo sea seguro y exista dentro de BACKUPS_DIR."""
    if not FILENAME_RE.fullmatch(filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nombre de archivo inválido o sospechoso: {filename}",
        )
    target = BACKUPS_DIR / filename
    if not target.exists() or not target.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El backup '{filename}' no existe en {BACKUPS_DIR}.",
        )
    return target


@router.get("", response_model=List[BackupItem], summary="Listar backups disponibles")
def list_backups() -> List[BackupItem]:
    """Retorna la lista de backups generados, ordenados del más reciente al más antiguo."""
    if not BACKUPS_DIR.exists():
        return []

    items: List[BackupItem] = []
    for entry in BACKUPS_DIR.iterdir():
        if not entry.is_file():
            continue
        if not FILENAME_RE.fullmatch(entry.name):
            continue

        st = entry.stat()
        mtime = datetime.datetime.fromtimestamp(st.st_mtime, tz=datetime.timezone.utc).isoformat()
        is_enc = entry.name.endswith(".enc")

        items.append(
            BackupItem(
                filename=entry.name,
                size_bytes=st.st_size,
                size_human=_format_size(st.st_size),
                modified_at=mtime,
                encrypted=is_enc,
                cipher="aes-256-cbc" if is_enc else None,
            )
        )

    # Ordenar más recientes primero
    items.sort(key=lambda x: x.modified_at, reverse=True)
    return items


@router.post("", response_model=BackupItem, status_code=status.HTTP_201_CREATED, summary="Crear nuevo backup")
def create_backup(payload: CreateBackupPayload) -> BackupItem:
    """Ejecuta el script de empaquetado de identidades y bundles."""
    if not BACKUP_SCRIPT_PATH.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Script de backup no encontrado en {BACKUP_SCRIPT_PATH}",
        )

    cmd = [str(BACKUP_SCRIPT_PATH), "--dest", str(BACKUPS_DIR), "--keep", str(payload.keep)]
    if payload.no_encrypt:
        cmd.append("--no-encrypt")
    elif payload.passphrase:
        cmd.extend(["--pass", payload.passphrase])

    if not payload.include_db:
        cmd.append("--no-db")

    if payload.source:
        cmd.extend(["--source", payload.source])

    env = os.environ.copy()
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
            env=env,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Tiempo de espera agotado al ejecutar backup",
        )

    if proc.returncode != 0:
        logger.error("Error al ejecutar backup_bundles.sh: %s", proc.stderr)
        err_msg = proc.stderr.strip() or proc.stdout.strip() or "Error desconocido durante backup"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo al generar backup: {err_msg}",
        )

    # Identificar el archivo más reciente generado en BACKUPS_DIR
    current_backups = list_backups()
    if not current_backups:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="El script finalizó pero no se encontró el archivo de backup generado",
        )

    return current_backups[0]


@router.get("/{filename}/download", summary="Descargar archivo de backup")
def download_backup(filename: str):
    """Descarga el archivo tar.gz / tar.gz.enc al navegador."""
    target_path = _validate_filename(filename)
    return FileResponse(
        path=str(target_path),
        filename=filename,
        media_type="application/octet-stream",
    )


@router.delete("/{filename}", summary="Eliminar archivo de backup")
def delete_backup(filename: str) -> Dict[str, Any]:
    """Elimina permanentemente un backup de bundles."""
    target_path = _validate_filename(filename)
    try:
        target_path.unlink()
        return {"status": "ok", "deleted": filename}
    except Exception as e:
        logger.error("Error al eliminar backup %s: %s", filename, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"No se pudo eliminar el backup: {e}",
        )


@router.post("/verify", summary="Verificar integridad y descifrado de backup")
def verify_backup(payload: VerifyBackupPayload) -> Dict[str, Any]:
    """Verifica en frío un archivo de backup con su frase de paso sin extraerlo."""
    target_path = _validate_filename(payload.filename)

    cmd = [str(BACKUP_SCRIPT_PATH), "--verify", str(target_path)]
    if payload.passphrase:
        cmd.extend(["--pass", payload.passphrase])

    proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=60)
    if proc.returncode != 0:
        err = proc.stderr.strip() or "Frase de paso incorrecta o archivo de backup corrupto"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err,
        )

    return {
        "status": "ok",
        "valid": True,
        "filename": payload.filename,
        "message": proc.stdout.strip(),
    }


@router.post("/restore", summary="Restaurar backup en directorio")
def restore_backup(payload: RestoreBackupPayload) -> Dict[str, Any]:
    """Restaura los contenidos de un backup en el destino indicado."""
    target_path = _validate_filename(payload.filename)

    cmd = [
        str(BACKUP_SCRIPT_PATH),
        "--restore",
        str(target_path),
        "--restore-dest",
        payload.restore_dest,
    ]
    if payload.passphrase:
        cmd.extend(["--pass", payload.passphrase])

    proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=120)
    if proc.returncode != 0:
        err = proc.stderr.strip() or "Fallo al restaurar backup"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err,
        )

    return {
        "status": "ok",
        "filename": payload.filename,
        "restore_dest": payload.restore_dest,
        "message": proc.stdout.strip(),
    }
