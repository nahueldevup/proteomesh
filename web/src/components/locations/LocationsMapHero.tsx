import React, { lazy, Suspense, useRef, useImperativeHandle, forwardRef } from 'react';
import {
  Loader2,
  SearchX,
  X,
  ScanSearch,
  Star,
  CircleDot,
  MapPinPlus,
  Plus,
} from 'lucide-react';
import type { CustomLocation, LocationGroup, DefaultLocation } from '../../types';
import { cn } from '../../lib/utils';
import { UNGROUPED_COLOR } from './locationsTypes';
import type { MapPickerHandle, MapPinItem } from '../MapPicker';

const MapPicker = lazy(() => import('../MapPicker').then((m) => ({ default: m.MapPicker })));

export interface LocationsMapHeroProps {
  mapLat: number;
  mapLon: number;
  mapCity: string;
  creating: boolean;
  showAllRadii: boolean;
  setShowAllRadii: React.Dispatch<React.SetStateAction<boolean>>;
  locRadiusKm: number;
  locShowRadius: boolean;
  markers: MapPinItem[];
  selectedId: string | null;
  onMarkerClick: (id: string) => void;
  onMapChange: (lat: number, lon: number, cityName?: string) => void;
  searchFocused: boolean;
  normalizedQuery: string;
  searchQuery: string;
  searchResults: CustomLocation[];
  visibleLocationsCount: number;
  catalogTotalCount: number;
  groupsMap: Map<string, LocationGroup>;
  onSelectLocation: (loc: CustomLocation) => void;
  onSearchInputBlur?: () => void;
  filtersActive: boolean;
  onClearFilters: () => void;
  defaultLoc?: DefaultLocation | null;
  onCenterOnDefault: () => void;
  onCancelCreate: () => void;
  loading: boolean;
  onStartCreate: (coords?: { lat: number; lon: number }) => void;
}

