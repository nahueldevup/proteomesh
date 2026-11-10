"""
Configuración del Backend FastAPI de ProteoMesh
"""
import os
from pathlib import Path
from typing import List

REPO_ROOT = Path(__file__).resolve().parents[1]
TOOLS_DIR = REPO_ROOT / "tools"
TEMPLATES_DIR = REPO_ROOT / "templates"
CARRIERS_DIR = REPO_ROOT / "carriers"
INSTANCES_DIR = REPO_ROOT / "instances"
BUNDLES_DIR = REPO_ROOT / "bundles"
DATA_CLEAN_DIR = REPO_ROOT / "data-clean"
CUSTOM_LOCATIONS_FILE = REPO_ROOT / "custom_locations.json"
PROTEOMESH_DB_PATH = Path(os.getenv("PROTEOMESH_DB_PATH", str(INSTANCES_DIR / "proteomesh.db")))

# Repositorio global de APKs (WEB-017 / Bundles)
APK_REPO_DIR = REPO_ROOT / "apk_repo"
APKS_DB_PATH = Path(os.getenv("APKS_DB_PATH", str(PROTEOMESH_DB_PATH)))
APK_MAX_SIZE_BYTES = int(os.getenv("PROTEOMESH_MAX_APK_SIZE_MB", "300")) * 1024 * 1024
APK_MAX_UNCOMPRESSED_BYTES = APK_MAX_SIZE_BYTES * 2  # 600 MB por defecto
AAPT2_CANDIDATES = [
    REPO_ROOT / ".probe" / "aapt2",
    Path("/tmp/proteomesh_stubs/tools/aapt2"),
]

# Gestor de archivos de instancia (WEB-017)
ALLOWED_FILE_ROOTS = [
    "/sdcard/Download",
    "/sdcard/DCIM",
    "/sdcard/Pictures",
    "/sdcard/Documents",
    "/sdcard/Movies",
    "/sdcard/Music",
    "/sdcard/Recordings",
]

def resolve_aapt2_path() -> Path:
    """Devuelve la primera ruta ejecutable de aapt2 disponible."""
    for candidate in AAPT2_CANDIDATES:
        if candidate.exists() and candidate.is_file():
            return candidate
    raise FileNotFoundError("aapt2 no encontrado")

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

# Configuración de Red USB (NET-USB-001)
USB_ROTATE_MAX_ATTEMPTS = 5
USB_IP_TTL_DEFAULT = "7d"
USB_MOBILE_FORCE_DATA = True
PM_ENABLE_SOCKS5_UI = False
