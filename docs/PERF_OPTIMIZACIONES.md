# Optimizaciones de Rendimiento y Eficiencia de Recursos (perf/*)

Documento técnico de arquitectura y mediciones para las optimizaciones integradas en ProteoMesh (`integration/perf-test`).

---

## 1. Resumen y Motivación

A partir de una auditoría integral sobre el ciclo de vida de los contenedores ReDroid y la capa de gestión del host, se identificaron cuatro cuellos de botella críticos de consumo de recursos y latencia:
1. **I/O y Almacenamiento en disco (`create`):** Cada instancia clonaba ~1.0 GB de archivos físicos mediante `cp -a` de BusyBox en Alpine, tardando ~6.4 a ~13.8 s y duplicando el almacenamiento físico sin aprovechar las capacidades Copy-on-Write (CoW) del sistema de archivos Btrfs del host.
2. **CPU en Guest Android y Latencia en UI (`screenshots`):** El volcado tradicional con `screencap -p` forzaba compresión PNG (zlib nivel 6) dentro del contenedor Android, consumiendo entre 83% y 98% de CPU en un núcleo del guest y generando latencias de 190 a 730 ms dependientes del contenido visual.
3. **Seguridad de Memoria en Host (`limits por defecto`):** La creación de instancias por CLI carecía de límite de memoria por defecto, dejando que contenedores no confinados consumieran hasta el total de la RAM física del host (13.5 GiB) bajo estrés, arriesgando caídas generales por Out-Of-Memory (OOM).
4. **Sobrecarga de Subprocesos en Arranque (`start`):** El proceso de inicialización ejecutaba 48 llamadas secuenciales de `pm disable-user` repartidas en dos pasadas ciegas, disparando 97 subprocesos por arranque y provocando contención cuando múltiples instancias iniciaban a la vez.

---

## 2. Detalle Técnico de los Cambios Implementados

### 2.1. Clonado Copy-on-Write con `proteomesh-helper` (`perf/reflink-clone`)
* **Implementación:** Sustitución del contenedor auxiliar Alpine estándar por `proteomesh-helper:latest` (Alpine con GNU `coreutils`), ejecutando `cp -a --reflink=auto /lab/data-clean/*`.
* **Preservación:** Conserva permisos, propietarios, contextos SELinux y atributos extendidos (xattrs) requeridos por Android/Magisk.
* **Manejo de Errores:** Filtra en stderr los errores esperados de `Required key not available` (`ENOKEY`) en las 8 fuentes tipográficas cifradas con fscrypt en Android, permitiendo que el clonado continúe limpiamente.
* **Fallback Transparente:** Si la imagen `proteomesh-helper:latest` no está compilada localmente o falla, el gestor emite un aviso instructivo y recurre al método tradicional con `alpine` (copia completa sin CoW).

### 2.2. Captura de Pantalla por Framebuffer Raw y Caché Reactiva (`perf/screenshots`)
* **Implementación:** Volcado crudo directo desde SurfaceFlinger mediante `docker exec <inst> screencap` (sin `-p`).
* **Parser Binario (`server/services/screencap_parser.py`):** Desempaqueta y valida encabezados de 12 bytes (`uint32 w, h, format`) y 16 bytes (`w, h, format, colorSpace`), garantizando formato `HAL_PIXEL_FORMAT_RGBA_8888 (1)` y longitud exacta de `w * h * 4` bytes. Si el buffer es anómalo o falla la lectura, retrocede de forma transparente al volcado PNG tradicional (`screencap -p`).
* **Caché y Concurrencia (`server/services/screenshot_cache.py`):**
  * TTL diferenciado: `DEFAULT_IDLE_TTL = 30.0 s` (tarjetas en reposo) frente a `INTERACTIVE_TTL = 0.5 s` (pantalla enfocada).
  * Jitter anti-thundering-herd: $\pm 20\%$ aplicado al TTL en reposo para evitar tormentas de refresco sincronizadas.
  * Semáforo global: `_raw_capture_semaphore = threading.BoundedSemaphore(SCREENSHOT_MAX_CONCURRENT=3)` para proteger la RAM del host frente a volcados crudos masivos simultáneos (~9.6 MB de payload por frame).
  * Invalidación reactiva: Los métodos de interacción (`send_instance_tap`, `send_instance_swipe`, `send_instance_key`, `send_instance_text`) purgan inmediatamente la entrada de caché de la instancia interactuada tras confirmarse el evento.

### 2.3. Confinamiento de Recursos por Defecto (`perf/memory-default`)
* **Memoria RAM Predeterminada:** Si no se especifica `--memory`, se aplica `DEFAULT_INSTANCE_MEMORY = os.getenv("PROTEOMESH_DEFAULT_MEMORY", "2560m")` (2.5 GiB).
* **Swap Acotado:** Si no se especifica `--swap`, se aplica `DEFAULT_INSTANCE_SWAP = os.getenv("PROTEOMESH_DEFAULT_SWAP", "700m")`.
* **Cálculo Combinado para Docker:** Docker interpreta `--memory-swap` como el total de RAM física + Swap adicional. La función `compute_total_memory_swap` calcula aritméticamente la suma:
  $$\text{RAM } 2560\text{m} + \text{Swap } 700\text{m} = \mathbf{3260\text{m}}$$
  Esto confina en cgroup v2 `memory.max = 2684354560` y `memory.swap.max = 734003200` (700 MiB de swap estricto en disco).

