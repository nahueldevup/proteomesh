"""
Rutas para la gestión y persistencia de preferencias de la aplicación y el usuario.
"""
import re
from typing import Any, Dict
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from server.db.settings_store import settings_store

router = APIRouter(prefix="/settings", tags=["Configuración y Preferencias"])

# Valores de memoria permitidos (acepta: 512m, 2048m, 2.5g, 4g, etc.)
_MEMORY_PATTERN = re.compile(r"^\d+(\.\d+)?[mgkMGK]$")
# Presets de CPU definidos en el frontend (wizardTypes.ts)
_VALID_CPU_LIMITS = {"auto", "1", "2", "3", "4", "6", "8"}


class CreateDevicePreferences(BaseModel):
    is_dense: bool = Field(False, description="Activar modo denso ZRAM por defecto")
    memory_limit: str = Field("2.5g", description="Límite de memoria RAM por defecto")
    cpu_limit: str = Field("auto", description="Límite o pinning de CPU por defecto")
    start_immediately: bool = Field(True, description="Iniciar contenedor inmediatamente")

    @field_validator("memory_limit")
    @classmethod
    def validate_memory_limit(cls, v: str) -> str:
        if not _MEMORY_PATTERN.match(v):
            raise ValueError(
                f"memory_limit inválido: '{v}'. "
                "Use formato Docker válido: 512m, 2048m, 2.5g, 4g"
            )
        return v.lower()

    @field_validator("cpu_limit")
    @classmethod
    def validate_cpu_limit(cls, v: str) -> str:
        if v not in _VALID_CPU_LIMITS:
            raise ValueError(
                f"cpu_limit inválido: '{v}'. "
                f"Valores permitidos: {', '.join(sorted(_VALID_CPU_LIMITS))}"
            )
        return v


class SettingPayload(BaseModel):
    value: Any = Field(..., description="Valor del ajuste en formato JSON")


@router.get("", response_model=Dict[str, Any], summary="Obtener todas las configuraciones")
def get_all_settings() -> Dict[str, Any]:
    """Retorna todas las configuraciones persistidas en la base de datos."""
    return settings_store.get_all()


@router.get("/create-device", response_model=CreateDevicePreferences, summary="Obtener preferencias de creación de dispositivo")
def get_create_device_preferences() -> CreateDevicePreferences:
    """Retorna las preferencias guardadas para el modal de aprovisionamiento de CloudPhones."""
    raw = settings_store.get("create_device")
    if not raw or not isinstance(raw, dict):
        return CreateDevicePreferences()
    return CreateDevicePreferences(
        is_dense=bool(raw.get("is_dense", False)),
        memory_limit=str(raw.get("memory_limit", "2.5g")),
        cpu_limit=str(raw.get("cpu_limit", "auto")),
        start_immediately=bool(raw.get("start_immediately", True)),
    )


@router.put("/create-device", response_model=CreateDevicePreferences, summary="Guardar preferencias de creación de dispositivo")
def update_create_device_preferences(payload: CreateDevicePreferences) -> CreateDevicePreferences:
    """Guarda las preferencias para el modal de aprovisionamiento de CloudPhones."""
    data = payload.model_dump()
    settings_store.set("create_device", data)
    return payload


@router.get("/{key}", summary="Obtener una configuración específica")
def get_setting_by_key(key: str) -> Any:
    """Retorna el valor guardado para una clave dada."""
    val = settings_store.get(key)
    if val is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Configuración '{key}' no encontrada.",
        )
    return {"key": key, "value": val}


@router.put("/{key}", summary="Actualizar una configuración específica")
def set_setting_by_key(key: str, payload: SettingPayload) -> Any:
    """Actualiza o inserta el valor de una clave dada."""
    settings_store.set(key, payload.value)
    return {"key": key, "value": payload.value}
