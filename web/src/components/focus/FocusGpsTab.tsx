import React, { lazy, Suspense } from 'react';
import {
  BookmarkPlus,
  Plus,
  ChevronDown,
  Search,
  X,
  Pin,
  Check,
  Loader2,
  Navigation,
} from 'lucide-react';
import type {
  CustomLocation,
  LocationGroup,
  CustomLocationsCatalog,
} from '../../types';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

const MapPicker = lazy(() => import('../MapPicker').then((m) => ({ default: m.MapPicker })));

export interface FocusGpsTabProps {
  mapLat: number;
  setMapLat: (lat: number) => void;
  mapLon: number;
  setMapLon: (lon: number) => void;
  mapCity: string;
  setMapCity: (city: string) => void;
  mapBusy: boolean;
  selectedCustomLoc: CustomLocation | null;
  setSelectedCustomLoc: (loc: CustomLocation | null) => void;
  customCatalog: CustomLocationsCatalog;
  customSelectorPopover: { open: boolean; onOpenChange: (open: boolean) => void };
  customSearchQuery: string;
  setCustomSearchQuery: (q: string) => void;
  saveCustomPopover: { open: boolean; onOpenChange: (open: boolean) => void };
  customNameInput: string;
  setCustomNameInput: (name: string) => void;
  customGroupInput: string;
  setCustomGroupInput: (group: string) => void;
  saveCustomIsPinned: boolean;
  setSaveCustomIsPinned: (pinned: boolean) => void;
  savingCustom: boolean;
  filteredCustomLocations: CustomLocation[];
  pinnedCustomLocations: CustomLocation[];
  pinnedPresetsList: Array<{
    key: string;
    name: string;
    city: string;
    latitude: number;
    longitude: number;
  }>;
  onSaveGps: () => void;
  onCreateCustomLocationHere: (e: React.FormEvent) => void;
  onTogglePinLocation: (loc: CustomLocation) => void;
}

