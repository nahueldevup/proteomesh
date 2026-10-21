#!/bin/sh
# ==============================================================================
# apply-props.sh — Propiedades de producción y anti-detección
# Identidad derivada dinámicamente del perfil activo (profile-loader)
# Se ejecuta en sys.boot_completed=1
# ==============================================================================

# Banderas de arranque (consumidas por tools/instance_manager.py):
#   .proteomesh_module_updated → el APK LSPosed cambió en este arranque y hace
#   falta reiniciar una vez para que lspd lo precargue desde el inicio.
#   .proteomesh_scope_updated → apps nuevas entraron al scope en este arranque
#   (manage-spoof sync) y hace falta el mismo reinicio por el cacheo de lspd.
#   .proteomesh_boot_done → este script terminó (señal de "sistema listo").
rm -f /data/local/tmp/.proteomesh_boot_done 2>/dev/null || true
rm -f /data/local/tmp/.proteomesh_module_updated 2>/dev/null || true
rm -f /data/local/tmp/.proteomesh_scope_updated 2>/dev/null || true

# Diagnóstico de scope (B6): registra el estado de la tabla scope en puntos
# clave del arranque para detectar quién poda filas.
dump_scope() {
    [ -f /data/adb/lspd/config/modules_config.db ] || return 0
    sqlite3 -cmd ".timeout 5000" /data/adb/lspd/config/modules_config.db \
        "SELECT '$1 total='||COUNT(*)||' samsung='||(SELECT COUNT(*) FROM scope WHERE mid=39 AND app_pkg_name='com.sec.android.app.samsungapps')||' lspd='||(SELECT COUNT(*) FROM scope WHERE mid=39 AND app_pkg_name='org.lsposed.manager') FROM scope WHERE mid=39;" \
        >>/data/local/tmp/proteomesh_scope.log 2>&1 || true
}
dump_scope "pre-apply"

# ==============================================================================

RP="/sbin/resetprop"
if [ ! -x "$RP" ]; then
    RP="/system/bin/resetprop"
fi
if [ ! -x "$RP" ]; then
    RP="/data/adb/magisk/magisk resetprop"
fi

setprop() {
    $RP -n "$1" "$2" 2>/dev/null || true
}

delprop() {
    $RP --delete "$1" 2>/dev/null || true
}

# Aplicar plantilla de hardware activa desde el perfil
if [ -x "/system/bin/profile-loader" ]; then
    /system/bin/profile-loader apply /system/etc/proteomesh_profile.json
else
# ==============================================================================
# 1. Identidad de Dispositivo (Fallback Google Pixel 5 - Android 13)
# ==============================================================================
BRAND="google"
MANUF="Google"
MODEL="Pixel 5"
PRODUCT="redfin"
DEVICE="redfin"
BOARD="redfin"
HARDWARE="redfin"
PLATFORM="sm7250"
BUILD_ID="TQ3A.230901.001.C2"
INCREMENTAL="10750268"
SECURITY_PATCH="2023-11-01"
RELEASE="13"
SDK="33"
FINGERPRINT="google/redfin/redfin:13/TQ3A.230901.001.C2/10750268:user/release-keys"
FLAVOR="redfin-user"
DESCRIPTION="redfin-user 13 TQ3A.230901.001.C2 10750268 release-keys"

# Particiones del sistema (incluyendo vendor_dlkm)
for part in "" "system." "vendor." "product." "system_ext." "odm." "vendor_dlkm."; do
    setprop "ro.product.${part}brand" "$BRAND"
    setprop "ro.product.${part}manufacturer" "$MANUF"
    setprop "ro.product.${part}model" "$MODEL"
    setprop "ro.product.${part}name" "$PRODUCT"
    setprop "ro.product.${part}device" "$DEVICE"
    setprop "ro.product.${part}marketname" "$MODEL"
done

# Hardware y SoC
setprop "ro.product.board" "$BOARD"
setprop "ro.board.platform" "$PLATFORM"
setprop "ro.hardware" "qcom"
setprop "ro.boot.hardware" "qcom"
setprop "ro.hardware.hwcomposer" "redroid"
setprop "ro.hardware.gralloc" "redroid"
setprop "ro.boot.hardware.platform" "$PLATFORM"
setprop "ro.hardware.chipname" "$PLATFORM"
setprop "ro.build.product" "$PRODUCT"

