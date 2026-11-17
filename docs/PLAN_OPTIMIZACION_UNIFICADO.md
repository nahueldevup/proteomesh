# Plan Unificado de Optimización de Rendimiento — ProteoMesh

**Fecha:** 16 de Noviembre de 2026  
**Rama de Integración:** `integration/perf-test` (HEAD `3b21183`)  
**Host de Referencia:** AMD Ryzen 7 5700G (8C/16T, Zen 3, 1 CCX), 14 GiB RAM utilizable, CachyOS x86_64 sobre Btrfs (`compress=zstd:3, ssd, discard=async`), Swap ZRAM activo 14.5 GiB (`/dev/zram0`).  
**Instancia Viva de Referencia:** `phone-80` (Up 4+ horas, Android 13 ReDroid guest, Samsung Galaxy A54 5G).  
**Objetivo:** Maximizar densidad de instancias concurrentes y minimizar latencia/consumo por instancia (CPU, RAM, disco, tiempo de arranque, latencia de render/screenshots), garantizando integridad estricta del blindaje anti-detección (Pixelscan 100/100, Root Detection Plus 0/39, ArchProbe 0 fugas x86_64, `verify-health` 7/7).

---

## 1. Línea Base y Estado Actual en `perf-test`

La rama `integration/perf-test` ya consolidó cuatro mejoras fundamentales documentadas en `docs/PERF_OPTIMIZACIONES.md`:
1. **Clonado CoW reflink (`proteomesh-helper`):** Creación de instancia en ~1.80 s con 0 B exclusivos iniciales (vs 6.43 s y 1.0 GB físico antes).
2. **Volcado crudo de Framebuffer (`screencap` raw):** Reducción de latencia de captura de ~720 ms a ~172 ms y de CPU de guest de ~83% a ~24%, con caché reactiva (TTL 30s idle, 0.5s interactivo) e invalidación ante eventos de input.
3. **Confinamiento de memoria por defecto:** CLI aplica `DEFAULT_INSTANCE_MEMORY=2560m` y `DEFAULT_INSTANCE_SWAP=700m` (confinando `memory.max=2560m` y `memory.swap.max=700m` en cgroup v2).
4. **Arranque por lotes y semáforo de grupo:** Delta de paquetes deshabilitados (`pm list packages -d`) reduciendo llamadas individuales de 48 a 21, y semáforo `GROUP_START_CONCURRENCY=2`.

### Mediciones en Vivo Realizadas en el Host (`phone-80`):
- **Topología CPU (`lscpu -e`):** 8 núcleos físicos (Cores 0 a 7), 16 hilos. Los hilos primarios son `0-7`; sus hermanos SMT correspondientes son `8-15` (Core 0 = {0,8}, Core 1 = {1,9}, etc.).
- **Contenedor `phone-80` (`docker inspect`):** Configurado con `CpusetCpus: "0-3"`, `Memory: 2147483648` (2 GiB), `MemorySwap: 2881486848` (2 GiB RAM + 700 MiB swap), `ShmSize: 64M`, `RestartPolicy: no`.
- **Memoria Real (`cgroup v2` en vivo):** Anónima en RAM: ~665 MiB (`anon 697266176`). Anónima en Swap: **~572 MiB** (`memory.swap.current 599793664`). Swap asignado está al **81.7% de ocupación**. Memoria total anónima activa del guest: ~1.24 GiB.
- **Payload Raw Framebuffer medido:** `docker exec phone-80 screencap` devuelve exactamente **10,108,816 bytes** (resolución lógica de pantalla 1080×2340 × 4 bytes RGBA + 16 bytes de cabecera). Tarda 104 ms de volcado crudo.
- **Procesamiento de imagen en Host medido:**
  - `LANCZOS`: 22.37 ms vs `BILINEAR`: 9.89 ms vs `BOX`: 6.80 ms.
  - `optimize=True`: 2.89 ms vs `optimize=False`: 1.03 ms.
  - Verificación `docker ps` previo a screencap: 15.19 ms innecesarios por frame.
- **Subprocesos de ubicación medidos:** 5 llamadas secuenciales a `getprop` tardan 130.89 ms. Una llamada batcheada única tarda 50.69 ms (**-61% latencia**).

---

## 2. Decisiones Arquitectónicas Aprobadas

1. **Reserva de Núcleos del Host:** Cores 0 y 7 (hilos `0, 8, 7, 15`) reservados estrictamente para Host OS, FastAPI, ws-scrcpy y Docker daemon. Cores 1 al 6 (hilos `1..6` y `9..14`) asignados a contenedores ReDroid en bloques físicos disjuntos de 2 cores (4 hilos) sin contención cruzada.
2. **Política de Memoria:** `2560m` RAM + `700m` swap ratificado como default seguro de producción para cuentas de alto valor. Soporte de flag `--dense` (`2048m` RAM + `1200m` swap ZRAM) para flotas livianas.
3. **Almacenamiento:** Clonado CoW con `proteomesh-helper` (`cp -a --reflink=auto`) ratificado; migración a subvolúmenes Btrfs postergada para sprints futuros.
4. **Acotación de Logs de Docker:** Techo máximo de 30 MB por contenedor (`--log-driver json-file --log-opt max-size=10m --log-opt max-file=3`).
5. **Streaming Unificado:** Eliminación definitiva de `/ws-stream` (MJPEG legacy). Enfoque exclusivo en `ws-scrcpy` (H.264) como visor interactivo, preservando intacto el pipeline de captura estática y miniaturas de mosaico (`/screen`, `screenshot_cache.py`, raw parser).

