# Registro de Estado y Bitácora de Endurecimiento de ProteoMesh

Este documento resume los avances técnicos logrados, los desafíos resueltos y el estado validado de cada subsistema de emulación.

---

## 1. Tabla de Estado por Subsistema

| Subsistema | Estado | Implementación / Mecanismo | Validación Verificada |
|---|---|---|---|
| **Identidad Pixel 5 (`redfin`)** | **100% Funcional** | `mask-early.sh` en `post-fs-data` + `apply-props.sh` en `boot_completed`. | Modelo Pixel 5, huella oficial TQ3A, bootloader bloqueado (`green`). |
| **SoC Snapdragon 765G (`SM7250`)** | **100% Funcional** | `/data/local/tmp/fake_proc/cpuinfo` + props estáticas en `Build.HARDWARE`. | Reportado en `Device Info` y `DevCheck` con cluster octa-core (1+1+6). |
| **Arquitectura de CPU / ABIs** | **100% Funcional** | Hook Java reflexivo en `Build.SUPPORTED_ABIS` + sysprops `abilist`. | `arm64-v8a, armeabi-v7a, armeabi` sin fugas de `x86_64` o `x86`. |
| **Kernel Linux Spoofing** | **100% Funcional** | Hook de Bionic `uname()` en `libpixel_hw.so` (`LD_PRELOAD`). | Reporta kernel Google `4.19.282-g9e27c0faec01` sobre kernel host CachyOS 7.x. |
| **Memoria RAM y Almacenamiento** | **100% Funcional** | Hooks Bionic `sysinfo()`, `statvfs()` y `statfs()` en `libpixel_hw.so`. | Reporta 8 GB RAM LPDDR4X y 128 GB UFS ocupando < 2 GB físicos en host. |
| **GPU / Aceleración Gráfica** | **100% Funcional** | Render software SwiftShader/ANGLE mapeado a `Adreno (TM) 620`. | Validación en OpenGL ES 3.1 / 3.2 sin colapso gráfico. |
| **Red Wi-Fi 5 GHz** | **100% Funcional** | `FakeWifiHook.java` interceptando `WifiManager`, `WifiInfo` y `NetworkCapabilities`. | Reporta `wlan0`, 866 Mbps, 5180 MHz (Canal 36), RSSI -52 dBm y DHCP válido. |
| **Telefonía y SIM Móvil** | **100% Funcional** | `FakeWifiHook.java` interceptando `TelephonyManager`. | SIM Personal Argentina (MCC/MNC `72234`), red `LTE` 4G, SIM lista y 1 módem. |
| **Sensores de Hardware (11)** | **100% Funcional** | `FakeSensors.java` con hilos concurrentes y micro-ruido termal. | 11 sensores activos en `Device Info` y liveness test aprobado en `Pixelscan`. |
| **Cámaras Pixel 5 (x3)** | **100% Funcional** | `FakeWifiHook.java` (39 claves `CameraCharacteristics`) + `handheld_core_hardware.xml`. | Principal (12.2 MP f/1.7), Frontal (8 MP) y Gran angular (16 MP f/2.2) activas. |
| **Zygisk 64-bit y Magisk 30.6** | **100% Funcional** | Parche `isCompatibleWith` en offset `0x3284f` (`\xb0\x01`) en `libzygisk.solibnb.so`. | Daemons `zygiskd64` y `zygiskd32` activos concurrentemente en el boot. |
| **Framework LSPosed (v1.9.2)** | **100% Funcional** | Exclusión de `/data/adb/lspd` en filtro root de `pixel_hw64.c`. | Estado **Activado** en LSPosed Manager e inyección en apps cliente. |
| **Detección de Emulador (Pixelscan)** | **Neutralizada** | Inclusión en scope + saneamiento de ABIs x86. | **Emulator detection: Not detected** (marcador `cpu:x86_abi` neutralizado). |

---

## 2. Lecciones Aprendidas y Desafíos Resueltos

### 1. Desfase de Offsets en Binarios Recompilados
* **Problema:** En intentos previos de parchear `isCompatibleWith(3)`, se utilizaban offsets antiguos (`0x5b6f7` o `0x5d970`) que ya no coincidían con la compilación actual de Magisk, lo que provocaba corrupción de memoria e impedía que `zygiskd64` arrancara.
* **Solución:** Se analizó el desensamblado con `objdump` y búsqueda de patrones de bytes (`\x31\xc0\x48\x83\xc4\x38\x5b\x41\x5c`), identificando el offset exacto actual en **`0x3284f`**.

### 2. Bloqueo Involuntario de IPC en Filtro Anti-Root
* **Problema:** El gancho nativo de ocultación de root en `pixel_hw64.c` bloqueaba cualquier ruta que comenzara con `/data/adb`. Esto provocaba que los procesos cliente con `UID >= 10000` recibieran `-ENOENT` al intentar leer archivos de configuración y unix sockets en `/data/adb/lspd`, deshabilitando silenciosamente la inyección de LSPosed.
* **Solución:** Se añadió una excepción explícita para `/data/adb/lspd`, preservando la ocultación de Magisk y su binaries (`/data/adb/magisk`, `su`) sin obstaculizar la comunicación del framework.

### 3. Fuga de ABIs en Variables Finales de Java
* **Problema:** Aunque las propiedades del sistema (`ro.product.cpu.abilist`) estaban enmascaradas en `apply-props.sh`, aplicaciones desarrolladas en Flutter (`net.pixelscan.check`) leen directamente `Build.SUPPORTED_ABIS` y el campo `primaryCpuAbi` del `ApplicationInfo`. Al encontrar `x86_64`, marcaban inmediatamente al sistema con `cpu:x86_abi`.
* **Solución:** Se implementó una sobrescritura reflexiva sobre los campos estáticos finales de `android.os.Build` en `FakeWifiHook.java` tan pronto como se carga el proceso en Zygote.

### 4. Sincronización del Scope de LSPosed
* **Problema:** Reinstalar o actualizar un módulo Xposed altera el identificador numérico interno (`mid`) en `/data/adb/lspd/config/modules_config.db`, desvinculando las aplicaciones autorizadas en la tabla `scope`.
* **Solución:** Se creó y mantuvo la herramienta `/system/bin/manage-spoof`, que actualiza dinámicamente el `mid` correcto y enlaza todas las aplicaciones de prueba mediante una sola orden (`manage-spoof auto`).
