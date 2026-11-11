import { type ReactNode } from 'react';
import {
  Router,
  RotateCw,
  ArrowRightLeft,
  ShieldAlert,
  Smartphone,
  ExternalLink,
  Loader2,
  Signal,
  Plane,
  Check,
} from 'lucide-react';
import type { UsbPhysicalPhone, Instance } from '../../types';
import { TooltipSimple } from '../ui/tooltip';
import { cn } from '../../lib/utils';

export interface ModemInspectorProps {
  dev: UsbPhysicalPhone;
  instances: Instance[];
  waitingQueue: string[];
  busyAction: string | null;
  assignTarget: string | null;
  holderOf: (name: string) => UsbPhysicalPhone | null;
  onAssignTarget: (name: string | null) => void;
  onTest: () => void;
  onRotate: () => void;
  onRelease: () => void;
  onAssign: () => void;
  onOpenInstance?: ((name: string) => void) | undefined;
}

export function RadioAction({
  icon,
  label,
  sub,
  onClick,
  disabled,
  destructive,
  title,
}: {
  icon: ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
  disabled?: boolean | undefined;
  destructive?: boolean | undefined;
  title?: string | undefined;
}) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-md border px-2 py-2.5 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
        'border-border bg-card text-foreground',
        destructive
          ? '[&>svg]:text-destructive hover:border-destructive/60'
          : '[&>svg]:text-primary hover:border-muted-foreground/40 hover:bg-surface-2'
      )}
    >
      {icon}
      <span className="text-xs font-semibold leading-none">{label}</span>
      <span className={cn('font-mono text-[10px] leading-none', 'text-muted-foreground')}>
        {sub}
      </span>
    </button>
  );

  return title ? <TooltipSimple content={title}>{btn}</TooltipSimple> : btn;
}

