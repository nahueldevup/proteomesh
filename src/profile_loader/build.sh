#!/bin/bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="${DIR}/../../build_magisk/system/bin/profile-loader"

echo "[*] Compilando profile-loader (estático x86_64)..."
gcc -static -O2 "${DIR}/main.c" "${DIR}/cJSON.c" -I"${DIR}" -o "${OUTPUT}"
chmod +x "${OUTPUT}"
echo "[✓] Binario generado exitosamente en: ${OUTPUT}"
ls -lh "${OUTPUT}"
