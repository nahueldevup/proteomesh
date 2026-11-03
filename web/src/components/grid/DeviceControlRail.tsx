import { Component, lazy, memo, Suspense, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Power,
  RotateCcw,
  Volume2,
  Volume1,
  ArrowLeft,
  Circle,
  Layers,
  Camera,
  Router,
  Bell,
  Maximize2,
  Minimize2,
  PackagePlus,
  FolderArchive,
  Trash2,
  Type,
  Link2,
  ExternalLink,
} from 'lucide-react';
import type { Instance, InstanceUsbNetworkState, ApkEntry } from '../../types';
import { api } from '../../lib/api';
import { cn, getErrorMessage } from '../../lib/utils';
import { IconBtn, type IconBtnVariant } from '../ui/IconBtn';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ConfirmDeleteModal } from '../ui/ConfirmDeleteModal';
import { useExclusivePopover } from '../../lib/useExclusivePopover';
import { closeActivePopover } from '../../lib/popoverStore';
import type { UsbSlice } from './DeviceCard';

// Contenido de los Popovers cargado perezosamente (mismo chunk compartido).
const UsbPopoverContent = lazy(() =>
  import('./DeviceControlRailPopovers').then((m) => ({ default: m.UsbPopoverContent }))
);
const TurnsPopoverContent = lazy(() =>
  import('./DeviceControlRailPopovers').then((m) => ({ default: m.TurnsPopoverContent }))
);
const ApkPopoverContent = lazy(() =>
  import('./DeviceControlRailPopovers').then((m) => ({ default: m.ApkPopoverContent }))
);

// Precarga del chunk al hover/focus para que la primera apertura no se sienta lenta.
const preloadRailPopovers = () => {
  import('./DeviceControlRailPopovers');
};

export type DeviceControlRailMode = 'rack' | 'focus';

interface DeviceControlRailProps {
  instance: Instance;
  mode: DeviceControlRailMode;
  usb?: UsbSlice;
  networkState?: InstanceUsbNetworkState | null;
  onBack?: () => void;
  onOpen?: (name: string) => void;
  onNetworkChange?: () => void;
  onChanged?: () => void;
  onRefreshInstances?: () => void;
  onOpenFilesManager?: (instanceName: string) => void;
  className?: string;
}

/**
 * Barra vertical unificada de control hardware para DeviceCard y FocusView.
 *
 * - 14 botones compactos.
 * - Popovers de Red USB, Turnos, Texto, URL, APK y Archivos renderizados con
 *   Portal de Radix para evitar recorte por `overflow` del chasis.
 * - Todos los clics se detienen en la barra para no interferir con la tarjeta.
 */
