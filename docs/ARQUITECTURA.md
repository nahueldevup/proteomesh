# Arquitectura del Sistema ProteoMesh

ProteoMesh es un framework de endurecimiento (*hardening*), enmascaramiento y simulación de hardware móvil para contenedores Android (**ReDroid 13 / API 33**) sobre kernels Linux x86_64. Su diseño profile-driven permite transformar dinámicamente un contenedor virtual en cualquiera de **17 dispositivos comerciales oficiales** (Samsung Galaxy, Xiaomi Redmi, Motorola Moto G y Google Pixel) con operadoras móviles y geolocalizaciones coherentes (arquitectura de CloudPhones estilo GeeLark / GenFarmer).

El sistema neutraliza las heurísticas de detección de emuladores, virtualización y análisis de integridad local de aplicaciones bancarias, tiendas oficiales y utilidades de diagnóstico (`Device Info`, `DevCheck`, `Pixelscan Android Checker`, `Google Play Protect`, `FingerprintJS`).

---

## 1. Modelo de Tres Capas de Intercepción

El sistema opera mediante tres capas coordinadas sin requerir parches en el kernel del host:

```
┌────────────────────────────────────────────────────────┐
│  Aplicaciones Android / Tiendas / SDKs Antifraude      │
│  (Play Store, Google Search, Pixelscan, DevCheck)      │
└────────────────────────────────────────────────────────┘
                           │
       LSPosed Framework (Zygisk Companion en Zygote)
                           ▼
┌────────────────────────────────────────────────────────┐
│  Capa Framework Java / IPC: FakeWifiPixel Module       │
│  - android.os.Build & SystemProperties                 │
│  - android.hardware.camera2 (CameraCharacteristics)    │
│  - android.hardware.SensorManager (MEMS fidedignos)   │
│  - android.view.Display (modos, Hz, xdpi/ydpi)         │
│  - android.net.wifi.WifiManager & WifiInfo             │
│  - android.telephony.TelephonyManager & Subscriptions  │
│  - GmsDeviceComplianceResponse (Play Protect Bypass)  │
│  - Intercepción de PackageManager (Brand Stores)       │
│  - Anti-Root / Modding Cloak (hidePkgHook NameNotFound)│
│  - Sanitización de entorno (ProcessEnvironment, Os)   │
│  - java.lang.System.getProperty("os.version")          │
└────────────────────────────────────────────────────────┘
                           │
       Bionic C Runtime Hooking (LD_PRELOAD en Zygote)
                           ▼
┌────────────────────────────────────────────────────────┐
│  Capa Nativa: libpixel_hw.so (64 y 32 bits)            │
│  - uname() -> Kernel Android GKI 5.10 sin fugas host   │
│  - sysinfo() -> Memoria RAM LPDDR fidedigna            │
│  - open("/proc/version") -> Banner GKI oficial         │
│  - open("/proc/cpuinfo") -> Tabla sintetizada de SoC   │
│  - open("/sys/devices/system/cpu/...") -> Frecuencias  │
│  - Anti-Root Bionic: ENOENT en /data/adb/* y /sbin     │
│  - proc_snapshot: memfd de /proc/self/{environ,maps...}│
│  - execve: inyección de LD_PRELOAD en subprocesos shell│
└────────────────────────────────────────────────────────┘
                           │
       Capa de Arranque y Configuración (Init / Root)
                           ▼
┌────────────────────────────────────────────────────────┐
│  Capa de Sistema Base: profile-loader & Zygisk NoHello │
│  - Inyección instantánea de props vía resetprop        │
│  - Síntesis de /data/local/tmp/fake_proc/              │
│  - Montaje bind sobre /proc/version y build.props      │
│  - Stubs APK de tiendas nativas (Galaxy Store, GetApps)│
│  - Exposición de Cronet en public.libraries.txt        │
│  - Zygisk NoHello: unmount de /sbin y overlays por app │
│  - Magisk DenyList coordinado (sin enforce global)     │
└────────────────────────────────────────────────────────┘
```

---

## 2. Organización del Repositorio y Componentes

