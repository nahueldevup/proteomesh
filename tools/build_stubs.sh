#!/usr/bin/env bash
# ==============================================================================
# ProteoMesh — Construcción de stubs de Brand Store (APKs mínimos firmados)
#
# Genera stubs/samsung_galaxy_store.apk, xiaomi_getapps.apk y huawei_appgallery.apk
# a partir de stubs/src/<marca>/.
#
# Cada stub declara una MainActivity lanzable a propósito: LSPosed marca como
# "obsolete package" y elimina del scope a todo paquete sin componentes
# (fetchProcesses() vacío en cacheScopes() del daemon), por lo que un stub
# manifest-only nunca puede permanecer en el scope del módulo.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "${SCRIPT_DIR}")"
WORK_DIR="/tmp/proteomesh_stubs_build"
TOOLS_DIR="${WORK_DIR}/tools"
KEYSTORE="${REPO_DIR}/src/lsposed_module/debug.keystore"

AAPT2_VERSION="8.2.2-10154469"
R8_VERSION="8.2.42"

mkdir -p "${TOOLS_DIR}" "${WORK_DIR}"

# 1. Herramientas (cacheadas en /tmp)
if [ ! -x "${TOOLS_DIR}/aapt2" ]; then
    echo "[*] Descargando aapt2 ${AAPT2_VERSION}..."
    curl -sL -o "${TOOLS_DIR}/aapt2.jar" \
        "https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/${AAPT2_VERSION}/aapt2-${AAPT2_VERSION}-linux.jar"
    (cd "${TOOLS_DIR}" && unzip -o -q aapt2.jar aapt2 && chmod +x aapt2)
fi
if [ ! -f "${TOOLS_DIR}/android-30.jar" ]; then
    echo "[*] Descargando android-30 platform jar..."
    curl -sL -o "${TOOLS_DIR}/android-30.jar" \
        "https://github.com/Sable/android-platforms/raw/master/android-30/android.jar"
fi
if [ ! -f "${TOOLS_DIR}/r8.jar" ]; then
    echo "[*] Descargando R8 ${R8_VERSION}..."
    curl -sL -o "${TOOLS_DIR}/r8.jar" \
        "https://maven.google.com/com/android/tools/r8/${R8_VERSION}/r8-${R8_VERSION}.jar"
fi

# 2. Keystore (mismo que el módulo LSPosed)
if [ ! -f "${KEYSTORE}" ]; then
    keytool -genkey -v -keystore "${KEYSTORE}" \
        -storepass android -alias androiddebugkey -keypass android \
        -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=ProteoMesh,O=SecurityLab,C=AR"
fi

# 3. Compilar cada marca
build_stub() {
    local brand="$1" out_apk="$2"
    local src_dir="${REPO_DIR}/stubs/src/${brand}"
    local work="${WORK_DIR}/${brand}"

    echo "[*] Construyendo stub '${brand}'..."
    rm -rf "${work}"
    mkdir -p "${work}/classes" "${work}/dex"

    javac --release 11 -cp "${TOOLS_DIR}/android-30.jar" \
        -d "${work}/classes" \
        $(find "${src_dir}/java" -name '*.java')

    java -cp "${TOOLS_DIR}/r8.jar" com.android.tools.r8.D8 \
        --release --min-api 26 \
        --output "${work}/dex" \
        --lib "${TOOLS_DIR}/android-30.jar" \
        $(find "${work}/classes" -name '*.class')

    "${TOOLS_DIR}/aapt2" link -o "${work}/base.apk" \
        -I "${TOOLS_DIR}/android-30.jar" \
        --manifest "${src_dir}/AndroidManifest.xml"

    python3 - "${work}/base.apk" "${work}/dex/classes.dex" "${work}/unsigned.apk" << 'EOF'
import sys, zipfile
base, dex, out = sys.argv[1], sys.argv[2], sys.argv[3]
with open(dex, "rb") as f:
    dex_bytes = f.read()
with zipfile.ZipFile(base) as zin, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        if item.filename.startswith("META-INF/"):
            continue
        zout.writestr(item, zin.read(item.filename))
    zout.writestr("classes.dex", dex_bytes)
EOF

    jarsigner -sigalg SHA256withRSA -digestalg SHA-256 \
        -keystore "${KEYSTORE}" \
        -storepass android -keypass android \
        -signedjar "${out_apk}" \
        "${work}/unsigned.apk" androiddebugkey >/dev/null

    echo "[+] ${out_apk} ($(stat -c%s "${out_apk}") bytes)"
}

build_stub samsung "${REPO_DIR}/stubs/samsung_galaxy_store.apk"
build_stub xiaomi "${REPO_DIR}/stubs/xiaomi_getapps.apk"
build_stub huawei "${REPO_DIR}/stubs/huawei_appgallery.apk"

# 4. Verificación
for apk in "${REPO_DIR}/stubs/samsung_galaxy_store.apk" \
           "${REPO_DIR}/stubs/xiaomi_getapps.apk" \
           "${REPO_DIR}/stubs/huawei_appgallery.apk"; do
    echo "--- ${apk##*/}"
    "${TOOLS_DIR}/aapt2" dump badging "${apk}" 2>/dev/null | \
        grep -E "^package:|^launchable-activity:|^application-label:" || true
done

echo "[✓] Stubs construidos y firmados."
