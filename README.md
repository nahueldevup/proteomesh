# ProteoMesh 🛡️📱

**ProteoMesh** es una plataforma de virtualización, endurecimiento (*hardening*) y simulación de hardware móvil para contenedores Android (**ReDroid 13 / API 33**) sobre Linux x86_64. Su arquitectura profile-driven (estilo GeeLark / GenFarmer) permite instanciar y operar granjas de dispositivos móviles (*CloudPhones*) simulando con precisión matemática y física cualquiera de **17 dispositivos comerciales oficiales** con operadoras y geolocalizaciones consistentes.

El entorno evade heurísticas de detección de emuladores, virtualización y controles de integridad local de aplicaciones bancarias, tiendas oficiales y utilidades de auditoría (`Device Info`, `DevCheck`, `Pixelscan Android Checker`, `Google Play Protect`, `FingerprintJS`).

---

## 🎯 Objetivo y Genuinidad

ProteoMesh busca que cada instancia sea **indistinguible de un teléfono físico real para todo lo que una app puede observar**, no solo para un benchmark puntual. La *genuinidad* se define como **coherencia holística**: todas las capas deben contar la misma historia, sin valores `unknown`, sin mezclas de fabricantes y sin contradicciones internas.

Los tres pilares del proyecto son:

1. **Individualidad de hardware:** dos instancias nunca comparten IMEI/MEID, serial, Android ID, MACs, BSSID, UUIDs de DRM, huella de pantalla ni firmas residuales de build.
2. **Coherencia de perfil:** un Galaxy A54 5G debe verse como Exynos 1380 + Mali-G68 + sensores STMicro + Galaxy Store en SoC, GPU, HALs, props, cámaras, sensores, tienda y telemetría; cualquier remanente Qualcomm/Pixel es una firma delatora.
3. **Eficiencia operativa:** render interno `720x1280@30` con reporte lógico del panel real, para sostener instancias en un host pequeño sin delatar el rasterizado por software.

La superficie objetivo cubre identidad (TAC GSMA, OUI IEEE, Luhn), telefonía/SIM, red y geolocalización, build/kernel/props, ABIs, root/SELinux, tiendas oficiales, Play Protect/Play Integrity local, Widevine y detección de emulador/root/Frida. El alcance ampliado y la autocrítica técnica están en [`contexto_explicativo_de_referencia.md`](contexto_explicativo_de_referencia.md); los límites vigentes, en **Limitaciones Conocidas** y en la bitácora (§39).

---

## 🚀 Capacidades Principales

### 1. Catálogo Oficial de 17 Dispositivos (Android 13 API 33)
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

### 3. Evasión Antifraude y Ecosistema de Google
* **Consistencia de Tienda de Fabricante (Pixelscan 75/100):** Stubs oficiales ultraligeros (~4.1 KB, con `MainActivity` lanzable, generados por `tools/build_stubs.sh`) en `stubs/` (`samsung_galaxy_store.apk`, `xiaomi_getapps.apk`, `huawei_appgallery.apk`) combinados con ganchos de `PackageManager` en LSPosed, erradicando advertencias de `Brand Store Missing`.
* **Bypass de Certificación de Google Play Protect:** Intercepción a nivel de IPC en `GmsDeviceComplianceResponse` y neutralización de `UncertifiedDeviceActivity`, permitiendo el acceso directo y oficial a la Google Play Store.
* **Stack de Red Chromium Cronet en Google Search:** Exposición de `libcronet.so` en `/system/etc/public.libraries.txt` para autorizar al linker dinámico de Bionic en Android 13, garantizando funcionamiento impecable del Buscador de Google.
* **Protección Contra Fugas de Kernel Host:** Corrección de buffer en C en `libpixel_hw.so` y ganchos de framework que ocultan cualquier huella del kernel anfitrión (`cachyos`), reportando el kernel oficial GKI de Google (`5.10.149-android12-9-...`).
* **Coherencia de Pantalla (Física vs Lógica):** El compositor de cada instancia renderiza internamente a `720x1280 @ 30fps` (ahorro ~88% de CPU en rasterizado por software), pero las aplicaciones leen el panel real del perfil: resolución lógica (`wm size`), modos soportados, tasa de refresco y densidades físicas `xdpi/ydpi` (ppi) mediante hooks de `android.view.Display` exclusivos para procesos de aplicación. `system_server` y SurfaceFlinger conservan los valores reales, manteniendo coherentes a ADB, `dumpsys` y `scrcpy`.

---

## 🛠️ Arquitectura de Tres Capas

