# Arquitectura de Visualización de Dispositivos: Modo Reposo vs. Modo Enfocado (Streaming Lazy)

Este documento describe la arquitectura de renderizado, interacción y ciclo de vida de los CloudPhones en el orquestador **ProteoMesh**. Está diseñado como referencia técnica para cualquier agente o desarrollador que necesite comprender o modificar la visualización en la grilla (`DeviceGrid`), el chasis (`DeviceCard`) y el reproductor WebCodecs (`ScrcpyLiveScreen`).

---

## 1. Visión General: Los Dos Estados de Visualización

En la interfaz de ProteoMesh (grilla de dispositivos / rack), cada contenedor Android (ReDroid 13) puede encontrarse en uno de dos estados de renderizado:

| Aspecto | Estado 1: En Reposo (Sin Foco / Idle) | Estado 2: Enfocado (Activo / Streaming Vivo) |
|---|---|---|
| **Componente activo** | `<PhoneScreen />` | `<ScrcpyLiveScreen />` (overlay sobre `<PhoneScreen />`) |
| **Tecnología visual** | Imagen estática `<img>` con polling HTTP | `<canvas>` HTML5 nativo con decodificación H.264 por hardware |
| **Protocolo de transporte** | HTTP GET `/instances/{name}/screen?t=...` (con caché y single-flight) | WebSocket directo hacia túnel ADB (`ws-scrcpy` en `tcp:8886`) |
| **Frecuencia de refresco** | 1 cuadro cada 10–15 s con jitter por tarjeta (pausado fuera de viewport) | **Hasta 30 FPS solicitados al encoder**; badge con FPS real medido en ventana de 1 s (<20 ms latencia, estimación conceptual no medida) |
| **Consumo de recursos** | **0% GPU**, ~0.1% CPU por instancia *(estimación no medida)* | Aceleración VCN por hardware, ~20% de un hilo CPU *(estimación no medida)* |
| **Ancho de banda de red** | ~20 KB cada 10–15 s (~1.5–2 KB/s) *(estimación no medida)* | Flujo calibrado a **2 Mbps** nominales (~250 KB/s, tasa solicitada al encoder, no medida) |
| **Control táctil e input** | Solo toques discretos HTTP (si `syncMode` está activo) | Captura continua de mouse (29B), scroll (21B) y teclado (14B) |
| **Indicador visual** | Bisel sobrio, slot index, status badge | Borde exterior ámbar (`ring-2 ring-primary`), badge con FPS reales medidos |

---

## 2. ¿Por qué existe esta dualidad? (Fundamento de Arquitectura y Rendimiento)

### A. Limitaciones de Hardware en la Granja de Contenedores
ProteoMesh está diseñado para correr granjas de múltiples contenedores ReDroid concurrentes sobre estaciones de trabajo Linux con procesadores como el **AMD Ryzen 7 5700G (8 núcleos / 16 hilos, GPU integrada Vega 8)**.

1. **Cuello de botella en el codificador ReDroid (C2):**
   * Cada instancia de ReDroid que emite video H.264 continuo debe codificar cuadros en tiempo real mediante el codec software `c2.android.avc.encoder`.
   * Si 8 o 12 teléfonos transmitieran H.264 a 30 FPS simultáneamente, la CPU del host consumiría **>300% de uso constante** *(estimación no medida)*, provocando saturación térmica, caídas de cuadros y el crash `BAD_INDEX (6)` en el pipeline multimedia de Android.
2. **Cuello de botella en la decodificación del navegador:**
   * Mantener 8 instancias de `VideoDecoder` decodificando y pintando en 8 `<canvas>` simultáneos saturaría el motor de video VCN de la GPU y dispararía la recolección de basura (GC) en JavaScript.
3. **La Solución: Exclusividad Lazy (1 solo stream activo a la vez):**
   * **El 90% de los teléfonos están en reposo:** Solicitan capturas espaciadas con caché backend de 8 s para que el operador verifique que la instancia sigue viva y qué pantalla tiene abierta.
   * **Solo el teléfono que el usuario está operando activamente** conecta el WebSocket y enciende el decodificador H.264 en silicio.
   * Al pasar el foco a otro teléfono o presionar `Esc`, el stream anterior se destruye de inmediato (`ws.close()`, `decoder.close()`), liberando el 100% de la GPU.

