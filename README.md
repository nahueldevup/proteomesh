# ProteoMesh 🛡️📱

**ProteoMesh** es una plataforma de virtualización, endurecimiento (*hardening*), simulación de hardware móvil y evasión de detección de root/emulación para contenedores Android (**ReDroid 13 / API 33**) sobre Linux x86_64. Su arquitectura profile-driven (estilo GeeLark / GenFarmer) permite instanciar y operar granjas de dispositivos móviles (*CloudPhones*) simulando con precisión matemática y física cualquiera de **17 dispositivos comerciales oficiales** con operadoras y geolocalizaciones consistentes.

El entorno neutraliza exhaustivamente las heurísticas de detección de emuladores, virtualización, frameworks de instrumentación (Xposed/Frida) y análisis de root local, auditado contra las herramientas más exigentes del ecosistema: `Pixelscan Android Checker` (**100/100 Low Risk**), `Root Detection Plus` (**0/39 Detecciones**), `Device Info`, `DevCheck`, `Google Play Protect` y `FingerprintJS Pro`.

---

## 🎯 Objetivo y Genuinidad

ProteoMesh busca que cada instancia sea **indistinguible de un teléfono físico real para todo lo que una app puede observar**, no solo para un benchmark puntual. La *genuinidad* se define como **coherencia holística**: todas las capas del sistema deben contar la misma historia, sin valores `unknown`, sin mezclas de fabricantes y sin contradicciones internas entre Java, Bionic libc, sysfs y procfs.

Los cuatro pilares del proyecto son:

1. **Individualidad de hardware:** dos instancias nunca comparten IMEI/MEID, número de serie, Android ID, MACs (Wi-Fi y Bluetooth), BSSID, UUIDs de DRM, huella de pantalla ni identificadores de compilación.
2. **Coherencia estricta de perfil:** un Galaxy A54 5G debe verse como Exynos 1380 + GPU Mali-G68 + sensores STMicroelectronics + Galaxy Store en SoC, GPU, HALs, props, cámaras, sensores, tienda oficial y telemetría; cualquier remanente Qualcomm, Xiaomi o Pixel es una firma delatora inmediata.
3. **Blindaje anti-root multi-capa por aplicación:** Magisk 30.6 y LSPosed permanecen plenamente operativos para la administración del laboratorio, pero las aplicaciones cliente no pueden detectar binarios `su`, puntos de montaje, paquetes de administración, variables de entorno sospechosas (`LD_PRELOAD`) ni clases de hooking.
4. **Eficiencia operativa:** render interno `720x1280 @ 30fps` con reporte lógico del panel real de 90Hz/120Hz, permitiendo sostener múltiples instancias simultáneas en servidores sin GPU dedicada y sin delatar el rasterizado por software.

---

## 🚀 Capacidades Principales

### 1. Catálogo Oficial de 17 Dispositivos (Android 13 / API 33)
Perfiles de hardware completos y validados basados en dumps oficiales de firmware:
* **Samsung:** Galaxy A14 4G, A24 4G, A34 5G, A54 5G, A04s, Galaxy S21 5G.
* **Xiaomi / Redmi:** Redmi Note 12 4G, Redmi Note 12S, Redmi Note 13 4G, Redmi 12 4G, Redmi 13C.
* **Motorola:** Moto G54 5G, Moto G84 5G, Moto G23, Moto G13, Moto G32.
* **Google:** Pixel 5 (`redfin`).

Cada plantilla (`templates/<marca>/<modelo>.json`) declara:
* **SoC y CPU:** Topología de clústeres multieje (Qualcomm Kryo, MediaTek Helio/Dimensity, Samsung Exynos), frecuencias exactas en kHz y gobernadores.
* **GPU y Pantalla:** Renderizadores oficiales (Adreno, Mali, PowerVR) con resolución nativa, DPI y tasa de refresco (60Hz, 90Hz, 120Hz).
* **Cámaras y Sensores:** Especificaciones de lentes ópticos CMOS y matrices MEMS físicas fidedignas (STMicroelectronics, Bosch Sensortec, AMS, Sensortek), excluyendo sensores inexistentes en hardware real (p.ej. giroscopios en gama de entrada).
* **Identidad de Rango:** TAC oficial de 8 dígitos GSMA y prefijos OUI IEEE de direcciones MAC del fabricante.

### 2. Capa de Telefonía, Operadoras y Geolocalización
* **Operadoras Móviles:** Perfiles desacoplados (`carriers/ar_claro.json`, `ar_personal.json`, `ar_movistar.json`) con MCC/MNC oficiales, prefijos IMSI, ICCID y formatos de numeración.
* **Sincronización de Zona Horaria:** Alineación automática del reloj del sistema con la región de la operadora (`America/Argentina/Buenos_Aires`), eliminando discrepancias de geolocalización IP en auditorías (`geo_mismatch_timezone`).
* **Módem y Banda Base:** Cadenas de firmware de módem reales por plataforma (eliminando por completo valores `unknown`).