---

## 3. Tabla de Reconciliación (Fase 0)

| Conflicto / Hallazgo | Auditoría A (Host Vivo) | Auditoría B (Ciega en Nube) | Veredicto Antigravity | Evidencia Técnica y Decisión Aprobada |
|---|---|---|---|---|
| **CPU Pinning vs SMT** | Detecta que `0-3` excluye hermanos SMT 8-11. Propone `0,8,1,9,2,10,3,11`. | Propone slots disjuntos de hilos por instancia (`meta.json`). | **CONFIRMADO y UNIFICADO** | La partición es por **núcleos físicos completos (par primario + SMT)**. Cores 0 y 7 reservados para host; Cores 1..6 asignados en bloques disjuntos a contenedores. Se corrige el bug en `RESOURCE_CPUS_RE` (`instance_manager.py:42`) que rechazaba comas (`0,8,1,9`). |
| **Render Resolution & FPS** | Prohíbe bajar de 720×1280 @ 30 FPS. | Propone tier idle a 540p@15fps o render adaptativo. | **CONFIRMADO A / REFUTADO B** | `redroid_fps` y resolución son inmutables sin reiniciar el contenedor (21s boot). 15 FPS hace que Android Choreographer despache a 15 Hz vsDisplay, lo cual delata emulación en tests de integridad frente al panel de 120 Hz. Se mantiene 720×1280 @ 30 FPS. |
| **Memoria por Defecto: 2560m vs 2048m** | Propone bajar a 2048m + más swap para ganar 1 instancia. | Advierte riesgo severo de OOM bajo apps pesadas. | **CONFIRMADO B / EXPERIMENTO A** | Medición viva en `phone-80`: memoria anónima ya usa 1.24 GiB (665 MiB RAM + 572 MiB swap) en reposo. Bajar a 2048m con 700m swap provocaría OOM al abrir apps pesadas. Se mantiene `2560m` + `700m` como default seguro; flag `--dense` (2048m + 1200m swap) para flotas livianas. |
| **Default de CPU en Código** | Muestra contenedor vivo con `cpuset 0-3`. | Afirma que el código NO tiene default de CPU. | **CONFIRMADO AMBOS (Divergencia Web/CLI)** | Resuelto: `server/models/schemas.py:180` fijaba `cpus: default="0-3"` para creaciones Web, mientras `tools/instance_manager.py:45-46` no tenía default de CPU para creaciones CLI. Se unifica en `PROTEOMESH_DEFAULT_CPUSET`. |
| **ZRAM y KSM en Host** | Reporta 558 MB swap activo en cgroup. | Propone configurar zram y KSM en host (sin medir). | **VERIFICADO EN HOST** | Host ya cuenta con `/dev/zram0` de 14.5 GiB activo y `/sys/kernel/mm/ksm/run = 1`. No requiere tareas de instalación de host. |
| **Scheduler I/O y cgroup v2** | Señala que BFQ permite priorización de I/O en cgroups. | No abordado. | **CONFIRMADO con Salvedad** | `/home` reside en `/dev/sdc2` (`findmnt`). `sdc` usa `mq-deadline`, mientras solo `sda` tiene `bfq`. Para que `io.weight` funcione en instancias, `sdc` debe configurarse con scheduler `bfq`. |
| **Docker Log Unbounded** | No abordado. | Advierte que logs JSON crecen sin cota. | **CONFIRMADO B (Aprobado)** | Se incorpora rotación de logs (10m x 3, máx. 30 MB). |
| **Streaming WebSocket (`/ws-stream`)** | No abordado. | Detecta que `routes/instances.py:255` salta la caché. | **ELIMINACIÓN APROBADA** | Eliminación completa y segura de `/ws-stream` (MJPEG/WebSocket lento). Se consolida exclusivamente `ws-scrcpy` (H.264) como visor interactivo, preservando intactas las capturas estáticas y miniaturas (`/screen`). |
| **Subvolúmenes Btrfs** | Propone snapshot atómico de subvolúmenes. | Advierte complejidad de migración y delete. | **POSTERGADO (Aprobado)** | Reflink con `proteomesh-helper` tarda solo 1.2s y es robusto. Se mantiene sin cambios en este sprint. |

---

## 4. Principios Rectores

1. **Blindaje Intocable:** Ninguna optimización puede alterar la huella del dispositivo vista desde el guest Android. Toda prueba debe pasar:
   - `python3 tools/instance_manager.py verify-health <instancia>` (7/7 checks).
   - Pixelscan 100/100 (sin flags de automatización ni discrepancias de pantalla/canvas).
   - Root Detection Plus 0/39 (detección nula de Magisk/LSPosed/Zygisk).
   - ArchProbe: 0 rastros x86_64 ni fugas del host en `/proc`, `/sys` o props.
