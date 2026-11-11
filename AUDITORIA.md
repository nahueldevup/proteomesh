# Auditoría Integral de Calidad y Optimización del Frontend (ProteoMesh Web)

**Fecha:** 11 de Noviembre de 2026  
**Rama:** `audit/frontend-quality`  
**Entorno de Ejecución:** CachyOS Linux x86_64, Node.js 26.12.1, npm 12.0.2  
**Autor:** Antigravity / Hermes Agent  

---

## 1. Contexto, Entorno y Verificación de Skills

### 1.1 Stack Técnico Real (Verificado en `web/package.json` y `package-lock.json`)
- **SPA:** React 19.3.1 (`react-dom` 19.3.1), Vite 8.3.5 con `@vitejs/plugin-react` 6.1.2.
- **Compilador / Tipado:** TypeScript 6.0.3 (`~6.0.3`).
- **Estilos:** Tailwind CSS 4.3.3 vía `@tailwindcss/vite` 4.3.3 (`@theme inline`, tokens OKLCH).
- **Gestión de Estado / Servidor:** `@tanstack/react-query` 5.105.0.
- **Primitivas UI y Componentes:** `@radix-ui/react-dialog` 1.3.1, `@radix-ui/react-popover` 1.3.1, `@radix-ui/react-slider` 1.6.1, `@radix-ui/react-tooltip` 1.4.1, `lucide-react` 1.61.0, `sonner` 2.0.8.
- **Mapas:** `leaflet` 1.9.4, `@types/leaflet` 1.9.22.
- **Linter:** `oxlint` 1.89.0.
- **Runner de Tests:** `node:test` (`test/*.test.ts`) ejecutado directamente con Node nativo.

### 1.2 Skills Disponibles vs Solicitadas
- **Skills instaladas en el agente:** `react`, `typescript`, `feature-arch`, `tanstack-query`, `tailwind`, `shadcn`, `vercel-composition-patterns`, `vercel-react-best-practices`, `web-design-guidelines`, `accessibility`, `performance`, `best-practices`.
- **Desviaciones / Ajustes de versión:**
  - `typescript`: la skill menciona convenciones de TS 7; el proyecto corre con TypeScript 6.0.3 con target `ES2023`, `moduleResolution: bundler`, `verbatimModuleSyntax: true` y `noEmit: true`.
  - `react` / `vercel-react-best-practices`: se descartan explícitamente todas las reglas de Next.js (Server Components, App Router, RSC, nuqs, streaming SSR).
  - Prevalecen las decisiones de arquitectura de tiempo real de ProteoMesh Web sobre cualquier recomendación genérica de las skills.

---

## 2. Evidencia Obligatoria de Ejecución

### 2.1 `npm run build` (incluye `tsc -b`)
- **Comando:** `cd web && npm run build`
- **Resultado:** **Éxito (código de salida 0)** en 717 ms.
- **Detalle de Chunks y Pesos:**
```text
dist/index.html                                      0.98 kB │ gzip:   0.51 kB
dist/assets/MapPicker-vh-t_kPv.css                  15.09 kB │ gzip:   6.36 kB
dist/assets/index-9vmIHiYi.css                      88.17 kB │ gzip:  14.74 kB
dist/assets/check-bE8zQmk7.js                        0.15 kB │ gzip:   0.16 kB
dist/assets/navigation-DmGiSP4n.js                   0.17 kB │ gzip:   0.16 kB
dist/assets/circle-check-D8lmHSlv.js                 0.23 kB │ gzip:   0.20 kB
dist/assets/chevron-right-DMLYeB0I.js                0.25 kB │ gzip:   0.19 kB
dist/assets/globe-BuyLapgu.js                        0.27 kB │ gzip:   0.21 kB
dist/assets/star-CsGsJJQB.js                         0.50 kB │ gzip:   0.31 kB
dist/assets/dialog-nsQFo1K4.js                       2.11 kB │ gzip:   0.91 kB
dist/assets/alert-dialog-BHjNjD6l.js                 3.36 kB │ gzip:   1.12 kB
dist/assets/locations-CL7apuoQ.js                    3.70 kB │ gzip:   1.30 kB
dist/assets/DeviceControlRailPopovers-HW-PnbrZ.js    5.39 kB │ gzip:   1.49 kB
dist/assets/CreateDeviceModal-DY4Dv8xS.js           24.53 kB │ gzip:   6.66 kB
dist/assets/FocusView-BM_PUzP5.js                   36.26 kB │ gzip:   9.66 kB
dist/assets/utils-kIQjH2ZF.js                       39.51 kB │ gzip:  13.30 kB
dist/assets/UsbNetworkCenter-B7vI_rhJ.js            41.84 kB │ gzip:   9.91 kB
dist/assets/ApkFileManager-EsXr-50U.js              53.88 kB │ gzip:  13.92 kB
dist/assets/CustomLocationsManager-Bzb3Nf3P.js      68.04 kB │ gzip:  14.17 kB
dist/assets/MapPicker-X7Tq_pBb.js                  160.31 kB │ gzip:  47.76 kB
dist/assets/index-BPbA560r.js                      451.26 kB │ gzip: 137.15 kB
```

### 2.2 `npm run lint` (`oxlint`)
- **Comando:** `cd web && npm run lint`
- **Resultado:** **Aprobado con advertencias (código de salida 0)**.
- **Hallazgos:**
  - 15 advertencias de `react(set-state-in-effect)` (llamadas síncronas a `setState` en efectos que disparan re-renders en cascada).
  - 4 advertencias de `react-hooks(exhaustive-deps)` (en `MapPicker.tsx:414`, `ApkRepository.tsx:115`, `FileExplorer.tsx:243, 253`).
  - 1 advertencia de `react(only-export-components)` en `MapPicker.tsx:70`.

### 2.3 `node --test test/`
- **Comando:** `cd web && node --test test/*.ts`
- **Resultado:** **Éxito (24/24 tests pasaron en 103.8 ms, 0 fallos, 0 omitidos)**:
  - `computeWindowFps` (5 tests de ventana deslizante y redondeo seguro).
  - `fpsStore` (3 tests de aislamiento por puerto ADB, notificación selectiva y desuscripción).
  - `popoverStore` (6 tests de exclusividad global, cierre y notificación selectiva).
  - `watchdog` (5 tests de backoff, reintentos y agotamiento).
  - `shouldHandleSocketClose` (5 tests de filtrado de sockets desmontados, obsoletos o con error).

### 2.4 Análisis del Bundle y Chunks
- **Chunk principal (`index-*.js`):** 451.26 KB (137.15 KB gzip). Agrupa `react`, `react-dom`, `@radix-ui/react-*`, `sonner`, `DeviceGrid`, `DeviceCard`, `BulkBar` y el shell principal.
- **Chunk pesado de mapa (`MapPicker-*.js`):** 160.31 KB (47.76 KB gzip). Contiene el runtime completo de `leaflet`. Está correctamente diferido con `React.lazy` en vistas secundarias, pero `MapPicker` se carga bajo demanda en 3 puntos distintos (`FocusView`, `CustomLocationsManager`, `CreateDeviceModal`).
- **Chunks de vistas secundarias:** Excelente code-splitting en `CustomLocationsManager` (68 KB), `ApkFileManager` (53 KB), `UsbNetworkCenter` (41 KB), `FocusView` (36 KB) y `CreateDeviceModal` (24 KB).
- **CSS global (`index-*.css`):** 88.17 KB (14.74 KB gzip). Tailwind 4 genera una hoja compacta con estilos OKLCH completos, utilidades personalizadas y resets de Leaflet.

### 2.5 Análisis de Lighthouse
- **Comando verificado:** `which lighthouse`, `which unlighthouse`, `npx --no-install lighthouse`.
- **Resultado comprobado:** Ni Lighthouse CLI ni Unlighthouse están preinstalados localmente. Al regirse por la regla obligatoria de no ejecutar `npm install` ni alterar dependencias durante la auditoría, la medición de Lighthouse se declara como **no medido / no ejecutable en CLI local sin dependencias**.

---

## 3. Decisiones que Parecen Problemas pero Son Deliberadas (Conservar)

1. **Botones de hardware y acciones con icono exclusivo (`IconBtn`) más tooltip:**
   - Decisión intencional de ergonomía para alta densidad (inspirada en GenFarmer y Lovable).
   - *No debe reemplazarse por botones con texto.* La accesibilidad debe mejorarse agregando `aria-label`, foco visible y atributos de rol adecuados sin tocar la presentación visual.
2. **Cero IFrames y decodificación WebCodecs en `<canvas>`:**
   - La arquitectura elimina `iframe` para erradicar fallos `BAD_INDEX (6)`, barras redundantes y sobrecarga de VRAM. WebCodecs opera en canvas con `optimizeForLatency: true` y `hardwareAcceleration: 'prefer-hardware'`.
3. **Modelo Lazy Exclusivo (1 solo stream H.264 activo a la vez):**
   - En reposo se consumen miniaturas JPEG con jitter aleatorio (10 a 15 s) pausándose fuera del viewport mediante `IntersectionObserver`. Al enfocar un CloudPhone, se activa el WebSocket scrcpy y la decodificación a 30 FPS.
4. **Telemetría de FPS desacoplada de React:**
   - Se gestiona en un store externo (`fps.ts`) fuera del reconciliador y se consume exclusivamente con `useSyncExternalStore` en badges aislados (`StreamFpsLabel`), evitando invalidar el árbol de render de las tarjetas.
5. **Layout "Height-Driven" con `aspect-ratio` dinámico:**
   - El viewport fija la altura y las tarjetas calculan su ancho mediante `style={{ aspectRatio: '${nativeWidth} / ${nativeHeight}' }}` con `object-cover` sin letterboxing.
6. **Mapeo de Clic Derecho a `KEYCODE_BACK` de Android:**
   - Comportamiento estándar de emulación móvil en `ScrcpyLiveScreen.tsx`.

---

## 4. Diagnóstico Técnico de Calidad y Código

### 4.1 React y Ciclo de Vida

#### [CRÍTICO] `CustomLocationsManager.tsx` (2397 líneas): Monolito gigante con 47 estados locales y renderizado desbordado
- **Archivo:** `web/src/components/locations/CustomLocationsManager.tsx:1-2397`
- **Problema:** Un único componente gestiona simultáneamente el mapa Leaflet, la lista de ubicaciones personalizadas, el modal de creación, el modal de edición de ubicación, el modal de gestión de grupos, el filtrado y búsqueda en memoria, la asignación de ubicaciones por lotes a CloudPhones con polling de jobs (`JobState`), y la confirmación de borrado.
- **Consecuencia:** Cualquier tecla ingresada en el buscador o arrastre de marcador invalida un árbol virtual gigantesco de más de 2000 nodos JSX. Riesgo severo de regresiones ante cualquier modificación.
- **Tipo:** COMPROBADO (2397 líneas, 47 `useState`, advertencia de `react(set-state-in-effect)` en línea 187).

#### [ALTO] Patrón antipatrón recurrente: `set-state-in-effect` (15 casos comprobados)
- **Archivos:**
  - `web/src/App.tsx:140`
  - `web/src/components/grid/DeviceControlRail.tsx:130`
  - `web/src/components/grid/BulkBar.tsx:72`
  - `web/src/components/focus/FocusView.tsx:159`
  - `web/src/components/focus/InteractiveScreen.tsx:55`
  - `web/src/components/locations/CustomLocationsManager.tsx:187`
  - `web/src/components/network/UsbNetworkCenter.tsx:100`
  - `web/src/components/files/FileExplorer.tsx:238, 244, 254`
  - `web/src/components/files/ApkFileManager.tsx:27`
  - `web/src/components/files/ApkRepository.tsx:115`
  - `web/src/components/CreateDeviceModal.tsx:131`
  - `web/src/lib/scrcpy/useScrcpyStream.ts:296`
- **Problema:** Se utiliza `useEffect` para sincronizar estados que deberían ser **derivados durante el render** o disparados desde el manejador de eventos que originó el cambio. Por ejemplo, en `App.tsx:140`, `setSelectedNames` se llama dentro de un `useEffect` que observa `instancesData` para filtrar elementos inexistentes, forzando un doble render completo tras cada consulta de red.
- **Consecuencia:** Cascada innecesaria de re-renders (render inicial con datos viejos -> effect -> render secundario con datos actualizados).
- **Tipo:** COMPROBADO (advertencias explícitas de Oxlint).

#### [ALTO] Limpieza de referencias en desmontaje de Leaflet (`MapPicker.tsx:414`)
- **Archivo:** `web/src/components/MapPicker.tsx:414`
- **Problema:** `pinMarkersByIdRef.current.clear()` accede directamente a `.current` dentro de la función de limpieza de un `useEffect` sin copiar la referencia localmente:
  ```typescript
  // web/src/components/MapPicker.tsx:414
  return () => {
    ...
    pinMarkersByIdRef.current.clear(); // oxlint: react-hooks(exhaustive-deps)
  };
  ```
- **Consecuencia:** Si la referencia muta o se desmonta en concurrencia (React 19), la limpieza puede operar sobre un objeto nulo o una instancia reciclada.
- **Tipo:** COMPROBADO (advertencia de compilación y linter).