# Versión de Android y Build Display ID (Build Number)
for part in "" "system." "vendor." "product." "system_ext." "odm." "vendor_dlkm."; do
    setprop "ro.${part}build.id" "$BUILD_ID"
    setprop "ro.${part}build.display.id" "$BUILD_ID"
    setprop "ro.${part}build.version.incremental" "$INCREMENTAL"
    setprop "ro.${part}build.version.security_patch" "$SECURITY_PATCH"
    setprop "ro.${part}build.version.release" "$RELEASE"
    setprop "ro.${part}build.version.release_or_codename" "$RELEASE"
    setprop "ro.${part}build.version.sdk" "$SDK"
    setprop "ro.${part}build.fingerprint" "$FINGERPRINT"
    setprop "ro.${part}build.type" "user"
    setprop "ro.${part}build.tags" "release-keys"
done

setprop "ro.build.flavor" "$FLAVOR"
setprop "ro.build.description" "$DESCRIPTION"
fi

# ==============================================================================
# 2. Flags de Producción / Release (Ocultar test-keys y debug)
# ==============================================================================
setprop "ro.debuggable" "0"
setprop "ro.secure" "1"
setprop "ro.adb.secure" "1"

# ==============================================================================
# 3. Estado de Bootloader Bloqueado y Modem
# ==============================================================================
setprop "ro.boot.flash.locked" "1"
setprop "ro.boot.verifiedbootstate" "green"
setprop "ro.boot.veritymode" "enforcing"
setprop "ro.boot.vbmeta.device_state" "locked"
setprop "ro.bootmode" "normal"
setprop "ro.boot.mode" "normal"
CUR_SERIAL=$(getprop persist.sys.fake.serial)
if [ -n "$CUR_SERIAL" ]; then
    setprop "ro.boot.serialno" "$CUR_SERIAL"
    setprop "ro.serialno" "$CUR_SERIAL"
fi

# Arquitectura CPU ABI oficial
for part in "" "system." "vendor." "odm." "product." "system_ext."; do
    setprop "ro.${part}product.cpu.abi" "arm64-v8a"
done

# Modem / Baseband / Telephony SIM (operador derivado del perfil activo)
CUR_CARRIER=$(getprop persist.sys.fake.carrier_name)
[ -z "$CUR_CARRIER" ] && CUR_CARRIER="Personal"
CUR_NUM=$(getprop persist.sys.fake.operator_numeric)
[ -z "$CUR_NUM" ] && CUR_NUM="72234"
CUR_MCC=$(getprop persist.sys.fake.mcc)
[ -z "$CUR_MCC" ] && CUR_MCC="722"
CUR_MNC=$(getprop persist.sys.fake.mnc)
[ -z "$CUR_MNC" ] && CUR_MNC="34"
CUR_ISO=$(getprop persist.sys.fake.country_iso)
[ -z "$CUR_ISO" ] && CUR_ISO="ar"
CUR_APN=$(getprop persist.sys.fake.apn)
[ -z "$CUR_APN" ] && CUR_APN="internet"
CUR_EHPLMNS="${CUR_NUM},${CUR_NUM}0,${CUR_NUM}1"

setprop "ro.telephony.sim.count" "1"
setprop "ro.telephony.default_network" "22"
setprop "ro.com.android.mobiledata" "true"
setprop "gsm.sim.state" "READY,READY"
setprop "gsm.network.type" "LTE"
setprop "gsm.current.phone-type" "1"
setprop "gsm.operator.alpha" "$CUR_CARRIER"
setprop "gsm.operator.numeric" "$CUR_NUM"
setprop "gsm.operator.iso-country" "$CUR_ISO"
setprop "gsm.sim.operator.alpha" "$CUR_CARRIER"
setprop "gsm.sim.operator.numeric" "$CUR_NUM"
setprop "gsm.sim.operator.iso-country" "$CUR_ISO"
setprop "vendor.rild.libpath" "/vendor/lib64/libreference-ril.so"

CUR_ICCID=$(getprop persist.sys.fake.iccid)
[ -z "$CUR_ICCID" ] && CUR_ICCID="8954341000123456789"
CUR_IMSI=$(getprop persist.sys.fake.imsi)
[ -z "$CUR_IMSI" ] && CUR_IMSI="722341012345678"
CUR_PHONE=$(getprop persist.sys.fake.phone)
[ -z "$CUR_PHONE" ] && CUR_PHONE="+549****2011"

