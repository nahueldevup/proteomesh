import { lazy, Suspense } from 'react';
import { MapPin, Pin, Loader2, Usb } from 'lucide-react';
import type { CustomLocation } from '../../types';
import type { MapPinItem } from '../MapPicker';
import { cn } from '../../lib/utils';
import type { PinnedItem } from './wizardTypes';

const MapPicker = lazy(() => import('../MapPicker').then((m) => ({ default: m.MapPicker })));

export interface StepGpsProxyProps {
  city: string;
  setCity: (city: string) => void;
  latitude: number;
  setLatitude: (lat: number) => void;
  longitude: number;
  setLongitude: (lon: number) => void;
  setTimezone: (tz: string) => void;
  selectedCustomLoc: CustomLocation | null;
  setSelectedCustomLoc: (loc: CustomLocation | null) => void;
  pinnedItems: PinnedItem[];
  customLocations: CustomLocation[];
  mapMarkers: MapPinItem[];
}

export function StepGpsProxy({
  city,
  setCity,
  latitude,
  setLatitude,
  longitude,
  setLongitude,
  setTimezone,
  selectedCustomLoc,
  setSelectedCustomLoc,
  pinnedItems,
  customLocations,
  mapMarkers,
}: StepGpsProxyProps) {
  return (
    <div className="space-y-4">
      {/* Mapa Interactivo Leaflet con Presets */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            <span>Geolocalización GPS & Pines</span>
          </label>
          <span className="text-[11px] font-mono text-muted-foreground">
            {selectedCustomLoc ? (
              <span className="text-primary font-semibold mr-1">📍 {selectedCustomLoc.name} ·</span>
            ) : null}
            {city} · {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </span>
        </div>

        {/* Barra de Pines Rápidos Configuradas por el Usuario */}
        {pinnedItems.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[10px] font-mono text-muted-foreground shrink-0 flex items-center gap-1 font-semibold">
              <Pin className="h-3 w-3 text-amber-500 fill-amber-500" />
              Pines:
            </span>
            {pinnedItems.map((pin) => {
              const isSel =
                (selectedCustomLoc?.id && selectedCustomLoc.id === pin.id) ||
                (!selectedCustomLoc &&
                  Math.abs(latitude - pin.lat) < 0.001 &&
                  Math.abs(longitude - pin.lon) < 0.001);
              return (
                <button
                  key={pin.id}
                  type="button"
                  onClick={() => {
                    setLatitude(pin.lat);
                    setLongitude(pin.lon);
                    setCity(pin.city);
                    if (pin.timezone) setTimezone(pin.timezone);
                    if (pin.isCustom) {
                      const found = customLocations.find((l) => l.id === pin.id);
                      setSelectedCustomLoc(found || null);
                    } else {
                      setSelectedCustomLoc(null);
                    }
                  }}
                  className={cn(
                    'rounded px-2 py-0.5 text-[10px] font-mono shrink-0 transition-colors border flex items-center gap-1 cursor-pointer',
                    isSel
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs'
                      : 'bg-background text-muted-foreground border-border hover:text-foreground hover:bg-accent'
                  )}
                >
                  {pin.isDefault && <span className="text-[9px] text-amber-500">⭐</span>}
                  <span>{pin.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <Suspense
          fallback={
            <div className="flex h-[210px] items-center justify-center rounded-md border border-border bg-muted/20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <MapPicker
            latitude={latitude}
            longitude={longitude}
            city={city}
            onChange={(lat, lon, newCity) => {
              setLatitude(lat);
              setLongitude(lon);
              const matched = customLocations.find(
                (l) => Math.abs(l.latitude - lat) < 0.0001 && Math.abs(l.longitude - lon) < 0.0001
              );
              if (matched) {
                setSelectedCustomLoc(matched);
                setCity(matched.city);
                if (matched.timezone) setTimezone(matched.timezone);
              } else {
                setSelectedCustomLoc(null);
                if (newCity) setCity(newCity);
                else setCity(`Coordenadas (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
              }
            }}
            markers={mapMarkers}
            height="210px"
            showPresets={false}
            showInfoOverlay={false}
          />
        </Suspense>

        <div className="grid grid-cols-3 gap-2.5 pt-1">
          <div>
            <label className="block text-[11px] font-mono text-muted-foreground mb-1">Ciudad</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-muted-foreground mb-1">Latitud</label>
            <input
              type="number"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(Number(e.target.value))}
              className="w-full h-8 rounded-md border border-input bg-background px-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-muted-foreground mb-1">Longitud</label>
            <input
              type="number"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(Number(e.target.value))}
              className="w-full h-8 rounded-md border border-input bg-background px-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Red USB & Cuarentena en T=0 (NET-USB-001) */}
      <div className="space-y-1.5 pt-2 border-t border-border/60">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Usb className="h-4 w-4 text-primary" />
          <span>Protección de Red: Cuarentena en T=0</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          El CloudPhone arrancará aislado del host en la cadena DOCKER-USER. Las apps no tendrán salida a Internet hasta reclamar un módem USB físico en el Centro de Red. El streaming táctil y ADB permanecen siempre activos en la red local.
        </p>
      </div>
    </div>
  );
}
