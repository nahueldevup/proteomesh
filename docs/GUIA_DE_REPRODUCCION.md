# Guía de Reproducción y Despliegue de ProteoMesh

Esta guía detalla los pasos exactos para compilar, aprovisionar y operar la plataforma de dispositivos virtuales ProteoMesh en un sistema anfitrión Linux.

---

## 1. Requisitos Previos del Host

* **Sistema Operativo:** Linux x86_64 (CachyOS, Arch Linux, Ubuntu 22.04+, Debian 12 con kernel 5.18+, 6.x o 7.x).
* **Docker Engine:** Docker 24+ con soporte de contenedores privilegiados.
* **Módulos de Kernel Android:**
  * Módulos de Binder activos (`/dev/binder`, `/dev/vndbinder`, `/dev/hwbinder`).
  * En kernels sin `ashmem` (Linux 5.18+), ProteoMesh utiliza el fallback memfd (`sys.use_memfd=1` / parche en `libcutils.so`); el shim v3 clasifica también esos memfds (`shared_memory/<guid>`) y sintetiza los sellos `GROW|SHRINK` que exige Chromium 155+ (crbug 498720726). El shim v5.1 aplica además los sellos reales al kernel (semántica cross-proceso para renderers WebView/Chrome) y sintetiza `F_GET_SEALS` implícitamente cuando el kernel responde (éxito = memfd), con sonda mmap de respaldo si el fcntl está bloqueado por seccomp.
* **Herramientas en Host:**
  * `gcc`, `make` (para compilar `libpixel_hw.so` y `profile-loader`).
  * `openjdk-17` o superior (para compilar el módulo Java de LSPosed).
  * `python3` (para `tools/instance_manager.py`).
  * `android-tools` (`adb`) y `scrcpy` (para conexión y visualización).

---

## 2. Compilación de Componentes Nativos y Módulos

Si realizas modificaciones en el código fuente de los interceptores, compila los componentes antes de construir la imagen Docker:

### A. Interceptor Nativo Bionic (`libpixel_hw.so` 64 y 32 bits)
```bash
bash src/libpixel_hw/build.sh
```
*Genera `build_magisk/system/lib64/libpixel_hw.so` y `build_magisk/system/lib/libpixel_hw.so`.*

### B. Cargador Universal de Perfiles (`profile-loader`)
```bash
bash src/profile_loader/build.sh
```
*Genera el ejecutable estático x86_64 en `build_magisk/system/bin/profile-loader`.*

### C. Módulo de Evasión LSPosed (`FakeWifiPixel.apk`)
```bash
bash src/lsposed_module/build_apk.sh
```
*Compila con D8/R8 y firma `modules/FakeWifiPixel.apk`.*

### D. Tests Host-side del Shim Ashmem (`tests/ashmem/`)
El shim incluye un selftest que corre en Linux (sin Android) con `LD_PRELOAD`:
```bash
bash tests/ashmem/run_host_test.sh
```
*Compila el shim con `src/libpixel_hw/build.sh` y valida la API ashmem completa (`open`, sellos `F_ADD_SEALS`/`F_GET_SEALS`, los 10 ioctls `0x7701-0x770a`), la identidad por `readlink` tras `dup`/`F_DUPFD`/`SCM_RIGHTS`, la limpieza de marcas en `dup2`, la política `device.ashmem` (off/on/default) y la regresión de renderers (proceso nuevo con shim fresco que recibe el fd ajeno y ve `FUTURE_WRITE|GROW|SHRINK`). Salida esperada: `RESULT: OK` (48/48; el binario generado queda en `build/tests/`).*

### E. Sonda On-device de Ashmem (`tests/ashmem/device/`)
Corre como proceso de aplicación real (hijo de zygote → con `libpixel_hw.so` cargado) y registra la semántica de `/dev/ashmem`:
```bash
bash tests/ashmem/device/build_probe.sh
adb -s 127.0.0.1:<puerto> install -r tests/ashmem/device/ashmem_probe.apk
adb -s 127.0.0.1:<puerto> shell am start -n com.proteomesh.ashmemprobe/.AshmemProbe
adb -s 127.0.0.1:<puerto> logcat -s AshmemProbe
```
*Esperado: `open OK`, `F_ADD_SEALS` ret=0, `F_GET_SEALS=0x6`, `dup: F_GET_SEALS=0x6`, `access(F_OK) OK`, `access(X_OK) errno=13`, `stat: chardev=true`, `PROBE-DONE`. Con `device.ashmem=false` en el perfil, `open` debe dar `errno=2`.*

