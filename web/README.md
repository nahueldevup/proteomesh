# ProteoMesh CloudPhone Platform — Frontend Web Panel 🛡️📱

Panel web de orquestación, supervisión y control masivo de CloudPhones Android (ReDroid 13 / API 33) diseñado bajo estándares de alta densidad inspirados en **GenFarmer** y el sistema de diseño Dark Tech minimalista de **Lovable** (`proteo-harvest-flow`).

---

## 🎯 Origen, Referencias y Decisiones de Diseño

### 1. Referencias Clave
* **Lovable (`proteo-harvest-flow`):** Modelo estético de referencia directa. Paleta de colores en espacio **OKLCH** con fondo negro obsidiana (`--background: oklch(0.17 0.008 255)`), superficies elevadas (`--surface: oklch(0.195 0.009 255)`), bordes técnicos (`--border: oklch(0.29 0.01 255)`), y acento primario cian eléctrico (`--primary: oklch(0.74 0.14 225)`). Tipografías emparejadas: **Geist** para interfaz y títulos, y **Geist Mono** / **JetBrains Mono** para identificadores técnicos, puertos ADB y metadatos.
* **GenFarmer (`genfarmer.com`):** Estándar ergonómico de control de granjas de terminales móviles. Requiere densidad variable (slider de 4 a 12 columnas), selección masiva (clic, Shift+clic por rangos, Ctrl+A), interacción sincronizada en tiempo real (espejo de toques multi-device) y barra de acciones en lote flotante (`BulkBar`).
* **ws-scrcpy (NetrisTV):** Motor de streaming de hardware H.264 de latencia ultrabaja (~20ms / 60 FPS) vía WebCodecs y MSE.

---

## 🏗️ Principios Arquitectónicos y Reglas Invariables

### 1. Chasis Height-Driven y Rack Proporcional (*Aspect Ratio Invariant*)
* **El Problema del Letterboxing y el Scroll Vertical:** Incrustar vistas de pantallas Android dentro de cajas con alturas o anchos rígidos genera gruesas bandas negras laterales (`object-contain`) o desborda la pantalla obligando a realizar scroll vertical indeseado.
* **Solución Implementada:**
  - **Rack Horizontal Height-Driven:** Disposición en fila con scroll horizontal fluido (`flex h-full items-center gap-4 overflow-x-auto`).
  - **Altura atada al Viewport:** El contenedor gobierna la altura (`h-full` / `min(100vh - 180px, 840px)`). El ancho de cada tarjeta se deriva estrictamente de la relación de aspecto dinámica (`style={{ aspectRatio: `${nativeWidth} / ${nativeHeight}` }}` en `DeviceCard.tsx`, con fallback seguro a `720 / 1560`).
  - Tanto las capturas JPEG en reposo como el canvas WebCodecs en vivo llenan el 100% del área activa de borde a borde (`object-cover`) con cero bandas negras y perfecta adaptación visual en pantallas de 1080p y 768p.

### 2. Estándar de Botones Estrictamente en Iconos (`IconBtn`)
* Queda prohibido el uso de botones con texto verboso ("Apagar", "Encender", "Ver Detalles") en tarjetas de flota, barras de lote o docks de emulación.
* Todas las acciones se implementan mediante `IconBtn` acompañado de micro-tooltips instantáneos (`@radix-ui/react-tooltip`) con variantes semánticas (`ghost`, `solid`, `primary`, `danger`, `success`, `active`, `warning`).

### 3. Cero IFrames: WebCodecs Nativo en Canvas y Streaming Lazy
* **Erradicación Total de IFrames:**
  - El antiguo enfoque de `iframe` para incrustar `ws-scrcpy` introducía sobrecargas de memoria, barras de herramientas internas redundantes que requerían parches frágiles de CSS y fallos de codec `BAD_INDEX (6)` por desajustes dimensionales.
  - La arquitectura actual utiliza renderizado directo sobre `<canvas>` HTML5 mediante la API nativa de Chromium **`VideoDecoder`** (`hardwareAcceleration: 'prefer-hardware'` y `optimizeForLatency: true`).
