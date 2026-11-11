import React from 'react';
import { Smartphone, Navigation, Loader2, Check, X } from 'lucide-react';
import type { CustomLocation, Instance } from '../../types';
import { cn } from '../../lib/utils';
import { sectionTitleClass, isPhoneAtLocation, type JobState } from './locationsTypes';

export interface BatchTeleportModalProps {
  sel: CustomLocation;
  instances: Instance[];
  targets: string[];
  setTargets: React.Dispatch<React.SetStateAction<string[]>>;
  teleporting: boolean;
  jobs: Record<string, JobState>;
  onTeleport: () => void;
  onResetTeleport: () => void;
}

export const BatchTeleportModal: React.FC<BatchTeleportModalProps> = ({
  sel,
  instances,
  targets,
  setTargets,
  teleporting,
  jobs,
  onTeleport,
  onResetTeleport,
}) => {
  const selPhones = instances.filter((p) => isPhoneAtLocation(p, sel));

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className={sectionTitleClass}>
          Teletransportar a <span className="normal-case tracking-normal">· {selPhones.length} aquí</span>
        </h3>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            className="cursor-pointer text-primary hover:underline disabled:opacity-40"
            disabled={teleporting}
            onClick={() =>
              setTargets(instances.filter((p) => !isPhoneAtLocation(p, sel)).map((p) => p.instance_name))
            }
          >
            Faltantes
          </button>
          <button
            type="button"
            className="cursor-pointer text-primary hover:underline disabled:opacity-40"
            disabled={teleporting}
            onClick={() => setTargets(instances.map((p) => p.instance_name))}
          >
            Todas
          </button>
          <button
            type="button"
            className="cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-40"
            disabled={teleporting}
            onClick={onResetTeleport}
          >
            Limpiar
          </button>
        </div>
      </div>

      {instances.length === 0 ? (
        <div className="grid flex-1 place-items-center rounded-md border border-dashed border-border text-center text-xs text-muted-foreground">
          <div>
            <Smartphone className="mx-auto mb-2 size-6 opacity-40" />
            No hay CloudPhones creados.
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 grid-cols-2 content-start gap-1.5 overflow-auto">
          {instances.map((p) => {
            const on = targets.includes(p.instance_name);
            const here = isPhoneAtLocation(p, sel);
            const job = jobs[p.instance_name];
            const currentLabel = p.location?.custom_name || p.location?.city;
            return (
              <button
                key={p.instance_name}
                type="button"
                disabled={teleporting}
                onClick={() =>
                  setTargets((t) => (on ? t.filter((x) => x !== p.instance_name) : [...t, p.instance_name]))
                }
                title={currentLabel ? `Ubicación actual: ${currentLabel}` : 'Sin ubicación GPS asignada'}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-all disabled:cursor-wait',
                  !p.running && !on && 'opacity-60',
                  on ? 'glow-primary border-primary bg-primary/10 font-medium' : 'border-border bg-card hover:border-muted-foreground/40'
                )}
              >
                <Smartphone className="size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono">{p.instance_name}</div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className={cn('size-1.5 shrink-0 rounded-full', p.running ? 'bg-success' : 'bg-muted-foreground')} />
                    {job === 'running' ? (
                      'aplicando…'
                    ) : job === 'ok' ? (
                      <span className="font-medium text-success">teletransportado</span>
                    ) : job === 'fail' ? (
                      <span className="text-destructive">falló</span>
                    ) : here ? (
                      <span className="rounded-sm bg-success/15 px-1 font-mono font-medium text-success">ya asignada</span>
                    ) : !p.location ? (
                      <span className="rounded-sm bg-warning/15 px-1 font-mono font-medium text-warning">sin gps</span>
                    ) : (
                      <span className="truncate">{currentLabel}</span>
                    )}
                  </div>
                </div>
                {job === 'running' ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                ) : job === 'ok' ? (
                  <Check className="size-3.5 shrink-0 text-success" />
                ) : job === 'fail' ? (
                  <X className="size-3.5 shrink-0 text-destructive" />
                ) : on ? (
                  <span className="grid size-3.5 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground">
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                ) : (
                  <span className="size-3.5 shrink-0 rounded-sm border border-border" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-auto pt-3">
        <button
          type="button"
          onClick={onTeleport}
          disabled={!targets.length || teleporting}
          className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {teleporting ? <Loader2 className="size-4 animate-spin" /> : <Navigation className="size-4" />}
          {teleporting
            ? 'Teletransportando…'
            : targets.length
            ? `Teletransportar (${targets.length}) a ${sel.name}`
            : 'Elegí teléfonos destino'}
        </button>
        <p className="mt-2 text-center font-mono text-[11px] text-muted-foreground">
          GPS · zona horaria · altitud se aplican en caliente
        </p>
      </div>
    </div>
  );
};

export const BatchTeleportSection = BatchTeleportModal;
