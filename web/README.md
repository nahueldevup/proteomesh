# ProteoMesh CloudPhone Platform — Frontend Web Panel 🛡️📱

Panel web de orquestación, supervisión y control masivo de CloudPhones Android (ReDroid 13 / API 33) diseñado bajo estándares de alta densidad inspirados en **GenFarmer** y el sistema de diseño Dark Tech minimalista de **Lovable** (`proteo-harvest-flow`).

---

## 🎯 Origen, Referencias y Decisiones de Diseño

### 1. Referencias Clave
* **Lovable (`proteo-harvest-flow`):** Modelo estético de referencia directa. Paleta de colores en espacio **OKLCH** con fondo negro carbón con tinte pizarra (`--background: oklch(0.155 0.008 250)`), superficies elevadas (`--surface: oklch(0.19 0.009 250)`), bordes milimétricos al 10% de opacidad (`--border: oklch(0.28 0.01 250)`), y acento verde esmeralda neón (`--primary: oklch(0.86 0.2 145)`). Tipografías emparejadas: **Space Grotesk** para interfaz y títulos, y **JetBrains Mono** para identificadores técnicos, puertos ADB y metadatos.
* **GenFarmer (`genfarmer.com`):** Estándar ergonómico de control de granjas de terminales móviles. Requiere densidad variable (slider de 4 a 12 columnas), selección masiva (clic, Shift+clic por rangos, Ctrl+A), interacción sincronizada en tiempo real (espejo de toques multi-device) y barra de acciones en lote flotante (`BulkBar`).
* **ws-scrcpy (NetrisTV):** Motor de streaming de hardware H.264 de latencia ultrabaja (~20ms / 60 FPS) vía WebCodecs y MSE.

---

## 🏗️ Principios Arquitectónicos y Reglas Invariables

### 1. Ajuste de Bisel y Pantalla Móvil (*Aspect Ratio Invariant*)
* **El Problema del Letterboxing:** Nunca incrustar vistas de pantallas Android dentro de cajas con alturas arbitrarias fijas (`h-52`, `h-64`) con `object-contain`. Al cambiar el ancho de las celdas del mosaico, `object-contain` genera gruesas bandas negras laterales y desalinea el marco del dispositivo.
* **Solución Implementada:**
  - El chasis del teléfono (`bg-bezel p-1 rounded-xl`) y la pantalla interna utilizan estrictamente la relación de aspecto nativa del dispositivo (`aspect-[9/19.5]` o `aspect-[${width}/${height}]`).
  - Tanto las capturas JPEG como el stream WebCodecs se renderizan con `object-cover`, llenando el 100% del área activa de borde a borde sin distorsión ni bandas negras.
  - En la vista mosaico (`DeviceCard`), las tarjetas no tienen botoneras inferiores que consuman espacio vertical; la tarjeta es el teléfono mismo, permitiendo densidades de hasta 12 columnas sin saturación.

### 2. Estándar de Botones Estrictamente en Iconos (`IconBtn`)
* Queda prohibido el uso de botones con texto verboso ("Apagar", "Encender", "Ver Detalles") en tarjetas de flota, barras de lote o docks de emulación.
* Todas las acciones se implementan mediante `IconBtn` acompañado de micro-tooltips instantáneos (`@radix-ui/react-tooltip`) con variantes semánticas (`ghost`, `solid`, `primary`, `danger`, `success`, `active`).

### 3. Streaming Nativo scrcpy sin Barras Duplicadas
* **Causa de la duplicación y letterbox en iframe:** El frontend web estándar de `ws-scrcpy` inyecta una barra de herramientas vertical gris propia (`.control-buttons-list`) y fuerza `object-fit: contain` con fondos grises. Al integrarlo dentro del chasis React, se generaba una barra duplicada y padding negro.
* **Solución Aplicada:**
  1. Proxy same-origin configurado en `vite.config.ts`: `/ws-scrcpy` redirige a `http://127.0.0.1:8001`, eliminando bloqueos de CORS.
  2. Parche en `~/.cache/proteomesh/ws-scrcpy/dist/public/main.css`:
     - `.control-buttons-list { display: none !important; width: 0 !important; }` elimina por completo la barra gris interna.
     - `.video-layer, .touch-layer { object-fit: cover !important; }` llena el 100% de la pantalla del celular sin bandas negras.
     - `body.stream { background-color: #000000 !important; overflow: hidden !important; }`.
  3. Parche de calidad de video en `bundle.js`: Se elevaron los ajustes por defecto de `WebCodecsPlayer` de **512 Kbps a 8 Mbps (8388608 bps) a 60 FPS en 1080x2340**, logrando nitidez cristalina en alta definición manteniendo ~20ms de latencia.

