import { useEffect, useState } from 'react';
import { Router, ShieldAlert, RotateCw, Loader2, ArrowRightLeft, Bell, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import type { Instance, UsbNetworkOverview } from '../../types';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { PhoneScreen } from '../farm/PhoneScreen';

interface DeviceCardProps {
  instance: Instance;
  index: number;
  selected: boolean;
  onToggleSelect: (name: string, shiftKey?: boolean) => void;
  onOpen: (name: string) => void;
  syncMode?: boolean;
  usbOverview?: UsbNetworkOverview | null;
  onNetworkChange?: () => void;
}

export default function DeviceCard({
  instance,
  index,
  selected,
  onToggleSelect,
  onOpen,
  syncMode = false,
  usbOverview,
  onNetworkChange,
}: DeviceCardProps) {
  const [tick, setTick] = useState(0);
  const [actionStatus, setActionStatus] = useState<'idle' | 'rotating' | 'claiming' | 'quarantining' | 'declining'>('idle');
  const [showRouterPopover, setShowRouterPopover] = useState(false);
  const [showBellPopover, setShowBellPopover] = useState(false);
  const [offerDismissed, setOfferDismissed] = useState(false);
  const [offerCountdown, setOfferCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!instance.running) return;
    const interval = window.setInterval(() => setTick((t) => t + 1), 4000);
    return () => window.clearInterval(interval);
  }, [instance.running, instance.instance_name]);

  useEffect(() => {
    if (!showRouterPopover && !showBellPopover) return;
    const handleClose = () => {
      setShowRouterPopover(false);
      setShowBellPopover(false);
    };
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, [showRouterPopover, showBellPopover]);

  const isOffered = Boolean(usbOverview?.pending_offer && usbOverview.pending_offer.instance === instance.instance_name);
  const pendingOffer = isOffered ? usbOverview!.pending_offer : null;
  const isWaiting = Boolean(usbOverview?.waiting_queue?.includes(instance.instance_name));
  const waitingPos = isWaiting ? (usbOverview!.waiting_queue.indexOf(instance.instance_name) + 1) : null;
  const assignedDev = usbOverview?.devices?.find((d) => d.assigned_instance === instance.instance_name);

  useEffect(() => {
    if (!isOffered) {
      setOfferDismissed(false);
    }
  }, [isOffered]);

  useEffect(() => {
    if (!pendingOffer || offerDismissed) {
      setOfferCountdown(null);
      return;
    }
    const expiresAt = pendingOffer.expires_at ? pendingOffer.expires_at * 1000 : (Date.now() + (pendingOffer.expires_in_seconds || 5) * 1000);
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setOfferCountdown(remaining);
      if (remaining <= 0) {
        onNetworkChange?.();
      }
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(timer);
  }, [pendingOffer, offerDismissed, onNetworkChange]);

  const handleScreenTap = async (relX: number, relY: number) => {
    if (!syncMode || !instance.running) return;
    const nativeWidth = Number(instance.display?.width) || 1080;
    const nativeHeight = Number(instance.display?.height) || 2340;
    try {
      await api.sendTap(instance.instance_name, relX * nativeWidth, relY * nativeHeight);
    } catch (err) {
      console.error('Error al enviar tap sincronizado:', err);
    }
  };

  const handleClaimUsb = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOfferDismissed(true);
    setOfferCountdown(null);
    setShowRouterPopover(false);
    setShowBellPopover(false);
    if (!instance.running) {
      toast.error('Iniciá el CloudPhone antes de asignarle red');
      return;
    }
    setActionStatus('claiming');
    const toastId = toast.loading(`Conectando módem USB para ${instance.instance_name}...`);
    try {
      const res = await api.claimUsb(instance.instance_name);
      if (res.status === 'waiting') {
        toast.info(res.message || `En cola de espera (#${res.queue_position})`, { id: toastId });
      } else {
        toast.success(`USB conectado (${res.public_ip || 'IP asignada'})`, { id: toastId });
      }
      onNetworkChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al conectar USB', { id: toastId });
    } finally {
      setActionStatus('idle');
    }
  };

  const handleQuarantine = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowRouterPopover(false);
    setShowBellPopover(false);
    setActionStatus('quarantining');
    const toastId = toast.loading(`Aislando ${instance.instance_name} y liberando módem...`);
    try {
      await api.quarantineInstance(instance.instance_name);
      toast.success(`Cuarentena activa para ${instance.instance_name}`, { id: toastId });
      onNetworkChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al aislar instancia', { id: toastId });
    } finally {
      setActionStatus('idle');
    }
  };

  const handleRotateIp = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowRouterPopover(false);
    setShowBellPopover(false);
    setActionStatus('rotating');
    const toastId = toast.loading(`Rotando IP en ${instance.instance_name} (Modo Avión)...`);
    try {
      const res = await api.rotateInstanceIp(instance.instance_name);
      toast.success(`Nueva IP obtenida: ${res.new_ip}`, { id: toastId });
      onNetworkChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al rotar IP', { id: toastId });
    } finally {
      setActionStatus('idle');
    }
  };

  const handleDeclineOffer = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOfferDismissed(true);
    setOfferCountdown(null);
    setShowRouterPopover(false);
    setShowBellPopover(false);
    setActionStatus('declining');
    const toastId = toast.loading(`Cediento turno para ${instance.instance_name}...`);
    try {
      const res = await api.declineOffer(instance.instance_name, true);
      if (res.next_offered) {
        toast.info(`Turno cedido. Próximo: '${res.next_offered}'`, { id: toastId });
      } else {
        toast.success(`Turno cedido`, { id: toastId });
      }
      onNetworkChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al declinar turno', { id: toastId });
    } finally {
      setActionStatus('idle');
    }
  };

  const handleCancelWaiting = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOfferDismissed(true);
    setOfferCountdown(null);
    setShowRouterPopover(false);
    setShowBellPopover(false);
    setActionStatus('declining');
    const toastId = toast.loading(`Cancelando espera para ${instance.instance_name}...`);
    try {
      await api.declineOffer(instance.instance_name, false);
      toast.success(`${instance.instance_name} retirado de la cola`, { id: toastId });
      onNetworkChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al salir de la cola', { id: toastId });
    } finally {
      setActionStatus('idle');
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!instance.running) return;
    if (isOffered) {
      setShowBellPopover(true);
      setShowRouterPopover(false);
    } else {
      setShowRouterPopover((prev) => !prev);
      setShowBellPopover(false);
    }
  };

  return (
    <div
      onClick={(e) => onToggleSelect(instance.instance_name, e.shiftKey)}
      onDoubleClick={() => onOpen(instance.instance_name)}
      onContextMenu={handleContextMenu}
      className={cn(
        'group relative cursor-pointer select-none rounded-sm bg-bezel p-1 transition-all',
        selected ? 'ring-1 ring-primary glow-selected' : 'ring-1 ring-border hover:ring-foreground/40'
      )}
    >
      <div className="relative aspect-[9/19.5] overflow-hidden rounded-xs bg-black [container-type:inline-size]">
        <PhoneScreen
          instance={instance}
          interactive={syncMode && selected}
          compact
          tick={tick}
          onTap={handleScreenTap}
        />

        {/* Slot index tag */}
        <span className="absolute left-1 top-1 rounded-xs bg-background/90 border border-border/80 px-1 font-mono text-[9px] text-foreground/90 z-20">
          {index + 1}
        </span>

        {/* Status badge superior: SOLO CUARENTENA O NOMBRE DE INTERFAZ (Ancho contenido) */}
        <div className="absolute right-1 top-1 z-20 flex items-center">
          {actionStatus === 'rotating' ? (
            <span className="inline-flex items-center gap-1 rounded-xs bg-card/90 text-foreground border border-primary/50 px-1 py-0.2 text-[8px] font-bold font-mono">
              <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
              ROTANDO
            </span>
          ) : actionStatus === 'claiming' ? (
            <span className="inline-flex items-center gap-1 rounded-xs bg-card/90 text-foreground border border-primary/50 px-1 py-0.2 text-[8px] font-bold font-mono">
              <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
              RECLAMANDO
            </span>
          ) : actionStatus === 'quarantining' ? (
            <span className="inline-flex items-center gap-1 rounded-xs bg-destructive/15 text-destructive border border-destructive/40 px-1 py-0.2 text-[8px] font-bold font-mono">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              AISLANDO
            </span>
          ) : actionStatus === 'declining' ? (
            <span className="inline-flex items-center gap-1 rounded-xs bg-muted text-muted-foreground border border-border px-1 py-0.2 text-[8px] font-bold font-mono">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              CEDIENDO
            </span>
          ) : assignedDev ? (
            <span
              className="inline-flex items-center gap-1 rounded-xs bg-card/90 text-foreground border border-border px-1.5 py-0.2 text-[8px] font-mono font-medium max-w-[85px] truncate"
              title={`Conectado por ${assignedDev.iface} (${assignedDev.carrier})`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
              <span className="truncate">{assignedDev.iface}</span>
            </span>
          ) : instance.running ? (
            <span
              className="inline-flex items-center gap-1 rounded-xs bg-muted/90 text-muted-foreground border border-border px-1.5 py-0.2 text-[8px] font-mono max-w-[85px] truncate"
              title="En cuarentena segura"
            >
              CUARENTENA
            </span>
          ) : null}
        </div>

        {/* Popover Router hacia adentro del dispositivo */}
        {showRouterPopover && instance.running && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-2 bottom-3 z-40 rounded-sm border border-border bg-card/95 p-2 shadow-2xl text-xs font-mono text-card-foreground space-y-1.5 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <div className="flex items-center gap-1 text-foreground">
                <Router className="h-3 w-3 text-primary" />
                <span>Red USB Módem</span>
              </div>
              <button
                type="button"
                onClick={() => setShowRouterPopover(false)}
                className="text-muted-foreground hover:text-foreground text-[10px] px-1"
              >
                ✕
              </button>
            </div>

            {assignedDev ? (
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground truncate">
                  {assignedDev.iface} • {assignedDev.carrier}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    setShowRouterPopover(false);
                    handleRotateIp(e);
                  }}
                  disabled={actionStatus !== 'idle'}
                  className="w-full flex items-center gap-1.5 rounded-xs border border-border bg-card px-2 py-1 text-left text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <RotateCw className="h-3 w-3 text-primary" />
                  <span>Rotar IP (Modo Avión)</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    setShowRouterPopover(false);
                    handleQuarantine(e);
                  }}
                  disabled={actionStatus !== 'idle'}
                  className="w-full flex items-center gap-1.5 rounded-xs border border-destructive/40 bg-destructive/10 px-2 py-1 text-left text-[11px] font-bold text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <ShieldAlert className="h-3 w-3 text-destructive" />
                  <span>Soltar Red (Cuarentena)</span>
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground">
                  Estado: En cuarentena segura
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    setShowRouterPopover(false);
                    handleClaimUsb(e);
                  }}
                  disabled={actionStatus !== 'idle'}
                  className="w-full flex items-center gap-1.5 rounded-xs border border-primary/40 bg-primary/20 px-2 py-1 text-left text-[11px] font-bold text-foreground hover:bg-primary/30 transition-colors"
                >
                  <Router className="h-3 w-3 text-primary" />
                  <span>Reclamar Módem USB</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Popover Campanita hacia adentro del dispositivo (Oferta / Cola) */}
        {(showBellPopover || (isOffered && !offerDismissed)) && instance.running && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-2 bottom-3 z-40 rounded-sm border border-primary/60 bg-card/95 p-2 shadow-2xl text-xs font-mono text-card-foreground space-y-1.5 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <div className="flex items-center gap-1 text-foreground">
                <Bell className="h-3 w-3 text-primary" />
                <span>{isOffered ? 'Turno Disponible' : 'Estado de Turno'}</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBellPopover(false);
                  setOfferDismissed(true);
                }}
                className="text-muted-foreground hover:text-foreground text-[10px] px-1"
              >
                ✕
              </button>
            </div>

            {isOffered ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-foreground">
                    Módem listo para conectar
                  </span>
                  <span className="rounded-xs bg-primary text-primary-foreground font-bold px-1 text-[9px]">
                    {offerCountdown !== null ? `${offerCountdown}s` : '5s'}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Conectará automáticamente al terminar el contador.
                </div>
                <div className="flex items-center gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOfferDismissed(true);
                      setShowBellPopover(false);
                      handleClaimUsb(e);
                    }}
                    disabled={actionStatus !== 'idle'}
                    className="flex-1 flex items-center justify-center gap-1 rounded-xs bg-primary text-primary-foreground font-bold text-[10px] py-1 hover:opacity-90 transition-opacity"
                  >
                    <Router className="h-3 w-3" />
                    <span>Conectar ya</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOfferDismissed(true);
                      setShowBellPopover(false);
                      handleDeclineOffer(e);
                    }}
                    disabled={actionStatus !== 'idle'}
                    className="flex-1 flex items-center justify-center gap-1 rounded-xs border border-border bg-muted/40 hover:bg-muted text-foreground text-[10px] py-1 transition-colors"
                  >
                    <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                    <span>Ceder turno</span>
                  </button>
                </div>
              </div>
            ) : isWaiting ? (
              <div className="space-y-1.5">
                <div className="text-[10px] text-foreground font-semibold">
                  Posición en cola: <span className="font-bold text-primary">#{waitingPos}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Aislado en cuarentena segura hasta que haya un módem libre.
                </div>
                <div className="flex items-center gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowBellPopover(false);
                      handleClaimUsb(e);
                    }}
                    disabled={actionStatus !== 'idle'}
                    className="flex-1 rounded-xs border border-border bg-card hover:bg-muted text-foreground text-[10px] py-1 transition-colors"
                  >
                    Reclamar ya
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowBellPopover(false);
                      handleCancelWaiting(e);
                    }}
                    disabled={actionStatus !== 'idle'}
                    className="flex-1 rounded-xs border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 text-destructive text-[10px] py-1 transition-colors"
                  >
                    Salir de cola
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-center py-1">
                <div className="text-[10px] text-muted-foreground">
                  Sin ofertas pendientes ni esperas activas.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer inferior en 2 renglones limpios */}
      <div className="px-1.5 pt-1.5 pb-0.5 space-y-1 font-mono text-[10px]">
        {/* Renglón 1: Dot estado + Nombre + Puerto + Botón Router + Botón Campanita */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              instance.running ? 'bg-success' : 'bg-muted-foreground/30'
            )}
          />
          <span className="truncate flex-1 text-foreground font-semibold" title={instance.instance_name}>
            {instance.instance_name}
          </span>

          <span className="shrink-0 text-muted-foreground text-[9px]">
            :{instance.adb_port}
          </span>

          {instance.running && (
            <div className="flex items-center gap-1 shrink-0 ml-0.5">
              {/* Botón Router */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRouterPopover((prev) => !prev);
                  setShowBellPopover(false);
                }}
                className={cn(
                  'h-5.5 w-5.5 flex items-center justify-center rounded-xs border transition-colors',
                  assignedDev
                    ? 'bg-primary/20 text-primary border-primary/40 hover:bg-primary/30'
                    : 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted'
                )}
                title="Opciones de Red USB Módem (Rotar IP / Soltar)"
              >
                <Router className="h-3 w-3" />
              </button>

              {/* Botón Campanita */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBellPopover((prev) => !prev);
                  setShowRouterPopover(false);
                }}
                className={cn(
                  'h-5.5 w-5.5 flex items-center justify-center rounded-xs border transition-colors relative',
                  isOffered
                    ? 'bg-primary text-primary-foreground border-primary animate-pulse'
                    : isWaiting
                    ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                    : 'bg-card text-muted-foreground/60 border-border hover:text-foreground hover:bg-muted'
                )}
                title={
                  isOffered
                    ? `¡Oferta activa de módem! Turno: ${offerCountdown ?? 5}s`
                    : isWaiting
                    ? `En cola FIFO (Turno #${waitingPos})`
                    : 'Notificaciones y Turnos de Red'
                }
              >
                <Bell className="h-3 w-3" />
                {isOffered && (
                  <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary ring-1 ring-background" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Renglón 2: Ubicación completa sin truncarse */}
        {(instance.location?.custom_name || instance.location?.city) && (
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground font-sans truncate">
            <MapPin className="h-2.5 w-2.5 text-primary shrink-0" />
            <span
              className="truncate text-foreground/80 font-medium"
              title={instance.location.custom_name || instance.location.city}
            >
              {instance.location.custom_name || instance.location.city}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
