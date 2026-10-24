> **Documento histórico con auditoría.** Las 7 fugas de la §5 se evaluaron contra un estado anterior del laboratorio. Varias ya se resolvieron para instancias creadas por `instance_manager.py` (RAM/storage dinámicos, BSSID/SSID por perfil), pero los fallbacks de `FakeWifiHook`/`profile-loader` siguen existiendo (ver `docs/INVENTARIO_IMAGEN.md` y C19). El estado vigente está en `docs/ESTADO_ACTUAL.md`.

# Documento de Contexto Técnico, Arquitectura y Auditoría Crítica
**Proyecto:** ReDroid Integrity Lab / ProteoMesh  
**Propósito:** Guía técnica exhaustiva, análisis de causa raíz y hoja de ruta post-commit `d1a1c9a` para construir una plataforma de CloudPhones virtualizados al nivel de GeeLark y GenFarmer.  
**Destinatario:** Ingeniero de Software / Agente de IA que asume el proyecto.

---

## 1. Visión y Objetivo de la Infraestructura (Nivel GeeLark / GenFarmer)

El objetivo de ProteoMesh **no es ser un emulador tradicional de escritorio**, sino una plataforma de **CloudPhones Android virtualizados a escala (estilo GeeLark o GenFarmer)** diseñada para la automatización, gestión de identidades y operación de cuentas en redes sociales de alta seguridad (TikTok, Instagram, Facebook, X, Reddit) y aplicaciones financieras/bancarias.

En servicios comerciales como GeeLark o GenFarmer, cada contenedor representa un teléfono móvil físico independiente. Para que las cuentas no sean masivamente bloqueadas (*shadowban* o *device ban*), el sistema debe garantizar **tres pilares innegociables**:

1. **Aislamiento e Individualidad de Hardware:** Dos instancias de la granja **nunca** pueden compartir identificadores de hardware, MACs, BSSIDs de red local, huellas de pantalla, UUIDs de DRM o firmas residuales de compilación.
2. **Genuinidad y Coherencia Holística por Perfil:** Un dispositivo no puede tener propiedades inconsistentes entre sí. Si un contenedor corre el perfil de un **Samsung Galaxy A54 5G**, toda la pila técnica (SoC Exynos 1380, GPU Mali-G68, HALs `s5e8835`/`mali`, sensores STMicroelectronics LSM6DSO, RAM de 6 u 8 GB, particiones UFS y tienda oficial Galaxy Store) debe coincidir al 100%. Mezclar firmas de Qualcomm o Google Pixel dentro de un perfil Samsung o MediaTek es una firma delatora inmediata ante SDKs antifraude modernos (Fingerprint Pro, Talsec, ThreatMetrix, Play Integrity).
3. **Optimización Extrema de Recursos (Host Headroom):** En un servidor con procesador AMD Ryzen y 16 GB de RAM, renderizar 20 o 30 instancias nativamente a 1080×2400 @ 120 Hz colapsaría la CPU y la RAM por el rasterizador de software (SwiftShader). Por ello, el renderizado interno debe mantenerse desacoplado y optimizado (`720×1280 @ 30fps`), pero reportar de forma transparente las métricas lógicas del perfil a las aplicaciones.

---

## 2. Autocrítica Técnica: Errores, Vicios de Inercia y Qué Evitar

Al auditar y evolucionar el proyecto post-commit `d1a1c9a`, se identificaron errores conceptuales graves que cualquier agente o desarrollador debe comprender para no repetir:

### ⚠️ El vicio de la "Inercia Qualcomm / Pixel 5"
El repositorio nació testeando sobre una plantilla de Google Pixel 5 (Snapdragon 765G). Cuando se incorporaron las 17 plantillas multi-marca (Samsung, Xiaomi, Motorola), quedaron **remanentes de Qualcomm hardcodeados en el sistema**:
* `fake_getprop.sh` forzaba `ro.hardware = [qcom]` con un comando `sed` global.
* Se intentó resolver la detección de `ro.hardware.hwcomposer` devolviendo estáticamente `"qcom"` en `libpixel_hw.so`.
* **Consecuencia:** Un contenedor configurado como Samsung Galaxy A54 (Exynos/Mali) o Redmi 12 (MediaTek) reportaba `hwcomposer = qcom`, creando una contradicción flagrante con la GPU Mali y el SoC Exynos que cualquier SDK antifraude detecta en milisegundos.
* **Regla:** **Nunca cablear valores estáticos de un fabricante en binarios C o scripts globales.** Todo debe ser resuelto dinámicamente en tiempo de arranque a partir del `profile.json` activo.

