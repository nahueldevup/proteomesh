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
│   ├── apks.db                    # Base de datos SQLite del repositorio global de APKs
│   └── <nombre_instancia>/
│       ├── profile.json           # Perfil congelado con identidad única
│       └── data/                  # Volumen persistente /data clonado de data-clean
├── apk_repo/                      # Almacenamiento físico de binarios APK por hash SHA-256
├── data-clean/                    # Imagen dorada sanitizada base para nuevas instancias
├── stubs/                         # APKs stub ultraligeros de tiendas de fabricante (~4.1 KB, con activity)
│   ├── samsung_galaxy_store.apk   # com.sec.android.app.samsungapps (4.1 KB)
│   ├── xiaomi_getapps.apk         # com.xiaomi.mipicks (4.1 KB)
│   └── huawei_appgallery.apk      # com.huawei.appmarket (4.1 KB)
├── tools/
│   ├── instance_manager.py        # Orquestador CLI del ciclo de vida de instancias
│   ├── render.py                  # Renderizador determinista de identidades
│   ├── run_api.sh                 # Lanzador del servidor FastAPI (puerto 8000, --reload-dir acotado)
│   ├── run_ws_scrcpy.sh           # Lanzador de ws-scrcpy (puerto 8001)
│   └── test_coords.mjs            # Suite de validación de coordenadas de pantalla
├── server/                        # API REST + streaming (FastAPI)
│   ├── main.py                    # Composición de la app y registro de routers
│   ├── config.py                  # Variables de entorno (WS_SCRCPY_URL, APK_REPO_DIR, ALLOWED_FILE_ROOTS)
│   ├── models/schemas.py          # Contratos Pydantic V2 (instancias, grupo, apks, files)
│   ├── routes/                    # instances, templates, carriers, locations, proxies, apks, files
│   └── services/
│       ├── manager_bridge.py      # Puente CLI↔API, ADB directo y streaming
│       ├── apk_repository.py      # Repositorio SQLite, hashing SHA-256 y metadatos AAPT2
│       ├── file_manager.py        # Gestor de archivos /sdcard/ con whitelist dual y send-to
│       ├── screenshot_cache.py    # Caché TTL 8s + single-flight para miniaturas de pantalla
│       └── proxy_service.py       # Verificación de proxies y geolocalización
├── web/                           # Panel React 19 + TypeScript + Vite 8 + Tailwind 4
│   ├── src/
│   │   ├── App.tsx                # Estado de rack/focus, selección, modo grupo y pestañas
│   │   ├── components/grid/       # Rack: DeviceGrid, DeviceCard, DeviceControlRail, Popovers, BulkBar
│   │   ├── components/farm/       # ScrcpyLiveScreen (WebCodecs canvas), PhoneScreen (JPEG reposo)
│   │   ├── components/focus/      # FocusView (split-screen de control y diagnóstico)
│   │   ├── components/files/      # ApkFileManager (gestión de APKs y explorador /sdcard/)
│   │   ├── lib/scrcpy/            # protocol.ts, coords.ts, fps.ts, useFps.ts, useScrcpyStream.ts, watchdog.ts
│   │   ├── lib/popoverStore.ts    # Store pub/sub de popovers exclusivos (1 activo en toda la UI)
│   │   ├── lib/useExclusivePopover.ts # Hook reactivo de control de popovers
│   │   └── lib/api.ts, types.ts   # Cliente REST tipado con contratos de flota, APKs y archivos
│   └── test/                      # Tests unitarios frontend (fps.test.ts, popovers.test.ts, watchdog.test.ts)
├── tests/host/                    # Suites host (manager, API, grupo, proxies, apks, files, screenshot_cache)
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

## 5. Plano de Control Web, Streaming WebCodecs y Gestión de Archivos

El panel (`web/`) y la API (`server/`) conforman un plano de control desacoplado del motor de instancias: **toda mutación de estado pasa por `tools/instance_manager.py`**, que sigue siendo la única fuente de verdad sobre Docker, ADB, perfiles y ciclo de vida. La API no reimplementa esa lógica; la envuelve y la expone con contratos Pydantic y respuestas uniformes por instancia.