### 3. Blindaje Anti-Root y Evasión de Detección Multi-Capa
El sistema evade exhaustivamente la detección de root y manipulación en aplicaciones x86_64 nativas y ARM64 traducidas:
* **Aislamiento de Montajes (Zygisk NoHello v0.0.7):** Desmontaje selectivo por namespace de montajes Magisk (`tmpfs`/`overlay`), `/sbin` y `/system/etc/hosts` para apps registradas en la DenyList de Magisk (sin requerir enforce global para preservar GMS).
* **Ocultamiento Nativo en Bionic C (`libpixel_hw.so`):** Retorno de `ENOENT` en `access`, `faccessat`, `stat`, `statx` y `readlink` para `/data/adb/*` y artefactos de root; sanitización en memoria vía `memfd` de `/proc/self/environ` descartando `LD_PRELOAD`; e inyección de shim en `execve` para subprocesos shell (`sh -c "[ -e ... ]"`).
* **Intercepción de Framework en Java (LSPosed `FakeWifiPixel.apk`):** Intercepción de `ApplicationPackageManager` (`getPackageInfo`, `getApplicationInfo`, `getInstalledPackages`) arrojando `NameNotFoundException` vía `param.setThrowable()` para ocultar Magisk (oficial y forks), KernelSU, APatch, KingRoot, SuperSU, LSPosed, Frida y utilidades de modding/cloak. Sanitización de entorno en `ProcessEnvironment.getenv()` y `android.system.Os.environ()`.
* **Sincronización Automática Total (`manage-spoof sync`):** En cada arranque, detecta automáticamente todas las apps de usuario instaladas (`pm list packages -3`) y las agrega tanto al Scope de LSPosed como a la DenyList de Magisk, protegiendo cualquier app nueva sin configuración manual.

### 4. Ecosistema Google y Compatibilidad de Aplicaciones
* **Pixelscan Android Checker (100/100 Low Risk):** Consistencia fidedigna en las 6 categorías de entorno (Hardware, Red, SO, Sensores, Pantalla e Integridad). Stubs ultraligeros de tiendas de fabricante (`samsung_galaxy_store.apk`, `xiaomi_getapps.apk`, `huawei_appgallery.apk`) combinados con hooks dinámicos de `PackageManager`.
* **Bypass de Certificación de Google Play Protect:** Intercepción a nivel de IPC en `GmsDeviceComplianceResponse` y neutralización de `UncertifiedDeviceActivity`, permitiendo el acceso directo y oficial a Google Play Store.
* **Stack de Red Chromium Cronet en Google Search:** Exposición de `libcronet.so` en `/system/etc/public.libraries.txt` para autorizar al linker dinámico de Bionic en Android 13.
* **Compatibilidad Ashmem (Chromium / Memfd):** Shim v3/v5.1 en `libpixel_hw.so` implementando `/dev/ashmem` sobre `memfd_create` con sellos `GROW|SHRINK` exigidos por Chromium 155+ (crbug 498720726).
* **Protección Contra Fugas de Kernel Host:** Sustitución de `uname` y `/proc/version` reportando el kernel oficial GKI de Google (`5.10.149-android12-9-...`), erradicando cualquier firma del kernel anfitrión (`cachyos`).

---

## 🛠️ Arquitectura de Tres Capas

