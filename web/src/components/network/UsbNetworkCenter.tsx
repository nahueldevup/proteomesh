import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Router,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Trash2,
  Signal,
  Loader2,
  ArrowRightLeft,
  Search,
  ChevronDown,
  ChevronRight,
  Check,
  ExternalLink,
  Smartphone,
  Plane,
  Circle,
  History,
  Hourglass,
  Battery,
  BatteryLow,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, useIpLedger } from '../../lib/queries';
import { api } from '../../lib/api';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Switch } from '../ui/switch';
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
import type { UsbNetworkOverview, UsbPhysicalPhone, IpLedgerEntry, Instance } from '../../types';
import { cn } from '../../lib/utils';

interface UsbNetworkCenterProps {
  instances: Instance[];
  overview?: UsbNetworkOverview | undefined;
  onRefresh: () => unknown;
  onSelectInstance?: ((name: string) => void) | undefined;
}

type NetworkTab = 'modems' | 'ledger';

const NO_ENTRIES: IpLedgerEntry[] = [];
const GRACE_SECONDS = 5;
const PAGE_SIZES = [15, 20, 50, 100];

const TTL_OPTIONS = [
  { value: '24h', label: '24 Horas', hint: 'Rotación agresiva, reutiliza IPs al día siguiente' },
  { value: '7d', label: '7 Días (Recomendado)', hint: 'Equilibrio entre pool disponible y aislamiento' },
  { value: '30d', label: '30 Días', hint: 'Aislamiento fuerte, reduce el pool reutilizable' },
  { value: 'permanent', label: 'Permanente', hint: 'Una IP nunca se repite entre CloudPhones' },
];

