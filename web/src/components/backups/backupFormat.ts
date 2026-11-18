export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const fut = diff > 0;
  const m = Math.round(abs / 60_000);
  const label =
    m < 1 ? 'ahora' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
  if (label === 'ahora') return label;
  return fut ? `en ${label}` : `hace ${label}`;
}

export function hoursSince(iso?: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

/** Edad del último respaldo → tono semántico. */
export function freshnessTone(hours: number | null): 'success' | 'warning' | 'destructive' {
  if (hours === null) return 'destructive';
  if (hours <= 26) return 'success';
  if (hours <= 24 * 7) return 'warning';
  return 'destructive';
}

export const toneText = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
} as const;

export const toneBg = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
} as const;