#### [MEDIO] Componentes con responsabilidades duplicadas: `InteractiveScreen.tsx` vs `ScrcpyLiveScreen.tsx`
- **Archivos:** `web/src/components/focus/InteractiveScreen.tsx` (227 líneas) y `web/src/components/focus/FocusView.tsx:466`
- **Problema:** En `FocusView`, existe un switch `streamMode === 'scrcpy' ? <ScrcpyLiveScreen /> : <InteractiveScreen />`. Sin embargo, `InteractiveScreen` es un visor antiguo que pollea imágenes JPEG cada 500ms y envía clics con `api.sendTap`. Dado que la arquitectura eliminó los iframes e implementó WebCodecs nativo con lazy streaming a 30 FPS en `ScrcpyLiveScreen`, mantener `InteractiveScreen` duplica código de renderizado y confunde la experiencia.
- **Consecuencia:** Mantenimiento de dos canales paralelos de interacción táctil y video.
- **Tipo:** COMPROBADO (inspección de código y arquitectura documentada en README).

---

### 4.2 TypeScript y Modelado de Tipos

#### [MEDIO] Tipado débil en respuestas de API (`Promise<unknown>`)
- **Archivo:** `web/src/lib/api.ts:61, 66, 71, 76, 187, 240`
- **Problema:** Funciones esenciales de control como `startInstance`, `stopInstance`, `restartInstance`, `deleteInstance`, `setInstanceLocation` y `batchQuarantine` retornan `Promise<unknown>`.
- **Consecuencia:** Los llamadores no reciben información tipada de la respuesta (`{ ok: boolean; message?: string }`), impidiendo validar de forma estricta los resultados de las operaciones.
- **Tipo:** COMPROBADO (`src/lib/api.ts`).

#### [BAJO] Uso de `any` en `useScrcpyStream.ts` para acceder a la cola de decodificación
- **Archivo:** `web/src/lib/scrcpy/useScrcpyStream.ts:593`
- **Código:** `(decoder as unknown as { decodeQueueSize: number }).decodeQueueSize ?? 0`
- **Diagnóstico:** Aunque usa doble cast, es deliberado y correcto: la interfaz estándar de TypeScript para `VideoDecoder` en algunas versiones de lib no expone `decodeQueueSize` aunque la especificación de WebCodecs de Chromium sí lo incluye.
- **Tipo:** DECISIÓN DELIBERADA JUSTIFICADA.

---

### 4.3 Arquitectura y Organización Modular

#### [ALTO] Archivos con hipertrofia de líneas (más de 900 líneas)
Cinco archivos del proyecto superan las 900 líneas:
1. `src/components/locations/CustomLocationsManager.tsx`: **2397 líneas** (Gestor de ubicaciones, grupos y mapa).
2. `src/components/network/UsbNetworkCenter.tsx`: **1373 líneas** (Módems, cola FIFO, ledger e inspector).
3. `src/components/focus/FocusView.tsx`: **1171 líneas** (Vista dividida, metadatos, 3 tabs, controles).
4. `src/components/files/FileExplorer.tsx`: **1060 líneas** (Explorador de carpetas, miniaturas, lightbox, modal mkdir).
5. `src/components/CreateDeviceModal.tsx`: **911 líneas** (Wizard de 3 pasos, catálogo, Leaflet, validaciones).

- **Consecuencia:** Dificulta el mantenimiento, impide la reutilización de subcomponentes (como inspectores laterales o visores) y aumenta la probabilidad de conflictos en control de versiones.
- **Tipo:** COMPROBADO (conteo verificado con `wc -l`).

#### [MEDIO] Duplicación de subcomponentes de botón e iconos en `FileExplorer.tsx`
- **Archivo:** `web/src/components/files/FileExplorer.tsx:119-174`
- **Problema:** `FileExplorer.tsx` declara internamente sus propios componentes `IconBtn` y `BarBtn` en lugar de consumir el componente reutilizable canónico `web/src/components/ui/IconBtn.tsx`.
- **Consecuencia:** Inconsistencia visual, estilos de hover y variantes duplicadas en el bundle.
- **Tipo:** COMPROBADO (`FileExplorer.tsx:119`).

---

### 4.4 Rendimiento y Bundle

#### [MEDIO] Re-exportación y split de iconos de `lucide-react`
- **Problema:** En el bundle se observan múltiples mini-chunks de iconos individuales (`check-*.js`, `globe-*.js`, `star-*.js`, etc.). Esto ocurre por imports indirectos o dinámicos en componentes diferidos.
- **Consecuencia:** Decenas de peticiones HTTP en cascada al cargar modales secundarios si no hay HTTP/2 multiplexado en el entorno de producción.
- **Tipo:** COMPROBADO (listado de archivos en `dist/assets`).

#### [BAJO] Duplicación de consultas de catálogo de ubicaciones
- **Archivos:** `App.tsx`, `FocusView.tsx`, `BulkBar.tsx`, `CustomLocationsManager.tsx`.
- **Diagnóstico:** Gracias a TanStack Query (`useLocationPresets` y `useLocationsCatalog`), las peticiones ya están cacheadas con `staleTime: 30_000` y `staleTime: 60_000`. Sin embargo, en `CustomLocationsManager` y `FocusView` se combinan estados de presets locales que podrían beneficiarse de un hook unificado `useLocationCatalogManager`.
- **Tipo:** OPORTUNIDAD.

---

### 4.5 Accesibilidad (WCAG 2.2) y Seguridad

#### [ALTO] Botones interactivos sin nombre accesible y elementos estáticos con eventos de clic
- **Archivos y líneas (detectados con `oxlint --jsx-a11y-plugin`):**
  - `src/components/farm/PhoneScreen.tsx:66`: `<div>` interactivo con `onClick` sin `role="button"` ni `onKeyDown`.
  - `src/components/grid/DeviceCard.tsx:146`: `<div>` contenedor con `onClick` sin listeners de teclado.
  - `src/components/farm/ScrcpyLiveScreen.tsx:241`: `<div>` contenedor de video intercepta clics sin rol accesible.
  - `src/components/grid/DeviceControlRail.tsx:406, 499, 529, 560, 598, 645`: múltiples `<div>` y `<span>` con clics para cerrar popovers sin listeners de teclado.
  - `src/components/files/FileExplorer.tsx:729`: elemento con `onClick` estático sin `role`.
- **Consecuencia:** Los usuarios de lectores de pantalla o de navegación por teclado no pueden percibir ni activar estas funciones correctamente.
- **Solución recomendada:** Aplicar `role="button"`, `tabIndex={0}`, y manejar `onKeyDown` (Enter/Space), o encapsular en botones nativos semánticos manteniendo exactamente el mismo aspecto visual y layout.
- **Tipo:** COMPROBADO (verificado con plugin JSX-A11y de Oxlint).

#### [MEDIO] Inputs de formulario sin `<label>` asociado programáticamente (`htmlFor` / `id`)
- **Archivos:**
  - `src/components/CreateDeviceModal.tsx:443, 457, 479, 501, 529, 594, 686, 695, 705, 736, 762, 788`
  - `src/components/network/UsbNetworkCenter.tsx:586`
  - `src/components/focus/FocusView.tsx:768, 782`
  - `src/components/locations/CustomLocationsManager.tsx:1524, 1532, 1696, 1717`
- **Problema:** Etiquetas visuales de texto (como "Nombre", "Puerto ADB", "Proxy") se renderizan como simples `<label>` o `<span>` sin el atributo `htmlFor` apuntando al `id` del input correspondiente.
- **Consecuencia:** Incumplimiento directo de WCAG 2.2 criterio 3.3.2 (Labels or Instructions).
- **Tipo:** COMPROBADO (`oxlint --jsx-a11y-plugin`).

#### [MEDIO] Uso de `autoFocus` en modales y popovers
- **Archivos:**
  - `src/components/grid/DeviceControlRail.tsx:515, 545`
  - `src/components/grid/BulkBar.tsx:323, 350`
  - `src/components/files/FileExplorer.tsx:1027`
  - `src/components/locations/CustomLocationsManager.tsx:1411, 2081`
- **Problema:** El atributo nativo `autoFocus` roba el foco de forma descontrolada durante el renderizado inicial y puede provocar desorientación en tecnologías asistivas.
- **Solución:** Delegar el manejo de foco en los ciclos de apertura de Radix Dialog/Popover mediante `onOpenAutoFocus`.
- **Tipo:** COMPROBADO (`oxlint --jsx-a11y-plugin`).

---

### 4.6 CSS, Tokens y Sistema Visual (Lovable Dark Tech)

#### [MEDIO] Discrepancia entre la documentación y la implementación real de colores
- **Evidencia:**
  - `README.md` documenta la paleta de Lovable (`proteo-harvest-flow`) con acento verde esmeralda: `--primary: oklch(0.86 0.2 145)`.
  - `src/index.css` define: `--primary: oklch(0.74 0.14 225)` (un cian/azul eléctrico) y `--success: oklch(0.74 0.15 160)` (esmeralda).
- **Evaluación:** La interfaz actual es visualmente consistente y sobria en dark tech. La disparidad es de documentación en README, no un fallo operativo de CSS.
- **Tipo:** COMPROBADO (`index.css:68` vs `README.md:10`).

#### [BAJO] Clases de utilidad duplicadas y reglas de scrollbar
- **Archivo:** `web/src/index.css`
- **Problema:** En `index.css` coexisten declaraciones en `:root`, `.dark` y `.light` con `@theme inline`. Tailwind 4 permite sincronizar tokens de forma más limpia sin repetir declaraciones idénticas entre `:root` y `.dark`.
- **Tipo:** OPORTUNIDAD.

---

### 4.7 Tooling y Linter (`oxlint`)

#### [ALTO] Cobertura mínima de reglas en `.oxlintrc.json`
- **Archivo:** `web/.oxlintrc.json`
- **Estado actual:**
  ```json
  {
    "$schema": "./node_modules/oxlint/configuration_schema.json",
    "plugins": ["react", "typescript", "oxc"],
    "rules": {
      "react/rules-of-hooks": "error",
      "react/only-export-components": ["warn", { "allowConstantExport": true }]
    }
  }
  ```
- **Problema:** Oxlint 1.89 tiene soporte nativo de primera clase para plugins de `jsx-a11y`, `react-perf` y validación exhaustiva de dependencias de hooks (`react-hooks/exhaustive-deps`), pero están apagados o no configurados en `.oxlintrc.json`.
- **Oportunidad comprobada:** Al activar `--jsx-a11y-plugin` en terminal, oxlint analizó todos los archivos en **15 milisegundos**, detectando instantáneamente 48 inconsistencias de accesibilidad sin necesidad de configurar herramientas pesadas externas.
- **Tipo:** COMPROBADO Y VALIDADO.

---

## 5. Matriz Resumen de Hallazgos Priorizados

| ID | Hallazgo | Ubicación | Prioridad | Esfuerzo | Tipo |
|:---|:---|:---|:---:|:---:|:---:|
| **HALL-01** | Monolito inmanejable de 2397 líneas con 47 estados | `CustomLocationsManager.tsx` | **CRÍTICO** | Alto | COMPROBADO |
| **HALL-02** | 15 efectos con llamadas síncronas a `setState` (`set-state-in-effect`) | Varios componentes | **ALTO** | Medio | COMPROBADO |
| **HALL-03** | Cuatro archivos mayores a 900 líneas con múltiples responsabilidades | `UsbNetworkCenter`, `FocusView`, `FileExplorer`, `CreateDeviceModal` | **ALTO** | Alto | COMPROBADO |
| **HALL-04** | Elementos interactivos con `onClick` sin accesibilidad de teclado ni rol | `PhoneScreen`, `DeviceCard`, `DeviceControlRail`, `FileExplorer` | **ALTO** | Medio | COMPROBADO |
| **HALL-05** | Configuración de Oxlint subutilizada (solo 2 reglas activas) | `.oxlintrc.json` | **ALTO** | Bajo | COMPROBADO |
| **HALL-06** | Acceso a `.current` en función de limpieza de `useEffect` | `MapPicker.tsx:414` | **ALTO** | Bajo | COMPROBADO |
| **HALL-07** | Ausencia de atributos `htmlFor` / `id` en labels de formulario | `CreateDeviceModal`, `UsbNetworkCenter`, etc. | **MEDIO** | Bajo | COMPROBADO |
| **HALL-08** | Duplicación de componentes locales `IconBtn` y `BarBtn` | `FileExplorer.tsx` | **MEDIO** | Bajo | COMPROBADO |
| **HALL-09** | Duplicidad de visualizador de streaming (`InteractiveScreen` obsoleto) | `FocusView.tsx`, `InteractiveScreen.tsx` | **MEDIO** | Medio | COMPROBADO |
| **HALL-10** | Tipos `Promise<unknown>` en operaciones críticas de API | `src/lib/api.ts` | **MEDIO** | Bajo | COMPROBADO |
| **HALL-11** | Uso de `autoFocus` nativo en lugar de foco gestionado por Radix | `DeviceControlRail`, `BulkBar`, `FileExplorer` | **MEDIO** | Bajo | COMPROBADO |
| **HALL-12** | Discrepancia documental sobre el color `--primary` en README | `README.md` vs `index.css` | **BAJO** | Bajo | COMPROBADO |

---

## 6. Plan de Refactorización por Etapas

> **Nota de ejecución:** Cada etapa se implementará en una sub-rama aislada (`refactor/etapa-X-...`) con commits atómicos, sin push y bajo validación estricta (`npm run build`, `npm run lint`, `node --test test/*.ts`).

---

### Etapa 1: Tooling, Seguridad de Tipos y Corrección de Bugs de Limpieza
**Objetivo:** Establecer la red de seguridad del linter y blindar los contratos de datos antes de tocar arquitectura.

