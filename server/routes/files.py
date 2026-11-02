"""
Endpoints REST para el Gestor de Archivos de Instancia (WEB-017)
================================================================
Operaciones de listado, subida, descarga, borrado y transferencia entre
instancias, restringidas a ALLOWED_FILE_ROOTS.
"""
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Query, UploadFile, File as FastAPIFile
from pydantic import BaseModel, Field

from server.services.file_manager import (
    allowed_roots,
    delete_file,
    download_file,
    list_files,
    send_file,
    upload_file,
    FileManagerError,
    PathValidationError,
    FileEntry,
)

router = APIRouter(prefix="/files", tags=["Gestor de Archivos"])


class SendFileRequest(BaseModel):
    source_instance: str = Field(..., description="Instancia origen")
    source_path: str = Field(..., description="Ruta completa del archivo origen")
    target_instance: str = Field(..., description="Instancia destino")
    target_path: str = Field(..., description="Directorio destino dentro de una raíz permitida")


@router.get("/roots", response_model=List[Dict[str, Any]], summary="Raíces permitidas resueltas")
def get_roots(instance: str = Query(..., description="Nombre de la instancia")):
    """Devuelve las raíces de archivos permitidas con su realpath en el teléfono."""
    try:
        return allowed_roots(instance)
    except FileManagerError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=List[Dict[str, Any]], summary="Listar archivos y directorios")
def get_files(
    instance: str = Query(..., description="Nombre de la instancia"),
    path: str = Query(..., description="Ruta de directorio permitida"),
):
    """Lista entradas de un directorio usando find -print0 + stat."""
    try:
        entries = list_files(instance, path)
        return [
            {
                "name": e.name,
                "path": e.path,
                "type": e.type,
                "size": e.size,
                "mtime": e.mtime,
            }
            for e in entries
        ]
    except PathValidationError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except FileManagerError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload", response_model=Dict[str, Any], summary="Subir archivo a una instancia")
async def post_upload(
    instance: str = Query(..., description="Nombre de la instancia"),
    path: str = Query(..., description="Directorio destino permitido"),
    file: UploadFile = FastAPIFile(..., description="Archivo a subir"),
):
    """Sube un archivo al directorio indicado, evitando sobrescribir."""
    try:
        content = await file.read()
        result = upload_file(instance, path, file.filename or "upload", content)
        return {
            "name": result.name,
            "path": result.path,
            "type": result.type,
            "size": result.size,
            "mtime": result.mtime,
        }
    except PathValidationError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except FileManagerError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/download", summary="Descargar archivo de una instancia")
def get_download(
    instance: str = Query(..., description="Nombre de la instancia"),
    path: str = Query(..., description="Ruta completa del archivo"),
):
    """Descarga un archivo mediante `adb exec-out cat` y lo devuelve como bytes."""
    try:
        data = download_file(instance, path)
        from fastapi.responses import Response

        filename = path.split("/")[-1] or "download"
        return Response(
            content=data,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except PathValidationError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except FileManagerError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("", response_model=Dict[str, str], summary="Eliminar archivo")
def delete_file_endpoint(
    instance: str = Query(..., description="Nombre de la instancia"),
    path: str = Query(..., description="Ruta completa del archivo"),
):
    """Elimina un archivo regular dentro de una ruta permitida."""
    try:
        return delete_file(instance, path)
    except PathValidationError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except FileManagerError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/send-to", response_model=Dict[str, Any], summary="Enviar archivo a otra instancia")
def send_file_endpoint(req: SendFileRequest):
    """Transfiere un archivo entre dos instancias usando un temporal local."""
    try:
        result = send_file(
            req.source_instance,
            req.source_path,
            req.target_instance,
            req.target_path,
        )
        return {
            "name": result.name,
            "path": result.path,
            "type": result.type,
            "size": result.size,
            "mtime": result.mtime,
        }
    except PathValidationError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except FileManagerError as e:
        raise HTTPException(status_code=400, detail=str(e))
