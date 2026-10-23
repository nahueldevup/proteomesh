"""
Rutas para geolocalización y selector de mapa
"""
from typing import Dict
from fastapi import APIRouter, HTTPException

from server.models.schemas import LocationSchema, LocationUpdate, LocationResponse
from server.services.manager_bridge import (
    get_all_locations,
    get_instance_location_sync,
    set_instance_location_sync,
)

router = APIRouter(prefix="/locations", tags=["Geolocalización GPS"])


@router.get("", response_model=Dict[str, LocationSchema], summary="Listar catálogo de presets de ubicación")
def list_location_presets():
    """Retorna los 20 presets de ciudades mundiales (coordenadas, altitud, precisión, timezone)."""
    return get_all_locations()


@router.get("/instances/{name}", response_model=LocationResponse, summary="Consultar ubicación de una instancia")
def get_location(name: str):
    """Consulta la ubicación de una instancia (en disco si está detenida, o en vivo si está corriendo)."""
    try:
        return get_instance_location_sync(name)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/instances/{name}", response_model=LocationResponse, summary="Actualizar ubicación (en caliente o en frío)")
def set_location(name: str, update: LocationUpdate):
    """Actualiza las coordenadas GPS. Si el contenedor corre, FakeGps las adopta en <1.5s sin reiniciar."""
    try:
        return set_instance_location_sync(name, update)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
