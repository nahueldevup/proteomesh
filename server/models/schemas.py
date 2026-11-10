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
    custom_name: Optional[str] = Field(default=None, description="Nombre personalizado si proviene de ubicación custom")
    custom_location_id: Optional[str] = Field(default=None, description="ID de la ubicación custom")
    group_name: Optional[str] = Field(default=None, description="Nombre del grupo si aplica")


class LocationUpdate(BaseModel):
    location: Optional[str] = Field(default=None, description="Preset, ID de ubicación custom, o coordenadas 'lat,lon'")
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    altitude: Optional[float] = Field(default=None)
    city: Optional[str] = Field(default=None)
    timezone: Optional[str] = Field(default=None)
    custom_name: Optional[str] = Field(default=None, description="Nombre personalizado asignado")
    custom_location_id: Optional[str] = Field(default=None, description="ID de ubicación custom")


class LocationGroupSchema(BaseModel):
    id: str = Field(..., description="Identificador único del grupo (ej: grp_oficinas)")
    name: str = Field(..., min_length=1, max_length=100, description="Nombre descriptivo del grupo")
    color: Optional[str] = Field(default="#10b981", description="Color distintivo en formato hexadecimal")
    description: Optional[str] = Field(default="", description="Descripción opcional del grupo")
    created_at: Optional[str] = None


class LocationGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: Optional[str] = "#10b981"
    description: Optional[str] = ""


class LocationGroupUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None


class DefaultLocationSchema(BaseModel):
    id: Optional[str] = Field(default=None, description="ID de ubicación custom o clave de preset")
    name: str = Field(..., description="Nombre de la ubicación predeterminada")
    city: str = Field(..., description="Ciudad descriptiva")
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    altitude: float = Field(default=25.0)
    accuracy: float = Field(default=4.2)
    timezone: str = Field(default="America/Argentina/Buenos_Aires")
    target_type: Optional[str] = Field(default=None, description="'custom' o 'preset'")


class DefaultLocationUpdate(BaseModel):
    target_type: Optional[str] = Field(default=None, description="'custom' o 'preset'")
    target_id: Optional[str] = Field(default=None, description="ID de custom location o clave de preset (ej: 'ba')")
    name: Optional[str] = None
    city: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    altitude: Optional[float] = None
    accuracy: Optional[float] = None
    timezone: Optional[str] = None


class CustomLocationSchema(BaseModel):
    id: str = Field(..., description="Identificador único de la ubicación custom")
    name: str = Field(..., min_length=1, max_length=100, description="Nombre personalizado (ej: Oficina Central, Depósito 3)")
    group_id: Optional[str] = Field(default=None, description="ID del grupo al que pertenece")
    city: str = Field(..., description="Ciudad o zona descriptiva")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitud decimal (-90.0 a 90.0)")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitud decimal (-180.0 a 180.0)")
    altitude: float = Field(default=25.0, description="Altitud en metros")
    accuracy: float = Field(default=4.2, description="Precisión GPS simulada en metros")
    timezone: str = Field(default="America/Argentina/Buenos_Aires", description="Huso horario IANA")
    is_pinned: bool = Field(default=False, description="Fijado como acceso rápido en barra GPS de instancias")
    radius_km: float = Field(default=1.0, ge=0.01, le=500.0, description="Radio de influencia en kilómetros")
    show_radius: bool = Field(default=True, description="Mostrar u ocultar el radio visual en el mapa")
    created_at: Optional[str] = None


class CustomLocationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    group_id: Optional[str] = None
    city: Optional[str] = None
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    altitude: Optional[float] = 25.0
    accuracy: Optional[float] = 4.2
    timezone: Optional[str] = "America/Argentina/Buenos_Aires"
    is_pinned: Optional[bool] = False
    radius_km: Optional[float] = Field(default=1.0, ge=0.01, le=500.0)
    show_radius: Optional[bool] = Field(default=True)


