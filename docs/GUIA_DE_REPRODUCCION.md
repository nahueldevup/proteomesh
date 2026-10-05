# Guía de Reproducción y Despliegue de ProteoMesh

Esta guía detalla los pasos exactos para compilar, levantar y verificar el entorno ProteoMesh desde cero sobre un sistema anfitrión Linux.

---

## 1. Requisitos Previos del Host

* **Sistema Operativo:** Linux x86_64 (testeado en CachyOS / Arch Linux con kernel 6.x y 7.x).
* **Docker y Docker Compose:** Docker 24+ con soporte de contenedores privilegiados.
* **Módulos de Kernel Android:**
  * `binder_linux` (o soporte de `/dev/binder`, `/dev/vndbinder`, `/dev/hwbinder`).
  * `ashmem_linux` (si el kernel 5.18+ carece de ashmem, ProteoMesh utiliza el parche memfd en `libcutils.so`).
* **Herramientas de Compilación en Host:**
  * `gcc`, `clang`, `make`, `xxd`.
  * `openjdk-17` o superior (`javac`, `keytool`, `jarsigner`).
  * `python3` (para scripts de inspección y telemetría).
  * `adb` (`android-tools`).

---

## 2. Estructura del Proyecto

Asegúrate de clonar el repositorio y mantener la siguiente estructura:

```
redroid-integrity-lab/
├── docker-compose.yml
├── build_magisk/
│   ├── system/
│   │   ├── bin/
│   │   │   ├── apply-props.sh
│   │   │   ├── mask-early.sh
│   │   │   └── manage-spoof
│   │   ├── build.prop
│   │   ├── etc/init/
│   │   │   ├── bootanim.rc
│   │   │   ├── hw/init.zygote64_32.rc
│   │   │   └── magisk/
│   │   └── lib64/
│   │       ├── libcutils.so
│   │       ├── libpixel_hw.so
│   │       └── libzygisk.solibnb.so
│   │   └── lib/
│   │       └── libpixel_hw.so
│   └── vendor/
│       ├── build.prop
│       └── etc/permissions/handheld_core_hardware.xml
├── src/
│   ├── libpixel_hw/
│   │   ├── build.sh
│   │   ├── pixel_hw32.c
│   │   └── pixel_hw64.c
│   └── lsposed_module/
│       ├── build_apk.sh
│       └── com/fakewifi/pixel/
│           ├── FakeWifiHook.java
│           └── FakeSensors.java
├── modules/
│   └── FakeWifiPixel.apk
└── docs/
```

---

## 3. Compilación de Artefactos

### A. Compilar bibliotecas nativas de interceptación
Desde el directorio raíz:
```bash
chmod +x src/libpixel_hw/build.sh
./src/libpixel_hw/build.sh
```
Esto generará automáticamente:
* `build_magisk/system/lib64/libpixel_hw.so` (64-bit)
* `build_magisk/system/lib/libpixel_hw.so` (32-bit)

### B. Compilar y firmar el módulo LSPosed
```bash
chmod +x src/lsposed_module/build_apk.sh
./src/lsposed_module/build_apk.sh
```
El script descargará automáticamente el SDK android-30 y el compilador R8 de Google, compilará las clases Java (`FakeWifiHook.java` y `FakeSensors.java`), las convertirá a Dalvik Executable (`classes.dex`), generará el paquete y lo firmará en:
* `modules/FakeWifiPixel.apk`

---

## 4. Despliegue del Contenedor Docker

1. Inicia el contenedor en segundo plano:
   ```bash
   docker compose down
   docker compose up -d
   ```
2. Espera aproximadamente 15 segundos a que Android complete el arranque (`boot_completed=1`).
3. Conéctate vía ADB:
   ```bash
   adb connect localhost:5580
   adb -s localhost:5580 wait-for-device
   ```
4. Comprueba que el arranque haya finalizado:
   ```bash
   adb -s localhost:5580 shell "getprop sys.boot_completed"
   # Debe responder: 1
   ```

---

## 5. Instalación y Activación de Módulos

El contenedor arranca con Magisk y Zygisk preinstalados en `/data`. Para asegurar que el módulo de spoofing esté registrado y activo en las aplicaciones cliente:

1. Instala el APK del módulo:
   ```bash
   adb -s localhost:5580 push modules/FakeWifiPixel.apk /data/local/tmp/FakeWifiPixel.apk
   adb -s localhost:5580 shell "pm install -r /data/local/tmp/FakeWifiPixel.apk"
   ```

