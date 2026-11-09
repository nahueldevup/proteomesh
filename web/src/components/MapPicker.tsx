import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useSyncExternalStore,
} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Star } from 'lucide-react';
import { cn } from '../lib/utils';

/* ────────────────────────────────────────────────────────────────────────────
 * Utilidades
 * ──────────────────────────────────────────────────────────────────────────── */

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeColor = (color: string | undefined, fallback: string) =>
  color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback;

const isValidCoord = (lat: unknown, lon: unknown): lat is number =>
  typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon);

/** Iconos lucide (SVG inline) para el HTML de Leaflet, que no puede montar React. */
const svg = (paths: string, size = 11) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICON_MAP_PIN =
  '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>';
const ICON_STAR =
  '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>';
const ICON_PIN =
  '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>';
const ICON_PHONE = '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>';

/* ────────────────────────────────────────────────────────────────────────────
 * Tema reactivo (clase .dark/.light o atributo data-theme en <html>)
 * ──────────────────────────────────────────────────────────────────────────── */

type MapTheme = 'light' | 'dark';

const readDocumentTheme = (): MapTheme => {
  if (typeof document === 'undefined') return 'dark';
  const root = document.documentElement;
  const attr = root.getAttribute('data-theme');
  if (root.classList.contains('light') || attr === 'light') return 'light';
  if (root.classList.contains('dark') || attr === 'dark') return 'dark';
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

const subscribeDocumentTheme = (notify: () => void) => {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  const media = window.matchMedia?.('(prefers-color-scheme: light)');
  media?.addEventListener('change', notify);
  return () => {
    observer.disconnect();
    media?.removeEventListener('change', notify);
  };
};

export function useDocumentTheme(): MapTheme {
  return useSyncExternalStore(subscribeDocumentTheme, readDocumentTheme, () => 'dark');
}

// Azulejos OSM libres (sin API key). En modo oscuro se reinterpretan con un filtro CSS
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

/* ────────────────────────────────────────────────────────────────────────────
 * Tipos públicos
 * ──────────────────────────────────────────────────────────────────────────── */

export interface MapPinPhone {
  name: string;
  online: boolean;
}

export interface MapPinItem {
  id: string;
  name: string;
  lat: number;
  lon: number;
  city?: string;
  isDefault?: boolean;
  isPinned?: boolean;
  color?: string;
  groupName?: string;
  /** Teléfonos asignados físicamente a esta ubicación (se listan en el tooltip). */
  phones?: MapPinPhone[];
}

export interface MapPresetItem {
  label: string;
  lat: number;
  lon: number;
  isDefault?: boolean;
  color?: string;
  id?: string;
}

export interface MapPickerHandle {
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  fitToMarkers: () => void;
  highlight: (id: string | null) => void;
  getCenter: () => { lat: number; lon: number } | null;
}

interface MapPickerProps {
  latitude: number;
  longitude: number;
  city: string;
  onChange: (lat: number, lon: number, cityName?: string) => void;
  className?: string;
  height?: string;
  showPresets?: boolean;
  presets?: MapPresetItem[];
  markers?: MapPinItem[];
  showInfoOverlay?: boolean;
  /** Muestra el marcador arrastrable de la posición activa (default: true). */
  showActiveMarker?: boolean;
  /** Ocupa el 100% del contenedor padre en lugar de usar `height`. */
  fill?: boolean;
  /** Muestra la línea de ayuda bajo el mapa (default: true, se oculta en modo fill). */
  showHint?: boolean;
  /** Lectura en vivo de las coordenadas bajo el cursor. */
  showCursorReadout?: boolean;
  initialZoom?: number;
  selectedMarkerId?: string | null;
  /** Si se define, el clic en un pin llama a este callback en lugar de mover el marcador activo. */
  onMarkerClick?: (id: string) => void;
  /** Capas superpuestas (controles flotantes) renderizadas sobre el mapa. */
  children?: React.ReactNode;
}

/* ────────────────────────────────────────────────────────────────────────────
 * HTML de pines y tooltips
 * ──────────────────────────────────────────────────────────────────────────── */

const buildPinHtml = (m: MapPinItem, selected: boolean) => {
  const color = safeColor(m.color, '#94a3b8');
  const phones = m.phones?.length ?? 0;
  const online = m.phones?.filter((p) => p.online).length ?? 0;
  const icon = m.isDefault ? ICON_STAR : ICON_MAP_PIN;
  return `
    <div class="pm-pin" data-selected="${selected}" data-default="${!!m.isDefault}" style="--pin:${color}">
      <div class="pm-pin__chip">
        <span class="pm-pin__icon">${svg(icon)}</span>
        <span class="pm-pin__label">${escapeHtml(m.name)}</span>
        ${m.isPinned ? `<span class="pm-pin__flag">${svg(ICON_PIN, 9)}</span>` : ''}
        ${
          phones > 0
            ? `<span class="pm-pin__count" data-online="${online > 0}">${svg(ICON_PHONE, 9)}${phones}</span>`
            : ''
        }
      </div>
      <div class="pm-pin__stem"></div>
      <div class="pm-pin__dot"></div>
    </div>`;
};

const MAX_TOOLTIP_PHONES = 8;

const buildTooltipHtml = (m: MapPinItem) => {
  const color = safeColor(m.color, '#94a3b8');
  const phones = m.phones ?? [];
  const online = phones.filter((p) => p.online).length;
  const list = phones
    .slice(0, MAX_TOOLTIP_PHONES)
    .map(
      (p) => `
        <li>
          <span class="pm-tt__status" data-online="${p.online}"></span>
          <span class="pm-tt__phone">${escapeHtml(p.name)}</span>
          <span class="pm-tt__state">${p.online ? 'online' : 'offline'}</span>
        </li>`
    )
    .join('');
  const rest = phones.length - MAX_TOOLTIP_PHONES;
  return `
    <div class="pm-tt">
      <div class="pm-tt__head">
        <span class="pm-tt__swatch" style="background:${color}"></span>
        <span class="pm-tt__name">${escapeHtml(m.name)}</span>
        ${m.isDefault ? `<span class="pm-tt__badge">${svg(ICON_STAR, 9)}Predeterminada</span>` : ''}
      </div>
      <div class="pm-tt__meta">${escapeHtml(m.city || 'Sin ciudad')}${m.groupName ? ` · ${escapeHtml(m.groupName)}` : ''}</div>
      <div class="pm-tt__coords">${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}</div>
      <div class="pm-tt__section">
        <span>${svg(ICON_PHONE, 10)} Teléfonos asignados</span>
        <span>${online}/${phones.length} online</span>
      </div>
      ${
        phones.length > 0
          ? `<ul class="pm-tt__list">${list}</ul>${rest > 0 ? `<div class="pm-tt__more">y ${rest} más</div>` : ''}`
          : '<div class="pm-tt__empty">Ningún teléfono asignado</div>'
      }
    </div>`;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Componente
 * ──────────────────────────────────────────────────────────────────────────── */

export const MapPicker = forwardRef<MapPickerHandle, MapPickerProps>(function MapPicker(
  {
    latitude,
    longitude,
    city,
    onChange,
    className,
    height = '320px',
    showPresets = true,
    presets,
    markers = [],
    showInfoOverlay = true,
    showActiveMarker = true,
    fill = false,
    showHint,
    showCursorReadout = false,
    initialZoom = 12,
    selectedMarkerId = null,
    onMarkerClick,
    children,
  },
  ref
) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const pinnedMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const pinMarkersByIdRef = useRef<Map<string, L.Marker>>(new Map());
  const cursorReadoutRef = useRef<HTMLSpanElement>(null);
  const isInitializedRef = useRef(false);
  const initialPosRef = useRef({ latitude, longitude, initialZoom });
  const theme = useDocumentTheme();

  // Callbacks estables
  const onChangeRef = useRef(onChange);
  const onMarkerClickRef = useRef(onMarkerClick);
  useEffect(() => {
    onChangeRef.current = onChange;
    onMarkerClickRef.current = onMarkerClick;
  }, [onChange, onMarkerClick]);

  const handleMapClick = useCallback((lat: number, lon: number, cityName?: string) => {
    onChangeRef.current(Number(lat.toFixed(6)), Number(lon.toFixed(6)), cityName);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (lat, lon, zoom) => {
        const map = mapRef.current;
        if (!map || !isValidCoord(lat, lon)) return;
        map.flyTo([lat, lon], zoom ?? Math.max(map.getZoom(), 13), { duration: 0.6 });
      },
      fitToMarkers: () => {
        const map = mapRef.current;
        const pins = [...pinMarkersByIdRef.current.values()];
        if (!map || pins.length === 0) return;
        const bounds = L.latLngBounds(pins.map((p) => p.getLatLng()));
        map.flyToBounds(bounds.pad(0.25), { duration: 0.7, maxZoom: 14 });
      },
      highlight: (id) => {
        pinMarkersByIdRef.current.forEach((marker, markerId) => {
          const el = marker.getElement()?.querySelector('.pm-pin');
          if (el) el.setAttribute('data-hover', String(markerId === id));
          if (markerId === id) marker.setZIndexOffset(900);
          else marker.setZIndexOffset(0);
        });
      },
      getCenter: () => {
        const c = mapRef.current?.getCenter();
        return c ? { lat: c.lat, lon: c.lng } : null;
      },
    }),
    []
  );

  // Redibujar azulejos reactivamente al cambiar de tema (D6)
  useEffect(() => {
    mapRef.current?.invalidateSize();
  }, [theme]);

  // Inicializar mapa UNA sola vez
  useEffect(() => {
    if (!mapContainerRef.current || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const draftIcon = L.divIcon({
      className: 'proteomesh-marker',
      html: `
        <div class="pm-draft">
          <span class="pm-draft__ring"></span>
          <span class="pm-draft__ring pm-draft__ring--late"></span>
          <span class="pm-draft__core"></span>
        </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    const { latitude: initLat, longitude: initLon, initialZoom: zoom } = initialPosRef.current;
    const safeLat = isValidCoord(initLat, initLon) ? initLat : -34.603722;
    const safeLon = isValidCoord(initLat, initLon) ? initLon : -58.381592;

    const map = L.map(mapContainerRef.current, {
      center: [safeLat, safeLon],
      zoom,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      subdomains: 'abc',
      maxZoom: 19,
    }).addTo(map);

    const pinnedLayer = L.layerGroup().addTo(map);
    pinnedMarkersLayerRef.current = pinnedLayer;

    const marker = L.marker([safeLat, safeLon], {
      icon: draftIcon,
      draggable: true,
      zIndexOffset: 1000,
    });

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      handleMapClick(pos.lat, pos.lng);
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      handleMapClick(e.latlng.lat, e.latlng.lng);
    });

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      if (cursorReadoutRef.current) {
        cursorReadoutRef.current.textContent = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
      }
    });
    map.on('mouseout', () => {
      if (cursorReadoutRef.current) cursorReadoutRef.current.textContent = '—';
    });

    mapRef.current = map;
    markerRef.current = marker;

    const frame = requestAnimationFrame(() => map.invalidateSize());
    const timer = window.setTimeout(() => map.invalidateSize(), 300);
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      pinnedMarkersLayerRef.current = null;
      pinMarkersByIdRef.current.clear();
      isInitializedRef.current = false;
    };
  }, [handleMapClick]);

  // Mostrar / ocultar el marcador de posición activa
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    if (showActiveMarker) {
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else if (map.hasLayer(marker)) {
      map.removeLayer(marker);
    }
  }, [showActiveMarker]);

  // Renderizar pines configurados con tooltip de teléfonos asignados
  useEffect(() => {
    const layer = pinnedMarkersLayerRef.current;
    if (!mapRef.current || !layer) return;
    layer.clearLayers();
    pinMarkersByIdRef.current.clear();

    markers.forEach((m) => {
      if (!isValidCoord(m.lat, m.lon)) return;
      const selected = m.id === selectedMarkerId;
      const pinIcon = L.divIcon({
        className: 'proteomesh-pin-marker',
        html: buildPinHtml(m, selected),
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const pinMarker = L.marker([m.lat, m.lon], {
        icon: pinIcon,
        zIndexOffset: selected ? 800 : m.isDefault ? 400 : 0,
        riseOnHover: true,
      }).addTo(layer);

      pinMarker.bindTooltip(buildTooltipHtml(m), {
        direction: 'top',
        offset: [0, -40],
        opacity: 1,
        className: 'pm-tooltip',
      });

      pinMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (onMarkerClickRef.current) {
          onMarkerClickRef.current(m.id);
          return;
        }
        onChangeRef.current(m.lat, m.lon, m.name);
        if (markerRef.current && mapRef.current) {
          markerRef.current.setLatLng([m.lat, m.lon]);
          mapRef.current.setView([m.lat, m.lon], Math.max(mapRef.current.getZoom(), 12), { animate: true });
        }
      });

      pinMarkersByIdRef.current.set(m.id, pinMarker);
    });
  }, [markers, selectedMarkerId]);

  // Sincronizar coordenadas cuando cambian externamente
  useEffect(() => {
    if (!markerRef.current || !mapRef.current) return;
    if (!isValidCoord(latitude, longitude)) return;
    const currentPos = markerRef.current.getLatLng();
    if (Math.abs(currentPos.lat - latitude) > 0.0001 || Math.abs(currentPos.lng - longitude) > 0.0001) {
      markerRef.current.setLatLng([latitude, longitude]);
      mapRef.current.setView([latitude, longitude], mapRef.current.getZoom(), {
        animate: true,
        duration: 0.5,
      });
    }
  }, [latitude, longitude]);

  const handlePresetClick = (preset: MapPresetItem) => {
    onChange(preset.lat, preset.lon, preset.label);
    if (markerRef.current && mapRef.current) {
      markerRef.current.setLatLng([preset.lat, preset.lon]);
      mapRef.current.setView([preset.lat, preset.lon], 12, { animate: true });
    }
  };

  const activePresets = presets || [];
  const hintVisible = showHint ?? !fill;

  return (
    <div className={cn('relative w-full', fill ? 'h-full min-h-0 min-w-0' : 'space-y-2')}>
      {showPresets && activePresets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activePresets.map((p) => {
            const active = Math.abs(latitude - p.lat) < 0.01 && Math.abs(longitude - p.lon) < 0.01;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => handlePresetClick(p)}
                className={cn(
                  'flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] transition-all cursor-pointer',
                  active
                    ? 'border-success/40 bg-success/15 font-medium text-success'
                    : 'border-border bg-surface text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
                )}
              >
                {p.isDefault && <Star className="size-2.5 fill-current text-warning" />}
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div
        data-map-theme={theme}
        className={cn('pm-map relative z-0', fill ? 'h-full w-full min-h-0 min-w-0 overflow-hidden' : className || 'overflow-hidden rounded-lg border border-border')}
        style={fill ? undefined : { height }}
      >
        <div ref={mapContainerRef} className="h-full w-full" style={{ isolation: 'isolate' }} />

        {showCursorReadout && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-[30] flex items-center gap-1.5 rounded-md border border-border bg-popover/90 px-2 py-1 font-mono text-[10px] text-muted-foreground shadow-pop backdrop-blur-md">
            <Navigation className="size-3 text-primary" />
            <span ref={cursorReadoutRef} className="tabular-nums text-foreground">
              —
            </span>
          </div>
        )}

        {children}
      </div>

      {showInfoOverlay && (
        <div className="pointer-events-none absolute left-2 top-10 z-[10] flex items-center gap-1.5 rounded-md border border-border bg-surface/90 px-2.5 py-1 text-[11px] text-foreground shadow-lg backdrop-blur-md">
          <MapPin className="h-3 w-3 text-primary" />
          <span className="max-w-[140px] truncate font-medium">{city || 'Ubicación fijada'}</span>
          <span className="font-mono text-muted-foreground">
            {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </span>
        </div>
      )}

      {hintVisible && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Navigation className="h-2.5 w-2.5" />
          <span>Hacé clic en el mapa o arrastrá el marcador para fijar coordenadas GPS</span>
        </div>
      )}
    </div>
  );
});
