import {
  Router,
  Plane,
  ShieldAlert,
  Loader2,
  Battery,
  BatteryLow,
  ExternalLink,
  Circle,
  Hourglass,
} from 'lucide-react';
import type { UsbPhysicalPhone } from '../../types';
import { TooltipSimple } from '../ui/tooltip';
import { cn } from '../../lib/utils';

export interface ModemInventoryTableProps {
  devices: UsbPhysicalPhone[];
  selectedSerial: string | null;
  busyAction: string | null;
  pendingOfferDeviceSerial?: string | undefined;
  onSelectDevice: (serial: string) => void;
  onOpenInstance?: ((name: string) => void) | undefined;
}

export function BatteryMeter({ battery }: { battery: string }) {
  const n = parseInt(battery, 10);
  if (isNaN(n)) {
    return <span className="font-mono text-xs text-muted-foreground">{battery || '—'}</span>;
  }
  const low = n < 25;
  return (
    <TooltipSimple content={`Batería ${battery}`}>
      <div className="inline-flex items-center gap-1.5 cursor-default">
        {low ? <BatteryLow className="size-3.5 text-warning" /> : <Battery className="size-3.5 text-muted-foreground" />}
        <span className={cn('font-mono text-xs tabular-nums', low ? 'font-semibold text-warning' : 'text-foreground')}>{n}%</span>
      </div>
    </TooltipSimple>
  );
}

export function ModemRow({
  dev,
  active,
  busy,
  offered,
  onSelect,
  onOpenInstance,
}: {
  dev: UsbPhysicalPhone;
  active: boolean;
  busy: boolean;
  offered: boolean;
  onSelect: () => void;
  onOpenInstance?: ((name: string) => void) | undefined;
}) {
  const isAssigned = Boolean(dev.assigned_instance);
  const rotating = dev.status === 'rotating' || busy;

  return (
    <tr
      onClick={onSelect}
      className={cn(
        'cursor-pointer border-b border-border/60 transition-colors',
        active ? 'bg-accent/60' : 'hover:bg-surface-2/60'
      )}
    >
      <td className="px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-md border border-border bg-card'
            )}
          >
            {rotating ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : dev.airplane_mode ? (
              <Plane className="size-4 text-warning" />
            ) : (
              <Router className={cn('size-4', isAssigned ? 'text-primary' : 'text-muted-foreground')} />
            )}
          </div>
          <div className="min-w-0">
            <TooltipSimple content={dev.model}>
              <div className="truncate font-medium">
                {dev.model}
              </div>
            </TooltipSimple>
            <div className="truncate font-mono text-xs text-muted-foreground">{dev.serial}</div>
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5">
        <TooltipSimple content={`Interfaz de red: ${dev.iface}`}>
          <span
            className="inline-block max-w-full truncate rounded-sm border border-border bg-card px-1.5 py-0.5 align-middle font-mono text-[11px] text-foreground cursor-default"
          >
            {dev.iface}
          </span>
        </TooltipSimple>
      </td>
      <td className="px-2 py-2.5">
        <div className="truncate text-xs text-foreground">{dev.carrier}</div>
        <div className="truncate font-mono text-[10px] text-muted-foreground">{dev.network_type}</div>
      </td>
      <td className="px-2 py-2.5">
        <BatteryMeter battery={dev.battery} />
      </td>
      <td className="px-2 py-2.5 font-mono text-xs tabular-nums text-foreground">
        {dev.public_ip || <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-2.5">
        {dev.status === 'error' ? (
          <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-destructive">
            <ShieldAlert className="size-3" /> Error
          </span>
        ) : isAssigned ? (
          <TooltipSimple content={`Ver ${dev.assigned_instance} en FocusView`}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenInstance?.(dev.assigned_instance!);
              }}
              className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground transition-colors hover:border-primary/60 hover:text-primary cursor-pointer"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-success" />
              <span className="truncate">{dev.assigned_instance}</span>
              <ExternalLink className="size-3 shrink-0 opacity-60" />
            </button>
          </TooltipSimple>
        ) : offered ? (
          <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-primary">
            <Hourglass className="size-3" /> Ofertado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-dashed border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            <Circle className="size-2.5" /> Libre
          </span>
        )}
      </td>
    </tr>
  );
}

export function ModemInventoryTable({
  devices,
  selectedSerial,
  busyAction,
  pendingOfferDeviceSerial,
  onSelectDevice,
  onOpenInstance,
}: ModemInventoryTableProps) {
  return (
    <>
      {/* Sub-cabecera del inventario */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2 select-none">
        <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Inventario de módems USB
          <span className="font-mono normal-case tracking-normal">({devices.length})</span>
        </h2>
        <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          Mutex 1:1
        </span>
      </div>

      {/* Tabla de módems */}
      <div className="min-h-0 flex-1 overflow-auto">
        {devices.length === 0 ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <Router className="mx-auto mb-2 size-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">No se detectaron módems conectados</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Conectá un teléfono o dongle USB en CachyOS y activá el <strong>Anclaje a red USB</strong>.
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-auto" />
              <col className="w-[132px]" />
              <col className="w-[118px]" />
              <col className="w-[96px]" />
              <col className="w-[128px]" />
              <col className="w-[132px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-background text-left text-[11px] uppercase tracking-wider text-muted-foreground select-none">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Módem</th>
                <th className="px-2 py-2 font-medium">Interfaz</th>
                <th className="px-2 py-2 font-medium">Operadora</th>
                <th className="px-2 py-2 font-medium">Batería</th>
                <th className="px-2 py-2 font-medium">IP pública</th>
                <th className="px-4 py-2 font-medium">Asignación</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((dev) => (
                <ModemRow
                  key={dev.serial}
                  dev={dev}
                  active={selectedSerial === dev.serial}
                  busy={
                    busyAction === `test-${dev.serial}` ||
                    busyAction === `rotate-${dev.assigned_instance}` ||
                    busyAction === `quarantine-${dev.assigned_instance}`
                  }
                  offered={pendingOfferDeviceSerial === dev.serial}
                  onSelect={() => onSelectDevice(dev.serial)}
                  onOpenInstance={onOpenInstance}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
