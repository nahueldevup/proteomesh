# Arquitectura del Sistema ProteoMesh

ProteoMesh es un framework de endurecimiento (*hardening*), enmascaramiento y simulación de hardware móvil para contenedores Android (**ReDroid 13 / API 33**) sobre kernels Linux x86_64. Su diseño profile-driven permite transformar dinámicamente un contenedor virtual en cualquiera de **17 dispositivos comerciales oficiales** (Samsung Galaxy, Xiaomi Redmi, Motorola Moto G y Google Pixel) con operadoras móviles y geolocalizaciones coherentes (arquitectura de CloudPhones estilo GeeLark / GenFarmer).

El sistema neutraliza las heurísticas de detección de emuladores, virtualización y análisis de integridad local de aplicaciones bancarias, tiendas oficiales y utilidades de diagnóstico (`Device Info`, `DevCheck`, `Pixelscan Android Checker`, `Google Play Protect`, `FingerprintJS`).

---

## 1. Modelo de Tres Capas de Intercepción

El sistema opera mediante tres capas coordinadas sin requerir parches en el kernel del host:

```
┌────────────────────────────────────────────────────────┐
│  Aplicaciones Android / Tiendas / SDKs Antifraude      │
│  (Play Store, Google Search, Pixelscan, DevCheck)      │
└────────────────────────────────────────────────────────┘
                           │
       LSPosed Framework (Zygisk Companion en Zygote)
                           ▼
┌────────────────────────────────────────────────────────┐
│  Capa Framework Java / IPC: FakeWifiPixel Module       │
│  - android.os.Build & SystemProperties                 │
│  - android.hardware.camera2 (CameraCharacteristics)    │
│  - android.hardware.SensorManager (MEMS fidedignos)   │
│  - android.net.wifi.WifiManager & WifiInfo             │
│  - android.telephony.TelephonyManager & Subscriptions  │
│  - GmsDeviceComplianceResponse (Play Protect Bypass)  │
│  - Intercepción de PackageManager (Brand Stores)       │
│  - java.lang.System.getProperty("os.version")          │
└────────────────────────────────────────────────────────┘
                           │
       Bionic C Runtime Hooking (LD_PRELOAD en Zygote)
                           ▼
┌────────────────────────────────────────────────────────┐
│  Capa Nativa: libpixel_hw.so (64 y 32 bits)            │
│  - uname() -> Kernel Android GKI 5.10 sin fugas host   │
│  - sysinfo() -> Memoria RAM LPDDR fidedigna            │
│  - open("/proc/version") -> Banner GKI oficial         │
│  - open("/proc/cpuinfo") -> Tabla sintetizada de SoC   │
│  - open("/sys/devices/system/cpu/...") -> Frecuencias  │
└────────────────────────────────────────────────────────┘
                           │
       Capa de Arranque y Configuración (Init / Root)
                           ▼
┌────────────────────────────────────────────────────────┐
│  Capa de Sistema Base: profile-loader nativo & Bindings│
│  - Inyección instantánea de props vía resetprop        │
│  - Síntesis de /data/local/tmp/fake_proc/              │
│  - Montaje bind sobre /proc/version y build.props      │
│  - Stubs APK de tiendas nativas (Galaxy Store, GetApps)│
│  - Exposición de Cronet en public.libraries.txt        │
└────────────────────────────────────────────────────────┘
```

---

## 2. Organización del Repositorio y Componentes

