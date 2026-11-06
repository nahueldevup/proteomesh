"""
Endpoints REST para el Repositorio Global de APKs y Bundles (WEB-017 / Bundles)
================================================================================
- Subida segura de APKs y Bundles (.apk, .apkm, .xapk, .apks, .zip) con límite dinámico.
- Detección de duplicados por sha256 y persistencia híbrida (archivo o carpeta de splits).
- Listado, borrado y marcado de APKs por defecto.
- Instalación en lote sobre instancias activas (concurrencia máxima 2).
"""
import asyncio
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


@router.get("/installed", response_model=Dict[str, List[str]], summary="Mapa de paquetes instalados por instancia")
async def get_installed_packages():
    """
    Retorna un diccionario { package_name: [instance_name, ...] }
    consultando en paralelo las instancias activas vía adb shell pm list packages.
    """
    from server.services.manager_bridge import get_instances_list
    instances = get_instances_list()
    running_instances = [i.instance_name for i in instances if i.running]
    if not running_instances:
        return {}

    async def get_packages_for_instance(name: str):
        serial = _adb_serial(name)
        if not serial:
            return name, set()
        try:
            proc = await asyncio.create_subprocess_exec(
                "adb", "-s", serial, "shell", "pm", "list", "packages",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=3.0)
            if proc.returncode == 0:
                pkgs = {line.replace("package:", "").strip() for line in stdout.decode().splitlines() if line.strip()}
                return name, pkgs
        except Exception:
            pass
        return name, set()

    results = await asyncio.gather(*[get_packages_for_instance(n) for n in running_instances])

    pkg_map: Dict[str, List[str]] = {}
    for name, pkgs in results:
        for pkg in pkgs:
            if pkg not in pkg_map:
                pkg_map[pkg] = []
            pkg_map[pkg].append(name)

    return pkg_map


@router.post("", status_code=201, response_model=Dict[str, Any], summary="Subir un APK o Bundle al repositorio")
async def upload_apk(
    file: UploadFile = File(..., description="Archivo APK o Bundle a subir (.apk, .apkm, .xapk, .apks, .zip)"),
):
    """Sube un APK o Bundle, valida firma ZIP, metadatos y seguridad, y lo guarda nombrado por sha256."""
    try:
        result = await asyncio.to_thread(
            apk_repository.upload_apk,
            file.filename or "unknown.apk",
            _chunk_reader(file),
        )
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


@router.post("/install", response_model=List[Dict[str, Any]], summary="Instalar APK o Bundle en instancias")
async def install_apk(req: InstallApkRequest):
    """Instala un APK o Bundle en varias instancias. Las detenidas se reportan como 'skipped'."""
    apk = apk_repository.get_apk(req.apk_id)
    if not apk:
        raise HTTPException(status_code=404, detail="APK no encontrado")

    install_files = apk_repository.resolve_install_splits(apk["sha256"])
    if not install_files:
        raise HTTPException(status_code=404, detail="Archivo APK o Bundle no encontrado en disco")

    try:
        return await apk_repository.install_to_instances(install_files, req.instances, _adb_serial)
    except ApkRepositoryError as e:
        raise HTTPException(status_code=500, detail=str(e))
