import { useCallback, useEffect, useState } from 'react';
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
  RefreshCw,
  ArrowRightLeft,
  Search,
  ChevronDown,
  Check,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import type {
  UsbNetworkOverview,
  IpLedgerEntry,
  Instance,
} from '../../types';
import { cn } from '../../lib/utils';

interface UsbNetworkCenterProps {
  instances: Instance[];
  onSelectInstance?: (name: string) => void;
}

const TTL_OPTIONS = [
  { value: '24h', label: '24 Horas' },
  { value: '7d', label: '7 Días (Recomendado)' },
  { value: '30d', label: '30 Días' },
  { value: 'permanent', label: 'Permanente' },
];

export default function UsbNetworkCenter({ instances, onSelectInstance }: UsbNetworkCenterProps) {
  const [data, setData] = useState<UsbNetworkOverview | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<IpLedgerEntry[]>([]);
  const [currentTtl, setCurrentTtl] = useState('7d');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState<number>(1);
  const [pageSizeOpen, setPageSizeOpen] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [overview, ledger] = await Promise.all([
        api.getUsbNetworkStatus(),
        api.getIpLedger(150, false),
      ]);
      setData(overview);
      setLedgerEntries(ledger.entries);
      setCurrentTtl(ledger.ttl || '7d');
    } catch {
      if (!silent) {
        toast.error('Error al cargar estado de red USB');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Contador regresivo en vivo para la ventana de gracia de 5s (Turno pendiente)
  useEffect(() => {
    const offer = data?.pending_offer;
    if (!offer) {
      setCountdown(null);
      return;
    }

    const expiresAt = offer.expires_at ? offer.expires_at * 1000 : (Date.now() + (offer.expires_in_seconds || 5) * 1000);

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        window.setTimeout(() => loadData(true), 800);
      }
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(timer);
  }, [data?.pending_offer, loadData]);

  useEffect(() => {
    loadData();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    }, 6000);
    return () => window.clearInterval(interval);
  }, [loadData]);

  const handleTestRotation = async (serial: string) => {
    setBusyAction(`test-${serial}`);
    const toastId = toast.loading(`Probando ciclo de Modo Avión en ${serial}...`);
    try {
      const res = await api.testUsbRotation(serial);
      toast.success(`Modo Avión OK en ${res.elapsed_seconds}s (radio reiniciada)`, { id: toastId });
      await loadData(true);
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
      await loadData(true);
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
      await loadData(true);
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
      await loadData(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fallo al reclamar USB', { id: toastId });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeclineOffer = async (instanceName: string) => {
    setBusyAction(`decline-${instanceName}`);
    const toastId = toast.loading(`Cediento turno para ${instanceName}...`);
    try {
      const res = await api.declineOffer(instanceName, true);
      if (res.next_offered) {
        toast.info(`Turno cedido. Módem ofrecido a '${res.next_offered}'`, { id: toastId });
      } else {
        toast.success(`Turno cedido para ${instanceName}`, { id: toastId });
      }
      await loadData(true);
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
      setCurrentTtl(ttl);
      toast.success(`Retención TTL actualizada a ${ttl}`);
      await loadData(true);
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
      await loadData(true);
    } catch {
      toast.error('Error al purgar historial');
    } finally {
      setBusyAction(null);
    }
  };

  const filteredEntries = ledgerEntries.filter((e) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      e.ip.toLowerCase().includes(term) ||
      e.instance_name.toLowerCase().includes(term) ||
      (e.carrier && e.carrier.toLowerCase().includes(term)) ||
      e.usb_id.toLowerCase().includes(term)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const paginatedEntries = filteredEntries.slice((page - 1) * pageSize, page * pageSize);

  const devices = data?.devices || [];
  const waitingQueue = data?.waiting_queue || [];
  const summary = data?.summary || { total_usb: 0, free_usb: 0, assigned_usb: 0, waiting_count: 0, ttl: '7d' };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 font-sans">
      {/* ── 1. CABECERA TÉCNICA E INDICADORES EN LÍNEA ──────────────── */}
      <div className="space-y-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-sm bg-primary/20 text-foreground border border-primary/40">
                <Router className="h-4 w-4 text-primary" />
              </div>
              <h1 className="text-base font-bold tracking-tight text-foreground">
                Centro de Red USB & Historial de IPs
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Orquestación de módems físicos LTE/5G, asignaciones exclusivas 1:1, cola FIFO y Libro Mayor de IPs públicas.
            </p>
          </div>

          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            className="inline-flex h-7.5 items-center gap-1.5 self-start sm:self-auto rounded-sm border border-border bg-card px-2.5 text-xs font-mono font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors shadow-xs"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span>Actualizar</span>
          </button>
        </div>

        {/* Franja de Estado Operativo en Línea (Compacta, reemplaza las 4 tarjetas gigantes) */}
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-sm border border-border bg-card p-1 text-xs font-mono scrollbar-none">
          {/* Módems Físicos */}
          <div className="flex items-center gap-2 px-2.5 py-1 border-r border-border/60 shrink-0">
            <Router className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground text-[11px]">Módems:</span>
            <span className="font-bold text-foreground">{summary.total_usb}</span>
            <span className="text-[10px] text-muted-foreground">({summary.free_usb} disponibles)</span>
          </div>

          {/* Enlaces Móviles Activos */}
          <div className="flex items-center gap-2 px-2.5 py-1 border-r border-border/60 shrink-0">
            <Signal className="h-3.5 w-3.5 text-success" />
            <span className="text-muted-foreground text-[11px]">Enlace Móvil:</span>
            <span className="font-bold text-foreground">{summary.assigned_usb}</span>
            <span className="text-[10px] text-muted-foreground">enrutados</span>
          </div>

          {/* Cola FIFO */}
          <div className="flex items-center gap-2 px-2.5 py-1 border-r border-border/60 shrink-0">
            <Clock className={cn("h-3.5 w-3.5", summary.waiting_count > 0 ? "text-primary" : "text-muted-foreground")} />
            <span className="text-muted-foreground text-[11px]">Cola FIFO:</span>
            <span className={cn("font-bold", summary.waiting_count > 0 ? "text-primary" : "text-foreground")}>
              {summary.waiting_count}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {summary.waiting_count > 0 ? 'en espera' : 'vacía'}
            </span>
          </div>

          {/* Política de Retención TTL */}
          <div className="flex items-center gap-2 px-2.5 py-1 shrink-0 ml-auto">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground text-[11px]">Retención:</span>
            <span className="font-bold text-foreground uppercase">{currentTtl}</span>
          </div>
        </div>
      </div>

      {/* ── 2. ÁREA OPERATIVA EN 2 COLUMNAS (ISLAS COMPACTAS CON SCROLL INTERNO) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* COLUMNA IZQUIERDA: Inventario de Módems Físicos USB (7 cols, 2 por fila, altura automática hasta max-h) */}
        <section className="lg:col-span-7 max-h-[340px] flex flex-col rounded-sm border border-border bg-card p-3 space-y-2">
          {/* Cabecera de la sección */}
          <div className="flex items-center justify-between border-b border-border pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <Router className="h-3.5 w-3.5 text-primary" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground font-mono">
                Inventario de Módems USB ({devices.length})
              </h2>
            </div>
            <span className="rounded-xs border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              Mutex 1:1
            </span>
          </div>

          {devices.length === 0 ? (
            <div className="py-5 flex flex-col items-center justify-center rounded-sm border border-dashed border-border text-center bg-muted/10 font-mono">
              <Router className="h-6 w-6 text-muted-foreground/40 mb-1.5" />
              <p className="text-xs font-semibold text-foreground">No se detectaron módems conectados</p>
              <p className="text-[10px] text-muted-foreground max-w-xs mt-0.5 font-sans">
                Conectá un teléfono o dongle USB en CachyOS y activá el <strong>Anclaje a red USB</strong>.
              </p>
            </div>
          ) : (
            /* Grid inteligente: 1 columna si hay 1 solo módem (sin hueco vacío), 2 columnas si hay 2 o más */
            <div
              className={cn(
                'gap-2 overflow-y-auto pr-1 items-start content-start',
                devices.length === 1 ? 'grid grid-cols-1' : 'grid grid-cols-1 sm:grid-cols-2'
              )}
            >
              {devices.map((dev) => {
                const isAssigned = Boolean(dev.assigned_instance);
                const isBusy =
                  busyAction === `test-${dev.serial}` ||
                  busyAction === `rotate-${dev.assigned_instance}` ||
                  busyAction === `quarantine-${dev.assigned_instance}`;
                const batteryNum = parseInt(dev.battery, 10);

                return (
                  <div
                    key={dev.serial}
                    className={cn(
                      'rounded-xs border p-2 transition-colors bg-card space-y-1.5 h-auto',
                      isAssigned ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border hover:border-foreground/30'
                    )}
                  >
                    {/* Fila Superior: Hardware y Estado */}
                    <div className="flex items-start justify-between gap-1.5 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Router className="h-3.5 w-3.5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-foreground truncate font-sans" title={dev.model}>
                            {dev.model}
                          </div>
                          <div className="text-[9px] font-mono text-muted-foreground truncate">
                            {dev.serial}
                          </div>
                        </div>
                      </div>

                      {/* Badge de Asignación */}
                      <div className="shrink-0">
                        {isAssigned ? (
                          <button
                            type="button"
                            onClick={() => onSelectInstance?.(dev.assigned_instance!)}
                            className="inline-flex items-center gap-1 rounded-xs bg-primary/20 border border-primary/40 px-1.5 py-0.2 text-[9px] font-mono font-bold text-foreground hover:bg-primary/30 transition-colors"
                            title={`Ver ${dev.assigned_instance} en FocusView`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-success" />
                            <span className="truncate max-w-[75px]">{dev.assigned_instance}</span>
                            <ExternalLink className="h-2 w-2 opacity-60 shrink-0" />
                          </button>
                        ) : (
                          <span className="inline-flex items-center rounded-xs bg-muted/60 border border-border px-1.5 py-0.2 text-[9px] font-mono text-muted-foreground">
                            ○ Libre
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Fila Media: Metadatos con chips técnicos */}
                    <div className="text-[10px] font-mono text-muted-foreground truncate flex items-center gap-1.5">
                      <span className="rounded-xs bg-muted/70 border border-border px-1 py-0.2 text-[9px] text-foreground font-bold">
                        {dev.iface}
                      </span>
                      <span>•</span>
                      <span className="text-foreground truncate">{dev.carrier}</span>
                      <span>•</span>
                      <span
                        className={cn(
                          'shrink-0 font-medium',
                          !isNaN(batteryNum) && batteryNum < 25
                            ? 'text-warning font-bold'
                            : 'text-muted-foreground'
                        )}
                      >
                        Bat: {dev.battery}
                      </span>
                    </div>

                    {/* Fila Inferior: Controles Operativos Compactos pegados inmediatamente abajo */}
                    <div className="flex items-center justify-between gap-1 border-t border-border/40 pt-1.5 text-[10px] font-mono">
                      <button
                        type="button"
                        onClick={() => handleTestRotation(dev.serial)}
                        disabled={isBusy}
                        title="Probar ciclo de Modo Avión para medir tiempo de reconexión"
                        className="h-6 inline-flex items-center gap-1 rounded-xs border border-border bg-card px-1.5 text-[10px] text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                      >
                        {busyAction === `test-${dev.serial}` ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <RotateCw className="h-2.5 w-2.5" />
                        )}
                        <span>Test</span>
                      </button>

                      {isAssigned ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleRotateAssigned(dev.assigned_instance!)}
                            disabled={isBusy}
                            title="Forzar rotación de IP pública"
                            className="h-6 inline-flex items-center gap-1 rounded-xs border border-border bg-card px-1.5 text-[10px] text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                          >
                            {busyAction === `rotate-${dev.assigned_instance}` ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : (
                              <ArrowRightLeft className="h-2.5 w-2.5 text-primary" />
                            )}
                            <span>Rotar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleQuarantineInstance(dev.assigned_instance!)}
                            disabled={isBusy}
                            title="Soltar red y aislar en cuarentena"
                            className="h-6 inline-flex items-center gap-0.5 rounded-xs border border-destructive/40 bg-destructive/10 px-1.5 text-[10px] font-bold text-destructive hover:bg-destructive/20 disabled:opacity-40 transition-colors"
                          >
                            {busyAction === `quarantine-${dev.assigned_instance}` ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : (
                              <ShieldAlert className="h-2.5 w-2.5" />
                            )}
                            <span>Soltar</span>
                          </button>
                        </div>
                      ) : (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              disabled={isBusy || instances.length === 0}
                              className="h-6 inline-flex items-center justify-between gap-1 rounded-xs border border-border bg-card px-1.5 text-[10px] text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                              title="Asignar este módem a un CloudPhone"
                            >
                              <span className="truncate">Asignar...</span>
                              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent side="top" align="end" sideOffset={4} className="w-56 p-1 space-y-0.5 font-mono text-[10px] shadow-2xl">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1.5 py-1 border-b border-border/50">
                              Asignar a CloudPhone
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-0.5 pr-0.5">
                              {instances.length === 0 ? (
                                <div className="p-2 text-center text-muted-foreground text-[10px]">No hay instancias</div>
                              ) : (
                                instances.map((inst) => (
                                  <button
                                    key={inst.instance_name}
                                    type="button"
                                    onClick={() => handleClaimUsb(inst.instance_name, dev.serial)}
                                    className="w-full flex items-center justify-between rounded-xs px-2 py-1 text-left text-[10px] hover:bg-muted transition-colors"
                                  >
                                    <div className="flex items-center gap-1.5 truncate">
                                      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", inst.running ? "bg-success" : "bg-muted-foreground/40")} />
                                      <span className="font-bold text-foreground truncate">{inst.instance_name}</span>
                                    </div>
                                    <span className="text-[9px] text-muted-foreground">:{inst.adb_port}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* COLUMNA DERECHA: Cola de Espera FIFO Operativa (5 cols) */}
        <section className="lg:col-span-5 max-h-[340px] flex flex-col rounded-sm border border-border bg-card p-3 space-y-2">
          {/* Cabecera de la cola */}
          <div className="flex items-center justify-between border-b border-border pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground font-mono">
                Cola FIFO ({waitingQueue.length})
              </h2>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              Orden de promoción
            </span>
          </div>

          {/* Turno Activo en Ventana de Gracia (Si hay oferta activa) */}
          {data?.pending_offer && (
            <div className="rounded-xs border border-primary/60 bg-primary/10 p-2 space-y-1.5 font-mono shrink-0">
              <div className="flex items-center justify-between text-[10px]">
                <span className="rounded-xs bg-primary text-primary-foreground px-1 py-0.2 font-bold uppercase tracking-wide">
                  Turno Activo (#1)
                </span>
                <span className="font-bold text-foreground">
                  Conectando en {countdown !== null ? `${countdown}s` : `${data.pending_offer.expires_in_seconds || 5}s`}
                </span>
              </div>

              <div className="text-[11px]">
                Módem disponible para <span className="font-bold text-foreground">{data.pending_offer.instance}</span>.
              </div>

              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => handleClaimUsb(data.pending_offer!.instance)}
                  disabled={busyAction === `claim-${data.pending_offer.instance}`}
                  className="flex-1 h-6 inline-flex items-center justify-center gap-1 rounded-xs bg-primary text-primary-foreground font-bold text-[10px] hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <Router className="h-2.5 w-2.5" />
                  <span>Conectar ya</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeclineOffer(data.pending_offer!.instance)}
                  disabled={busyAction === `decline-${data.pending_offer.instance}`}
                  className="h-6 inline-flex items-center justify-center gap-1 rounded-xs border border-border bg-card px-2 text-[10px] font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                >
                  <ArrowRightLeft className="h-2.5 w-2.5 text-muted-foreground" />
                  <span>Ceder turno</span>
                </button>
              </div>
            </div>
          )}

          {/* Lista Vertical de Instancias en Espera con Scroll Interno */}
          {waitingQueue.length === 0 && !data?.pending_offer ? (
            <div className="py-5 flex flex-col items-center justify-center rounded-sm border border-dashed border-border text-center bg-muted/10 font-mono">
              <CheckCircle2 className="h-6 w-6 text-success opacity-80 mb-1.5" />
              <p className="text-xs font-semibold text-foreground">Cola de espera vacía</p>
              <p className="text-[10px] text-muted-foreground max-w-xs mt-0.5 font-sans">
                Todas las instancias que requieren red están atendidas o en reposo.
              </p>
            </div>
          ) : (
            <div className="overflow-y-auto pr-1 space-y-1">
              {waitingQueue.map((inst, idx) => {
                const isOfferedThis = data?.pending_offer?.instance === inst;
                const isNext = idx === 0;

                return (
                  <div
                    key={inst}
                    className={cn(
                      'flex items-center justify-between rounded-xs border p-1.5 text-xs font-mono transition-colors',
                      isOfferedThis
                        ? 'border-primary/50 bg-primary/10'
                        : isNext
                        ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border bg-card/60'
                    )}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={cn(
                          'grid h-4.5 w-4.5 place-items-center rounded-xs border text-[9px] font-bold shrink-0',
                          isNext
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/50 border border-border text-foreground'
                        )}
                      >
                        #{idx + 1}
                      </span>
                      <div className="truncate">
                        <div className="font-bold text-foreground truncate text-xs flex items-center gap-1.5">
                          <span>{inst}</span>
                          {isNext && (
                            <span className="rounded-xs bg-primary/20 border border-primary/40 px-1 py-0.2 text-[8px] font-bold text-foreground">
                              Próximo Turno
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] text-muted-foreground">En cuarentena segura</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleClaimUsb(inst)}
                      disabled={busyAction === `claim-${inst}`}
                      title={isNext ? "Forzar turno prioritario a esta instancia" : "Reclamar módem"}
                      className={cn(
                        'h-5.5 px-2 rounded-xs border text-[9px] font-medium transition-colors disabled:opacity-40 font-mono',
                        isNext
                          ? 'border-primary/40 bg-primary/15 text-foreground hover:bg-primary/25 font-bold'
                          : 'border-border bg-card hover:bg-muted text-foreground'
                      )}
                    >
                      {busyAction === `claim-${inst}` ? (
                        <Loader2 className="h-2 w-2 animate-spin" />
                      ) : (
                        'Reclamar'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Panel 2: Libro Mayor de IPs Públicas (Historial de Ancho Completo) */}
      <section className="rounded-sm border border-border bg-card p-3.5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 border-b border-border pb-2.5">
          <div>
            <h2 className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider font-mono">
              <ShieldAlert className="h-3.5 w-3.5 text-primary" />
              Libro Mayor de IPs Públicas (Anti-Vinculación)
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Historial con ventana TTL para prevenir colisiones de IP entre CloudPhones.
            </p>
          </div>

          {/* Toolbar Unificada en 1 Sola Línea Continua */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Buscador Compacto */}
            <div className="flex items-center gap-1.5 w-52 h-7 rounded-xs border border-border bg-card px-2 text-xs">
              <Search className="h-3 w-3 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Buscar por IP, instancia..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent outline-none placeholder:text-muted-foreground text-foreground text-[10px] font-mono"
              />
            </div>

            {/* Selector de TTL Compacto */}
            <div className="flex items-center rounded-xs border border-border bg-muted/30 p-0.5 text-xs">
              {TTL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSetTtl(opt.value)}
                  disabled={busyAction === 'set-ttl'}
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-mono rounded-xs transition-colors',
                    currentTtl === opt.value
                      ? 'bg-card text-foreground font-bold shadow-xs border border-border/80'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  title={opt.label}
                >
                  {opt.label.split(' ')[0]}
                </button>
              ))}
            </div>

            {/* Botón Purgar */}
            <button
              type="button"
              onClick={handlePurgeExpired}
              disabled={busyAction === 'purge'}
              title="Elimina registros cuya retención ya expiró"
              className="h-7 inline-flex items-center gap-1 rounded-xs border border-border bg-card px-2 text-[10px] font-mono font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              <span>Purgar</span>
            </button>
          </div>
        </div>

        {/* Tabla del Libro Mayor con Scroll Interno y Cabecera Fija */}
        <div className="overflow-x-auto rounded-sm border border-border bg-card max-h-[380px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-border bg-card font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-wider shadow-xs">
              <tr>
                <th className="px-3 py-2 bg-card">IP Pública</th>
                <th className="px-3 py-2 bg-card">CloudPhone Dueño</th>
                <th className="px-3 py-2 bg-card">Módem / Serial</th>
                <th className="px-3 py-2 bg-card">Operadora</th>
                <th className="px-3 py-2 bg-card">Último Uso</th>
                <th className="px-3 py-2 bg-card">Estado Retención</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-[11px]">
              {paginatedEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground font-sans">
                    No hay registros de IPs en el historial con los filtros actuales.
                  </td>
                </tr>
              ) : (
                paginatedEntries.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-1.5 font-bold text-foreground font-mono tabular-nums">
                      {row.ip}
                    </td>
                    <td
                      onClick={() => onSelectInstance?.(row.instance_name)}
                      className="px-3 py-1.5 font-semibold text-primary hover:underline cursor-pointer"
                      title="Abrir CloudPhone en Vista Enfocada"
                    >
                      {row.instance_name}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground font-mono">
                      {row.usb_id}
                    </td>
                    <td className="px-3 py-1.5 text-foreground font-sans">
                      {row.carrier || 'Móvil'}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground text-[10px] font-mono tabular-nums">
                      {new Date(row.last_seen_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5">
                      {row.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-success shadow-xs shrink-0" />
                          <span className="font-medium text-foreground">Activa</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/60">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                          <span>Expirada</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación y Contador de Registros */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-border/60 text-[11px] font-mono">
          <span className="text-muted-foreground">
            Mostrando {filteredEntries.length === 0 ? 0 : (page - 1) * pageSize + 1} - {Math.min(page * pageSize, filteredEntries.length)} de {filteredEntries.length} IPs registradas
          </span>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-[10px]">Límite:</span>
              <Popover open={pageSizeOpen} onOpenChange={setPageSizeOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-6 flex items-center gap-1 rounded-xs border border-border bg-card px-1.5 text-[10px] font-mono text-foreground hover:bg-muted transition-colors"
                    title="Cambiar límite de registros por página"
                  >
                    <span>{pageSize}</span>
                    <ChevronDown className={cn("h-2.5 w-2.5 opacity-60 transition-transform duration-200", pageSizeOpen && "rotate-180")} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="center" sideOffset={4} className="w-20 p-1 space-y-0.5 font-mono text-[10px] shadow-xl">
                  {[15, 20, 50, 100].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setPageSize(size);
                        setPage(1);
                        setPageSizeOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between rounded-xs px-2 py-1 text-[10px] font-mono text-left transition-colors",
                        pageSize === size
                          ? "bg-primary/20 text-foreground font-bold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <span>{size}</span>
                      {pageSize === size && <Check className="h-2.5 w-2.5 text-primary" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-6 px-2 rounded-xs border border-border bg-card text-[10px] font-mono font-medium text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
              >
                Anterior
              </button>
              <span className="px-1 text-[10px] font-mono text-muted-foreground">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-6 px-2 rounded-xs border border-border bg-card text-[10px] font-mono font-medium text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