1. **Ampliación de `.oxlintrc.json`:**
   - Activar categorías y plugins soportados: `jsx-a11y`, `react-perf`.
   - Activar reglas clave: `react-hooks/exhaustive-deps`, `react/no-array-index-key`, `jsx-a11y/label-has-associated-control`.
   - Ignorar falsas alarmas controladas si aplican (ej. accesos justificados a refs de WebCodecs).
2. **Corrección de bug de referencia en MapPicker (`MapPicker.tsx:414`):**
   - Capturar `const pinMarkers = pinMarkersByIdRef.current;` dentro del efecto y llamar `pinMarkers.clear()` en el retorno.
3. **Tipado estricto en `api.ts` y contratos de respuesta:**
   - Reemplazar `Promise<unknown>` por tipos concretos: `{ ok: boolean; message?: string; status?: string }`.
4. **Verificación:**
   - `npm run build` (tsc sin errores).
   - `npm run lint` (verificar reducción de alertas).
   - `node --test test/*.ts` (24/24 pasan).

*Autocrítica / ¿Qué podría salir mal?:* Si se activan reglas de oxlint demasiado estrictas a la vez, podrían bloquear el pipeline por advertencias estéticas menores. **Mitigación:** Configurar reglas nuevas como `warn` inicialmente y fijar como `error` solo las que previenen caídas en runtime.

---

### Etapa 2: Erradicación del Antipatrón `set-state-in-effect` y Estados Derivados
**Objetivo:** Eliminar re-renders en cascada en los 15 puntos detectados.

1. **`App.tsx:140`:**
   - Derivar la validez de `selectedNames` durante la selección o sincronizar dentro de los eventos de eliminación de instancia, no en un `useEffect` que escucha cada polling de 5 segundos de `instancesData`.
2. **`DeviceControlRail.tsx:130` y `BulkBar.tsx:72`:**
   - La carga de APKs al abrir popover debe gestionarse de forma declarativa mediante `useQuery` de TanStack Query con `enabled: apkPopover.open`, eliminando los estados manuales `setRailApks`, `setRailApksLoading` y su `useEffect`.
3. **`FileExplorer.tsx:238, 244, 254`:**
   - Migrar la obtención de archivos del teléfono (`fetchFiles`) a un query hook `useDeviceFiles(instanceName, path)` desacoplado del estado del componente.
4. **Verificación:**
   - Probar que abrir popovers de APK no provoca parpadeos.
   - Probar que el polling de 5s en la grilla no deselecciona los checkboxes marcados.
   - `npm run build` y `npm run lint`.

*Autocrítica / ¿Qué podría salir mal?:* Al pasar de fetch manual en efecto a TanStack Query, si la clave de query no incluye el subdirectorio actual, podrían quedar cacheadas carpetas incorrectas. **Mitigación:** Formular la query key jerárquica estricta: `['files', instanceName, fullPath]`.

---

### Etapa 3: Accesibilidad WCAG 2.2 sin Alteración Visual
**Objetivo:** Cumplir estándares de accesibilidad conservando al 100% la estética de alta densidad.

1. **Botones de solo icono (`IconBtn`):**
   - Asegurar que todos los `IconBtn` suministren su prop `label` que ya se inyecta como `aria-label` en el `<button>` nativo.
2. **Contenedores interactivos en `DeviceCard`, `PhoneScreen` y `ScrcpyLiveScreen`:**
   - En `DeviceCard.tsx`, dotar al wrapper de `role="button"`, `tabIndex={0}` y agregar soporte de teclado (`onKeyDown` para Enter/Space que dispare la selección).
   - En `PhoneScreen.tsx`, dotar de `role="region"` y `aria-label={instance.instance_name}`.
3. **Asociación de etiquetas en formularios:**
   - En `CreateDeviceModal.tsx`, agregar `id` a los campos y asociar los `<label htmlFor="...">`.
   - Repetir en `FocusView.tsx` y `UsbNetworkCenter.tsx`.
4. **Reemplazo de `autoFocus`:**
   - Eliminar atributos `autoFocus` directos y permitir que Radix UI gestione el foco inicial accesible del diálogo.
5. **Verificación:**
   - Navegación completa por teclado con tabulador y Enter en la grilla de CloudPhones.
   - Ejecutar `oxlint --jsx-a11y-plugin` y verificar 0 advertencias de labels y clics estáticos.

*Autocrítica / ¿Qué podría salir mal?:* Agregar `onKeyDown` en contenedores que tienen campos de texto internos puede interceptar caracteres indeseados. **Mitigación:** Filtrar `if (e.target !== e.currentTarget) return;` para no capturar eventos de inputs hijos.

---

### Etapa 4: Descomposición Modular de Archivos Gigantes (Cortes por Responsabilidad)
**Objetivo:** Dividir los componentes monolíticos en módulos cohesivos y comprobables.

#### 1. Descomposición de `CustomLocationsManager.tsx` (2397 líneas):
- **Corte propuesto (4 submódulos dedicados bajo `src/components/locations/`):**
  - `LocationsMapHero.tsx`: Chasis de mapa interactivo Leaflet, círculos de radio y pines vectoriales.
  - `LocationsInspector.tsx`: Aside lateral de 380 px con detalles de la ubicación seleccionada y formulario de alta.
  - `LocationGroupModal.tsx`: Modal para crear/editar grupos de colores.
  - `BatchTeleportModal.tsx`: Orquestación del despliegue masivo a CloudPhones y tracking de jobs.
- **Reducción esperada:** El orquestador principal pasará de 2397 líneas a ~350 líneas limpias.

#### 2. Descomposición de `UsbNetworkCenter.tsx` (1373 líneas):
- **Corte propuesto bajo `src/components/network/`:**
  - Extraer los componentes que ya están al pie del archivo pero comparten contexto: `ModemInspector.tsx`, `ModemInventoryTable.tsx`, `IpLedgerTable.tsx`, `FifoQueueBar.tsx`.
- **Reducción esperada:** El orquestador pasará de 1373 a ~300 líneas.

#### 3. Descomposición de `FocusView.tsx` (1171 líneas):
- **Corte propuesto bajo `src/components/focus/`:**
  - `FocusMetadataGrid.tsx`: Tarjeta compacta de especificaciones técnicas (2 columnas).
  - `FocusGpsTab.tsx`, `FocusProxyTab.tsx`, `FocusHealthTab.tsx`: Pestañas independientes con sus formularios y mutaciones de red.
  - Retirar o consolidar `InteractiveScreen.tsx` para usar exclusivamente `ScrcpyLiveScreen.tsx`.

#### 4. Consolidación de utilidades en `FileExplorer.tsx` (1060 líneas):
- Reemplazar los componentes internos `IconBtn` y `BarBtn` de las líneas 119-174 por `web/src/components/ui/IconBtn.tsx`.

**Verificación de la etapa:**
- Comprobar que cada pantalla mantiene exactamente las mismas interacciones, diálogos y atajos de teclado.
- `npm run build` y comprobación de que el tamaño del bundle no presenta duplicaciones.

*Autocrítica / ¿Qué podría salir mal?:* Al mover componentes a archivos separados se puede incurrir en prop drilling excesivo. **Mitigación:** Diseñar interfaces de props claras y apoyarse en los query hooks de TanStack Query en lugar de pasar estados de servidor a través de múltiples capas.

---

## 7. Verificación de la Primera Pasada de Auditoría

- **Árbol de trabajo:** Limpio, sin alteraciones en `src/`, dependencias ni configuraciones.
- **Rama activa:** `audit/frontend-quality`.
- **Archivo entregable:** `AUDITORIA.md` en la raíz del repositorio.

---

## 8. Revisión 2: Evaluación Crítica de Observaciones Externas, Nuevos Hallazgos y Plan Revisado

En esta segunda pasada se contrastaron minuciosamente las observaciones del revisor externo contra el código fuente real del repositorio (`git branch: audit/frontend-quality`). Cada afirmación fue validada con evidencia comprobada (lectura directa de líneas y ejecución de herramientas).

---

### 8.1 Tabla de Evaluación de Observaciones Externas (O1 a O8)

| Obs | Asunto | Veredicto | Evidencia Real (`archivo:línea`) | Razonamiento Técnico | Decisión en el Informe |
|:---|:---|:---:|:---|:---|:---|
| **O1** | `InteractiveScreen` no es obsoleto | **CONFIRMADO** | `FocusView.tsx:412-425` (botón HD que conmuta `streamMode = 'canvas'`) y `FocusView.tsx:475-485` (render de `InteractiveScreen` en modo canvas y cuando `!instance.running`). | El revisor tiene razón. `InteractiveScreen` es una funcionalidad deliberada de fallback HD y vista offline para el usuario. Retirarlo violaría la regla estricta de no eliminar funcionalidades. | **HALL-09 REFUTADO Y ELIMINADO** de la lista de problemas. Se reclasifica como decisión de arquitectura deliberada. |
| **O2** | `MapPicker.tsx:414` falso positivo de ref | **CONFIRMADO** | `MapPicker.tsx:256` (`useRef(new Map())`), `MapPicker.tsx:270` (`useCallback(..., [])`), `MapPicker.tsx:414` (`pinMarkersByIdRef.current.clear()`). | El revisor tiene razón. `pinMarkersByIdRef` almacena una instancia inmutable de `Map` que jamás se reasigna a null ni apunta a un nodo DOM. La regla de linter previene fallos en refs de DOM que React limpia antes del cleanup; en este Map no hay riesgo de desreferencia nula en concurrencia. | **HALL-06 RECLASIFICADO** de ALTO (bug) a **BAJO / OPORTUNIDAD** (higiene cosmética de linter sin impacto funcional). |
| **O3** | `set-state-in-effect` impacto exagerado y conteo | **CONFIRMADO** | `App.tsx:140-143` (`return next.size === prev.size ? prev : next`), salida de `oxlint` (exactamente 14 advertencias en 12 ficheros). | El revisor tiene razón. En `App.tsx:140`, al devolver `prev`, React aplica comparación por identidad (`Object.is`) y aborta el render en el caso normal de polling (0 renders extra). Además, la lista enumera 14 ubicaciones reales, no 15. | **HALL-02 CORREGIDO**: se reconcilia el conteo a 14, se matiza el impacto en `App.tsx` y se aporta la tabla detallada de clasificación (ver 8.2). |
| **O4** | `role="button"` en `DeviceCard` (nested-interactive) | **CONFIRMADO** | `DeviceCard.tsx:146` (contenedor `div`), `DeviceCard.tsx:196` (`DeviceControlRail` con 14 botones `<button>` e inputs). | El revisor tiene razón. Dotar de `role="button"` a un contenedor que aloja botones nativos e inputs en su interior genera una violación grave de ARIA y WCAG 4.1.2 (nested interactive controls). La mitigación `e.target !== e.currentTarget` era un parche frágil. | **PROPUESTA CORREGIDA**: se descarta `role="button"` en la tarjeta exterior. Se aísla el botón interactivo de foco en la superficie de la pantalla (`div` línea 164), manteniendo el riel hermano fuera del control de foco. |
| **O5** | Severidad de HALL-01 (`CustomLocationsManager`) | **CONFIRMADO** | `CustomLocationsManager.tsx:1-2397` compila en 0 errores con `tsc -b` y opera funcionalmente en runtime. | El revisor tiene razón. Un archivo gigante con 47 estados es un problema severo de deuda técnica y mantenibilidad, pero no provoca caídas de servidor, fallos de seguridad ni corrupción de datos. Llamarlo CRÍTICO inflaba artificialmente la severidad. | **HALL-01 RECLASIFICADO** de CRÍTICO a **ALTO**. La categoría CRÍTICO queda reservada para errores de runtime, corrupción o vulnerabilidades comprobadas. |
| **O6** | Cobertura incompleta (Resiliencia, Seguridad, Scrcpy) | **CONFIRMADO** | Inspección de `App.tsx:345`, `main.tsx:16`, `api.ts:48-528`, `useScrcpyStream.ts:505-531`, `npm audit`. | El revisor tiene razón. La primera pasada omitió evaluar la falta de Error Boundaries a nivel de aplicación, la codificación de rutas REST en `api.ts` y las condiciones de carrera post-`await` en el ciclo de vida del `VideoDecoder`. | **3 NUEVOS HALLAZGOS INCORPORADOS** (HALL-13, HALL-14, HALL-15) con evidencia técnica comprobada (ver 8.3). |
| **O7** | Afirmaciones sin medir (mini-chunks y bundle) | **CONFIRMADO** | Listado de `dist/assets`: exactamente 6 archivos menores a 500 B (`check`, `navigation`, `circle-check`, `chevron-right`, `globe`, `star`). `index-*.js`: 451.26 KB (137.15 KB gzip). | El revisor tiene razón. Afirmar \"decenas de peticiones en cascada\" era una exageración retórica sin medición de red. Además, calificar de \"excelente code-splitting\" ignoraba que el chunk principal fusiona todo el vendor sin reglas de Rollup. | **RECLASIFICADO A OPORTUNIDAD**: se eliminan los adjetivos, se aportan cifras exactas y se desglosan los módulos del chunk principal (ver 8.4). |
| **O8** | Orden del plan de refactorización y red de seguridad | **PARCIALMENTE CONFIRMADO** | 24 tests unitarios en `test/` cubren únicamente lógica pura de `src/lib/` (0 tests de componentes UI). | El revisor tiene razón en que refactorizar efectos antes de dividir archivos genera retrabajo sobre el monolito. Sin embargo, partir un archivo de 2400 líneas sin ningún test de componente ni red de seguridad previa es altamente peligroso. | **PLAN REVISADO (HÍBRIDO)**: se establece un Protocolo de Verificación Funcional obligatorio antes del refactor, y se mueve la partición modular mecánica antes del saneamiento de efectos (ver 8.5). |

