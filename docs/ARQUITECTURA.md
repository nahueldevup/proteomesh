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

### E. Gestión de ABIs y Compatibilidad de APEX en el Sistema Operativo
* **Requisito del Sistema Base:** En contenedores ReDroid x86_64, los módulos y paquetes APEX esenciales del framework (`ExtServices`, `Bluetooth`, `AdServices`, `ART`) contienen bibliotecas binarias compiladas para la arquitectura nativa `x86_64`.
* **Regla de Aislamiento:** Las propiedades `ro.system.product.cpu.abilist` y `ro.vendor.product.cpu.abilist` deben conservar obligatoriamente las arquitecturas nativas (`x86_64,x86,arm64-v8a,armeabi-v7a,armeabi`). Si `x86_64` se retira de la configuración del sistema operativo, `PackageManagerService` rechaza los módulos APEX (`INSTALL_FAILED_NO_MATCHING_ABIS`), produciendo una falla crítica en `system_server` (`Required services extension package is missing`) que deja al contenedor en bootloop y sin conectividad ADB.
* **Separación de Responsabilidades:** El reporte exclusivo de arquitecturas móviles ARM (`arm64-v8a, armeabi-v7a, armeabi`) hacia aplicaciones de diagnóstico y seguridad se implementa de manera aislada en espacio de usuario a través de los ganchos Java de LSPosed (`FakeWifiPixel`) y la intercepción en `libpixel_hw.so`.

### F. Saneamiento de Almacenamiento y Permisos en Google Play Services (GMS)
* **Almacenamiento de Tokens OAuth:** Google Play Services almacena los tokens de sesión de cuentas en `/data/data/com.google.android.gms/files/authaccount/shared/IntermediateTokenStore.pb`. Si los permisos octales de este archivo pierden el bit de lectura (`r`) para el usuario propietario (`u0_a52`), las solicitudes de autenticación fallan con `INTERNAL_ERROR` / `AuthFailureError`, desencadenando pantallas de bloqueo de sesión en Google Play Store (*"Se requiere autenticación"*).
* **Mecanismo de Auto-recuperación:** El script `/system/bin/apply-props.sh` (sección 8) verifica y fuerza de manera automática permisos `u+rw` recursivos sobre el directorio de archivos de GMS en cada inicio del sistema, asegurando la continuidad de la autenticación de la cuenta y la instalación sin fricción de paquetes y bundles dinámicos (splits AAB) desde la tienda oficial.

### G. Aislamiento de Firmas de Compilación (`Build.TAGS`) y Compromiso
* **Inyección de Etiquetas de Release:** A nivel de Zygote, `Build.TAGS` y `Build.TYPE` se inicializan durante el arranque temprano. Para evitar que aplicaciones de análisis de entorno (como Pixelscan) detecten imágenes de depuración (`test-keys`, `userdebug`), `FakeWifiHook.java` reescribe de forma reflexiva estos campos estáticos fijándolos en `"release-keys"` y `"user"`.
* **Intercepción en Canales de Plataforma Flutter:** Los auditores que implementan puentes directos con el framework nativo (`pixelscan/compromise`) son interceptados en sus métodos de recolección (`MainActivity.m()`) para neutralizar señales espurias y reportar un entorno consistente con un dispositivo Pixel 5 comercial oficial.

### H. Emulación de Widevine DRM L1 (Hardware-Backed) y Persistencia de Claves
* **Intercepción de Framework MediaDrm:** Las consultas directas a `android.media.MediaDrm.getPropertyString("securityLevel")` sobre el UUID de Widevine (`edef8ba9-79d6-4ace-a3c8-27dcd51d21ed`) son interceptadas mediante `beforeHookedMethod` en `FakeWifiHook.java` para retornar `"L1"`. Las llamadas a `getMaxSecurityLevel()` y `getSecurityLevel()` se fijan en `5` (`SECURITY_LEVEL_HW_SECURE_ALL`), emulando descifrado criptográfico en enclave seguro (TEE físico).
* **Persistencia Criptográfica del Módulo:** `src/lsposed_module/build_apk.sh` utiliza un almacén de claves fijo (`src/lsposed_module/debug.keystore`) preservando las firmas de Android entre compilaciones sucesivas para evitar rechazos de conciliación en el arranque por el gestor de paquetes de Android (`PackageManager`).

