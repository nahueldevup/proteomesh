#!/usr/bin/env bash
# ==============================================================================
# prepare-magisk.sh — Preparar binarios y configs de Magisk Bootless para Redroid
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build_magisk"
MAGISK_DEST="${BUILD_DIR}/system/etc/init/magisk"
INIT_DEST="${BUILD_DIR}/system/etc/init"
MAGISK_APK_URL="https://github.com/ayasa520/Magisk/releases/download/v30.7/Magisk-v30.7.apk"
TEMP_APK="/tmp/Magisk-v30.7.apk"

echo "[i] Preparando estructura en ${BUILD_DIR}..."
mkdir -p "${MAGISK_DEST}"
mkdir -p "${INIT_DEST}"

# 1. Descargar Magisk APK si no existe
if [ ! -f "${TEMP_APK}" ]; then
    echo "[i] Descargando Magisk APK desde ${MAGISK_APK_URL}..."
    curl -sSL "${MAGISK_APK_URL}" -o "${TEMP_APK}"
fi

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
echo "[✓] Magisk Bootless preparado exitosamente en ${BUILD_DIR}"
