# Guía de Reproducción y Despliegue de ProteoMesh

Esta guía detalla los pasos exactos para compilar, aprovisionar y operar la plataforma de dispositivos virtuales ProteoMesh en un sistema anfitrión Linux.

---

## 1. Requisitos Previos del Host

* **Sistema Operativo:** Linux x86_64 (CachyOS, Arch Linux, Ubuntu 22.04+, Debian 12 con kernel 5.18+, 6.x o 7.x).
* **Docker Engine:** Docker 24+ con soporte de contenedores privilegiados.
* **Módulos de Kernel Android:**
  * Módulos de Binder activos (`/dev/binder`, `/dev/vndbinder`, `/dev/hwbinder`).
  * En kernels sin `ashmem` (Linux 5.18+), ProteoMesh utiliza el fallback memfd (`sys.use_memfd=1` / parche en `libcutils.so`).
* **Herramientas en Host:**
  * `gcc`, `make` (para compilar `libpixel_hw.so` y `profile-loader`).
  * `openjdk-17` o superior (para compilar el módulo Java de LSPosed).
  * `python3` (para `tools/instance_manager.py`).
  * `android-tools` (`adb`) y `scrcpy` (para conexión y visualización).

---

## 2. Compilación de Componentes Nativos y Módulos

Si realizas modificaciones en el código fuente de los interceptores, compila los componentes antes de construir la imagen Docker:

### A. Interceptor Nativo Bionic (`libpixel_hw.so` 64 y 32 bits)
```bash
bash src/libpixel_hw/build.sh
```
*Genera `build_magisk/system/lib64/libpixel_hw.so` y `build_magisk/system/lib/libpixel_hw.so`.*

### B. Cargador Universal de Perfiles (`profile-loader`)
```bash
bash src/profile_loader/build.sh
```
*Genera el ejecutable estático x86_64 en `build_magisk/system/bin/profile-loader`.*

### C. Módulo de Evasión LSPosed (`FakeWifiPixel.apk`)
```bash
bash src/lsposed_module/build_apk.sh
```
*Compila con D8/R8 y firma `modules/FakeWifiPixel.apk`.*

---

## 3. Construcción de la Imagen Docker Base

Construye la imagen Docker unificada que integra el sistema Android 13, GMS, Magisk y las capas de ProteoMesh:

```bash
docker build -t proteomesh:latest .
```

---

## 4. Gestión y Despliegue de Instancias (`instance_manager.py`)

La gestión de instancias se realiza a través de la herramienta CLI en host:

### A. Listar Plantillas de Hardware y Operadoras Disponibles
```bash
# Ver las 17 plantillas de hardware (Samsung, Xiaomi, Motorola, Pixel)
python3 tools/instance_manager.py list-templates

# Ver las operadoras disponibles (Claro, Personal, Movistar)
python3 tools/instance_manager.py list-carriers
```

### B. Previsualizar Identidad Aleatoria en Rango (Estilo GeeLark)
Permite previsualizar los identificadores generados (IMEI con Luhn, MACs con OUI del fabricante, serial y SIM) antes de crear la instancia:
```bash
python3 tools/instance_manager.py randomize samsung/a54x ar_personal
```

### C. Crear una Nueva Instancia Aislada
Crea la instancia clonando la base limpia (`data-clean/`), congelando el perfil en `instances/<nombre>/profile.json` y asignando un puerto ADB único:
```bash
# Ejemplo: Crear un Samsung Galaxy A54 en puerto 5584
python3 tools/instance_manager.py create mi-a54-01 samsung/a54x ar_personal --port 5584

# Ejemplo: Crear un Xiaomi Redmi 12 en puerto 5586
python3 tools/instance_manager.py create redmi-12-01 xiaomi/fire ar_personal --port 5586
```

### D. Iniciar la Instancia
Arranca el contenedor con los parámetros exactos de pantalla (resolución, DPI, Hz), conecta ADB, sincroniza la zona horaria de la operadora y asegura el stub de la tienda oficial de la marca:
```bash
python3 tools/instance_manager.py start mi-a54-01
```

### E. Visualizar la Pantalla del Dispositivo
```bash
scrcpy -s 127.0.0.1:5584
```

### F. Detener la Instancia
```bash
python3 tools/instance_manager.py stop mi-a54-01
```

### G. Listar Instancias Configuradas
```bash
python3 tools/instance_manager.py list-instances
```

---

## 5. Verificación de Integridad y Diagnóstico

### A. Verificación de Identidad y Sistema vía ADB
```bash
PORT=5584

# Marca, Modelo y Huella
adb -s 127.0.0.1:$PORT shell getprop ro.product.model
adb -s 127.0.0.1:$PORT shell getprop ro.build.fingerprint

# Baseband y Bootloader oficiales (sin valores 'unknown')
adb -s 127.0.0.1:$PORT shell getprop gsm.version.baseband
adb -s 127.0.0.1:$PORT shell getprop ro.bootloader

# Kernel (sin fugas del host)
adb -s 127.0.0.1:$PORT shell cat /proc/version
```

### B. Verificación de Tiendas Oficiales y Servicios
* **Google Play Store:** Abre directamente a la pantalla oficial de inicio de sesión (`UnauthenticatedMainActivity`) sin el bloqueo de "Dispositivo no certificado".
* **Buscador de Google:** Ejecuta búsquedas web sin pantallas de error ("Ocurrió un error"), conectando mediante el stack Cronet expuesto en `public.libraries.txt`.
* **Pixelscan:** Al ejecutar el test en el dispositivo, verifica un puntaje de **75/100** con cero advertencias de `Brand Store Missing`.
* **Device Info / DevCheck:** Verifica en la pestaña *Sistema* que el Kernel muestre `5.10.149-android12-9-...`, el Bootloader esté reportado como bloqueado con su versión de compilación, y la Banda Base muestre el firmware de módem oficial.