# Asegurar registro de SIM en base de datos interna de telefonía
TEL_DB="/data/user_de/0/com.android.providers.telephony/databases/telephony.db"
if [ -f "$TEL_DB" ] && [ -x /system/bin/sqlite3 ]; then
    /system/bin/sqlite3 "$TEL_DB" "
    INSERT OR REPLACE INTO siminfo (
        _id, icc_id, sim_id, display_name, carrier_name, name_source, color, number,
        display_number_format, data_roaming, mcc, mnc, mcc_string, mnc_string,
        ehplmns, hplmns, sim_provisioning_status, is_embedded, card_id, is_removable,
        iso_country_code, carrier_id, profile_class, subscription_type, imsi,
        uicc_applications_enabled, port_index
    ) VALUES (
        1, '$CUR_ICCID', 0, '$CUR_CARRIER', '$CUR_CARRIER', 2, -16746133, '$CUR_PHONE',
        1, 0, $CUR_MCC, $CUR_MNC, '$CUR_MCC', '$CUR_MNC',
        '$CUR_EHPLMNS', '$CUR_NUM', 2, 0, '$CUR_ICCID', 1,
        '$CUR_ISO', 1341, 2, 0, '$CUR_IMSI',
        1, 0
    );
    INSERT OR REPLACE INTO carriers (
        _id, name, numeric, mcc, mnc, carrier_id, apn, user, password, type, current, carrier_enabled, sub_id
    ) VALUES (
        1, '$CUR_CARRIER', '$CUR_NUM', '$CUR_MCC', '$CUR_MNC', 1341, '$CUR_APN', '', '', 'default,supl,mms,ia', 1, 1, 1
    );
    " 2>/dev/null || true
    chown radio:radio "$TEL_DB"* 2>/dev/null || true
    chmod 660 "$TEL_DB"* 2>/dev/null || true
fi

# SELinux
setprop "ro.boot.selinux" "enforcing"
setprop "ro.build.selinux" "1"

# ==============================================================================
# 4. Anti-Emulador / Limpieza de firmas ReDroid / Qemu
# ==============================================================================
delprop "ro.boot.qemu"
delprop "ro.kernel.qemu"
delprop "ro.kernel.android.qemud"
delprop "ro.kernel.qemu.gles"
delprop "init.svc.goldfish-logcat"
delprop "init.svc.goldfish-setup"

# Gráficos ANGLE para scrcpy fluido
setprop "ro.hardware.egl" "angle"