---

## 3. Desglose Técnico de Ambos Modos

### Modo 1: En Reposo (`<PhoneScreen />`)

* **Ubicación:** `web/src/components/farm/PhoneScreen.tsx` y `web/src/components/grid/DeviceCard.tsx`
* **Mecanismo:**
  * Renderiza una etiqueta estándar `<img src={api.getScreenUrl(name, tick, fresh)} />`.
  * **Polling espaciado con jitter:** Cada tarjeta calcula una única vez al montar un intervalo aleatorio entre 10 y 15 segundos (`pollMs = 10000 + Math.floor(Math.random() * 5001)` en `DeviceCard.tsx`). Esto evita que todas las tarjetas soliciten capturas simultáneamente al backend.
  * **Pausa inteligente:** El polling se detiene automáticamente cuando:
    1. La tarjeta está fuera del viewport visible (`IntersectionObserver` en `DeviceCard.tsx`).
    2. La pestaña del navegador está en segundo plano (`visibilitychange`).
    3. La tarjeta está enfocada (`isFocused`), ya que el stream WebCodecs en vivo ya dibuja la pantalla.
  * **Refresco forzado (`fresh=1`):** Al soltar el foco (`isFocused: true -> false`), la tarjeta solicita de inmediato un cuadro con `fresh=1`, saltando la caché del backend para mostrar el estado final exacto dejado por la sesión interactiva.
  * **Caché backend y Single-Flight:** El endpoint `/instances/{name}/screen` (`server/services/screenshot_cache.py`) cuenta con una caché en memoria con TTL de **8,0 segundos** y candados por clave (`instance:fmt:max_width`). Si múltiples clientes o peticiones concurrentes llegan en la misma ventana, solo una ejecuta `screencap` y las demás comparten el resultado.
  * Si la instancia está apagada (`running === false`), no hace peticiones HTTP y muestra un icono de `Power` centrado sobre fondo oscuro (`bg-screen-off`).
  * Si la instancia está arrancando (`starting` o `restarting`), muestra un spinner con `Loader2`.
* **Propósito:** Supervisión pasiva de la flota con consumo mínimo de CPU y sin contención en el daemon Docker.

---

### Modo 2: Enfocado y Activo (`<ScrcpyLiveScreen />`)

* **Ubicación:** `web/src/components/farm/ScrcpyLiveScreen.tsx` y `web/src/lib/scrcpy/useScrcpyStream.ts`
* **Mecanismo:**
  1. **Montaje condicional:** Se monta como una capa absoluta sobre la tarjeta solo cuando:
     ```tsx
     {isFocused && instance.running && (
       <ScrcpyLiveScreen
         instance={instance}
         isFocused={isFocused}
         onReleaseFocus={() => onReleaseFocus?.()}
         visible={isVisible}
       />
     )}
     ```
  2. **Pipeline de Video:**
     * Conecta vía WebSocket a `/ws-scrcpy/?action=proxy-adb&remote=tcp:8886&udid=127.0.0.1:{adb_port}`.
     * Negocia parámetros con `createVideoSettingsBuffer` (720x1560 solicitando hasta 30 FPS, 2 Mbps).
     * Parsea encabezados H.264 Annex-B (SPS/PPS) y extrae el codec exacto (ej. `avc1.42C02A`).
     * Instancia `VideoDecoder` nativo de Chromium con `hardwareAcceleration: 'prefer-hardware'` y `optimizeForLatency: true`.
     * Dibuja los frames decodificados directo a un `<canvas>` con contexto 2D (`alpha: false, desynchronized: true`).
     * Cada frame se destruye obligatoria e inmediatamente tras el render con `frame.close()` para evitar fugas en la VRAM de la GPU.
  3. **Medición dinámica de FPS (Store externo):**
     * En lugar de una etiqueta fija, el FPS se calcula en tiempo real sobre una **ventana deslizante de 1 segundo** (`computeWindowFps` en `web/src/lib/scrcpy/fps.ts`).
     * Los valores se almacenan en un store pub/sub externo indexado por `adbPort`. El componente `FpsBadge` se suscribe vía `useSyncExternalStore`, permitiendo actualizar el contador sin re-renderizar la tarjeta ni el árbol de React.
  4. **Pipeline de Entrada Directa (<20 ms, estimación conceptual no medida):**
     * **Mouse / Toques:** Intercepta `onPointerDown`, `onPointerMove`, `onPointerUp`. Empaqueta las coordenadas en un búfer binario estricto de **29 bytes** (`TYPE_TOUCH`) calibrado a la resolución física real de video (`videoSizeRef`).
     * **Rueda / Scroll:** Intercepta `onWheel` y emite paquetes binarios de **21 bytes** (`TYPE_SCROLL`) con throttling de 25 ms.
     * **Teclado Físico:** El canvas tiene `tabIndex={0}`. Al recibir pulsaciones, envía paquetes de **14 bytes** (`TYPE_KEYCODE`) o inyección UTF-8 (`TYPE_TEXT`), interceptando teclas del sistema (`Backspace`, `Enter`, `Tab`, `Flechas`) con `e.preventDefault()`.
     * **Clic derecho:** Mapeado nativo al botón **Atrás** de Android (`KEYCODE_BACK`), con `e.stopPropagation()` para evitar que se abra el menú contextual del navegador.