* **Protocolo Binario scrcpy Propio (`web/src/lib/scrcpy/protocol.ts`):**
  - Conexión WebSocket directa a `/ws-scrcpy/?action=proxy-adb&remote=tcp:8886&udid=127.0.0.1:{adb_port}`.
  - Negociación inicial con paquete binario de 36 bytes (`TYPE_VIDEO_SETTINGS`, 720x1560 solicitando 30 FPS y 2 Mbps nominales).
  - Paquetes binarios serializados en el cliente:
    * `TYPE_TOUCH` (29B): puntero, acción (Down/Move/Up), presión y coordenadas mapeadas por resolución nativa (`coords.ts`).
    * `TYPE_SCROLL` (21B): desplazamiento vertical/horizontal con amortiguación y throttle de 25 ms.
    * `TYPE_KEYCODE` (14B): códigos de tecla física Android (`KEYCODE_BACK`, `KEYCODE_HOME`, `KEYCODE_APP_SWITCH`, `Enter`, `Backspace`, `Tab`, `Flechas`).
    * `TYPE_TEXT`: inyección de texto UTF-8.
  - Clic derecho del ratón interceptado y mapeado directamente a Android Back (`KEYCODE_BACK`).
  - Destrucción inmediata de cada cuadro tras el render (`frame.close()`), garantizando cero fugas en la VRAM de la GPU.
* **Modelo Lazy Exclusivo (1 Stream Activo a la Vez):**
  - **En Reposo (`PhoneScreen.tsx`):** Tarjetas sin foco interactivo (`isFocused = false`). Mantienen **0% de uso de GPU** solicitando miniaturas JPEG espaciadas (10 a 15 segundos con jitter por tarjeta). El polling se pausa fuera del viewport o con pestaña oculta. El backend (`screenshot_cache.py`) aplica una caché en memoria con TTL de 8s y candado single-flight. Al soltar foco, se solicita un cuadro inmediato con `fresh=1`.
  - **En Foco (`ScrcpyLiveScreen.tsx`):** Solo la tarjeta enfocada (`isFocused = true`) monta el componente, conecta el WebSocket y decodifica video a 30 FPS. Al cambiar de foco o pulsar `Esc`, el stream anterior se destruye de inmediato (`ws.close()`, `decoder.close()`).
  - **Tecla Esc en Cascada:** El primer toque de `Esc` libera el foco interactivo del celular devolviéndolo a reposo; el segundo toque limpia la selección múltiple en la grilla y oculta la `BulkBar`.
* **Watchdog de Primer Frame y Filtrado de Sockets (`watchdog.ts`):**
  - Temporizador de 6 segundos tras `ws.onopen`. Si no se recibe ningún fotograma clave H.264 (IDR), cierra el socket y reconecta con backoff exponencial progresivo (`[500, 1000, 2000, 4000, 8000] ms`).
  - Límite de 3 intentos consecutivos antes de fijar estado `'error'` y mostrar botón manual de "Reintentar".
  - Descarte de eventos `onclose`/`onerror` de sockets obsoletos (`shouldHandleSocketClose`) y cierre limpio con código 1000 tras `onopen` para evitar `ECONNRESET` en el proxy de desarrollo de Vite.
* **Telemetría Dinámica de FPS (`fps.ts`, `useFps.ts`):**
  - Store externo pub/sub desacoplado del ciclo de render de React e indexado por puerto ADB (`Map<adbPort, ...>`).
  - Cálculo de FPS en tiempo real sobre una **ventana deslizante de 1 segundo** (`computeWindowFps`) contando únicamente los cuadros efectivamente pintados en canvas.
  - Componente aislado `FpsBadge` suscrito mediante `useSyncExternalStore` que refresca el badge en vivo sin provocar re-renderizados de la tarjeta.