---

## 3. Construcción de la Imagen Docker Base

Construye la imagen Docker unificada que integra el sistema Android 13, GMS, Magisk y las capas de ProteoMesh:

```bash
docker build -t proteomesh:latest .
```

---

## 4. Gestión y Despliegue de Instancias (`instance_manager.py`)

La gestión de instancias se realiza a través de la herramienta CLI en host:

### A. Listar Plantillas de Hardware y Operadoras Disponibles
```bash
# Ver las 17 plantillas de hardware (Samsung, Xiaomi, Motorola, Pixel)
python3 tools/instance_manager.py list-templates

# Ver las operadoras disponibles (Claro, Personal, Movistar)
python3 tools/instance_manager.py list-carriers
```

### B. Previsualizar Identidad Aleatoria en Rango (Estilo GeeLark)
Permite previsualizar los identificadores generados (IMEI con Luhn, MACs con OUI del fabricante, serial y SIM) antes de crear la instancia:
```bash
python3 tools/instance_manager.py randomize samsung/a54x ar_personal
```

### C. Crear una Nueva Instancia Aislada
Crea la instancia clonando la base limpia (`data-clean/`), congelando el perfil en `instances/<nombre>/profile.json` y asignando un puerto ADB único:
```bash
# Ejemplo: Crear un Samsung Galaxy A54 en puerto 5584
python3 tools/instance_manager.py create mi-a54-01 samsung/a54x ar_personal --port 5584

# Ejemplo: Crear un Xiaomi Redmi 12 en puerto 5586
python3 tools/instance_manager.py create redmi-12-01 xiaomi/fire ar_personal --port 5586
```

### D. Iniciar la Instancia
Arranca el contenedor con los parámetros exactos de pantalla (resolución, DPI, Hz), conecta ADB, sincroniza la zona horaria de la operadora y asegura el stub de la tienda oficial de la marca (verificando su versión y actualizándolo si corresponde):
```bash
python3 tools/instance_manager.py start mi-a54-01
```
*Nota:* En el **primer arranque** de una instancia clonada de `data-clean/`, el gestor puede reiniciar automáticamente el contenedor una vez (pipeline de despliegue del módulo LSPosed): el primer boot detecta el APK desactualizado y lo instala, y el segundo lo precarga con `lspd` limpio. Es un comportamiento esperado (~2x el tiempo de arranque normal); no interrumpirlo.

### E. Visualizar la Pantalla del Dispositivo
```bash
scrcpy -s 127.0.0.1:5584
```

### F. Detener la Instancia
```bash
python3 tools/instance_manager.py stop mi-a54-01
```

### G. Listar Instancias Configuradas
```bash
python3 tools/instance_manager.py list-instances
```

### H. Crear una Instancia de Cada Modelo (Verificación Masiva)
Crea una instancia por cada plantilla del catálogo, con puerto incremental y saltando las que ya existen:
```bash
PORT=5590
for t in templates/google/*.json templates/motorola/*.json templates/samsung/*.json templates/xiaomi/*.json; do
  n="v-$(basename "$t" .json)"
  [ -d "instances/$n" ] && continue
  python3 tools/instance_manager.py create --name "$n" --template "$t" --carrier ar_personal --port $PORT
  PORT=$((PORT+1))
done
```
* Cada instancia clona la base limpia (≈1.2 GB de disco) y congela su `profile.json` con identidad única (IMEI/serial/MAC/SSID).
* **Advertencia:** re-ejecutar `create` sobre un nombre existente regenera la identidad y sobrescribe `profile.json`; el `continue` del loop evita ese caso.
* **Advertencia de recursos:** en hosts de 16 GB no arranques las 17 a la vez; cada instancia en caliente consume 0.4–1.8 GB de RAM. Arrancar de a 1–2.

---

## 5. Verificación de Integridad y Diagnóstico

