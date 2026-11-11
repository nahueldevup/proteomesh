import type { Instance, CustomLocation } from '../../types';

export const PALETTE_COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#6366f1', // indigo
];

export const UNGROUPED_COLOR = '#94a3b8';
export const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';
export const DEFAULT_PRESET_MARKER_ID = '__default__';
export const COORD_EPSILON = 0.0005;

export type Scope = 'all' | 'pinned';
export type JobState = 'running' | 'ok' | 'fail';

/** UTC±H legible a partir de una zona IANA. */
export function formatUtcOffset(tz?: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName');
    const raw = part?.value ?? 'GMT';
    return raw === 'GMT' ? 'UTC' : raw.replace('GMT', 'UTC').replace('-', '−');
  } catch {
    return '—';
  }
}

export const sameCoords = (aLat: number, aLon: number, bLat: number, bLon: number) =>
  Math.abs(aLat - bLat) < COORD_EPSILON && Math.abs(aLon - bLon) < COORD_EPSILON;

/** Un CloudPhone está "en" una ubicación si la referencia por id o si sus coordenadas coinciden. */
export function isPhoneAtLocation(inst: Instance, loc: CustomLocation) {
  const l = inst.location;
  if (!l) return false;
  if (l.custom_location_id) return l.custom_location_id === loc.id;
  return sameCoords(l.latitude, l.longitude, loc.latitude, loc.longitude);
}

export const fieldClass =
  'h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary';
export const fieldLabelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground';
export const toolbarBtnClass =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 font-mono text-xs font-medium transition-colors cursor-pointer';
export const sectionTitleClass = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground';