### 4. Barra Vertical Unificada de 14 Botones (`DeviceControlRail`)
Tanto en la tarjeta del rack (`DeviceCard`) como en la vista dividida (`FocusView`), todos los comandos de hardware se centralizan en una única cápsula vertical de 28 px de ancho (`w-7`), situada como hermano lateral de la pantalla sin invadir la superficie de video:
1. `Power`: Encendido / Apagado en caliente.
2. `Reboot`: Reinicio del contenedor ReDroid mediante `POST /api/v1/instances/{name}/restart` (`api.restartInstance`).
3. `Volume2`: Subir volumen (`KEYCODE_VOLUME_UP`).
4. `Volume1`: Bajar volumen (`KEYCODE_VOLUME_DOWN`).
5. `Triangle` (`-rotate-90`): Botón físico Atrás de Android (`KEYCODE_BACK`).
6. `Circle`: Botón Home (`KEYCODE_HOME`).
7. `Square`: Botón Apps Recientes (`KEYCODE_APP_SWITCH`).
8. `Camera`: Captura y descarga de pantalla en 1 clic.
9. `Network`: Popover de Red USB Módem (Rotar IP, Soltar módem o Reclamar turno).
10. `Bell`: Popover de Turnos de Red con pulso reactivo ámbar en oferta activa (`variant="warning"`).
11. `Maximize2` / `Minimize2`: Conmutación entre modo Rack y FocusView.
12. `FileDown`: Popover selector de APKs del repositorio para instalación directa en 1 clic.
13. `FolderArchive`: Acceso directo al gestor de archivos (`ApkFileManager`) preseleccionando la instancia.
14. `Trash2`: Eliminación segura protegida por modal modalizado (`ConfirmDeleteModal`).

* **Popovers Lazy y Exclusividad Global:**
  - Los popovers complejos de Red USB, Turnos y APK se cargan bajo demanda en un chunk diferido (`DeviceControlRailPopovers.tsx`) con `React.lazy` + `Suspense`, precargando en hover/focus y protegidos por `RailPopoverErrorBoundary`.
  - Store pub/sub de exclusividad (`popoverStore.ts`, `useExclusivePopover.ts`): solo puede haber un único popover abierto en toda la aplicación; cualquier clic exterior o interacción con otro botón cierra los menús previos.
  - Renderizado flotante mediante Portal de Radix a `document.body` (`z-[9999]`), inmune a recortes por `overflow-hidden`.

### 5. Tarjeta de Metadatos y Módulos de Cabecera Unificada (GPS / Proxy / Salud)
* **Metadatos Compactos en 2 Columnas:** La tabla de especificaciones técnicas se distribuye en una cuadrícula compacta de dos columnas (`grid grid-cols-2 py-1 text-[11px]`), reduciendo su altura de ~320px a solo ~115px y garantizando más de 200px de espacio vertical para los módulos interactivos inferiores.
* **Patrón de Cabeceras Homogéneo:**
  - **Pestaña GPS:** Presets de ciudades + Botón primario `Actualizar GPS` en la cabecera.
  - **Pestaña Proxy:** Título con icono + Botones `Quitar Proxy` y primario `Guardar Proxy` en la cabecera (eliminando la barra descolgada inferior).
  - **Pestaña Salud:** Título con check + Botón primario `Ejecutar Diagnóstico` en la cabecera.
* **Z-Index y Stacking Context:**
  - Los Popovers y Tooltips utilizan `z-[9999]`.
  - El contenedor de Leaflet se aísla con `isolation: isolate` y sus paneles se restringen a `z-10`, evitando que los popovers o sugerencias se rendericen por debajo del mapa.
* **Mapa Oscuro Libre sin API Key:**
  - Se eliminaron las teselas comerciales de CARTO que mostraban marcas de agua de `"API KEY REQUIRED"`.
  - Se utiliza la capa libre de **OpenStreetMap** combinada con un filtro CSS de inversión cromática (`brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3)`), logrando un mapa nocturno nítido sin costo ni dependencias de terceros.

### 6. Estabilidad de Layout y Contención sin Desborde en Auditoría de Salud
* **Problema resuelto:** Previamente, en pantallas con viewport ajustado, el reporte dinámico de auditoría empujaba la caja fuera del borde inferior de la pantalla, recortando el texto y la barra de desplazamiento.
* **Solución aplicada:**
  - El contenedor derecho y la tarjeta interactiva aplican contención estricta (`h-full overflow-hidden` y `flex-1 min-h-0`).
  - La consola de resultados de auditoría opera con `flex-1 min-h-0 overflow-y-auto`, adaptándose fluidamente al espacio exacto disponible y conteniendo las comprobaciones dentro de sus bordes redondeados y padding sin desbordar el viewport.

### 7. Eliminación Segura de Perfiles con Modal de Confirmación
* **Ubicación ergonómica:**
  - **Mosaico (`BulkBar`):** Botón `Trash2` (`variant="danger"`) en el extremo derecho de la barra flotante, protegido por separadores para evitar pulsaciones accidentales.
  - **Visor enfocado (`FocusView`):** Botón `Trash2` en la base de la cápsula vertical de hardware.