### 2.4. Arranque por Lotes y Semáforo de Grupo (`perf/boot-batching`)
* **Consulta Única:** `get_disabled_packages()` ejecuta `pm list packages -d` una sola vez vía ADB y calcula el delta contra la lista objetivo. En lugar de disparar 24 llamadas ciegas, solo desactiva los paquetes que verdaderamente falten.
* **Segunda Pasada de Solo Lectura:** La verificación final de WindowManager y paquetes (`apply_runtime_defaults(..., read_only_verify=True)`) valida el estado sin ejecutar comandos destructivos ni bucles repetitivos si todo ya coincide.
* **Semáforo en Group Start:** `GROUP_START_CONCURRENCY = int(os.getenv("GROUP_START_CONCURRENCY", "2"))` limita los arranques masivos simultáneos en `server/services/manager_bridge.py`, mitigando contención de I/O y ráfagas destructivas de CPU.

---

## 3. Resultados Medidos (Antes / Después) y Limitaciones

> **Nota Metodológica:** Todas las mediciones fueron tomadas en un único host de desarrollo (AMD Ryzen 7 5700G 8C/16T, 14 GiB RAM utilizables, kernel Linux CachyOS x86_64 sobre Btrfs). Varias pruebas representan corridas aisladas o con bajo número de repeticiones ($n=1$ a $n=5$), por lo que deben considerarse como mediciones de referencia empírica y no como garantías de rendimiento en hardware heterogéneo.

| Operación / Métrica | Antes (Línea Base `chore/cleanup-residuos`) | Después (Rama Integrada) | Impacto / Diferencia |
|---|---|---|---|
| **Creación (`create`)** | 6.43 s (media 3 corridas: 7.8s, 7.5s, 4.0s) | **1.80 s** (1.2 s clonado CoW) | **3.6x más rápido** |
| **Espacio físico inicial** | ~1003.6 MiB exclusivos | **0.00 B exclusivos** (949.77 MiB compartidos CoW) | **0 B iniciales** |
| **Tiempo de arranque (`start`)** | 24.41 s (media 3 corridas: 28.2s, 22.7s, 22.3s) | **21.34 s** (corrida de integración) | **-3.07 s** |
| **Subprocesos de arranque** | 97 subprocesos (76.7 adb, 20.0 docker) | **63 subprocesos** (42 adb, 20 docker, 1 ping) | **-35% subprocesos** |
| **Llamadas `pm disable-user`** | 48 llamadas (24 x 2 pasadas ciegas) | **21 llamadas** (solo faltantes, 2da pasada 0) | **-56% llamadas** |
| **Latencia de screenshot** | 720.0 ms (pico hasta ~730 ms, pantallas simples ~190 ms) | **172.8 ms** (rango ~105 a ~178 ms) | **4.1x más rápido** |
| **Uso de CPU del guest en capturas** | 83.1% promedio (picos de 98% en guest) | **24.2% promedio** (picos de 30% en guest) | **-71% a -78% CPU guest** |
| **Invalidación ante tap/teclado** | Inexistente (espera vencimiento de TTL) | **Inmediata (0.1 ms tras interacción)** | Refresco interactivo |

*Limitación de Almacenamiento:* Los 0.00 B exclusivos aplican estrictamente al momento de la creación de la instancia. Conforme el sistema Android escribe en `/data` (bases de datos SQLite, cachés, registros), Btrfs asigna nuevos extents físicos independientes (en el primer boot se registran ~26.6 MiB modificados).

---

## 4. Guía Operativa de Uso

### 4.1. Construcción de la Imagen Auxiliar (Requerido una vez por host)
Para habilitar el clonado instantáneo por CoW reflink en sistemas de archivos Btrfs/XFS, construí la imagen auxiliar ejecutando:
```bash
bash tools/helper/build.sh
```
Si la imagen no existe en el daemon de Docker, el gestor retrocede automáticamente al método tradicional con `alpine` y emite un aviso instructivo en consola.

### 4.2. Variables de Entorno Configurables

| Variable | Valor por Defecto | Descripción |
|---|---|---|
| `PROTEOMESH_DEFAULT_MEMORY` | `2560m` | Límite de memoria RAM asignado a la instancia si no se pasa `--memory`. |
| `PROTEOMESH_DEFAULT_SWAP` | `700m` | Swap adicional asignado si no se pasa `--swap` (Docker recibe RAM + Swap). |
| `SCREENSHOT_IDLE_TTL` | `30.0` | Tiempo de vida en segundos de la caché de pantalla para tarjetas en reposo. |
| `SCREENSHOT_INTERACTIVE_TTL` | `0.5` | Tiempo de vida de caché en segundos para pantallas con foco interactivo. |
| `SCREENSHOT_MAX_CONCURRENT` | `3` | Límite del semáforo global para volcados de pantalla crudos simultáneos. |
| `GROUP_START_CONCURRENCY` | `2` | Cantidad máxima de contenedores que inician en paralelo durante group start. |