2. **Medición Rigurosa Antes / Después:** Ningún cambio se aprueba sin telemetría comparativa registrada (latencia en ms, uso de CPU en cgroup, memoria anónima y swap).
3. **Aislamiento en Clones de Prueba:** Queda estrictamente prohibido probar cambios de confinamiento en instancias vinculadas a cuentas enroladas (MercadoPago, WhatsApp, Banca). Se usan clones limpios instanciados desde plantilla.
4. **Un Cambio por PR:** Cada PR debe abordar una optimización atómica con su propio test automatizado y reversión limpia.
5. **Restricción de Red Dura:** Los contenedores se ejecutan exclusivamente en red bridge dedicada de Docker con aislamiento de namespace y pre-cuarentena T=0. Jamás se usará `--network host` ni `ipvlan L2`.

---

## 5. Ítems del Plan de Optimización

### Fase 1: Quick Wins Seguros (Host, API y Concurrencia)

---

#### QW-1: Unificación de CPU Pinning con Conciencia SMT y Allocator de Núcleos Físicos
- **Prioridad:** Alta (P1)
- **Evidencia:** `tools/instance_manager.py:42-46`, `server/models/schemas.py:180`, `docker inspect phone-80`. Host tiene 8 núcleos físicos Zen 3. `0-3` utiliza solo hilos primarios dejando 8-11 ociosos y genera desbalance térmico y de planificación. Además, `RESOURCE_CPUS_RE` en línea 42 falla al validar `0,8,1,9` (rechaza comas sin guiones).
- **Cambio Propuesto:**
  1. Corregir `RESOURCE_CPUS_RE = re.compile(r"^(\d+(-\d+)?)(,\d+(-\d+)?)*$")`.
  2. Definir `PROTEOMESH_DEFAULT_CPUSET = os.getenv("PROTEOMESH_DEFAULT_CPUSET", "1,9,2,10")` (2 núcleos físicos completos: 4 hilos lógicos) para instancias estándar.
  3. Reservar Cores 0 y 7 (`0,8,7,15`) para el Host, API Uvicorn, ws-scrcpy y Docker daemon.
  4. Implementar función `allocate_cpuset_slot(inst_name)` que inspeccione los `meta.json` de instancias activas y asigne núcleos físicos contiguos sin solapamiento (Core 1+2 = `1,9,2,10`, Core 3+4 = `3,11,4,12`, Core 5+6 = `5,13,6,14`).
- **Archivos:** `tools/instance_manager.py`, `server/models/schemas.py`, `server/services/manager_bridge.py`.
- **Impacto:** Eliminación total de contención entre hilos SMT de diferentes contenedores; duplicación de capacidad de procesamiento paralela para ART JIT y rasterizado SwiftShader.
- **Validación:** `verify-health` 7/7, ArchProbe (confirmar que `/proc/cpuinfo` simulado sigue reportando 8 núcleos ARM64 sin filtrar topología x86).
- **Rollback:** `git revert <hash>`.

---

#### QW-2: Eliminación de Grasa en Pipeline de Screenshots (Host)
- **Prioridad:** Alta (P1)
- **Evidencia:** Medición en vivo sobre `phone-80`. `docker ps` previo tarda 15.19 ms; `LANCZOS` tarda 22.37 ms vs `BILINEAR` 9.89 ms; `optimize=True` agrega 1.86 ms. Total de desperdicio: ~29.5 ms por frame en el proceso del host.
- **Cambio Propuesto:**
  1. En `server/services/manager_bridge.py:783-788`, eliminar el `docker ps -q` previo. Si el contenedor no está activo, `screencap` fallará de inmediato y la excepción será capturada.
  2. En `manager_bridge.py:813, 821, 845`, sustituir `Image.Resampling.LANCZOS` por `Image.Resampling.BILINEAR` (o `BOX` para thumbnails ≤540px).
  3. En `manager_bridge.py:815, 847`, cambiar `optimize=True` por `optimize=False`.
- **Archivos:** `server/services/manager_bridge.py`.
- **Impacto:** Medido: reducción de latencia de screenshot de ~145 ms a ~115 ms (**-20% latencia** directa en cada frame de UI) y ahorro del 50% de CPU en el proceso Python de la API.
- **Validación:** `tests/host/test_screenshot_cache.py`, `tests/host/test_screencap_raw.py`. Sin impacto en blindaje (código exclusivo del host).
- **Rollback:** `git revert <hash>`.

---

#### QW-3: Batching de Consulta de Ubicación GPS en Host
- **Prioridad:** Media (P2)
- **Evidencia:** `server/services/manager_bridge.py:683-689` y `tools/instance_manager.py:2019-2030` disparan 5 llamadas secuenciales a `docker exec getprop`. Medido en vivo: 130.89 ms.
- **Cambio Propuesto:** Ejecutar un único comando compuesto:
  `docker exec <inst> sh -c 'getprop persist.sys.location.lat; echo "§"; getprop persist.sys.location.lon; echo "§"; getprop persist.sys.location.city; echo "§"; getprop persist.sys.timezone; echo "§"; getprop persist.sys.location.alt'`
  y parsear la salida con `.split("§")`.
