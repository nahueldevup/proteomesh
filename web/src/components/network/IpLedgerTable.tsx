import type React from 'react';
import {
  Search,
  Globe,
  Smartphone,
  ChevronDown,
  Check,
  ShieldCheck,
  Loader2,
  Trash2,
} from 'lucide-react';
import type { IpLedgerEntry } from '../../types';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Switch } from '../ui/switch';
import { TooltipSimple } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { PAGE_SIZES, TTL_OPTIONS } from './networkTypes';

export interface IpLedgerTableProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  activeOnly: boolean;
  setActiveOnly: (active: boolean) => void;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  pageSize: number;
  setPageSize: (size: number) => void;
  pageSizeOpen: boolean;
  setPageSizeOpen: (open: boolean) => void;
  filteredEntries: IpLedgerEntry[];
  paginatedEntries: IpLedgerEntry[];
  ledgerEntries: IpLedgerEntry[];
  currentTtl: string;
  busyAction: string | null;
  onSetTtl: (ttl: string) => void;
  onConfirmPurge: () => void;
  onSelectInstance?: ((name: string) => void) | undefined;
}

export function IpLedgerTable({
  searchTerm,
  setSearchTerm,
  activeOnly,
  setActiveOnly,
  page,
  setPage,
  pageSize,
  setPageSize,
  pageSizeOpen,
  setPageSizeOpen,
  filteredEntries,
  paginatedEntries,
  ledgerEntries,
  currentTtl,
  busyAction,
  onSetTtl,
  onConfirmPurge,
  onSelectInstance,
}: IpLedgerTableProps) {
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const activeEntries = ledgerEntries.filter((e) => e.is_active).length;
  const expiredEntries = ledgerEntries.length - activeEntries;

  return (
    <>
      {/* LIBRO MAYOR: tabla paginada */}
      <section className="flex min-w-0 flex-1 flex-col border-r border-border">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por IP, CloudPhone, serial u operadora…"
              className="h-8 w-full rounded-md border border-input bg-surface pl-8 pr-3 font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
          <label htmlFor="ip-ledger-active-only" className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
            <Switch
              id="ip-ledger-active-only"
              checked={activeOnly}
              onCheckedChange={(v) => {
                setActiveOnly(v);
                setPage(1);
              }}
              className="data-[state=checked]:bg-success"
              aria-label="Solo activas"
            />
            Solo activas
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[150px]" />
              <col className="w-auto" />
              <col className="w-[150px]" />
              <col className="w-[110px]" />
              <col className="w-[170px]" />
              <col className="w-[110px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-background text-left text-[11px] uppercase tracking-wider text-muted-foreground select-none">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">IP pública</th>
                <th className="px-2 py-2 font-medium">CloudPhone dueño</th>
                <th className="px-2 py-2 font-medium">Módem / Serial</th>
                <th className="px-2 py-2 font-medium">Operadora</th>
                <th className="px-2 py-2 font-medium">Último uso</th>
                <th className="px-4 py-2 font-medium">Retención</th>
              </tr>
            </thead>
            <tbody>
              {paginatedEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">
                    <Globe className="mx-auto mb-2 size-7 opacity-40" />
                    No hay registros de IPs en el historial con los filtros actuales.
                  </td>
                </tr>
              ) : (
                paginatedEntries.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 transition-colors hover:bg-surface-2/60">
                    <td className="px-4 py-2 font-mono text-xs font-semibold text-foreground tabular-nums">{row.ip}</td>
                    <td className="px-2 py-2" aria-label={`CloudPhone dueño: ${row.instance_name}`}>
                      <TooltipSimple content="Abrir CloudPhone en Vista Enfocada">
                        <button
                          type="button"
                          onClick={() => onSelectInstance?.(row.instance_name)}
                          className="inline-flex max-w-full items-center gap-1.5 font-mono text-xs font-medium text-primary hover:underline cursor-pointer"
                        >
                          <Smartphone className="size-3 shrink-0" />
                          <span className="truncate">{row.instance_name}</span>
                        </button>
                      </TooltipSimple>
                    </td>
                    <td className="truncate px-2 py-2 font-mono text-xs text-muted-foreground" aria-label={`Módem: ${row.usb_id}`}>
                      <TooltipSimple content={`Módem: ${row.usb_id}`}>
                        <span className="truncate block">{row.usb_id}</span>
                      </TooltipSimple>
                    </td>
                    <td className="truncate px-2 py-2 text-xs text-foreground">{row.carrier || 'Móvil'}</td>
                    <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground tabular-nums">
                      {new Date(row.last_seen_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      {row.is_active ? (
                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-foreground">
                          <span className="size-1.5 shrink-0 rounded-full bg-success" /> Activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground/70">
                          <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/30" /> Expirada
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-1.5 font-mono text-[11px] text-muted-foreground select-none">
          <span>
            {filteredEntries.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredEntries.length)} de{' '}
            {filteredEntries.length} IPs registradas
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Por página</span>
              <Popover open={pageSizeOpen} onOpenChange={setPageSizeOpen}>
                <PopoverTrigger asChild>
                  <div>
                    <TooltipSimple content="Cambiar límite de registros por página">
                      <button
                        type="button"
                        className="flex h-6 items-center gap-1 rounded-sm border border-border bg-surface px-1.5 text-[11px] text-foreground transition-colors hover:bg-surface-2 cursor-pointer"
                      >
                        {pageSize}
                        <ChevronDown className={cn('size-3 opacity-60 transition-transform duration-200', pageSizeOpen && 'rotate-180')} />
                      </button>
                    </TooltipSimple>
                  </div>
                </PopoverTrigger>
                <PopoverContent side="top" align="center" sideOffset={4} className="w-20 space-y-0.5 p-1 font-mono text-[11px]">
                  {PAGE_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setPageSize(size);
                        setPage(1);
                        setPageSizeOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xs px-2 py-1 text-left transition-colors cursor-pointer',
                        pageSize === size ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {size}
                      {pageSize === size && <Check className="size-3 text-primary" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-6 rounded-sm border border-border bg-surface px-2 text-[11px] text-foreground transition-colors hover:bg-surface-2 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="px-1.5 tabular-nums">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-6 rounded-sm border border-border bg-surface px-2 text-[11px] text-foreground transition-colors hover:bg-surface-2 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        </footer>
      </section>

      {/* ASIDE: POLÍTICA ANTI-VINCULACIÓN */}
      <aside className="flex w-[380px] shrink-0 select-none flex-col overflow-hidden bg-surface">
        <div className="border-b border-border p-4">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-card">
              <ShieldCheck className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Anti-vinculación</h2>
              <p className="text-xs text-muted-foreground">
                Historial con ventana TTL para prevenir colisiones de IP entre CloudPhones.
              </p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
            {(
              [
                ['Registros', ledgerEntries.length, 'text-foreground'],
                ['Activas', activeEntries, 'text-success'],
                ['Expiradas', expiredEntries, 'text-muted-foreground'],
              ] as const
            ).map(([k, v, c]) => (
              <div key={k} className="bg-card px-2.5 py-2">
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
                <dd className={cn('mt-0.5 font-mono text-base font-semibold tabular-nums', c)}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Política de retención TTL
          </h3>
          <div className="space-y-1.5">
            {TTL_OPTIONS.map((opt) => {
              const on = currentTtl === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={busyAction === 'set-ttl'}
                  onClick={() => !on && onSetTtl(opt.value)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-all cursor-pointer disabled:cursor-wait',
                    on ? 'border-primary bg-card' : 'border-border bg-card hover:border-muted-foreground/40'
                  )}
                >
                  <span
                    className={cn(
                      'grid size-4 shrink-0 place-items-center rounded-full border',
                      on ? 'border-primary bg-primary' : 'border-border'
                    )}
                  >
                    {on && <Check className="size-2.5 text-primary-foreground" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{opt.hint}</div>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{opt.value}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-auto pt-4">
            <button
              type="button"
              onClick={onConfirmPurge}
              disabled={busyAction === 'purge'}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:border-destructive/60 hover:text-destructive disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              {busyAction === 'purge' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4 text-destructive" />}
              Purgar expirados
              <span className="font-mono text-xs text-muted-foreground">({expiredEntries})</span>
            </button>
            <p className="mt-2 text-center font-mono text-[11px] text-muted-foreground">
              Elimina registros cuya retención ya expiró
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
