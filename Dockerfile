FROM redroid/redroid:13.0.0_mindthegapps_magisk_widevine

# 1. Copiar resetprop binario (preserva 755 del host)
COPY bin/resetprop /system/bin/resetprop

# 2. Copiar componentes de /system (profile-loader, libpixel_hw, scripts, magisk bootless)
COPY build_magisk/system /system

# 3. Copiar componentes de /vendor (RIL nativo, permisos hardware)
COPY build_magisk/vendor /vendor

# 4. Presets de perfiles de hardware y perfil por defecto (Pixel 5)
COPY profiles/presets /system/etc/proteomesh/presets
COPY profiles/presets/pixel5_redfin.json /system/etc/proteomesh_profile.json

# 5. Módulo LSPosed pre-posicionado
COPY modules/FakeWifiPixel.apk /system/etc/proteomesh/FakeWifiPixel.apk
