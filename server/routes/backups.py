"""
Router de Gestión de Backups de Bundles e Identidades Congeladas (API v1).
========================================================================
Provee endpoints REST para listar, crear, verificar, restaurar, descargar
y depurar backups de hardware de alto valor con cifrado AES-256.
"""
from __future__ import annotations

import datetime
import json
import logging
import os
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from server.config import BACKUPS_DIR, BACKUP_SCRIPT_PATH, REPO_ROOT, SETUP_SCHEDULE_SCRIPT_PATH

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
    restore_dest: Optional[str] = Field(
        None,
        description="Directorio de destino en el host. Por defecto restaura en el entorno activo de ProteoMesh.",
    )
    passphrase: Optional[str] = Field(None, description="Frase de paso si el archivo está cifrado")


class BackupScheduleStatus(BaseModel):
    active: bool
    frequency: str = Field("daily", description="daily o weekly")
    time: str = Field("03:00", description="Hora de ejecución en formato HH:MM")
    calendar_spec: Optional[str] = None
    keep: int = 5
    encrypted: bool = False
    next_run: Optional[str] = None
    last_run: Optional[str] = None


class UpdateBackupSchedulePayload(BaseModel):
    enabled: bool = Field(True, description="True para activar el timer, False para deshabilitarlo")
    frequency: str = Field("daily", description="Frecuencia: 'daily' o 'weekly'")
    time: str = Field("03:00", description="Hora de ejecución en formato HH:MM (ej. 03:00)")
    keep: int = Field(5, ge=1, le=100, description="Cantidad de copias a retener")
    no_encrypt: bool = Field(False, description="True para copias sin cifrar")
    passphrase: Optional[str] = Field(None, description="Contraseña para cifrado automático desatendido")


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
    """Restaura los contenidos de un backup en el destino indicado o en el entorno activo."""
    target_path = _validate_filename(payload.filename)

    dest_dir = Path(payload.restore_dest).resolve() if payload.restore_dest else REPO_ROOT
    dest_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        str(BACKUP_SCRIPT_PATH),
        "--restore",
        str(target_path),
        "--restore-dest",
        str(dest_dir),
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
        "restore_dest": str(dest_dir),
        "message": proc.stdout.strip(),
    }


# ── Automatización Periódica de Respaldos (Systemd Timer) ─────────────────────

@router.get("/schedule", response_model=BackupScheduleStatus, summary="Consultar estado de programación periódica")
def get_backup_schedule() -> BackupScheduleStatus:
    """Retorna el estado de la automatización periódica de backups en el host."""
    cmd = [str(SETUP_SCHEDULE_SCRIPT_PATH), "--status", "--json"]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=15)
    if proc.returncode != 0:
        logger.warning("Fallo al consultar status de schedule: %s", proc.stderr)
        return BackupScheduleStatus(active=False)

    try:
        data = json.loads(proc.stdout)
        return BackupScheduleStatus(**data)
    except Exception as exc:
        logger.error("Error parseando respuesta JSON de schedule: %s", exc)
        return BackupScheduleStatus(active=False)


@router.post("/schedule", response_model=BackupScheduleStatus, summary="Configurar programación periódica de backups")
def update_backup_schedule(payload: UpdateBackupSchedulePayload) -> BackupScheduleStatus:
    """Activa, modifica o desactiva la programación periódica desatendida."""
    if not payload.enabled:
        cmd = [str(SETUP_SCHEDULE_SCRIPT_PATH), "--disable"]
        if payload.frequency == "weekly":
            cmd.append("--weekly")
        elif payload.frequency == "daily":
            cmd.append("--daily")
        if payload.time and re.match(r"^([01][0-9]|2[0-3]):[0-5][0-9]$", payload.time):
            cmd.extend(["--time", payload.time])
        if payload.keep:
            cmd.extend(["--keep", str(payload.keep)])
        if payload.no_encrypt:
            cmd.append("--no-encrypt")
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=30)
        if proc.returncode != 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Fallo al deshabilitar timer: {proc.stderr.strip()}",
            )
        return get_backup_schedule()

    # Validar formato de hora HH:MM
    if not re.match(r"^([01][0-9]|2[0-3]):[0-5][0-9]$", payload.time):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Formato de hora inválido: '{payload.time}'. Use formato 24h HH:MM (ej. 03:00).",
        )

    cmd = [str(SETUP_SCHEDULE_SCRIPT_PATH), "--enable"]
    if payload.frequency == "weekly":
        cmd.append("--weekly")
    else:
        cmd.append("--daily")

    cmd.extend(["--time", payload.time])
    cmd.extend(["--keep", str(payload.keep)])

    if payload.no_encrypt:
        cmd.append("--no-encrypt")
    elif payload.passphrase:
        cmd.extend(["--save-pass", payload.passphrase])

    proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=30)
    if proc.returncode != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo al configurar timer: {proc.stderr.strip()}",
        )

    return get_backup_schedule()


@router.post("/schedule/trigger", summary="Disparar respaldo programado inmediatamente")
def trigger_backup_schedule_now() -> Dict[str, Any]:
    """Ejecuta de inmediato el servicio de respaldo para verificar su funcionamiento."""
    cmd = [str(SETUP_SCHEDULE_SCRIPT_PATH), "--trigger-now"]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=60)
    if proc.returncode != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo al ejecutar respaldo: {proc.stderr.strip()}",
        )

    return {
        "status": "ok",
        "message": proc.stdout.strip(),
    }


# ── Endpoints Parametrizados por Nombre de Archivo ────────────────────────────

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