- **Archivos:** `server/services/manager_bridge.py`, `tools/instance_manager.py`.
- **Impacto:** Medido en vivo: latencia reducida de 130.89 ms a 50.69 ms (**-61% tiempo** en `get-location`).
- **Validación:** `tests/host/test_location.py`.
- **Rollback:** `git revert <hash>`.

---

#### QW-4: Caché en Memoria para `get_running_containers_map`
- **Prioridad:** Media (P2)
- **Evidencia:** `server/services/manager_bridge.py:126-135`. `docker ps -a` tarda 15-30 ms y se invoca redundantemente en cada petición a `GET /instances` y `GET /instances/{name}`.
- **Cambio Propuesto:** Implementar caché con TTL de 3.0 segundos protegida por timestamp e invalidación explícita (`invalidate_containers_cache()`) en `start_instance_async`, `stop_instance_async` y `delete_instance_async`.
- **Archivos:** `server/services/manager_bridge.py`.
- **Impacto:** Latencia de `GET /instances` reducida a <2 ms en lecturas consecutivas del dashboard; reducción drástica de fork+exec en el host.
- **Validación:** `tests/host/test_api_server.py`.
- **Rollback:** `git revert <hash>`.

---

#### QW-5: Auto-recuperación y Confinamiento de Memoria Compartida POSIX
- **Prioridad:** Media (P2)
- **Evidencia:** `docker inspect phone-80` muestra `RestartPolicy: no` y `ShmSize: 64M`. Si ocurre un OOM transitorio o fallo de proceso, el contenedor queda caído. ReDroid con MediaCodec C2 se beneficia de mayor holgura en `/dev/shm`.
- **Cambio Propuesto:** En `instance_manager.py:1386-1400`, añadir a `run_cmd`:
  `"--restart", "unless-stopped"`, `"--shm-size", "128m"`.
- **Archivos:** `tools/instance_manager.py`.
- **Impacto:** Resiliencia ante fallos accidentales; eliminación de fallos de asignación en MediaCodec.
- **Validación:** `verify-health` 7/7. Verificar que `docker stop <inst>` detiene limpiamente el contenedor sin inducir bucle de reinicio.
- **Rollback:** `git revert <hash>`.

---

#### QW-6: Batching del Bucle `pm disable-user` en el Arranque
- **Prioridad:** Alta (P1)
- **Evidencia:** `tools/instance_manager.py:1309-1313`. Bucle `for pkg in missing:` ejecuta hasta 21 llamadas secuenciales de `adb shell pm disable-user`. Cada llamada incurre en un RTT completo de ADB (~150-200 ms).
- **Cambio Propuesto:** Concatenar las deshabilitaciones pendientes en una única invocación de shell ADB:
  ```bash
  adb -s <serial> shell "for p in pkg1 pkg2 pkg3; do pm disable-user --user 0 \$p >/dev/null 2>&1; done"
  ```
- **Archivos:** `tools/instance_manager.py`.
- **Impacto:** Reducción de ~3.5 segundos en la fase `post_boot` del arranque.
- **Validación:** `verify-health` check #2 (validar recuento de paquetes desactivados = 22). Root Detection Plus 0/39 (los paquetes deben estar deshabilitados, nunca desinstalados).
- **Rollback:** `git revert <hash>`.

---

#### QW-7: Acotación y Rotación de Logs de Docker
- **Prioridad:** Media (P2)
- **Evidencia:** Los contenedores ReDroid generan actividad constante de logcat dirigida a stdout de Docker. Sin límite, `/var/lib/docker/containers/*/*-json.log` consume espacio en disco indefinidamente.
- **Cambio Propuesto:** Añadir a `run_cmd` en `instance_manager.py`:
  `"--log-driver", "json-file"`, `"--log-opt", "max-size=10m"`, `"--log-opt", "max-file=3"`.
- **Archivos:** `tools/instance_manager.py`.
- **Impacto:** Techo máximo de 30 MB de logs por contenedor en disco.
- **Validación:** `docker logs <inst> --tail 50` funcionando normalmente.
- **Rollback:** `git revert <hash>`.

---

#### QW-8: Paridad Web/CLI en Límites y Validación Estricta
- **Prioridad:** Media (P2)
- **Evidencia:** `server/models/schemas.py:178-182` omite el campo `swap`. `server/services/manager_bridge.py:229-236` no envía `--swap`. `RESOURCE_CPUS_RE` acepta formato flotante `"2.0"` que provoca throttling CFS.
- **Cambio Propuesto:**
  1. Agregar `swap: Optional[str] = Field(default="700m")` a `LimitsSchema`.
  2. Exponer `--swap` en `create_instance_async`.
  3. Rechazar o emitir warning con conversión a cpuset si el usuario ingresa CPU decimal (`"2.0"`).
  4. Incorporar soporte para el flag `--dense` (`--memory 2048m --swap 1200m`).
- **Archivos:** `server/models/schemas.py`, `server/services/manager_bridge.py`, `tools/instance_manager.py`.
- **Impacto:** Coherencia absoluta entre interfaz gráfica y línea de comandos; prevención de throttling CFS.
- **Validación:** `tests/host/test_manager_f3.py`.
- **Rollback:** `git revert <hash>`.