```text
┌────────────────────────────────────────────────────────────────────────┐
│  Aplicaciones Cliente / Tiendas / SDKs Antifraude                      │
│  (Play Store, Pixelscan, Root Detection Plus, Apps Bancarias)          │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │  LSPosed Framework (Zygisk Companion en ART)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  CAPA 1: Framework Java / IPC (FakeWifiPixel.apk)                      │
│  - android.os.Build & SystemProperties por perfil oficial              │
│  - android.hardware.camera2 & SensorManager (MEMS fidedignos)          │
│  - android.view.Display (modos, Hz, xdpi/ydpi lógicos)                 │
│  - android.net.wifi.WifiManager & TelephonyManager                     │
│  - GmsDeviceComplianceResponse (Play Protect Bypass)                   │
│  - Intercepción de PackageManager (Brand Stores + hidePkgHook)         │
│  - Sanitización de entorno en ProcessEnvironment y android.system.Os   │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │  LD_PRELOAD (Bionic Libc en Zygote)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  CAPA 2: Runtime Bionic C (libpixel_hw.so 64 y 32 bits)                │
│  - uname() -> Kernel Android GKI 5.10.149 oficial sin fugas host      │
│  - sysinfo() -> Memoria RAM LPDDR fidedigna del perfil                 │
│  - open("/proc/cpuinfo") / ("/proc/version") -> Tablas del SoC         │
│  - Anti-Root Bionic: ENOENT en /data/adb/* y binarios de root          │
│  - proc_snapshot: memfd de /proc/self/{environ,maps,smaps,numa_maps}   │
│  - execve: propagación de LD_PRELOAD a subprocesos de shell            │
│  - sysfs de red virtual: wlan0 con MAC del perfil (eth0 oculta)        │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │  Init & Zygote Fork
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  CAPA 3: Sistema Base, Init y Aislamiento de Montajes                  │
│  - profile-loader nativo en C: inyección de props vía resetprop        │
│  - Zygisk NoHello v0.0.7: unmount de /sbin, hosts y overlays Magisk    │
│  - Magisk DenyList coordinado (sin enforce global para preservar GMS)  │
│  - Stubs APK de tiendas nativas (Galaxy Store, GetApps, AppGallery)    │
│  - Redirección y enlace de public.libraries.txt (Cronet)               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Matriz de Validación de Calidad

Resultados comprobados en instancias reales de producción (`verify-a54`, `inst-note13`, `hide-test` y `f05-main` sobre `data-clean`):

| Herramienta / Prueba | Categoría Auditada | Métrica Obtenida | Estado |
|---|---|---|---|
| **Pixelscan Android Checker** | **Environment Risk Score** | **100 / 100** | 🏆 **Low Risk (Verde)** |
| **Root Detection Plus** | Root / Jailbreak Detection | **0 / 9** Detecciones | ✅ 100% Not Detected |
| **Root Detection Plus** | Hooking Detection (Frida, Xposed, Zygisk...) | **0 / 7** Detecciones | ✅ 100% Not Detected |
| **Root Detection Plus** | Developer Mode & USB Debugging | **0 / 3** Detecciones | ✅ 100% Not Detected |
| **Root Detection Plus** | Boot Integrity Signals | **0 / 13** Detecciones | ✅ 100% Not Detected |
| **Root Detection Plus** | Virtual Environment (Emulador/Custom ROM) | **0 / 5** Detecciones | ✅ 100% Not Detected |
| **Root Detection Plus** | Dangerous Apps / Modding Tools | **0 / 2** Detecciones | ✅ 100% Not Detected |
| **Root Detection Plus** | **Total General** | **0 / 39 Detecciones** | 🏆 **100% Clean (0 Issues)** |
| **ArchProbe (Sonda Interna)** | SoC / CPU / Kernel / Net / Maps | **0 fugas de host / 0 x86_64** | 🏆 **Coherencia Total** |

> **F0.5 (2026-10-22, cerrada):** Pixelscan **100/100** y Root Detection Plus **0/39** fueron revalidados en `f05-main`, creada desde el `data-clean` original. RDP ya estaba instalado y licenciado en la base; no hizo falta cuenta nueva ni excepción. Evidencia en `tests/results/f05-main/` y detalle en `docs/ESTADO_ACTUAL.md`.

---

## 📋 Guía Rápida de Uso

### 1. Construir la Imagen Docker Base
```bash
# Compilar interceptores nativos y módulo Java (si hubo cambios)
bash src/libpixel_hw/build.sh
bash src/lsposed_module/build_apk.sh

# Construir la imagen golden unificada
DOCKER_BUILDKIT=1 docker build -t proteomesh:latest .
```

### 2. Verificar Dependencias y `data-clean`
```bash
# Verificar NoHello/Magisk y los artefactos locales contra modules.lock
python3 tools/deps_fetch.py verify

# Ensayar el bootstrap reproducible de data-clean (no escribe)
bash tools/bootstrap_data_clean.sh --dry-run

# Regresión host-side del manager (validación de nombres)
python3 -m unittest discover -s tests/host -v
```

### 3. Gestionar Instancias con `instance_manager.py`

El gestor admite dos modalidades operativas según el objetivo:

#### Modo A: Instancias Únicas para Granjas Masivas (`--template`)
Cada invocación genera un IMEI (Luhn válido), MAC Wi-Fi, MAC Bluetooth, Serial y Android ID **completamente aleatorios y únicos**. Ninguna instancia comparte huella:
```bash
# 1. Listar plantillas de hardware y operadoras disponibles
python3 tools/instance_manager.py list-templates
python3 tools/instance_manager.py list-carriers