---

### 3.1. Watchdog de Primer Frame y Recuperación de Stream

Durante el enganche al stream (especialmente al reiniciar la API mientras el demonio `ws-scrcpy` permanece en ejecución), puede producirse una condición de bloqueo donde el WebSocket se conecta y el decoder se configura con el SPS inicial, pero no se recibe ningún cuadro clave H.264 (IDR).

* **Diagnóstico (Hipótesis):** Ausencia de frame IDR tras reiniciar la API con `ws-scrcpy` vivo.
* **Mecanismo del Watchdog (`web/src/lib/scrcpy/watchdog.ts` y `useScrcpyStream.ts`):**
  1. Al abrir el WebSocket (`ws.onopen`), se arma un temporizador de **6 segundos** (`FIRST_FRAME_TIMEOUT_MS = 6000`).
  2. Si transcurren 6 segundos sin que se decodifique ningún frame (`firstFrameFiredRef` en `false`), el watchdog cierra el WebSocket y delega la reconexión con backoff exponencial progresivo (`RECONNECT_BACKOFF_MS = [500, 1000, 2000, 4000, 8000]`).
  3. **Límite de reintentos:** Se permite un máximo de **3 intentos automáticos** (`MAX_FIRST_FRAME_TIMEOUT_ATTEMPTS = 3`).
  4. **Estado de error terminal:** Si tras 3 intentos consecutivos (~19,5 s acumulados) no hay señal de video, se detienen los reintentos automáticos, el estado pasa a `'error'` y la interfaz despliega un mensaje claro con un botón manual de **"Reintentar"**.
  5. **Limpieza y aislamiento:** El temporizador se cancela de inmediato al pintar el primer cuadro, al cerrarse el socket o al desmontar el componente. Los eventos `onclose`/`onerror` de sockets obsoletos se descartan (`shouldHandleSocketClose`) para evitar carreras asíncronas.

---

## 4. Diferencia Crítica: `selected` (Selección Múltiple) vs. `isFocused` (Foco Interactivo)

Es común confundir la selección con el foco. En ProteoMesh son dos capas ortogonales e independientes:

```
┌────────────────────────────────────────────────────────┐
│                        ESTADOS                         │
├──────────────────────────┬─────────────────────────────┤
│ selected = true          │ isFocused = true            │
│ (Selección Operativa)    │ (Foco Interactivo Stream)   │
├──────────────────────────┼─────────────────────────────┤
│ • Se activa con clic.    │ • Se activa con clic si el  │
│ • Admite selección       │   teléfono está 'running'.  │
│   múltiple con Shift.    │ • EXCLUSIVO: Solo 1 teléfono│
│ • Despliega la barra     │   puede estar enfocado en   │
│   flotante inferior      │   toda la grilla.           │
│   (BulkBar) para         │ • Enciende el stream H.264  │
│   operaciones en lote    │   (hasta 30 FPS negociados) │
│   (apagar, reiniciar,    │   por WebSocket.            │
│   instalar APKs en 5     │ • Captura teclado físico y  │
│   celulares juntos).     │   mouse directo a Android.  │
│ • La pantalla permanece  │ • Muestra anillo de luz     │
│   en reposo (PhoneScreen)│   ámbar y badge con FPS     │
│   con polling espaciado. │   reales medidos en vivo.   │
└──────────────────────────┴─────────────────────────────┘
```