* **Modal de Confirmación Obligatorio:** Ninguna eliminación se ejecuta de forma directa. Se despliega un diálogo modal en `z-[99999]` con fondo atenuado (`backdrop-blur-sm`), advirtiendo sobre la irreversibilidad de la acción, listando los terminales afectados y requiriendo confirmación explícita antes de invocar la API (`DELETE /instances/{name}` o `POST /instances/group/delete`).

### 8. Flujo Optimizado de Creación de CloudPhones (Wizard de 3 Pasos)
* **Inmunidad a Polling y Pérdida de Datos:**
  - El modal inicializa sus puertos y catálogos una única vez al abrir (`prevIsOpenRef`), evitando que el refresco automático de fondo de instancias sobreescriba los valores ingresados por el usuario o fuerce el regreso al paso 1.
  - El temporizador de sondeo se suspende temporalmente en `App.tsx` mientras el modal de creación permanece abierto.
* **Consolidación en 3 Pasos Ergonómicos:**
  - **Paso 1: Dispositivo & SIM:** Nombre, puerto ADB con detección de colisión, operadora móvil con badges MCC/MNC, selector de marca (`Samsung`, `Motorola`, `Xiaomi`, `Google`) y modelos de catálogo.
  - **Paso 2: GPS & Proxy:** Mapa interactivo Leaflet con presets rápidos, campos de coordenadas y proxy residencial SOCKS5/HTTP con verificación en vivo.
  - **Paso 3: Recursos & Crear:** Presets de RAM y CPU Pinning, ficha técnica determinista tipo consola y botón primario de creación (`bg-primary`).
* **Estética Fina y Disciplinada:**
  - Montaje mediante React Portal en `document.body` (`z-[99999]`), con cierre por tecla `Escape` o clic exterior en backdrop.
  - Sustitución de botones azules por tokens OKLCH coherentes con el resto de la interfaz.

### 9. Soporte Completo de Tema Claro (Light Theme)
* **Tokens OKLCH para Modo Claro:**
  - Lienzo y fondo: Blanco técnico pulcro (`--background: oklch(0.985 0.003 250)`) con tapiz de micropuntos grises sutiles (`grid-bg`).
  - Tarjetas y popovers: Blanco puro (`--surface: oklch(1 0 0)`) con bordes de 1px (`--border: oklch(0.88 0.008 250)`).
  - Tipografía: Charcoal de alto contraste (`--foreground: oklch(0.18 0.015 250)`) y gris slate secundario.
  - Botones y estados activos: Verde esmeralda accesible (`--primary: oklch(0.62 0.22 145)`).
  - Mapas adaptativos: En modo claro, Leaflet muestra los azulejos de OpenStreetMap en sus colores naturales (`saturate(1.15) contrast(1.05)`).
* **Conmutación y Persistencia:**
  - Botón de alternancia con iconos dinámicos `Sun` y `Moon` disponible en el header superior, barra lateral y cabecera de vista enfocada.
  - Persistencia automática de la preferencia en `localStorage('pm-theme')`.

### 10. Gestor de Ubicaciones Personalizadas, Grupos y Pines GPS (Lovable Dark Tech)
* **Gestor Visual Dedicado (`CustomLocationsManager.tsx`):**
  - Módulo accesible desde la barra lateral (`MapPin`) para administrar ubicaciones geográficas personalizadas, replicado bajo la especificación oficial de Lovable Dark Tech.
  - **Chasis 100% Viewport-Fit:** Cabecera fija de 55 px (`h-[55px]`), mapa Hero a altura completa (`relative flex-1 min-h-0 min-w-0 w-full h-full overflow-hidden`) y panel inspector lateral derecho fijado estrictamente en 380 px (`w-[380px]`) sin borde izquierdo duplicado (erradicación del bug de 379 px).
  - Agrupación por etiquetas de colores (`LocationGroup`) y fijación de accesos rápidos (`is_pinned`).
  - Asignación de ubicación predeterminada del sistema (`default_location`) destacada con estrella SVG y sincronización con nuevas instancias y mapas.
  - **Popovers mutuamente excluyentes:** Menús de "Grupos" y "Accesos Rápidos" aislados para que la apertura de uno cierre automáticamente al otro.
  - **Atajos de teclado en buscador:** `/` para enfocar, `Escape` para limpiar o cancelar, y `Enter` para elegir la primera coincidencia.
