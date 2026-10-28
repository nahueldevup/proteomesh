"""
Rutas para geolocalización y selector de mapa
"""
from typing import Dict, Any
from fastapi import APIRouter, HTTPException

from server.models.schemas import (
    LocationSchema,
    LocationUpdate,
    LocationResponse,
    DefaultLocationSchema,
    DefaultLocationUpdate,
    CustomLocationsCatalog,
    CustomLocationSchema,
    CustomLocationCreate,
    CustomLocationUpdate,
    LocationGroupSchema,
    LocationGroupCreate,
    LocationGroupUpdate,
    PinToggleRequest,
    PinnedPresetsUpdate,
)
from server.services.manager_bridge import (
    get_all_locations,
    get_instance_location_sync,
    set_instance_location_sync,
)
from server.services.custom_location_service import custom_location_service

router = APIRouter(prefix="/locations", tags=["Geolocalización GPS"])


# ── Ubicación General por Defecto del Sistema ────────────────────────────────

@router.get("/default", response_model=DefaultLocationSchema, summary="Consultar ubicación general por defecto")
def get_default_location():
    """Retorna la ubicación general configurada por defecto para nuevos contenedores y vistas de mapa."""
    return custom_location_service.get_default_location()


@router.put("/default", response_model=DefaultLocationSchema, summary="Configurar ubicación general por defecto")
def set_default_location(payload: DefaultLocationUpdate):
    """Establece la ubicación general por defecto del sistema (admite custom location, preset o coordenadas)."""
    try:
        data = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else payload.dict(exclude_unset=True)
        return custom_location_service.set_default_location(data)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Presets Globales ─────────────────────────────────────────────────────────

@router.get("", response_model=Dict[str, LocationSchema], summary="Listar catálogo de presets de ubicación")
def list_location_presets():
    """Retorna los 20 presets de ciudades mundiales (coordenadas, altitud, precisión, timezone)."""
    return get_all_locations()


# ── Ubicaciones Custom & Grupos de Geolocalización ───────────────────────────

@router.get("/custom", response_model=CustomLocationsCatalog, summary="Listar ubicaciones custom y grupos")
def list_custom_locations():
    """Retorna el catálogo de grupos de geolocalización y ubicaciones personalizadas."""
    return custom_location_service.get_catalog()


@router.post("/custom", response_model=CustomLocationSchema, summary="Crear ubicación custom")
def create_custom_location(payload: CustomLocationCreate):
    """Crea una nueva ubicación personalizada con coordenadas, nombre y grupo opcional."""
    try:
        data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        new_loc = custom_location_service.create_location(data)
        return new_loc
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/custom/{location_id}", response_model=CustomLocationSchema, summary="Actualizar ubicación custom")
def update_custom_location(location_id: str, payload: CustomLocationUpdate):
    """Actualiza los datos o coordenadas de una ubicación personalizada existente."""
    try:
        data = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else payload.dict(exclude_unset=True)
        updated = custom_location_service.update_location(location_id, data)
        return updated
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/custom/{location_id}", summary="Eliminar ubicación custom")
def delete_custom_location(location_id: str):
    """Elimina permanentemente una ubicación personalizada."""
    success = custom_location_service.delete_location(location_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Ubicación '{location_id}' no encontrada")
    return {"ok": True, "deleted": location_id}


@router.post("/toggle-pin", summary="Fijar o desfijar ubicación custom o preset en barra rápida")
def toggle_pin(payload: PinToggleRequest):
    """Permite fijar (pin) o desfijar (unpin) cualquier ubicación custom o preset mundial."""
    try:
        if payload.target_type == "custom":
            res = custom_location_service.toggle_custom_pin(payload.target_id, payload.pinned)
            return {"ok": True, "target_type": "custom", "location": res}
        else:
            pinned_presets = custom_location_service.toggle_preset_pin(payload.target_id, payload.pinned)
            return {"ok": True, "target_type": "preset", "pinned_presets": pinned_presets}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/pinned-presets", summary="Actualizar lista de presets mundiales fijados")
def update_pinned_presets(payload: PinnedPresetsUpdate):
    """Actualiza la lista de presets oficiales fijados en la barra rápida."""
    try:
        pinned = custom_location_service.set_pinned_presets(payload.pinned_presets)
        return {"ok": True, "pinned_presets": pinned}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/groups", response_model=LocationGroupSchema, summary="Crear grupo de geolocalizaciones")
def create_location_group(payload: LocationGroupCreate):
    """Crea un nuevo grupo de geolocalizaciones para categorizar ubicaciones custom."""
    try:
        data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        new_grp = custom_location_service.create_group(data)
        return new_grp
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/groups/{group_id}", response_model=LocationGroupSchema, summary="Actualizar grupo de geolocalizaciones")
def update_location_group(group_id: str, payload: LocationGroupUpdate):
    """Actualiza el nombre, color o descripción de un grupo."""
    try:
        data = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else payload.dict(exclude_unset=True)
        updated = custom_location_service.update_group(group_id, data)
        return updated
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/groups/{group_id}", summary="Eliminar grupo de geolocalizaciones")
def delete_location_group(group_id: str):
    """Elimina un grupo de geolocalizaciones y desasocia sus ubicaciones sin borrarlas."""
    success = custom_location_service.delete_group(group_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Grupo '{group_id}' no encontrado")
    return {"ok": True, "deleted": group_id}


# ── Geolocalización de Instancias ───────────────────────────────────────────

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