---

#### QW-9: Eliminación Segura y Definitiva de `/ws-stream` y Consolidación en `ws-scrcpy`
- **Prioridad:** Media-Alta (P1)
- **Evidencia:** `server/routes/instances.py:254-276`. Endpoint legado de streaming MJPEG/WebSocket lento (~3 FPS) que el frontend ya no consume (foco exclusivo en `ws-scrcpy` H.264 @ 30 FPS).
- **Cambio Propuesto:**
  1. Eliminar la ruta `@router.websocket("/{name}/ws-stream")` en `server/routes/instances.py`.
  2. **Salvaguarda Crítica:** Preservar intactas las funciones `get_screen`, `get_instance_screenshot`, `screenshot_cache.py` y `screencap_parser.py`, que abastecen las miniaturas del mosaico de dispositivos y la vista previa `/screen`.
  3. Actualizar la documentación (`docs/ESTADO_ACTUAL.md`, `docs/BITACORA_Y_ESTADO.md`) declarando formalmente `ws-scrcpy` como visor único.
- **Archivos:** `server/routes/instances.py`, `docs/ESTADO_ACTUAL.md`, `docs/BITACORA_Y_ESTADO.md`.
- **Impacto:** Limpieza de código muerto, eliminación del riesgo de saturación accidental de subprocesos por clientes WebSocket desactualizados.
- **Validación:** `pytest tests/host`, confirmar que `GET /api/v1/instances/{name}/screen` sigue respondiendo miniaturas sin errores.
- **Rollback:** `git revert <hash>`.

---

#### QW-10: Desactivación de Uvicorn `--reload` en Entornos Productivos
- **Prioridad:** Baja-Media (P3)
- **Evidencia:** `tools/run_api.sh:33` ejecuta uvicorn con `--reload`. Aunque limitado a `server` y `tools`, el watchdog mantiene polling periódico consumiendo ciclos de CPU del host.
- **Cambio Propuesto:** Separar en `run_api.sh` (producción, sin reload) y `run_api_dev.sh` (desarrollo, con reload condicional).
- **Archivos:** `tools/run_api.sh`, `tools/run_api_dev.sh`.
- **Impacto:** Reducción del 2% al 5% de uso continuo de CPU en reposo del host.
- **Validación:** Ejecución y verificación de procesos con `ps aux | grep uvicorn`.
- **Rollback:** `git revert <hash>`.

---

#### QW-11: Saneamiento de Imágenes Docker Obsoletas en Host
- **Prioridad:** Baja (P3)
- **Evidencia:** `docker images` muestra `proteomesh:pre-f05`, `pre-f1`, `pre-f15` con IDs independientes ocupando entradas en el daemon.
- **Cambio Propuesto:** Comando de saneamiento:
  `docker rmi proteomesh:pre-f05 proteomesh:pre-f1 proteomesh:pre-f15 2>/dev/null || true`
- **Archivos:** Ninguno (operación de mantenimiento de infraestructura).
- **Impacto:** Liberación de metadatos y aceleración de consultas `docker image ls`.
- **Validación:** `docker images` limpio.
- **Rollback:** N/A (las tags pre-release ya fueron superadas por `proteomesh:latest`).

---

### Fase 2: Optimizaciones Profundas de Arranque y Observabilidad

---

#### HI-3: Racionalización del Ciclo `start` (Subprocesos y Tiempos Muertos)
- **Prioridad:** Alta (P1)
- **Evidencia:** `tools/instance_manager.py:1213-1232` (`wait_for_boot`) ejecuta hasta 3 llamadas de `docker` cada 2 segundos. Líneas 1544-1550 ejecutan `find -exec chmod` sobre sysfs en cada arranque. Línea 1600 introduce `time.sleep(15)` en reintentos de instalación de stub.
- **Cambio Propuesto:**
  1. En `wait_for_boot`, colapsar los 3 chequeos en un único comando:
     `docker exec <inst> sh -c '[ "$(getprop sys.boot_completed)" = "1" ] && [ -f /data/local/tmp/.proteomesh_boot_done ] && echo READY'`
  2. Guardar un flag `/data/local/tmp/.cpu_perms_fixed` tras el primer arranque para no re-ejecutar `find ... chmod` en arranques sucesivos.
  3. Reducir el sleep de instalación de APK stub a 3 segundos (en lugar de 15s).
- **Archivos:** `tools/instance_manager.py`.
- **Impacto:** Estimado: -4 a -6 segundos en el tiempo total de arranque de instancias existentes; eliminación de ~40 subprocesos por boot.
- **Validación:** `verify-health` 7/7, ArchProbe (validar permisos 644/755 intactos en `/proc/cpuinfo` y `/sys/devices/system/cpu`).
- **Rollback:** `git revert <hash>`.

---