export function ModemInspector({
  dev,
  instances,
  waitingQueue,
  busyAction,
  assignTarget,
  holderOf,
  onAssignTarget,
  onTest,
  onRotate,
  onRelease,
  onAssign,
  onOpenInstance,
}: ModemInspectorProps) {
  const isAssigned = Boolean(dev.assigned_instance);
  const testing = busyAction === `test-${dev.serial}`;
  const rotating = busyAction === `rotate-${dev.assigned_instance}`;
  const releasing = busyAction === `quarantine-${dev.assigned_instance}`;
  const isBusy = testing || rotating || releasing;
  const claiming = assignTarget ? busyAction === `claim-${assignTarget}` : false;
  const assignedInst = instances.find((i) => i.instance_name === dev.assigned_instance);

  const statusLabel =
    dev.status === 'rotating' ? 'Rotando' : dev.status === 'error' ? 'Error' : isAssigned ? 'Asignado' : 'Libre';

  return (
    <>
      {/* Ficha técnica */}
      <div className="border-b border-border p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'grid size-12 shrink-0 place-items-center rounded-md border border-border bg-card'
            )}
          >
            <Router className={cn('size-6', isAssigned ? 'text-primary' : 'text-muted-foreground')} />
          </div>
          <div className="min-w-0 flex-1">
            <TooltipSimple content={dev.model}>
              <h2 className="truncate text-base font-semibold">
                {dev.model}
              </h2>
            </TooltipSimple>
            <p className="truncate font-mono text-xs text-muted-foreground">{dev.serial}</p>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px]">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  dev.status === 'error' ? 'bg-destructive' : isAssigned ? 'bg-success' : 'bg-muted-foreground'
                )}
              />
              <span className="text-foreground">{statusLabel}</span>
              <span className="text-muted-foreground">· {dev.subnet || 'sin subred'}</span>
            </div>
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
          {(
            [
              ['Interfaz', dev.iface],
              ['Red', dev.network_type || '—'],
              ['Batería', dev.battery || '—'],
              ['Operadora', dev.carrier || '—'],
              ['Gateway', dev.gateway || '—'],
              ['IP pública', dev.public_ip || '—'],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="min-w-0 bg-card px-2.5 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
              <TooltipSimple content={String(v)}>
                <dd className="mt-0.5 truncate font-mono text-[11px]">
                  {v}
                </dd>
              </TooltipSimple>
            </div>
          ))}
        </dl>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-sm border border-border bg-card px-1.5 py-0.5',
              dev.mobile_data ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            <Signal className={cn('size-3', dev.mobile_data && 'text-success')} /> Datos {dev.mobile_data ? 'ON' : 'OFF'}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-sm border border-border bg-card px-1.5 py-0.5',
              dev.airplane_mode ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            <Plane className={cn('size-3', dev.airplane_mode && 'text-warning')} /> Modo avión {dev.airplane_mode ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      {/* Controles de radio */}
      <div className="border-b border-border p-4">
        <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Controles de radio</h3>
        <div className="grid grid-cols-3 gap-1.5">
          <RadioAction
            icon={testing ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
            label="Test"
            sub="Modo Avión"
            onClick={onTest}
            disabled={isBusy}
            title="Probar ciclo de Modo Avión para medir tiempo de reconexión"
          />
          <RadioAction
            icon={rotating ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4 text-primary" />}
            label="Rotar IP"
            sub="Nueva pública"
            onClick={onRotate}
            disabled={isBusy || !isAssigned}
            title={isAssigned ? 'Forzar rotación de IP pública' : 'Requiere un CloudPhone asignado'}
          />
          <RadioAction
            icon={releasing ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
            label="Soltar"
            sub="Cuarentena"
            onClick={onRelease}
            disabled={isBusy || !isAssigned}
            destructive
            title={isAssigned ? 'Soltar red y aislar en cuarentena' : 'Requiere un CloudPhone asignado'}
          />
        </div>
      </div>

      {/* Asignación */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        {isAssigned ? (
          <>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Asignado a</h3>
            <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-surface-2">
                <Smartphone className="size-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-sm font-semibold">{dev.assigned_instance}</div>
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  <span className={cn('size-1.5 rounded-full', assignedInst?.running ? 'bg-success' : 'bg-muted-foreground')} />
                  {assignedInst ? `adb :${assignedInst.adb_port}` : 'instancia'} · {dev.public_ip || 'sin IP'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenInstance?.(dev.assigned_instance!)}
              className="mt-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-xs font-medium text-foreground transition-colors hover:bg-surface-2 cursor-pointer"
            >
              <ExternalLink className="size-3.5" /> Abrir en vista enfocada
            </button>
            <p className="mt-auto pt-3 text-center font-mono text-[11px] text-muted-foreground">
              Exclusión mutua 1:1 · soltá el módem para reasignarlo
            </p>
          </>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Asignar a CloudPhone</h3>
              {assignTarget && (
                <button
                  type="button"
                  onClick={() => onAssignTarget(null)}
                  className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Limpiar
                </button>
              )}
            </div>
            {instances.length === 0 ? (
              <div className="grid flex-1 place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                No hay instancias
              </div>
            ) : (
              <div className="grid min-h-0 grid-cols-2 content-start gap-1.5 overflow-y-auto">
                {instances.map((inst) => {
                  const on = assignTarget === inst.instance_name;
                  const holder = holderOf(inst.instance_name);
                  const qPos = waitingQueue.indexOf(inst.instance_name);
                  return (
                    <button
                      key={inst.instance_name}
                      type="button"
                      disabled={isBusy || claiming}
                      onClick={() => onAssignTarget(on ? null : inst.instance_name)}
                      className={cn(
                        'flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-all cursor-pointer disabled:cursor-not-allowed',
                        on ? 'border-primary bg-card font-medium' : 'border-border bg-card hover:border-muted-foreground/40',
                        !inst.running && !on && 'opacity-60'
                      )}
                    >
                      <Smartphone className="size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono">{inst.instance_name}</div>
                        <div className="flex items-center gap-1 truncate font-mono text-[10px] text-muted-foreground">
                          <span className={cn('size-1.5 shrink-0 rounded-full', inst.running ? 'bg-success' : 'bg-muted-foreground/40')} />
                          {holder ? (
                            <span className="truncate">con módem</span>
                          ) : qPos >= 0 ? (
                            <span className="truncate text-warning">en cola #{qPos + 1}</span>
                          ) : (
                            <span>:{inst.adb_port}</span>
                          )}
                        </div>
                      </div>
                      {on ? (
                        <span className="grid size-3.5 place-items-center rounded-sm bg-primary">
                          <Check className="size-2.5 text-primary-foreground" />
                        </span>
                      ) : (
                        <span className="size-3.5 rounded-sm border border-border" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-auto pt-3">
              <button
                type="button"
                onClick={onAssign}
                disabled={!assignTarget || isBusy || claiming}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                {claiming ? <Loader2 className="size-4 animate-spin" /> : <Router className="size-4" />}
                {assignTarget ? `Asignar a ${assignTarget}` : 'Elegí un CloudPhone destino'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