export function FocusGpsTab({
  mapLat,
  setMapLat,
  mapLon,
  setMapLon,
  mapCity,
  setMapCity,
  mapBusy,
  selectedCustomLoc,
  setSelectedCustomLoc,
  customCatalog,
  customSelectorPopover,
  customSearchQuery,
  setCustomSearchQuery,
  saveCustomPopover,
  customNameInput,
  setCustomNameInput,
  customGroupInput,
  setCustomGroupInput,
  saveCustomIsPinned,
  setSaveCustomIsPinned,
  savingCustom,
  filteredCustomLocations,
  pinnedCustomLocations,
  pinnedPresetsList,
  onSaveGps,
  onCreateCustomLocationHere,
  onTogglePinLocation,
}: FocusGpsTabProps) {
  return (
    <div className="flex flex-col gap-2.5 pt-2.5 flex-1 min-h-0">
      {/* Cabecera de acción con Selector Custom, Guardar Custom, Presets y Actualizar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Popover: Selector de Ubicación Custom */}
          <Popover open={customSelectorPopover.open} onOpenChange={customSelectorPopover.onOpenChange}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-mono font-medium border transition-colors',
                  selectedCustomLoc
                    ? 'bg-primary/20 border-primary/50 text-foreground font-semibold'
                    : 'bg-background border-border text-foreground hover:bg-muted'
                )}
                title="Seleccionar entre tus ubicaciones personalizadas guardadas"
              >
                <BookmarkPlus className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate max-w-[130px]">
                  {selectedCustomLoc ? selectedCustomLoc.name : 'Ubicación Custom'}
                </span>
                <ChevronDown className={cn('h-3 w-3 opacity-60 shrink-0 transition-transform duration-200', customSelectorPopover.open && 'rotate-180')} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className="w-80 p-2.5 space-y-2">
              <div className="flex items-center justify-between border-b border-border/50 pb-1.5 px-0.5">
                <span className="text-[11px] font-bold text-foreground">Ubicaciones Personalizadas</span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {filteredCustomLocations.length} de {customCatalog.locations.length}
                </span>
              </div>

              {/* Buscador de Ubicaciones Custom */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, ciudad o grupo..."
                  value={customSearchQuery}
                  onChange={(e) => setCustomSearchQuery(e.target.value)}
                  className="w-full h-8 rounded-md border border-border bg-background pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                />
                {customSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setCustomSearchQuery('')}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Lista de Ubicaciones */}
              <div className="max-h-60 overflow-y-auto space-y-1">
                {customCatalog.locations.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    No tienes ubicaciones personalizadas aún. Guarda la actual con "+ Guardar Custom".
                  </div>
                ) : filteredCustomLocations.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    No se encontraron ubicaciones para "{customSearchQuery}".
                  </div>
                ) : (
                  filteredCustomLocations.map((loc: CustomLocation) => {
                    const isSelected = selectedCustomLoc?.id === loc.id;
                    const grp = loc.group_id
                      ? customCatalog.groups.find((g: LocationGroup) => g.id === loc.group_id)
                      : null;
                    return (
                      <div
                        key={loc.id}
                        className={cn(
                          'group flex items-center justify-between rounded-md p-1.5 text-xs transition-colors',
                          isSelected
                            ? 'bg-primary/15 text-primary font-semibold'
                            : 'hover:bg-accent text-foreground'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCustomLoc(loc);
                            setMapLat(loc.latitude);
                            setMapLon(loc.longitude);
                            setMapCity(loc.city);
                            customSelectorPopover.onOpenChange(false);
                            toast.info(`Seleccionada: ${loc.name}`);
                          }}
                          className="flex items-start gap-2 min-w-0 flex-1 text-left"
                        >
                          <span
                            className="mt-1 h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: grp?.color || '#10b981' }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium">{loc.name}</span>
                              {grp && (
                                <span className="text-[9px] text-muted-foreground truncate opacity-75">
                                  ({grp.name})
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">{loc.city}</div>
                          </div>
                        </button>

                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          <button
                            type="button"
                            title={loc.is_pinned ? 'Desfijar de accesos rápidos' : 'Fijar en accesos rápidos'}
                            onClick={(e) => {
                              e.stopPropagation();
                              onTogglePinLocation(loc);
                            }}
                            className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
                          >
                            <Pin
                              className={cn(
                                'h-3 w-3',
                                loc.is_pinned ? 'text-amber-500 fill-amber-500' : 'opacity-40 group-hover:opacity-80'
                              )}
                            />
                          </button>
                          {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Popover: Guardar coordenadas actuales como Custom */}
          <Popover open={saveCustomPopover.open} onOpenChange={saveCustomPopover.onOpenChange}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-mono font-medium transition-colors',
                  saveCustomPopover.open
                    ? 'border-primary bg-primary/20 text-foreground font-semibold'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                )}
                title="Guardar coordenadas actuales del mapa como nueva ubicación custom"
              >
                <Plus className={cn('h-3.5 w-3.5 text-primary transition-transform duration-200', saveCustomPopover.open && 'rotate-45')} />
                <span>Guardar Custom</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className="w-72 p-3 space-y-3">
              <div className="border-b border-border/50 pb-1.5">
                <span className="text-xs font-bold text-foreground">Guardar Ubicación Custom</span>
                <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                  Coordenadas: {mapLat.toFixed(4)}, {mapLon.toFixed(4)}
                </div>
              </div>

              <form onSubmit={onCreateCustomLocationHere} className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-foreground mb-1">
                    Nombre Personalizado *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Oficina Central, Depósito 2..."
                    value={customNameInput}
                    onChange={(e) => setCustomNameInput(e.target.value)}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-foreground mb-1">
                    Grupo
                  </label>
                  <select
                    value={customGroupInput}
                    onChange={(e) => setCustomGroupInput(e.target.value)}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">(Sin Grupo)</option>
                    {customCatalog.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Opción para fijar en accesos rápidos */}
                <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={saveCustomIsPinned}
                    onChange={(e) => setSaveCustomIsPinned(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                  />
                  <span className="text-[11px] text-foreground font-medium flex items-center gap-1 select-none">
                    <Pin className="h-3 w-3 text-amber-500 fill-amber-500" />
                    <span>Fijar en accesos rápidos</span>
                  </span>
                </label>

                <div className="flex items-center justify-end gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => saveCustomPopover.onOpenChange(false)}
                    className="rounded px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingCustom || !customNameInput.trim()}
                    className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {savingCustom && <Loader2 className="h-3 w-3 animate-spin" />}
                    <span>Guardar</span>
                  </button>
                </div>
              </form>
            </PopoverContent>
          </Popover>

          {/* Presets Rápidos y Ubicaciones Custom Fijadas */}
          <div className="hidden md:flex items-center gap-1 pl-1 border-l border-border/60 overflow-x-auto scrollbar-none max-w-[500px]">
            {/* Presets Globales Fijados */}
            {pinnedPresetsList.map((c) => {
              const isSelected = !selectedCustomLoc && (mapCity === c.name || mapCity === c.city);
              const isDefaultPreset = customCatalog.default_location?.target_type === 'preset' && customCatalog.default_location?.id === c.key;
              return (
                <button
                  key={`pre-${c.key}`}
                  type="button"
                  title={isDefaultPreset ? `Preset predeterminado general: ${c.city}` : `Preset oficial: ${c.city}`}
                  onClick={() => {
                    setSelectedCustomLoc(null);
                    setMapLat(c.latitude);
                    setMapLon(c.longitude);
                    setMapCity(c.name);
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors border shrink-0',
                    isSelected
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 font-semibold'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  {isDefaultPreset && <span className="text-[9px] text-amber-500">⭐</span>}
                  <span>{c.name}</span>
                </button>
              );
            })}

            {/* Ubicaciones Personalizadas Fijadas */}
            {pinnedCustomLocations.map((loc: CustomLocation) => {
              const isSelected = selectedCustomLoc?.id === loc.id;
              const isDefaultLoc = customCatalog.default_location?.id === loc.id;
              const grp = loc.group_id
                ? customCatalog.groups.find((g: LocationGroup) => g.id === loc.group_id)
                : null;
              return (
                <button
                  key={`cust-${loc.id}`}
                  type="button"
                  title={isDefaultLoc ? `Predeterminada del sistema: ${loc.name} (${loc.city})` : `Ubicación personalizada: ${loc.name} (${loc.city})`}
                  onClick={() => {
                    setSelectedCustomLoc(loc);
                    setMapLat(loc.latitude);
                    setMapLon(loc.longitude);
                    setMapCity(loc.city);
                  }}
                  className={cn(
                    'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-sans transition-colors border max-w-[140px] truncate shrink-0',
                    isSelected
                      ? 'bg-primary/15 text-primary border-primary/50 font-semibold shadow-xs'
                      : 'border-border bg-background text-foreground/80 hover:text-foreground hover:bg-accent'
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: grp?.color || '#10b981' }}
                  />
                  {isDefaultLoc && <span className="text-[9px] text-amber-500 shrink-0">⭐</span>}
                  <span className="truncate">{loc.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Botón Prominente: Actualizar GPS */}
        <button
          disabled={mapBusy}
          onClick={onSaveGps}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 font-sans text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 shadow-sm shrink-0"
        >
          {mapBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
          <span>
            {selectedCustomLoc ? `Asignar: ${selectedCustomLoc.name}` : 'Actualizar GPS'}
          </span>
        </button>
      </div>

      {/* Mapa Interactivo Leaflet */}
      <div className="rounded-lg border border-border overflow-hidden h-[190px] relative">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center bg-muted/20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <MapPicker
            latitude={mapLat}
            longitude={mapLon}
            city={mapCity}
            height="190px"
            showPresets={false}
            showInfoOverlay={false}
            onChange={(lat, lon, cityName) => {
              setMapLat(lat);
              setMapLon(lon);
              if (cityName) setMapCity(cityName);
            }}
          />
        </Suspense>
      </div>

      {/* Coordenadas seleccionadas y Nombre Custom Activo */}
      <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
        <div className="flex items-center gap-1.5 truncate">
          {selectedCustomLoc ? (
            <>
              <span className="font-bold text-primary truncate">
                📍 {selectedCustomLoc.name}
              </span>
              <span className="text-[10px] opacity-75 truncate">
                ({mapCity}: {mapLat.toFixed(4)}, {mapLon.toFixed(4)})
              </span>
              <button
                type="button"
                onClick={() => setSelectedCustomLoc(null)}
                className="text-[9px] text-muted-foreground hover:text-foreground underline ml-1"
              >
                Limpiar
              </button>
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground">{mapCity}:</span>{' '}
              <span>{mapLat.toFixed(4)}, {mapLon.toFixed(4)}</span>
            </>
          )}
        </div>
        <span className="text-[10px] shrink-0">Arrastra el marcador o haz clic en el mapa</span>
      </div>
    </div>
  );
}
