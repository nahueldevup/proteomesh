#!/usr/bin/env bash
# ==============================================================================
# SCRIPT DE AUTOMATIZACIÓN COMPLETA PARA REDROID
# Genera reportes de entorno (android-env-test), DevCheck y Device Info
# Con auto-calibración dinámica según la resolución de pantalla actual
# ==============================================================================
set -euo pipefail

# ------------------------------------------------------------------------------
# Configuración de Rutas y Dispositivo
# ------------------------------------------------------------------------------
ADB_TARGET="${ADB_TARGET:-localhost:5580}"
BASE_OUTPUT_DIR="/home/nahuel/Escritorio/info-test-redroid/info-version-for-hermes"

mkdir -p "$BASE_OUTPUT_DIR"

# Cálculo secuencial del contador de ejecuciones
COUNTER_FILE="$BASE_OUTPUT_DIR/.counter"
if [ -f "$COUNTER_FILE" ]; then
    STORED_COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
else
    STORED_COUNT=0
fi

# Contar subcarpetas existentes que coincidan con el patrón
EXISTING_DIRS=$(find "$BASE_OUTPUT_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)

if [ "$STORED_COUNT" -ge "$EXISTING_DIRS" ]; then
    COUNTER=$((STORED_COUNT + 1))
else
    COUNTER=$((EXISTING_DIRS + 1))
fi
echo "$COUNTER" > "$COUNTER_FILE"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
RUN_DIR_NAME="info-version-for-hermes-${COUNTER}-${TIMESTAMP}"
RUN_DIR="$BASE_OUTPUT_DIR/$RUN_DIR_NAME"
mkdir -p "$RUN_DIR"

# Nombres de archivos requeridos
ENV_FILE="$RUN_DIR/android-env-test-${COUNTER}-${TIMESTAMP}.txt"
DEVICE_INFO_FILE="$RUN_DIR/Device-Info-app_${COUNTER}--${TIMESTAMP}.txt"
DEVCHECK_FILE="$RUN_DIR/DevCheck-App-${COUNTER}-${TIMESTAMP}.txt"

TMP_DIR=$(mktemp -d /tmp/redroid-test-XXXXXX)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "================================================================="
echo "        INICIANDO AUTOMATIZACIÓN DE REPORTES REDROID"
echo "================================================================="
echo "Dispositivo ADB : $ADB_TARGET"
echo "Ejecución Nº    : $COUNTER"
echo "Timestamp       : $TIMESTAMP"
echo "Directorio Run  : $RUN_DIR"
echo "================================================================="

# ------------------------------------------------------------------------------
# 1. Verificación y Conexión ADB
# ------------------------------------------------------------------------------
echo -e "\n[*] Paso 1: Verificando conexión ADB con $ADB_TARGET..."
if ! adb devices | grep -E "$ADB_TARGET\s+device" >/dev/null 2>&1; then
    echo "    Intentando conectar a $ADB_TARGET..."
    adb connect "$ADB_TARGET" || true
    sleep 2
fi

if ! adb -s "$ADB_TARGET" get-state >/dev/null 2>&1; then
    echo "[!] ERROR: No se pudo establecer conexión con $ADB_TARGET"
    exit 1
fi
echo "    Conexión establecida exitosamente."

# Despertar y desbloquear pantalla
echo "[*] Despertando y desbloqueando pantalla..."
adb -s "$ADB_TARGET" shell input keyevent 26
sleep 0.5
adb -s "$ADB_TARGET" shell input keyevent 82
sleep 1

# Detección de resolución actual
SCREEN_RAW=$(adb -s "$ADB_TARGET" shell wm size | grep -oE '[0-9]+x[0-9]+' | head -1 || echo "1080x2340")
SCREEN_W=$(echo "$SCREEN_RAW" | cut -d'x' -f1)
SCREEN_H=$(echo "$SCREEN_RAW" | cut -d'x' -f2)
echo "[*] Resolución de pantalla detectada: ${SCREEN_W}x${SCREEN_H}"

# Calibración de coordenadas según resolución
if [ "$SCREEN_W" -eq 1080 ] && [ "$SCREEN_H" -eq 2340 ]; then
    # Perfil exacto calibrado píxel a píxel para 1080x2340
    DC_OVERFLOW_X=1020; DC_OVERFLOW_Y=155
    DC_EXPORT_X=750;    DC_EXPORT_Y=830
    DC_SAVE_X=894;      DC_SAVE_Y=2141

    DI_OVERFLOW_X=1010; DI_OVERFLOW_Y=165
    DI_MENU_EXP_X=600;  DI_MENU_EXP_Y=280
    DI_NEED_SWIPE=false
    DI_BTN_EXP_X=539;   DI_BTN_EXP_Y=1937
    DI_SAVE_X=894;      DI_SAVE_Y=2141
elif [ "$SCREEN_W" -eq 720 ] && [ "$SCREEN_H" -eq 1280 ]; then
    # Perfil exacto calibrado para 720x1280
    DC_OVERFLOW_X=680; DC_OVERFLOW_Y=112
    DC_EXPORT_X=532;   DC_EXPORT_Y=696
    DC_SAVE_X=587;     DC_SAVE_Y=1136

    DI_OVERFLOW_X=660; DI_OVERFLOW_Y=118
    DI_MENU_EXP_X=316; DI_MENU_EXP_Y=230
    DI_NEED_SWIPE=true
    DI_BTN_EXP_X=360;  DI_BTN_EXP_Y=1088
    DI_SAVE_X=585;     DI_SAVE_Y=1135
else
    # Perfil proporcional dinámico para cualquier otra resolución
    echo "[*] Usando perfil proporcional escalado para ${SCREEN_W}x${SCREEN_H}..."
    DC_OVERFLOW_X=$(( SCREEN_W * 944 / 1000 ))
    DC_OVERFLOW_Y=$(( SCREEN_H * 66 / 1000 ))
    DC_EXPORT_X=$(( SCREEN_W * 694 / 1000 ))
    DC_EXPORT_Y=$(( SCREEN_H * 355 / 1000 ))
    DC_SAVE_X=$(( SCREEN_W * 828 / 1000 ))
    DC_SAVE_Y=$(( SCREEN_H * 915 / 1000 ))

    DI_OVERFLOW_X=$(( SCREEN_W * 935 / 1000 ))
    DI_OVERFLOW_Y=$(( SCREEN_H * 70 / 1000 ))
    DI_MENU_EXP_X=$(( SCREEN_W * 555 / 1000 ))
    DI_MENU_EXP_Y=$(( SCREEN_H * 120 / 1000 ))
    DI_NEED_SWIPE=true
    DI_BTN_EXP_X=$(( SCREEN_W * 500 / 1000 ))
    DI_BTN_EXP_Y=$(( SCREEN_H * 828 / 1000 ))
    DI_SAVE_X=$(( SCREEN_W * 828 / 1000 ))
    DI_SAVE_Y=$(( SCREEN_H * 915 / 1000 ))
fi

# ------------------------------------------------------------------------------
# 2. Generar Reporte de Entorno Android (android-env-test)
# ------------------------------------------------------------------------------
echo -e "\n[*] Paso 2: Generando reporte de entorno Android..."

section() {
    echo
    echo "---- $1 ----"
}

{
echo "========================================"
echo "       ANDROID ENVIRONMENT TEST"
echo "========================================"
echo
echo "Fecha: $(date)"
echo "Resultado: $ENV_FILE"

section "ADB"
adb -s "$ADB_TARGET" get-state
adb -s "$ADB_TARGET" shell id

section "BUILD / PRODUCT"
for p in \
ro.product.manufacturer \
ro.product.brand \
ro.product.model \
ro.product.device \
ro.product.name \
ro.product.board \
ro.hardware \
ro.boot.hardware \
ro.build.fingerprint \
ro.build.description \
ro.build.version.release \
ro.build.version.sdk \
ro.product.cpu.abi \
ro.product.cpu.abilist
do
    printf "%-30s " "$p"
    adb -s "$ADB_TARGET" shell getprop "$p" | tr -d '\r'
done

section "EMULATOR INDICATORS"
adb -s "$ADB_TARGET" shell getprop | grep -Ei \
'qemu|goldfish|ranchu|emulator|sdk_gphone|generic|vbox|virtual' \
|| echo "No obvious emulator strings found."

section "KERNEL"
adb -s "$ADB_TARGET" shell uname -a

section "CPU"
adb -s "$ADB_TARGET" shell cat /proc/cpuinfo | head -40

section "MEMORY"
adb -s "$ADB_TARGET" shell cat /proc/meminfo | head -15

section "BLOCK DEVICES"
adb -s "$ADB_TARGET" shell cat /proc/partitions

section "MOUNTS"
adb -s "$ADB_TARGET" shell mount | head -40

section "SENSORS"
adb -s "$ADB_TARGET" shell dumpsys sensorservice | head -100

section "CAMERA"
adb -s "$ADB_TARGET" shell dumpsys media.camera | head -100

section "BATTERY"
adb -s "$ADB_TARGET" shell dumpsys battery

section "TELEPHONY"
adb -s "$ADB_TARGET" shell dumpsys telephony.registry 2>/dev/null | head -100

section "NETWORK"
adb -s "$ADB_TARGET" shell ip addr
adb -s "$ADB_TARGET" shell ip route

section "ANDROID SERVICES"
adb -s "$ADB_TARGET" shell service list | head -100

section "PACKAGE MANAGER"
adb -s "$ADB_TARGET" shell pm list packages | wc -l
adb -s "$ADB_TARGET" shell pm list packages | grep -Ei \
'emulator|qemu|virtualbox|microg|redroid|waydroid' \
|| true

section "SECURITY / ROOT"
adb -s "$ADB_TARGET" shell getenforce
adb -s "$ADB_TARGET" shell id
adb -s "$ADB_TARGET" shell which su 2>/dev/null || true

section "PROPERTIES WITH VIRTUALIZATION INDICATORS"
adb -s "$ADB_TARGET" shell getprop | grep -Ei \
'virtual|container|docker|redroid|waydroid|qemu|goldfish|ranchu' \
|| true

echo
echo "========================================"
echo "              TEST FINISHED"
echo "========================================"

} > "$ENV_FILE"

echo "    [✓] Guardado en: $(basename "$ENV_FILE") ($(stat -c%s "$ENV_FILE") bytes)"

# ------------------------------------------------------------------------------
# 3. Disparo y Extracción de DevCheck (flar2.devcheck)
# ------------------------------------------------------------------------------
echo -e "\n[*] Paso 3: Disparando y exportando reporte de DevCheck..."

if ! adb -s "$ADB_TARGET" shell pm list packages | grep -q "flar2.devcheck"; then
    echo "    [!] ADVERTENCIA: flar2.devcheck no está instalado. Omitiendo."
else
    # Archivar reportes previos en el dispositivo para aislar el nuevo
    adb -s "$ADB_TARGET" shell "mkdir -p /sdcard/info-divice/archived && mv /sdcard/info-divice/DevCheck* /sdcard/info-divice/archived/ 2>/dev/null || true"
    
    # Detener y relanzar app
    adb -s "$ADB_TARGET" shell am force-stop flar2.devcheck 2>/dev/null || true
    adb -s "$ADB_TARGET" shell am start -n flar2.devcheck/.MainActivity >/dev/null 2>&1
    sleep 4

    # Abrir menú overflow (tres puntos)
    echo "    Tocando menú overflow (${DC_OVERFLOW_X}, ${DC_OVERFLOW_Y})..."
    adb -s "$ADB_TARGET" shell input tap "$DC_OVERFLOW_X" "$DC_OVERFLOW_Y"
    sleep 1.5

    # Tocar opción "Exportar"
    echo "    Tocando Exportar (${DC_EXPORT_X}, ${DC_EXPORT_Y})..."
    adb -s "$ADB_TARGET" shell input tap "$DC_EXPORT_X" "$DC_EXPORT_Y"
    sleep 2.5

    # Confirmar "GUARDAR" en DocumentsUI
    echo "    Confirmando Guardar (${DC_SAVE_X}, ${DC_SAVE_Y})..."
    adb -s "$ADB_TARGET" shell input tap "$DC_SAVE_X" "$DC_SAVE_Y"
    sleep 0.5
    adb -s "$ADB_TARGET" shell input keyevent 66 2>/dev/null || true
    sleep 2

    # Detener app limpia
    adb -s "$ADB_TARGET" shell am force-stop flar2.devcheck 2>/dev/null || true

    # Extraer el reporte generado usando shell del dispositivo (inmune a nombres con espacios/caracteres especiales)
    adb -s "$ADB_TARGET" exec-out 'sh -c "cat /sdcard/info-divice/DevCheck*.txt 2>/dev/null || cat /sdcard/Download/DevCheck*.txt 2>/dev/null"' > "$TMP_DIR/devcheck_raw.txt"

    if [ -s "$TMP_DIR/devcheck_raw.txt" ]; then
        # Convertir UTF-16 a UTF-8 si corresponde para que sea fácilmente legible
        if file "$TMP_DIR/devcheck_raw.txt" | grep -qi "UTF-16"; then
            iconv -f UTF-16 -t UTF-8 "$TMP_DIR/devcheck_raw.txt" > "$DEVCHECK_FILE" 2>/dev/null || cp "$TMP_DIR/devcheck_raw.txt" "$DEVCHECK_FILE"
        else
            cp "$TMP_DIR/devcheck_raw.txt" "$DEVCHECK_FILE"
        fi
        echo "    [✓] Guardado en: $(basename "$DEVCHECK_FILE") ($(stat -c%s "$DEVCHECK_FILE") bytes)"
    else
        echo "    [!] ERROR: No se encontró reporte generado de DevCheck en el dispositivo."
    fi
fi

# ------------------------------------------------------------------------------
# 4. Disparo y Extracción de Device Info (com.ytheekshana.deviceinfo)
# ------------------------------------------------------------------------------
echo -e "\n[*] Paso 4: Disparando y exportando reporte de Device Info..."

if ! adb -s "$ADB_TARGET" shell pm list packages | grep -q "com.ytheekshana.deviceinfo"; then
    echo "    [!] ADVERTENCIA: com.ytheekshana.deviceinfo no está instalado. Omitiendo."
else
    # Archivar reportes previos en el dispositivo para aislar el nuevo
    adb -s "$ADB_TARGET" shell "mkdir -p /sdcard/info-divice/archived && mv /sdcard/info-divice/Device\ Info*.txt /sdcard/info-divice/archived/ 2>/dev/null || true"

    # Desactivar animaciones temporalmente para agilizar UI
    adb -s "$ADB_TARGET" shell "settings put global window_animation_scale 0; settings put global transition_animation_scale 0; settings put global animator_duration_scale 0" >/dev/null 2>&1

    # Detener y relanzar app
    adb -s "$ADB_TARGET" shell am force-stop com.ytheekshana.deviceinfo 2>/dev/null || true
    adb -s "$ADB_TARGET" shell am start -n com.ytheekshana.deviceinfo/.SplashActivity >/dev/null 2>&1
    sleep 5

    # Abrir menú overflow (tres puntos)
    echo "    Tocando menú overflow (${DI_OVERFLOW_X}, ${DI_OVERFLOW_Y})..."
    adb -s "$ADB_TARGET" shell input tap "$DI_OVERFLOW_X" "$DI_OVERFLOW_Y"
    sleep 1.5

    # Tocar opción "Exportar" en el menú
    echo "    Tocando opción Exportar del menú (${DI_MENU_EXP_X}, ${DI_MENU_EXP_Y})..."
    adb -s "$ADB_TARGET" shell input tap "$DI_MENU_EXP_X" "$DI_MENU_EXP_Y"
    sleep 2

    # Si la pantalla requiere swipe para mostrar el botón
    if [ "$DI_NEED_SWIPE" = true ]; then
        echo "    Desplazando hacia abajo..."
        SWIPE_START_Y=$(( SCREEN_H * 70 / 100 ))
        SWIPE_END_Y=$(( SCREEN_H * 30 / 100 ))
        adb -s "$ADB_TARGET" shell input swipe $(( SCREEN_W / 2 )) "$SWIPE_START_Y" $(( SCREEN_W / 2 )) "$SWIPE_END_Y" 300
        sleep 1.5
    fi

    # Tocar botón azul "Exportar"
    echo "    Tocando botón azul Exportar (${DI_BTN_EXP_X}, ${DI_BTN_EXP_Y})..."
    adb -s "$ADB_TARGET" shell input tap "$DI_BTN_EXP_X" "$DI_BTN_EXP_Y"
    sleep 2.5

    # Confirmar "GUARDAR" en DocumentsUI
    echo "    Confirmando Guardar (${DI_SAVE_X}, ${DI_SAVE_Y})..."
    adb -s "$ADB_TARGET" shell input tap "$DI_SAVE_X" "$DI_SAVE_Y"
    sleep 0.5
    adb -s "$ADB_TARGET" shell input keyevent 66 2>/dev/null || true
    sleep 2

    # Detener app limpia y restaurar animaciones
    adb -s "$ADB_TARGET" shell am force-stop com.ytheekshana.deviceinfo 2>/dev/null || true
    adb -s "$ADB_TARGET" shell "settings put global window_animation_scale 1; settings put global transition_animation_scale 1; settings put global animator_duration_scale 1" >/dev/null 2>&1

    # Extraer el reporte generado usando shell del dispositivo
    adb -s "$ADB_TARGET" exec-out 'sh -c "cat /sdcard/info-divice/Device\ Info*.txt 2>/dev/null || cat /sdcard/Download/Device\ Info*.txt 2>/dev/null"' > "$DEVICE_INFO_FILE"

    if [ -s "$DEVICE_INFO_FILE" ]; then
        echo "    [✓] Guardado en: $(basename "$DEVICE_INFO_FILE") ($(stat -c%s "$DEVICE_INFO_FILE") bytes)"
    else
        echo "    [!] ERROR: No se encontró reporte generado de Device Info en el dispositivo."
    fi
fi

# ------------------------------------------------------------------------------
# 5. Resumen Final y Verificación
# ------------------------------------------------------------------------------
echo -e "\n================================================================="
echo "                    RESUMEN DE EJECUCIÓN"
echo "================================================================="
echo "Carpeta destino: $RUN_DIR"
echo "Archivos generados:"
ls -lh "$RUN_DIR"
echo "================================================================="
echo "[✓] Proceso completado con éxito."
