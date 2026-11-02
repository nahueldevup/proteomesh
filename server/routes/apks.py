"""
Endpoints REST para el Repositorio Global de APKs (WEB-017)
===========================================================
- Subida segura de APKs con límite de 150 MB y detección de duplicados por sha256.
- Listado, borrado y marcado de APKs por defecto.
- Instalación en lote sobre instancias activas (concurrencia máxima 2).
"""
from typing import Any, Dict, List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from server.services.apk_repository import (
    apk_repository,
    ApkRepositoryError,
    ApkTooLargeError,
    DuplicateApkError,
    InvalidApkError,
    Aapt2NotFoundError,
)
from server.services.manager_bridge import _adb_serial

router = APIRouter(prefix="/apks", tags=["Repositorio de APKs"])


class SetDefaultApksRequest(BaseModel):
    ids: List[int] = Field(default_factory=list, description="IDs de APKs a marcar como por defecto")


class InstallApkRequest(BaseModel):
    apk_id: int = Field(..., description="ID del APK en el repositorio")
    instances: List[str] = Field(..., min_length=1, description="Nombres de instancias destino")


def _chunk_reader(upload_file: UploadFile, chunk_size: int = 8192):
    """Generador síncrono que lee el UploadFile por bloques sin cargarlo todo en memoria."""
    while True:
        chunk = upload_file.file.read(chunk_size)
        if not chunk:
            break
        yield chunk


@router.get("", response_model=List[Dict[str, Any]], summary="Listar APKs del repositorio")
def list_apks():
    """Devuelve todos los APKs indexados con metadatos extraídos por aapt2."""
    return apk_repository.list_apks()


@router.post("", status_code=201, response_model=Dict[str, Any], summary="Subir un APK al repositorio")
async def upload_apk(
    file: UploadFile = File(..., description="Archivo APK a subir"),
):
    """Sube un APK, valida firma ZIP y metadatos, y lo guarda nombrado por sha256."""
    try:
        result = apk_repository.upload_apk(file.filename or "unknown.apk", _chunk_reader(file))
        return result
    except ApkTooLargeError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except DuplicateApkError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except InvalidApkError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Aapt2NotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ApkRepositoryError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{apk_id}", response_model=Dict[str, str], summary="Eliminar un APK del repositorio")
def delete_apk(apk_id: int):
    """Elimina la entrada del índice y el archivo en disco."""
    if not apk_repository.delete_apk(apk_id):
        raise HTTPException(status_code=404, detail="APK no encontrado")
    return {"status": "ok", "message": "APK eliminado"}


@router.post("/defaults", response_model=Dict[str, Any], summary="Definir APKs por defecto")
def set_default_apks(req: SetDefaultApksRequest):
    """Desmarca todos los APKs y marca los IDs indicados como instalables por defecto."""
    marked = apk_repository.set_default_apks(req.ids)
    return {"status": "ok", "marked": marked}


@router.post("/install", response_model=List[Dict[str, Any]], summary="Instalar APK en instancias")
async def install_apk(req: InstallApkRequest):
    """Instala un APK en varias instancias. Las detenidas se reportan como 'skipped'."""
    apk = apk_repository.get_apk(req.apk_id)
    if not apk:
        raise HTTPException(status_code=404, detail="APK no encontrado")

    apk_path = apk_repository.get_apk_path(apk["sha256"])
    if not apk_path.exists():
        raise HTTPException(status_code=404, detail="Archivo APK no encontrado en disco")

    try:
        return await apk_repository.install_to_instances(apk_path, req.instances, _adb_serial)
    except ApkRepositoryError as e:
        raise HTTPException(status_code=500, detail=str(e))