# ==============================================================================
# 5. Servicios del Sistema y Estabilización
# ==============================================================================
# Permisos para Codec2 / scrcpy
chmod 666 /dev/dma_heap/* 2>/dev/null || true

# Desactivar Bluetooth simulado defectuoso
pm disable com.android.bluetooth 2>/dev/null || true
settings put global bluetooth_on 0 2>/dev/null || true
settings put global wifi_on 1 2>/dev/null || true


# Optimización de red
settings put global private_dns_mode off 2>/dev/null || true
settings put global captive_portal_mode 0 2>/dev/null || true

# Módulo C — El sistema nunca suspende la pantalla (el spoof de 60000 ms es solo en Java)
settings put system screen_off_timeout 2147483647 2>/dev/null || true
settings put global stay_on_while_plugged_in 7 2>/dev/null || true

# ==============================================================================
# 6. Magisk / Root Management
# ==============================================================================
chmod 755 /sbin 2>/dev/null || true

if [ -x /sbin/magisk ]; then
    /sbin/magisk --sqlite "INSERT OR REPLACE INTO settings (key, value) VALUES ('zygisk', 1);" 2>/dev/null || true
    /sbin/magisk --sqlite "INSERT OR REPLACE INTO settings (key, value) VALUES ('denylist', 0);" 2>/dev/null || true
    /sbin/magisk --sqlite "INSERT OR REPLACE INTO settings (key, value) VALUES ('root_access', 3);" 2>/dev/null || true
    /sbin/magisk --sqlite "INSERT OR REPLACE INTO policies (uid, policy, until, logging, notification) VALUES (2000, 2, 0, 1, 0);" 2>/dev/null || true
    /sbin/magisk --denylist disable 2>/dev/null || true

    # Mantener DenyList sin enforce: requerida por Zygisk NoHello para unmount de root
    # (No se vacia la denylist: NoHello necesita saber que apps proteger)


    # Auto-recuperar LSPosed y sincronizar path de FakeWifi
    rm -f /data/adb/modules/zygisk_lsposed/disable 2>/dev/null || true
    rm -f /data/adb/modules/zygisk_shamiko/disable 2>/dev/null || true

    # Instalar/actualizar el módulo LSPosed desde la imagen si el APK cambió.
    # Sin esto, las instancias reutilizan el módulo horneado en /data-clean y
    # todos los cambios del APK quedan inertes.
    MODULE_SRC="/system/etc/proteomesh/FakeWifiPixel.apk"
    MODULE_UPDATED=0
    if [ -f "$MODULE_SRC" ]; then
        CUR_APK=$(pm path eu.chylek.adam.fakewifi 2>/dev/null | cut -d: -f2)
        CUR_MD5=""
        [ -n "$CUR_APK" ] && CUR_MD5=$(md5sum "$CUR_APK" 2>/dev/null | cut -d' ' -f1)
        NEW_MD5=$(md5sum "$MODULE_SRC" 2>/dev/null | cut -d' ' -f1)
        if [ -n "$NEW_MD5" ] && [ "$CUR_MD5" != "$NEW_MD5" ]; then
            cp "$MODULE_SRC" /data/local/tmp/FakeWifiPixel.apk 2>/dev/null
            chmod 644 /data/local/tmp/FakeWifiPixel.apk 2>/dev/null
            if ! pm install -r -d /data/local/tmp/FakeWifiPixel.apk >/dev/null 2>&1; then
                pm uninstall eu.chylek.adam.fakewifi >/dev/null 2>&1 || true
                pm install -d /data/local/tmp/FakeWifiPixel.apk >/dev/null 2>&1 || true
            fi
            rm -f /data/local/tmp/FakeWifiPixel.apk 2>/dev/null
            MODULE_UPDATED=1
        fi
        if [ "$MODULE_UPDATED" = "1" ]; then
            # lspd NO se reinicia en caliente: arrancar el daemon tarde forzaría
            # un reinicio parcial del sistema. instance_manager.py detecta esta
            # bandera y reinicia el contenedor una vez; en el siguiente arranque
            # lspd precarga el APK nuevo desde la DB ya actualizada.
            touch /data/local/tmp/.proteomesh_module_updated 2>/dev/null || true
        fi
    fi

    if [ -x /data/adb/modules/zygisk_lsposed/daemon ]; then
        if ! pgrep -f lspd >/dev/null 2>&1; then
            setsid /data/adb/modules/zygisk_lsposed/daemon --from-service >/dev/null 2>&1 &
        fi
    fi
    if [ -f /data/adb/lspd/config/modules_config.db ]; then
        REAL_APK=$(pm path eu.chylek.adam.fakewifi 2>/dev/null | cut -d: -f2)
        if [ -n "$REAL_APK" ]; then
            sqlite3 /data/adb/lspd/config/modules_config.db "INSERT OR REPLACE INTO modules (mid, module_pkg_name, apk_path, enabled) VALUES (39, 'eu.chylek.adam.fakewifi', '$REAL_APK', 1);" 2>/dev/null || true
            dump_scope "pre-sync"
            # B6: sincroniza el scope en cada arranque (todas las apps de usuario
            # + sistema curado). Si agregó apps, deja .proteomesh_scope_updated.
            # Log en /data/local/tmp para diagnóstico del arranque.
            manage-spoof sync >>/data/local/tmp/proteomesh_scope.log 2>&1 || true
        fi
    fi

fi

# ==============================================================================
# 7. Reiniciar Health HAL para recargar Batería
# ==============================================================================
pkill -f health-service 2>/dev/null || true

# ==============================================================================
# 8. Saneamiento de Permisos de Cuentas y Google Play Services
# ==============================================================================
if [ -d /data/data/com.google.android.gms/files ]; then
    GMS_UID=$(stat -c '%u' /data/data/com.google.android.gms 2>/dev/null || echo 10052)
    chmod -R u+rw /data/data/com.google.android.gms/files/ 2>/dev/null || true
    chown -R "$GMS_UID:$GMS_UID" /data/data/com.google.android.gms/files/ 2>/dev/null || true
fi

# Señal de sistema listo para tools/instance_manager.py
touch /data/local/tmp/.proteomesh_boot_done 2>/dev/null || true
