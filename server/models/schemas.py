"""
Schemas Pydantic para el API de ProteoMesh
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# ── Modelos de Ubicación Geográfica ──────────────────────────────────────────
class LocationSchema(BaseModel):
    city: str = Field(..., description="Nombre descriptivo de la ciudad")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitud decimal (-90.0 a 90.0)")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitud decimal (-180.0 a 180.0)")
    altitude: float = Field(default=25.0, description="Altitud en metros sobre el nivel del mar")
    accuracy: float = Field(default=4.2, description="Radio de precisión GPS simulado en metros")
    timezone: str = Field(default="America/Argentina/Buenos_Aires", description="Huso horario IANA")


class LocationUpdate(BaseModel):
    location: Optional[str] = Field(default=None, description="Preset (ej: miami, cordoba) o coordenadas 'lat,lon'")
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    altitude: Optional[float] = Field(default=None)
    city: Optional[str] = Field(default=None)
    timezone: Optional[str] = Field(default=None)


class LocationResponse(BaseModel):
    status: str = "ok"
    instance: str
    applied_live: bool = False
    is_live_query: bool = False
    running: bool = False
    location: LocationSchema


# ── Modelos de Operadoras Telefónicas ─────────────────────────────────────────
class CarrierSchema(BaseModel):
    id: str = Field(..., description="Identificador único (ej: ar_personal, us_verizon)")
    carrier_name: str = Field(..., description="Nombre comercial (ej: Personal, Verizon)")
    operator_numeric: str = Field(..., description="Código numérico MCC/MNC (ej: 72234, 311480)")
    country_iso: str = Field(..., description="Código de país ISO 3166-1 alpha-2 (ej: ar, us, es)")
    phone_type: str = Field(default="1", description="1=GSM, 2=CDMA")
    network_type: str = Field(default="13", description="13=LTE")
    imsi_prefix: Optional[str] = Field(default=None)
    iccid_prefix: Optional[str] = Field(default=None)
    phone_prefix: Optional[str] = Field(default="+1")
    timezone: str = Field(default="America/Argentina/Buenos_Aires")


# ── Modelos de Plantillas de Hardware ─────────────────────────────────────────
class TemplateItem(BaseModel):
    id: str = Field(..., description="Ruta relativa o id (ej: samsung/a54x)")
    name: str = Field(..., description="Nombre comercial del modelo")
    market_name: Optional[str] = None
    platform: Optional[str] = None
    soc_model: Optional[str] = None
    gpu_renderer: Optional[str] = None
    screen: Optional[str] = None


# ── Modelos de Recursos Docker ───────────────────────────────────────────────
class LimitsSchema(BaseModel):
    memory: Optional[str] = Field(default="2.5g", description="Límite de memoria RAM (ej: 2.5g, 4g, 2048m)")
    cpus: Optional[str] = Field(default="0-3", description="Asignación de CPU (ej: 0-3 para CPU pinning, o 2.0)")
    pids_limit: Optional[int] = Field(default=None, description="Límite de PIDs (recomendado: None o >=4096)")


# ── Modelos de Instancias (CloudPhones) ───────────────────────────────────────
class InstanceCreateRequest(BaseModel):
    name: str = Field(..., pattern=r"^[a-z0-9][a-z0-9_-]{0,62}$", description="Nombre único en minúsculas")
    template: Optional[str] = Field(default="samsung/a54x", description="Plantilla de hardware")
    from_bundle: Optional[str] = Field(default=None, description="Ruta a bundle pre-renderizado existente")
    carrier: Optional[str] = Field(default="ar_personal", description="ID de operadora registrada")
    custom_carrier: Optional[CarrierSchema] = Field(default=None, description="Operadora personalizada inline")
    location: Optional[str] = Field(default=None, description="Preset geográfico o 'lat,lon'")
    custom_location: Optional[LocationSchema] = Field(default=None, description="Ubicación geográfica explícita")
    port: int = Field(default=5580, ge=1024, le=65535, description="Puerto ADB en el host")
    seed: Optional[int] = Field(default=None, description="Semilla determinista")
    limits: Optional[LimitsSchema] = Field(default_factory=LimitsSchema)
    start: bool = Field(default=False, description="Arrancar inmediatamente tras crear")


class InstanceResponse(BaseModel):
    instance_name: str
    template: Optional[str] = None
    carrier: Optional[str] = None
    adb_port: int
    running: bool = False
    docker_status: Optional[str] = "Detenido (Offline)"
    location: Optional[LocationSchema] = None
    limits: Optional[Dict[str, Any]] = None
    identity: Optional[Dict[str, Any]] = None


class HealthReport(BaseModel):
    instance_name: str
    ok: bool
    reports: List[str]