### A. Verificación de Identidad y Sistema vía ADB
```bash
PORT=5584

# Marca, Modelo y Huella
adb -s 127.0.0.1:$PORT shell getprop ro.product.model
adb -s 127.0.0.1:$PORT shell getprop ro.build.fingerprint

# Baseband y Bootloader oficiales (sin valores 'unknown')
adb -s 127.0.0.1:$PORT shell getprop gsm.version.baseband
adb -s 127.0.0.1:$PORT shell getprop ro.bootloader

# Kernel (sin fugas del host)
adb -s 127.0.0.1:$PORT shell cat /proc/version
```
*Nota sobre almacenamiento:* `df` ejecutado por ADB shell muestra el disco del **host** (el hook `statfs` de `libpixel_hw.so` viaja por `LD_PRELOAD` y solo aplica a procesos de aplicación, no a `adbd`). El almacenamiento del perfil (128/256 GB) se verifica con una app de diagnóstico dentro de la instancia (Device Info / DevCheck).

### B. Verificación de Tiendas Oficiales y Servicios
* **Google Play Store:** Abre directamente a la pantalla oficial de inicio de sesión (`UnauthenticatedMainActivity`) sin el bloqueo de "Dispositivo no certificado".
* **Buscador de Google:** Ejecuta búsquedas web sin pantallas de error ("Ocurrió un error"), conectando mediante el stack Cronet expuesto en `public.libraries.txt`.
* **Pixelscan:** Al ejecutar el test en el dispositivo, verifica un puntaje de **75/100** con cero advertencias de `Brand Store Missing`.
* **Device Info / DevCheck:** Verifica en la pestaña *Sistema* que el Kernel muestre `5.10.149-android12-9-...`, el Bootloader esté reportado como bloqueado con su versión de compilación, y la Banda Base muestre el firmware de módem oficial.

### C. Verificación de Pantalla Lógica (lo que ven las Aplicaciones)
La sonda `com.proteomesh.displayprobe` (en `.probe/`, fuera del control de versiones) registra en logcat exactamente lo que observa una aplicación real sobre `android.view.Display`:

```bash
PORT=5601
A="adb -s 127.0.0.1:$PORT"

# 1. Instalar la sonda y autorizarla en el scope de LSPosed.
#    lspd cachea el scope en memoria: el alta requiere reinicio del contenedor.
$A install -r .probe/display_probe.apk
$A shell "su -c 'manage-spoof add com.proteomesh.displayprobe'"
docker restart v-samsung_s21      # o: python3 tools/instance_manager.py start v-samsung_s21

# 2. Tras el boot, lanzar la sonda y leer sus valores
$A logcat -c
$A shell am start -n com.proteomesh.displayprobe/.ProbeActivity
$A logcat -d -s DisplayProbe
```

Valores esperados (todos provienen del `profile.json` de la instancia; el sistema conserva `Physical 720x1280@30` para el render, visible en `wm size`):

| Instancia | `mode` / `supportedModes` / `refreshRate` | `xdpi` = `ydpi` |
|---|---|---|
| `v-samsung_s21` (Exynos 2100) | `1080x2400@120` / `[120, 60]` / 120 | 421 |
| `v-cancunf` (MT6855) | `1080x2400@120` / `[120, 60]` / 120 | 405 |
| `v-tapas` (SM6225) | `1080x2400@120` / `[120, 60]` / 120 | 395 |
| Galaxy A54 (`a54x`) | `1080x2340@120` / `[120, 60]` / 120 | 403 |
| Redmi 13C (`gale`) | `720x1600@90` / `[90, 60]` / 90 | 260 |

Si la sonda reporta `refreshRate=30.0` y `mode=720x1280@30`, el módulo LSPosed no está cargado en la instancia (dex/scope cacheados): reiniciar el contenedor y reintentar. Si la sonda no aparece hookeada, verificar que el paquete esté en el scope (`manage-spoof status`).

### D. Verificación de Ashmem y su Política (`device.ashmem`)
El shim emula `/dev/ashmem` sobre `memfd_create` para las apps (requisito de Chromium 154+/Brave/Meta). Su semántica se valida en el host con `bash tests/ashmem/run_host_test.sh` (§2.D) y, dentro de la instancia, el marcador de política debe existir:

```bash
$A shell cat /data/local/tmp/fake_proc/ashmem_present   # esperado: 1 (default)
```

Para simular un equipo **sin** nodo ashmem, poner `device.ashmem: false` en el `profile.json` de la instancia y reiniciar: `profile-loader` reescribe el marcador y el shim responde `ENOENT` coherente en `open`/`access`/`stat` (las apps usan su fallback memfd nativo). Este es el banco de pruebas A/B para Chromium cuando una app legacy dependa del nodo real. Procedimiento verificado:

