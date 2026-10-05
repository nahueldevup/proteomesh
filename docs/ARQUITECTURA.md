# Arquitectura del Sistema ProteoMesh

ProteoMesh es un framework de endurecimiento (*hardening*), enmascaramiento y simulación de hardware para contenedores Android (**ReDroid 13 / API 33**) sobre kernels Linux x86_64 modernos. Transforma un contenedor ReDroid en un clon fidedigno de un **Google Pixel 5 (`redfin`)** equipado con el SoC **Qualcomm Snapdragon 765G (`SM7250`)**.

El entorno neutraliza las heurísticas de detección de emuladores, virtualización y análisis de integridad local de aplicaciones bancarias y utilidades de diagnóstico (`Device Info`, `DevCheck`, `Pixelscan Android Checker`, `FingerprintJS`).

---

## 1. Modelo de Capas de Intercepción

El sistema opera en tres capas complementarias sin tocar ni requerir parches en el kernel del host:

```
┌────────────────────────────────────────────────────────┐
│  Aplicaciones Android (Device Info, DevCheck, Pixelscan)│
└────────────────────────────────────────────────────────┘
                           │
       LSPosed Framework (Zygisk Companion en Zygote)
                           ▼
┌────────────────────────────────────────────────────────┐
│  Capa Java / IPC: FakeWifiPixel Module                 │
│  - android.os.Build (ABIs, Hardware, Board)            │
│  - android.hardware.camera2 (CameraCharacteristics)     │
│  - android.hardware.SensorManager & SystemSensorManager │
│  - android.location.LocationManager & Location (FakeGps)│
│  - android.net.wifi.WifiManager & WifiInfo             │
│  - android.telephony.TelephonyManager                   │
└────────────────────────────────────────────────────────┘
                           │
       Bionic C Runtime Hooking (LD_PRELOAD en Zygote)
                           ▼
┌────────────────────────────────────────────────────────┐
│  Capa Nativa: libpixel_hw.so                           │
│  - uname() -> Linux 4.19.282-g9e27c0faec01            │
│  - sysinfo() -> 8 GB LPDDR4X RAM                       │
│  - statvfs() / statfs() -> 128 GB UFS Storage          │
│  - __system_property_get() -> Props Pixel 5            │
│  - getifaddrs() -> eth0 traducido a wlan0              │
│  - glGetString() -> Adreno (TM) 620                    │
│  - Filtrado de artefactos root para UID >= 10000       │
└────────────────────────────────────────────────────────┘
                           │
       Init Triggers & Native Bridge Hooking
                           ▼
┌────────────────────────────────────────────────────────┐
│  Capa Sistema / Contenedor:                            │
│  - Props tempranas en post-fs-data (mask-early.sh)     │
│  - Bridge Zygisk 64-bit parcheado (0x3284f)            │
│  - Features XML Pixel 5 (handheld_core_hardware.xml)   │
│  - Parche memfd en libcutils.so                        │
└────────────────────────────────────────────────────────┘
```

---

## 2. Componentes Clave

### A. Capa Nativa (`src/libpixel_hw/`)
* **`pixel_hw64.c` y `pixel_hw32.c`:**
  Bibliotecas compartidas inyectadas vía `LD_PRELOAD` en los procesos Zygote.
  * Interceptan `uname()` para reportar el kernel oficial de Google Pixel 5.
  * Interceptan `sysinfo()` y `statvfs()` para simular 8 GB de RAM y 128 GB de memoria interna sin consumirlos físicamente en el host.
  * Ocultan rutas de binarios root (`/sbin/su`, `/system/bin/su`, `/data/local/su`) retornando `-ENOENT` a cualquier proceso con `UID >= 10000`, pero permitiendo explícitamente el acceso a `/data/adb/lspd` para que el framework LSPosed mantenga comunicación IPC con sus módulos.
  * Interceptan `getifaddrs()` para renombrar interfaces de red a nivel de socket nativo (`eth0` -> `wlan0`).