2. Registra el módulo y activa su alcance en la base de datos de LSPosed:
   ```bash
   adb -s localhost:5580 shell "
   APK_PATH=\$(pm path eu.chylek.adam.fakewifi | head -n1 | cut -d: -f2)
   su 0 sh -c \"
   sqlite3 /data/adb/lspd/config/modules_config.db \\\"INSERT OR REPLACE INTO modules (mid, module_pkg_name, apk_path, enabled) VALUES (69, 'eu.chylek.adam.fakewifi', '\$APK_PATH', 1);\\\"
   \"
   "
   ```

3. Asigna automáticamente el alcance (*scope*) a las aplicaciones instaladas:
   ```bash
   adb -s localhost:5580 shell "manage-spoof auto"
   ```
   O agrega una app específica manualmente:
   ```bash
   adb -s localhost:5580 shell "manage-spoof add com.ejemplo.miapp"
   ```

4. Reinicia el contenedor una vez para consolidar la sincronización en frío:
   ```bash
   docker compose restart
   sleep 15
   adb connect localhost:5580
   ```

### 4. Control Dinámico de Ubicación GPS (`set-gps`)
Puedes cambiar la ubicación simulada en cualquier momento desde la terminal de ADB:
```bash
# Ver ubicación actual y ciudades disponibles:
adb -s localhost:5580 shell "set-gps"

# Cambiar a una ciudad preset:
adb -s localhost:5580 shell "set-gps cordoba"
adb -s localhost:5580 shell "set-gps miami"
adb -s localhost:5580 shell "set-gps madrid"
adb -s localhost:5580 shell "set-gps buenos-aires"

# O configurar coordenadas exactas personalizadas:
adb -s localhost:5580 shell "set-gps -34.603722 -58.381592 25.0"
```
Cualquier aplicación cliente (Google Maps, Facebook, Chrome, Tinder) reflejará el cambio inmediatamente sin reiniciar el contenedor.

---

## 7. Verificación de Funcionamiento

Ejecuta las siguientes comprobaciones para validar que todas las capas están operativas:

### 1. Daemons Zygisk
```bash
adb -s localhost:5580 shell "ps -ef | grep -iE 'zygisk|lspd' | grep -v grep"
```
**Resultado esperado:**
Debes ver activos concurrentemente:
* `lspd` (proceso de LSPosed)
* `zygiskd64` (daemon Zygisk 64-bit)
* `zygiskd32` (daemon Zygisk 32-bit)

### 2. Estado de LSPosed Manager
Abre LSPosed Manager para comprobar que el framework está activo:
```bash
adb -s localhost:5580 shell "am start -n org.lsposed.manager/.ui.activity.MainActivity"
```
Debe indicar: **Activado (1.9.2 - Zygisk)**.

### 3. Validación en Apps de Diagnóstico
* **Device Info (`com.ytheekshana.deviceinfo`):**
  * Pestaña **CPU:** Debe mostrar SoC `Qualcomm Snapdragon 765G 5G` (`SM7250`), GPU `Adreno (TM) 620`, y ABIs soportados: `arm64-v8a, armeabi-v7a, armeabi` (sin rastros de `x86_64` o `x86`).
  * Pestaña **La red:** Debe mostrar interfaz `wlan0`, tipo de conexión Wi-Fi 5 GHz, velocidad `866 Mbps` y frecuencia `5180 MHz`.
  * Pestaña **Sensores:** Debe listar los 11 sensores físicos de hardware (`BMI260`, `AK09918`, etc.) con eventos en tiempo real.
* **DevCheck (`flar2.devcheck`):**
  * Pestaña **Cámara:** Debe mostrar Cámara Principal (12.2 MP, f/1.7), Lente Ultra Gran Angular (16 MP, f/2.2) y Captura de Vídeo.
* **Pixelscan Android Checker (`net.pixelscan.check`):**
  * Ejecutar *Start Quick Scan*:
  * **Emulator detection:** `Not detected`
  * **CPU architecture:** `arm64-v8a, armeabi-v7a, armeabi`
  * **Matched emulator markers:** `None`
  * **SIM card presence:** `Present` (Personal Argentina, MCC/MNC `72234`)
  * **Motion sensor test:** `Test completed / Motion detected (normal)`