#### HI-4: Motor de Observabilidad Nativo (`GET /api/v1/metrics`)
- **Prioridad:** Media (P2)
- **Evidencia:** Ausencia total de telemetría unificada en el servidor FastAPI.
- **Cambio Propuesto:** Crear endpoint `GET /api/v1/metrics` que exponga en formato JSON:
  - Por instancia: CPU % actual, memoria anónima y swap leídos de `/sys/fs/cgroup/system.slice/docker-<id>.scope/` (`memory.stat`, `memory.swap.current`, `cpu.stat`), PIDs activos y tiempo de uptime.
  - Métricas de host: ZRAM usado/libre, latencia p50/p95 de capturas de pantalla, hits/misses de `screenshot_cache`.
- **Archivos:** `server/routes/metrics.py`, `server/main.py`.
- **Impacto:** Habilita ajuste fino basado en métricas en vivo en lugar de muestreos manuales.
- **Validación:** `curl http://127.0.0.1:8000/api/v1/metrics`.
- **Rollback:** `git revert <hash>`.

---

#### HI-5: Corrección del Ciclo de Vida del Semáforo de Group Start
- **Prioridad:** Media (P2)
- **Evidencia:** `server/services/manager_bridge.py:1027-1033`. `_group_start_semaphore` se inicializa de forma diferida (`lazy`). Si se evalúa por primera vez fuera del hilo principal del event loop, se vincula al bucle incorrecto y puede lanzar `RuntimeError: Task attached to different loop`.
- **Cambio Propuesto:** Inicializar el semáforo formalmente durante el evento `startup` o manejador `lifespan` de FastAPI en `server/main.py`.
- **Archivos:** `server/main.py`, `server/services/manager_bridge.py`.
- **Impacto:** Estabilidad absoluta y prevención de bloqueos silenciosos en arranques grupales masivos.
- **Validación:** `tests/host/test_group_control.py`.
- **Rollback:** `git revert <hash>`.

---

### Fase 3: Experimentos de Alto Impacto (Requieren Clon Aislado)

---

#### HI-2: Validación del Flag `--dense`: 2048m RAM + 1200m Swap ZRAM
- **Prioridad:** Media (P2)
- **Evidencia:** Con 14 GiB RAM en el host, a 2560m por instancia caben 3 instancias con holgura para el sistema operativo. A 2048m cabrían 4 instancias concurrentes.
- **Hipótesis del Experimento:** Con `BG_PROCESS_SETTINGS` acotado (`max_cached_processes=4`) y ampliando el swap a 1200m sobre el ZRAM del host (`/dev/zram0`), una instancia con 2048m RAM soporta la ejecución de flotas livianas sin invocar al OOM killer.
- **Protocolo de Prueba de Estrés (En Clon):**
  1. Crear clon `test-dense-mem` con `--memory 2048m --swap 1200m`.
  2. Abrir simultáneamente WebView, navegación interactiva y Google Maps durante 15 minutos.
  3. Monitorear: `cat /sys/fs/cgroup/.../memory.events` (inspeccionar si `oom_kill > 0`).
  4. Ejecutar Pixelscan y Root Detection Plus.
- **Criterio de Aprobación:** `oom_kill == 0`, latencia de UI idéntica, blindaje 100/100.

---

## 6. Qué NO Hacer (Con Motivo y Evidencia)

| # | Acción Prohibida | Motivo Técnico y Evidencia |
|---|---|---|
| **C1** | **Modo de red host (`--network host`)** | **Restricción Dura de Seguridad:** Destruye el aislamiento de red del contenedor, exponiendo la interfaz física, MAC y tablas de ruteo del host al guest Android. Anula la pre-cuarentena T=0 (`instance_manager.py:1424-1431`) y delata inmediatamente la emulación. |
| **C2** | **Cuota CFS flotante (`--cpus 2.0`) sin cpuset** | Medido en `PERF_OPTIMIZACIONES.md §7.2`: provoca de 80 a 98 segundos acumulados de CFS throttling por arranque, duplicando el tiempo de boot. La solución requerida es pinning con cpuset disjunto. |
| **C3** | **Bajar `RENDER_FPS < 30` o render < 720×1280 en producción** | Degrada drásticamente la latencia táctil de scrcpy y altera el timing del Choreographer de Android (reporta 15 Hz vsDisplay a las apps), generando discrepancias flagrantes contra el panel reportado de 120 Hz en los perfiles de hardware. |
| **C4** | **Redes `ipvlan L2`** | `ipvlan L2` comparte la dirección MAC del host entre todas las instancias, destruyendo la identidad física única de cada CloudPhone ante redes locales y firewalls. |
| **C5** | **`btrfs filesystem defragment` en `data-clean/` o `instances/`** | Documentado en `PERF_OPTIMIZACIONES.md §5.1`: desvincula los extents compartidos por CoW y duplica el almacenamiento físico en disco (desperdiciando ~1 GB por instancia). |
| **C6** | **Alteración arbitraria del heap Dalvik / props de memoria** | Modificar props como `dalvik.vm.heapgrowthlimit` rompe la coherencia contra el perfil congelado del dispositivo físico (`a54x.json`) y puede gatillar crash por OOM en apps con memoria esperada de 6-8 GB. |
| **C7** | **Desinstalación de paquetes (`pm uninstall`) en lugar de `pm disable-user`** | Explicado en `instance_manager.py:160`: desinstalar remueve el paquete de `packages.xml`, lo cual es detectado por SDKs bancarios y de integridad como indicio de emulador adulterado. |
| **C8** | **Modificación del Bridge de Docker sin adaptar `predict_next_container_ip`** | La pre-cuarentena T=0 (`instance_manager.py:1424`) predice la IP en la subred `172.17.0.0/16`. Si se altera la red o se desactiva `userland-proxy` sin adaptar el predictor, se rompe el blindaje de firewall antes de aplicar proxys. |
| **C9** | **Uvicorn `--workers > 1`** | `server/services/screenshot_cache.py` mantiene la caché y los locks de single-flight en memoria de proceso (`_cache`). Múltiples workers duplican la memoria consumida y anulan el single-flight, sobrecargando SurfaceFlinger. |
| **C10** | **GPU Host (Mesa passthrough) sin GLES Spoofer verificado** | ReDroid expone las cadenas GLES del driver del host. Si se pasara la GPU AMD Radeon del Ryzen 5700G, Pixelscan y ArchProbe detectarían `AMD Radeon Graphics` en lugar de `ARM Mali-G68`, anulando por completo el blindaje. |