```
┌────────────────────────────────────────────────────────┐
│  Capa de Aplicación y Tiendas (Play Store, Pixelscan)  │
└────────────────────────────────────────────────────────┘
                           │  Zygisk Companion (Zygote)
                           ▼
┌────────────────────────────────────────────────────────┐
│  Módulo LSPosed (FakeWifiHook.java)                    │
│  - android.os.Build, SystemProperties, Camera2, Sensores│
│  - TelephonyManager, WifiManager, Play Protect Bypass  │
└────────────────────────────────────────────────────────┘
                           │  LD_PRELOAD (Bionic Libc)
                           ▼
┌────────────────────────────────────────────────────────┐
│  Capa Nativa C (libpixel_hw.so 64/32 bits)             │
│  - uname(), sysinfo(), /proc/cpuinfo, /proc/version     │
└────────────────────────────────────────────────────────┘
                           │  Init & Boot
                           ▼
┌────────────────────────────────────────────────────────┐
│  Capa de Sistema Base (profile-loader nativo en C)     │
│  - Inyección vía resetprop, síntesis de fake_proc      │
│  - Montajes bind, stubs APK y public.libraries.txt     │
└────────────────────────────────────────────────────────┘
```

---

## 📋 Guía Rápida de Uso

### 1. Construir la Imagen Base
```bash
docker build -t proteomesh:latest .
```

### 2. Gestionar Instancias con `instance_manager.py`
```bash
# 1. Listar plantillas de hardware y operadoras
python3 tools/instance_manager.py list-templates
python3 tools/instance_manager.py list-carriers

# 2. Previsualizar identidad aleatoria válida en rango
python3 tools/instance_manager.py randomize samsung/a54x ar_personal

# 3. Crear una nueva instancia (clona base limpia y congela el perfil)
python3 tools/instance_manager.py create mi-a54-01 samsung/a54x ar_personal --port 5584

# 4. Iniciar la instancia
python3 tools/instance_manager.py start mi-a54-01

# 5. Visualizar la pantalla mediante scrcpy
scrcpy -s 127.0.0.1:5584

# 6. Detener la instancia
python3 tools/instance_manager.py stop mi-a54-01
```

---

## 📚 Documentación Técnica Detallada

* **[Arquitectura Integral del Sistema](docs/ARQUITECTURA.md):** Especificación profunda de las 3 capas, flujo GeeLark, evasión de tiendas y mecanismos GMS.
* **[Guía de Reproducción y Despliegue](docs/GUIA_DE_REPRODUCCION.md):** Manual paso a paso para compilar binarios nativos, construir imágenes y operar instancias.
* **[Bitácora Histórica y Estado del Proyecto](docs/BITACORA_Y_ESTADO.md):** Registro cronológico detallado de todos los retos técnicos, causas raíz y soluciones implementadas.

---

## ⚠️ Limitaciones Conocidas

* **Artefactos de scroll en Chromium:** en Chrome/Brave/Google/WebView los flings rápidos pueden mostrar checkerboarding (frames blancos por tiles sin rasterizar en SwiftShader) y tearing en el stream de scrcpy; Firefox no los reproduce. Se evaluaron flags experimentales en laboratorio (`enable-zero-copy` + `enable-gpu-rasterization` reducen ~84% los cuadros blancos) pero no se adoptaron para preservar el navegador 100% de fábrica sin firmas web; fps 30/60, `use_redroid_c2`, códec VP9 y GPU host descartados. Detalle en [`docs/BITACORA_Y_ESTADO.md`](docs/BITACORA_Y_ESTADO.md), §39-§40.
* **GPU host no adoptada:** se evitó el `SIGSYS` de `kcmp` en Mesa, pero gralloc/GBM de apps, la captura y scrcpy siguen rotos; strings de GPU del host (AMD/Mesa) serían una fuga de genuinidad masiva. El pipeline queda en `guest` (SwiftShader/ANGLE).
* **Metadatos de red nativos:** `/proc/net/dev`, `/proc/net/route`, `/proc/net/arp` y `/proc/net/tcp` se filtran para procesos de app: interfaz `wlan0`, subred `192.168.1.0/24`, IP del dispositivo derivada de la MAC del perfil, gateway `192.168.1.1` con MAC de router propia, y `DhcpInfo`/`WifiInfo` coherentes (misma IP por perfil). Residual: `/sys/class/net/` sigue mostrando la interfaz real del kernel y la MAC cruda queda oculta al framework (T2.2). Detalle en [`docs/BITACORA_Y_ESTADO.md`](docs/BITACORA_Y_ESTADO.md), §42-§44.
* **Attestation por hardware:** la evidencia se simula en framework/userspace; no se emula un TEE/StrongBox físico ni claves de attestation reales.
* **Sensores y cámaras:** son perfiles sintéticos coherentes, no captura física real.
* **Telefonía:** no hay SIM/módem físico; la identidad y el estado de red son simulados por hooks.
* **Capacidad del host:** con 13–16 GB de RAM el laboratorio opera 2 instancias simultáneas; el render es por software.
* **Native bridge ARM64:** las apps ARM64 corren traducidas; queda pendiente la validación específica de Facebook.

---

## 📄 Notas de Uso
Este proyecto es un entorno de investigación técnica sobre virtualización, namespaces, frameworks de integridad y capas de abstracción en Android. Diseñado para pruebas de rendimiento, telemetría y pruebas de robustez de aplicaciones móviles.
