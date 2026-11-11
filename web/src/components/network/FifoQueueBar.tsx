import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Router,
  ChevronRight,
  ArrowRightLeft,
  Loader2,
} from 'lucide-react';
import { TooltipSimple } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { GRACE_SECONDS } from './networkTypes';

export function CountdownRing({
  pendingOffer,
  total = GRACE_SECONDS,
  onExpire,
}: {
  pendingOffer?: { expires_at?: number; expires_in_seconds?: number } | null;
  total?: number;
  onExpire?: () => void;
}) {
  const computeRemaining = () => {
    if (!pendingOffer) return total;
    const expiresAt = pendingOffer.expires_at
      ? pendingOffer.expires_at * 1000
      : Date.now() + (pendingOffer.expires_in_seconds || 5) * 1000;
    return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  };

  const [value, setValue] = useState(computeRemaining);
  const [prevOffer, setPrevOffer] = useState(pendingOffer);
  if (pendingOffer !== prevOffer) {
    setPrevOffer(pendingOffer);
    setValue(computeRemaining());
  }

  useEffect(() => {
    if (!pendingOffer) return;
    const expiresAt = pendingOffer.expires_at
      ? pendingOffer.expires_at * 1000
      : Date.now() + (pendingOffer.expires_in_seconds || 5) * 1000;

    let refreshTimer: number | undefined;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setValue(remaining);
      if (remaining <= 0 && refreshTimer === undefined && onExpire) {
        refreshTimer = window.setTimeout(onExpire, 800);
      }
    }, 250);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(refreshTimer);
    };
  }, [pendingOffer, total, onExpire]);

  const r = 22;
  const c = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(1, value / total));
  return (
    <div className="relative grid size-14 shrink-0 place-items-center">
      <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="4" className="stroke-primary/20" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          className="stroke-primary transition-[stroke-dashoffset] duration-700 ease-linear"
        />
      </svg>
      <div className="text-center leading-none">
        <div className="font-mono text-lg font-bold tabular-nums text-foreground">{value}</div>
        <div className="font-mono text-[8px] uppercase text-muted-foreground">seg</div>
      </div>
    </div>
  );
}

export interface FifoQueueBarProps {
  waitingQueue: string[];
  pendingOffer: {
    instance: string;
    device_serial?: string;
    expires_in_seconds?: number;
    expires_at?: number;
  } | null;
  countdown?: number | null;
  busyAction: string | null;
  onClaimUsb: (instanceName: string) => void;
  onDeclineOffer: (instanceName: string) => void;
  onExpire?: () => void;
}

export function FifoQueueBar({
  waitingQueue,
  pendingOffer,
  busyAction,
  onClaimUsb,
  onDeclineOffer,
  onExpire,
}: FifoQueueBarProps) {
  return (
    <div className="shrink-0 border-t border-border bg-surface">
      <div className="flex items-center justify-between px-4 pt-2.5 pb-2 select-none">
        <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Cola FIFO
          <span className="font-mono normal-case tracking-normal">({waitingQueue.length})</span>
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          Orden de promoción · gracia {GRACE_SECONDS}s
        </span>
      </div>

      <div className="flex h-[92px] items-stretch gap-2 overflow-x-auto px-4 pb-3">
        {waitingQueue.length === 0 && !pendingOffer ? (
          <div className="flex flex-1 items-center justify-center gap-3 rounded-md border border-dashed border-border text-left">
            <CheckCircle2 className="size-5 shrink-0 text-success" />
            <div>
              <p className="text-sm font-medium text-foreground">Cola de espera vacía</p>
              <p className="text-xs text-muted-foreground">
                Todas las instancias que requieren red están atendidas o en reposo.
              </p>
            </div>
          </div>
        ) : (
          <>
            {pendingOffer && (
              <div className="flex w-[330px] shrink-0 items-center gap-3 rounded-md border border-primary bg-card p-2.5">
                <CountdownRing pendingOffer={pendingOffer} onExpire={onExpire} total={GRACE_SECONDS} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-sm bg-primary px-1.5 py-px font-mono text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                      Turno activo #1
                    </span>
                    {pendingOffer.device_serial && (
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {pendingOffer.device_serial}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    Módem disponible para{' '}
                    <span className="font-mono font-semibold text-foreground">{pendingOffer.instance}</span>
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onClaimUsb(pendingOffer.instance)}
                      disabled={busyAction === `claim-${pendingOffer.instance}`}
                      className="inline-flex h-6 flex-1 items-center justify-center gap-1 rounded-sm bg-primary text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      {busyAction === `claim-${pendingOffer.instance}` ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Router className="size-3" />
                      )}
                      Conectar ya
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeclineOffer(pendingOffer.instance)}
                      disabled={busyAction === `decline-${pendingOffer.instance}`}
                      className="inline-flex h-6 items-center justify-center gap-1 rounded-sm border border-border bg-card px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50 cursor-pointer"
                    >
                      {busyAction === `decline-${pendingOffer.instance}` ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <ArrowRightLeft className="size-3 text-muted-foreground" />
                      )}
                      Ceder turno
                    </button>
                  </div>
                </div>
              </div>
            )}

            {waitingQueue.map((inst, idx) => {
              if (pendingOffer?.instance === inst) return null;
              const isNext = idx === 0 || (idx === 1 && pendingOffer?.instance === waitingQueue[0]);
              return (
                <div key={inst} className="flex shrink-0 items-center gap-2">
                  {(idx > 0 || pendingOffer) && <ChevronRight className="size-3.5 text-muted-foreground/50" />}
                  <div
                    className={cn(
                      'flex h-full w-[172px] flex-col justify-between rounded-md border p-2',
                      'border-border bg-card'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'grid h-5 min-w-5 place-items-center rounded-sm px-1 font-mono text-[10px] font-bold',
                          isNext ? 'bg-primary text-primary-foreground' : 'border border-border bg-muted text-foreground'
                        )}
                      >
                        #{idx + 1}
                      </span>
                      <span className="truncate font-mono text-xs font-semibold text-foreground">{inst}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className={cn('truncate text-[10px]', isNext ? 'text-primary' : 'text-muted-foreground')}>
                        {isNext ? 'Próximo turno' : 'En cuarentena'}
                      </span>
                      <TooltipSimple content={isNext ? 'Forzar turno prioritario a esta instancia' : 'Reclamar módem'}>
                        <button
                          type="button"
                          onClick={() => onClaimUsb(inst)}
                          disabled={busyAction === `claim-${inst}`}
                          className={cn(
                            'inline-flex h-6 items-center gap-1 rounded-sm border px-2 font-mono text-[10px] font-medium transition-colors disabled:opacity-40 cursor-pointer',
                            'border-border bg-surface text-foreground hover:border-muted-foreground/40 hover:bg-surface-2'
                          )}
                        >
                          {busyAction === `claim-${inst}` ? <Loader2 className="size-3 animate-spin" /> : 'Reclamar'}
                        </button>
                      </TooltipSimple>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