---

## 5. Advertencias Críticas

1. **Prohibido `btrfs filesystem defragment`:**
   No ejecutes `btrfs filesystem defragment` sobre `data-clean/` ni sobre el directorio `instances/`. La desfragmentación de Btrfs rompe los extents compartidos por Copy-on-Write y duplica el almacenamiento físico en disco para cada instancia existente.
2. **Interpretación de métricas de memoria en `docker stats`:**
   El valor de memoria reportado por `docker stats` incluye la caché de páginas de archivos (`file cache` / `inactive_file`) y **no contabiliza el uso de swap**. Para conocer el uso real de memoria anónima y swap, consultá directamente cgroup v2 en el host (`/sys/fs/cgroup/system.slice/docker-<id>.scope/` en `memory.current`, `memory.stat` y `memory.swap.current`).

---

## 6. Bug Corregido Durante la Integración

* **Problema:** El botón `2.5g` de la interfaz web (`web/`) fallaba con el error:
  `[!] Error: Formato de --memory inválido: '2.5g' (ejemplos válidos: 4g, 2048m, 2.5g, 512m)`.
* **Causa Raíz:** En `tools/instance_manager.py`, la expresión regular dentro del raw string de normalización tenía una doble barra invertida accidental: `dec_match = re.match(r"^(\d+(?:\\.\d+)?)([bkmg])$", mem)`. En Python raw string (`r"..."`), `\\.` busca una barra invertida literal seguida de cualquier carácter, rechazando el punto decimal (`.`).
* **Solución:** Corregido el escape a `r"^(\d+(?:\.\d+)?)([bkmg])$"` en memoria y swap.
* **Cobertura:** Cubierto exhaustivamente en `tests/host/test_manager_f3.py` con pruebas para `2.5g`, `2.0g`, `3.0g`, `4.0g`, `0.5g`, rechazo de decimales inválidos (`2..5g`, `.5g`, `2.g`) y suma con decimales en `compute_total_memory_swap`.

---

## 7. Pendientes y Hallazgos Abiertos (Investigación Futura)

Los siguientes ítems permanecen como observaciones abiertas y **no deben considerarse problemas resueltos**:
1. **Reinicio de Primer Arranque por Scope de Módulo:** En ciertas corridas de instancias recién creadas se observaron reinicios adicionales (`docker restart`) atribuidos teóricamente por lectura de código a la incorporación de paquetes nuevos (como la tienda oficial del fabricante) al scope dinámico de LSPosed vía `manage-spoof sync`. No obstante, el fenómeno no pudo ser reproducido de forma determinista y aislada en ensayos sintéticos (3 ensayos consecutivos arrojaron 0 reinicios con MD5 coincidentes).
2. **Evaluación de CPU Scheduling (`perf/cpu-scheduling` descartada):**
   * La comparación entre `cpuset 0-3` y `cpuset 0-7` arrojó una diferencia de apenas ~1.6 s a favor de 0-7 en régimen de 3 instancias (23.6 s vs 22.0 s), resultado insuficiente para justificar alterar el confinamiento.
   * La cuota flotante `--cpus 2.0` sin cpuset sufrió un severo estrangulamiento por CFS throttling del kernel Linux (entre 80 y 98 segundos acumulados de throttling por arranque), duplicando el tiempo de boot. Se decidió mantener `cpuset 0-3`.
3. **Optimizaciones Conceptuales sin Medir:**
   * Ajuste de `max_cached_processes` en Android para recortar memoria en reposo.
   * Uso de subvolúmenes Btrfs dedicados (`btrfs subvolume snapshot`) en lugar de `cp --reflink` directorio a directorio.

---

## 8. Rollback y Reversión

En caso de requerir revertir alguna de las optimizaciones, la rama `integration/perf-test` puede revertirse de forma atómica mediante `git revert`:

| Área | Commit | Comando de Reversión |
|---|---|---|
| **Fix Regex Decimales** | `157a14c` | `git revert 157a14c` |
| **Arranque por Lotes** | `1e6abd2` | `git revert 1e6abd2` |
| **Swap Configurable** | `7be64bf` | `git revert 7be64bf` |
| **Invalidación reactiva** | `442acfe` | `git revert 442acfe` |
| **Límite Memoria RAM** | `60306f3` | `git revert 60306f3` |
| **Semáforo y Jitter** | `04006a0` | `git revert 04006a0` |
| **Raw Framebuffer** | `8ebd044` | `git revert 8ebd044` |
| **Captura stderr fscrypt** | `466c9b4` | `git revert 466c9b4` |
| **Clonado CoW reflink** | `d243f1f` | `git revert d243f1f` |

Para descartar la integración completa, volver a la base limpia:
```bash
git checkout chore/cleanup-residuos
git branch -D integration/perf-test
```
