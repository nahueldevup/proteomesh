"""
Rutas para ciclo de vida de instancias (CloudPhones)
"""
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException

from server.models.schemas import (
    InstanceCreateRequest,
    InstanceResponse,
    HealthReport,
)
from server.services.manager_bridge import (
    get_instances_list,
    get_single_instance,
    create_instance_async,
    start_instance_async,
    stop_instance_async,
    check_health_sync,
)

router = APIRouter(prefix="/instances", tags=["Instancias (CloudPhones)"])


@router.get("", response_model=List[InstanceResponse], summary="Listar todas las instancias")
def list_instances():
    """Retorna todas las instancias creadas con su estado en Docker, hardware y geolocalización."""
    return get_instances_list()


@router.post("", response_model=InstanceResponse, status_code=201, summary="Crear un nuevo CloudPhone")
async def create_instance(req: InstanceCreateRequest):
    """Aprovisiona una nueva instancia con identidad única (IMEI, MAC, Android ID) y ubicación."""
    try:
        return await create_instance_async(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{name}", response_model=InstanceResponse, summary="Obtener detalle de una instancia")
def get_instance(name: str):
    """Retorna los metadatos y estado actual de una instancia específica."""
    try:
        return get_single_instance(name)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{name}/start", response_model=Dict[str, Any], summary="Iniciar contenedor Docker de la instancia")
async def start_instance(name: str):
    """Inicia el contenedor aplicando CPU Pinning, memoria, 30 FPS y validando health-check."""
    try:
        return await start_instance_async(name)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{name}/stop", response_model=Dict[str, Any], summary="Detener contenedor Docker de la instancia")
async def stop_instance(name: str):
    """Detiene y elimina el contenedor Docker (los datos en /data se preservan intactos)."""
    try:
        return await stop_instance_async(name)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{name}/health", response_model=HealthReport, summary="Verificar salud de la instancia")
def get_health(name: str):
    """Ejecuta los 7 puntos de control de verificación post-arranque (Docker, Red, Boot, DenyList, Overrides)."""
    try:
        return check_health_sync(name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