### ⚠️ El peligro de los parches superficiales vs. Causa Raíz
* **Redirección de `/proc/net/tcp` a archivos estáticos:** Copiar `/proc/net/tcp` a `/data/local/tmp/fake_proc/tcp` filtrando `:15B3` congela los contadores de red y sockets activos en el tiempo. Un SDK que mida actividad de tráfico o inspeccione el archivo mediante `readlink(/proc/self/fd/N)` o `fstat()` detectará un archivo regular en `/data/local/tmp` en lugar de un inodo procfs, y bajo SELinux *enforcing* las apps sufrirán `EACCES`. La solución robusta es **filtrar en memoria** en la llamada `read()` de libc sobre el descriptor procfs real.
* **Alterar interfaces en el kernel (`ip link set eth0 name wlan0`):** El demonio de red de Android (`netd`) y `EthernetTracker` en ReDroid están acoplados a la interfaz `eth0`. Renombrarla en el kernel destruye las tablas de ruteo (`rt_tables`), dejando al contenedor sin red (`Active network is null`). La solución es preservar `eth0` a nivel de kernel y enmascarar la interfaz vía hooks de userspace y wrappers de CLI.
* **Apagar `screen_off_timeout` en el sistema operativo:** Forzar `settings put system screen_off_timeout 60000` en la base de datos de Android provoca que tras 60 segundos sin eventos táctiles, el servicio de energía de Android (`PowerManagerService`) suspenda la pantalla (`mWakefulness=Asleep`), dejando la ventana de `scrcpy` completamente en negro. El sistema físico debe permanecer siempre encendido (`2147483647` / `stay_on_while_plugged_in=7`), y el engaño de `60000` debe inyectarse a nivel Java en `FakeWifiHook.java` solo para aplicaciones de usuario.
* **Matar `adbd` por apagar ADB globalmente:** Ejecutar `settings put global adb_enabled 0` sin aislar el proceso `system_server` provoca que `AdbService` detenga el daemon `adbd` con `ctl.stop`, desconectando ADB y dejando el dispositivo como `offline`.

---

## 3. Matriz de Módulos Técnicos y Mecanismos de Implementación

A continuación se detalla la arquitectura que resuelve de raíz los bloqueos del commit `d1a1c9a`:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        APLICACIONES DE USUARIO                         │
│             (Chrome x86_64, Facebook, TikTok, DevCheck, SDKs)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┴───────────────────────────────┐
    ▼                                                               ▼