### 5.1 Flujo de datos

```text
React (5173) ──REST──► FastAPI (8000) ──subprocess──► instance_manager.py ──► Docker / ADB
     │                     │
     │                     ├──GET  /instances/{name}/screen  (JPEG con caché TTL 8s + single-flight)
     │                     ├──POST /instances/{name}/restart (reinicio de contenedor ReDroid)
     │                     ├──/api/v1/apks                   (repositorio SQLite + SHA-256 + AAPT2)
     │                     └──/api/v1/files                  (gestor /sdcard/ con whitelist dual)
     │
     └──WebSocket──► ws-scrcpy (8001) ──proxy-adb──► scrcpy-server (H.264 Annex-B, 30 FPS)
          │
          ▼
     VideoDecoder nativo Chromium ──► HTML5 <canvas> (latencia <20 ms, aceleración VCN)
```

### 5.2 Jerarquía de visores y modelo Lazy exclusivo

| Modo | Componente | Transporte / Render | Consumo Host | Uso y Justificación |
|---|---|---|---|---|
| **Enfocado (Activo)** | `ScrcpyLiveScreen` | WebSocket a `ws-scrcpy` + `VideoDecoder` nativo a `<canvas>` | Aceleración VCN por hardware, ~20% de 1 hilo | **Exclusivo (1 teléfono a la vez):** 30 FPS H.264 reales, latencia <20 ms, empaquetado binario de toques (29B), scroll (21B) y teclado (14B). |
| **En Reposo (Idle)** | `PhoneScreen` | HTTP GET `/instances/{name}/screen` (JPEG) | **0% GPU**, ~0.1% CPU | Tarjetas no enfocadas en el rack. Polling espaciado (10–15 s con jitter), pausado fuera del viewport o con pestaña oculta. Caché backend TTL 8s + single-flight. Refresco forzado `fresh=1` al soltar foco. |
| **Fallback HD** | `InteractiveScreen` | HTTP GET `/screen` + ADB HTTP input | Mínimo | Modo de respaldo si ws-scrcpy no está disponible o para inspección fotográfica estática de alta definición. |
| **Captura** | `api.getScreenUrl` | HTTP GET bajo demanda | Puntual | Descarga de captura en 1 clic desde el botón 8 del riel (`Camera`). |

### 5.3 Pipeline de Streaming WebCodecs y Protocolo Binario Propio

1. **Cero IFrames:** Se erradicaron por completo los elementos `<iframe>` de streaming tanto en la grilla/rack (`DeviceCard`) como en la vista dividida (`FocusView`), eliminando fugas de memoria, barras intrusivas y colisiones de resolución (`BAD_INDEX (6)`).
2. **Negociación y Decodificación:**
   - La conexión WebSocket hacia `/ws-scrcpy/?action=proxy-adb&remote=tcp:8886&udid=127.0.0.1:{adb_port}` negocia el stream con un paquete binario de 36 bytes (`TYPE_VIDEO_SETTINGS`, 720x1560 a 30 FPS y 2 Mbps).
   - El cliente extrae las unidades NAL SPS/PPS del flujo Annex-B para instanciar `VideoDecoder` con `prefer-hardware` y `optimizeForLatency: true`.
   - El render se realiza sobre un `<canvas>` HTML5 con contexto 2D (`desynchronized: true`, `alpha: false`). Cada cuadro decodificado se destruye de inmediato mediante `frame.close()` para impedir fugas en la VRAM de la GPU.