```text
redroid-integrity-lab/
├── templates/                     # Plantillas oficiales inmutables de hardware (17 modelos)
│   ├── google/pixel5_redfin.json
│   ├── motorola/{bangkk,cancunf,devon,penang,penangf}.json
│   ├── samsung/{a04s,a14,a24,a34x,a54x,samsung_s21}.json
│   └── xiaomi/{fire,gale,sapphire,sea,tapas}.json
├── carriers/                      # Perfiles de operadoras móviles y huso horario
│   ├── ar_claro.json
│   ├── ar_movistar.json
│   └── ar_personal.json
├── instances/                     # Directorio de instancias activas desacopladas
│   └── <nombre_instancia>/
│       ├── profile.json           # Perfil congelado con identidad única
│       └── data/                  # Volumen persistente /data clonado de data-clean
├── data-clean/                    # Imagen dorada sanitizada base para nuevas instancias
├── stubs/                         # APKs stub ultraligeros de tiendas de fabricante (~4.1 KB, con activity)
│   ├── samsung_galaxy_store.apk   # com.sec.android.app.samsungapps (4.1 KB)
│   ├── xiaomi_getapps.apk         # com.xiaomi.mipicks (4.1 KB)
│   └── huawei_appgallery.apk      # com.huawei.appmarket (4.1 KB)
├── tools/
│   ├── instance_manager.py        # Orquestador CLI del ciclo de vida de instancias
│   ├── render.py                  # Renderizador determinista de identidades
│   ├── run_api.sh                 # Lanzador del servidor FastAPI (puerto 8000)
│   └── run_ws_scrcpy.sh           # Lanzador opcional de ws-scrcpy (puerto 8001)
├── server/                        # API REST + streaming (FastAPI)
│   ├── main.py                    # Composición de la app y registro de routers
│   ├── config.py                  # Variables de entorno (WS_SCRCPY_URL, etc.)
│   ├── models/schemas.py          # Contratos Pydantic V2 (instancias, grupo, stream)
│   ├── routes/                    # instances, templates, carriers, locations, proxies
│   └── services/
│       ├── manager_bridge.py      # Puente CLI↔API, ADB directo y streaming
│       └── proxy_service.py       # Verificación de proxies y geolocalización
├── web/                           # Panel React 19 + TypeScript + Vite 8 + Tailwind 4
│   └── src/
│       ├── App.tsx                # Estado de grid/focus, selección y modo grupo
│       ├── components/grid/       # Mosaico: DeviceGrid, DeviceCard, GroupActionBar
│       ├── components/focus/      # FocusView, ControlPanel, InfoAccordion, ScreenStream
│       ├── components/ScreenViewer.tsx  # Visor canvas + iframe scrcpy
│       └── lib/api.ts, types.ts   # Cliente REST/WS tipado
├── tests/host/                    # Suites del motor, API, grupo y proxies
├── docker-compose.ws-scrcpy.yml   # ws-scrcpy contenedorizado (network_mode: host)
├── src/
│   ├── profile_loader/            # Cargador nativo en C estático (main.c)
│   ├── libpixel_hw/               # Hooks C Bionic LD_PRELOAD (pixel_hw64.c, pixel_hw32.c)
│   └── lsposed_module/            # Módulo Xposed/Zygisk (FakeWifiHook.java)
└── build_magisk/                  # Árbol del sistema inyectado en la imagen Docker
    ├── system/
    │   ├── bin/{profile-loader,resetprop}
    │   ├── etc/public.libraries.txt
    │   ├── lib64/{libpixel_hw.so,libcronet.so}
    │   └── lib/{libpixel_hw.so,libcronet.so}
```

---

## 3. Flujo de Generación y Despliegue de Instancias (GeeLark Architecture)

El gestor de instancias (`tools/instance_manager.py`) implementa la separación estricta entre plantillas inmutables e instancias congeladas de usuario:

1. **Previsualización y Generación de Identidad (`randomize`):**
   * El usuario o la interfaz selecciona una plantilla (`templates/samsung/a54x.json`) y una operadora (`carriers/ar_personal.json`).
   * Se generan identificadores dentro del rango físico estricto:
     * **IMEI:** TAC oficial GSMA de 8 dígitos correspondiente al modelo + número de serie aleatorio validado mediante el algoritmo de Luhn (dígito de verificación checksum).
     * **MAC Wi-Fi y Bluetooth:** Generadas con los prefijos OUI oficiales de IEEE registrados por la marca (ej. Samsung `B0:79:94`, Motorola `E4:90:7E`, Xiaomi `34:80:0D`).
     * **Serial de Hardware:** Prefijo oficial de fábrica + alfanumérico en longitud estándar.
     * **Telefonía:** Prefijos IMSI y formato ICCID acorde al MCC/MNC de la operadora seleccionada.
2. **Creación Congelada (`create`):**
   * Se sintetiza `instances/<nombre>/profile.json` conteniendo el hardware completo y el bloque `generated_identity`. Este archivo se monta en el contenedor en modo solo lectura (`/system/etc/proteomesh_profile.json:ro`).
   * Se clona el volumen `/data` a partir de la imagen dorada `data-clean/`, garantizando permisos root de Magisk y llaves autorizadas de ADB sin rastros de cuentas anteriores.