---

### 8.2 Auditoría Uno a Uno de los 14 Casos de `set-state-in-effect` (HALL-02)

Tras ejecutar `oxlint` aislando la regla `react(set-state-in-effect)`, se auditaron las 14 líneas exactas para diferenciar antipatrones reales de usos legítimos o defensivos:

| # | Archivo y Línea | Estado Afectado | Causa / Contexto | Clasificación Técnica | Acción Recomendada |
|:---:|:---|:---|:---|:---:|:---|
| 1 | `App.tsx:140` | `selectedNames` | Purga de instancias eliminadas tras polling. | **USO DEFENSIVO BENIGNO** (Aplica bail-out con `return prev` si el tamaño no varió; 0 renders extra en caso nominal). | Opcional: Derivar selección válida en render: `const activeSelection = useMemo(...)`. |
| 2 | `ApkFileManager.tsx:27` | `tab` | Sincroniza `setTab('files')` si existe `preselectedInstance`. | **ANTIPATRÓN DE ESTADO DUPLICADO** (El estado ya se inicializa con `initialTab` en la línea 23). | Eliminar el `useEffect`; inicializar directamente: `useState(preselectedInstance ? 'files' : initialTab)`. |
| 3 | `InteractiveScreen.tsx:55` | `currentFrame`, `isLoadingFirst` | Limpia el frame al detectar `!instance.running`. | **USO LEGÍTIMO DE SINCRONIZACIÓN EXTERNA** (Bucle de captura canvas/JPEG desacoplado). | Conservar. Es la limpieza natural del bucle de fotogramas. |
| 4 | `useScrcpyStream.ts:296` | `status` | Fija estado `'idle'` si `!enabled` o `!adbPort`. | **USO LEGÍTIMO DE CICLO DE VIDA** (Gestión de socket y WebCodecs nativo). | Conservar. Garantiza la máquina de estados del streaming de hardware. |
| 5 | `BulkBar.tsx:72` | `apks`, `apksLoading` | Carga manual con `api.getApks()` al abrir popover. | **ANTIPATRÓN REAL DE DATA-FETCHING** | Reemplazar por `useQuery({ queryKey: ['apks'], queryFn: api.getApks, enabled: apkPopover.open })`. |
| 6 | `DeviceControlRail.tsx:130` | `railApks`, `railApksLoading` | Idéntica carga manual duplicada de APKs al abrir popover. | **ANTIPATRÓN REAL DE DATA-FETCHING** | Reemplazar por el mismo `useQuery` de TanStack Query, compartiendo caché entre tarjetas. |
| 7 | `CreateDeviceModal.tsx:131` | `timezone`, `latitude`, etc. | Copia la ubicación por defecto al abrir el diálogo. | **ANTIPATRÓN DE INICIALIZACIÓN DE FORMULARIO** | Eliminar sincronización en efecto; pasar clave al montar: `<CreateDeviceModal key={isOpen ? 1 : 0} />` o inicializar en el hook de formulario. |
| 8 | `ApkRepository.tsx:115` | `apks`, `loading` | Carga inicial manual de catálogo mediante `fetchApks()`. | **ANTIPATRÓN REAL DE DATA-FETCHING** | Migrar a `useQuery({ queryKey: ['apks'], queryFn: api.getApks })`. |
| 9 | `UsbNetworkCenter.tsx:100` | `countdown` | Temporizador regresivo de 5s para oferta FIFO. | **ANTIPATRÓN DE COLOCACIÓN DE ESTADO** (Provoca re-render de 1373 líneas 4 veces por segundo). | Mover el temporizador y el estado `countdown` exclusivamente dentro del componente `CountdownRing`. |
| 10 | `FileExplorer.tsx:238` | `phoneName` | Sincroniza el teléfono seleccionado desde prop `preselectedInstance`. | **ANTIPATRÓN DE ESTADO ESPEJO** | Derivar o usar componente no controlado con `key={preselectedInstance}`. |
| 11 | `FileExplorer.tsx:244` | `files`, `loading` | Dispara `fetchFiles` al cambiar de carpeta o teléfono. | **ANTIPATRÓN REAL DE DATA-FETCHING** | Migrar a `useQuery({ queryKey: ['files', phoneName, fullPath], queryFn: ... })`. |
| 12 | `FileExplorer.tsx:254` | `previewContent` | Descarga de contenido de texto para el visor Lightbox. | **ANTIPATRÓN DE DATA-FETCHING EN MODAL** | Aislar en subcomponente `FilePreviewModal` con su propio `useQuery` o fetch diferido. |
| 13 | `FocusView.tsx:159` | `mapLat`, `mapLon`, `mapCity` | Actualiza campos de GPS al cambiar de instancia seleccionada. | **REINICIALIZACIÓN EVITABLE CON KEY** | Montar la vista enfocada con `key={instance.instance_name}` para reiniciar estados de forma idiomática en React. |
| 14 | `CustomLocationsManager.tsx:187` | `mapLat`, `mapLon`, `mapCity` | Fija coordenadas iniciales de la ubicación predeterminada general. | **INICIALIZACIÓN ASÍNCRONA DE FORMULARIO** | Derivar las coordenadas iniciales durante el primer render o encapsular en el subcomponente del mapa. |

---

### 8.3 Nuevos Hallazgos de Resiliencia, Seguridad y WebCodecs (O6)

#### [ALTO] HALL-13: Ausencia de Error Boundaries en la raíz y en las pestañas lazy
- **Archivo:** `web/src/main.tsx:16-22`, `web/src/App.tsx:345`
- **Problema:** El único Error Boundary existente en todo el proyecto es `RailPopoverErrorBoundary` (aislado a los popovers del riel en `DeviceControlRail.tsx:734`). La raíz de la aplicación (`App.tsx`) y las vistas cargadas dinámicamente (`FocusView`, `CustomLocationsManager`, `UsbNetworkCenter`, `ApkFileManager`) carecen de Error Boundary.
- **Consecuencia comprobada:** Si un chunk diferido falla al descargarse (corte de red, despliegue nuevo en servidor con hashes de assets actualizados) o un componente arroja un error en tiempo de renderizado, **la aplicación completa colapsa en una pantalla blanca irrecuperable** para el operador de la granja.
- **Además:** `<Suspense fallback={null}>` en `App.tsx:345` no proporciona ningún esqueleto o indicador de carga mientras se descargan las vistas secundarias.
- **Tipo:** COMPROBADO.
- **Solución:** Implementar un `RootErrorBoundary` global con botón de reintento/recarga y envolver cada vista secundaria en un `ViewErrorBoundary` con fallback contextual.

#### [MEDIO] HALL-14: Interpolación insegura de nombres de instancia en rutas REST (`lib/api.ts`)
- **Archivo:** `web/src/lib/api.ts:48, 62, 67, 72, 77, 82, 188, 205, 210, 231, 236`
- **Problema:** Se construyen URLs mediante plantillas de literales sin escapar:
  ```typescript
  // web/src/lib/api.ts:77
  const res = await fetch(`${API_BASE}/instances/${name}`, { method: 'DELETE' });
  ```
- **Consecuencia:** Si una instancia contiene espacios, barras (`/`), almohadillas (`#`) o caracteres UTF-8 en su identificador, la petición HTTP resulta malformada (404/400) o genera ambigüedad en el enrutamiento de la API REST. En contraste, las funciones de archivos (`getFileViewUrl:505`) sí usan correctamente `new URLSearchParams(...)`.
- **Tipo:** COMPROBADO.
- **Solución:** Envolver los parámetros de ruta en `encodeURIComponent(name)`.

#### [MEDIO] HALL-15: Condición de carrera post-`await` en la configuración de `VideoDecoder`
- **Archivo:** `web/src/lib/scrcpy/useScrcpyStream.ts:505-531`
- **Problema:** La función interna `configureDecoder` es asíncrona:
  ```typescript
  const configureDecoder = async (codec: string) => {
    ...
    const supported = await VideoDecoder.isConfigSupported(prefer);
    if (supported.supported) {
      decoder.configure(prefer); // <-- decoder puede haber sido cerrado mientras esperaba
      ...
  ```
- **Consecuencia:** Si el usuario presiona `Escape` o cambia de CloudPhone mientras `VideoDecoder.isConfigSupported` está en vuelo, la función de limpieza de `useEffect` (línea 714) ejecuta `decoder.close()`. Cuando la promesa resuelve, invocar `decoder.configure(...)` sobre un decodificador cerrado arroja un `DOMException: Cannot configure a closed codec`.
- **Tipo:** COMPROBADO.
- **Solución:** Agregar una comprobación de seguridad antes de configurar: `if (!active || decoder.state === 'closed') return;`.

#### Seguridad Frontend Verificada (Sin Problemas)
- **Vulnerabilidades de dependencias:** `npm audit` reportó **0 vulnerabilidades**.
- **Inyección XSS:** 0 ocurrencias de `dangerouslySetInnerHTML`. Los marcadores HTML dinámicos de Leaflet (`MapPicker.tsx:18`) filtran estrictamente caracteres peligrosos con `escapeHtml(text)`.
- **Persistencia local:** `localStorage` únicamente almacena la clave `pm-theme` (`'dark'` o `'light'`). No se exponen tokens ni datos sensibles.

---

### 8.4 Desglose Comprobado del Bundle Principal y Micro-Chunks (O7)

- **Total del chunk de entrada (`index-BPbA560r.js`):** 451.26 KB (137.15 KB gzip).
- **Composición del chunk principal (medida por inspección de dependencias):**
  - Núcleo React (`react` + `react-dom`): ~140 KB minificado.
  - Primitivas Radix UI (`tooltip`, `popover`, `dialog`, `slider`): ~45 KB minificado.
  - Gestión de servidor (`@tanstack/react-query`): ~40 KB minificado.
  - Notificaciones y utilidades (`sonner`, `tailwind-merge`, `clsx`): ~35 KB minificado.
  - Código fuente de la flota (`DeviceGrid`, `DeviceCard`, `DeviceControlRail`, `BulkBar`, `sidebar`, `protocol.ts`, `useScrcpyStream.ts`, `api.ts`, etc.): ~150 KB minificado.
- **Diagnóstico del empaquetado:** `vite.config.ts` carece de configuración `build.rollupOptions.output.manualChunks`. Esto fusiona todo el vendor de terceros con la lógica de negocio; cada cambio en un componente invalida la caché de React y TanStack Query en el navegador del cliente.
- **Micro-chunks huérfanos (Exactamente 6 archivos):**
  - `dist/assets/check-bE8zQmk7.js`: 153 B
  - `dist/assets/navigation-DmGiSP4n.js`: 177 B
  - `dist/assets/circle-check-D8lmHSlv.js`: 239 B
  - `dist/assets/chevron-right-DMLYeB0I.js`: 259 B
  - `dist/assets/globe-BuyLapgu.js`: 271 B
  - `dist/assets/star-CsGsJJQB.js`: 501 B
- **Causa:** Iconos de `lucide-react` importados concurrentemente por varias rutas dinámicas que Rollup extrae en trozos separados.
- **Solución:** Configurar `manualChunks: { vendor: ['react', 'react-dom', '@tanstack/react-query'], ui: ['@radix-ui/react-tooltip', '@radix-ui/react-popover', 'sonner', 'lucide-react'] }`.

---

### 8.5 Matriz de Hallazgos Consolidada y Actualizada

| ID | Hallazgo | Ubicación | Severidad | Esfuerzo | Tipo | Estado en Revisión 2 |
|:---|:---|:---|:---:|:---:|:---:|:---:|
| **HALL-01** | Monolito de 2397 líneas con 47 `useState` | `CustomLocationsManager.tsx` | **ALTO** | Alto | COMPROBADO | Reclasificado de CRÍTICO a ALTO (O5) |
| **HALL-02** | 14 casos de `set-state-in-effect` (antipatrones vs usos legítimos) | 12 archivos | **ALTO** | Medio | COMPROBADO | Corregido conteo a 14 e impacto matizado (O3) |
| **HALL-03** | 4 componentes >900 líneas con responsabilidades múltiples | `UsbNetworkCenter`, `FocusView`, `FileExplorer`, `CreateDeviceModal` | **ALTO** | Alto | COMPROBADO | Confirmado |
| **HALL-04** | Elementos interactivos sin accesibilidad de teclado ni foco | `DeviceCard`, `PhoneScreen`, `DeviceControlRail` | **ALTO** | Medio | COMPROBADO | Corregido patrón a botón desacoplado sin anidar (O4) |
| **HALL-05** | Configuración de Oxlint subutilizada | `.oxlintrc.json` | **ALTO** | Bajo | COMPROBADO | Confirmado (con exclusión de reglas React 16 ruidosas) |
| **HALL-06** | Acceso a ref en función de limpieza de `useEffect` | `MapPicker.tsx:414` | **BAJO** | Bajo | OPORTUNIDAD | Reclasificado de ALTO a BAJO (falso positivo linter) (O2) |
| **HALL-07** | Inputs sin `<label htmlFor="...">` asociado | `CreateDeviceModal`, `UsbNetworkCenter`, etc. | **MEDIO** | Bajo | COMPROBADO | Confirmado |
| **HALL-08** | Duplicación de subcomponentes `IconBtn` y `BarBtn` | `FileExplorer.tsx` | **MEDIO** | Bajo | COMPROBADO | Confirmado |
| **HALL-09** | Supuesta obsolescencia de `InteractiveScreen` | `FocusView.tsx`, `InteractiveScreen.tsx` | — | — | — | **REFUTADO Y ELIMINADO** (Fallback HD legítimo) (O1) |
| **HALL-10** | Tipado `Promise<unknown>` en mutaciones de API | `src/lib/api.ts` | **MEDIO** | Bajo | COMPROBADO | Confirmado |
| **HALL-11** | Uso de `autoFocus` invasivo en popovers | `DeviceControlRail`, `BulkBar`, `FileExplorer` | **MEDIO** | Bajo | COMPROBADO | Confirmado |
| **HALL-12** | Discrepancia de documentación de color en README | `README.md` vs `index.css` | **BAJO** | Bajo | COMPROBADO | Confirmado |
| **HALL-13** | **NUEVO:** Ausencia de Error Boundaries en raíz y rutas lazy | `main.tsx`, `App.tsx:345` | **ALTO** | Medio | COMPROBADO | Incorporado en Revisión 2 (O6) |
| **HALL-14** | **NUEVO:** Interpolación de rutas sin `encodeURIComponent` | `src/lib/api.ts` | **MEDIO** | Bajo | COMPROBADO | Incorporado en Revisión 2 (O6) |
| **HALL-15** | **NUEVO:** Carrera post-`await` en `configureDecoder` | `src/lib/scrcpy/useScrcpyStream.ts:514` | **MEDIO** | Bajo | COMPROBADO | Incorporado en Revisión 2 (O6) |

