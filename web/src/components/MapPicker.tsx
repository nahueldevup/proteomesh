import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapPin, Navigation } from 'lucide-react';

interface MapPickerProps {
  latitude: number;
  longitude: number;
  city: string;
  onChange: (lat: number, lon: number, cityName?: string) => void;
  className?: string;
}

export const MapPicker: React.FC<MapPickerProps> = ({
  latitude,
  longitude,
  city,
  onChange,
  className = "h-[320px] w-full rounded-lg overflow-hidden border border-zinc-800"
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Crear icono personalizado SVG minimalista
    const customIcon = L.divIcon({
      className: 'custom-map-marker',
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
          <div style="position: absolute; width: 28px; height: 28px; background: rgba(59, 130, 246, 0.25); border-radius: 50%; animation: pulse 2s infinite;"></div>
          <div style="position: relative; width: 14px; height: 14px; background: #3b82f6; border: 2px solid #ffffff; border-radius: 50%; box-shadow: 0 0 10px rgba(59,130,246,0.8);"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    // Inicializar mapa si no existe
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [latitude, longitude],
        zoom: 12,
        zoomControl: false,
      });

      // Añadir controles de zoom en esquina inferior derecha
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // CartoDB Dark Matter tiles (elegante tema oscuro minimalista)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      // Marcador arrastrable
      const marker = L.marker([latitude, longitude], {
        icon: customIcon,
        draggable: true,
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onChange(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
      });

      // Clic en cualquier parte del mapa mueve la chincheta
      map.on('click', (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        onChange(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
    } else {
      // Actualizar posición del marcador si cambian props externas
      if (markerRef.current) {
        markerRef.current.setLatLng([latitude, longitude]);
      }
      mapInstanceRef.current.setView([latitude, longitude], mapInstanceRef.current.getZoom(), {
        animate: true,
      });
    }

    return () => {
      // Cleanup al desmontar
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Efecto para sincronizar coordenadas si cambian externamente
  useEffect(() => {
    if (markerRef.current && mapInstanceRef.current) {
      const currentPos = markerRef.current.getLatLng();
      if (
        Math.abs(currentPos.lat - latitude) > 0.0001 ||
        Math.abs(currentPos.lng - longitude) > 0.0001
      ) {
        markerRef.current.setLatLng([latitude, longitude]);
        mapInstanceRef.current.panTo([latitude, longitude], { animate: true });
      }
    }
  }, [latitude, longitude]);

  return (
    <div className="relative w-full">
      <div ref={mapContainerRef} className={className} />
      <div className="absolute top-2 left-2 z-[1000] bg-zinc-900/90 backdrop-blur-md px-3 py-1.5 rounded-md border border-zinc-800 text-xs text-zinc-300 flex items-center gap-2 shadow-lg">
        <MapPin className="w-3.5 h-3.5 text-blue-400" />
        <span className="font-medium text-zinc-100">{city || "Ubicación fijada"}</span>
        <span className="text-zinc-500 font-mono">
          ({latitude.toFixed(4)}, {longitude.toFixed(4)})
        </span>
      </div>
      <div className="absolute bottom-2 left-2 z-[1000] text-[10px] text-zinc-500 bg-zinc-950/80 px-2 py-0.5 rounded border border-zinc-800/60 pointer-events-none flex items-center gap-1">
        <Navigation className="w-2.5 h-2.5 text-zinc-400" />
        <span>Haz clic o arrastra la chincheta para posicionar el GPS</span>
      </div>
    </div>
  );
};
