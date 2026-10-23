# ProteoMesh CloudPhone Platform — Frontend Web Panel

Panel web de administración estilo GeeLark con diseño minimalista, alto rendimiento y cero emojis (iconografía SVG profesional con Lucide).

## Características

- **Gestor de Flota de CloudPhones:** Lista en tiempo real de instancias con estado Docker, hardware asignado, ciudad, IP y acciones de inicio/parada.
- **Selector Visual de Mapa (Leaflet + OpenStreetMap):** Mapa interactivo en tema oscuro con chincheta arrastrable y cálculo automático de latitud, longitud y ciudad.
- **Aprovisionamiento Fidedigno:** Selector de 17 modelos de hardware oficiales (Samsung, Xiaomi, Motorola, Google) y operadoras telefónicas internacionales.
- **Verificador y Asignador de Proxies:** Prueba en vivo de proxies residenciales (SOCKS5/HTTP) con medición de latencia en milisegundos y auto-sincronización geográfica.
- **Drawer de Control Detallado:** Vista profunda de identificadores GSMA/IEEE (IMEI Luhn, MACs, Seriales), ajuste de GPS en caliente y ejecución de los 7 checks de salud.

## Tecnologías

- **React 19 + TypeScript + Vite 8**
- **Tailwind CSS v4** (compilación nativa ultra-rápida `@tailwindcss/vite`)
- **Leaflet** (mapas interactivos con azulejos CartoDB Dark Matter)
- **Lucide React** (iconos SVG de alta definición)

## Desarrollo local

```bash
cd web
npm install
npm run dev
```

El servidor de desarrollo correrá en `http://localhost:5173` y reenviará automáticamente las peticiones de `/api` al backend FastAPI en el puerto `8000`.

## Compilación de producción

```bash
npm run build
```

Genera los archivos estáticos optimizados en `web/dist` (peso total: ~125 kB gzipped).
