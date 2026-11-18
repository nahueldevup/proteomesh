"""
Routers de la API de ProteoMesh
"""
from server.routes.templates import router as templates_router
from server.routes.carriers import router as carriers_router
from server.routes.locations import router as locations_router
from server.routes.instances import router as instances_router
from server.routes.network import router as network_router
from server.routes.apks import router as apks_router
from server.routes.files import router as files_router
from server.routes.metrics import router as metrics_router
from server.routes.backups import router as backups_router
from server.routes.settings import router as settings_router

__all__ = [
    "templates_router",
    "carriers_router",
    "locations_router",
    "instances_router",
    "network_router",
    "apks_router",
    "files_router",
    "metrics_router",
    "backups_router",
    "settings_router",
]
