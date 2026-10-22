#!/usr/bin/env bash
# ==============================================================================
# bootstrap_data_clean.sh — Reconstruye la base limpia de /data de forma
# reproducible a partir de modules.lock: NoHello 0.0.7 + reglas de umount.
#
# Uso:
#   bash tools/bootstrap_data_clean.sh --dry-run
#   bash tools/bootstrap_data_clean.sh
#   bash tools/bootstrap_data_clean.sh --data-dir /tmp/dc-test
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_CLEAN="${REPO_DIR}/data-clean"
FETCH="${REPO_DIR}/tools/deps_fetch.py"
DRY_RUN=0
SANITIZE_IDENTITY=1

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=1 ;;
        --no-sanitize-identity) SANITIZE_IDENTITY=0 ;;
        --data-dir)
            shift
            [ $# -gt 0 ] || { echo "[!] --data-dir requiere una ruta"; exit 1; }
            DATA_CLEAN="$1"
            ;;
        -h|--help)
            sed -n '2,12p' "$0"
            exit 0
            ;;
        *)
            echo "[!] Opción desconocida: $1"
            exit 1
            ;;
    esac
    shift
done

if [ ! -d "${DATA_CLEAN}" ]; then
    echo "[!] No existe ${DATA_CLEAN}. Creá la base una vez con una instancia Redroid limpia."
    exit 1
fi
DATA_CLEAN="$(cd "${DATA_CLEAN}" && pwd)"

if ! command -v docker >/dev/null 2>&1; then
    echo "[!] Docker es necesario para escribir data-clean sin depender de sudo."
    exit 1
fi

NOHELLO_ZIP="$(python3 "${FETCH}" path nohello)"
echo "[i] NoHello verificado: ${NOHELLO_ZIP}"

if [ "${DRY_RUN}" -eq 1 ]; then
    echo "[dry-run] Se reemplazaría ${DATA_CLEAN}/adb/modules/zygisk_nohello"
    echo "[dry-run] Se escribiría ${DATA_CLEAN}/adb/nohello/umount"
    if [ "${SANITIZE_IDENTITY}" -eq 1 ]; then
        echo "[dry-run] Se borrarían persistent_properties, fake_proc y mini_mountinfo"
    fi
    exit 0
fi

docker run --rm \
    -e SANITIZE_IDENTITY="${SANITIZE_IDENTITY}" \
    -v "${DATA_CLEAN}:/data" \
    -v "${NOHELLO_ZIP}:/tmp/nohello.zip:ro" \
    alpine:3.20 sh -eu -c '
        set -eu

        # 1. Extraer el módulo NoHello fijado en modules.lock.
        #    El zip no se copia tal cual: el instalador de Magisk mueve
        #    lib/<abi>/libzygisk_nohello.so a zygisk/<abi>.so.
        rm -rf /tmp/nohello /data/adb/modules/zygisk_nohello
        mkdir -p /tmp/nohello /data/adb/modules/zygisk_nohello/zygisk
        busybox unzip -q /tmp/nohello.zip -d /tmp/nohello

        MOD=/data/adb/modules/zygisk_nohello
        cp /tmp/nohello/module.prop "$MOD/module.prop"
        cp /tmp/nohello/post-fs-data.sh "$MOD/post-fs-data.sh"
        cp /tmp/nohello/service.sh "$MOD/service.sh"
        cp /tmp/nohello/cleanup.sh "$MOD/cleanup.sh"
        cp /tmp/nohello/sepolicy.rule "$MOD/sepolicy.rule"
        grep "^description=" "$MOD/module.prop" | cut -d= -f2- > "$MOD/description"
        cp /tmp/nohello/lib/x86/libzygisk_nohello.so "$MOD/zygisk/x86.so"
        cp /tmp/nohello/lib/x86_64/libzygisk_nohello.so "$MOD/zygisk/x86_64.so"

        chown -R 0:0 "$MOD"
        find "$MOD" -type d -exec chmod 0755 {} +
        find "$MOD" -type f -exec chmod 0644 {} +
        chmod 0755 "$MOD/post-fs-data.sh" "$MOD/service.sh" "$MOD/cleanup.sh"

        # 2. Reglas de umount usadas por la validación anti-root.
        mkdir -p /data/adb/nohello
        cat > /data/adb/nohello/umount <<"EOF"
source { "KSU", "APatch", "magisk", "worker" } fs { "tmpfs" "overlay" }
point {"/system/etc/hosts"}

point {"/sbin"}
EOF
        touch /data/adb/nohello/umount_persist
        chmod 644 /data/adb/nohello/umount /data/adb/nohello/umount_persist

        # 3. Base sin identidad ni artefactos de una instancia previa.
        if [ "${SANITIZE_IDENTITY}" = "1" ]; then
            rm -f /data/property/persistent_properties
            rm -rf /data/local/tmp/fake_proc
            rm -f /data/local/tmp/mini_mountinfo
            rm -f /data/local/tmp/.proteomesh_boot_done
            rm -f /data/local/tmp/.proteomesh_module_updated
            rm -f /data/local/tmp/.proteomesh_scope_updated
        fi

        # 4. Verificación mínima.
        test -f /data/adb/modules/zygisk_nohello/module.prop
        test -f /data/adb/nohello/umount
        test -f /data/adb/nohello/umount_persist
        if [ "${SANITIZE_IDENTITY}" = "1" ]; then
            ! test -e /data/property/persistent_properties
            ! test -e /data/local/tmp/fake_proc
        fi
        echo "[✓] data-clean aprovisionado con NoHello 0.0.7 y sin identidad persistente"
    '

if [ "${SANITIZE_IDENTITY}" -eq 0 ]; then
    echo "[i] --no-sanitize-identity: se conservaron props/artefactos de identidad."
fi
