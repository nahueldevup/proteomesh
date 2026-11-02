import { memo, useCallback, useEffect, useState, useRef } from 'react';
import { Router, ShieldAlert, RotateCw, Loader2, ArrowRightLeft, Bell } from 'lucide-react';
import { toast } from 'sonner';
import type { Instance, PendingOffer, UsbPhysicalPhone } from '../../types';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { PhoneScreen } from '../farm/PhoneScreen';
import { ScrcpyLiveScreen } from '../farm/ScrcpyLiveScreen';
import { DeviceControlRail } from './DeviceControlRail';

export interface UsbSlice {
  isOffered: boolean;
  pendingOffer: PendingOffer | null;
  isWaiting: boolean;
  waitingPos: number | null;
  assignedDev: UsbPhysicalPhone | null;
}

interface DeviceCardProps {
  instance: Instance;
  index: number;
  selected: boolean;
  onToggleSelect: (name: string, shiftKey?: boolean) => void;
  onOpen: (name: string) => void;
  syncMode?: boolean;
  usb: UsbSlice;
  onNetworkChange?: () => void;
  isFocused?: boolean;
  onFocus?: (name: string) => void;
  onReleaseFocus?: () => void;
  domRef?: React.Ref<HTMLDivElement>;
}

function DeviceCard({
  instance,
  index,
  selected,
  onToggleSelect,
  onOpen,
  syncMode = false,
  usb,
  onNetworkChange,
  isFocused = false,
  onFocus,
  onReleaseFocus,
  domRef,
}: DeviceCardProps) {
  const [tick, setTick] = useState(0);
  const [actionStatus, setActionStatus] = useState<'idle' | 'rotating' | 'claiming' | 'quarantining' | 'declining'>('idle');
  const [showRouterPopover, setShowRouterPopover] = useState(false);
  const [showBellPopover, setShowBellPopover] = useState(false);
  const [offerDismissed, setOfferDismissed] = useState(false);
  const [offerCountdown, setOfferCountdown] = useState<number | null>(null);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const lastOfferExpiresAtRef = useRef<number | null>(null);
  const domRefRef = useRef(domRef);
  useEffect(() => {
    domRefRef.current = domRef;
  }, [domRef]);

  const setRefs = useCallback((el: HTMLDivElement | null) => {
    cardRef.current = el;
    const d = domRefRef.current;
    if (typeof d === 'function') {
      d(el);
    } else if (d) {
      (d as React.MutableRefObject<HTMLDivElement | null>).current = el;
    }
  }, []);

  // Pausar actualización periódica de pantalla cuando la tarjeta está fuera del viewport
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: '100px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!instance.running || !isVisible) return;

    let interval: number | undefined;
    const startPolling = () => {
      if (interval !== undefined) return;
      interval = window.setInterval(() => setTick((t) => t + 1), 4000);
    };
    const stopPolling = () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
        interval = undefined;
      }
    };
    const handleVisibility = () => {
      if (document.hidden) stopPolling();
      else startPolling();
    };

    if (!document.hidden) startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [instance.running, instance.instance_name, isVisible]);

  useEffect(() => {
    if (!showRouterPopover && !showBellPopover) return;
    const handleClose = () => {
      setShowRouterPopover(false);
      setShowBellPopover(false);
    };
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, [showRouterPopover, showBellPopover]);

  const { isOffered, pendingOffer, isWaiting, waitingPos, assignedDev } = usb;
  const offerExpiresAt = pendingOffer?.expires_at ?? null;
  const offerSeconds = pendingOffer?.expires_in_seconds ?? null;
  const offerSecondsRef = useRef(offerSeconds);

  useEffect(() => {
    offerSecondsRef.current = offerSeconds;
  }, [offerSeconds]);

  // Asegurar que cualquier oferta nueva siempre emerja a la superficie automáticamente
  useEffect(() => {
    if (isOffered) {
      if (!lastOfferExpiresAtRef.current || (offerExpiresAt && offerExpiresAt !== lastOfferExpiresAtRef.current)) {
        lastOfferExpiresAtRef.current = offerExpiresAt ?? Date.now();
        setOfferDismissed(false);
      }
    } else {
      lastOfferExpiresAtRef.current = null;
      setOfferDismissed(false);
    }
  }, [isOffered, offerExpiresAt]);

  useEffect(() => {
    if (!isOffered || offerDismissed) {
      setOfferCountdown(null);
      return;
    }
    const expiresAt = offerExpiresAt ? offerExpiresAt * 1000 : (Date.now() + (offerSecondsRef.current || 5) * 1000);
    let triggered = false;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setOfferCountdown(remaining);
      if (remaining <= 0 && !triggered) {
        triggered = true;
        onNetworkChange?.();
      }
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(timer);
  }, [isOffered, offerExpiresAt, offerDismissed, onNetworkChange]);

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

  const nativeWidth = Number(instance.display?.width) || 720;
  const nativeHeight = Number(instance.display?.height) || 1560;

  return (
    <div
      ref={setRefs}
      onClick={(e) => {
        onToggleSelect(instance.instance_name, e.shiftKey);
        if (instance.running) {
          onFocus?.(instance.instance_name);
        }
      }}
      onDoubleClick={() => onOpen(instance.instance_name)}
      onContextMenu={handleContextMenu}
      className={cn(
        'h-full rounded-sm bg-bezel p-1 border flex items-center justify-center gap-1 shrink-0 cursor-pointer select-none transition-all',
        isFocused
          ? 'border-primary ring-2 ring-primary glow-selected shadow-md'
          : selected
          ? 'border-primary ring-1 ring-primary glow-selected'
          : 'border-border hover:border-foreground/40'
      )}
    >
      <div
        style={{ aspectRatio: `${nativeWidth} / ${nativeHeight}` }}
        className="relative h-full overflow-hidden rounded-xs bg-black border border-border/40 select-none flex flex-col"
      >
        {/* Thumbnail estático subyacente */}
        <PhoneScreen
          instance={instance}
          interactive={syncMode && selected && !isFocused}
          compact
          tick={tick}
          onTap={handleScreenTap}
        />

        {/* Live Scrcpy Stream cuando la tarjeta está enfocada (Lazy: solo 1 activa a 30 FPS) */}
        {isFocused && instance.running && (
          <ScrcpyLiveScreen
            instance={instance}
            isFocused={isFocused}
            onReleaseFocus={() => onReleaseFocus?.()}
            visible={isVisible}
          />
        )}

        {/* Slot index tag */}
        <span className="absolute left-1 top-1 rounded-xs bg-black/90 border border-white/20 px-1.5 py-px font-mono text-[9px] font-bold text-white shadow-xs z-20 select-none">
          {index + 1}
        </span>

        {/* Status badge superior: SOLO CUARENTENA O NOMBRE DE INTERFAZ (Ancho contenido) */}
        <div className="absolute right-1 top-1 z-20 flex items-center">
          {actionStatus === 'rotating' ? (
            <span className="inline-flex items-center gap-1 rounded-xs bg-card/90 text-foreground border border-primary/50 px-1 py-px text-[8px] font-bold font-mono">
              <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
              ROTANDO
            </span>
          ) : actionStatus === 'claiming' ? (
            <span className="inline-flex items-center gap-1 rounded-xs bg-card/90 text-foreground border border-primary/50 px-1 py-px text-[8px] font-bold font-mono">
              <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
              RECLAMANDO
            </span>
          ) : actionStatus === 'quarantining' ? (
            <span className="inline-flex items-center gap-1 rounded-xs bg-destructive/15 text-destructive border border-destructive/40 px-1 py-px text-[8px] font-bold font-mono">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              AISLANDO
            </span>
          ) : actionStatus === 'declining' ? (
            <span className="inline-flex items-center gap-1 rounded-xs bg-muted text-muted-foreground border border-border px-1 py-px text-[8px] font-bold font-mono">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              CEDIENDO
            </span>
          ) : assignedDev ? (
            <span
              className="inline-flex items-center gap-1 rounded-xs bg-card/90 text-foreground border border-border px-1.5 py-px text-[8px] font-mono font-medium max-w-[85px] truncate"
              title={`Conectado por ${assignedDev.iface} (${assignedDev.carrier})`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
              <span className="truncate">{assignedDev.iface}</span>
            </span>
          ) : instance.running ? (
            <span
              className="inline-flex items-center gap-1 rounded-xs bg-muted/90 text-muted-foreground border border-border px-1.5 py-px text-[8px] font-mono max-w-[85px] truncate"
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

      {/* Riel vertical de control (Ticket 2): hermano de la pantalla, nunca overlay */}
      <DeviceControlRail visible={isFocused && instance.running} />
    </div>
  );
}

function areDeviceCardPropsEqual(prev: DeviceCardProps, next: DeviceCardProps): boolean {
  if (
    prev.index !== next.index ||
    prev.selected !== next.selected ||
    prev.syncMode !== next.syncMode ||
    prev.onToggleSelect !== next.onToggleSelect ||
    prev.onOpen !== next.onOpen ||
    prev.onNetworkChange !== next.onNetworkChange ||
    prev.isFocused !== next.isFocused ||
    prev.onFocus !== next.onFocus ||
    prev.onReleaseFocus !== next.onReleaseFocus
  ) {
    return false;
  }

  const pu = prev.usb;
  const nu = next.usb;
  if (
    pu.isOffered !== nu.isOffered ||
    pu.isWaiting !== nu.isWaiting ||
    pu.waitingPos !== nu.waitingPos ||
    pu.assignedDev?.serial !== nu.assignedDev?.serial ||
    pu.assignedDev?.carrier !== nu.assignedDev?.carrier ||
    pu.assignedDev?.iface !== nu.assignedDev?.iface ||
    pu.pendingOffer?.expires_at !== nu.pendingOffer?.expires_at ||
    pu.pendingOffer?.instance !== nu.pendingOffer?.instance
  ) {
    return false;
  }

  const pi = prev.instance;
  const ni = next.instance;
  if (
    pi.instance_name !== ni.instance_name ||
    pi.running !== ni.running ||
    pi.adb_port !== ni.adb_port ||
    pi.display?.width !== ni.display?.width ||
    pi.display?.height !== ni.display?.height ||
    pi.carrier !== ni.carrier ||
    pi.docker_status !== ni.docker_status ||
    pi.identity?.phone_number !== ni.identity?.phone_number ||
    pi.location?.custom_name !== ni.location?.custom_name ||
    pi.location?.city !== ni.location?.city ||
    pi.location?.latitude !== ni.location?.latitude ||
    pi.location?.longitude !== ni.location?.longitude ||
    pi.proxy?.host !== ni.proxy?.host ||
    pi.proxy?.port !== ni.proxy?.port ||
    pi.limits?.memory !== ni.limits?.memory ||
    pi.limits?.cpus !== ni.limits?.cpus
  ) {
    return false;
  }

  return true;
}

export default memo(DeviceCard, areDeviceCardPropsEqual);