### B. Módulo LSPosed (`src/lsposed_module/`)
Compilado como APK firmado (`FakeWifiPixel.apk`) con `javac --release 8` y R8/D8:
* **`FakeWifiHook.java`:**
  * **Build ABIs:** Sobrescribe los campos estáticos finales de `android.os.Build` (`SUPPORTED_ABIS`, `SUPPORTED_64_BIT_ABIS`, `SUPPORTED_32_BIT_ABIS`, `CPU_ABI`) fijándolos a `arm64-v8a, armeabi-v7a, armeabi` y eliminando cualquier referencia a arquitecturas `x86_64` o `x86`.
  * **Cámara Pixel 5:** Registra 3 cámaras físicas (`0` Trasera principal de 12.2 MP f/1.7, `1` Frontal de 8 MP f/2.0, `2` Ultra gran angular de 16 MP f/2.2). Provee un diccionario de 39 constantes de `CameraCharacteristics` (AE, AF, distorsión, rangos de FPS, StreamConfigurationMap) para que el subsistema de cámara no colapse con *"Cámara no encontrada"*.
  * **Red Wi-Fi 5 GHz:** Intercepta `WifiManager` y `WifiInfo` simulando conexión activa a 866 Mbps en 5180 MHz (Canal 36) con SSID y BSSID realistas, y entrega configuración DHCP coherente (IP `172.18.0.2`, puerta de enlace `172.18.0.1`, DNS Google).
  * **Telefonía y SIM:** Intercepta `TelephonyManager` para exponer SIM en estado `READY` bajo la operadora **Personal Argentina** (código de red `72234`, red `LTE` 4G, 1 módem activo).
* **`FakeSensors.java`:**
  * Simula los 11 sensores físicos de hardware oficiales del Pixel 5 (Bosch Sensortec BMI260 para acelerómetro y giroscopio, Asahi Kasei AK09918 para magnetómetro, AMS TMD3702 para luz y proximidad, Bosch BMP380 para presión barométrica, contador de pasos y sensores compuestos).
  * Despacha eventos en hilos concurrentes simulando gravedad ($9.80665\ \text{m/s}^2$) y micro-fluctuaciones térmicas dinámicas para superar pruebas de liveness físicas.
  * Intercepta `SystemSensorManager.getFullSensorList()` y los métodos de registro de listeners (`registerListenerImpl` / `unregisterListenerImpl`).
* **`FakeGps.java`:**
  * **Emulación GNSS / GPS:** Intercepta `LocationManager` (`getLastKnownLocation`, `getCurrentLocation`, `requestLocationUpdates`, `getAllProviders`, `getProviders`, `isProviderEnabled`, `isLocationEnabled`) proveyendo el proveedor `"gps"` ausente en contenedores ReDroid.
  * **Anti-Detección Mock:** Neutraliza las llamadas a `Location.isFromMockProvider()` y `Location.isMock()` retornando siempre `false`. Inserta metadatos satelitales realistas (14 a 18 satélites GNSS) en `extras` y reporta hardware de chip `Qualcomm SM7250 GNSS` (año 2020).
  * **Micro-ruido Browniano:** Aplica variación física natural de sub-metro ($\pm 0.8\text{ m}$) a las coordenadas fijadas para eludir heurísticas que detectan coordenadas congeladas artificiales.
  * **Controlador Dinámico `set-gps`:** Monitorea cambios en `/data/local/tmp/fake_gps.conf` en tiempo de ejecución, permitiendo cambiar de ciudad o coordenadas al vuelo mediante `/system/bin/set-gps` sin necesidad de reiniciar el contenedor ni reinstalar módulos.

### C. Zygisk 64-bit y Cadena de NativeBridge
* En Android 13, `LoadNativeBridge` verifica la compatibilidad de API mediante `callbacks->isCompatibleWith(3)`. En binarios Magisk, esto finalizaba con `xor eax, eax` (retornando `0` / incompatible).
* Se aplica el parche binario en el offset **`0x3284f`** convirtiendo la instrucción en `mov al, 1` (`\xb0\x01`).
* Se monta `libzygisk.solibnb.so` en `/system/lib64/` y se enlaza la propiedad `ro.dalvik.vm.native.bridge=libzygisk.solibnb.so` para que `zygiskd64` se ejecute concurrentemente con `zygiskd32`.

### D. Declaración de Permisos de Sistema
* **`build_magisk/vendor/etc/permissions/handheld_core_hardware.xml`:**
  Declara los descriptores de hardware oficiales que `PackageManager.hasSystemFeature` inspecciona en tiempo de arranque: cámaras (`android.hardware.camera.any`, `front`, `autofocus`, `flash`, `full`), sensores de hardware y telefonía celular.
