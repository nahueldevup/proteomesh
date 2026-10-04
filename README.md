# ProteoMesh 🛡️📱

**ProteoMesh** es un entorno avanzado de emulación, contención y endurecimiento (*hardening*) de contenedores Android (**ReDroid 13 / API 33**) sobre Linux x86_64. 

El proyecto transforma una instancia de contenedor en un dispositivo móvil fidedigno y consistente frente a herramientas de diagnóstico y heurísticas de detección locales de aplicaciones comerciales, simulando fielmente un **Google Pixel 5 (`redfin`) con procesador Qualcomm Snapdragon 765G 5G (`SM7250`)**, manteniendo un consumo de recursos estrictamente contenido en el host (< 2 GB de RAM real).

---

## 🚀 Características Principales

### 1. Pila de Identidad y Hardware (Google Pixel 5)
* **Procesador / SoC:** Qualcomm Snapdragon 765G 5G (8 núcleos con escalado de frecuencia dinámico y gobernador `schedutil`).
* **Gráficos / GPU:** Adreno (TM) 620 con OpenGL ES 3.2.
* **Memoria y Almacenamiento:** Reporta 8 GB LPDDR4X y 128 GB UFS, manteniendo el uso físico de memoria del contenedor acotado mediante límites Docker (`mem_limit: 2560m`).
* **Pantalla:** Calibración nativa a 1080 x 2340 FHD+, 440 dpi y tasa de refresco a 90 Hz.
* **Kernel:** Enmascaramiento a nivel de Bionic libc reportando el kernel oficial de Google (`Linux version 4.19.282-g9e27c0faec01`).

### 2. Conectividad y Redes
* **Wi-Fi Spoofing:** Traducción transparente de la interfaz de red del contenedor (`eth0`) a `wlan0`. Reporta enlace activo Wi-Fi 5 (802.11ac) a **866 Mbps**, 5 GHz (Canal 36, 5180 MHz), con RSSI de `-52 dBm` (señal al 96% / 4 barras).
* **Operadora Móvil / SIM:** Configuración completa de red celular GSM con operador **Personal Argentina** (MCC: `722`, MNC: `34`, Carrier ID: `1341`), estado de SIM `Listo` / `READY` y conexión de datos `LTE` (4G).

### 3. Sensores y Cámara
* **Sensores de Hardware:** Exposición de los 11 sensores físicos de hardware de Bosch Sensortec y AMS AG:
  * Acelerómetro (`Bosch BMI260`)
  * Giroscopio (`Bosch BMI260`)
  * Magnetómetro / Brújula (`Asahi Kasei AK09918`)
  * Sensor de Luz Ambiental (`AMS TMD3702`)
  * Barómetro / Presión (`Bosch BMP380`)
  * Sensor de Proximidad (`AMS TMD3702`)
  * Sensores de software de Google: Gravedad, Aceleración Lineal, Vector de Rotación, Contador de Pasos y Detector de Pasos.
* **Cámara:** Simulación de subsistema de cámara para evitar bloqueos por ausencia de hardware.

### 4. Pila de Inyección y Compatibilidad Bionic
* **Magisk & Zygisk:** Configuración de NativeBridge (`ro.dalvik.vm.native.bridge`) con applets Zygisk de 64 y 32 bits activos en tiempo de ejecución.
* **Parche Memfd en `libcutils`:** Resolución nativa para kernels modernos (Linux 5.18+, 6.x y 7.x) donde el driver legacy `/dev/ashmem` fue removido, permitiendo que `SharedMemory.create()` utilice `memfd_create` sin fallos.
* **Módulo LSPosed (`FakeWifiPixel`):** Módulo Xposed diseñado a medida que intercepta las APIs del framework Android (`ConnectivityManager`, `WifiManager`, `TelephonyManager`, `SensorManager`, `CameraManager`) directamente en el espacio de usuario.

---

## 📂 Estructura del Repositorio

