# 📋 Guía de Automatización y Reportes para Hermes

Este documento describe cómo ejecutar la suite de telemetría y dónde consultar los reportes generados para el análisis de Play Integrity y hardware spoofing en Redroid.

---

## 1. Comando de Ejecución
Para disparar una nueva extracción de reportes limpia y completa:

```bash
/home/nahuel/Escritorio/info-test-redroid/generar-reportes-redroid.sh
```
*(O mediante el acceso directo: `/home/nahuel/Escritorio/info-test-redroid/run.sh`)*

---

## 2. Ubicación de los Reportes en el Host (CachyOS)
Todos los reportes se organizan automáticamente en subcarpetas numeradas y fechadas en:

```text
/home/nahuel/Escritorio/info-test-redroid/info-version-for-hermes/
```

### Cómo obtener la carpeta más reciente:
```bash
LATEST_RUN=$(ls -td /home/nahuel/Escritorio/info-test-redroid/info-version-for-hermes/info-version-for-hermes-* | head -1)
echo "Último reporte en: $LATEST_RUN"
```

---

## 3. Contenido de Cada Carpeta de Ejecución
Cada corrida genera exactamente tres archivos con el número de ejecución y timestamp:

1. **`android-env-test-Contador-TIMESTAMP.txt`**
   - **Qué es:** Auditoría directa de bajo nivel de Android (`adb shell`).
   - **Contenido:** `getprop` completos (fabricante, fingerprint, ABI), variables de emulación detectadas (`qemu`, `goldfish`, etc.), `/proc/cpuinfo`, `/proc/meminfo`, `/proc/partitions`, dumpsys de sensores, cámara, batería, telefonía y servicios activos.

2. **`Device-Info-app_Contador--TIMESTAMP.txt`**
   - **Qué es:** Reporte en texto plano generado por la app **Device Info** (`com.ytheekshana.deviceinfo`).
   - **Contenido:** Datos visualizados desde el espacio de usuario de Android (Java/Android API): specs de CPU, GPU, memoria, sistema operativo, firma digital y sensores disponibles para apps de usuario.

3. **`DevCheck-App-Contador-TIMESTAMP.txt`**
   - **Qué es:** Reporte en texto plano (convertido automáticamente a UTF-8 limpio) de la app **DevCheck** (`flar2.devcheck`).
   - **Contenido:** Detección de hardware a nivel de SoC (Snapdragon, gobernador de CPU, frecuencias activas, clústeres big.LITTLE, estado de Deep Sleep y kernel).

---

## 4. Adaptabilidad Dinámica y Resoluciones de Pantalla

El script cuenta con un motor de **auto-calibración en tiempo de ejecución**. Al iniciarse, consulta `adb shell wm size` y selecciona automáticamente el perfil de coordenadas adecuado:

| Resolución | Densidad | Perfil / Comportamiento |
|---|---|---|
| **1080×2340** | 440 dpi | **Perfil calibrado píxel a píxel** (Pixel 5 moderno, 19.5:9). Sin swipe necesario en Device Info. Coordenadas de guardado DocumentsUI en `(894, 2141)`. |
| **720×1280** | 320 dpi | **Perfil calibrado nativo**. Incluye swipe vertical automático para revelar el botón Exportar en Device Info. |
| **Otras (cualquiera)** | Variable | **Motor proporcional dinámico**. Calcula automáticamente los toques relativos al ancho ($W$) y alto ($H$) de pantalla en milésimas porcentuales. |

> [!TIP]
> Si cambias el tamaño de pantalla del contenedor Redroid en `docker-compose.yml` o mediante `wm size`, **no es necesario reconfigurar el script**; se adapta de forma autónoma.

---

## 5. Robustez y Aislamiento de Reportes
- **Aislamiento previo (Clean-State):** Antes de abrir cada app, el script archiva en `/sdcard/info-divice/archived/` cualquier reporte previo, garantizando que el archivo transferido a CachyOS sea 100% el recién emitido.
- **Normalización de Encoding:** DevCheck exporta originalmente en UTF-16LE. El script lo convierte al vuelo con `iconv` a UTF-8 nativo para permitir búsquedas directas con `grep` y lectura en editores estándar de Linux.
- **Control de Animaciones:** Durante la extracción de Device Info, desactiva temporalmente las escalas de animación del sistema para evitar congelamientos de UI y las restaura al finalizar.

---

## 6. Ejemplo de Flujo de Trabajo para Hermes
Cuando Hermes necesite evaluar el impacto de un cambio en las props o en los módulos de Redroid:

```bash
# 1. Ejecutar la recolección
/home/nahuel/Escritorio/info-test-redroid/generar-reportes-redroid.sh

# 2. Localizar la última corrida
LATEST_DIR=$(ls -td /home/nahuel/Escritorio/info-test-redroid/info-version-for-hermes/info-version-for-hermes-* | head -1)

# 3. Leer los datos para análisis
cat "$LATEST_DIR"/DevCheck-App-*.txt | grep -E "Hardware|Snapdragon|CPU"
cat "$LATEST_DIR"/Device-Info-app_*.txt | grep -E "Modelo|Fabricante|Firma"
```