3. **Arranque y Normalización (`start`):**
   * **Desacoplamiento de Renderizado:** El contenedor arranca internamente con SurfaceFlinger optimizado a `720x1280 @ 30fps (270 dpi)` para minimizar uso de CPU/GPU software (reducción de 88% en carga de renderizado).
   * **Métricas Lógicas Reales:** Post-boot, `instance_manager.py` aplica `wm size` y `wm density` con la resolución y DPI lógicos nativos del perfil (`1080x2340 @ 450dpi`, etc.). En paralelo, `FakeWifiHook.java` (sección 9.5, activo solo para procesos de aplicación) intercepta `Display.getRefreshRate()`, `getMode()`, `getSupportedModes()`, `getSupportedRefreshRates()` y `getMetrics()`/`getRealMetrics()` (forzando `xdpi`/`ydpi` al `display.ppi` físico del panel), de modo que ninguna API de pantalla consultable desde una app revele el render optimizado. `system_server` y SurfaceFlinger conservan los valores reales (ADB, `dumpsys` y `scrcpy` siguen viendo `720x1280@30`).
   * **Despliegue Atómico del Módulo LSPosed:** `apply-props.sh` compara el md5 del APK instalado contra `/system/etc/proteomesh/FakeWifiPixel.apk` y lo actualiza en el arranque (con re-registro en `modules_config.db` vía `manage-spoof`). Como `lspd` cachea el dex del módulo y el scope en memoria (no recarga en caliente, y reiniciar el daemon tarde rompería el sistema), `instance_manager.py` detecta la bandera `.proteomesh_module_updated` y ejecuta un único `docker restart`, esperando el boot con el marcador `.proteomesh_boot_done`; el segundo arranque precarga el APK nuevo desde el inicio.
   * **Poda de Servicios y Límites de Procesos:** Se desactivan 19 paquetes del sistema vinculados a hardware físico inexistente (`pm disable-user --user 0`) y se configuran límites estrictos de procesos en caché (`max_cached_processes=4`).
   * Al bootear, `/system/bin/profile-loader` parsea `profile.json` e inyecta propiedades en microsegundos vía `resetprop`.
   * Se sincroniza automáticamente la zona horaria del sistema con la operadora (`setprop persist.sys.timezone`).
   * Se asegura la presencia del stub de la tienda oficial según la marca del dispositivo (con verificación de versión por marca) y la sincronización automática del scope de LSPosed (`manage-spoof sync`) para que toda app instalada quede hookeada.

---

## 4. Técnicas Específicas de Evasión y Hardening

### A. Consistencia de Tienda de Fabricante (Brand Store Evasion)
* **Reto:** SDKs antifraude como Pixelscan verifican si un dispositivo Samsung, Xiaomi o Huawei posee su tienda OEM (`com.sec.android.app.samsungapps`, `com.xiaomi.mipicks`, `com.huawei.appmarket`), penalizando como emulador (`Brand Store Missing`) si falta.
* **Mecanismo:**
  * Se instalan APKs stub nativos (~4.1 KB) con `MainActivity` lanzable y `classes.dex` mínimas: LSPosed marca como `obsolete package` y elimina del scope a todo paquete sin componentes (`ConfigManager.cacheScopes()`), por lo que el stub debe declarar al menos una activity. Constan físicamente en `/data/system/packages.xml` y la tienda es lanzable como una real (sin ejecutar procesos en segundo plano). Se reconstruyen con `tools/build_stubs.sh`.
  * Se interceptan llamadas Java de `PackageManager.getPackageInfo` y `ApplicationPackageManager`.
  * Se hookea la rutina de comprobación interna `net.pixelscan.check.MainActivity.s` devolviendo `true` para la tienda asociada a la marca activa.
  * **Puntaje verificado:** **100/100 Low Risk** en Pixelscan con cero advertencias de tienda (validación vigente; ver `docs/ESTADO_ACTUAL.md`).

### B. Bypass de Certificación de Google Play Protect
* **Reto:** ReDroid con GMS bloquea el acceso a Google Play Store con la pantalla *"Dispositivo no certificado por Play Protect"*.
* **Mecanismo:**
  * En `FakeWifiHook.java`, se intercepta el constructor y el deserializador Parcel (`CREATOR.createFromParcel`) de la clase `com.google.android.gms.gmscompliance.GmsDeviceComplianceResponse`.
  * Se fuerza en memoria `isCompliant = true` y `pendingIntent = null`.
  * Se hookea `UncertifiedDeviceActivity.onCreate` invocando de inmediato `finish()`.
  * Las apps de Google (`com.android.vending`, `com.google.android.gms`, `com.google.android.googlequicksearchbox`) están incorporadas en el scope de Zygisk/LSPosed.
  * **Resultado:** Acceso directo a la interfaz oficial de autenticación y descarga.

