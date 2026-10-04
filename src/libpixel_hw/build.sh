#!/usr/bin/env bash
# ==============================================================================
# ProteoMesh — Compilation script for libpixel_hw native hooks
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_64="${SCRIPT_DIR}/../../build_magisk/system/lib64/libpixel_hw.so"
TARGET_32="${SCRIPT_DIR}/../../build_magisk/system/lib/libpixel_hw.so"

echo "[*] Compiling libpixel_hw (64-bit)..."
gcc -m64 -shared -fPIC -O2 -nostdlib -fno-stack-protector \
    "${SCRIPT_DIR}/pixel_hw64.c" -o "${TARGET_64}" -ldl

echo "[*] Compiling libpixel_hw (32-bit)..."
gcc -m32 -shared -fPIC -O2 -nostdlib -fno-stack-protector \
    "${SCRIPT_DIR}/pixel_hw32.c" -o "${TARGET_32}" -ldl

echo "[+] Compilation finished successfully:"
ls -lh "${TARGET_64}" "${TARGET_32}"
