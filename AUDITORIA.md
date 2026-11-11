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

## 7. Verificación Final de la Auditoría

- **Árbol de trabajo:** Limpio, sin alteraciones en `src/`, dependencias ni configuraciones.
- **Rama activa:** `audit/frontend-quality`.
- **Archivo entregable:** `AUDITORIA.md` en la raíz del repositorio.
