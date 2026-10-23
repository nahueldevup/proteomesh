"""
Configuración del Backend FastAPI de ProteoMesh
"""
from pathlib import Path
from typing import List

REPO_ROOT = Path(__file__).resolve().parents[1]
TOOLS_DIR = REPO_ROOT / "tools"
TEMPLATES_DIR = REPO_ROOT / "templates"
CARRIERS_DIR = REPO_ROOT / "carriers"
INSTANCES_DIR = REPO_ROOT / "instances"
BUNDLES_DIR = REPO_ROOT / "bundles"
DATA_CLEAN_DIR = REPO_ROOT / "data-clean"

API_PREFIX = "/api/v1"
API_TITLE = "ProteoMesh CloudPhone API"
API_VERSION = "1.0.0"
API_DESCRIPTION = (
    "API REST y WebSockets para la orquestación, gestión de hardware, "
    "geolocalización, proxies y streaming de CloudPhones ProteoMesh."
)

HOST = "127.0.0.1"
PORT = 8000
CORS_ORIGINS: List[str] = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "*",
]