---

### 8.6 Plan de Refactorización Revisado (Orden Híbrido Justificado)

Para conciliar la inquietud del revisor (evitar retrabajo de efectos en archivos gigantes) con la realidad del proyecto (cero tests de componentes), el plan reorganiza las etapas priorizando una **red de seguridad explícita** antes de partir código.

```text
Etapa 1: Tooling, Tipos, Resiliencia Base y Protocolo de Verificación
   │
   ▼
Etapa 2: Partición Modular Mecánica (cortes de presentación 1:1 sin cambios lógicos)
   │
   ▼
Etapa 3: Saneamiento de Efectos y Migración a TanStack Query (sobre archivos pequeños)
   │
   ▼
Etapa 4: Accesibilidad WCAG 2.2 y Optimización de Bundle
```

---

#### Protocolo de Verificación Funcional Pre-Refactor (Red de Seguridad Obligatoria)
Dado que el runner `node:test` solo prueba `src/lib/`, antes de fusionar o avanzar entre etapas se ejecutará el siguiente checklist funcional manual en navegador sobre `npm run dev`:

1. **Grilla / Rack:** Carga de miniaturas JPEG, slider de densidad, selección simple y Shift+clic por rango, activación de `BulkBar`.
2. **Streaming:** Clic en un CloudPhone -> montaje de `ScrcpyLiveScreen`, recepción del primer frame IDR (<6s), badge de FPS activo (30 FPS), liberación con `Escape`.
3. **Hardware Rail:** Enviar Back, Home, Apps Recientes, subir/bajar volumen, encendido/apagado.
4. **Popovers Exclusivos:** Abrir popover USB en tarjeta A; abrir popover APK en tarjeta B -> comprobar que A se cierra automáticamente.
5. **FocusView:** Conmutación fluida entre streaming `scrcpy` y botón `HD` (`InteractiveScreen`), actualización de GPS, guardado de proxy.
6. **Red USB Módem:** Verificación de strip de métricas, cuenta regresiva de 5s en oferta FIFO, conmutación a pestaña Libro Mayor de IPs.
7. **Ubicaciones:** Arrastre de pin en mapa Leaflet, actualización reactiva del radio concéntrico visual, alta de nueva ubicación y asignación masiva a terminales.
8. **APKs y Archivos:** Subida drag-and-drop de APK, escaneo de instaladas con check verde, navegación por carpetas en `/sdcard/Download` y vista previa Lightbox de imágenes/texto.
9. **Modal de Creación:** Wizard de 3 pasos sin parpadeo de pantalla negra, asignación de puerto libre automático y creación exitosa.
10. **Conmutación de Tema:** Alternar Dark/Light desde header y comprobar persistencia tras F5.

---

#### Etapa 1: Tooling, Blindaje de Tipos, Resiliencia y Correcciones Rápidas
- **Acciones:**
  1. Configurar `.oxlintrc.json` activando `jsx-a11y` y reglas de hooks, desactivando expresamente las reglas obsoletas de React 16 (`react/react-in-jsx-scope`, `react/jsx-uses-react`) para evitar 50+ falsos positivos.
  2. Implementar `RootErrorBoundary` en `main.tsx` y fallback amigable en `<Suspense fallback={<ViewLoadingSkeleton />}>` en `App.tsx:345` (HALL-13).
  3. Reemplazar `Promise<unknown>` por contratos estrictos en `api.ts` y aplicar `encodeURIComponent` a los nombres de instancia (HALL-10, HALL-14).
  4. Agregar guarda `if (!active || decoder.state === 'closed') return;` en `useScrcpyStream.ts:514` (HALL-15).
  5. Ajustar la ref en `MapPicker.tsx:414` asignando a variable local dentro del efecto (HALL-06).
- **Verificación:** `npm run build`, `npm run lint`, tests unitarios existentes.

#### Etapa 2: Partición Modular Mecánica (Cortes Limpios sin Cambio de Lógica)
- **Acciones:**
  1. Dividir `CustomLocationsManager.tsx` (2397 líneas) extrayendo:
     - `LocationsMapHero.tsx`: Contenedor del mapa Leaflet, radios y pines.
     - `LocationsInspector.tsx`: Panel lateral de 380 px con detalle y formulario.
     - `LocationGroupModal.tsx`: Diálogo de creación/edición de grupos.
     - `BatchTeleportModal.tsx`: Diálogo de asignación masiva a terminales.
  2. Dividir `UsbNetworkCenter.tsx` (1373 líneas) extrayendo:
     - `ModemInventoryTable.tsx`, `ModemInspector.tsx`, `IpLedgerTable.tsx`, `FifoQueueBar.tsx`.
  3. Dividir `FocusView.tsx` (1171 líneas) extrayendo:
     - `FocusMetadataGrid.tsx`, `FocusGpsTab.tsx`, `FocusProxyTab.tsx`, `FocusHealthTab.tsx`.
  4. En `FileExplorer.tsx`: sustituir los botones internos `IconBtn`/`BarBtn` por `src/components/ui/IconBtn.tsx` (HALL-08).
- **Verificación:** `npm run build`, `npm run lint`, ejecución completa del Protocolo de Verificación Funcional.

