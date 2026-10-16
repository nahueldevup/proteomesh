#!/bin/bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="${DIR}/../../build_magisk/system/bin/profile-loader"

# Algunos entornos (p.ej. AppImage) rompen argv[0] del driver gcc y este no
# encuentra cc1. En ese caso se le indica con -B el directorio real de cc1.
CC=(gcc)
if ! "${CC[0]}" -print-prog-name=cc1 2>/dev/null | grep -q '^/'; then
    CC1DIR="$("${CC[0]}" -print-search-dirs 2>/dev/null | sed -n 's/^libraries: =//p' | cut -d: -f1)"
    if [[ -n "${CC1DIR}" && -d "${CC1DIR}" ]]; then
        [[ "${CC1DIR}" == */ ]] || CC1DIR="${CC1DIR}/"
        CC+=("-B${CC1DIR}")
    fi
fi

echo "[*] Compilando profile-loader (estático x86_64)..."
"${CC[@]}" -static -O2 "${DIR}/main.c" "${DIR}/cJSON.c" -I"${DIR}" -o "${OUTPUT}"
chmod +x "${OUTPUT}"
echo "[✓] Binario generado exitosamente en: ${OUTPUT}"
ls -lh "${OUTPUT}"
