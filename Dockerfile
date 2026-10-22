FROM redroid/redroid:13.0.0_mindthegapps_magisk_widevine@sha256:9a22d28e69d87a6b965c051f32f112a8c716f1a33c4f2000398ff7ca84a1c9ef

# 1. Copiar resetprop binario (preserva 755 del host)
COPY bin/resetprop /system/bin/resetprop

# 2. Copiar componentes de /system (profile-loader, libpixel_hw, scripts, magisk bootless)
COPY build_magisk/system /system

# 3. Copiar componentes de /vendor (RIL nativo, permisos hardware)
COPY build_magisk/vendor /vendor

# 4. Módulo LSPosed pre-posicionado
COPY modules/FakeWifiPixel.apk /system/etc/proteomesh/FakeWifiPixel.apk