┌────────────────────────────────────────┐    ┌────────────────────────────────────────┐
│   CAPA BIONIC C (libpixel_hw.so)       │    │     FRAMEWORK JAVA (FakeWifiHook)      │
│  • Ashmem shim -> memfd_create (CLOEXEC│    │  • ABIs condicionadas (Vending/Apps)   │
│  • fcntl sellos (GROW|SHRINK en ashmem)│    │  • Settings mask (!"android")          │
│  • ioctl (6 opcodes ashmem emulados)   │    │  • MediaDrm UUID único vía SHA-256     │
│  • Filtrado en-vuelo de read() (:15B3) │    │  • Screen timeout 60000 para apps      │
│  • glGetString con dladdr caller check │    │  • Sensores dinámicos (sin duplicar)   │
│  • Dynamic hwcomposer/gralloc por JSON │    └────────────────────────────────────────┘
└───────────────────┬────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    KERNEL HOST & COMPOSITOR ANDROID                    │
│  • Linux 5.18+ / CachyOS (memfd nativo, sin módulo ashmem de kernel)   │
│  • SurfaceFlinger en modo "redroid" estable (720x1280 @ 30fps)         │
│  • netd administrando eth0 nativo para conectividad WAN garantizada    │
│  • PowerManagerService despierto permanentemente (screen_timeout=MAX)  │
└────────────────────────────────────────────────────────────────────────┘
```

### Módulo A: Shim de Ashmem / Memfd en Userspace Bionic (`libpixel_hw.so`)
* **Causa Raíz:** En Linux 5.18+, el driver `/dev/ashmem` fue eliminado del kernel. Chromium (Chrome, Brave) y Meta (Facebook AppInit) incluyen su propio allocator legacy en C++ (`ashmem-dev.cpp`) que exige abrir `/dev/ashmem`, valida descriptores con `fcntl(fd, 1034)` (`F_GET_SEALS`) requiriendo `F_SEAL_GROW | F_SEAL_SHRINK`, y ejecuta ioctls de ashmem.
* **Implementación:**
  1. `open*("/dev/ashmem")` invoca el syscall directo `SYS_memfd_create("ashmem", MFD_CLOEXEC)` (319 en x86_64, 356 en i386) y registra el descriptor retornado en un bitmap en memoria (`s_ashmem_fds`).
  2. `close(fd)` limpia el bit en `s_ashmem_fds`.
  3. `fcntl` y `fcntl64` interceptan `cmd == 1034` (`F_GET_SEALS_CMD`) **exclusivamente si el descriptor está marcado en `s_ashmem_fds`**, inyectando `0x0004 | 0x0002` (`F_SEAL_GROW | F_SEAL_SHRINK`). Archivos y sockets normales no reciben sellos sintéticos.
  4. `ioctl` intercepta los 6 comandos legacy de ashmem solo para descriptores marcados:
     - `0x7706` (`ASHMEM_GET_PROT_MASK`): Retorna `3` (`PROT_READ | PROT_WRITE`).
     - `0x7705` (`ASHMEM_SET_PROT_MASK`): Retorna `0` (Success).
     - `0x7703` (`ASHMEM_SET_SIZE`): Ejecuta el syscall `SYS_ftruncate` (77 en x86_64, 194 `ftruncate64` en i386) sobre el memfd.
     - `0x7701` (`ASHMEM_SET_NAME`): Retorna `0`.
     - `0x7702` (`ASHMEM_GET_NAME`): Escribe `"ashmem"` en el buffer provisto.
     - `0x7707` y `0x7708` (`ASHMEM_PIN` / `ASHMEM_UNPIN`): Retorna `0`.
  5. Se utiliza `dlsym((void *)-1l, symbol)` (`RTLD_NEXT`) antes de `dlsym(libc, symbol)` para evitar auto-recursión y desbordamientos de pila (`SIGSEGV`).

### Módulo B: Ocultamiento de Red y Puerto ADB en Memoria (`libpixel_hw.so`)
* **Causa Raíz:** Anti-fraude detecta puertos abiertos de desarrollo (ADB `:15B3` en `/proc/net/tcp*`) y el nombre de interfaz virtual `eth0` en `/proc/net/dev`.
* **Implementación:**
  1. En `open*()`, cuando un proceso con `UID >= 10000` (aplicación de usuario) abre `/proc/net/tcp*` o `/proc/net/dev`, se registran los FDs en `s_tcp_fds` o `s_dev_fds`.
  2. En `read()` y `__read_chk()`, se intercepta el buffer devuelto por libc:
     - `filter_tcp_buffer()`: Analiza línea por línea y suprime cualquier entrada que contenga `:15B3` o `:15b3`.
     - `filter_dev_buffer()`: Reemplaza la cadena `"  eth0:"` por `" wlan0:"`.
  3. No se utilizan archivos estáticos ni bind-mounts hacia `/data/local/tmp`. La información de tráfico (paquetes y bytes recibidos/transmitidos) se mantiene viva y actualizada en tiempo real.
  4. En `mask-early.sh`, se asegura `chmod 755 /data/local/tmp/ip_bin` para que el wrapper de `/system/bin/ip` pueda ser ejecutado por el usuario `shell` (UID 2000) sin errores de permisos.

### Módulo C: Desacoplamiento de Energía y Opciones de Desarrollador
* **Causa Raíz:** La configuración global de Android afecta tanto al sistema operativo como a las aplicaciones. Apagar ADB o poner timeout de pantalla real congela la instancia o tira abajo `adbd`.
* **Implementación:**
  1. En `apply-props.sh` (ejecutado en `sys.boot_completed=1`):
     ```bash
     settings put system screen_off_timeout 2147483647
     settings put global stay_on_while_plugged_in 7
     ```
  2. En `FakeWifiHook.java`, los hooks de `Settings.Global`, `Settings.Secure` y `Settings.System` verifican estrictamente `!"android".equals(lpparam.packageName)`:
     - Para apps de usuario: `adb_enabled = 0`, `development_settings_enabled = 0`, `screen_off_timeout = 60000` (1 minuto creíble).
     - Para `system_server` (`android`): Valores reales intactos. El contenedor nunca duerme y `adbd` nunca se detiene.

### Módulo D: Abstracción Dinámica del HAL de Gráficos (`hwcomposer` y `gralloc`)
* **Causa Raíz:** En ReDroid solo existen binarios físicos compilados para ReDroid (`hwcomposer.redroid.so` y `gralloc.redroid.so`). SurfaceFlinger (`UID 1000`) requiere obligatoriamente estos nombres para enlazar el HAL. Si se cambian en el sistema, colapsa el VSync y se produce *tearing* destructivo. Sin embargo, si una app consulta `getprop ro.hardware.hwcomposer`, debe ver el driver oficial del fabricante.
* **Implementación:**
  1. `profile-loader` (`src/profile_loader/main.c`) lee el perfil JSON activo y deduce dinámicamente el HAL correspondiente:
     - **Samsung Exynos:** `hwc = s5e8835` (o plataforma), `gralloc = mali`.
     - **MediaTek:** `hwc = mtk`, `gralloc = mali`.
     - **Google Tensor:** `hwc = gs101` / `gs201`, `gralloc = mali`.
     - **Qualcomm:** `hwc = qcom`, `gralloc = qcom`.
     Escribe estos valores en `/data/local/tmp/fake_proc/hwcomposer` y `/gralloc`.
  2. `libpixel_hw.so` en `get_fake_prop()` (solo para `UID >= 10000`) carga estos archivos dinámicamente y responde el valor del perfil.
  3. `fake_getprop.sh` intercepta llamadas CLI de `getprop ro.hardware.hwcomposer` y devuelve el valor dinámico del perfil. SurfaceFlinger no se ve afectado.

### Módulo E: GPU Spoofing sin Glitches de Skia / HWUI (`libpixel_hw.so`)
* **Causa Raíz:** En Android, la UI de las aplicaciones estándar (Ajustes, Chrome, Launcher) se dibuja en C++ con HWUI / Skia sobre OpenGL. Si `glGetString(GL_RENDERER)` entrega una GPU Mali física a HWUI, Skia activa sus *workarounds* de silicio ARM Mali, corrompiendo vértices y generando triángulos rotos sobre el backend SwiftShader x86.
* **Implementación:**
  - En `glGetString()`, se obtiene la dirección de retorno con `__builtin_return_address(0)` y se resuelve con `dladdr`.
  - Si el llamador reside en `libhwui.so` o `libskia.so`, se entrega la cadena original de SwiftShader.
  - Si el llamador es un SDK externo, una app de auditoría o una llamada Java/JNI (`is_java_call()`), se entrega la GPU del perfil (`Adreno 620`, `Mali-G68 MP5`, etc.) cargada desde `/data/local/tmp/fake_proc/gpu_renderer`.

### Módulo F: ABIs Condicionales (`FakeWifiHook.java`)
* **Causa Raíz:** Forzar ARM64 a nivel global hace que Google Play Store solo descargue binarios ARM64. Los navegadores modernos (Chrome) en ARM64 usan extensiones ARMv8.3+ que no son soportadas por el traductor `libndk_translation` de ReDroid, causando abortos. Ejecutar Chrome nativo x86_64 en el procesador Ryzen del host es 10x más rápido y 100% estable.
* **Implementación:**
  - En `FakeWifiHook.java`, se define:
    ```java
    final boolean isAbiTarget = !"android".equals(lpparam.packageName) && !"com.android.vending".equals(lpparam.packageName);
    ```
  - Google Play Store (`com.android.vending`) y `system_server` conservan la lista completa de ABIs (`x86_64,arm64-v8a,...`), permitiendo descargar APKs x86_64 para Chrome.
  - Todas las demás aplicaciones de usuario objetivo ven arquitectura pura `arm64-v8a`.

---

## 4. Registro Exhaustivo de Anti-Patrones (QUÉ NO HACER)

| Anti-Patrón Detectado | Por Qué Falla Técnicamente | Regla Arquitectónica Estricta |
|---|---|---|
| **Sobrescribir `ro.hardware.hwcomposer` a nivel de sistema** | No existen binarios OEM (`hwcomposer.samsung.so`) en ReDroid. SurfaceFlinger colapsa a emulación de software, perdiendo VSync y provocando desgarro de pantalla (*tearing*). | Mantener `"redroid"` en el sistema (`mask-early.sh`). Spoofear únicamente en Bionic C para `UID >= 10000` y en `fake_getprop.sh`. |
| **Spoofear `glGetString(GL_RENDERER)` sin discriminar Skia** | Skia activa parches de driver para bugs de GPU física ARM Mali, rompiendo el renderizado 2D sobre SwiftShader. | Usar `dladdr` sobre el caller: si proviene de `libhwui.so`/`libskia.so`, devolver el renderer real de SwiftShader. |
| **Renombrar `eth0` a `wlan0` en el kernel** | `netd` y el subsistema de red de Android buscan interfaces `eth*`. Al cambiar el nombre del netdev, colapsa el enrutamiento WAN (`Network is unreachable`). | Dejar `eth0` en el kernel y enmascarar a `wlan0` en userspace (`libpixel_hw.so` y wrapper de `ip`). |
| **Configurar `screen_off_timeout` corto en la base de datos** | Android interpreta que el usuario dejó el teléfono inactivo y `PowerManagerService` duerme la pantalla (`mWakefulness=Asleep`), apagando el stream de `scrcpy`. | Dejar el sistema en `2147483647` ms y falsear `60000` ms en Java para las apps de auditoría. |
| **Deshabilitar la tienda oficial o servicios base** | `pm disable com.android.camera2` rompe los intents de captura de imagen requeridos por apps como TikTok o Instagram. | No deshabilitar subsistemas esperados; virtualizar sus respuestas o proveer stubs nativos. |
| **Hardcodear `qcom` / Pixel 5 en scripts comunes** | Contradice de forma evidente a perfiles con SoCs Samsung Exynos o MediaTek, delatando manipulación a los SDKs de fraude. | Todo parámetro debe derivarse del JSON del perfil activo mediante `profile-loader`. |

---

## 5. Auditoría Crítica: Las 7 Fugas Pendientes para Nivel GeeLark

Para alcanzar paridad comercial con herramientas como GeeLark o GenFarmer, deben resolverse estas 7 inconsistencias que aún persisten en el diseño base:

1. **BSSID y SSID Wi-Fi Estáticos en `FakeWifiHook.java`:**
   * *Fuga actual:* Constantes `SSID = "Personal-WiFi-5.8G"` y `BSSID = "00:1a:2b:3c:4d:5e"` compartidas por todas las instancias.
   * *Acción:* `instance_manager.py` debe generar un BSSID aleatorio (con OUI de router real) y un SSID residencial creíble en `meta.json`. `FakeWifiHook.java` debe leerlos desde `ProfileConfig`.
2. **Memoria RAM Rígida de 8 GB:**
   * *Fuga actual:* `sysinfo()` en C y `/proc/meminfo` en `mask-early.sh` reportan siempre `7854200 kB` (8 GB de Pixel 5), incluso en modelos gama baja de 4 GB como Redmi 13C o Galaxy A14.
   * *Acción:* Añadir `"ram_mb"` a los JSONs de plantillas. `profile-loader` debe generar `/proc/meminfo` escalado y escribir la memoria real en `fake_proc/mem_total_kb` para `sysinfo()`.
3. **Almacenamiento Fijo de 128 GB y Particiones UFS:**
   * *Fuga actual:* `scale_blocks()` en C fija `~102 GiB` y `/proc/partitions` define discos UFS `sda` para todos los modelos, incluso aquellos con memorias eMMC (`mmcblk0`).
   * *Acción:* Incluir `"storage_gb"` y `"storage_type"` en las plantillas y calcular la tabla de bloques dinámicamente.
4. **Base de Datos SQLite de Telefonía Cableada a Personal Argentina:**
   * *Fuga actual:* `apply-props.sh` inyecta valores fijos de Personal Argentina (`72234`, APN `datos.personal.com`) en `telephony.db` al bootear.
   * *Acción:* `apply-props.sh` debe leer las propiedades de operador configuradas en la instancia (`carrier_name`, `mcc`, `mnc`, `apn`) antes de escribir en SQLite.
5. **Residuos de Pixel 5 en los Archivos `build.prop` Base de Docker:**
   * *Fuga actual:* Los archivos físicos `build_magisk/system/build.prop` y `vendor/build.prop` tienen marcas fijas de Pixel 5 antes de que actúen los bind-mounts.
   * *Acción:* Neutralizar los archivos base con propiedades genéricas o asegurar su sobreescritura atómica antes del inicio del framework.
6. **Duplicación de Sensores en `FakeSensors.java`:**
   * *Fuga actual:* Falta una instrucción `return;` tras iterar el arreglo de sensores del perfil, lo que provoca que se añadan los sensores del perfil **más** los sensores de fallback de Pixel 5 (Bosch).
   * *Acción:* Terminar la inicialización inmediatamente tras cargar los sensores del JSON activo.
7. **Virtualización de Cámara en lugar de Desactivación:**
   * *Fuga actual:* `tools/instance_manager.py` ejecuta `pm disable-user --user 0 com.android.camera2`, rompiendo intents de apps de redes sociales.
   * *Acción:* Mantener el paquete activo y proveer un mock de stream estático o virtual (GeeLark Camera Mock) para no romper contratos de la API de Android.

---

## 6. Guía de Replicación Paso a Paso (Post-Revert a `d1a1c9a`)

Si el repositorio es restaurado al commit `d1a1c9a`, estos son los pasos exactos y verificados para replicar la infraestructura estable:

### Paso 1: Actualizar `src/profile_loader/main.c` y Compilar
1. Añadir la función `apply_graphics_hal(json)` para deducir `hwcomposer` y `gralloc` según la marca/SoC del perfil y escribirlos en `/data/local/tmp/fake_proc/hwcomposer` y `gralloc`.
2. Invocar `apply_graphics_hal(json)` dentro de `apply_props()`.
3. Compilar el binario estático:
   ```bash
   bash src/profile_loader/build.sh
   ```

### Paso 2: Actualizar `src/libpixel_hw/pixel_hw64.c` y `pixel_hw32.c` y Compilar
1. Implementar el tracking de descriptores con bitmaps en memoria (`s_ashmem_fds`, `s_tcp_fds`, `s_dev_fds`).
2. En `open*()`: interceptar `/dev/ashmem` con `SYS_memfd_create` y flag `MFD_CLOEXEC`, marcando el FD devuelto. Marcar también lecturas de `/proc/net/tcp*` y `/proc/net/dev` para apps (`UID >= 10000`).
3. En `close()`: limpiar los FDs de los bitmaps correspondientes.
4. En `fcntl()` / `fcntl64()`: interceptar `cmd == 1034` y retornar `F_SEAL_GROW | F_SEAL_SHRINK` únicamente sobre FDs marcados como ashmem.
5. En `ioctl()`: emular las 6 llamadas legacy de ashmem (`GET_PROT_MASK`, `SET_PROT_MASK`, `SET_SIZE` vía `SYS_ftruncate`, `SET_NAME`, `GET_NAME`, `PIN`/`UNPIN`) sobre FDs marcados.
6. En `read()` y `__read_chk()`: filtrar `:15B3` en buffers TCP y renombrar `eth0` a `wlan0` en buffers de `/proc/net/dev`.
7. En `glGetString()`: inspeccionar el caller con `dladdr`. Si proviene de `libhwui.so` o `libskia.so`, entregar strings reales de SwiftShader. Para apps de usuario o JNI, cargar y entregar el renderer del perfil.
8. En `get_fake_prop()`: cargar dinámicamente `ro.hardware.hwcomposer` y `ro.hardware.gralloc` desde `/data/local/tmp/fake_proc/` para `UID >= 10000`.
9. Compilar ambas arquitecturas:
   ```bash
   bash src/libpixel_hw/build.sh
   ```

### Paso 3: Actualizar `build_magisk/system/bin/fake_getprop.sh`
1. Reemplazar el `sed` fijo de `qcom` por la lectura dinámica de `/data/local/tmp/fake_proc/hwcomposer` y `/gralloc`.
2. Responder a consultas individuales de `ro.hardware.hwcomposer`, `ro.hardware.gralloc` e `init.svc.adbd` directamente.

### Paso 4: Actualizar `build_magisk/system/bin/mask-early.sh` y `apply-props.sh`
1. En `mask-early.sh`: asegurar `chmod 755 /data/local/tmp/ip_bin` tras copiar el binario `ip`.
2. En `apply-props.sh`: configurar `settings put system screen_off_timeout 2147483647` y `settings put global stay_on_while_plugged_in 7`. **No** ejecutar `settings put global adb_enabled 0` a nivel de sistema.

### Paso 5: Actualizar `FakeWifiHook.java` y Compilar APK
1. En el hook de ABIs, verificar:
   ```java
   final boolean isAbiTarget = !"android".equals(lpparam.packageName) && !"com.android.vending".equals(lpparam.packageName);
   ```
2. En los hooks de `Settings.Global`, `Settings.Secure` y `Settings.System`, agregar el filtro `!"android".equals(lpparam.packageName)`. Para apps de usuario, falsear `screen_off_timeout` a `60000`, `adb_enabled` a `0` y `development_settings_enabled` a `0`.
3. En `FakeSensors.java`, añadir `return;` tras procesar los sensores del perfil para evitar duplicados.
4. Compilar el APK de LSPosed:
   ```bash
   bash src/lsposed_module/build_apk.sh
   ```

### Paso 6: Reconstruir la Imagen Docker y Verificar
```bash
docker build -t proteomesh:latest .
python3 tools/instance_manager.py stop mi-a54-01
python3 tools/instance_manager.py start mi-a54-01
```

---

## 7. Protocolo de Verificación y Aprobación

Para certificar que la instancia opera con integridad total y sin regresiones:

```bash
# 1. Comprobar que el dispositivo está online y responde a ADB:
adb devices
# Esperado: 127.0.0.1:5584  device

# 2. Comprobar que el sistema nunca suspende la pantalla (Awake continuo):
adb -s 127.0.0.1:5584 shell dumpsys power | grep -iE "mWakefulness="
# Esperado: mWakefulness=Awake

# 3. Comprobar interfaz wlan0 sin errores de permisos en el wrapper:
adb -s 127.0.0.1:5584 shell ip link show
# Esperado: 2: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> ...

# 4. Comprobar conectividad WAN activa:
adb -s 127.0.0.1:5584 shell ping -c 2 8.8.8.8
# Esperado: 0% packet loss

# 5. Comprobar ocultamiento de puerto ADB para aplicaciones de usuario:
adb -s 127.0.0.1:5584 shell su 10000 cat /proc/net/tcp | grep ":15B3"
# Esperado: Salida vacía

# 6. Comprobar coherencia dinámica de hardware (ej. Samsung A54):
adb -s 127.0.0.1:5584 shell /system/bin/fake_getprop.sh ro.hardware.hwcomposer
# Esperado: s5e8835 (no qcom)
adb -s 127.0.0.1:5584 shell /system/bin/fake_getprop.sh ro.hardware.gralloc
# Esperado: mali (no qcom)

# 7. Comprobar visualización fluida sin pantalla negra ni tearing:
scrcpy -s 127.0.0.1:5584
```
