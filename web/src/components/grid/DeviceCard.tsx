import { useEffect, useState } from 'react';
import { Usb, ShieldAlert, RotateCw, Loader2, Clock, ArrowRightLeft } from 'lucide-react';
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
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [offerCountdown, setOfferCountdown] = useState<number | null>(null);

  // Intervalo de recarga de snapshot para dispositivos encendidos
  useEffect(() => {
    if (!instance.running) return;
    const interval = window.setInterval(() => setTick((t) => t + 1), 4000);
    return () => window.clearInterval(interval);
  }, [instance.running, instance.instance_name]);

  // Cerrar menú contextual al hacer clic en cualquier lugar
  useEffect(() => {
    if (!showContextMenu) return;
    const handleClose = () => setShowContextMenu(false);
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, [showContextMenu]);

  // Derivar estado de red desde el overview global
  const isOffered = Boolean(usbOverview?.pending_offer && usbOverview.pending_offer.instance === instance.instance_name);
  const pendingOffer = isOffered ? usbOverview!.pending_offer : null;
  const isWaiting = Boolean(usbOverview?.waiting_queue?.includes(instance.instance_name));
  const waitingPos = isWaiting ? (usbOverview!.waiting_queue.indexOf(instance.instance_name) + 1) : null;
  const assignedDev = usbOverview?.devices?.find((d) => d.assigned_instance === instance.instance_name);

  // Cuenta regresiva viva de oferta temporal (5s)
  useEffect(() => {
    if (!pendingOffer) {
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
  }, [pendingOffer, onNetworkChange]);

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
    setShowContextMenu(false);
    if (!instance.running) {
      toast.error('Iniciá el CloudPhone antes de asignarle red');
      return;
    }
    setActionStatus('claiming');
    const toastId = toast.loading(`Reclamando módem USB para ${instance.instance_name}...`);
    try {
      const res = await api.claimUsb(instance.instance_name);
      if (res.status === 'waiting') {
        toast.info(res.message || `En cola de espera (#${res.queue_position})`, { id: toastId });
      } else {
        toast.success(`USB conectado (${res.public_ip})`, { id: toastId });
      }
      onNetworkChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reclamar USB', { id: toastId });
    } finally {
      setActionStatus('idle');
    }
  };

  const handleQuarantine = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowContextMenu(false);
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
    setShowContextMenu(false);
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
    setShowContextMenu(false);
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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!instance.running) return;
    setMenuPos({
      x: Math.min(e.clientX, window.innerWidth - 176),
      y: Math.min(e.clientY, window.innerHeight - 220),
    });
    setShowContextMenu(true);
  };

  return (
    <div
      onClick={(e) => onToggleSelect(instance.instance_name, e.shiftKey)}
      onDoubleClick={() => onOpen(instance.instance_name)}
      onContextMenu={handleContextMenu}
      className={cn(
        'group relative cursor-pointer select-none rounded-xl bg-bezel p-1 transition',
        selected ? 'glow-selected' : 'ring-1 ring-border hover:ring-muted-foreground'
      )}
    >
      <div className="relative aspect-[9/19.5] overflow-hidden rounded-lg [container-type:inline-size]">
        <PhoneScreen
          instance={instance}
          interactive={syncMode && selected}
          compact
          tick={tick}
          onTap={handleScreenTap}
        />

        {/* Índice numérico superior izquierdo */}
        <span className="absolute left-1 top-1 rounded bg-background/80 px-1 font-mono text-[9px] text-foreground/80 z-20">
          {index + 1}
        </span>

        {/* Badge de Estado de Red NET-USB-001 superior derecho */}
        <div className="absolute right-1 top-1 z-20 flex items-center">
          {actionStatus === 'rotating' ? (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-600 dark:bg-emerald-700 text-white px-1.5 py-0.5 text-[8px] font-bold shadow-md animate-pulse">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ROTANDO...
            </span>
          ) : actionStatus === 'claiming' ? (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-600 dark:bg-emerald-700 text-white px-1.5 py-0.5 text-[8px] font-bold shadow-md animate-pulse">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              RECLAMANDO...
            </span>
          ) : actionStatus === 'quarantining' ? (
            <span className="inline-flex items-center gap-1 rounded bg-rose-600 dark:bg-rose-700 text-white px-1.5 py-0.5 text-[8px] font-bold shadow-md animate-pulse">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              AISLANDO...
            </span>
          ) : actionStatus === 'declining' ? (
            <span className="inline-flex items-center gap-1 rounded bg-indigo-600 dark:bg-indigo-700 text-white px-1.5 py-0.5 text-[8px] font-bold shadow-md animate-pulse">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              CEDIENDO...
            </span>
          ) : isOffered ? (
            <span className="inline-flex items-center gap-1 rounded bg-indigo-600 dark:bg-indigo-700 text-white px-1.5 py-0.5 text-[8px] font-bold shadow-md animate-pulse">
              <Clock className="h-2.5 w-2.5" />
              OFERTA ({offerCountdown !== null ? `${offerCountdown}s` : `${pendingOffer?.expires_in_seconds || 5}s`})
            </span>
          ) : assignedDev ? (
            <span
              className="inline-flex items-center gap-1 rounded bg-emerald-600 dark:bg-emerald-700 text-white px-1.5 py-0.5 text-[8px] font-bold font-mono shadow-md backdrop-blur-xs"
              title={`Conectado por ${assignedDev.iface} (${assignedDev.carrier})`}
            >
              <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
              {assignedDev.iface} • {assignedDev.public_ip || 'USB'}
            </span>
          ) : isWaiting ? (
            <span className="inline-flex items-center gap-1 rounded bg-amber-600 dark:bg-amber-700 text-white px-1.5 py-0.5 text-[8px] font-bold shadow-md backdrop-blur-xs animate-pulse">
              ESPERANDO #{waitingPos}
            </span>
          ) : instance.running ? (
            <span className="inline-flex items-center gap-1 rounded bg-amber-950/85 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 text-[8px] font-bold shadow-md backdrop-blur-xs">
              <ShieldAlert className="h-2.5 w-2.5" />
              CUARENTENA
            </span>
          ) : null}
        </div>

        {/* Acciones Rápidas al fondo de la pantalla (Permanente si hay oferta, o en hover si no) */}
        {instance.running && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute bottom-1.5 inset-x-1.5 z-30 flex items-center justify-center gap-1 rounded-md p-1 backdrop-blur-xs border shadow-lg transition-all duration-150",
              isOffered
                ? "border-indigo-500/50 bg-background/95 ring-1 ring-indigo-500/30"
                : "hidden group-hover:flex bg-background/90 border-border/80"
            )}
          >
            {isOffered ? (
              <>
                <button
                  onClick={handleClaimUsb}
                  disabled={actionStatus !== 'idle'}
                  title="Conectar inmediatamente sin esperar los 5s"
                  className="flex-1 flex items-center justify-center gap-1 rounded bg-indigo-600 hover:bg-indigo-500 px-1 py-1 text-[9px] font-bold text-white transition-colors disabled:opacity-50"
                >
                  <Usb className="h-2.5 w-2.5" />
                  <span>Conectar ({offerCountdown !== null ? `${offerCountdown}s` : '5s'})</span>
                </button>
                <button
                  onClick={handleDeclineOffer}
                  disabled={actionStatus !== 'idle'}
                  title="Ceder turno y pasar al final de la cola"
                  className="flex-1 flex items-center justify-center gap-1 rounded border border-border bg-surface hover:bg-surface-hover px-1 py-1 text-[9px] font-medium text-foreground transition-colors disabled:opacity-50"
                >
                  <ArrowRightLeft className="h-2.5 w-2.5 text-muted-foreground" />
                  <span>Ceder</span>
                </button>
              </>
            ) : assignedDev ? (
              <>
                <button
                  onClick={handleRotateIp}
                  disabled={actionStatus !== 'idle'}
                  title="Forzar rotación de IP por Modo Avión ADB"
                  className="flex-1 flex items-center justify-center gap-1 rounded border border-border bg-surface hover:bg-surface-hover px-1.5 py-1 text-[9px] font-semibold text-foreground transition-colors"
                >
                  <RotateCw className="h-2.5 w-2.5 text-primary" />
                  <span>Rotar IP</span>
                </button>
                <button
                  onClick={handleQuarantine}
                  disabled={actionStatus !== 'idle'}
                  title="Soltar módem y poner en cuarentena"
                  className="flex-1 flex items-center justify-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-1.5 py-1 text-[9px] font-semibold text-rose-600 dark:text-rose-400 transition-colors"
                >
                  <ShieldAlert className="h-2.5 w-2.5" />
                  <span>Soltar</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleClaimUsb}
                disabled={actionStatus !== 'idle'}
                title="Reclamar módem USB físico disponible"
                className="w-full flex items-center justify-center gap-1 rounded bg-primary hover:opacity-90 px-1.5 py-1 text-[9px] font-bold text-primary-foreground transition-opacity"
              >
                <Usb className="h-2.5 w-2.5" />
                <span>Reclamar USB</span>
              </button>
            )}
          </div>
        )}

        {/* Menú Contextual (Clic Secundario) */}
        {showContextMenu && instance.running && (
          <div
            style={{ top: menuPos.y, left: menuPos.x }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[100] w-44 rounded-lg border border-border bg-popover p-1.5 shadow-2xl shadow-black/30 animate-in fade-in zoom-in-95 duration-100 text-xs font-sans text-popover-foreground"
          >
            <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground border-b border-border/50 uppercase tracking-wider">
              Red USB Módem
            </div>
            {isOffered ? (
              <>
                <button
                  onClick={handleClaimUsb}
                  disabled={actionStatus !== 'idle'}
                  className="w-full flex items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
                >
                  <Usb className="h-3 w-3" />
                  <span>Conectar ya</span>
                </button>
                <button
                  onClick={handleDeclineOffer}
                  disabled={actionStatus !== 'idle'}
                  className="w-full flex items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                  <span>Ceder turno / Declinar</span>
                </button>
              </>
            ) : assignedDev ? (
              <>
                <button
                  onClick={handleRotateIp}
                  disabled={actionStatus !== 'idle'}
                  className="w-full flex items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  <RotateCw className="h-3 w-3 text-primary" />
                  <span>Rotar IP (Avión)</span>
                </button>
                <button
                  onClick={handleQuarantine}
                  disabled={actionStatus !== 'idle'}
                  className="w-full flex items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                >
                  <ShieldAlert className="h-3 w-3 text-rose-500" />
                  <span>Soltar Red / Cuarentena</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleClaimUsb}
                disabled={actionStatus !== 'idle'}
                className="w-full flex items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              >
                <Usb className="h-3 w-3" />
                <span>Reclamar USB</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 px-1 pt-1 font-mono text-[9.5px]">
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            instance.running
              ? 'bg-emerald-500'
              : 'bg-muted-foreground/40'
          )}
        />
        <span className="truncate flex-1 text-foreground/90 font-medium" title={instance.instance_name}>
          {instance.instance_name}
        </span>
        {instance.location?.custom_name && (
          <span
            className="truncate text-[8.5px] text-primary font-sans font-semibold max-w-[80px]"
            title={`Ubicación Custom: ${instance.location.custom_name}`}
          >
            📍{instance.location.custom_name}
          </span>
        )}
        <span className="ml-auto shrink-0 text-muted-foreground text-[8.5px]">
          :{instance.adb_port}
        </span>
      </div>
    </div>
  );
}