```text
proteomesh/
├── docker-compose.yml              # Orquestación del contenedor ReDroid
├── Dockerfile                      # Definición de capas base y build
├── prepare-magisk.sh               # Script de preparación inicial de Magisk
├── media_codecs.xml                # Mapeo de códecs multimedia de hardware
├── bin/
│   ├── resetprop                   # Binario de manipulación de propiedades en memoria
│   └── generar-reportes-redroid.sh # Suite de extracción y comparación de diagnósticos
├── build_magisk/
│   ├── system/
│   │   ├── bin/
│   │   │   ├── apply-props.sh      # Aplicación de propiedades en runtime
│   │   │   ├── fake_getenforce     # Spoofing de SELinux Enforcing
│   │   │   ├── manage-spoof        # Herramienta de gestión CLI
│   │   │   └── mask-early.sh       # Motor temprano de enmascaramiento post-fs-data
│   │   ├── build.prop              # Properties de sistema calibradas (Pixel 5)
│   │   ├── etc/init/               # Archivos .rc de arranque del sistema y Zygote
│   │   └── lib64/ & lib/           # Librerías nativas inyectadas (libcutils, libpixel_hw)
│   └── vendor/
│       ├── build.prop              # Properties de vendor calibradas
│       └── lib64/                  # RIL parcheado (libreference-ril.so)
├── src/
│   ├── libpixel_hw/                # Código fuente en C de los hooks de bajo nivel
│   │   ├── pixel_hw64.c            # Interceptor Bionic de 64 bits (syscalls, stat, uname)
│   │   ├── pixel_hw32.c            # Interceptor Bionic de 32 bits
│   │   └── build.sh                # Script de compilación nativa
│   └── lsposed_module/             # Código fuente Java del módulo LSPosed
│       ├── com/fakewifi/pixel/
│       │   └── FakeWifiHook.java   # Hooks de red, telefonía, sensores y cámara
│       └── build_apk.sh            # Script de compilación y empaquetado de APK
├── modules/
│   └── FakeWifiPixel.apk           # Módulo LSPosed compilado y firmado
└── docs/                           # Informes técnicos y guías de reproducción
    ├── HERMES_REPORTES_GUIDE.md
    ├── INFORME_SESION_DROIDGUARD_Y_CONTEXTO.md
    ├── INFORME_TECNICO_Y_REPRODUCCION.md
    └── IDEA.md
```

---

## 🛠️ Requisitos Previos

* **Host OS:** Linux x86_64 con Docker y Docker Compose instalados.
* **Módulos de Kernel en el Host:**
  * Soporte de IPC Android: `binder_linux` o kernel con binderfs habilitado (e.g. CachyOS, Zen Kernel, XanMod o cargado manualmente).
  * Red virtual Wi-Fi (opcional para simulación física): `mac80211_hwsim`.

---

## ⚡ Puesta en Marcha

### 1. Iniciar el Laboratorio
Para levantar el contenedor con todos los montajes y capas de enmascaramiento:

```bash
docker compose up -d
```

### 2. Conectar por ADB
El puerto de depuración queda expuesto en el puerto local `5580`:

```bash
adb connect localhost:5580
adb devices
```

### 3. Verificar Estado y Telemetría
Para verificar que el sistema ha iniciado correctamente y que la pila está activa:

```bash
# Comprobar estado de boot
adb -s localhost:5580 shell getprop sys.boot_completed

# Comprobar identidad del dispositivo
adb -s localhost:5580 shell getprop ro.product.model          # Pixel 5
adb -s localhost:5580 shell getprop ro.soc.model              # SM7250

# Comprobar red e interfaces
adb -s localhost:5580 shell ip addr                           # wlan0 presente, eth0 oculto
```

### 4. Ejecutar la Suite de Reportes
Se incluye una herramienta integral que genera diagnósticos cruzados (consola, `Device Info` y `DevCheck`):

```bash
./bin/generar-reportes-redroid.sh
```

---

## 🔨 Compilación desde el Código Fuente

### Recompilar `libpixel_hw.so` (Hooks nativos C)
```bash
./src/libpixel_hw/build.sh
```

### Recompilar `FakeWifiPixel.apk` (Módulo LSPosed Java)
```bash
./src/lsposed_module/build_apk.sh
```

---

## 📄 Licencia y Notas de Uso
Este proyecto es un laboratorio de investigación técnica sobre virtualización, namespaces y capas de abstracción en Android. Diseñado para pruebas de rendimiento, telemetría y robustez de contenedores en entornos de desarrollo.
