#!/usr/bin/env bash
# Wrapper legacy de docker-compose. Exige una instancia creada por el manager:
# perfil con generated_identity y volumen instances/<name>/data.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${PROTEOMESH_PROFILE:-}"
DATA_DIR="${PROTEOMESH_DATA:-}"
case "${PROFILE}" in /*) ;; *) PROFILE="${REPO_DIR}/${PROFILE}" ;; esac
case "${DATA_DIR}" in /*) ;; *) DATA_DIR="${REPO_DIR}/${DATA_DIR}" ;; esac

CHECK=0
if [ "${1:-}" = "--check" ]; then
    CHECK=1
elif [ $# -gt 0 ]; then
    echo "[!] Opción desconocida: $1"
    exit 1
fi

if [ -z "${PROFILE}" ] || [ -z "${DATA_DIR}" ]; then
    echo "Uso: PROTEOMESH_PROFILE=instances/<id>/profile.json PROTEOMESH_DATA=instances/<id>/data $0 [--check]"
    exit 1
fi

python3 - "${PROFILE}" "${DATA_DIR}" "${REPO_DIR}" <<'PY'
import json
import sys
from pathlib import Path

profile = Path(sys.argv[1]).resolve()
data = Path(sys.argv[2]).resolve()
repo = Path(sys.argv[3]).resolve()

if not profile.is_file():
    sys.exit(f"[!] No existe el perfil: {profile}")
if not data.is_dir():
    sys.exit(f"[!] No existe el volumen de datos: {data}")

instances = (repo / "instances").resolve()
if profile.parent.parent != instances:
    sys.exit(f"[!] El perfil debe estar en instances/<id>/profile.json: {profile}")
if profile.parent / "data" != data:
    sys.exit(f"[!] PROTEOMESH_DATA debe ser {profile.parent / 'data'}")
if data == (repo / "data-clean").resolve():
    sys.exit("[!] data-clean no se puede usar como volumen de compose")

try:
    doc = json.loads(profile.read_text())
except Exception as exc:
    sys.exit(f"[!] Perfil JSON inválido: {exc}")

identity = doc.get("generated_identity")
if not isinstance(identity, dict) or not identity.get("imei"):
    sys.exit("[!] El perfil no tiene generated_identity; usar instance_manager create")
PY

if [ "${CHECK}" -eq 1 ]; then
    echo "[✓] Guardrail compose OK: perfil con generated_identity y volumen de instancia."
    exit 0
fi

export PROTEOMESH_PROFILE PROTEOMESH_DATA
docker compose --profile legacy up -d
