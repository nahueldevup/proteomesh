import React, { useMemo } from 'react';
import {
  MapPin,
  MapPinPlus,
  Plus,
  Crosshair,
  X,
  Star,
  Pin,
  CircleDot,
  Edit2,
  Trash2,
  Check,
  ChevronDown,
  ChevronRight,
  Smartphone,
  LocateFixed,
  SearchX,
  MousePointerClick,
  Loader2,
  Copy,
} from 'lucide-react';
import type { CustomLocation, LocationGroup, Instance, CustomLocationsCatalog, DefaultLocation } from '../../types';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Switch } from '../ui/switch';
import { cn } from '../../lib/utils';
import {
  fieldClass,
  fieldLabelClass,
  sectionTitleClass,
  formatUtcOffset,
  UNGROUPED_COLOR,
  type JobState,
} from './locationsTypes';
import { BatchTeleportModal } from './BatchTeleportModal';

export interface LocationsInspectorProps {
  creating: boolean;
  sel: CustomLocation | null;
  defaultLoc?: DefaultLocation | null;
  catalog: CustomLocationsCatalog;
  groupsMap: Map<string, LocationGroup>;
  phonesByLocation: Map<string, Instance[]>;
  visibleLocations: CustomLocation[];
  loading: boolean;
  mapLat: number;
  mapLon: number;
  mapCity: string;
  setMapCity: (val: string) => void;
  // create mode
  locName: string;
  setLocName: (val: string) => void;
  locGroupId: string;
  setLocGroupId: (val: string) => void;
  locTimezone: string;
  setLocTimezone: (val: string) => void;
  locAltitude: number;
  setLocAltitude: (val: number) => void;
  locIsPinned: boolean;
  setLocIsPinned: (val: boolean) => void;
  locSetAsDefault: boolean;
  setLocSetAsDefault: (val: boolean) => void;
  locShowRadius: boolean;
  setLocShowRadius: (val: boolean) => void;
  locRadiusKm: number;
  setLocRadiusKm: (val: number) => void;
  savingLoc: boolean;
  formGroupSelectOpen: boolean;
  setFormGroupSelectOpen: (val: boolean) => void;
  onSaveLocation: (e: React.FormEvent) => void;
  onCancelCreate: () => void;
  onOpenNewGroupModal: () => void;
  // detail mode
  selColor: string;
  selGroup?: LocationGroup;
  selIsDefault: boolean;
  copied: boolean;
  onOpenEditLocModal: (loc: CustomLocation) => void;
  onPromptDeleteLocation: (loc: CustomLocation) => void;
  onCloseInspector: () => void;
  onCopyCoords: (lat: number, lon: number) => void;
  onSetDefaultLocation: (type: 'custom' | 'preset', id: string, name: string) => void;
  onTogglePin: (type: 'custom' | 'preset', id: string, pinned?: boolean) => void;
  onUpdateLocationRadius: (id: string, show: boolean, radius: number) => void;
  // teleport
  instances: Instance[];
  targets: string[];
  setTargets: React.Dispatch<React.SetStateAction<string[]>>;
  teleporting: boolean;
  jobs: Record<string, JobState>;
  onTeleport: () => void;
  onResetTeleport: () => void;
  // overview mode
  onCenterOnDefault: () => void;
  onClearFilters: () => void;
  onSelectLocation: (loc: CustomLocation) => void;
  onHighlightLocation: (id: string | null) => void;
}

