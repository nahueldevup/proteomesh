# ProteoMesh 🛡️📱

**ProteoMesh** es una plataforma de virtualización, endurecimiento (*hardening*) y simulación de hardware móvil para contenedores Android (**ReDroid 13 / API 33**) sobre Linux x86_64. Su arquitectura profile-driven (estilo GeeLark / GenFarmer) permite instanciar y operar granjas de dispositivos móviles (*CloudPhones*) simulando con precisión matemática y física cualquiera de **17 dispositivos comerciales oficiales** con operadoras y geolocalizaciones consistentes.

El entorno evade heurísticas de detección de emuladores, virtualización y controles de integridad local de aplicaciones bancarias, tiendas oficiales y utilidades de auditoría (`Device Info`, `DevCheck`, `Pixelscan Android Checker`, `Google Play Protect`, `FingerprintJS`).

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
* **Consistencia de Tienda de Fabricante (Pixelscan 75/100):** Stubs oficiales ultraligeros de 2.8 KB en `stubs/` (`samsung_galaxy_store.apk`, `xiaomi_getapps.apk`, `huawei_appgallery.apk`) combinados con ganchos de `PackageManager` en LSPosed, erradicando advertencias de `Brand Store Missing`.
* **Bypass de Certificación de Google Play Protect:** Intercepción a nivel de IPC en `GmsDeviceComplianceResponse` y neutralización de `UncertifiedDeviceActivity`, permitiendo el acceso directo y oficial a la Google Play Store.
* **Stack de Red Chromium Cronet en Google Search:** Exposición de `libcronet.so` en `/system/etc/public.libraries.txt` para autorizar al linker dinámico de Bionic en Android 13, garantizando funcionamiento impecable del Buscador de Google.
* **Protección Contra Fugas de Kernel Host:** Corrección de buffer en C en `libpixel_hw.so` y ganchos de framework que ocultan cualquier huella del kernel anfitrión (`cachyos`), reportando el kernel oficial GKI de Google (`5.10.149-android12-9-...`).

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

## 📄 Notas de Uso
Este proyecto es un entorno de investigación técnica sobre virtualización, namespaces, frameworks de integridad y capas de abstracción en Android. Diseñado para pruebas de rendimiento, telemetría y pruebas de robustez de aplicaciones móviles.