# 2. Crear una nueva instancia con identidad única y límites de recursos (RAM, CPUs, PIDs)
python3 tools/instance_manager.py create --name mi-a54-01 --template samsung/a54x --carrier ar_personal --port 5584 --memory 4g --cpus 2.0 --pids-limit 2048 --start
```

#### Modo B: Congelamiento de Hardware y Migración sin Alertas de Fraude (`--from-bundle`)
Diseñado para cuentas enroladas de alto valor (MercadoPago, banca móvil, WhatsApp). Permite "congelar" la identidad de un teléfono en un **bundle** reproducible: si el contenedor se daña o se migra de servidor físico, se recrea con **exactamente el mismo hardware** (mismo IMEI, MAC y Android ID), evitando que los sistemas antifraude bloqueen la cuenta por "cambio inesperado de dispositivo":
```bash
# 1. Renderizar determinísticamente un bundle congelado (mismo seed = misma huella bit-a-bit)
python3 tools/render.py --template samsung/a54x --carrier ar_personal --seed 42 --name mi-a54 --out bundles/mi-a54

# 2. Crear la instancia importando el bundle congelado (respeta la identidad al 100%)
python3 tools/instance_manager.py create --name mi-a54-prod --from-bundle bundles/mi-a54 --port 5586 --start
```

#### Operación, Salud y Verificación
```bash
# Visualizar la pantalla del dispositivo mediante scrcpy
scrcpy -s 127.0.0.1:5584

# Detener, reiniciar o comprobar salud post-arranque (7 checks automáticos)
python3 tools/instance_manager.py stop mi-a54-01
python3 tools/instance_manager.py start mi-a54-01 --verify-health
python3 tools/instance_manager.py verify-health mi-a54-01

# Tras instalar una app, sincronizar scope LSPosed + DenyList y reiniciar
python3 tools/instance_manager.py sync-scope mi-a54-01 --package <paquete>
```

---

## 📚 Documentación Técnica Detallada

* **[Guía Maestra de Blindaje Anti-Root y Replicación](docs/GUIA_DE_REPLICACION_ANTIROOT.md):** Manual exhaustivo con causas raíz, procedimientos de replicación en instancias existentes, automatización para nuevas instancias e inventario detallado de cada archivo modificado.
* **[Arquitectura Integral del Sistema](docs/ARQUITECTURA.md):** Especificación profunda del modelo de tres capas, flujo GeeLark, evasión de tiendas y mecanismos GMS.
* **[Guía de Reproducción y Despliegue](docs/GUIA_DE_REPRODUCCION.md):** Manual paso a paso para compilar binarios nativos, construir imágenes y operar instancias.
* **[Bitácora Histórica y Estado del Proyecto](docs/BITACORA_Y_ESTADO.md):** Registro cronológico detallado de todos los retos técnicos (§1 a §49), causas raíz, tombstones resueltos y métricas.

---

## ⚠️ Limitaciones Conocidas y Alcance Técnico

* **Attestation por hardware (StrongBox / TEE):** la evidencia se sintetiza en userspace y framework; no se emula un chip TEE/Knox físico ni claves criptográficas de fábrica para `MEETS_STRONG_INTEGRITY`. Al ser un entorno virtualizado en la nube, el límite físico alcanzable con PIF es `MEETS_BASIC_INTEGRITY` y `MEETS_DEVICE_INTEGRITY`.
* **Capacidad del host:** con 13–16 GB de RAM el laboratorio opera de forma óptima hasta 2 instancias concurrentes con renderizado fluido por software.
* **Metadatos de red nativos:** `/proc/net/{dev,route,arp,tcp}` y `/sys/class/net/` se sirven virtualizados (interfaz `wlan0`, subred `192.168.1.0/24`, MAC de router coherente y `eth0` oculta). Residual: `lstat("/sys/class/net/wlan0")` se ve como directorio y el árbol ficticio `/system/etc/proteomesh` es descubrible por inspección exhaustiva de root.
* **Cobertura 32-bit (x86):** el `zygote32` preloada el shim 32-bit (`libpixel_hw.so`) y el companion Zygisk 32-bit arranca con inyección verificada en apps x86 de 32 bits. Se omite la recarga dinámica de `ndk_translation` en 32 bits (workaround de Magisk i386), por lo que apps legacy con libs exclusivas `armeabi-v7a` no arrancan (el camino 64-bit ARM64 no se ve afectado).
* **Artefactos de scroll en Chromium:** en Chrome/Brave/WebView los flings rápidos pueden mostrar checkerboarding en SwiftShader/ANGLE debido al rasterizado por CPU en el contenedor.

---

## 📄 Notas de Uso
Este proyecto es un entorno de investigación técnica avanzada sobre virtualización, namespaces, frameworks de integridad, análisis de telemetría y capas de abstracción en Android. Diseñado para pruebas de rendimiento, investigación en ciberseguridad y robustez de aplicaciones móviles.
