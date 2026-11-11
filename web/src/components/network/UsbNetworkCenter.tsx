import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Router,
  Signal,
  ShieldCheck,
  Clock,
  History,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, useIpLedger } from '../../lib/queries';
import { api } from '../../lib/api';
import { TooltipSimple } from '../ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import type { UsbNetworkOverview, Instance } from '../../types';
import { cn } from '../../lib/utils';
import {
  type NetworkTab,
  NO_ENTRIES,
  GRACE_SECONDS,
  ttlLabel,
} from './networkTypes';
import { ModemInventoryTable } from './ModemInventoryTable';
import { ModemInspector } from './ModemInspector';
import { FifoQueueBar } from './FifoQueueBar';
import { IpLedgerTable } from './IpLedgerTable';

interface UsbNetworkCenterProps {
  instances: Instance[];
  overview?: UsbNetworkOverview | undefined;
  onRefresh: () => unknown;
  onSelectInstance?: ((name: string) => void) | undefined;
}

export default function UsbNetworkCenter({ instances, overview, onRefresh, onSelectInstance }: UsbNetworkCenterProps) {
  const queryClient = useQueryClient();
  const { data: ledger } = useIpLedger();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState<number>(1);
  const [pageSizeOpen, setPageSizeOpen] = useState(false);

  // Estado de presentación del rediseño (no afecta la lógica operativa)
  const [tab, setTab] = useState<NetworkTab>('modems');
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const [toRelease, setToRelease] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const ledgerEntries = ledger?.entries ?? NO_ENTRIES;
  const currentTtl = ledger?.ttl ?? '7d';
  const data = overview ?? null;

  const refresh = useCallback(() => {
    onRefresh();
    return queryClient.invalidateQueries({ queryKey: queryKeys.ipLedger });
  }, [onRefresh, queryClient]);

  // Contador regresivo en vivo para la ventana de gracia de 5s (Turno pendiente)
  useEffect(() => {
    const offer = data?.pending_offer;
    if (!offer) {
      setCountdown(null);
      return;
    }

    const expiresAt = offer.expires_at ? offer.expires_at * 1000 : (Date.now() + (offer.expires_in_seconds || 5) * 1000);

    let refreshTimer: number | undefined;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0 && refreshTimer === undefined) {
        refreshTimer = window.setTimeout(() => refresh(), 800);
      }
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 250);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(refreshTimer);
    };
  }, [data?.pending_offer, refresh]);

  const handleTestRotation = async (serial: string) => {
    setBusyAction(`test-${serial}`);
    const toastId = toast.loading(`Probando ciclo de Modo Avión en ${serial}...`);
    try {
      const res = await api.testUsbRotation(serial);
      toast.success(`Modo Avión OK en ${res.elapsed_seconds}s (radio reiniciada)`, { id: toastId });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fallo en test de rotación', { id: toastId });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRotateAssigned = async (instanceName: string) => {
    setBusyAction(`rotate-${instanceName}`);
    const toastId = toast.loading(`Rotando IP de ${instanceName} vía Modo Avión ADB...`);
    try {
      const res = await api.rotateInstanceIp(instanceName);
      toast.success(`Nueva IP obtenida: ${res.new_ip}`, { id: toastId });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al rotar IP', { id: toastId });
    } finally {
      setBusyAction(null);
    }
  };

  const handleQuarantineInstance = async (instanceName: string) => {
    setBusyAction(`quarantine-${instanceName}`);
    const toastId = toast.loading(`Poniendo ${instanceName} en cuarentena y liberando módem...`);
    try {
      const res = await api.quarantineInstance(instanceName);
      if (res.popped_next) {
        toast.success(`Módem liberado y ofrecido a '${res.popped_next}'`, { id: toastId });
      } else {
        toast.success(`Instancia ${instanceName} en cuarentena segura`, { id: toastId });
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al aislar instancia', { id: toastId });
    } finally {
      setBusyAction(null);
    }
  };

  const handleClaimUsb = async (instanceName: string, preferredSerial?: string, stealFrom?: string) => {
    setBusyAction(`claim-${instanceName}`);
    const toastId = toast.loading(`Reclamando conexión USB para ${instanceName}...`);
    try {
      const res = await api.claimUsb(instanceName, preferredSerial, stealFrom);
      if (res.status === 'waiting') {
        toast.info(res.message || `Instancia en cola FIFO (#${res.queue_position})`, { id: toastId });
      } else {
        toast.success(`Conexión USB activa para ${instanceName} (${res.public_ip})`, { id: toastId });
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fallo al reclamar USB', { id: toastId });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeclineOffer = async (instanceName: string) => {
    setBusyAction(`decline-${instanceName}`);
    const toastId = toast.loading(`Cediendo turno para ${instanceName}...`);
    try {
      const res = await api.declineOffer(instanceName, true);
      if (res.next_offered) {
        toast.info(`Turno cedido. Módem ofrecido a '${res.next_offered}'`, { id: toastId });
      } else {
        toast.success(`Turno cedido para ${instanceName}`, { id: toastId });
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al declinar turno', { id: toastId });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSetTtl = async (ttl: string) => {
    setBusyAction('set-ttl');
    try {
      await api.setIpLedgerTtl(ttl);
      toast.success(`Retención TTL actualizada a ${ttl}`);
      await refresh();
    } catch {
      toast.error('Error al actualizar TTL');
    } finally {
      setBusyAction(null);
    }
  };

  const handlePurgeExpired = async () => {
    setBusyAction('purge');
    try {
      const res = await api.purgeIpLedger();
      toast.success(`Se purgaron ${res.purged} registros de IP expirados`);
      await refresh();
    } catch {
      toast.error('Error al purgar historial');
    } finally {
      setBusyAction(null);
    }
  };

  // ── Datos derivados ──────────────────────────────────────────────
  const filteredEntries = useMemo(
    () =>
      ledgerEntries.filter((e) => {
        if (activeOnly && !e.is_active) return false;
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
          e.ip.toLowerCase().includes(term) ||
          e.instance_name.toLowerCase().includes(term) ||
          (e.carrier && e.carrier.toLowerCase().includes(term)) ||
          e.usb_id.toLowerCase().includes(term)
        );
      }),
    [ledgerEntries, searchTerm, activeOnly]
  );

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedEntries = filteredEntries.slice((safePage - 1) * pageSize, safePage * pageSize);

  const devices = data?.devices || [];
  const waitingQueue = data?.waiting_queue || [];
  const summary = data?.summary || { total_usb: 0, free_usb: 0, assigned_usb: 0, waiting_count: 0, ttl: '7d' };
  const pendingOffer = data?.pending_offer ?? null;

  const sel = devices.find((d) => d.serial === selectedSerial) ?? devices[0] ?? null;

  const selectDevice = (serial: string) => {
    setSelectedSerial(serial);
    setAssignTarget(null);
  };

  const holderOf = (name: string) => devices.find((d) => d.assigned_instance === name) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background overflow-hidden font-sans">
      {/* ── CABECERA CANÓNICA 55px ─────────────────────────────────── */}
      <header className="flex h-[55px] items-center gap-4 border-b border-border px-4 py-2.5 shrink-0 bg-background select-none">
        <h1 className="font-mono text-base font-semibold text-foreground whitespace-nowrap">
          Centro de Red USB
        </h1>

        <div className="flex rounded-md border border-border bg-surface p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setTab('modems')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm px-3 py-1 transition-colors cursor-pointer text-sm font-medium whitespace-nowrap',
              tab === 'modems' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Router className="size-3.5" /> Módems y Cola FIFO
            {pendingOffer ? (
              <span className="ml-0.5 inline-flex items-center gap-1 rounded-sm border border-border bg-background px-1.5 font-mono text-[10px] font-semibold text-primary tabular-nums">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                {countdown ?? pendingOffer.expires_in_seconds}s
              </span>
            ) : summary.waiting_count > 0 ? (
              <span className="ml-0.5 rounded-sm border border-border bg-background px-1.5 font-mono text-[10px] font-semibold text-foreground tabular-nums">
                {summary.waiting_count}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setTab('ledger')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm px-3 py-1 transition-colors cursor-pointer text-sm font-medium whitespace-nowrap',
              tab === 'ledger' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <History className="size-3.5" /> Libro Mayor de IPs
            <span className="ml-0.5 rounded-sm border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">
              {ledgerEntries.length}
            </span>
          </button>
        </div>
      </header>

      {/* ── CUERPO ─────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {tab === 'modems' ? (
          <>
            {/* SECCIÓN CENTRAL: métricas, inventario y cola FIFO */}
            <section className="flex min-w-0 flex-1 flex-col border-r border-border">
              {/* Métricas rápidas */}
              <div className="grid shrink-0 grid-cols-4 gap-px border-b border-border bg-border select-none">
                <MetricCell
                  icon={<Router className="size-3.5 text-primary" />}
                  label="Módems"
                  value={summary.total_usb}
                  sub={`${summary.free_usb} libres`}
                  bar={summary.total_usb ? summary.free_usb / summary.total_usb : 0}
                />
                <MetricCell
                  icon={<Signal className="size-3.5 text-success" />}
                  label="Enlace móvil"
                  value={summary.assigned_usb}
                  sub="enrutados"
                />
                <MetricCell
                  icon={<Clock className={cn('size-3.5', summary.waiting_count > 0 ? 'text-warning' : 'text-muted-foreground')} />}
                  label="Cola FIFO"
                  value={summary.waiting_count}
                  sub={summary.waiting_count > 0 ? 'en espera' : 'vacía'}
                />
                <MetricCell
                  icon={<ShieldCheck className="size-3.5 text-muted-foreground" />}
                  label="Retención TTL"
                  value={currentTtl.toUpperCase()}
                  sub={ttlLabel(currentTtl)}
                  onClick={() => setTab('ledger')}
                  title="Abrir Libro Mayor de IPs"
                />
              </div>

              {/* Inventario de módems físicos */}
              <ModemInventoryTable
                devices={devices}
                selectedSerial={sel?.serial ?? null}
                busyAction={busyAction}
                pendingOfferDeviceSerial={pendingOffer?.device_serial}
                onSelectDevice={selectDevice}
                onOpenInstance={onSelectInstance}
              />

              {/* Cola FIFO horizontal */}
              <FifoQueueBar
                waitingQueue={waitingQueue}
                pendingOffer={pendingOffer}
                countdown={countdown}
                busyAction={busyAction}
                onClaimUsb={handleClaimUsb}
                onDeclineOffer={handleDeclineOffer}
              />
            </section>

            {/* ASIDE INSPECTOR DEL MÓDEM */}
            <aside className="flex w-[380px] shrink-0 select-none flex-col overflow-hidden bg-surface">
              {sel ? (
                <ModemInspector
                  dev={sel}
                  instances={instances}
                  waitingQueue={waitingQueue}
                  busyAction={busyAction}
                  assignTarget={assignTarget}
                  holderOf={holderOf}
                  onAssignTarget={setAssignTarget}
                  onTest={() => handleTestRotation(sel.serial)}
                  onRotate={() => sel.assigned_instance && handleRotateAssigned(sel.assigned_instance)}
                  onRelease={() => sel.assigned_instance && setToRelease(sel.assigned_instance)}
                  onAssign={async () => {
                    if (!assignTarget) return;
                    await handleClaimUsb(assignTarget, sel.serial);
                    setAssignTarget(null);
                  }}
                  onOpenInstance={onSelectInstance}
                />
              ) : (
                <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
                  Seleccioná un módem
                </div>
              )}
            </aside>
          </>
        ) : (
          <IpLedgerTable
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            activeOnly={activeOnly}
            setActiveOnly={setActiveOnly}
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            pageSizeOpen={pageSizeOpen}
            setPageSizeOpen={setPageSizeOpen}
            filteredEntries={filteredEntries}
            paginatedEntries={paginatedEntries}
            ledgerEntries={ledgerEntries}
            currentTtl={currentTtl}
            busyAction={busyAction}
            onSetTtl={handleSetTtl}
            onConfirmPurge={() => setConfirmPurge(true)}
            onSelectInstance={onSelectInstance}
          />
        )}
      </div>

      {/* CONFIRMAR SOLTAR (CUARENTENA) */}
      <AlertDialog open={!!toRelease} onOpenChange={(o) => !o && setToRelease(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Soltar módem de {toRelease}?</AlertDialogTitle>
            <AlertDialogDescription>
              La instancia pasa a cuarentena segura sin red y el módem queda libre. Si hay CloudPhones en la cola FIFO,
              el primero recibe el turno con {GRACE_SECONDS}s de gracia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const name = toRelease;
                setToRelease(null);
                if (name) handleQuarantineInstance(name);
              }}
            >
              Soltar y aislar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONFIRMAR PURGA */}
      <AlertDialog open={confirmPurge} onOpenChange={setConfirmPurge}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Purgar registros expirados?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminan del Libro Mayor las IPs cuya retención ({ttlLabel(currentTtl)}) ya venció. Esas IPs podrán volver a
              asignarse a cualquier CloudPhone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmPurge(false);
                handlePurgeExpired();
              }}
            >
              Purgar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MetricCell({
  icon,
  label,
  value,
  sub,
  bar,
  valueClassName,
  onClick,
  title,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  sub: string;
  bar?: number | undefined;
  valueClassName?: string | undefined;
  onClick?: (() => void) | undefined;
  title?: string | undefined;
}) {
  const Comp = onClick ? 'button' : 'div';
  const node = (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col gap-1 bg-background px-4 py-2.5 text-left',
        onClick && 'cursor-pointer transition-colors hover:bg-surface'
      )}
    >
      <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </span>
      <span className="flex items-baseline gap-2">
        <span className={cn('font-mono text-xl font-semibold leading-none tabular-nums text-foreground', valueClassName)}>
          {value}
        </span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{sub}</span>
      </span>
      {bar !== undefined && (
        <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-success transition-all" style={{ width: `${Math.round(bar * 100)}%` }} />
        </span>
      )}
    </Comp>
  );

  return title ? <TooltipSimple content={title}>{node}</TooltipSimple> : node;
}
