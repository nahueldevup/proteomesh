FROM redroid/redroid:14.0.0_64only-latest

# Crear /sbin para Magisk tmpfs
COPY sbin /sbin

# Inyectar componentes oficiales MindTheGapps (preservando permisos 755/644 del host)
COPY build_gapps/system /system

# Inyectar componentes de Magisk Bootless y bootanim.rc modificado
COPY build_magisk/system /system

# Inyectar resetprop en /system/bin
COPY bin/resetprop /system/bin/resetprop