class CustomLocationUpdate(BaseModel):
    name: Optional[str] = None
    group_id: Optional[str] = None
    city: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    altitude: Optional[float] = None
    accuracy: Optional[float] = None
    timezone: Optional[str] = None
    is_pinned: Optional[bool] = None
    radius_km: Optional[float] = Field(default=None, ge=0.01, le=500.0)
    show_radius: Optional[bool] = None


class PinToggleRequest(BaseModel):
    target_type: str = Field(..., pattern="^(custom|preset)$", description="'custom' o 'preset'")
    target_id: str = Field(..., description="ID de ubicación custom o clave de preset (ej: 'ba')")
    pinned: Optional[bool] = Field(default=None, description="Estado fijado explícito o toggle si es None")


class PinnedPresetsUpdate(BaseModel):
    pinned_presets: List[str] = Field(..., description="Lista de claves de presets fijados")


class CustomLocationsCatalog(BaseModel):
    groups: List[LocationGroupSchema] = []
    locations: List[CustomLocationSchema] = []
    pinned_presets: List[str] = Field(
        default=["ba", "sao-paulo", "miami", "new-york"],
        description="Lista de presets globales fijados en la barra rápida"
    )
    default_location: Optional[DefaultLocationSchema] = Field(
        default=None,
        description="Ubicación predeterminada general configurada en el sistema"
    )


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
    memory: Optional[str] = Field(default="2560m", description="Límite de memoria RAM (ej: 2560m, 4g, 2048m)")
    cpus: Optional[str] = Field(default="0-3", description="Asignación de CPU (ej: 0-3 para CPU pinning, o 2.0)")
    pids_limit: Optional[int] = Field(default=None, description="Límite de PIDs (recomendado: None o >=4096)")


# ── Modelos de Control Interactivo y Pantalla ────────────────────────────────
class InputTapRequest(BaseModel):
    x: int = Field(..., ge=0, description="Coordenada X en resolución nativa de pantalla")
    y: int = Field(..., ge=0, description="Coordenada Y en resolución nativa de pantalla")

class InputSwipeRequest(BaseModel):
    x1: int = Field(..., ge=0)
    y1: int = Field(..., ge=0)
    x2: int = Field(..., ge=0)
    y2: int = Field(..., ge=0)
    duration_ms: int = Field(default=300, ge=50, le=5000, description="Duración del gesto en milisegundos")

class InputKeyRequest(BaseModel):
    key: str = Field(..., description="Nombre de tecla ('back', 'home', 'recents', 'power', 'volup', 'voldown', 'enter') o código numérico")

class InputTextRequest(BaseModel):
    text: str = Field(..., description="Cadena de texto para escribir en Android")

class LaunchUrlRequest(BaseModel):
    url: str = Field(..., description="Dirección web para abrir en el navegador de Android")

class ScrcpyLaunchResponse(BaseModel):
    status: str = "ok"
    instance: str
    adb_port: int
    message: str


class ScrcpyStreamInfo(BaseModel):
    available: bool
    provider: str = "ws-scrcpy"
    base_url: str
    udid: str
    player: str
    embed_url: str


# ── Modelos de Proxies Residenciales ─────────────────────────────────────────
class ProxyConfig(BaseModel):
    type: str = Field(default="socks5", description="Tipo de proxy ('socks5', 'http')")
    host: str = Field(..., description="Dirección IP o dominio del proxy")
    port: int = Field(..., ge=1, le=65535, description="Puerto del proxy")
    username: Optional[str] = Field(default=None, description="Usuario de autenticación")
    password: Optional[str] = Field(default=None, description="Contraseña de autenticación")

    @property
    def url(self) -> str:
        auth = f"{self.username}:{self.password}@" if self.username and self.password else ""
        return f"{self.type}://{auth}{self.host}:{self.port}"


class ProxyTestRequest(BaseModel):
    proxy_url: Optional[str] = Field(default=None, description="Cadena de proxy (ej: socks5://user:pass@ip:port o ip:port:user:pass)")
    raw: Optional[str] = Field(default=None, description="Alias para proxy_url")
    raw_proxy: Optional[str] = Field(default=None, description="Alias para proxy_url")
    type: Optional[str] = Field(default="socks5", description="Tipo por defecto si no viene en URL")
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None


