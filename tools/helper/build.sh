#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "[*] Construyendo imagen auxiliar proteomesh-helper:latest..."
docker build -t proteomesh-helper:latest "$SCRIPT_DIR"
echo "[✓] Imagen proteomesh-helper:latest construida exitosamente."