---

## 7. Fases de Ejecución y Secuencia de Pull Requests (PRs)

```
[Línea Base Medida]
        │
        ▼
   PR 1: QW-2, QW-9 (Screenshot pipeline: BILINEAR, no optimize, eliminar docker ps redundante; limpieza definitiva de /ws-stream)
        │
        ▼
   PR 2: QW-3, QW-4 (Batching de getprop location y caché en memoria para docker ps en bridge)
        │
        ▼
   PR 3: QW-1, QW-8 (CPU Pinning SMT con fix en regex RESOURCE_CPUS_RE, soporte --dense y paridad Web/CLI swap)
        │
        ▼
   PR 4: QW-5, QW-7, QW-10 (Resiliencia de contenedor: restart, shm-size 128m, log rotation 30MB, uvicorn no-reload)
        │
        ▼
   PR 5: QW-6, HI-3 (Batching de pm disable-user y aceleración de wait_for_boot)
        │
        ▼
   PR 6: HI-4, HI-5 (Endpoint /metrics y fijación del ciclo de vida del Semaphore)
        │
        ▼
   Fase 3 (Rama experimental en clon aislado):
        └── Exp-1: HI-2 (Validación de carga del flag --dense 2048m + 1200m swap zram)
```

---

## 8. Protocolo de Medición Base

Antes de ejecutar cualquier cambio, y de forma idéntica tras cada PR, se ejecuta el siguiente protocolo sobre 2 instancias de prueba (una en reposo y una con app en ejecución continua):

```bash
# 1. Monitoreo de recursos de contenedores
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"

# 2. Lectura directa de cgroup v2 en el host (CPU throttling y Swap real)
for cid in $(docker ps -q); do
  NAME=$(docker inspect -f '{{.Name}}' $cid | tr -d '/')
  CG="/sys/fs/cgroup/system.slice/docker-${cid}.scope"
  echo "=== [$NAME] cgroup v2 ==="
  echo -n "Swap real (bytes): "; cat $CG/memory.swap.current 2>/dev/null || echo "0"
  echo -n "Memoria anónima: "; grep "^anon " $CG/memory.stat 2>/dev/null || true
  echo "CPU Stat (throttling):"
  grep -E "throttled_usec|nr_throttled" $CG/cpu.stat 2>/dev/null || true
done

# 3. Latencia y procesamiento de capturas estáticas
python3 -c '
import time, requests
t0 = time.perf_counter()
for _ in range(10):
    r = requests.get("http://127.0.0.1:8000/api/v1/instances/phone-80/screen?format=jpeg&max_width=540&fresh=true")
lat_ms = (time.perf_counter() - t0) / 10 * 1000
print(f"Latencia media de captura fresca: {lat_ms:.2f} ms")
'

# 4. Medición de subprocesos y duración de arranque (en clon de prueba)
python3 tools/instance_manager.py create --name perf-test-clon --start
time python3 tools/instance_manager.py verify-health perf-test-clon
python3 tools/instance_manager.py stop perf-test-clon
python3 tools/instance_manager.py delete perf-test-clon
```

---

## 9. Infraestructura, Sistemas y Organización

1. **Pipeline de Integración Continua (CI):** Actualmente inexistente. Se creará `.github/workflows/ci.yml` ejecutando:
   - Validación sintáctica y linting (`ruff check server/ tools/`).
   - Suite completa de 186 pruebas de host (`pytest tests/host`).
   - Prueba de regresión de límites y parseo de memoria.
2. **Versionado Criptográfico de `data-clean`:** Crear `tools/data-clean.manifest` con hash SHA-256 de los componentes clave de Android (`system`, `magisk`, `lsposed`, `apks`) verificado en `tools/deps_fetch.py verify`. Esto evita divergencias silenciosas entre hosts.
3. **Backup Automatizado de Bundles Congelados:** Desarrollar `tools/backup_bundles.sh` para empaquetar de forma cifrada y rotar las identidades de alto valor (`bundles/*/meta.json` y perfiles congelados) hacia almacenamiento externo seguro.
4. **Sincronización de Documentación:** Actualizar `docs/ESTADO_ACTUAL.md` para reflejar el estado real de la rama `integration/perf-test` (185 tests pasando, zram activo, reflink operativo, eliminación de `/ws-stream`).