export const LocationsInspector: React.FC<LocationsInspectorProps> = ({
  creating,
  sel,
  defaultLoc,
  catalog,
  groupsMap,
  phonesByLocation,
  visibleLocations,
  loading,
  mapLat,
  mapLon,
  mapCity,
  setMapCity,
  locName,
  setLocName,
  locGroupId,
  setLocGroupId,
  locTimezone,
  setLocTimezone,
  locAltitude,
  setLocAltitude,
  locIsPinned,
  setLocIsPinned,
  locSetAsDefault,
  setLocSetAsDefault,
  locShowRadius,
  setLocShowRadius,
  locRadiusKm,
  setLocRadiusKm,
  savingLoc,
  formGroupSelectOpen,
  setFormGroupSelectOpen,
  onSaveLocation,
  onCancelCreate,
  onOpenNewGroupModal,
  selColor,
  selGroup,
  selIsDefault,
  copied,
  onOpenEditLocModal,
  onPromptDeleteLocation,
  onCloseInspector,
  onCopyCoords,
  onSetDefaultLocation,
  onTogglePin,
  onUpdateLocationRadius,
  instances,
  targets,
  setTargets,
  teleporting,
  jobs,
  onTeleport,
  onResetTeleport,
  onCenterOnDefault,
  onClearFilters,
  onSelectLocation,
  onHighlightLocation,
}) => {
  const selectedFormGroup = useMemo(
    () => catalog.groups.find((g) => g.id === locGroupId),
    [catalog.groups, locGroupId]
  );

  return (
    <aside className="flex w-[380px] shrink-0 select-none flex-col overflow-hidden bg-surface">
      {creating ? (
        /* ── MODO CREACIÓN ── */
        <form
          key="create"
          onSubmit={onSaveLocation}
          className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 slide-in-from-right-2 duration-200"
        >
          <div className="border-b border-border p-4">
            <div className="flex items-start gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-md border border-dashed border-primary/60 bg-primary/10 text-primary">
                <MapPinPlus className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold">Nueva ubicación</h2>
                <p className="text-xs text-muted-foreground">Clic en el mapa o arrastrá el marcador para ajustar.</p>
              </div>
              <button
                type="button"
                onClick={onCancelCreate}
                title="Cancelar (Esc)"
                className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px]">
              <Crosshair className="size-3.5 shrink-0 text-primary" />
              <span className="flex-1 tabular-nums text-foreground">
                {mapLat.toFixed(6)}, {mapLon.toFixed(6)}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" /> en vivo
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <div>
              <label className={fieldLabelClass} htmlFor="loc-name">
                Nombre personalizado *
              </label>
              <input
                id="loc-name"
                type="text"
                required
                autoFocus
                placeholder="Ej: Oficina Palermo, Depósito Norte…"
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
                className={cn(fieldClass, 'font-medium')}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={fieldLabelClass}>Grupo</span>
                <Popover open={formGroupSelectOpen} onOpenChange={setFormGroupSelectOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(fieldClass, 'flex cursor-pointer items-center justify-between gap-1.5 hover:bg-muted/40')}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {selectedFormGroup ? (
                          <>
                            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: selectedFormGroup.color || '#10b981' }} />
                            <span className="truncate font-medium">{selectedFormGroup.name}</span>
                          </>
                        ) : (
                          <span className="font-mono text-[11px] text-muted-foreground">Sin grupo</span>
                        )}
                      </span>
                      <ChevronDown className={cn('size-3 shrink-0 opacity-60 transition-transform', formGroupSelectOpen && 'rotate-180')} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={4} className="w-56 space-y-0.5 p-1 font-mono">
                    <button
                      type="button"
                      onClick={() => {
                        setLocGroupId('');
                        setFormGroupSelectOpen(false);
                      }}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs transition-colors',
                        locGroupId === '' ? 'bg-primary/15 font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      Sin grupo
                    </button>
                    <div className="max-h-48 space-y-0.5 overflow-y-auto">
                      {catalog.groups.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setLocGroupId(g.id);
                            setFormGroupSelectOpen(false);
                          }}
                          className={cn(
                            'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-xs transition-colors',
                            locGroupId === g.id ? 'bg-primary/15 font-semibold text-foreground' : 'text-foreground hover:bg-muted'
                          )}
                        >
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: g.color || '#10b981' }} />
                          <span className="flex-1 truncate">{g.name}</span>
                          {locGroupId === g.id && <Check className="size-3 text-primary" />}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormGroupSelectOpen(false);
                        onOpenNewGroupModal();
                      }}
                      className="flex w-full cursor-pointer items-center gap-1.5 rounded-sm border-t border-border px-2 py-1.5 text-left text-[11px] text-primary hover:bg-muted"
                    >
                      <Plus className="size-3" /> Nuevo grupo
                    </button>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="loc-city">
                  Ciudad / referencia
                </label>
                <input id="loc-city" type="text" value={mapCity} onChange={(e) => setMapCity(e.target.value)} className={fieldClass} />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_96px] gap-2">
              <div>
                <label className={fieldLabelClass} htmlFor="loc-tz">
                  Zona horaria <span className="normal-case tracking-normal opacity-70">({formatUtcOffset(locTimezone)})</span>
                </label>
                <input
                  id="loc-tz"
                  type="text"
                  value={locTimezone}
                  onChange={(e) => setLocTimezone(e.target.value)}
                  className={cn(fieldClass, 'font-mono text-[11px]')}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="loc-alt">
                  Altitud (m)
                </label>
                <input
                  id="loc-alt"
                  type="number"
                  value={locAltitude}
                  onChange={(e) => setLocAltitude(Number(e.target.value))}
                  className={cn(fieldClass, 'font-mono text-[11px] tabular-nums')}
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-2.5 transition-colors hover:border-muted-foreground/40">
                <Star className={cn('size-4 shrink-0', locSetAsDefault ? 'fill-current text-warning' : 'text-muted-foreground')} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">Ubicación predeterminada</div>
                  <div className="text-xs text-muted-foreground">Base para CloudPhones nuevos y vistas de mapa</div>
                </div>
                <Switch checked={locSetAsDefault} onCheckedChange={setLocSetAsDefault} className="data-[state=checked]:bg-success" />
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-2.5 transition-colors hover:border-muted-foreground/40">
                <Pin className={cn('size-4 shrink-0', locIsPinned ? 'fill-current text-primary' : 'text-muted-foreground')} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">Fijar en accesos rápidos</div>
                  <div className="text-xs text-muted-foreground">Aparece en la barra GPS de FocusView</div>
                </div>
                <Switch checked={locIsPinned} onCheckedChange={setLocIsPinned} />
              </label>

              <div className="rounded-md border border-border bg-card p-2.5 space-y-2">
                <div className="flex items-center gap-3">
                  <CircleDot className={cn('size-4 shrink-0', locShowRadius ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">Radio de referencia</div>
                    <div className="text-xs text-muted-foreground">
                      {locShowRadius
                        ? `Círculo visual de cobertura en el mapa (${locRadiusKm} km)`
                        : 'Círculo visual desactivado'}
                    </div>
                  </div>
                  <Switch checked={locShowRadius} onCheckedChange={setLocShowRadius} />
                </div>

                {locShowRadius && (
                  <div className="pt-2 border-t border-border/60 space-y-2 animate-in fade-in-0 duration-150">
                    <div className="flex items-center justify-between">
                      <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground" htmlFor="loc-radius-input">
                        Alcance del radio
                      </label>
                      <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                        {locRadiusKm} km
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id="loc-radius-input"
                        type="number"
                        min={0.1}
                        max={500}
                        step={0.1}
                        value={locRadiusKm}
                        onChange={(e) => setLocRadiusKm(Math.max(0.1, Number(e.target.value) || 1.0))}
                        className={cn(fieldClass, 'font-mono text-xs tabular-nums')}
                      />
                      <span className="font-mono text-xs text-muted-foreground shrink-0">km</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {[0.5, 1, 2, 5, 10, 25].map((presetKm) => (
                        <button
                          key={presetKm}
                          type="button"
                          onClick={() => setLocRadiusKm(presetKm)}
                          className={cn(
                            'rounded border px-2 py-0.5 font-mono text-[10px] transition-colors cursor-pointer',
                            locRadiusKm === presetKm
                              ? 'border-primary/50 bg-primary/20 text-primary font-semibold'
                              : 'border-border bg-background text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                          )}
                        >
                          {presetKm} km
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-border p-4">
            <button
              type="submit"
              disabled={savingLoc || !locName.trim()}
              className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingLoc ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {savingLoc ? 'Guardando…' : 'Guardar ubicación'}
            </button>
            <p className="mt-2 text-center font-mono text-[11px] text-muted-foreground">POST /locations/custom</p>
          </div>
        </form>
      ) : sel ? (
        /* ── MODO INSPECTOR ── */
        <div key={sel.id} className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 slide-in-from-right-2 duration-200">
          <div className="border-b border-border p-4">
            <div className="flex items-start gap-3">
              <div
                className="grid size-12 shrink-0 place-items-center rounded-md border bg-card"
                style={{ borderColor: selColor, color: selColor }}
              >
                {selIsDefault ? <Star className="size-5 fill-current text-warning" /> : <MapPin className="size-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold" title={sel.name}>
                  {sel.name}
                </h2>
                <p className="truncate text-xs text-muted-foreground" title={sel.city}>
                  {sel.city}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-xs">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: selColor }} />
                  {selGroup ? selGroup.name : <span className="text-muted-foreground">Sin grupo</span>}
                </p>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onOpenEditLocModal(sel)}
                  title="Editar ubicación completa"
                  className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Edit2 className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onPromptDeleteLocation(sel)}
                  title="Eliminar ubicación"
                  className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={onCloseInspector}
                  title="Cerrar (Esc)"
                  className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
              {[
                ['Altitud', `${sel.altitude ?? 25} m`, undefined],
                ['Precisión', sel.accuracy != null ? `±${sel.accuracy} m` : 'auto', undefined],
                ['Zona', formatUtcOffset(sel.timezone), sel.timezone || 'UTC'],
              ].map(([k, v, title]) => (
                <div key={k} className="bg-card px-2.5 py-2" title={title}>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 truncate font-mono tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-card py-1 pl-2.5 pr-1 font-mono text-[11px]">
              <Crosshair className="size-3.5 shrink-0 text-primary" />
              <span className="flex-1 truncate tabular-nums">
                {sel.latitude.toFixed(6)}, {sel.longitude.toFixed(6)}
              </span>
              <button
                type="button"
                onClick={() => onCopyCoords(sel.latitude, sel.longitude)}
                className={cn(
                  'inline-flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 transition-colors',
                  copied ? 'text-success' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <label
                className={cn(
                  'flex items-center gap-3 rounded-md border border-border bg-card p-2.5',
                  selIsDefault ? 'cursor-default' : 'cursor-pointer transition-colors hover:border-muted-foreground/40'
                )}
                title={selIsDefault ? 'Ya es la predeterminada. Elegí otra ubicación para reemplazarla.' : undefined}
              >
                <Star className={cn('size-4 shrink-0', selIsDefault ? 'fill-current text-warning' : 'text-muted-foreground')} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">Ubicación predeterminada</div>
                  <div className="text-xs text-muted-foreground">
                    {selIsDefault ? 'Activa: base para CloudPhones nuevos' : 'Base para CloudPhones nuevos y vistas de mapa'}
                  </div>
                </div>
                <Switch
                  checked={selIsDefault}
                  disabled={selIsDefault}
                  onCheckedChange={() => onSetDefaultLocation('custom', sel.id, sel.name)}
                  className="data-[state=checked]:bg-success disabled:opacity-100"
                />
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-2.5 transition-colors hover:border-muted-foreground/40">
                <Pin className={cn('size-4 shrink-0', sel.is_pinned ? 'fill-current text-primary' : 'text-muted-foreground')} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">Fijar en accesos rápidos</div>
                  <div className="text-xs text-muted-foreground">Aparece en la barra GPS de FocusView</div>
                </div>
                <Switch checked={!!sel.is_pinned} onCheckedChange={(v) => onTogglePin('custom', sel.id, v)} />
              </label>

              <div className="rounded-md border border-border bg-card p-2.5 space-y-2">
                <div className="flex items-center gap-3">
                  <CircleDot className={cn('size-4 shrink-0', (sel.show_radius ?? true) ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">Radio de referencia</div>
                    <div className="text-xs text-muted-foreground">
                      {(sel.show_radius ?? true)
                        ? `Zona de influencia visual (${sel.radius_km ?? 1} km) activa en mapa`
                        : 'Zona de influencia visual desactivada'}
                    </div>
                  </div>
                  <Switch
                    checked={sel.show_radius ?? true}
                    onCheckedChange={(val) =>
                      onUpdateLocationRadius(sel.id, val, sel.radius_km ?? 1.0)
                    }
                  />
                </div>

                {(sel.show_radius ?? true) && (
                  <div className="pt-2 border-t border-border/60 space-y-2 animate-in fade-in-0 duration-150">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Alcance del radio
                      </span>
                      <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                        {sel.radius_km ?? 1} km
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0.1}
                        max={500}
                        step={0.1}
                        defaultValue={sel.radius_km ?? 1}
                        key={`${sel.id}-${sel.radius_km}`}
                        onBlur={(e) => {
                          const val = Math.max(0.1, Number(e.target.value) || 1.0);
                          if (val !== (sel.radius_km ?? 1)) {
                            onUpdateLocationRadius(sel.id, sel.show_radius ?? true, val);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = Math.max(0.1, Number((e.target as HTMLInputElement).value) || 1.0);
                            onUpdateLocationRadius(sel.id, sel.show_radius ?? true, val);
                          }
                        }}
                        className={cn(fieldClass, 'font-mono text-xs tabular-nums')}
                      />
                      <span className="font-mono text-xs text-muted-foreground shrink-0">km</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {[0.5, 1, 2, 5, 10, 25].map((presetKm) => (
                        <button
                          key={presetKm}
                          type="button"
                          onClick={() =>
                            onUpdateLocationRadius(sel.id, sel.show_radius ?? true, presetKm)
                          }
                          className={cn(
                            'rounded border px-2 py-0.5 font-mono text-[10px] transition-colors cursor-pointer',
                            (sel.radius_km ?? 1) === presetKm
                              ? 'border-primary/50 bg-primary/20 text-primary font-semibold'
                              : 'border-border bg-background text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                          )}
                        >
                          {presetKm} km
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TELETRANSPORTAR A */}
          <BatchTeleportModal
            sel={sel}
            instances={instances}
            targets={targets}
            setTargets={setTargets}
            teleporting={teleporting}
            jobs={jobs}
            onTeleport={onTeleport}
            onResetTeleport={onResetTeleport}
          />
        </div>
      ) : (
        /* ── VISTA GENERAL (sin selección) ── */
        <div key="overview" className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 duration-200">
          <div className="border-b border-border p-4">
            <h3 className={sectionTitleClass}>Predeterminada del sistema</h3>
            {defaultLoc ? (
              <div className="mt-2 flex items-center gap-3 rounded-md border border-border bg-card p-2.5">
                <div className="grid size-9 shrink-0 place-items-center rounded-md bg-warning/15 text-warning">
                  <Star className="size-4 fill-current" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{defaultLoc.name}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {defaultLoc.latitude.toFixed(4)}, {defaultLoc.longitude.toFixed(4)} · {formatUtcOffset(defaultLoc.timezone)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onCenterOnDefault}
                  title="Centrar en el mapa"
                  className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <LocateFixed className="size-4" />
                </button>
              </div>
            ) : (
              <div className="mt-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                Sin predeterminada. Activala desde el panel de cualquier ubicación.
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-4 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className={sectionTitleClass}>Ubicaciones</h3>
              <span className="font-mono text-[11px] text-muted-foreground">
                {visibleLocations.length}/{catalog.locations.length}
              </span>
            </div>

            {loading ? (
              <div className="space-y-1.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-11 animate-pulse rounded-md bg-card" />
                ))}
              </div>
            ) : catalog.locations.length === 0 ? (
              <div className="grid flex-1 place-items-center pb-4 text-center">
                <div>
                  <MapPin className="mx-auto mb-2 size-7 text-muted-foreground/40" />
                  <p className="text-sm font-medium">Sin ubicaciones guardadas</p>
                  <p className="mt-1 text-xs text-muted-foreground">Hacé clic en el mapa para crear la primera.</p>
                </div>
              </div>
            ) : visibleLocations.length === 0 ? (
              <div className="grid flex-1 place-items-center pb-4 text-center">
                <div>
                  <SearchX className="mx-auto mb-2 size-7 text-muted-foreground/40" />
                  <p className="text-sm font-medium">Ninguna ubicación coincide</p>
                  <button type="button" onClick={onClearFilters} className="mt-2 cursor-pointer text-xs text-primary hover:underline">
                    Limpiar filtros
                  </button>
                </div>
              </div>
            ) : (
              <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 pb-2">
                {visibleLocations.map((loc) => {
                  const grp = loc.group_id ? groupsMap.get(loc.group_id) : undefined;
                  const phones = phonesByLocation.get(loc.id) ?? [];
                  const online = phones.filter((p) => p.running).length;
                  const isDefault = defaultLoc?.id === loc.id;
                  return (
                    <li key={loc.id}>
                      <button
                        type="button"
                        onClick={() => onSelectLocation(loc)}
                        onMouseEnter={() => onHighlightLocation(loc.id)}
                        onMouseLeave={() => onHighlightLocation(null)}
                        className="group flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-card"
                      >
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: grp?.color || UNGROUPED_COLOR }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            <span className="truncate">{loc.name}</span>
                            {isDefault && <Star className="size-3 shrink-0 fill-current text-warning" />}
                            {loc.is_pinned && <Pin className="size-3 shrink-0 fill-current text-primary" />}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {loc.city}
                            {grp ? ` · ${grp.name}` : ''}
                          </div>
                        </div>
                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                            phones.length === 0
                              ? 'text-muted-foreground/60'
                              : online > 0
                              ? 'bg-success/15 text-success'
                              : 'bg-muted text-muted-foreground'
                          )}
                          title={`${online}/${phones.length} teléfonos online`}
                        >
                          <Smartphone className="size-3" /> {phones.length}
                        </span>
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
            <MousePointerClick className="size-3.5 shrink-0 text-primary" />
            <span className="flex-1">Clic en el mapa para crear una ubicación</span>
            <kbd className="rounded-sm border border-border bg-background px-1.5 font-mono text-[10px]">/</kbd>
            <span>buscar</span>
          </div>
        </div>
      )}
    </aside>
  );
};
