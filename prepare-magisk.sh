#!/usr/bin/env bash
# ==============================================================================
# prepare-magisk.sh — Preparar binarios y configs de Magisk Bootless para Redroid
# ==============================================================================
set -euo pipefail

FORCE_RAW=0
if [ "${1:-}" = "--force-raw" ]; then
    FORCE_RAW=1
elif [ $# -gt 0 ]; then
    echo "[!] Opción desconocida: $1"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build_magisk"
MAGISK_DEST="${BUILD_DIR}/system/etc/init/magisk"
INIT_DEST="${BUILD_DIR}/system/etc/init"

if [ ! -f "${SCRIPT_DIR}/tools/deps_fetch.py" ]; then
    echo "[!] Falta tools/deps_fetch.py; no se puede verificar la versión de Magisk."
    exit 1
fi

TEMP_APK="$(python3 "${SCRIPT_DIR}/tools/deps_fetch.py" path magisk)"

echo "[i] Preparando estructura en ${BUILD_DIR}..."
mkdir -p "${MAGISK_DEST}"
mkdir -p "${INIT_DEST}"

# El binario magisk del árbol puede tener el parche Zygisk. La extracción
# cruda del APK lo pisaría; se conserva salvo --force-raw.
PATCHED_MAGISK_BACKUP=""
if [ "${FORCE_RAW}" -eq 0 ] && [ -f "${MAGISK_DEST}/magisk" ]; then
    PATCHED_MAGISK_BACKUP="$(mktemp)"
    cp -a "${MAGISK_DEST}/magisk" "${PATCHED_MAGISK_BACKUP}"
    echo "[i] Se conservará el binario magisk existente (usar --force-raw para pisarlo)."
fi

restore_patched_magisk() {
    if [ -n "${PATCHED_MAGISK_BACKUP}" ] && [ -f "${PATCHED_MAGISK_BACKUP}" ]; then
        cp -a "${PATCHED_MAGISK_BACKUP}" "${MAGISK_DEST}/magisk"
        rm -f "${PATCHED_MAGISK_BACKUP}"
        PATCHED_MAGISK_BACKUP=""
        echo "[i] Binario magisk parcheado restaurado."
    fi
}
trap restore_patched_magisk EXIT

# 1. Usar el APK verificado por modules.lock (Magisk 30.6)
echo "[i] Usando Magisk 30.6 verificado desde ${TEMP_APK}..."

# 2. Extraer binarios nativos x86_64 y assets usando python3
echo "[i] Extrayendo binarios x86_64 y assets..."
python3 -c "
import zipfile, os, shutil

apk_path = '${TEMP_APK}'
magisk_dest = '${MAGISK_DEST}'

with zipfile.ZipFile(apk_path) as z:
    for name in z.namelist():
        # Extraer libs x86_64
        if name.startswith('lib/x86_64/'):
            basename = os.path.basename(name)
            if basename.startswith('lib') and basename.endswith('.so'):
                clean_name = basename[3:-3]
                target = os.path.join(magisk_dest, clean_name)
                with open(target, 'wb') as f:
                    f.write(z.read(name))
                os.chmod(target, 0o755)
                print(f'  [+] {clean_name}')
        # Extraer assets esenciales
        elif name.startswith('assets/'):
            basename = os.path.basename(name)
            if basename:
                target = os.path.join(magisk_dest, basename)
                with open(target, 'wb') as f:
                    f.write(z.read(name))
                os.chmod(target, 0o755)

shutil.copyfile(apk_path, os.path.join(magisk_dest, 'magisk.apk'))
print('  [+] magisk.apk')
"

# 3. Generar bootanim.rc con los triggers de Magisk Bootless
echo "[i] Generando bootanim.rc modificado..."
cat << 'RC_EOF' > "${INIT_DEST}/bootanim.rc"
service bootanim /system/bin/bootanimation
    class core animation
    user graphics
    group graphics audio
    disabled
    oneshot
    ioprio rt 0
    task_profiles MaxPerformance

on post-fs-data
    start logd
    exec u:r:su:s0 root root -- /system/etc/init/magisk/magisk --auto-selinux --setup-sbin /system/etc/init/magisk /sbin
    exec u:r:su:s0 root root -- /sbin/magisk --auto-selinux --post-fs-data

on nonencrypted
    exec u:r:su:s0 root root -- /sbin/magisk --auto-selinux --service

on property:vold.decrypt=trigger_restart_framework
    exec u:r:su:s0 root root -- /sbin/magisk --auto-selinux --service

on property:sys.boot_completed=1
    mkdir /data/adb/magisk 755
    exec u:r:su:s0 root root -- /sbin/magisk --auto-selinux --boot-complete

on property:init.svc.zygote=restarting
    exec u:r:su:s0 root root -- /sbin/magisk --auto-selinux --zygote-restart

on property:init.svc.zygote=stopped
    exec u:r:su:s0 root root -- /sbin/magisk --auto-selinux --zygote-restart
RC_EOF

chmod 644 "${INIT_DEST}/bootanim.rc"

restore_patched_magisk
trap - EXIT

echo "[✓] Magisk Bootless preparado exitosamente en ${BUILD_DIR}"