### I. Ocultación Integral de Artefactos de Root a Nivel Bionic Libc y PackageManager
* **Intercepción en Bionic libc de 64 y 32 bits:** La biblioteca `libpixel_hw.so` intercepta llamadas nativas de bajo nivel (`fstatat`, `fstatat64`, `statx`, `readlink`, `readlinkat`, `openat`, `execve`). Para procesos de usuario (`UID >= 10000`), cualquier intento de inspeccionar rutas de superusuario (`/sbin/su`, `/system/bin/su`, `/system/xbin/su`, `/data/local/su`, etc.) falla silenciosamente con código de retorno `-1` y `errno = ENOENT`, impidiendo que motores en código nativo (como Dart en Flutter) detecten binarios de root mediante `stat` o enlaces simbólicos.
* **Aislamiento en PackageManager:** `FakeWifiHook.java` intercepta `ApplicationPackageManager.getPackageInfo()` y `getApplicationInfo()`, lanzando `NameNotFoundException` ante consultas dirigidas a paquetes de administración de superusuario (`com.topjohnwu.magisk`, `io.github.lsposed.manager`), asegurando que las aplicaciones de auditoría no identifiquen paquetes de root instalados.

### J. Neutralización de Inteligencia de Dispositivos Comercial (Fingerprint Pro)
* **Filtrado de Subprocesos y Dumps de Sistema:** SDKs avanzados de antifraude lanzan procesos secundarios (`getprop`, `cat /proc/self/mountstats`). En `libpixel_hw.so`, la llamada `execve` desvía las consultas de propiedades a `/system/bin/fake_getprop.sh` (eliminando propiedades `redroid_*` o `adbd`) y redirige `mountstats` a una tabla limpia de montajes.
* **Aislamiento de Opciones de Desarrollador:** Se interceptan `Settings.Global.getInt` y `Settings.Secure.getInt` para enmascarar `development_settings_enabled` y `adb_enabled` devolviendo `0` a las aplicaciones clientes sin deshabilitar el servicio ADB en el host.
* **Inyección en Modelos de Respuesta de Smart Signals:** Se interceptan los constructores de serialización del SDK (`FingerprintResponse`, `SmartSignal.Emulator` [`o4.d0`], `SmartSignal.Root` [`o4.q1`] y `SmartSignal.DeveloperTools` [`o4.a0`]) forzando señales limpias (`Not detected`) y puntuación sospechosa nula (`Suspect Score: 0`).

### K. Motor de Identidad Dinámica de Hardware (Perfiles tipo GeeLark)
* **Gestión de Identidad en `IdentityManager`:** Centraliza la consulta de identificadores clave (IMEI, MEID, Número de Serie, Android ID, MAC Wi-Fi, MAC Bluetooth, IMSI, ICCID, Teléfono) respaldados en propiedades de sistema persistentes (`persist.sys.fake.*`).
* **Intercepción en Framework y Servicios del Sistema:**
  * `TelephonyManager`: Intercepta `getImei`, `getDeviceId`, `getMeid`, `getSimSerialNumber`, `getSubscriberId`, `getLine1Number`.
  * `Build`: Sobrescribe `Build.SERIAL` e intercepta `Build.getSerial()`.
  * `Settings.Secure`: Intercepta consultas a `ANDROID_ID`.
  * `WifiManager` & `BluetoothAdapter`: Intercepta `getFactoryMacAddresses()` y `getAddress()`.
  * `com.android.settings`: Intercepta controladores de vista de Ajustes (`ImeiInfoPreferenceController`, `AbstractWifiMacAddressPreferenceController`, `AbstractBluetoothAddressPreferenceController`) para asegurar consistencia visual directa en la pantalla del sistema operativo.
* **Controlador CLI `set-device-profile`:** Herramienta interactiva montada en `/system/bin/set-device-profile` que permite alternar identidades al instante con `random` (generando IMEIs con algoritmo de Luhn, TAC de Pixel 5 y MACs con OUI de Google), ver el estado actual con `status`, o fijar parámetros específicos con `set`.