### 4. Botonera Vertical Única con Popovers
En la vista enfocada (`FocusView`), todos los comandos del terminal se centralizan en una única cápsula vertical adyacente al teléfono:
* `Power`: Encendido / Apagado en caliente.
* `Volume2` / `Volume1`: Volumen + / Volumen -.
* `Triangle` (`-rotate-90`): Botón físico Atrás de Android.
* `Circle`: Botón Home.
* `Square`: Botón Apps Recientes.
* `Camera`: Captura y descarga de pantalla en 1 clic.
* `Type`: Inyección de texto por ADB mediante Popover (`Enter` para enviar).
* `Link2`: Apertura de URL en el navegador de Android con Popover.
* `ExternalLink`: Apertura del visor en ventana independiente para pruebas dedicadas.

### 5. Tarjeta de Metadatos y Módulo GPS / Proxy / Salud
* **Espaciado Lovable (`py-1.5`):** Tabla de especificaciones con espaciado compacto en `JetBrains Mono` con divisiones finas (`border-b border-border/50`).
* **Z-Index y Stacking Context:**
  - Los Popovers y Tooltips utilizan `z-[9999]`.
  - El contenedor de Leaflet se aísla con `isolation: isolate` y sus paneles se restringen a `z-10`, evitando que los popovers o sugerencias se rendericen por debajo del mapa.
* **Mapa Oscuro Libre sin API Key:**
  - Se eliminaron las teselas comerciales de CARTO que mostraban marcas de agua de `"API KEY REQUIRED"`.
  - Se utiliza la capa libre de **OpenStreetMap** combinada con un filtro CSS de inversión cromática (`brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3)`), logrando un mapa nocturno nítido sin costo ni dependencias de terceros.
  - El botón `"Actualizar GPS"` se reubicó en la cabecera superior del módulo junto a los presets de ciudades (`Buenos Aires`, `São Paulo`, `Miami`, `New York`, `Madrid`, `CDMX`), asegurando máxima visibilidad.

### 6. Estabilidad de Layout en Auditoría de Salud
* **Problema resuelto:** Previamente, al ejecutar la auditoría de integridad, el reporte dinámico de 7 verificaciones empujaba verticalmente el contenedor hacia abajo, desplazando el botón de acción fuera de la vista y rompiendo la alineación con la pantalla del teléfono.
* **Solución aplicada:**
  - El botón `"Ejecutar Diagnóstico"` se trasladó a la cabecera superior de la sección, quedando fijo y siempre visible.
  - La consola de resultados de auditoría cuenta con dimensiones estables (`min-h-[140px] max-h-[175px] overflow-y-auto`) con scrollbar interno, garantizando cero descuadres (*zero layout shift*) antes, durante y después del test.

### 7. Eliminación Segura de Perfiles con Modal de Confirmación
* **Ubicación ergonómica:**
  - **Mosaico (`BulkBar`):** Botón `Trash2` (`variant="danger"`) en el extremo derecho de la barra flotante, protegido por separadores para evitar pulsaciones accidentales.
  - **Visor enfocado (`FocusView`):** Botón `Trash2` en la base de la cápsula vertical de hardware.
* **Modal de Confirmación Obligatorio:** Ninguna eliminación se ejecuta de forma directa. Se despliega un diálogo modal en `z-[99999]` con fondo atenuado (`backdrop-blur-sm`), advirtiendo sobre la irreversibilidad de la acción, listando los terminales afectados y requiriendo confirmación explícita antes de invocar la API (`DELETE /instances/{name}` o `POST /instances/group/delete`).

---

## 🛠️ Pila Tecnológica

* **React 19 + TypeScript 5.8**
* **Vite 8 + @tailwindcss/vite (Tailwind CSS v4 con variables @theme)**
* **Radix UI Primitives:** Tooltips, Popovers, Sliders y Dialogs accesibles
* **Leaflet 1.9:** Mapas interactivos con azulejos OSM oscurizados
* **Lucide React:** Iconografía vectorial moderna y consistente
* **Sonner:** Notificaciones toast ricas en tema oscuro