### Máquina de Cascada de la Tecla `Esc`:
Para garantizar control sin fricción en el teclado, `DeviceGrid.tsx` implementa `Esc` en cascada:
1. **Primer toque de `Esc`:** Libera el foco interactivo del celular activo (`focusedInstance = null`). El streaming H.264 y el socket scrcpy se destruyen inmediatamente. **La selección de la tarjeta permanece intacta** (la BulkBar sigue abierta si había dispositivos marcados).
2. **Segundo toque de `Esc` (sin teléfono enfocado):** Limpia la selección múltiple de la grilla (`selected.clear()`) y oculta la BulkBar.

---

## 5. El Chasis Unificado (`DeviceCard` + `DeviceControlRail`)

Tanto en reposo como en foco, el contenedor físico del teléfono mantiene siempre la misma geometría estricta:

```
┌───────────────────────── Chasis (h-full) ─────────────────────────┐
│                                                                   │
│  ┌── Pantalla (aspectRatio dinámico) ┐ ┌─── Riel (w-7) ─────────┐ │
│  │                                   │ │ [1]  Power (On/Off)    │ │
│  │  [# Slot]             [Badge FPS] │ │ [2]  Reboot            │ │
│  │                                   │ │ [3]  Volumen +         │ │
│  │  <PhoneScreen />                  │ │ [4]  Volumen -         │ │
│  │     ó                             │ │ [5]  Atrás             │ │
│  │  <ScrcpyLiveScreen />             │ │ [6]  Inicio            │ │
│  │                                   │ │ [7]  Recientes         │ │
│  │  (FPS Real / Canvas WebCodecs)    │ │ [8]  Captura           │ │
│  │                                   │ │ [9]  Módem USB (Lazy)  │ │
│  │                                   │ │ [10] Turnos Red (Lazy) │ │
│  │                                   │ │ [11] Maximizar (Focus) │ │
│  │                                   │ │ [12] Instalar APK      │ │
│  │                                   │ │ [13] Archivos          │ │
│  │                                   │ │ [14] Borrar Instancia  │ │
│  └───────────────────────────────────┘ └────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

* **Relación de aspecto dinámica:** La relación de aspecto no es fija (`aspect-[9/19.5]`). Se calcula dinámicamente en `DeviceCard.tsx` aplicando el estilo en línea `style={{ aspectRatio: `${nativeWidth} / ${nativeHeight}` }}`, derivado de `instance.display?.width` e `instance.display?.height` (con fallback seguro a `720 / 1560`).
* **El riel `DeviceControlRail`:** Mide 28 px de ancho (`w-7`), tiene 14 botones de hardware y se ubica como hermano lateral derecho de la pantalla, garantizando que ningún botón flote sobre el video ni tape la interacción del usuario.
* **Carga diferida (Lazy) y exclusividad de Popovers:**
  - Los popovers complejos de Red USB, Turnos y APK se extraen en un chunk diferido (`DeviceControlRailPopovers.tsx`) cargado bajo demanda (`React.lazy` + `Suspense`), con precarga al pasar el mouse (`onMouseEnter`).
  - Están protegidos por un `RailPopoverErrorBoundary` para evitar caídas en el chasis si falla la red al cargar el chunk.
  - La interfaz implementa un store pub/sub de popovers exclusivos (`popoverStore.ts` y `useExclusivePopover.ts`): solo puede haber **un único popover abierto en toda la aplicación**. Abrir un menú en una tarjeta o en la barra inferior cierra automáticamente cualquier popover previo.
* **Diseño Height-Driven:** La tarjeta ocupa `h-full` de la ventana visible. Si el operador cambia de monitor (de 1080p a 768p), el teléfono se contrae automáticamente en altura y ancho, manteniendo siempre el 100% de la visibilidad sin scroll vertical y con máxima nitidez.
