import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation } from 'lucide-react';

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeColor = (color: string | undefined, fallback: string) =>
  color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback;

export interface MapPinItem {
  id: string;
  name: string;
  lat: number;
  lon: number;
  city?: string;
  isDefault?: boolean;
  color?: string;
}

export interface MapPresetItem {
  label: string;
  lat: number;
  lon: number;
  isDefault?: boolean;
  color?: string;
  id?: string;
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
}

export const MapPicker: React.FC<MapPickerProps> = ({
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
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const pinnedMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const isInitializedRef = useRef(false);
  const initialPosRef = useRef({ latitude, longitude });

  // Callback estable para onChange
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const handleMapClick = useCallback((lat: number, lon: number, cityName?: string) => {
    onChangeRef.current(
      Number(lat.toFixed(6)),
      Number(lon.toFixed(6)),
      cityName
    );
  }, []);

  // Inicializar mapa UNA sola vez
  useEffect(() => {
    if (!mapContainerRef.current || isInitializedRef.current) return;
    isInitializedRef.current = true;

    // Icono personalizado en verde esmeralda con pulso (ProteoMesh)
    const customIcon = L.divIcon({
      className: 'proteomesh-marker',
      html: `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:36px;height:36px;">
          <div style="position:absolute;width:32px;height:32px;background:rgba(16,185,129,0.25);border-radius:50%;animation:pm-pulse 2s ease-out infinite;"></div>
          <div style="position:absolute;width:20px;height:20px;background:rgba(16,185,129,0.15);border-radius:50%;animation:pm-pulse 2s ease-out infinite 0.3s;"></div>
          <div style="position:relative;width:12px;height:12px;background:#10b981;border:2.5px solid #ffffff;border-radius:50%;box-shadow:0 0 12px rgba(16,185,129,0.7);"></div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    const { latitude: initLat, longitude: initLon } = initialPosRef.current;
    const safeLat = typeof initLat === 'number' && !isNaN(initLat) ? initLat : -34.603722;
    const safeLon = typeof initLon === 'number' && !isNaN(initLon) ? initLon : -58.381592;

    const map = L.map(mapContainerRef.current, {
      center: [safeLat, safeLon],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    // Zoom en esquina inferior derecha
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Tiles libres OpenStreetMap (sin API Key, estilizados en oscuro por CSS)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      subdomains: 'abc',
      maxZoom: 19,
    }).addTo(map);

    // Capa de pines configurados por el usuario
    const pinnedLayer = L.layerGroup().addTo(map);
    pinnedMarkersLayerRef.current = pinnedLayer;

    // Marcador arrastrable (posición activa)
    const marker = L.marker([safeLat, safeLon], {
      icon: customIcon,
      draggable: true,
      zIndexOffset: 1000,
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      handleMapClick(pos.lat, pos.lng);
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      handleMapClick(e.latlng.lat, e.latlng.lng);
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
      isInitializedRef.current = false;
    };
  }, [handleMapClick]); // Solo se ejecuta al montar

  // Renderizar pines configurados en el mapa
  useEffect(() => {
    if (!mapRef.current || !pinnedMarkersLayerRef.current) return;
    pinnedMarkersLayerRef.current.clearLayers();

    markers.forEach((m) => {
      if (typeof m.lat !== 'number' || typeof m.lon !== 'number' || isNaN(m.lat) || isNaN(m.lon)) return;
      const color = m.isDefault ? '#f59e0b' : safeColor(m.color, '#10b981');
      const pinIcon = L.divIcon({
        className: 'proteomesh-pin-marker',
        html: `
          <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.6));">
            <div style="display:flex;align-items:center;gap:3px;background:rgba(15,23,42,0.92);color:#f8fafc;padding:2px 6px;border-radius:4px;font-size:10px;font-family:monospace;border:1px solid ${color};white-space:nowrap;font-weight:600;">
              <span style="font-size:10px;">${m.isDefault ? '⭐' : '📍'}</span>
              <span>${escapeHtml(m.name)}</span>
            </div>
            <div style="width:2px;height:6px;background:${color};"></div>
            <div style="width:6px;height:6px;border-radius:50%;background:${color};box-shadow:0 0 4px ${color};"></div>
          </div>
        `,
        iconSize: [100, 34],
        iconAnchor: [50, 32],
      });

      const pinMarker = L.marker([m.lat, m.lon], { icon: pinIcon }).addTo(pinnedMarkersLayerRef.current!);
      pinMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onChangeRef.current(m.lat, m.lon, m.name);
        if (markerRef.current && mapRef.current) {
          markerRef.current.setLatLng([m.lat, m.lon]);
          mapRef.current.setView([m.lat, m.lon], Math.max(mapRef.current.getZoom(), 12), { animate: true });
        }
      });
    });
  }, [markers]);

  // Sincronizar coordenadas cuando cambian externamente
  useEffect(() => {
    if (!markerRef.current || !mapRef.current) return;
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || isNaN(latitude) || isNaN(longitude)) return;
    const currentPos = markerRef.current.getLatLng();
    if (
      Math.abs(currentPos.lat - latitude) > 0.0001 ||
      Math.abs(currentPos.lng - longitude) > 0.0001
    ) {
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

  return (
    <div className="relative w-full space-y-2">
      {/* Presets rápidos dinámicos (solo si se pasan explícitamente) */}
      {showPresets && activePresets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activePresets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => handlePresetClick(p)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all flex items-center gap-1 ${
                Math.abs(latitude - p.lat) < 0.01 && Math.abs(longitude - p.lon) < 0.01
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-medium'
                  : 'bg-surface border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
              }`}
            >
              {p.isDefault && <span className="text-[9px] text-amber-500">⭐</span>}
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Contenedor del mapa */}
      <div className={className || "rounded-lg overflow-hidden border border-border"} style={{ height }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Overlay de info (opcional) */}
      {showInfoOverlay && (
        <div className="absolute top-10 left-2 z-[10] bg-surface/90 backdrop-blur-md px-2.5 py-1 rounded-md border border-border text-[11px] text-foreground flex items-center gap-1.5 shadow-lg pointer-events-none">
          <MapPin className="w-3 h-3 text-primary" />
          <span className="font-medium truncate max-w-[140px]">{city || 'Ubicación fijada'}</span>
          <span className="text-muted-foreground font-mono">
            {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </span>
        </div>
      )}

      {/* Hint */}
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Navigation className="w-2.5 h-2.5" />
        <span>Haz clic en el mapa o arrastra el marcador para fijar coordenadas GPS</span>
      </div>
    </div>
  );
};