export const DeviceControlRail = memo(function DeviceControlRail({
  instance,
  mode,
  usb,
  networkState,
  onBack,
  onOpen,
  onNetworkChange,
  onChanged,
  onRefreshInstances,
  onOpenFilesManager,
  className = '',
}: DeviceControlRailProps) {
  const name = instance.instance_name;
  const running = instance.running;

  // ── Estados derivados de red ──
  const assignedDev =
    usb?.assignedDev ??
    (networkState?.assigned_usb
      ? {
          serial: networkState.assigned_usb.serial ?? '',
          iface: networkState.assigned_usb.iface ?? '',
          carrier: networkState.assigned_usb.carrier ?? '',
        }
      : null);
  const isOffered = usb?.isOffered ?? networkState?.state === 'OFFERED';
  const pendingOffer = usb?.pendingOffer ?? networkState?.pending_offer;
  const isWaiting = usb?.isWaiting ?? networkState?.state === 'WAITING_USB';
  const waitingPos = usb?.waitingPos ?? networkState?.queue_position ?? null;
  const publicIp = networkState?.public_ip ?? assignedDev?.carrier;

  const [actionStatus, setActionStatus] = useState<
    'idle' | 'rotating' | 'claiming' | 'quarantining' | 'declining'
  >('idle');

  // Popovers exclusivos indexados por modo e instancia (evita colisión entre rack y FocusView)
  const prefix = `${mode}:${name}`;
  const routerPopover = useExclusivePopover(`${prefix}:router`);
  const bellPopover = useExclusivePopover(`${prefix}:bell`);
  const apkPopover = useExclusivePopover(`${prefix}:apk`);
  const textPopover = useExclusivePopover(`${prefix}:text`);
  const urlPopover = useExclusivePopover(`${prefix}:url`);

  const [textValue, setTextValue] = useState('');
  const [urlValue, setUrlValue] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // APKs rápidos desde el repo (botón 12)
  const [railApks, setRailApks] = useState<ApkEntry[]>([]);
  const [railApksLoading, setRailApksLoading] = useState(false);
  const [railInstallingId, setRailInstallingId] = useState<number | null>(null);

  useEffect(() => {
    if (!apkPopover.open) return;
    let cancelled = false;
    setRailApksLoading(true);
    api.getApks()
      .then((data) => {
        if (!cancelled) setRailApks(data);
      })
      .catch((err) => {
        if (!cancelled) toast.error(`Error al cargar APKs: ${getErrorMessage(err)}`);
      })
      .finally(() => {
        if (!cancelled) setRailApksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apkPopover.open]);

  const offerSeconds = pendingOffer?.expires_in_seconds ?? 5;

  const isBusy = actionStatus !== 'idle';

  // Instalación de un APK del repositorio en esta instancia.
  const handleInstallApk = async (apk: ApkEntry) => {
    setRailInstallingId(apk.id);
    try {
      const res = await api.installApks(apk.id, [name]);
      const result = res[0];
      if (result.status === 'ok') toast.success(`APK instalado en ${name}`);
      else if (result.status === 'skipped') toast.info('Instancia no lista; omitido');
      else toast.error(`Error al instalar: ${result.error || 'fallo'}`);
      onRefreshInstances?.();
    } catch (err) {
      toast.error(`Error al instalar APK: ${getErrorMessage(err)}`);
    } finally {
      setRailInstallingId(null);
    }
  };

  // ── Acciones de ciclo de vida ──
  const handleTogglePower = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const toastId = toast.loading(running ? 'Apagando…' : 'Encendiendo…');
    try {
      if (running) {
        await api.stopInstance(name);
        toast.success('Dispositivo apagado', { id: toastId });
      } else {
        await api.startInstance(name);
        toast.success('Dispositivo encendido', { id: toastId });
      }
      onChanged?.();
      onRefreshInstances?.();
      onNetworkChange?.();
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Error al cambiar estado', { id: toastId });
    }
  };

  const handleRestart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!running) return;
    const toastId = toast.loading(`Reiniciando ${name}…`);
    try {
      await api.restartInstance(name);
      toast.success(`${name} reiniciado`, { id: toastId });
      onChanged?.();
      onRefreshInstances?.();
      onNetworkChange?.();
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Error al reiniciar', { id: toastId });
    }
  };

  const handleDelete = async () => {
    setDeleteBusy(true);
    try {
      await api.deleteInstance(name);
      toast.success(`CloudPhone "${name}" eliminado`);
      setConfirmDeleteOpen(false);
      onChanged?.();
      onRefreshInstances?.();
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Error al eliminar');
    } finally {
      setDeleteBusy(false);
    }
  };

  // ── Teclas hardware ──
  const sendDeviceKey = async (e: React.MouseEvent, key: string, label: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!running) return;
    try {
      await api.sendKey(name, key);
      toast.success(`Tecla ${label} enviada`);
    } catch {
      toast.error('Error al enviar comando');
    }
  };

  // ── Captura de pantalla ──
  const handleScreenshot = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!running) return;
    try {
      const blob = await api.getScreenshot(name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}-${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Captura guardada');
    } catch {
      toast.error('Error al capturar pantalla');
    }
  };

  // ── Red USB ──
  const handleClaimUsb = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!running) {
      toast.error('Iniciá el CloudPhone antes de asignarle red');
      return;
    }
    setActionStatus('claiming');
    closeActivePopover();
    const toastId = toast.loading(`Conectando módem USB para ${name}…`);
    try {
      const res = await api.claimUsb(name);
      if (res.status === 'waiting') {
        toast.info(res.message || `En cola de espera (#${res.queue_position})`, { id: toastId });
      } else {
        toast.success(`USB conectado (${res.public_ip || 'IP asignada'})`, { id: toastId });
      }
      onNetworkChange?.();
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Error al conectar USB', { id: toastId });
    } finally {
      setActionStatus('idle');
    }
  };

  const handleQuarantine = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setActionStatus('quarantining');
    closeActivePopover();
    const toastId = toast.loading(`Aislando ${name} y liberando módem…`);
    try {
      await api.quarantineInstance(name);
      toast.success(`Cuarentena activa para ${name}`, { id: toastId });
      onNetworkChange?.();
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Error al aislar instancia', { id: toastId });
    } finally {
      setActionStatus('idle');
    }
  };

  const handleRotateIp = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setActionStatus('rotating');
    closeActivePopover();
    const toastId = toast.loading(`Rotando IP en ${name} (Modo Avión)...`);
    try {
      const res = await api.rotateInstanceIp(name);
      toast.success(`Nueva IP obtenida: ${res.new_ip}`, { id: toastId });
      onNetworkChange?.();
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Error al rotar IP', { id: toastId });
    } finally {
      setActionStatus('idle');
    }
  };

  const handleDeclineOffer = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setActionStatus('declining');
    closeActivePopover();
    const toastId = toast.loading(`Cediendo turno para ${name}…`);
    try {
      const res = await api.declineOffer(name, true);
      toast.info(res.next_offered ? `Turno cedido. Próximo: '${res.next_offered}'` : `Turno cedido`, {
        id: toastId,
      });
      onNetworkChange?.();
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Error al declinar turno', { id: toastId });
    } finally {
      setActionStatus('idle');
    }
  };

  const handleCancelWaiting = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setActionStatus('declining');
    closeActivePopover();
    const toastId = toast.loading(`Cancelando espera para ${name}…`);
    try {
      await api.declineOffer(name, false);
      toast.success(`${name} retirado de la cola`, { id: toastId });
      onNetworkChange?.();
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Error al salir de la cola', { id: toastId });
    } finally {
      setActionStatus('idle');
    }
  };

  // ── Texto / URL (conservados de FocusView) ──
  const handleSendText = async (e?: React.MouseEvent | React.FormEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const txt = textValue.trim();
    if (!txt || !running) return;
    closeActivePopover();
    setTextValue('');
    try {
      await api.sendText(name, txt);
      toast.success('Texto enviado');
    } catch {
      toast.error('Error al enviar texto');
    }
  };

  const handleSendUrl = async (e?: React.MouseEvent | React.FormEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    let url = urlValue.trim();
    if (!url || !running) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    closeActivePopover();
    setUrlValue('');
    try {
      await api.launchUrl(name, url);
      toast.success('URL abierta');
    } catch {
      toast.error('Error al abrir URL');
    }
  };

  // ── Maximizar / Minimizar ──
  const handleFocusToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (mode === 'rack') {
      onOpen?.(name);
    } else {
      onBack?.();
    }
  };

  const routerVariant: IconBtnVariant = actionStatus === 'rotating'
    ? 'active'
    : assignedDev
    ? 'success'
    : isOffered
    ? 'primary'
    : isWaiting
    ? 'warning'
    : 'ghost';

  const bellVariant: IconBtnVariant = isOffered ? 'primary' : isWaiting ? 'warning' : 'ghost';

  return (
    <>
      <div
        className={cn(
          'flex h-full w-7 shrink-0 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden rounded-sm border border-border bg-card p-0.5',
          className
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          closeActivePopover();
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          closeActivePopover();
        }}
      >
        {/* 1. Power */}
        <IconBtn
          icon={Power}
          label={running ? 'Apagar' : 'Encender'}
          size="sm"
          side="right"
          variant={running ? 'success' : 'ghost'}
          onClick={handleTogglePower}
        />

        {/* 2. Reiniciar */}
        <IconBtn
          icon={RotateCcw}
          label="Reiniciar"
          size="sm"
          side="right"
          disabled={!running || isBusy}
          onClick={handleRestart}
        />

        {/* 3/4. Volumen */}
        <IconBtn
          icon={Volume2}
          label="Subir volumen"
          size="sm"
          side="right"
          disabled={!running}
          onClick={(e) => sendDeviceKey(e, 'volume_up', 'Volumen +')}
        />
        <IconBtn
          icon={Volume1}
          label="Bajar volumen"
          size="sm"
          side="right"
          disabled={!running}
          onClick={(e) => sendDeviceKey(e, 'volume_down', 'Volumen -')}
        />

        {/* 5/6/7. Navegación Android */}
        <IconBtn
          icon={ArrowLeft}
          label="Atrás"
          size="sm"
          side="right"
          disabled={!running}
          onClick={(e) => sendDeviceKey(e, 'back', 'Atrás')}
        />
        <IconBtn
          icon={Circle}
          label="Inicio"
          size="sm"
          side="right"
          disabled={!running}
          onClick={(e) => sendDeviceKey(e, 'home', 'Inicio')}
        />
        <IconBtn
          icon={Layers}
          label="Recientes"
          size="sm"
          side="right"
          disabled={!running}
          onClick={(e) => sendDeviceKey(e, 'recents', 'Recientes')}
        />

        {/* 8. Captura */}
        <IconBtn
          icon={Camera}
          label="Captura de pantalla"
          size="sm"
          side="right"
          disabled={!running}
          onClick={handleScreenshot}
        />

        {/* Texto y URL (conservados de FocusView, no cuentan como botones hardware) */}
        <Popover open={textPopover.open} onOpenChange={textPopover.onOpenChange}>
          <PopoverTrigger asChild>
            <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
              <IconBtn
                icon={Type}
                label="Escribir texto"
                size="sm"
                side="right"
                variant={textPopover.open ? 'active' : 'ghost'}
                disabled={!running}
              />
            </span>
          </PopoverTrigger>
          <PopoverContent side="right" className="w-72 p-2">
            <div className="mb-2 text-xs text-muted-foreground font-mono">Escribir vía ADB</div>
            <div className="flex gap-1">
              <input
                type="text"
                autoFocus
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                placeholder="Texto a enviar…"
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <IconBtn icon={ExternalLink} label="Enviar" variant="primary" size="sm" onClick={handleSendText} />
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={urlPopover.open} onOpenChange={urlPopover.onOpenChange}>
          <PopoverTrigger asChild>
            <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
              <IconBtn
                icon={Link2}
                label="Abrir URL"
                size="sm"
                side="right"
                variant={urlPopover.open ? 'active' : 'ghost'}
                disabled={!running}
              />
            </span>
          </PopoverTrigger>
          <PopoverContent side="right" className="w-72 p-2">
            <div className="mb-2 text-xs text-muted-foreground font-mono">Abrir enlace en Chrome</div>
            <div className="flex gap-1">
              <input
                type="text"
                autoFocus
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendUrl()}
                placeholder="https://…"
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <IconBtn icon={ExternalLink} label="Abrir" variant="primary" size="sm" onClick={handleSendUrl} />
            </div>
          </PopoverContent>
        </Popover>

        {/* 9. Red USB Módem */}
        <Popover open={routerPopover.open} onOpenChange={routerPopover.onOpenChange}>
          <PopoverTrigger asChild>
            <span
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onMouseEnter={preloadRailPopovers}
              onFocus={preloadRailPopovers}
            >
              <IconBtn
                icon={Router}
                label="Red USB Módem"
                size="sm"
                side="right"
                variant={routerVariant}
                disabled={isBusy}
                className={cn(isOffered && 'animate-pulse')}
              />
            </span>
          </PopoverTrigger>
          <PopoverContent side="right" className="w-64 p-2 space-y-1.5 font-mono text-xs">
            <RailPopoverErrorBoundary>
              <Suspense fallback={<RailPopoverFallback />}>
                <UsbPopoverContent
                  assignedDev={assignedDev}
                  publicIp={publicIp}
                  actionStatus={actionStatus}
                  isBusy={isBusy}
                  running={running}
                  onRotateIp={handleRotateIp}
                  onQuarantine={handleQuarantine}
                  onClaimUsb={handleClaimUsb}
                />
              </Suspense>
            </RailPopoverErrorBoundary>
          </PopoverContent>
        </Popover>

        {/* 10. Turnos y Notificaciones */}
        <Popover open={bellPopover.open} onOpenChange={bellPopover.onOpenChange}>
          <PopoverTrigger asChild>
            <span
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onMouseEnter={preloadRailPopovers}
              onFocus={preloadRailPopovers}
            >
              <IconBtn
                icon={Bell}
                label="Turnos de Red USB"
                size="sm"
                side="right"
                variant={bellVariant}
                disabled={isBusy}
                className={cn(isOffered && 'animate-pulse')}
              />
            </span>
          </PopoverTrigger>
          <PopoverContent side="right" className="w-64 p-2 space-y-1.5 font-mono text-xs">
            <RailPopoverErrorBoundary>
              <Suspense fallback={<RailPopoverFallback />}>
                <TurnsPopoverContent
                  isOffered={isOffered}
                  isWaiting={isWaiting}
                  waitingPos={waitingPos}
                  offerSeconds={offerSeconds}
                  isBusy={isBusy}
                  onClaimUsb={handleClaimUsb}
                  onDeclineOffer={handleDeclineOffer}
                  onCancelWaiting={handleCancelWaiting}
                />
              </Suspense>
            </RailPopoverErrorBoundary>
          </PopoverContent>
        </Popover>

        {/* 11. Maximizar / Minimizar */}
        <IconBtn
          icon={mode === 'rack' ? Maximize2 : Minimize2}
          label={mode === 'rack' ? 'Vista extendida' : 'Volver al rack'}
          size="sm"
          side="right"
          onClick={handleFocusToggle}
        />

        {/* 12. Instalar APK */}
        <Popover open={apkPopover.open} onOpenChange={apkPopover.onOpenChange}>
          <PopoverTrigger asChild>
            <span
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onMouseEnter={preloadRailPopovers}
              onFocus={preloadRailPopovers}
            >
              <IconBtn
                icon={PackagePlus}
                label="Instalar APK"
                size="sm"
                side="right"
                variant={apkPopover.open ? 'active' : 'ghost'}
                disabled={!running}
              />
            </span>
          </PopoverTrigger>
          <PopoverContent side="right" className="w-64 p-2 font-mono text-xs">
            <RailPopoverErrorBoundary>
              <Suspense fallback={<RailPopoverFallback />}>
                <ApkPopoverContent
                  apks={railApks}
                  loading={railApksLoading}
                  installingId={railInstallingId}
                  onInstall={handleInstallApk}
                />
              </Suspense>
            </RailPopoverErrorBoundary>
          </PopoverContent>
        </Popover>

        {/* 13. Archivos de Instancia */}
        <IconBtn
          icon={FolderArchive}
          label="Archivos de instancia"
          size="sm"
          side="right"
          variant="ghost"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenFilesManager?.(name);
          }}
        />

        {/* Separador antes de borrar */}
        <div className="my-0.5 h-px w-full bg-border/60" />

        {/* 14. Borrar */}
        <IconBtn
          icon={Trash2}
          label="Eliminar CloudPhone"
          size="sm"
          side="right"
          variant="danger"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirmDeleteOpen(true);
          }}
        />
      </div>

      <ConfirmDeleteModal
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        instances={[name]}
        busy={deleteBusy}
      />
    </>
  );
});

function RailPopoverFallback() {
  return (
    <div className="flex h-16 items-center justify-center text-[10px] text-muted-foreground animate-pulse">
      Cargando…
    </div>
  );
}

interface RailPopoverErrorBoundaryProps {
  children: ReactNode;
}

interface RailPopoverErrorBoundaryState {
  hasError: boolean;
}

class RailPopoverErrorBoundary extends Component<
  RailPopoverErrorBoundaryProps,
  RailPopoverErrorBoundaryState
> {
  state: RailPopoverErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RailPopoverErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[RailPopoverErrorBoundary] Error cargando popover:', error);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-2 space-y-1.5 text-center font-mono text-xs text-muted-foreground">
          <p className="text-[10px] text-destructive">Error al cargar contenido</p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="w-full rounded-xs border border-border bg-card px-2 py-1 text-[10px] font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
