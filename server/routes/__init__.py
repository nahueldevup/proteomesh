"""
Routers de la API de ProteoMesh
"""
from server.routes.templates import router as templates_router
from server.routes.carriers import router as carriers_router
from server.routes.locations import router as locations_router
from server.routes.instances import router as instances_router

__all__ = [
    "templates_router",
    "carriers_router",
    "locations_router",
    "instances_router",
]
