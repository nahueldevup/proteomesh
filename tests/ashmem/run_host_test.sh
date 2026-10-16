#!/usr/bin/env bash
# ProteoMesh — test host-side del shim ashmem.
# Compila libpixel_hw (64/32) y corre el selftest con LD_PRELOAD sobre Linux.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${ROOT}/build/tests"
mkdir -p "${OUT_DIR}"

# Mismo workaround que build.sh: entornos con argv[0] roto no encuentran cc1.
CC=(gcc)
if ! "${CC[0]}" -print-prog-name=cc1 2>/dev/null | grep -q '^/'; then
    CC1DIR="$("${CC[0]}" -print-search-dirs 2>/dev/null | sed -n 's/^libraries: =//p' | cut -d: -f1)"
    if [[ -n "${CC1DIR}" && -d "${CC1DIR}" ]]; then
        [[ "${CC1DIR}" == */ ]] || CC1DIR="${CC1DIR}/"
        CC+=("-B${CC1DIR}")
    fi
fi

echo "[*] Compilando shim (src/libpixel_hw/build.sh)..."
bash "${ROOT}/src/libpixel_hw/build.sh" >/dev/null

SHIM="${ROOT}/build_magisk/system/lib64/libpixel_hw.so"

echo "[*] Compilando selftest..."
"${CC[@]}" -O2 -Wall -o "${OUT_DIR}/ashmem_selftest" \
    "${ROOT}/tests/ashmem/ashmem_selftest.c"

echo "[*] Ejecutando con LD_PRELOAD=${SHIM}"
LD_PRELOAD="${SHIM}" "${OUT_DIR}/ashmem_selftest"