class ProxyTestResponse(BaseModel):
    ok: bool
    ip: Optional[str] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    city: Optional[str] = None
    timezone: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    latency_ms: Optional[float] = None
    error: Optional[str] = None
    proxy: Optional[ProxyConfig] = None


class InstanceProxyUpdate(BaseModel):
    proxy: Optional[ProxyConfig] = Field(default=None, description="Configuración estructurada del proxy (None para remover)")
    raw_proxy: Optional[str] = Field(default=None, description="Cadena raw del proxy (ej: socks5://user:pass@host:port)")
    auto_sync_location: bool = Field(default=True, description="Sincronizar GPS y timezone automáticamente con la IP del proxy")


# ── Modelos de Instancias (CloudPhones) ───────────────────────────────────────
class InstanceCreateRequest(BaseModel):
    name: str = Field(..., pattern=r"^[a-z0-9][a-z0-9_-]{0,62}$", description="Nombre único en minúsculas")
    template: Optional[str] = Field(default="samsung/a54x", description="Plantilla de hardware")
    from_bundle: Optional[str] = Field(default=None, description="Ruta a bundle pre-renderizado existente")
    carrier: Optional[str] = Field(default="ar_personal", description="ID de operadora registrada")
    phone_number: Optional[str] = Field(default=None, description="Número de teléfono móvil asignado (ej: 3704123456 o +5493704123456)")
    custom_carrier: Optional[CarrierSchema] = Field(default=None, description="Operadora personalizada inline")
    location: Optional[str] = Field(default=None, description="Preset geográfico o 'lat,lon'")
    custom_location: Optional[LocationSchema] = Field(default=None, description="Ubicación geográfica explícita")
    proxy: Optional[ProxyConfig] = Field(default=None, description="Proxy residencial para la instancia")
    raw_proxy: Optional[str] = Field(default=None, description="Cadena raw de proxy para auto-parseo")
    port: int = Field(default=5580, ge=1024, le=65535, description="Puerto ADB en el host")
    seed: Optional[int] = Field(default=None, description="Semilla determinista")
    limits: Optional[LimitsSchema] = Field(default_factory=LimitsSchema)
    start: bool = Field(default=False, description="Arrancar inmediatamente tras crear")
    default_apks: Optional[List[int]] = Field(default=None, description="IDs opcionales de APKs a instalar tras el primer arranque")


class InstanceResponse(BaseModel):
    instance_name: str
    template: Optional[str] = None
    carrier: Optional[str] = None
    adb_port: int
    running: bool = False
    docker_status: Optional[str] = "Detenido (Offline)"
    location: Optional[LocationSchema] = None
    proxy: Optional[ProxyConfig] = None
    limits: Optional[Dict[str, Any]] = None
    identity: Optional[Dict[str, Any]] = None
    display: Optional[Dict[str, Any]] = None


class HealthReport(BaseModel):
    instance_name: str
    ok: bool
    reports: List[str]


# ── Modelos de Control de Grupo (Multi-Touch) ────────────────────────────────
class GroupInstancesRequest(BaseModel):
    instances: List[str] = Field(..., min_length=1, description="Lista de nombres de instancias")

class GroupTapRequest(GroupInstancesRequest):
    x: int = Field(..., ge=0)
    y: int = Field(..., ge=0)

class GroupSwipeRequest(GroupInstancesRequest):
    x1: int = Field(..., ge=0)
    y1: int = Field(..., ge=0)
    x2: int = Field(..., ge=0)
    y2: int = Field(..., ge=0)
    duration_ms: int = Field(default=300, ge=50, le=5000)

class GroupKeyRequest(GroupInstancesRequest):
    key: str = Field(..., description="Nombre de tecla o código numérico")

class GroupActionResult(BaseModel):
    instance: str
    ok: bool
    error: Optional[str] = None

class GroupActionResponse(BaseModel):
    status: str = "ok"
    action: str
    total: int
    succeeded: int
    results: List[GroupActionResult]