* **Mapa Leaflet con Pines Vectoriales y Radios de Referencia (`MapPicker.tsx`):**
  - **Pines Vectoriales SVG nítidos:** Marcadores con borde del color de su grupo, badge distintivo y contador tabular de CloudPhones asignados físicamente.
  - **Tooltips oscuros (`pm-tooltip` / `pm-tt`):** Resumen técnico con swatch de grupo, coordenadas, ciudad y lista en tiempo real de terminales físicos con punto LED verde si están online.
  - **Radio de Referencia Visual (`radius_km` y `show_radius`):** Círculos concéntricos vectoriales interactivos con color temático que delimitan la zona de influencia de cada ubicación. Sincronización en vivo del círculo del marcador activo al arrastrarlo por el mapa en modo creación.
  - **Control Global de Radios:** Botón toggle en la barra de herramientas y en el mapa flotante (`CircleDot`) para encender o apagar todos los círculos del mapa con un solo clic.
  - **Tema reactivo claro/oscuro:** Inversión de azulejos en modo oscuro obsidiana y colores saturados naturales en modo claro con invalidación reactiva de tamaño (`map.invalidateSize()`). Cero emojis Unicode.

### 11. Red Móvil USB y Libro Mayor de IPs (Lovable Dark Tech)
* **Centro de Red USB Rediseñado (`UsbNetworkCenter.tsx`):**
  - **Chasis 100% Viewport-Fit en 2 pestañas:** Cabecera fija de 55 px con segmented control (`Módems y Cola FIFO` / `Libro Mayor de IPs`) y contador de promociones pendientes.
  - **Pestaña Módems y Cola FIFO:**
    - Strip de métricas rápidas con barra continua de progreso de módems libres/totales, enlace móvil activo, estado de cola FIFO y acceso directo a retención TTL.
    - Tabla de inventario `table-fixed` con sub-pixel column sizing: interfaz Linux, operadora, red, batería con alerta porcentual, IP pública y badge de asignación con enlace directo a `FocusView`.
    - Cola FIFO horizontal compacta (`h-[92px]`) con segundero circular SVG interactivo (`CountdownRing`) de 5 segundos de gracia, botones instantáneos `Conectar ya` y `Ceder turno`, y tarjetas de espera ordenadas con botón `Reclamar`.
    - Aside inspector de 380 px sin borde izquierdo duplicado (erradicación del bug de 379 px): ficha técnica 3×2, botones de acción de radio (`Test Modo Avión`, `Rotar IP`, `Soltar a cuarentena`) y selector de CloudPhones destinos con exclusión mutua 1:1.
  - **Pestaña Libro Mayor de IPs (Anti-vinculación):**
    - Historial paginado de IPs públicas utilizadas por cada CloudPhone para prevenir colisiones y baneos cruzados.
    - Filtro de búsqueda rápida y switch `Solo activas`.
    - Selector interactivo de retención TTL (`24h`, `7d`, `30d`, `permanent`) vía `PUT /api/v1/network/ip-ledger/ttl`.
    - Purga asistida de registros expirados protegida por diálogo `AlertDialog`.
* **Sistema Global de Tooltips Estilizados (`GlobalTooltip.tsx` y `TooltipSimple`):**
  - **Interceptor pasivo por delegación (`GlobalTooltip.tsx`):** Escucha en el root de la app cualquier elemento con `title="..."` o `data-tooltip="..."`, suprimiendo los rectángulos negros nativos de HTML y mostrando un tooltip flotante portalizado (`z-[9999]`) con estilo Lovable Dark Tech (`bg-popover/95`, micro-borde, shadow-xl y tipografía monospace).
  - **Clamping horizontal:** Cálculos automáticos de posición con margen de seguridad de 8 px para evitar cortes de texto contra los bordes de la pantalla.
  - **Exclusión automática de Radix:** Detecta triggers explícitos de Radix UI (`TooltipContent`) para no duplicar tooltips en botones con posicionamiento propio (ej. `side="right"` en la barra lateral).
  - Helper de alto orden `TooltipSimple` disponible para envolver manualmente elementos en componentes que requieran comportamiento específico.