### C. Stack de Red Chromium Cronet en Google Search
* **Reto:** La app del buscador de Google arrojaba `"Ocurrió un error"` al despachar consultas web debido a que el linker dinámico de Bionic en Android 13 bloqueaba la carga de `libcronet.so` por restricciones de namespace (`classloader-namespace`).
* **Mecanismo:**
  * Se suministraron los binarios de `libcronet.so` en `/system/lib64/` y `/system/lib/`.
  * Se declararon explícitamente en `/system/etc/public.libraries.txt`, autorizando al linker a cargar la biblioteca desde cualquier espacio de nombres de aplicación.

### D. Protección Contra Fugas del Kernel Host (`uname` y `/proc/version`)
* **Reto:** La llamada nativa `uname(2)` del kernel host (ej. `7.2.9-1-cachyos`) se filtraba en diagnósticos como `5.10.01-cachyos` debido a un error de buffer en C que no colocaba el terminador nulo `\0` al final del string simulado.
* **Mecanismo:**
  * En `pixel_hw64.c` y `pixel_hw32.c`, se garantiza terminación nula estricta (`buf->release[i] = '\0'`), truncando los bytes sobrantes del host.
  * En `FakeWifiHook.java`, se intercepta `System.getProperty("os.version")` retornando la versión GKI de Android 13 (`5.10.149-android12-9-00001-ge5f3ba2132a1`).
  * `ro.kernel.version` se normaliza en `5.10`.

### E. Integridad de Bootloader y Banda Base
* **Reto:** Modelos virtuales mostraban `Bootloader: unknown` y `Banda base: unknown`.
* **Mecanismo:**
  * Todas las plantillas integran firmwares de módem oficiales (ej. `HA18_V14.0.14.0.TMTMIXM` para Xiaomi, `M6375_HI433_...` para Motorola, `A546EXXU5AWHC` para Samsung).
  * El bootloader reporta los códigos de compilación OEM (ej. `V14.0.14.0.TMTMIXM (Bloqueado)`).
  * `profile-loader` cuenta con deducción dinámica de emergencia para que ningún dispositivo arranque con cadenas desconocidas.

### F. Aislamiento y Saneamiento de Imagen Dorada (`data-clean`)
* **Reto:** Evitar que nuevas instancias hereden tokens de sesión, cuentas sincronizadas o identidades de modelos previos.
* **Mecanismo:**
  * La base `data-clean/` se mantiene desprovista de aplicaciones de terceros, bases de datos de cuentas SQLite (`accounts_ce.db`, `accounts_de.db`), identificadores SSAID (`settings_ssaid.xml`) y cachés de diagnóstico.
  * Preserva únicamente el framework de Magisk, módulos de Zygisk y llaves autorizadas de ADB para arranque inmediato.

### G. Emulación de Ashmem para Aplicaciones Modernas (Chromium 154+)
* **Reto:** Los kernels modernos (5.18+) eliminaron `/dev/ashmem`; aplicaciones como Chrome/Brave 154+ exigen la API ashmem completa (sellos `F_ADD_SEALS`/`F_GET_SEALS`, ioctls `0x7701-0x770a`) y fallaban (SIGSEGV/`ENOTTY`) contra un shim que solo reconocía una lista incompleta de opcodes.
* **Mecanismo:**
  * El shim identifica descriptores ashmem por *file-description*: `readlink("/proc/self/fd/N")` con prefijo `/memfd:ashmem` (sobrevive `dup`, `F_DUPFD` y el paso por `SCM_RIGHTS`), y solo clasifica en comandos ashmem (`fcntl` 1033/1034, `ioctl` `0x7701-0x770a`) para no penalizar el hot-path de Binder.
  * Emula la API completa sobre `memfd_create`: tamaño vía `lseek`, nombre y máscara de protección en estado por fd (128 slots), `F_ADD_SEALS` sintético y `F_GET_SEALS` devolviendo `GROW|SHRINK` (contrato `IsMemfdFd` de Chromium).
  * Coherencia de sistema de archivos: `stat`/`lstat`/`fstatat`/`statx`/`readlink(at)`/`fopen` de `/dev/ashmem` se resuelven como dispositivo de caracteres (`/dev/null`); `access` con `X_OK` → `EACCES`; `dup2`/`dup3` limpian marcas obsoletas del descriptor destino.
  * Política por dispositivo: `device.ashmem` en `profile.json` → `fake_proc/ashmem_present` (default `true`); con `false` el shim responde `ENOENT` coherente en `open`/`access`/`stat` y las apps usan su fallback memfd nativo, igual que un equipo sin nodo ashmem.
  * Verificación reproducible sin Android: `tests/ashmem/run_host_test.sh` ejecuta el selftest del shim con `LD_PRELOAD` sobre Linux.

