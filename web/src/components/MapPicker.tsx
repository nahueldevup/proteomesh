import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import { MapPin, Navigation } from 'lucide-react';

interface MapPickerProps {
  latitude: number;
  longitude: number;
  city: string;
  onChange: (lat: number, lon: number, cityName?: string) => void;
  className?: string;
  height?: string;
  showPresets?: boolean;
  showInfoOverlay?: boolean;
}

// Presets rapidos para saltar a ciudades clave
const QUICK_PRESETS: { label: string; lat: number; lon: number }[] = [
  { label: 'Buenos Aires', lat: -34.603722, lon: -58.381592 },
  { label: 'Cordoba', lat: -31.420083, lon: -64.188776 },
  { label: 'Miami', lat: 25.761680, lon: -80.191790 },
  { label: 'New York', lat: 40.712776, lon: -74.005974 },
  { label: 'Madrid', lat: 40.416775, lon: -3.703790 },
  { label: 'CDMX', lat: 19.432608, lon: -99.133209 },
  { label: 'Sao Paulo', lat: -23.550520, lon: -46.633308 },
  { label: 'London', lat: 51.507351, lon: -0.127758 },
];

export const MapPicker: React.FC<MapPickerProps> = ({
  latitude,
  longitude,
  city,
  onChange,
  className,
  height = '320px',
  showPresets = true,
  showInfoOverlay = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const isInitializedRef = useRef(false);

  // Callback estable para onChange
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const handleMapClick = useCallback((lat: number, lon: number) => {
    onChangeRef.current(
      Number(lat.toFixed(6)),
      Number(lon.toFixed(6))
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

    const map = L.map(mapContainerRef.current, {
      center: [latitude, longitude],
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

    // Marcador arrastrable
    const marker = L.marker([latitude, longitude], {
      icon: customIcon,
      draggable: true,
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

    // Forzar invalidateSize despues de que el DOM se estabilice
    // Esto arregla el bug clasico de Leaflet donde los tiles no cargan
    // cuando el mapa se inicializa dentro de un modal o contenedor oculto
    requestAnimationFrame(() => {
      map.invalidateSize();
    });
    setTimeout(() => {
      map.invalidateSize();
    }, 300);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      isInitializedRef.current = false;
    };
  }, []); // Solo se ejecuta al montar

  // Sincronizar coordenadas cuando cambian externamente
  useEffect(() => {
    if (!markerRef.current || !mapRef.current) return;
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

  // Invalidar tamano cuando el contenedor cambia de visibilidad
  useEffect(() => {
    const timer = setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  });

  const handlePresetClick = (preset: typeof QUICK_PRESETS[0]) => {
    onChange(preset.lat, preset.lon, preset.label);
    if (markerRef.current && mapRef.current) {
      markerRef.current.setLatLng([preset.lat, preset.lon]);
      mapRef.current.setView([preset.lat, preset.lon], 12, { animate: true });
    }
  };

  return (
    <div className="relative w-full space-y-2">
      {/* Presets rapidos (opcional) */}
      {showPresets && (
        <div className="flex flex-wrap gap-1">
          {QUICK_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => handlePresetClick(p)}
              className={`px-2 py-0.5 rounded text-[10px] border transition-all ${
                Math.abs(latitude - p.lat) < 0.01 && Math.abs(longitude - p.lon) < 0.01
                  ? 'bg-primary/20 border-primary/40 text-primary font-medium'
                  : 'bg-surface border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
              }`}
            >
              {p.label}
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
      <div className="flex items-center gap-1 text-[10px] text-zinc-600">
        <Navigation className="w-2.5 h-2.5" />
        <span>Haz clic en el mapa o arrastra el marcador para fijar coordenadas GPS</span>
      </div>
    </div>
  );
};