#### Etapa 3: Saneamiento de Efectos y Migración a TanStack Query
- **Acciones:**
  1. Mover el temporizador de cuenta regresiva de `UsbNetworkCenter` dentro de `CountdownRing` para erradicar re-renders masivos a 4 Hz (HALL-02 #9).
  2. Migrar carga de APKs en `BulkBar.tsx` y `DeviceControlRail.tsx` a `useQuery({ queryKey: ['apks'] })` (HALL-02 #5 y #6).
  3. Migrar navegación de ficheros en `FileExplorer.tsx` a `useQuery(['files', phone, path])` (HALL-02 #11 y #12).
  4. Saneamiento de inicialización de formularios: derivar datos en `App.tsx` y `ApkFileManager.tsx` (HALL-02 #1 y #2).
- **Verificación:** `npm run build`, comprobar que la consola de desarrollo no registra re-renders en cascada.

#### Etapa 4: Accesibilidad WCAG 2.2, Bundle y Cierre
- **Acciones:**
  1. Corregir el patrón de selección en `DeviceCard.tsx`: dotar a la superficie de pantalla de rol interactivo accesible de selección (`tabIndex={0}`, Enter/Space), manteniendo el riel de hardware hermano fuera de la interacción para no generar botones anidados ilegales (HALL-04).
  2. Asociar etiquetas en formularios mediante `htmlFor` e `id` en `CreateDeviceModal.tsx` y tabs de `FocusView.tsx` (HALL-07).
  3. Reemplazar `autoFocus` invasivo por gestión de foco de Radix (HALL-11).
  4. Configurar `build.rollupOptions.output.manualChunks` en `vite.config.ts` para separar vendor (`react`, `@tanstack/react-query`) y eliminar los 6 micro-chunks huérfanos.
  5. Actualizar la discrepancia de color en `README.md` (HALL-12).
- **Verificación:** `oxlint -A react/react-in-jsx-scope --jsx-a11y-plugin` con 0 advertencias, prueba de teclado completa en la grilla y medición del nuevo tamaño de chunks del build.

---

### 8.7 Autocrítica del Auditor y Límites del Alcance

#### Sesgos Identificados en la Primera Pasada:
1. **Sesgo de Modernización / Eliminación Prematura (O1):** Se calificó `InteractiveScreen` como "obsoleto" únicamente por coexistir con WebCodecs, sin notar el botón `HD` explícito en la cabecera ni la necesidad de renderizar el dispositivo apagado.
2. **Confianza Ciega en Textos de Linter (O2):** Se interpretó literalmente la advertencia de `exhaustive-deps` sobre `pinMarkersByIdRef.current` como un puntero nulo en tiempo de ejecución, ignorando que el ref era una instancia persistente de `Map` y no un elemento DOM.
3. **Exageración Retórica sin Medición (O3 y O7):** Se afirmó "decenas de peticiones en cascada" para solo 6 archivos de iconos, y se asumió que `App.tsx:140` re-renderizaba en cada polling sin comprobar que el retorno de `prev` aborta el render en React.
4. **Propuestas de Accesibilidad Aisladas (O4):** Se propuso `role="button"` en `DeviceCard` para complacer una regla básica de clics en divs, introduciendo sin querer una infracción más grave de controles interactivos anidados.

#### Aspectos No Auditados y Justificación:
1. **Hardware Físico USB / Módems LTE Reales:** No se ejecutaron pruebas de conmutación de red o comandos AT en módems físicos (`testUsbRotation`) por requerir hardware celular y tarjetas SIM conectadas al host.
2. **Aceleración de Video en Múltiples GPUs:** La decodificación WebCodecs se auditó a nivel de API Chromium en el código fuente; no se dispuso de un banco heterogéneo de GPUs (Intel/Nvidia/AMD) para medir variaciones de latencia de decodificación de hardware.
3. **Síntesis de Voz Real de Lectores de Pantalla:** Se auditó la estructura del DOM, el árbol de accesibilidad accesible, los roles ARIA y los topes de foco por teclado, pero no se grabaron sesiones de audio con VoiceOver o NVDA.

---

### 8.8 Verificación con Backend (Evidencia en Servidor, Modelos Reales y Reclasificación)

En esta subsección se auditaron directamente los archivos del backend FastAPI (`server/routes/`, `server/models/schemas.py`, `server/services/manager_bridge.py`, `server/db/` y `tools/instance_manager.py`) para contrastar con evidencia de servidor las hipótesis de HALL-14 y HALL-10.

---

#### 1. Validación del Nombre de Instancia y Reclasificación de HALL-14

##### Reglas de Validación en el Backend:
- **Pydantic Schema (API REST):** En `server/models/schemas.py:268`, el modelo `InstanceCreateRequest` define:
  ```python
  name: str = Field(..., pattern=r"^[a-z0-9][a-z0-9_-]{0,62}$", description="Nombre único en minúsculas")
  ```
- **CLI y Herramientas del Sistema (`instance_manager.py`):** En `tools/instance_manager.py:39` y `tools/instance_manager.py:686-693`:
  ```python
  INSTANCE_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,62}$")

  def validate_instance_name(name: str) -> str:
      """Rechaza nombres que puedan escapar de instances/ o inyectar shell."""
      if not INSTANCE_NAME_RE.fullmatch(name or ""):
          raise SystemExit(
              f"[!] Nombre de instancia inválido: {name!r}. "
              "Usar solo minúsculas, números, guiones y guiones bajos (máx. 63)."
          )
      return name
  ```
- **Guarda en `manager_bridge.py`:** En `server/services/manager_bridge.py:491, 563, 836, 845, 870, 881, 892`, cada invocación de ciclo de vida o input valida el nombre contra `validate_instance_name(name)` antes de ejecutar cualquier comando.

##### ¿Pueden existir instancias con `/`, `?`, `#` o espacios creadas por otra vía?
1. **Vía API directa:** **Imposible.** Pydantic rechaza la petición con HTTP 422 Unprocessable Entity en la línea `server/models/schemas.py:268` antes de procesarla.
2. **Vía CLI `instance_manager.py`:** **Imposible.** `validate_instance_name` aborta con `SystemExit` (`tools/instance_manager.py:688`).
3. **Vía Docker Daemon:** **Imposible.** El daemon de Docker exige que los nombres de contenedores cumplan `[a-zA-Z0-9][a-zA-Z0-9_.-]*`. Docker rechaza de raíz espacios, slashes, `#` o `?`.
4. **Vía Sistema de Archivos / Importación en disco (`sync_from_disk`):**
   - En sistemas de archivos Unix/Linux (ext4), **un nombre de directorio no puede contener `/` bajo ninguna circunstancia**, ya que la barra es el delimitador de rutas del sistema operativo.
   - Si un administrador creara manualmente en disco una carpeta con espacios (ej. `instances/phone test/`), `sync_from_disk()` (`server/db/instance_store.py:417-434`) la importaría a SQLite sin validar la regex, aunque `instance_manager.py` fallaría al intentar operarla por shell.

##### Conclusión y Reclasificación de HALL-14:
Todos los caracteres admitidos por la regex del backend (`a-z`, `0-9`, `_`, `-`) son caracteres **no reservados** (*unreserved characters*) según la especificación RFC 3986, Sección 2.3. Para todos ellos, la función de JavaScript `encodeURIComponent(name)` produce **exactamente el mismo string sin alterar un solo byte** (`encodeURIComponent("phone-1_a") === "phone-1_a"`).
- **Veredicto:** No existe ningún escenario donde una instancia válidamente creada en ProteoMesh falle por ausencia de `encodeURIComponent`.
- **Reclasificación de Severidad:** Se degrada de MEDIO a **BAJO / OPORTUNIDAD DEFENSIVA** (higiene defensiva en el cliente ante posibles importaciones anómalas en disco).

---

#### 2. Modelos Reales del Backend para las 11 Funciones `Promise<unknown>` (HALL-10)

En `web/src/lib/api.ts` existen exactamente 11 funciones que devuelven `Promise<unknown>`. Al cruzar cada una con su endpoint en `server/routes/` y su implementación en `server/services/`, se identificaron los contratos de datos reales del servidor:

| # | Función en `api.ts` | Endpoint Backend | Ruta en `server/routes/` | Servicio en `server/services/` | Respuesta Real en Éxito | Comportamiento en Error |
|:---:|:---|:---|:---|:---|:---|:---|
| 1 | `startInstance(name)` | `POST /instances/{name}/start` | `instances.py:108` | `manager_bridge.py:340-345` | `{"status": "ok", "instance": name, "quarantined": bool, "message": str}` | HTTP 400/500 con `{"detail": str}` |
| 2 | `stopInstance(name)` | `POST /instances/{name}/stop` | `instances.py:119` | `manager_bridge.py:380` | `{"status": "ok", "message": f"Instancia '{name}' detenida"}` | HTTP 400/500 con `{"detail": str}` |
| 3 | `restartInstance(name)` | `POST /instances/{name}/restart` | `instances.py:130` | `manager_bridge.py:389` | `{"status": "ok", "instance": name, "quarantined": bool, "message": str}` (invoca `start_instance_async`) | HTTP 400/500 con `{"detail": str}` |
| 4 | `deleteInstance(name)` | `DELETE /instances/{name}` | `instances.py:90` | `manager_bridge.py:558` | `{"status": "ok", "instance": name, "message": "Instancia eliminada correctamente"}` | HTTP 500 con `{"detail": str}` |
| 5 | `setInstanceLocation(name, payload)` | `POST /locations/instances/{name}` | `locations.py:176` | `schemas.py:143-150` (`LocationResponse`) | `{"status": "ok", "instance": name, "applied_live": bool, "is_live_query": bool, "running": bool, "location": LocationSchema}` | HTTP 404/422/400 con `{"detail": str}` |
| 6 | `batchQuarantine(instances)` | `POST /network/batch-quarantine` | `network.py:170` | `network.py:172-179` | `{"results": [{"instance": str, "status": "ok"\|"error", "state"?: str, "error"?: str}]}` | Siempre 200 con resultados parciales en el array |
| 7 | `sendTap(name, x, y)` | `POST /instances/{name}/input/tap` | `instances.py:207` | `manager_bridge.py:840` | `{"status": "ok", "action": "tap", "x": int, "y": int}` | HTTP 400 con `{"detail": str}` |
| 8 | `sendSwipe(name, x1, y1, x2, y2, dur)` | `POST /instances/{name}/input/swipe` | `instances.py:216` | `manager_bridge.py:849` | `{"status": "ok", "action": "swipe", "from": [x1, y1], "to": [x2, y2], "duration_ms": int}` | HTTP 400 con `{"detail": str}` |
| 9 | `sendKey(name, key)` | `POST /instances/{name}/input/key` | `instances.py:225` | `manager_bridge.py:875` | `{"status": "ok", "action": "key", "key": key, "keycode": str}` | HTTP 400 con `{"detail": str}` |
| 10 | `sendText(name, text)` | `POST /instances/{name}/input/text` | `instances.py:234` | `manager_bridge.py:887` | `{"status": "ok", "action": "text", "length": int}` | HTTP 400 con `{"detail": str}` |
| 11 | `launchUrl(name, url)` | `POST /instances/{name}/launch-url` | `instances.py:243` | `manager_bridge.py:902` | `{"status": "ok", "action": "launch_url", "url": clean_url}` | HTTP 400 con `{"detail": str}` |

##### Definición de Tipos TypeScript Propuestos para `src/types.ts`:
```typescript
// Contratos de ciclo de vida (server/services/manager_bridge.py:340, 380, 558)
export interface StartInstanceResult {
  status: 'ok';
  instance: string;
  quarantined: boolean;
  message: string;
}

export interface StopInstanceResult {
  status: 'ok';
  message: string;
}

export type RestartInstanceResult = StartInstanceResult;

export interface DeleteInstanceResult {
  status: 'ok';
  instance: string;
  message: string;
}

// Contrato de geolocalización (server/models/schemas.py:143-150)
export interface LocationMutationResponse {
  status: string;
  instance: string;
  applied_live: boolean;
  is_live_query: boolean;
  running: boolean;
  location: LocationData;
}

// Contrato de cuarentena por lotes (server/routes/network.py:170-179)
export interface BatchQuarantineItem {
  instance: string;
  status: 'ok' | 'error';
  state?: string;
  error?: string;
}

export interface BatchQuarantineResponse {
  results: BatchQuarantineItem[];
}

// Contratos de interacción táctil y hardware (server/services/manager_bridge.py:840-902)
export interface InputTapResult {
  status: 'ok';
  action: 'tap';
  x: number;
  y: number;
}

export interface InputSwipeResult {
  status: 'ok';
  action: 'swipe';
  from: [number, number];
  to: [number, number];
  duration_ms: number;
}

export interface InputKeyResult {
  status: 'ok';
  action: 'key';
  key: string;
  keycode: string;
}

export interface InputTextResult {
  status: 'ok';
  action: 'text';
  length: number;
}

export interface LaunchUrlResult {
  status: 'ok';
  action: 'launch_url';
  url: string;
}
```

---

#### 3. Hallazgos Adicionales y Correcciones al Contrastar con el Backend

Al contrastar exhaustivamente el código del servidor con el cliente, se descubrieron dos inconsistencias concretas en el frontend:

##### (a) Error de serialización en excepciones HTTP 422 de FastAPI (`api.ts:31-43`):
- **Código en `web/src/lib/api.ts:31`:**
  ```typescript
  async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      let errorDetail = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        errorDetail = data.detail || data.message || errorDetail;
      } catch {}
      throw new Error(errorDetail);
    }
    return res.json();
  }
  ```
- **Problema en servidor:** Cuando FastAPI lanza una validación fallida (HTTP 422), `detail` **no es un string, sino una lista de objetos JSON**: `{"detail": [{"loc": ["body", "port"], "msg": "Input should be less than or equal to 65535", "type": "less_than_equal"}]}`.
- **Consecuencia en cliente:** `errorDetail` recibe el array de objetos. Al invocar `new Error(errorDetail)`, JavaScript convierte el array llamando a `toString()`, lo que arroja el mensaje confuso **`Error: [object Object]`** en los toasts de error del panel web.
- **Solución recomendada:** Formatear los errores 422 en `handleResponse`:
  ```typescript
  if (Array.isArray(data.detail)) {
    errorDetail = data.detail.map((e: { msg?: string; loc?: string[] }) => e.msg || JSON.stringify(e)).join(', ');
  } else if (typeof data.detail === 'string') {
    errorDetail = data.detail;
  }
  ```

##### (b) Tipado incompleto de `RotateIpResult` (`types.ts:232`):
- **Definición en frontend (`web/src/types.ts:232`):**
  ```typescript
  export interface RotateIpResult {
    status?: string;
    new_ip: string;
  }
  ```
- **Respuesta real en backend (`server/services/usb_network_service.py:868-875`):**
  ```python
  return {
      "status": "ok",
      "instance": instance_name,
      "state": "CONNECTED_USB",
      "old_ip": old_ip,
      "new_ip": new_ip,
      "serial": serial,
  }
  ```
- **Consecuencia:** Nota informativa de contrato; la UI actual no consume `old_ip` ni `serial` en sus toasts.

---

### 8.9 Revisión Crítica de la Sección 8.8 (Tercera Pasada)

En esta pasada se contrastaron las observaciones P1–P6 del revisor contra el código real del frontend y backend, verificando llamadores, contratos de respuesta y comportamiento ante fallos parciales.

---

#### 1. Tabla de Evaluación de Observaciones (P1 a P6)

| Obs | Asunto | Veredicto | Evidencia Real (`archivo:línea`) | Razonamiento Técnico | Decisión en el Informe |
|:---|:---|:---:|:---|:---|:---|
| **P1** | Conclusión de HALL-14 absoluta vs carpetas en disco | **CONFIRMADO** | `server/db/instance_store.py:417-434` (`sync_from_disk` itera `d.name` sin regex); ext4 permite cualquier byte salvo `/` y `\0`. | El revisor tiene razón. La conclusión anterior decía "no existe ningún escenario", lo cual era técnicamente inexacto. Aunque la API y el CLI impiden crear nombres con espacios, `#` o `?`, un administrador puede crear carpetas manuales en `instances/` que `sync_from_disk` cargará a SQLite. En ese caso, un nombre con espacios o `#` sí rompería la URL REST en el frontend. | **CORREGIDO**: se reescribe como "improbable por la vía normal; posible con carpetas manuales en disco o migraciones". La severidad se mantiene en **BAJO / OPORTUNIDAD DEFENSIVA**. |
| **P2** | Descarte de retornos en los 15 llamadores de HALL-10 | **CONFIRMADO** | Búsqueda exhaustiva en `src/`: 15 llamadores en `DeviceControlRail.tsx:174,177,194,207,225,356,374`, `InteractiveScreen.tsx:117,133,155,158`, `DeviceCard.tsx:136`, `FocusView.tsx:241`, `CustomLocationsManager.tsx:675`, `BulkBar.tsx:221`. | El revisor tiene razón. Los 15 llamadores ejecutan `await api.X(...)` descartando el valor de retorno. Ningún componente lee los campos devueltos por estas funciones. Por tanto, tiparlas no previene errores en el código actual (con la excepción de `batchQuarantine`, donde ignorar el retorno oculta fallos reales). | **HALL-10 RECLASIFICADO** de MEDIO a **BAJO / OPORTUNIDAD**. Se prioriza tipar únicamente lo que el frontend consume o debe validar. |
| **P3** | Bug de falso éxito en `batchQuarantine` de `BulkBar.tsx` | **CONFIRMADO** | `server/routes/network.py:170-179` (captura excepciones por instancia y responde HTTP 200 con `results: [{"status": "error"}]`); `BulkBar.tsx:221-223` (`await api.batchQuarantine(...)` sin revisar el array). | El revisor descubrió un bug real. Si la cuarentena de 3 terminales falla en el servidor, el backend devuelve HTTP 200 con `results` conteniendo errores. Como el HTTP status es 200, el frontend no entra al `catch` y emite `toast.success("3 CloudPhones puestos en cuarentena segura")`, engañando al operador. En cambio, `handleBatchClaim` en el mismo archivo sí maneja fallos parciales. | **NUEVO HALLAZGO: HALL-17 [MEDIO]** con tipo COMPROBADO y asignación a Etapa 3 del plan de refactorización. |
| **P4** | Fragilidad de literales `status: 'ok'` y ausencia de `response_model` | **CONFIRMADO** | `server/routes/instances.py:108,119,130,207,216,225,234,243` declaran `response_model=Dict[str, Any]`; `server/routes/network.py:170` no declara `response_model`. Solo `locations.py:176` usa `LocationResponse`. | El revisor tiene razón. Salvo `LocationResponse`, el backend no valida sus respuestas con esquemas estrictos de Pydantic. Fijar literales rígidos `status: 'ok'` o tuplas estrechas en TypeScript es frágil si el servidor amplía sus estados en el futuro. | **AJUSTADO**: se flexibilizan los tipos a `status: string` o `'ok' | string` y se documenta qué endpoints carecen de `response_model`. |
| **P5** | Relevancia de campos extras en `RotateIpResult` | **CONFIRMADO** | `FocusView.tsx:333`, `DeviceControlRail.tsx:302`, `UsbNetworkCenter.tsx:142`: todos los consumidores hacen únicamente `${res.new_ip}`. | El revisor tiene razón. Ningún componente lee `old_ip`, `serial`, `state` ni `instance`. Agregar esos campos al tipo era un ejercicio de completitud académica sin impacto funcional. | **DEGRADADO A NOTA INFORMATIVA** sin estatus de problema en la matriz. |
| **P6** | Actualización de matriz, asignación de etapas e IDs | **CONFIRMADO** | Revisión de IDs y cronograma de etapas. | El revisor tiene razón. El bug de parseo de errores 422 de FastAPI y el bug de cuarentena parcial deben tener IDs formales (HALL-16 y HALL-17), severidad explícita y asignación de etapa. | **ACTUALIZADO**: se formalizan HALL-16 y HALL-17 en la matriz 8.5 y se integran en las Etapas 1 y 3 del plan (ver más abajo). |

---

#### 2. Formalización de Nuevos Hallazgos de Backend-Frontend

##### [MEDIO] HALL-16: Bug de serialización en excepciones HTTP 422 de FastAPI (`api.ts:31-40`)
- **Archivos:** `web/src/lib/api.ts:31-40` y `server/models/schemas.py:268,278`
- **Problema:** Cuando el backend rechaza una petición por fallo de validación de Pydantic (HTTP 422), el cuerpo JSON contiene `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}`. La función `handleResponse` hace:
  ```typescript
  errorDetail = data.detail || data.message || errorDetail;
  throw new Error(errorDetail);
  ```
  Al ser `data.detail` un array de objetos, la conversión implícita a string en `new Error` produce **`Error: [object Object]`** en la interfaz de usuario.
- **Consecuencia:** Si un usuario ingresa un puerto fuera de rango (ej. 70000) o un nombre inválido en la creación, el toast muestra un mensaje ininteligible en lugar de la causa real ("Input should be less than or equal to 65535").
- **Tipo:** COMPROBADO.
- **Esfuerzo:** Bajo (4 líneas en `api.ts`).
- **Etapa Asignada:** **Etapa 1** (Resiliencia y Correcciones Rápidas).

##### [MEDIO] HALL-17: Falso éxito en cuarentena por lotes (`BulkBar.tsx:221-223`)
- **Archivos:** `web/src/components/grid/BulkBar.tsx:217-229` y `server/routes/network.py:170-179`
- **Problema:** `POST /api/v1/network/batch-quarantine` procesa instancias individualmente, captura sus excepciones en un bloque `try/except` y devuelve siempre código HTTP 200 con una lista de resultados:
  ```json
  {"results": [{"instance": "phone-01", "status": "error", "error": "Contenedor no responde"}]}
  ```
  En `BulkBar.tsx:221-223`:
  ```typescript
  await api.batchQuarantine(selectedNames);
  toast.success(`${count} CloudPhones puestos en cuarentena segura`, { id: toastId });
  ```
  Como el backend responde con HTTP 200, `api.batchQuarantine` no lanza ninguna excepción. El frontend emite un toast de éxito afirmando que todas las instancias fueron aisladas, incluso si todas fallaron en el backend.
- **Consecuencia:** Desinformación crítica para el operador: asume que terminales con posibles fugas de IP o problemas de red quedaron aislados cuando siguen activos o en estado inconsistente.
- **Tipo:** COMPROBADO.
- **Esfuerzo:** Bajo (analizar el array `results` devuelto y bifurcar con `toast.warning` / `toast.error`, replicando la lógica existente en `handleBatchClaim`).
- **Etapa Asignada:** **Etapa 3** (Saneamiento de Efectos y Acciones por Lote).

---

#### 3. Matriz de Hallazgos Definitiva (Post-Revisión 8.9)

| ID | Hallazgo | Ubicación | Severidad | Esfuerzo | Tipo | Etapa Asignada |
|:---|:---|:---|:---:|:---:|:---:|:---:|
| **HALL-01** | Monolito de 2397 líneas con 47 `useState` | `CustomLocationsManager.tsx` | **ALTO** | Alto | COMPROBADO | Etapa 2 |
| **HALL-02** | 14 casos de `set-state-in-effect` (antipatrones vs legítimos) | 12 archivos | **ALTO** | Medio | COMPROBADO | Etapa 3 |
| **HALL-03** | 4 componentes >900 líneas con múltiples responsabilidades | `UsbNetworkCenter`, `FocusView`, `FileExplorer`, `CreateDeviceModal` | **ALTO** | Alto | COMPROBADO | Etapa 2 |
| **HALL-04** | Elementos interactivos sin accesibilidad de teclado (desacoplar de riel) | `DeviceCard`, `PhoneScreen`, `DeviceControlRail` | **ALTO** | Medio | COMPROBADO | Etapa 4 |
| **HALL-05** | Configuración de Oxlint subutilizada | `.oxlintrc.json` | **ALTO** | Bajo | COMPROBADO | Etapa 1 |
| **HALL-06** | Acceso a ref en función de limpieza de `useEffect` | `MapPicker.tsx:414` | **BAJO** | Bajo | OPORTUNIDAD | Etapa 1 |
| **HALL-07** | Inputs sin `<label htmlFor="...">` asociado | `CreateDeviceModal`, `UsbNetworkCenter`, etc. | **MEDIO** | Bajo | COMPROBADO | Etapa 4 |
| **HALL-08** | Duplicación de subcomponentes `IconBtn` y `BarBtn` | `FileExplorer.tsx` | **MEDIO** | Bajo | COMPROBADO | Etapa 2 |
| **HALL-09** | ~~Supuesta obsolescencia de `InteractiveScreen`~~ | `FocusView.tsx`, `InteractiveScreen.tsx` | — | — | — | **ELIMINADO** (Decisión deliberada) |
| **HALL-10** | Tipado `Promise<unknown>` en 11 funciones cuyos retornos se descartan | `src/lib/api.ts` | **BAJO** | Bajo | OPORTUNIDAD | Etapa 1 |
| **HALL-11** | Uso de `autoFocus` invasivo en popovers | `DeviceControlRail`, `BulkBar`, `FileExplorer` | **MEDIO** | Bajo | COMPROBADO | Etapa 4 |
| **HALL-12** | Discrepancia documental de color en README | `README.md` vs `index.css` | **BAJO** | Bajo | COMPROBADO | Etapa 4 |
| **HALL-13** | Ausencia de Error Boundaries en raíz y rutas lazy (Pantalla blanca) | `main.tsx`, `App.tsx:345` | **ALTO** | Medio | COMPROBADO | Etapa 1 |
| **HALL-14** | Falta de `encodeURIComponent` en rutas REST (riesgo en carpetas manuales) | `src/lib/api.ts` | **BAJO** | Bajo | OPORTUNIDAD | Etapa 1 |
| **HALL-15** | Carrera post-`await` en `configureDecoder` de WebCodecs | `src/lib/scrcpy/useScrcpyStream.ts:514` | **MEDIO** | Bajo | COMPROBADO | Etapa 1 |
| **HALL-16** | **NUEVO:** Parseo fallido de errores HTTP 422 de FastAPI (`[object Object]`) | `src/lib/api.ts:31-40` | **MEDIO** | Bajo | COMPROBADO | Etapa 1 |
| **HALL-17** | **NUEVO:** Falso éxito en `batchQuarantine` ante fallos parciales del backend | `src/components/grid/BulkBar.tsx:221-223` | **MEDIO** | Bajo | COMPROBADO | Etapa 3 |

---

#### 4. Ajustes Concretos en el Plan de Refactorización

- **En la Etapa 1 (Tooling, Tipos, Resiliencia y Correcciones Rápidas):**
  - Se añade la corrección inmediata de `handleResponse` en `api.ts` para deserializar arrays de errores 422 de FastAPI (HALL-16).
  - Se añade la definición flexible de contratos en `src/types.ts` (`status: string`, admitiendo evolución del backend sin literales frágiles) para las funciones de `api.ts` (HALL-10).
  - Se mantiene la incorporación de `RootErrorBoundary` (HALL-13) y la guarda de carrera en WebCodecs (HALL-15).
- **En la Etapa 3 (Saneamiento de Efectos y Acciones por Lote):**
  - Se añade la corrección de `handleBatchQuarantine` en `BulkBar.tsx` (HALL-17), consumiendo el tipo `BatchQuarantineResponse` devuelto por el backend, contabilizando ítems con `status: 'error'` y mostrando `toast.warning` o `toast.error` con la cantidad exacta de fallos.

---

#### 5. Autocrítica del Auditor (Tercera Pasada)

1. **Afirmación Dogmática de "Cero Escenarios" (P1):** Al verificar que la API REST y el CLI tenían regex estricta, se concluyó apresuradamente que era imposible tener nombres anómalos, pasando por alto que `sync_from_disk()` lee directamente carpetas del sistema de archivos sin validar contra `INSTANCE_NAME_RE`.
2. **Evaluación de Tipos sin Mirar el Uso Real (P2):** Se clasificó el tipado de 11 funciones como severidad MEDIO sin haber comprobado antes si los llamadores usaban los valores de retorno. El hecho de que los 15 llamadores descartaran el retorno reduce el impacto a una mejora de calidad contractual (BAJO), excepto en `batchQuarantine`.
3. **Punto Ciego de Cuarentena Parcial (P3):** Se documentó en la tabla de 8.8 que `batchQuarantine` respondía HTTP 200 con resultados mixtos, pero no se conectó ese hallazgo del servidor con el código de `BulkBar.tsx` que asumía éxito ciego. El revisor identificó correctamente ese puente entre backend y frontend.

---

### 8.10 Revisión Crítica de la Cuarta Pasada (Ajuste Fino de Premisas y Foco de Ejecución)

En esta cuarta iteración se verificaron las hipótesis Q1 a Q6 contra el código real de `src/lib/scrcpy/useScrcpyStream.ts`, `src/components/network/UsbNetworkCenter.tsx`, `src/components/farm/ScrcpyLiveScreen.tsx`, `src/components/focus/FocusView.tsx`, y la semántica estándar de `fetch` / WHATWG URL.

---

#### 1. Tabla de Evaluación de Observaciones (Q1 a Q6)

| Obs | Asunto | Veredicto | Evidencia Real (`archivo:línea`) | Razonamiento Técnico | Decisión en el Informe |
|:---|:---|:---:|:---|:---|:---|
| **Q1** | Severidad y consecuencia real de HALL-15 (`configureDecoder`) | **CONFIRMADO** | `useScrcpyStream.ts:506-530` (ambas llamadas a `configure` están dentro de bloques `try/catch`); `useScrcpyStream.ts:353` (`if (!active || reconnectTimerRef.current) return`). | El revisor tiene razón. Si `decoder.close()` corre en desmontaje, la llamada posterior a `decoder.configure()` es atrapada por el `try/catch`. No arroja una excepción no capturada ni colapsa la app: simplemente emite un `console.error` en la consola del navegador, y `scheduleReconnect` aborta de inmediato porque `!active` es true. | **HALL-15 RECLASIFICADO** de MEDIO a **BAJO / OPORTUNIDAD**. Se corrige la consecuencia: no es un crash, sino un error espurio de consola al desmontar. |
| **Q2** | Frecuencia de renders reales del countdown (HALL-02 #9) | **CONFIRMADO** | `UsbNetworkCenter.tsx:108` (`remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))`); semántica `Object.is` de React `useState`. | El revisor tiene razón. Aunque el `setInterval` corre cada 250 ms, `remaining` evalúa al mismo número entero de segundos durante 4 ticks consecutivos. React compara con `Object.is` y aborta el render (*bail-out*) cuando el valor es idéntico. Se produce solo **~1 render por segundo** y únicamente durante los 5 s de la oferta pendiente. | **HALL-02 #9 CORREGIDO**: se elimina la afirmación de "4 renders/segundo". La extracción a `CountdownRing` se mantiene como buena práctica de colocación, pero con impacto real de ~5 renders por evento. |
| **Q3** | Rigor métrico del bundle y fragilidad de `manualChunks` | **CONFIRMADO** | Suma de breakdown anterior: 140+45+40+35+150 = 410 KB vs 451.26 KB reales; naturaleza de `lucide-react` (1400+ iconos). | El revisor tiene razón. Los números anteriores eran una estimación orientativa y no una medición exacta con visualizador. Además, configurar `manualChunks` en Vite 8 para agrupar `lucide-react` puede romper el tree-shaking e inflar el bundle. Proponerlo como obligatorio viola la regla de "no optimizar sin evidencia". | **CORREGIDO**: se etiqueta el desglose explícitamente como **estimación orientativa** y `manualChunks` se degrada a **OPORTUNIDAD OPCIONAL**, retirándose de las tareas obligatorias del plan. |
| **Q4** | Conflicto de teclado entre `DeviceCard` y `ScrcpyLiveScreen` | **CONFIRMADO** | `ScrcpyLiveScreen.tsx:80-84` (`canvasRef.current.focus()`), `ScrcpyLiveScreen.tsx:112-142` (captura `Enter`, `Tab` y alfanuméricas para enviarlas a Android). | El revisor tiene razón. Si se pone `tabIndex={0}` con `Enter/Space` en la superficie de la pantalla para seleccionar la tarjeta, cuando el usuario active el live stream, el canvas de `ScrcpyLiveScreen` tomará el foco y capturará `Enter`/`Tab` para Android. Si un usuario por teclado solo quiere seleccionar tarjetas para la `BulkBar`, no debe disparar el stream en vivo a 30 FPS. | **HALL-04 REVISADO**: se descarta capturar `Enter/Space` en la pantalla. Se define un **control de selección accesible dedicado** en el badge de índice de slot (`<button role="checkbox" aria-label="Seleccionar...">`), separando limpiamente la selección masiva de la emulación de video. |
| **Q5** | Mapeo de los 14 casos de `set-state-in-effect` y `key` en `FocusView` | **CONFIRMADO** | `FocusView.tsx:152-181` (comentario de código documenta explícitamente que el efecto preserva la selección de usuario frente a polling); `App.tsx:142` (bail-out confirmado). | El revisor tiene razón. Poner `key={instance.instance_name}` en `FocusView` desmontaría todo el componente, reseteando la pestaña activa (`gps`/`proxy`/`salud`), el reporte de auditoría y los formularios en edición. El caso #13 es deliberado y legítimo para mantener el contexto del operador. Además, el caso #1 es benigno y no debe tocarse. | **CORREGIDO**: se mapean formalmente los 14 casos (ver 8.10.2). Se descartan intervenciones en #1 y #13, y se asignan rigurosamente los casos reales restantes (#2, #5, #6, #7, #8, #9, #10, #11, #12, #14). |
| **Q6** | Caracteres que realmente rompen URLs en `fetch` (HALL-14) | **CONFIRMADO** | Prueba con `new URL('/api/v1/instances/phone 1')` -> produce `/api/v1/instances/phone%201`. En cambio, `phone#1` produce path `/api/v1/instances/phone` (trunca el resto como hash) y `phone?1` lo convierte en query string. | El revisor tiene razón. La especificación WHATWG URL usada por `fetch` autocodifica espacios a `%20`. Los caracteres que realmente corrompen la ruta REST sin codificar son `#` (trunca la ruta en el cliente antes de enviar el paquete HTTP), `?` (bifurca hacia query string) y `%` (ambigüedad de decodificación). | **HALL-14 CORREGIDO**: se sustituye el ejemplo erróneo de espacios por los caracteres reales de rotura (`#`, `?`, `%`). |

---

#### 2. Mapeo Exhaustivo y Definitivo de los 14 Casos de `set-state-in-effect` (HALL-02)

Para cerrar cualquier ambigüedad en el plan de refactorización, se auditan y asignan los 14 casos individualmente:

| # | Archivo:Línea | Estado | Diagnóstico Verificado | Decisión de Plan |
|:---:|:---|:---|:---|:---:|
| 1 | `App.tsx:140` | `selectedNames` | Purga defensiva con bail-out por `Object.is`. 0 renders extra nominales. | **DESCARTADO** (No tocar: regla de no optimizar sin evidencia). |
| 2 | `ApkFileManager.tsx:27` | `tab` | `useEffect` redundante que replica la inicialización de `initialTab`. | **Etapa 2** (Eliminar efecto; inicializar en `useState`). |
| 3 | `InteractiveScreen.tsx:55` | `currentFrame` | Limpieza de fotogramas del bucle de captura canvas/JPEG. | **CONSERVAR** (Uso legítimo de sincronización con sistema externo). |
| 4 | `useScrcpyStream.ts:296` | `status` | Fija estado `'idle'` cuando el streaming está inactivo. | **CONSERVAR** (Uso legítimo de máquina de estados WebCodecs). |
| 5 | `BulkBar.tsx:72` | `apks` | Fetch manual de catálogo en popover sin caché. | **Etapa 3** (Migrar a `useQuery({ queryKey: ['apks'] })`). |
| 6 | `DeviceControlRail.tsx:130` | `railApks` | Idéntico fetch manual duplicado en popover del riel. | **Etapa 3** (Migrar a `useQuery({ queryKey: ['apks'] })`). |
| 7 | `CreateDeviceModal.tsx:131` | `timezone`, etc. | Sincroniza ubicación por defecto con refs y efectos al abrir modal. | **Etapa 2** (Inicialización limpia dentro del subcomponente de wizard). |
| 8 | `ApkRepository.tsx:115` | `apks` | `fetchApks()` manual en montaje con `setLoading(true)` síncrono. | **Etapa 3** (Migrar a `useQuery({ queryKey: ['apks'] })`). |
| 9 | `UsbNetworkCenter.tsx:100` | `countdown` | Temporizador regresivo de 5s con impacto de ~1 render/s por 5s. | **Etapa 2** (Mover estado a `CountdownRing` por colocación de componentes). |
| 10 | `FileExplorer.tsx:238` | `phoneName` | Sincroniza estado local con prop `preselectedInstance`. | **Etapa 2** (Manejo no controlado / derivación en subcomponente). |
| 11 | `FileExplorer.tsx:244` | `files` | Carga de archivos por `useEffect` al cambiar de carpeta o dispositivo. | **Etapa 3** (Migrar a `useQuery(['files', phone, path])`). |
| 12 | `FileExplorer.tsx:254` | `previewContent` | Descarga de contenido de texto para lightbox. | **Etapa 3** (Aislar en subcomponente `FilePreviewModal` con `useQuery`). |
| 13 | `FocusView.tsx:159` | `mapLat`, `mapLon` | Sincroniza GPS conservando la pestaña activa y reportes de auditoría. | **CONSERVAR** (Patrón deliberado de inspector: no usar `key` destructivo). |
| 14 | `CustomLocationsManager.tsx:187` | `mapLat`, etc. | Fija coordenadas iniciales de la ubicación predeterminada general. | **Etapa 2** (Derivar coordenadas en el subcomponente `LocationsMapHero`). |

---

#### 3. Matriz Consolidada Definitiva de Hallazgos

| ID | Hallazgo | Ubicación | Severidad | Esfuerzo | Tipo | Etapa Asignada |
|:---|:---|:---|:---:|:---:|:---:|:---:|
| **HALL-01** | Monolito de 2397 líneas con 47 `useState` | `CustomLocationsManager.tsx` | **ALTO** | Alto | COMPROBADO | Etapa 2 |
| **HALL-02** | 8 casos justificados de `set-state-in-effect` a sanear (#2, #5, #6, #7, #8, #9, #11, #12) | 6 archivos | **ALTO** | Medio | COMPROBADO | Etapa 2 y 3 |
| **HALL-03** | 4 componentes >900 líneas con múltiples responsabilidades | `UsbNetworkCenter`, `FocusView`, `FileExplorer`, `CreateDeviceModal` | **ALTO** | Alto | COMPROBADO | Etapa 2 |
| **HALL-04** | Elementos interactivos sin control accesible desacoplado | `DeviceCard`, `PhoneScreen`, `DeviceControlRail` | **ALTO** | Medio | COMPROBADO | Etapa 4 |
| **HALL-05** | Configuración de Oxlint subutilizada | `.oxlintrc.json` | **ALTO** | Bajo | COMPROBADO | Etapa 1 |
| **HALL-06** | Acceso a ref de Map en limpieza de `useEffect` | `MapPicker.tsx:414` | **BAJO** | Bajo | OPORTUNIDAD | Etapa 1 |
| **HALL-07** | Inputs sin `<label htmlFor="...">` asociado | `CreateDeviceModal`, `UsbNetworkCenter`, etc. | **MEDIO** | Bajo | COMPROBADO | Etapa 4 |
| **HALL-08** | Duplicación de subcomponentes `IconBtn` y `BarBtn` | `FileExplorer.tsx` | **MEDIO** | Bajo | COMPROBADO | Etapa 2 |
| **HALL-09** | ~~Supuesta obsolescencia de `InteractiveScreen`~~ | `FocusView.tsx`, `InteractiveScreen.tsx` | — | — | — | **ELIMINADO** (Decisión deliberada) |
| **HALL-10** | Tipado `Promise<unknown>` en 11 funciones cuyos retornos se descartan | `src/lib/api.ts` | **BAJO** | Bajo | OPORTUNIDAD | Etapa 1 |
| **HALL-11** | Uso de `autoFocus` invasivo en popovers | `DeviceControlRail`, `BulkBar`, `FileExplorer` | **MEDIO** | Bajo | COMPROBADO | Etapa 4 |
| **HALL-12** | Discrepancia documental de color en README | `README.md` vs `index.css` | **BAJO** | Bajo | COMPROBADO | Etapa 4 |
| **HALL-13** | Ausencia de Error Boundaries en raíz y rutas lazy (Pantalla blanca) | `main.tsx`, `App.tsx:345` | **ALTO** | Medio | COMPROBADO | Etapa 1 |
| **HALL-14** | Falta de `encodeURIComponent` en rutas REST ante nombres con `#`, `?`, `%` | `src/lib/api.ts` | **BAJO** | Bajo | OPORTUNIDAD | Etapa 1 |
| **HALL-15** | Error espurio en consola por `configureDecoder` post-desmontaje | `src/lib/scrcpy/useScrcpyStream.ts:514` | **BAJO** | Bajo | OPORTUNIDAD | Etapa 1 |
| **HALL-16** | Parseo fallido de errores HTTP 422 de FastAPI (`[object Object]`) | `src/lib/api.ts:31-40` | **MEDIO** | Bajo | COMPROBADO | Etapa 1 |
| **HALL-17** | Falso éxito en `batchQuarantine` ante fallos parciales del backend | `src/components/grid/BulkBar.tsx:221-223` | **MEDIO** | Bajo | COMPROBADO | Etapa 3 |

---

#### 4. Plan de Refactorización Definitivo Ajustado

- **Etapa 1: Tooling, Tipos, Resiliencia y Correcciones Rápidas:**
  1. Configuración de `.oxlintrc.json` activando `jsx-a11y` y reglas seguras (desactivando reglas obsoletas de React 16).
  2. Implementación de `RootErrorBoundary` en `main.tsx` y fallback visual para `<Suspense>` en `App.tsx` (HALL-13).
  3. Corrección de `handleResponse` en `api.ts` para parsear listas de errores 422 de FastAPI (HALL-16).
  4. Guarda de seguridad `if (!active || decoder.state === 'closed') return;` en `useScrcpyStream.ts:514` para silenciar error de consola (HALL-15).
  5. Copia local de ref en `MapPicker.tsx:414` (HALL-06).
  6. Tipado flexible en `src/types.ts` y aplicación de `encodeURIComponent` defensivo en `api.ts` (HALL-10, HALL-14).
  7. Ejecución del Protocolo de Verificación Funcional Pre-Refactor (10 flujos manuales).

- **Etapa 2: Partición Modular Mecánica (Cortes Limpios sin Cambio de Lógica):**
  1. Partición de `CustomLocationsManager.tsx` (2397 líneas) en: `LocationsMapHero.tsx`, `LocationsInspector.tsx`, `LocationGroupModal.tsx` y `BatchTeleportModal.tsx`. Derivar coordenadas en `LocationsMapHero` (#14).
  2. Partición de `UsbNetworkCenter.tsx` (1373 líneas) extrayendo: `ModemInventoryTable.tsx`, `ModemInspector.tsx`, `IpLedgerTable.tsx`, `FifoQueueBar.tsx`. Mover el estado del countdown a `CountdownRing` (#9).
  3. Partición de `FocusView.tsx` (1171 líneas) extrayendo: `FocusMetadataGrid.tsx`, `FocusGpsTab.tsx`, `FocusProxyTab.tsx`, `FocusHealthTab.tsx` (conservando el ciclo de vida sin `key` destructivo, manteniendo #13).
  4. Partición de `CreateDeviceModal.tsx` (911 líneas) separando los pasos del wizard y saneando inicialización (#7).
  5. Sustituir en `FileExplorer.tsx` los botones internos por `src/components/ui/IconBtn.tsx` (HALL-08) y limpiar sincronización de #2 y #10.

- **Etapa 3: Saneamiento de Data-Fetching y Acciones por Lote:**
  1. Migrar consultas manuales de APKs en `BulkBar.tsx`, `DeviceControlRail.tsx` y `ApkRepository.tsx` a `useQuery({ queryKey: ['apks'] })` (#5, #6, #8).
  2. Migrar navegación de ficheros en `FileExplorer.tsx` a `useQuery(['files', phone, path])` (#11) y visor de texto a `FilePreviewModal` (#12).
  3. Corregir `handleBatchQuarantine` en `BulkBar.tsx` (HALL-17) para evaluar el array de resultados devuelto por el backend y alertar sobre fallos parciales.

- **Etapa 4: Accesibilidad WCAG 2.2, Ergonomía y Cierre:**
  1. Implementar control de selección accesible desacoplado en el badge de `DeviceCard.tsx` (`<button role="checkbox">`), evitando interferencias con los atajos de teclado de `ScrcpyLiveScreen.tsx` (HALL-04).
  2. Asociar etiquetas en formularios mediante `htmlFor` e `id` en `CreateDeviceModal.tsx` y tabs de `FocusView.tsx` (HALL-07).
  3. Reemplazar `autoFocus` invasivo por gestión de foco de Radix (HALL-11).
  4. Actualizar la discrepancia documental de color en `README.md` (HALL-12).

---

#### 5. Autocrítica del Auditor (Cuarta Pasada)

1. **Lectura Incompleta del Manejo de Excepciones (Q1):** Se diagnosticó que `configureDecoder` causaba un crash por `DOMException` sin verificar que el bloque `try/catch` exterior capturaba el error y que `scheduleReconnect` abortaba cuando `!active` era falso.
2. **Ignorancia del Bail-out por Valor Idéntico (Q2):** Se asumió que cada ejecución de un `setInterval` de 250 ms causaba un re-render sin notar que `setCountdown` recibía enteros redondeados por segundo, donde React aborta el render por `Object.is`.
3. **Propuesta Incompleta de Teclado (Q4):** Se propuso Enter/Space en la superficie de la pantalla para accesibilidad sin contrastar que el componente hijo `ScrcpyLiveScreen` roba el foco al canvas y captura Enter/Tab para Android.
4. **Propuesta Peligrosa de `key` (Q5):** Se sugirió `key={instance.instance_name}` en `FocusView` para evitar un efecto sin advertir que desmontaría la vista completa, reseteando pestañas activas y consolas de auditoría.
5. **Inexactitud en URL Parsers (Q6):** Se usó el espacio como ejemplo de rotura en `fetch` ignorando que el estándar WHATWG URL autocodifica espacios a `%20`, siendo `#`, `?` y `%` los verdaderos caracteres de corrupción de ruta.