```text
redroid-integrity-lab/
├── templates/                     # Plantillas oficiales inmutables de hardware (17 modelos)
│   ├── google/pixel5_redfin.json
│   ├── motorola/{bangkk,cancunf,devon,penang,penangf}.json
│   ├── samsung/{a04s,a14,a24,a34x,a54x,samsung_s21}.json
│   └── xiaomi/{fire,gale,sapphire,sea,tapas}.json
├── carriers/                      # Perfiles de operadoras móviles y huso horario
│   ├── ar_claro.json
│   ├── ar_movistar.json
│   └── ar_personal.json
├── instances/                     # Directorio de instancias activas desacopladas
│   └── <nombre_instancia>/
│       ├── profile.json           # Perfil congelado con identidad única
│       └── data/                  # Volumen persistente /data clonado de data-clean
├── data-clean/                    # Imagen dorada sanitizada base para nuevas instancias
├── stubs/                         # APKs stub ultraligeros de tiendas de fabricante
│   ├── samsung_galaxy_store.apk   # com.sec.android.app.samsungapps (2.8 KB)
│   ├── xiaomi_getapps.apk         # com.xiaomi.mipicks (2.8 KB)
│   └── huawei_appgallery.apk      # com.huawei.appmarket (2.8 KB)
├── tools/
│   └── instance_manager.py        # Orquestador CLI del ciclo de vida de instancias
├── src/
│   ├── profile_loader/            # Cargador nativo en C estático (main.c)
│   ├── libpixel_hw/               # Hooks C Bionic LD_PRELOAD (pixel_hw64.c, pixel_hw32.c)
│   └── lsposed_module/            # Módulo Xposed/Zygisk (FakeWifiHook.java)
└── build_magisk/                  # Árbol del sistema inyectado en la imagen Docker
    ├── system/
    │   ├── bin/{profile-loader,resetprop}
    │   ├── etc/public.libraries.txt
    │   ├── lib64/{libpixel_hw.so,libcronet.so}
    │   └── lib/{libpixel_hw.so,libcronet.so}
```

---

## 3. Flujo de Generación y Despliegue de Instancias (GeeLark Architecture)

El gestor de instancias (`tools/instance_manager.py`) implementa la separación estricta entre plantillas inmutables e instancias congeladas de usuario:

1. **Previsualización y Generación de Identidad (`randomize`):**
   * El usuario o la interfaz selecciona una plantilla (`templates/samsung/a54x.json`) y una operadora (`carriers/ar_personal.json`).
   * Se generan identificadores dentro del rango físico estricto:
     * **IMEI:** TAC oficial GSMA de 8 dígitos correspondiente al modelo + número de serie aleatorio validado mediante el algoritmo de Luhn (dígito de verificación checksum).
     * **MAC Wi-Fi y Bluetooth:** Generadas con los prefijos OUI oficiales de IEEE registrados por la marca (ej. Samsung `B0:79:94`, Motorola `E4:90:7E`, Xiaomi `34:80:0D`).
     * **Serial de Hardware:** Prefijo oficial de fábrica + alfanumérico en longitud estándar.
     * **Telefonía:** Prefijos IMSI y formato ICCID acorde al MCC/MNC de la operadora seleccionada.
2. **Creación Congelada (`create`):**
   * Se sintetiza `instances/<nombre>/profile.json` conteniendo el hardware completo y el bloque `generated_identity`. Este archivo se monta en el contenedor en modo solo lectura (`/system/etc/proteomesh_profile.json:ro`).
   * Se clona el volumen `/data` a partir de la imagen dorada `data-clean/`, garantizando permisos root de Magisk y llaves autorizadas de ADB sin rastros de cuentas anteriores.
3. **Arranque y Normalización (`start`):**
   * Se asignan dinámicamente los flags de resolución y tasa de refresco (`androidboot.redroid_width`, `height`, `dpi`, `fps`) según la pantalla física del modelo.
   * Al bootear, `/system/bin/profile-loader` parsea `profile.json` e inyecta propiedades en microsegundos vía `resetprop`.
   * Se sincroniza automáticamente la zona horaria del sistema con la operadora (`setprop persist.sys.timezone`).
   * Se asegura la presencia del stub de la tienda oficial según la marca del dispositivo.

---

## 4. Técnicas Específicas de Evasión y Hardening

### A. Consistencia de Tienda de Fabricante (Brand Store Evasion)
* **Reto:** SDKs antifraude como Pixelscan verifican si un dispositivo Samsung, Xiaomi o Huawei posee su tienda OEM (`com.sec.android.app.samsungapps`, `com.xiaomi.mipicks`, `com.huawei.appmarket`), penalizando como emulador (`Brand Store Missing`) si falta.
* **Mecanismo:**
  * Se instalan APKs stub nativos de 2.8 KB (`android:hasCode="false"`). No ejecutan procesos en segundo plano ni consumen memoria, pero constan físicamente en `/data/system/packages.xml`.
  * Se interceptan llamadas Java de `PackageManager.getPackageInfo` y `ApplicationPackageManager`.
  * Se hookea la rutina de comprobación interna `net.pixelscan.check.MainActivity.s` devolviendo `true` para la tienda asociada a la marca activa.
  * **Puntaje verificado:** **75/100** en Pixelscan con cero advertencias de tienda.