```bash
python3 - << 'EOF'
import json
p = "instances/<instancia>/profile.json"
d = json.load(open(p)); d["device"]["ashmem"] = False
json.dump(d, open(p, "w"), indent=2)
EOF
docker restart <instancia>        # aplica el perfil en el boot
$A shell cat /data/local/tmp/fake_proc/ashmem_present   # -> 0
# (lanzar la sonda de §2.E: open -> ENOENT errno=2)
# restaurar: quitar la clave device.ashmem y reiniciar -> marcador 1 y sonda completa OK
```

**Nota sobre Chrome:** Chrome 155 de Play es hoy un vehículo no válido para verificar ashmem: crashea al arrancar por un problema de plataforma (lib ARM64 + carga RELRO + native bridge de Zygisk) ajeno al shim (ver desafío #27 de la bitácora). Usar la sonda de §2.E como verificación.

### E. Verificación de Geolocalización en Chrome (Fix #30)
El módulo inyecta ubicación falsa en Chrome x86_64 hookeando `LocationProviderFactory`/`LocationProviderAdapter` del split aislado. Procedimiento con la página de prueba `geo.html`:

```bash
PORT=5586
A="adb -s 127.0.0.1:$PORT"

# 1. Servir la página en el host y exponerla al device
cd /tmp/opencode && python3 -m http.server 8000 &
$A reverse tcp:8000 tcp:8000

# 2. Relanzar Chrome limpio y abrir la sonda
$A shell "am force-stop com.android.chrome; logcat -c"
$A shell "am start -n com.android.chrome/com.google.android.apps.chrome.Main -a android.intent.action.VIEW -d 'http://localhost:8000/geo.html'"
sleep 10

# 3. Leer la secuencia del módulo
$A logcat -d | grep FakeGps
```

Secuencia esperada en logcat (proceso browser, sin `:` en el nombre):
* `useGmsCoreLocationProvider blocked` → se evita el fused de GMS.
* `adapter create() impl=cgf` → se usa la implementación Android.
* `adapter start(highAcc=false)` ×2 + `start(highAcc=true)` ×1.
* `error 'Cannot generate approximate location.' suprimido`.
* `chromium hooks skipped (process=com.android.chrome:privileged_process0)` en procesos hijos (el gate de proceso evita el crash nativo del puente JNI).

En pantalla debe aparecer `OK lat=-34.603719 lon=-58.381589 acc=4.6 alt=24.96`. Si el primer request queda en `...pidiendo posicion`, pulsar REINTENTAR (tap ≈ `136 495` en 1080x2340).

Iteración rápida sin rebuild de imagen (los procesos nuevos cargan el dex nuevo; `lspd` lo lee por proceso):

```bash
bash src/lsposed_module/build_apk.sh
$A push modules/FakeWifiPixel.apk /data/local/tmp/FakeWifiPixel_new.apk
$A shell "su -c 'pm install -r -d /data/local/tmp/FakeWifiPixel_new.apk && am force-stop com.android.chrome'"
```

Para persistir: `DOCKER_BUILDKIT=1 docker build -t proteomesh:latest .` + recrear la instancia (el boot reinstala el módulo por md5).

### F. Auditoría del Scope LSPosed y Stubs de Tienda
Toda app de usuario debe estar en el scope (las apps fuera de scope ven `Build`/ABIs mixtos del sistema base). El scope se sincroniza solo en cada arranque (`manage-spoof sync` desde `apply-props.sh`); los cambios manuales requieren reinicio del contenedor porque `lspd` cachea el scope en memoria:

```bash
python3 tools/scope_audit.py              # faltantes, rancias y paquetes sin componentes (los que lspd poda)
python3 tools/scope_audit.py --apply      # sincroniza el scope (equivale a manage-spoof sync en la instancia)
python3 tools/scope_audit.py --prune      # quita entradas cuya app ya no está instalada
```

Los stubs de tienda (`stubs/*.apk`, ~4.1 KB) se reconstruyen con `tools/build_stubs.sh` (requiere JDK; descarga aapt2/r8/android-30.jar a `/tmp/proteomesh_stubs_build/` y firma con `src/lsposed_module/debug.keystore`). **Deben declarar `MainActivity`**: un APK sin componentes es eliminado del scope por `lspd` en cada arranque (`ConfigManager.cacheScopes()` → `obsoletePackages`). Al cambiar la versión de un stub, actualizar `STORE_MAP` en `tools/instance_manager.py`.