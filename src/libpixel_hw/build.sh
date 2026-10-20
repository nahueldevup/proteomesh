#!/usr/bin/env bash
# ==============================================================================
# ProteoMesh — Compilation script for libpixel_hw native hooks
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_64="${SCRIPT_DIR}/../../build_magisk/system/lib64/libpixel_hw.so"
TARGET_32="${SCRIPT_DIR}/../../build_magisk/system/lib/libpixel_hw.so"

# Algunos entornos (p.ej. AppImage) rompen argv[0] del driver gcc y este no
# encuentra cc1. En ese caso se le indica con -B el directorio real de cc1.
CC=(gcc)
CC1="$("${CC[0]}" -print-prog-name=cc1 2>/dev/null || true)"
if [[ "$CC1" != /* || ! -x "$CC1" ]]; then
    CC1="$(find /usr/lib/gcc -name cc1 -type f 2>/dev/null | head -n1)"
fi
if [[ -n "$CC1" && -x "$CC1" ]]; then
    CC1DIR="$(dirname "$CC1")"
    CC+=("-B${CC1DIR}")
    echo "[*] gcc sin cc1 resoluble; usando -B${CC1DIR}"
fi

echo "[*] Compiling libpixel_hw (64-bit)..."
"${CC[@]}" -m64 -shared -fPIC -O2 -nostdlib -fno-stack-protector \
    "${SCRIPT_DIR}/pixel_hw64.c" -o "${TARGET_64}" -ldl

echo "[*] Compiling libpixel_hw (32-bit)..."
"${CC[@]}" -m32 -shared -fPIC -O2 -nostdlib -fno-stack-protector \
    "${SCRIPT_DIR}/pixel_hw32.c" -o "${TARGET_32}" -ldl

echo "[+] Compilation finished successfully:"
ls -lh "${TARGET_64}" "${TARGET_32}"