3. **Protocolo Binario scrcpy (`web/src/lib/scrcpy/protocol.ts`):**
   - Paquetes binarios serializados en el cliente:
     * `TYPE_TOUCH` (29 bytes): puntero, acción (Down/Move/Up), coordenadas absolutas calibradas al video nativo (`videoSizeRef`) y presión.
     * `TYPE_SCROLL` (21 bytes): desplazamiento vertical/horizontal con amortiguación y throttle de 25 ms.
     * `TYPE_KEYCODE` (14 bytes): código de tecla Android y metastate para teclado físico.
     * `TYPE_TEXT`: inyección de cadenas UTF-8.
   - Mapeo de coordenadas con preservación de aspecto en `coords.ts` (suite `tools/test_coords.mjs`).
   - Clic derecho mapeado directamente a `KEYCODE_BACK` de Android con prevención de menú contextual.
4. **Watchdog de Primer Frame y Recuperación Automática (`watchdog.ts`):**
   - Al abrir el WebSocket (`ws.onopen`), se activa un temporizador de 6 segundos. Si no se decodifica ningún cuadro (ausencia de frame IDR tras reinicio del servidor con `ws-scrcpy` vivo), el socket se cierra y reconecta con backoff exponencial progresivo (`[500, 1000, 2000, 4000, 8000] ms`).
   - Tras 3 intentos consecutivos fallidos, se suspende la reconexión automática, se transiciona a estado `'error'` y se expone un botón manual de "Reintentar".
   - Descarte estricto de eventos desfasados (`shouldHandleSocketClose`) y cierre limpio con código 1000 tras `onopen` para evitar `ECONNRESET` en el proxy de desarrollo de Vite.
5. **Telemetría Dinámica de FPS (`fps.ts`, `useFps.ts`):**
   - Store externo pub/sub desacoplado del árbol de React, indexado por puerto ADB (`Map<adbPort, ...>`).
   - Medición precisa sobre una **ventana deslizante de 1 segundo** calculada sobre fotogramas efectivamente pintados (`computeWindowFps`), suscripto mediante `useSyncExternalStore` en el componente `FpsBadge`.

### 5.4 Repositorio Global de APKs y Gestor de Archivos en `/sdcard/`

1. **Repositorio Centralizado de APKs (`server/services/apk_repository.py`, `server/routes/apks.py`):**
   - Metadatos indexados en SQLite (`instances/apks.db`) y binarios almacenados por hash SHA-256 en `apk_repo/<sha256>.apk`.
   - Subida streaming con límite configurable de 150 MB (`APK_MAX_SIZE_BYTES`), deduplicación automática, validación de firma ZIP PK y extracción de metadatos mediante `aapt2 dump badging` (`package_name`, `version_name`, `version_code`, `app_name`, `icon`). Rechazo de contenedores `.apks`/`.xapk`.
   - Hook de aprovisionamiento en arranque: `create_instance_async` instala asíncronamente las APKs con flag `is_default` una vez detectado `getprop sys.boot_completed == 1` sin retrasar el retorno de la API.
2. **Gestor de Archivos de Instancia (`server/services/file_manager.py`, `server/routes/files.py`):**
   - **Whitelist Estricta:** Solo se permite acceso a `/sdcard/Download`, `/sdcard/DCIM`, `/sdcard/Pictures` y `/sdcard/Documents`.
   - **Validación Dual de Rutas:** Validación léxica previa en Python (`posixpath.relpath`, bloqueo de caracteres especiales y secuencias de escape `..`) complementada con resolución física canónica en el invitado (`realpath` ejecutado en el shell de Android) para prevenir escapes de sandbox o enlaces simbólicos maliciosos.
   - **Operaciones Seguras:**
     * Listado con `find -maxdepth 1 -print0` y `stat` formateado entre comillas dobles (evitando interpretación de `|` como pipe).
     * Subida multipart vía ADB push con sufijo anti-sobrescritura (`foto (1).png`) y escaneo multimedia inmediato (`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE`).
     * Descarga segura por streaming binario y borrado atómico con `rm -rf --` escapado con `shlex.quote`.
     * Acción directa `send-to` para transferir archivos entre instancias sin pasar por el disco del host.

### 5.5 Límites operativos

