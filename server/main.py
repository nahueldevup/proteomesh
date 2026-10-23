"""
ProteoMesh Platform API — Servidor Backend FastAPI
"""
import sys
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from server.config import (
    API_PREFIX,
    API_TITLE,
    API_VERSION,
    API_DESCRIPTION,
    CORS_ORIGINS,
    HOST,
    PORT,
)
from server.routes import (
    templates_router,
    carriers_router,
    locations_router,
    instances_router,
    proxies_router,
)

app = FastAPI(
    title=API_TITLE,
    version=API_VERSION,
    description=API_DESCRIPTION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# Configuración de CORS para navegadores y paneles web (Vite, Next.js, Electron)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Montaje de routers bajo el prefijo unificado /api/v1
app.include_router(instances_router, prefix=API_PREFIX)
app.include_router(templates_router, prefix=API_PREFIX)
app.include_router(carriers_router, prefix=API_PREFIX)
app.include_router(locations_router, prefix=API_PREFIX)
app.include_router(proxies_router, prefix=API_PREFIX)


@app.get("/", tags=["Estado del Servidor"])
def root():
    """Endpoint raíz con metadatos del servicio y enlaces a documentación."""
    return {
        "service": API_TITLE,
        "version": API_VERSION,
        "status": "online",
        "docs_url": "/docs",
        "api_v1_prefix": API_PREFIX,
        "endpoints": {
            "instances": f"{API_PREFIX}/instances",
            "templates": f"{API_PREFIX}/templates",
            "carriers": f"{API_PREFIX}/carriers",
            "locations": f"{API_PREFIX}/locations",
            "proxies": f"{API_PREFIX}/proxies/test",
        }
    }


@app.get("/health", tags=["Estado del Servidor"])
def health():
    """Health-check para balanceadores de carga y orquestadores."""
    return {"status": "healthy", "service": "proteomesh-api"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.main:app", host=HOST, port=PORT, reload=True)