const ttlLabel = (ttl: string) => TTL_OPTIONS.find((o) => o.value === ttl)?.label.split(' (')[0] ?? ttl;

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
  const activeEntries = ledgerEntries.filter((e) => e.is_active).length;
  const expiredEntries = ledgerEntries.length - activeEntries;

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
                          active={sel?.serial === dev.serial}
                          busy={
                            busyAction === `test-${dev.serial}` ||
                            busyAction === `rotate-${dev.assigned_instance}` ||
                            busyAction === `quarantine-${dev.assigned_instance}`
                          }
                          offered={pendingOffer?.device_serial === dev.serial}
                          onSelect={() => selectDevice(dev.serial)}
                          onOpenInstance={onSelectInstance}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Cola FIFO horizontal */}
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
                          <CountdownRing value={countdown ?? pendingOffer.expires_in_seconds ?? GRACE_SECONDS} total={GRACE_SECONDS} />
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
                                onClick={() => handleClaimUsb(pendingOffer.instance)}
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
                                onClick={() => handleDeclineOffer(pendingOffer.instance)}
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
                                    onClick={() => handleClaimUsb(inst)}
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
          <>
            {/* LIBRO MAYOR: tabla paginada */}
            <section className="flex min-w-0 flex-1 flex-col border-r border-border">
              <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
                <div className="relative min-w-48 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Buscar por IP, CloudPhone, serial u operadora…"
                    className="h-8 w-full rounded-md border border-input bg-surface pl-8 pr-3 font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground focus:border-primary"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
                  <Switch
                    checked={activeOnly}
                    onCheckedChange={(v) => {
                      setActiveOnly(v);
                      setPage(1);
                    }}
                    className="data-[state=checked]:bg-success"
                  />
                  Solo activas
                </label>
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[150px]" />
                    <col className="w-auto" />
                    <col className="w-[150px]" />
                    <col className="w-[110px]" />
                    <col className="w-[170px]" />
                    <col className="w-[110px]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-background text-left text-[11px] uppercase tracking-wider text-muted-foreground select-none">
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 font-medium">IP pública</th>
                      <th className="px-2 py-2 font-medium">CloudPhone dueño</th>
                      <th className="px-2 py-2 font-medium">Módem / Serial</th>
                      <th className="px-2 py-2 font-medium">Operadora</th>
                      <th className="px-2 py-2 font-medium">Último uso</th>
                      <th className="px-4 py-2 font-medium">Retención</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEntries.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">
                          <Globe className="mx-auto mb-2 size-7 opacity-40" />
                          No hay registros de IPs en el historial con los filtros actuales.
                        </td>
                      </tr>
                    ) : (
                      paginatedEntries.map((row) => (
                        <tr key={row.id} className="border-b border-border/60 transition-colors hover:bg-surface-2/60">
                          <td className="px-4 py-2 font-mono text-xs font-semibold text-foreground tabular-nums">{row.ip}</td>
                          <td className="px-2 py-2">
                            <TooltipSimple content="Abrir CloudPhone en Vista Enfocada">
                              <button
                                type="button"
                                onClick={() => onSelectInstance?.(row.instance_name)}
                                className="inline-flex max-w-full items-center gap-1.5 font-mono text-xs font-medium text-primary hover:underline cursor-pointer"
                              >
                                <Smartphone className="size-3 shrink-0" />
                                <span className="truncate">{row.instance_name}</span>
                              </button>
                            </TooltipSimple>
                          </td>
                          <td className="truncate px-2 py-2 font-mono text-xs text-muted-foreground">
                            <TooltipSimple content={`Módem: ${row.usb_id}`}>
                              <span className="truncate block">{row.usb_id}</span>
                            </TooltipSimple>
                          </td>
                          <td className="truncate px-2 py-2 text-xs text-foreground">{row.carrier || 'Móvil'}</td>
                          <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground tabular-nums">
                            {new Date(row.last_seen_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-2">
                            {row.is_active ? (
                              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-foreground">
                                <span className="size-1.5 shrink-0 rounded-full bg-success" /> Activa
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground/70">
                                <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/30" /> Expirada
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-1.5 font-mono text-[11px] text-muted-foreground select-none">
                <span>
                  {filteredEntries.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredEntries.length)} de{' '}
                  {filteredEntries.length} IPs registradas
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span>Por página</span>
                    <Popover open={pageSizeOpen} onOpenChange={setPageSizeOpen}>
                      <PopoverTrigger asChild>
                        <div>
                          <TooltipSimple content="Cambiar límite de registros por página">
                            <button
                              type="button"
                              className="flex h-6 items-center gap-1 rounded-sm border border-border bg-surface px-1.5 text-[11px] text-foreground transition-colors hover:bg-surface-2 cursor-pointer"
                            >
                              {pageSize}
                              <ChevronDown className={cn('size-3 opacity-60 transition-transform duration-200', pageSizeOpen && 'rotate-180')} />
                            </button>
                          </TooltipSimple>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="center" sideOffset={4} className="w-20 space-y-0.5 p-1 font-mono text-[11px]">
                        {PAGE_SIZES.map((size) => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => {
                              setPageSize(size);
                              setPage(1);
                              setPageSizeOpen(false);
                            }}
                            className={cn(
                              'flex w-full items-center justify-between rounded-xs px-2 py-1 text-left transition-colors cursor-pointer',
                              pageSize === size ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                          >
                            {size}
                            {pageSize === size && <Check className="size-3 text-primary" />}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setPage(Math.max(1, safePage - 1))}
                      className="h-6 rounded-sm border border-border bg-surface px-2 text-[11px] text-foreground transition-colors hover:bg-surface-2 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Anterior
                    </button>
                    <span className="px-1.5 tabular-nums">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                      className="h-6 rounded-sm border border-border bg-surface px-2 text-[11px] text-foreground transition-colors hover:bg-surface-2 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              </footer>
            </section>

            {/* ASIDE: POLÍTICA ANTI-VINCULACIÓN */}
            <aside className="flex w-[380px] shrink-0 select-none flex-col overflow-hidden bg-surface">
              <div className="border-b border-border p-4">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-card">
                    <ShieldCheck className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold">Anti-vinculación</h2>
                    <p className="text-xs text-muted-foreground">
                      Historial con ventana TTL para prevenir colisiones de IP entre CloudPhones.
                    </p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
                  {(
                    [
                      ['Registros', ledgerEntries.length, 'text-foreground'],
                      ['Activas', activeEntries, 'text-success'],
                      ['Expiradas', expiredEntries, 'text-muted-foreground'],
                    ] as const
                  ).map(([k, v, c]) => (
                    <div key={k} className="bg-card px-2.5 py-2">
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
                      <dd className={cn('mt-0.5 font-mono text-base font-semibold tabular-nums', c)}>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Política de retención TTL
                </h3>
                <div className="space-y-1.5">
                  {TTL_OPTIONS.map((opt) => {
                    const on = currentTtl === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={busyAction === 'set-ttl'}
                        onClick={() => !on && handleSetTtl(opt.value)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-all cursor-pointer disabled:cursor-wait',
                          on ? 'border-primary bg-card' : 'border-border bg-card hover:border-muted-foreground/40'
                        )}
                      >
                        <span
                          className={cn(
                            'grid size-4 shrink-0 place-items-center rounded-full border',
                            on ? 'border-primary bg-primary' : 'border-border'
                          )}
                        >
                          {on && <Check className="size-2.5 text-primary-foreground" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{opt.hint}</div>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{opt.value}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-auto pt-4">
                  <button
                    type="button"
                    onClick={() => setConfirmPurge(true)}
                    disabled={busyAction === 'purge'}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:border-destructive/60 hover:text-destructive disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {busyAction === 'purge' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4 text-destructive" />}
                    Purgar expirados
                    <span className="font-mono text-xs text-muted-foreground">({expiredEntries})</span>
                  </button>
                  <p className="mt-2 text-center font-mono text-[11px] text-muted-foreground">
                    Elimina registros cuya retención ya expiró
                  </p>
                </div>
              </div>
            </aside>
          </>
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
            <AlertDialogTitle>¿Purgar {expiredEntries} registros expirados?</AlertDialogTitle>
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

// ═══════════════════════════════════════════════════════════════════
// Subcomponentes de presentación
// ═══════════════════════════════════════════════════════════════════

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

function BatteryMeter({ battery }: { battery: string }) {
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

function ModemRow({
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

function CountdownRing({ value, total }: { value: number; total: number }) {
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

function ModemInspector({
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
}: {
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
}) {
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

function RadioAction({
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