### 12. Estabilidad de Creación y Humanización de Operadoras
* **Inmunidad a Errores de Hooks en `CreateDeviceModal.tsx`:**
  - Reubicación de todos los hooks de React (`useMemo`, `useEffect`) en el nivel superior antes de cualquier salida condicional (`isOpen`), erradicando la pantalla negra al hacer clic en `+`.
* **Operadoras Móviles Legibles:**
  - Remoción de códigos numéricos confusos (`operator_numeric`, ej. `72234`), visualizando nombres comerciales con país en español (`Personal (Argentina)`, `Movistar (Argentina)`, etc.).
* **Líneas Telefónicas de Formosa:**
  - Generador automático de líneas telefónicas con prefijos locales de Formosa (`3704` / `3705`) + 6 dígitos aleatorios, editables manualmente y desacopladas de la operadora móvil.

### 13. Repositorio Global de APKs, Bundles y Gestor de Archivos (`ApkFileManager`)
* **Módulo Dedicado de 2 Pestañas (`ApkFileManager.tsx`):**
  - Vista completa accesible desde la barra lateral bajo Ubicaciones (`FolderArchive`), con diseño maestro-detalle replicado 1:1 de **Lovable** (`apk-hive-command-center-main`).
  - Paleta técnica dark mode obsidiana (`oklch(0.17 0.008 255)`) con acentos cian eléctricos (`oklch(0.74 0.14 225)`), tipografía oficial **Geist** y **Geist Mono** con espaciado natural (`letter-spacing: normal`).
* **Pestaña Repositorio de APKs (`ApkRepository.tsx`):**
  - Catálogo centralizado con subida streaming drag-and-drop compatible con `.apk`, `.apkm`, `.xapk`, `.apks` y `.zip` (hasta 300 MB).
  - Badges visuales de identificación: `Bundle (N splits, x86_64)` y avisos informativos sobre archivos OBB ignorados.
  - Telemetría en vivo de aplicaciones instaladas (`GET /api/v1/apks/installed`): escaneo paralelo con ADB que detecta en tiempo real qué paquetes residen en cada CloudPhone activo, marcando `ya instalada` con check verde en el panel de despliegue.
  - Indicador de presencia en flota escalable: barra horizontal continua (`w-14`) con ratio monoespaciado (`1/2`), con ancho fijo inmutable de 131 px para evitar CLS o saltos de layout.
  - Panel inspector lateral fijado a 380 px (`w-[380px]`) con metadatos técnicos (SHA-256, ABI, fecha), switch de autoinstalación por defecto y selector de destinos (`Faltantes`, `Todas`, `Limpiar`).
* **Pestaña Explorador de Archivos (`FileExplorer.tsx`):**
  - Navegación segura ampliada a `/sdcard/Download`, `/sdcard/DCIM`, `/sdcard/Pictures`, `/sdcard/Documents`, `/sdcard/Movies`, `/sdcard/Music` y `/sdcard/Recordings`.
  - Vista de Cuadrícula con **miniaturas en vivo reales** (`GET /api/v1/files/view`) cargadas por streaming con `object-cover` y fallback inteligente a icono SVG.
  - **Visor multimodal Quick Look / Lightbox integrado:** doble clic sobre cualquier archivo abre un visor modal para inspeccionar imágenes en alta resolución, leer logs/código/json/xml en texto monoespaciado con scroll, y reproducir video o audio HTML5 sin salir del panel.
  - **Creación remota de carpetas:** botón `+ Nueva carpeta` (`POST /api/v1/files/mkdir`) con diálogo modal interactivo validado en sandbox.
  - Subida con sufijo anti-sobrescritura, descarga a PC, borrado con confirmación y transferencia inter-dispositivo `send-to`.

---

## 🛠️ Pila Tecnológica

* **React 19 + TypeScript 5.8**
* **Vite 8 + @tailwindcss/vite (Tailwind CSS v4 con variables @theme)**
* **WebCodecs API (Chromium nativo):** Decodificación H.264 por hardware con `VideoDecoder`
* **Radix UI Primitives:** Tooltips, Popovers, Sliders y Dialogs accesibles con Portals
* **Leaflet 1.9:** Mapas interactivos con azulejos OSM oscurizados
* **Lucide React:** Iconografía vectorial moderna y consistente
* **Sonner:** Notificaciones toast ricas en tema oscuro
