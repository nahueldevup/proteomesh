import type { ComponentType } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import type { ApkEntry } from '../../types';
import { cn } from '../../lib/utils';

type ActionStatus = 'idle' | 'rotating' | 'claiming' | 'quarantining' | 'declining';

export interface UsbPopoverContentProps {
  assignedDev: { iface: string; carrier: string } | null;
  publicIp?: string | null;
  actionStatus: ActionStatus;
  isBusy: boolean;
  running: boolean;
  onRotateIp: () => void;
  onQuarantine: () => void;
  onClaimUsb: () => void;
}

export function UsbPopoverContent({
  assignedDev,
  publicIp,
  actionStatus,
  isBusy,
  running,
  onRotateIp,
  onQuarantine,
  onClaimUsb,
}: UsbPopoverContentProps) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border/60 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span className="text-foreground">Red USB Módem</span>
        {assignedDev && publicIp && (
          <span className="rounded-xs bg-success/15 text-success px-1">{publicIp}</span>
        )}
      </div>

      {actionStatus === 'rotating' ? (
        <StatusRow icon={Loader2} text="ROTANDO" spin />
      ) : actionStatus === 'claiming' ? (
        <StatusRow icon={Loader2} text="RECLAMANDO" spin />
      ) : actionStatus === 'quarantining' ? (
        <StatusRow icon={Loader2} text="AISLANDO" spin />
      ) : assignedDev ? (
        <div className="space-y-1.5">
          <div className="text-[10px] text-muted-foreground truncate">
            {assignedDev.iface} • {assignedDev.carrier}
          </div>
          <button
            type="button"
            onClick={onRotateIp}
            disabled={isBusy}
            className="w-full flex items-center gap-1.5 rounded-xs border border-border bg-card px-2 py-1 text-left text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw className="h-3 w-3 text-primary" />
            Rotar IP
          </button>
          <button
            type="button"
            onClick={onQuarantine}
            disabled={isBusy}
            className="w-full flex items-center gap-1.5 rounded-xs border border-destructive/40 bg-destructive/10 px-2 py-1 text-left text-[11px] font-bold text-destructive hover:bg-destructive/20 transition-colors"
          >
            Soltar Red
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-[10px] text-muted-foreground">Estado: En cuarentena segura</div>
          <button
            type="button"
            onClick={onClaimUsb}
            disabled={isBusy || !running}
            className="w-full flex items-center gap-1.5 rounded-xs border border-primary/40 bg-primary/20 px-2 py-1 text-left text-[11px] font-bold text-foreground hover:bg-primary/30 transition-colors"
          >
            Reclamar Módem USB
          </button>
        </div>
      )}
    </>
  );
}

export interface TurnsPopoverContentProps {
  isOffered: boolean;
  isWaiting: boolean;
  waitingPos: number | null;
  offerSeconds: number;
  isBusy: boolean;
  onClaimUsb: () => void;
  onDeclineOffer: () => void;
  onCancelWaiting: () => void;
}

export function TurnsPopoverContent({
  isOffered,
  isWaiting,
  waitingPos,
  offerSeconds,
  isBusy,
  onClaimUsb,
  onDeclineOffer,
  onCancelWaiting,
}: TurnsPopoverContentProps) {
  return (
    <>
      <div className="border-b border-border/60 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Estado de Turno
      </div>

      {isOffered ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-bold text-foreground">Módem listo</span>
            <span className="rounded-xs bg-primary text-primary-foreground font-bold px-1 text-[9px]">
              {offerSeconds}s
            </span>
          </div>
          <div className="flex items-center gap-1 pt-0.5">
            <button
              type="button"
              onClick={onClaimUsb}
              disabled={isBusy}
              className="flex-1 rounded-xs bg-primary text-primary-foreground font-bold text-[10px] py-1 hover:opacity-90"
            >
              Conectar ya
            </button>
            <button
              type="button"
              onClick={onDeclineOffer}
              disabled={isBusy}
              className="flex-1 rounded-xs border border-border bg-muted/40 hover:bg-muted text-foreground text-[10px] py-1"
            >
              Ceder turno
            </button>
          </div>
        </div>
      ) : isWaiting ? (
        <div className="space-y-1.5">
          <div className="text-[10px] text-foreground font-semibold">
            Posición en cola: <span className="font-bold text-primary">#{waitingPos}</span>
          </div>
          <div className="flex items-center gap-1 pt-0.5">
            <button
              type="button"
              onClick={onClaimUsb}
              disabled={isBusy}
              className="flex-1 rounded-xs border border-border bg-card hover:bg-muted text-foreground text-[10px] py-1"
            >
              Reclamar ya
            </button>
            <button
              type="button"
              onClick={onCancelWaiting}
              disabled={isBusy}
              className="flex-1 rounded-xs border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 text-destructive text-[10px] py-1"
            >
              Salir de cola
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-1 text-[10px] text-muted-foreground">
          Sin ofertas ni esperas activas.
        </div>
      )}
    </>
  );
}

export interface ApkPopoverContentProps {
  apks: ApkEntry[];
  loading: boolean;
  installingId: number | null;
  onInstall: (apk: ApkEntry) => void;
}

export function ApkPopoverContent({
  apks,
  loading,
  installingId,
  onInstall,
}: ApkPopoverContentProps) {
  return (
    <>
      <div className="mb-1.5 border-b border-border/60 pb-1 text-[10px] font-bold uppercase text-muted-foreground">
        Instalar APK
      </div>
      {loading ? (
        <div className="flex items-center gap-1.5 py-1 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
        </div>
      ) : apks.length === 0 ? (
        <div className="py-1 text-[10px] text-muted-foreground">No hay APKs en el repositorio.</div>
      ) : (
        <div className="mb-1.5 max-h-44 overflow-y-auto space-y-1">
          {apks.map((apk) => (
            <button
              key={apk.id}
              type="button"
              disabled={installingId !== null}
              onClick={(e) => {
                e.stopPropagation();
                onInstall(apk);
              }}
              className="w-full rounded-xs border border-border bg-card px-2 py-1 text-left text-[10px] text-foreground hover:bg-muted disabled:opacity-40"
            >
              <div className="truncate font-medium">{apk.original_name}</div>
              <div className="truncate text-[9px] text-muted-foreground">{apk.package}</div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function StatusRow({
  icon: Icon,
  text,
  spin = false,
}: {
  icon: ComponentType<{ className?: string }>;
  text: string;
  spin?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-xs bg-card/90 text-foreground border border-primary/50 px-1.5 py-px text-[8px] font-bold font-mono">
      <Icon className={cn('h-2.5 w-2.5 text-primary', spin && 'animate-spin')} />
      {text}
    </span>
  );
}
