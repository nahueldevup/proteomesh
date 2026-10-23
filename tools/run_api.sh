#!/usr/bin/env bash
# ==============================================================================
# ProteoMesh — Lanzador del Servidor Backend FastAPI
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/.."
VENV_PYTHON="${REPO_ROOT}/.venv/bin/python"

if [ ! -f "${VENV_PYTHON}" ]; then
    echo "[!] Entorno virtual .venv no encontrado. Creando e instalando dependencias con uv..."
    "${HOME}/.local/bin/uv" venv "${REPO_ROOT}/.venv" --clear --python /usr/bin/python3
    "${HOME}/.local/bin/uv" pip install --python "${VENV_PYTHON}" fastapi uvicorn pydantic httpx websockets
fi

PORT="${PORT:-8000}"
HOST="${HOST:-127.0.0.1}"

echo "================================================================================"
echo "          🚀 INICIANDO SERVIDOR BACKEND FASTAPI DE PROTEOMESH"
echo "================================================================================"
echo "  • URL Base     : http://${HOST}:${PORT}"
echo "  • Swagger Docs : http://${HOST}:${PORT}/docs"
echo "  • Redoc Docs   : http://${HOST}:${PORT}/redoc"
echo "  • API v1       : http://${HOST}:${PORT}/api/v1"
echo "================================================================================"

exec "${HOME}/.local/bin/uv" run --python "${VENV_PYTHON}" uvicorn server.main:app --host "${HOST}" --port "${PORT}" --reload