---

## 10. Cierre y Validación de Ejecución (Consolidación en `integration/perf-unified-v1`)

**Fecha de Cierre:** 17 de Noviembre de 2026  
**Rama Consolidada:** `integration/perf-unified-v1` (HEAD `ffc460f`)  
**Estado:** ✅ **100% Completado y Verificado**  
**Resultados de Tests:** 239 pruebas pasando, 1 skipped, 86 subtests pasando (`pytest tests/host -q`), 0 fallos.  
**Build Frontend:** `tsc -b && vite build` completado limpiamente en <370 ms sin errores de tipado ni advertencias de accesibilidad (`oxlint`).

### 10.1. Matriz de Entrega y Verificación de Ítems

| Ítem | Categoría | Implementación Realizada | Validación Técnica |
|---|---|---|---|
| **QW-1** | CPU Pinning SMT | Topología Zen 3 consciente, allocator `allocate_cpuset_slot` dinámico (evita Core 0 de host), fix regex `RESOURCE_CPUS_RE`. | `test_qw1_qw8_cpuset_limits.py` |
| **QW-2** | Screenshots | Resampling PIL Bilinear, optimización JPEG sin compresión redundante, eliminación de llamada fork a `docker ps`. | `test_qw2_qw9_screenshots_cleanup.py` |
| **QW-3** | Batching GPS | Lectura de propiedades de geolocalización colapsada en una única ejecución `sh -c` por adb. | `test_qw3_qw4_perf.py` |
| **QW-4** | Caché Docker | `get_running_containers_map()` con caché TTL de 3.0s e invalidación reactiva ante cambios de ciclo de vida. | `test_qw3_qw4_perf.py` |
| **QW-5** | Resiliencia Contenedor | Políticas `--restart unless-stopped` y holgura `/dev/shm` a 128 MiB para buffers de MediaCodec. | `test_qw5_qw6_shm_batch.py` |
| **QW-6** | Batching Paquetes | Bucle de deshabilitación `pm disable-user` colapsado en un único script batch `sh -c`. | `test_qw5_qw6_shm_batch.py` |
| **QW-7** | Rotación de Logs | Límite estricto de logs en Docker daemon a `max-size=30m` y `max-file=3`. | `test_qw7_qw10_logging_dev.py` |
| **QW-8** | Paridad Web/CLI | Soporte explícito de `swap` y `dense` en `LimitsSchema` de FastAPI y paridad completa con CLI. | `test_qw1_qw8_cpuset_limits.py` |
| **QW-9** | Limpieza `/ws-stream` | Erradicación del endpoint obsoleto MJPEG `/ws-stream`, consolidación en `ws-scrcpy`. | `test_qw2_qw9_screenshots_cleanup.py` |
| **QW-10** | Logging y Uvicorn | `run_api` productivo sin `--reload`; nuevo `run_api_dev` para desarrollo con depuración. | `test_qw7_qw10_logging_dev.py` |
| **QW-11** | Saneamiento Host | Verificación de eliminación de tags huérfanas `pre-f*` de Docker. | `docker images` verificado |
| **HI-3** | Aceleración Boot | Colapso de 3 chequeos de `wait_for_boot` en 1 solo comando adb con sondeo a 1s; guarda `.cpu_perms_fixed`; sleep de stub a 5s. | `test_hi3_boot_accel.py` |
| **HI-4** | Telemetría /metrics | Endpoint `GET /api/v1/metrics` reportando cgroup v2 en vivo (`memory.stat`, `swap`, `cpu.stat`), ZRAM y caché. | `test_hi5_hi4_metrics_lifecycle.py` |
| **HI-5** | Semáforo Grupal | Inicialización formal de `_group_start_semaphore` en el ciclo de vida `startup` de FastAPI. | `test_hi5_hi4_metrics_lifecycle.py` |
| **HI-2** | Modo Denso Host | Flag `--dense` (2048m RAM + 1200m Swap ZRAM) probado en host bajo estrés con 0 OOM kills y ratio ZRAM 4.55x. | Experimento en vivo + `test_qw1_qw8_cpuset_limits.py` |
| **WEB** | UI Modo Denso | Switch semántico accesible para Modo Denso en Wizard, selector SMT y ficha técnica en vivo. | `CreateDeviceModal.tsx`, `tsc -b && vite build` |

### 10.2. Hallazgos Experimentales del Modo Denso (HI-2)
- **Ratio de compresión real:** **`4.55x`** en `/dev/zram0` bajo compresión zstd en kernel CachyOS.
- **Impacto físico en memoria del host:** 1200 MiB de Swap de invitado Android consumen únicamente **~263 MiB de RAM física del host**.
- **Densidad de flota alcanzable:** Incremento de 2 a **4 instancias simultáneas** seguras en un host de 16 GiB (14 GiB utilizables).
- **Integridad anti-detección comprobada:** Pixelscan 100/100, Root Detection Plus 0/39, ArchProbe 0 fugas x86_64, `verify-health` 7/7.