---

## 5. Plano de Control Web y Streaming de Baja Latencia

El panel (`web/`) y la API (`server/`) son un plano de control desacoplado del motor de instancias: **toda mutación de estado pasa por `tools/instance_manager.py`**, que sigue siendo la única fuente de verdad sobre Docker, ADB, perfiles y ciclo de vida. La API no reimplementa esa lógica; la envuelve y la expone con contratos Pydantic y respuestas uniformes por instancia.

### 5.1 Flujo de datos

```text
React (5173) ──REST──► FastAPI (8000) ──subprocess──► instance_manager.py ──► Docker / ADB
     │                     │
     │                     ├──GET /instances/{name}/screen        (JPEG, thumbnails/captura)
     │                     ├──GET /instances/{name}/stream-info   (disponibilidad ws-scrcpy)
     │                     └──WS  /instances/{name}/ws-stream     (JPEG ~3 FPS, fallback)
     │
     └──iframe──► ws-scrcpy (8001) ──proxy-adb──► scrcpy server (H.264 30 FPS)
```

### 5.2 Jerarquía de visores y justificación

| Nivel | Transporte | Uso | Por qué |
|---|---|---|---|
| **Primario** | ws-scrcpy + H.264 (WebCodecs/MSE) | Vista focus por defecto | Latencia percibida ~50–100 ms y 30 FPS reales; el pipeline JPEG medía ~550 ms y era el cuello de botella, no la entrada táctil |
| **Fallback** | WebSocket JPEG + canvas | ws-scrcpy caído, navegador sin decodificador o modo grupo | Funciona solo con FastAPI/Docker, sin Node; mantiene la operación ante fallos del servicio externo |
| **Mosaico** | `GET /screen` a 5 s por tarjeta | Thumbnails de `DeviceCard` | Abrir un stream H.264 por tarjeta multiplicaría CPU y ancho de banda con 7+ instancias |
| **Captura** | `GET /screen` bajo demanda | Descarga de screenshot | No depende del stream ni de scrcpy |

- **Canvas en modo grupo:** el iframe de scrcpy controla un único dispositivo (un socket de video por dispositivo en el servidor scrcpy). La sincronización multi-touch hacia N instancias requiere el canvas y los endpoints `/instances/group/input/*`.
- **Entrada:** `manager_bridge.py` prefiere `adb -s 127.0.0.1:<adb_port> shell input` (~21 ms medidos) y cae a `docker exec` (~33 ms) si el dispositivo no está conectado. El ahorro aplica a tap, swipe, teclas, texto y al fan-out de grupo.
- **Control de grupo:** una sola llamada REST desde el frontend ejecuta `asyncio.gather` sobre las instancias y devuelve `GroupActionResponse` con `results[]`; así un fallo individual no aborta el lote y se evita la suma secuencial de latencias.
- **Conectividad ws-scrcpy:** se valida con un GET de 0.8 s de timeout en `stream-info` para degradar rápido al canvas. La URL base se configura con `WS_SCRCPY_URL`, lo que permite apuntar a un ws-scrcpy remoto sin tocar el frontend.
- **Configuración de ws-scrcpy:** el puerto se define en el YAML apuntado por `WS_SCRCPY_CONFIG`; la variable `PORT` es ignorada por ws-scrcpy y su puerto por defecto (8000) colisiona con FastAPI. El script y el compose generan el YAML y reconstruyen `node-pty` (npm 11 omite install scripts), evitando el fallo silencioso del módulo nativo.
- **Orden de rutas en FastAPI:** `/instances/group/*` se declara antes de `/{name}/*`; de lo contrario `group/start` se interpretaría como una instancia llamada `group`. El router WS no aparece en OpenAPI, por eso `stream-info` es la vía documentada para descubrir el visor.

### 5.3 Límites operativos

- Un solo cliente de video scrcpy por dispositivo: una ventana nativa abierta en el host puede competir con ws-scrcpy.
- El visor nativo no aplica al control de grupo ni a la descarga de captura.
- El render del invitado se mantiene en 30 FPS (`RENDER_FPS`), por lo que pedir más FPS al visor no mejora la fluidez real.