export const LocationsMapHero = forwardRef<MapPickerHandle, LocationsMapHeroProps>(
  (
    {
      mapLat,
      mapLon,
      mapCity,
      creating,
      showAllRadii,
      setShowAllRadii,
      locRadiusKm,
      locShowRadius,
      markers,
      selectedId,
      onMarkerClick,
      onMapChange,
      searchFocused,
      normalizedQuery,
      searchQuery,
      searchResults,
      visibleLocationsCount,
      catalogTotalCount,
      groupsMap,
      onSelectLocation,
      onSearchInputBlur,
      filtersActive,
      onClearFilters,
      defaultLoc,
      onCenterOnDefault,
      onCancelCreate,
      loading,
      onStartCreate,
    },
    ref
  ) => {
    const mapRef = useRef<MapPickerHandle>(null);

    useImperativeHandle(
      ref,
      () => ({
        flyTo: (lat: number, lon: number, zoom?: number) => mapRef.current?.flyTo(lat, lon, zoom),
        fitToMarkers: () => mapRef.current?.fitToMarkers(),
        highlight: (id: string | null) => mapRef.current?.highlight(id),
        getCenter: () => mapRef.current?.getCenter() ?? null,
      }),
      []
    );

    return (
      <div className="relative flex-1 min-h-0 min-w-0 w-full h-full overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center gap-2 bg-surface-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" /> Cargando mapa…
            </div>
          }
        >
          <MapPicker
            ref={mapRef}
            fill
            latitude={mapLat}
            longitude={mapLon}
            city={mapCity}
            initialZoom={12}
            showPresets={false}
            showInfoOverlay={false}
            showActiveMarker={creating}
            showCursorReadout
            showAllRadii={showAllRadii}
            activeRadiusKm={locRadiusKm}
            activeShowRadius={locShowRadius}
            markers={markers}
            selectedMarkerId={selectedId}
            onMarkerClick={onMarkerClick}
            onChange={onMapChange}
          >
            {/* Resultados de búsqueda flotantes */}
            {searchFocused && normalizedQuery && (
              <div className="absolute left-3 top-3 z-[40] w-80 overflow-hidden rounded-md border border-border bg-popover shadow-pop animate-in fade-in-0 slide-in-from-top-1 duration-150">
                <div className="flex items-center justify-between border-b border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>Resultados</span>
                  <span>{visibleLocationsCount}</span>
                </div>
                {searchResults.length === 0 ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                    <SearchX className="size-3.5" /> Sin coincidencias para "{searchQuery}"
                  </div>
                ) : (
                  <ul className="max-h-64 overflow-y-auto py-1">
                    {searchResults.map((loc, i) => {
                      const grp = loc.group_id ? groupsMap.get(loc.group_id) : undefined;
                      return (
                        <li key={loc.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => mapRef.current?.highlight(loc.id)}
                            onMouseLeave={() => mapRef.current?.highlight(null)}
                            onClick={() => {
                              onSelectLocation(loc);
                              onSearchInputBlur?.();
                            }}
                            className={cn(
                              'flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                              i === 0 && 'bg-surface-2'
                            )}
                          >
                            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: grp?.color || UNGROUPED_COLOR }} />
                            <span className="min-w-0 flex-1 truncate">
                              <span className="font-medium text-foreground">{loc.name}</span>
                              <span className="ml-1.5 text-muted-foreground">{loc.city}</span>
                            </span>
                            {i === 0 && <kbd className="rounded-sm border border-border px-1 font-mono text-[9px] text-muted-foreground">Enter</kbd>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Chips de filtros activos */}
            {!(searchFocused && normalizedQuery) && filtersActive && (
              <div className="absolute left-3 top-3 z-[30] flex items-center gap-1.5 animate-in fade-in-0 duration-150">
                <span className="rounded-md border border-border bg-popover/90 px-2 py-1 font-mono text-[10px] text-muted-foreground shadow-pop backdrop-blur-md">
                  {visibleLocationsCount}/{catalogTotalCount} en el mapa
                </span>
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-popover/90 px-2 py-1 font-mono text-[10px] text-foreground shadow-pop backdrop-blur-md transition-colors hover:text-primary"
                >
                  <X className="size-3" /> Limpiar filtros
                </button>
              </div>
            )}

            {/* Controles flotantes */}
            <div className="absolute right-3 top-3 z-[30] flex flex-col overflow-hidden rounded-md border border-border bg-popover shadow-pop">
              <button
                type="button"
                onClick={() => mapRef.current?.fitToMarkers()}
                title="Encuadrar todas las ubicaciones visibles"
                className="grid size-[30px] cursor-pointer place-items-center text-foreground transition-colors hover:bg-accent hover:text-primary"
              >
                <ScanSearch className="size-3.5" />
              </button>
              {defaultLoc && (
                <button
                  type="button"
                  onClick={onCenterOnDefault}
                  title={`Centrar en predeterminada (${defaultLoc.name})`}
                  className="grid size-[30px] cursor-pointer place-items-center border-t border-border text-warning transition-colors hover:bg-accent"
                >
                  <Star className="size-3.5 fill-current" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAllRadii((v) => !v)}
                title={showAllRadii ? 'Ocultar radios de referencia' : 'Mostrar radios de referencia'}
                className={cn(
                  'grid size-[30px] cursor-pointer place-items-center border-t border-border transition-colors',
                  showAllRadii ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <CircleDot className="size-3.5" />
              </button>
            </div>

            {/* Banner de modo creación */}
            {creating && (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-[30] flex justify-center">
                <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-primary/40 bg-popover/95 py-1 pl-3 pr-1 font-mono text-[11px] text-foreground shadow-pop backdrop-blur-md animate-in fade-in-0 slide-in-from-top-2 duration-200">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-primary" />
                  </span>
                  Modo creación · clic o arrastrá el marcador
                  <button
                    type="button"
                    onClick={onCancelCreate}
                    className="cursor-pointer rounded-full px-2 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Esc
                  </button>
                </div>
              </div>
            )}

            {/* Estado vacío del catálogo */}
            {!loading && catalogTotalCount === 0 && !creating && (
              <div className="pointer-events-none absolute inset-0 z-[25] grid place-items-center">
                <div className="pointer-events-auto w-72 rounded-lg border border-border bg-popover/95 p-5 text-center shadow-pop backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-200">
                  <div className="mx-auto grid size-11 place-items-center rounded-md border border-dashed border-primary/60 text-primary">
                    <MapPinPlus className="size-5" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">Todavía no hay ubicaciones</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Hacé clic en cualquier punto del mapa para fijar coordenadas y guardarlas.
                  </p>
                  <button
                    type="button"
                    onClick={() => onStartCreate()}
                    className="mt-4 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="size-3.5" /> Crear en el centro del mapa
                  </button>
                </div>
              </div>
            )}

            {loading && (
              <div className="pointer-events-none absolute inset-0 z-[25] grid place-items-center bg-background/40 backdrop-blur-[1px]">
                <div className="flex items-center gap-2 rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-pop">
                  <Loader2 className="size-3.5 animate-spin text-primary" /> Cargando ubicaciones…
                </div>
              </div>
            )}
          </MapPicker>
        </Suspense>
      </div>
    );
  }
);

LocationsMapHero.displayName = 'LocationsMapHero';