### B. Bypass de Certificación de Google Play Protect
* **Reto:** ReDroid con GMS bloquea el acceso a Google Play Store con la pantalla *"Dispositivo no certificado por Play Protect"*.
* **Mecanismo:**
  * En `FakeWifiHook.java`, se intercepta el constructor y el deserializador Parcel (`CREATOR.createFromParcel`) de la clase `com.google.android.gms.gmscompliance.GmsDeviceComplianceResponse`.
  * Se fuerza en memoria `isCompliant = true` y `pendingIntent = null`.
  * Se hookea `UncertifiedDeviceActivity.onCreate` invocando de inmediato `finish()`.
  * Las apps de Google (`com.android.vending`, `com.google.android.gms`, `com.google.android.googlequicksearchbox`) están incorporadas en el scope de Zygisk/LSPosed.
  * **Resultado:** Acceso directo a la interfaz oficial de autenticación y descarga.

### C. Stack de Red Chromium Cronet en Google Search
* **Reto:** La app del buscador de Google arrojaba `"Ocurrió un error"` al despachar consultas web debido a que el linker dinámico de Bionic en Android 13 bloqueaba la carga de `libcronet.so` por restricciones de namespace (`classloader-namespace`).
* **Mecanismo:**
  * Se suministraron los binarios de `libcronet.so` en `/system/lib64/` y `/system/lib/`.
  * Se declararon explícitamente en `/system/etc/public.libraries.txt`, autorizando al linker a cargar la biblioteca desde cualquier espacio de nombres de aplicación.

### D. Protección Contra Fugas del Kernel Host (`uname` y `/proc/version`)
* **Reto:** La llamada nativa `uname(2)` del kernel host (ej. `7.2.9-1-cachyos`) se filtraba en diagnósticos como `5.10.01-cachyos` debido a un error de buffer en C que no colocaba el terminador nulo `\0` al final del string simulado.
* **Mecanismo:**
  * En `pixel_hw64.c` y `pixel_hw32.c`, se garantiza terminación nula estricta (`buf->release[i] = '\0'`), truncando los bytes sobrantes del host.
  * En `FakeWifiHook.java`, se intercepta `System.getProperty("os.version")` retornando la versión GKI de Android 13 (`5.10.149-android12-9-00001-ge5f3ba2132a1`).
  * `ro.kernel.version` se normaliza en `5.10`.

### E. Integridad de Bootloader y Banda Base
* **Reto:** Modelos virtuales mostraban `Bootloader: unknown` y `Banda base: unknown`.
* **Mecanismo:**
  * Todas las plantillas integran firmwares de módem oficiales (ej. `HA18_V14.0.14.0.TMTMIXM` para Xiaomi, `M6375_HI433_...` para Motorola, `A546EXXU5AWHC` para Samsung).
  * El bootloader reporta los códigos de compilación OEM (ej. `V14.0.14.0.TMTMIXM (Bloqueado)`).
  * `profile-loader` cuenta con deducción dinámica de emergencia para que ningún dispositivo arranque con cadenas desconocidas.

### F. Aislamiento y Saneamiento de Imagen Dorada (`data-clean`)
* **Reto:** Evitar que nuevas instancias hereden tokens de sesión, cuentas sincronizadas o identidades de modelos previos.
* **Mecanismo:**
  * La base `data-clean/` se mantiene desprovista de aplicaciones de terceros, bases de datos de cuentas SQLite (`accounts_ce.db`, `accounts_de.db`), identificadores SSAID (`settings_ssaid.xml`) y cachés de diagnóstico.
  * Preserva únicamente el framework de Magisk, módulos de Zygisk y llaves autorizadas de ADB para arranque inmediato.