- **Exclusividad de Video:** Solo un cliente scrcpy puede decodificar video por dispositivo. El modo lazy garantiza que el cambio de foco libere el socket anterior antes de conectar el nuevo.
- **Techo de Fluidez:** El render del invitado ReDroid está calibrado a 30 FPS (`RENDER_FPS`), coincidiendo con la tasa negociada en el pipeline WebCodecs.
- **Exclusividad de Menús:** La interfaz web implementa un store de popover único (`popoverStore.ts`): abrir un popover en el riel de control, en la barra inferior o en la cabecera cierra cualquier otro menú flotante abierto.

---

## 6. Arquitectura de Red, Aislamiento T=0 y Enrutamiento USB Móvil

### 6.1 Principios e Invariantes de Seguridad de Red

ProteoMesh implementa un aislamiento de red multinivel que garantiza **Cero Contaminación con la red del Host**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Contenedor ReDroid (Android 13 Guest)                                  │
│ - Interfaz: eth0 (172.17.0.X)                                          │
│ - Sin túneles VPN internos ni marcas TRANSPORT_VPN observables por apps│
│ - PM_QUARANTINE (OUTPUT drop excepto 172.17.0.1/32)                    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ veth
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Host Linux Kernel (DOCKER-USER & Policy Routing)                       │
│                                                                        │
│ 1. DOCKER-USER Chain:                                                  │
│    -s 172.17.0.X -j PM_NET_<instancia>                                 │
│                                                                        │
│ 2. PM_NET_<instancia> Chain:                                           │
│    -d 172.17.0.1/32 -j RETURN                 (Permite ADB, ws-scrcpy) │
│    -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN                │
│    -o <usb_iface> -j RETURN                   (Permite SOLO módem USB) │
│    -j DROP                                    (Bloqueo total a ISP)    │
│                                                                        │
│ 3. Linux Policy Routing:                                               │
│    ip rule add from 172.17.0.X lookup <table_id> prio 1000             │
│    ip route replace default via <gateway> dev <usb_iface> table <id>   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 ▼                                   ▼
       Módem USB Físico RNDIS              Drop Inmediato (ISP Host)
     (Salida de Datos Móviles)           (wlan0 / enp34s0 Bloqueadas)
```

1. **Pre-cuarentena en T=0 (VULN-01):**
   Antes de invocar `docker run`, `instance_manager.py` predice la próxima IP en el bridge Docker (`predict_next_container_ip`) y registra la regla de bloqueo en `DOCKER-USER`. Cuando el contenedor arranca y envía sus primeros paquetes de inicialización, estos son descartados inmediatamente en el kernel del host antes de que Android complete el boot.
2. **Aislamiento de Puertos de Gestión (VULN-02 y VULN-03):**
   - El daemon ADB de cada contenedor (`5555/tcp`) se publica exclusivamente en loopback local: `127.0.0.1:{adb_port}`.
   - Los túneles SSH de salida y puentes DNS (`dns_bridge.py`) escuchan únicamente en la interfaz interna del puente Docker (`172.17.0.1`).
3. **Aislamiento Lateral Inter-Contenedor (VULN-05):**
   Tanto en la cadena `PM_NET_*` del host como en `PM_QUARANTINE` del contenedor, la regla de exclusión está acotada estrictamente a la IP del host (`172.17.0.1/32`), impidiendo que un contenedor comprometido pueda escanear o atacar otros contenedores en `172.17.0.0/16`.
4. **Reconciliación Automática en Arranque (FRAG-01):**
   FastAPI ejecuta una rutina de auto-reconciliación en `startup_event` que consulta los contenedores activos en Docker, liberando leases huérfanos en `leases.db` y purgando cadenas `PM_NET_*` residuales de instancias caídas de forma no limpia.
5. **Persistencia Atómica bajo Concurrencia (FRAG-02):**
   Toda modificación en `meta.json` y `profile.json` se ejecuta bajo un cerrojo exclusivo `fcntl.flock` con reemplazo atómico de archivo temporal (`os.replace`), garantizando consistencia contra carreras TOCTOU.
