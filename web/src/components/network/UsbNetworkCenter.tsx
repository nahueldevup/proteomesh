import { useCallback, useEffect, useState } from 'react';
import {
  Usb,
  RotateCw,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Trash2,
  Smartphone,
  Signal,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ArrowRightLeft,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
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

  useEffect(() => {
    loadData();
    const interval = window.setInterval(() => {
      // Polling ligero solo si la pestaña está visible
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
        toast.success(`Módem liberado y asignado automáticamente a '${res.popped_next}' de la cola`, { id: toastId });
      } else {
        toast.success(`Instancia ${instanceName} aislada en cuarentena segura`, { id: toastId });
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

  const devices = data?.devices || [];
  const waitingQueue = data?.waiting_queue || [];
  const summary = data?.summary || { total_usb: 0, free_usb: 0, assigned_usb: 0, waiting_count: 0, ttl: '7d' };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Cabecera y Resumen Métrico */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Usb className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Centro de Red USB & Historial de IPs
            </h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Enrutamiento transparente a nivel kernel por tethering USB, cuarentena automática en host y rotación de IP móvil vía Modo Avión.
          </p>
        </div>

        <button
          onClick={() => loadData()}
          disabled={loading}
          className="inline-flex h-8 items-center gap-1.5 self-start sm:self-auto rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Actualizar
        </button>
      </div>

      {/* Tarjetas de Resumen Rápido */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium">Celulares USB Conectados</span>
            <Smartphone className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{summary.total_usb}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {summary.free_usb} disponibles para asignar
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium">Enlace Móvil Activo</span>
            <Signal className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.assigned_usb}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">CloudPhones con salida USB</div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium">Cola de Espera FIFO</span>
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {summary.waiting_count > 0 ? (
              <span className="text-amber-600 dark:text-amber-400">{summary.waiting_count}</span>
            ) : (
              '0'
            )}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {summary.waiting_count > 0 ? 'Esperando que se libere un USB' : 'Sin instancias pendientes'}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium">Retención Anti-Vinculación</span>
            <ShieldAlert className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground uppercase">{currentTtl}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">Ventana TTL por CloudPhone</div>
        </div>
      </div>

      {/* Banner de Cola de Espera (si hay instancias esperando) */}
      {waitingQueue.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-xs font-bold text-foreground">
                Hay {waitingQueue.length} CloudPhone(s) esperando conexión USB en la cola FIFO
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Permanecen aislados en cuarentena segura en el host (con ADB y streaming táctil activos). Para darles Internet podés conectar otro celular por cable USB o soltar la red de uno ocupado.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {waitingQueue.map((inst, idx) => (
                  <div
                    key={inst}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground"
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/15 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                      #{idx + 1}
                    </span>
                    <span>{inst}</span>
                    <button
                      onClick={() => handleClaimUsb(inst)}
                      disabled={busyAction === `claim-${inst}`}
                      className="ml-1 rounded border border-border bg-secondary hover:bg-accent px-1.5 py-0.5 text-[10px] font-medium text-foreground disabled:opacity-50"
                    >
                      {busyAction === `claim-${inst}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Reintentar'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Panel 1: Pool de Celulares Físicos por Anclaje USB */}
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-3">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" />
              Pool de Celulares Físicos (Tethering USB)
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Módems reales detectados en CachyOS. Cada celular se asigna a lo sumo a 1 contenedor para IP limpia garantizada.
            </p>
          </div>
          <span className="self-start sm:self-auto rounded border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Exclusividad 1:1 Mutex
          </span>
        </div>

        {devices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-8 text-center">
            <Usb className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-2 text-xs font-semibold text-foreground">No se detectaron celulares USB conectados</p>
            <p className="mt-1 text-[11px] text-muted-foreground max-w-sm mx-auto">
              Conectá un teléfono Android por cable USB, activá la <strong>Depuración USB</strong> y la opción <strong>Anclaje a red USB</strong> (Tethering).
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {devices.map((dev) => {
              const isAssigned = Boolean(dev.assigned_instance);
              const isBusy = busyAction === `test-${dev.serial}` || busyAction === `rotate-${dev.assigned_instance}` || busyAction === `quarantine-${dev.assigned_instance}`;

              return (
                <div
                  key={dev.serial}
                  className={cn(
                    'relative rounded-xl border p-4 transition-all bg-surface',
                    isAssigned
                      ? 'border-emerald-500/40 ring-1 ring-emerald-500/15 shadow-xs'
                      : 'border-border hover:border-border-hover'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-lg border',
                          isAssigned
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-border bg-secondary/50 text-muted-foreground'
                        )}
                      >
                        <Smartphone className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-bold text-foreground">{dev.model}</h4>
                          <span className="rounded bg-background px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground border border-border/50">
                            {dev.serial}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1">
                            <Signal className="h-3 w-3 text-primary" />
                            {dev.carrier} ({dev.network_type})
                          </span>
                          <span>•</span>
                          <span className="font-mono">{dev.iface}</span>
                          <span>•</span>
                          <span>Bat: {dev.battery}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {isAssigned ? (
                        <button
                          onClick={() => onSelectInstance?.(dev.assigned_instance!)}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                          title="Abrir CloudPhone en Vista Enfocada"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          En uso: {dev.assigned_instance}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border">
                          Disponible
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-[11px]">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>Gateway: <strong className="font-mono text-foreground">{dev.gateway || 'DHCP'}</strong></span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Botón de testeo */}
                      <button
                        onClick={() => handleTestRotation(dev.serial)}
                        disabled={isBusy}
                        title="Prueba un ciclo de Modo Avión para medir tiempo de reinicio de la radio"
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-surface px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
                      >
                        {busyAction === `test-${dev.serial}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCw className="h-3 w-3" />
                        )}
                        Test Avión
                      </button>

                      {isAssigned ? (
                        <>
                          <button
                            onClick={() => handleRotateAssigned(dev.assigned_instance!)}
                            disabled={isBusy}
                            title="Fuerza un cambio de IP pública sobre este módem vía Modo Avión"
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-surface px-2 text-[11px] font-medium text-foreground hover:bg-surface-hover disabled:opacity-40"
                          >
                            {busyAction === `rotate-${dev.assigned_instance}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ArrowRightLeft className="h-3 w-3 text-primary" />
                            )}
                            Rotar IP
                          </button>

                          <button
                            onClick={() => handleQuarantineInstance(dev.assigned_instance!)}
                            disabled={isBusy}
                            title="Desvincula el módem y pone el CloudPhone en cuarentena inmediata"
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 disabled:opacity-40"
                          >
                            {busyAction === `quarantine-${dev.assigned_instance}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ShieldAlert className="h-3 w-3 text-rose-500" />
                            )}
                            Soltar Red
                          </button>
                        </>
                      ) : (
                        instances.length > 0 && (
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleClaimUsb(e.target.value, dev.serial);
                                e.target.value = '';
                              }
                            }}
                            defaultValue=""
                            disabled={isBusy}
                            className="h-7 rounded-lg border border-border bg-surface px-2 text-[11px] font-medium text-foreground hover:bg-surface-hover disabled:opacity-40"
                          >
                            <option value="" disabled>Asignar a CloudPhone...</option>
                            {instances.map((inst) => (
                              <option key={inst.instance_name} value={inst.instance_name}>
                                {inst.instance_name} {inst.running ? '(Online)' : '(Offline)'}
                              </option>
                            ))}
                          </select>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Panel 2: Libro Mayor de IPs Públicas (Historial) */}
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Libro Mayor de IPs Públicas (Anti-Vinculación)
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Historial de IPs móviles registradas con control de TTL. Si una IP fue usada por otro CloudPhone en esta ventana, se rota obligatoriamente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Selector de TTL */}
            <div className="flex items-center rounded-lg border border-border bg-background p-0.5 text-xs">
              {TTL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSetTtl(opt.value)}
                  disabled={busyAction === 'set-ttl'}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-medium rounded-md transition-all',
                    currentTtl === opt.value
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              onClick={handlePurgeExpired}
              disabled={busyAction === 'purge'}
              title="Elimina registros cuya retención ya expiró"
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" />
              Purgar Expiradas
            </button>
          </div>
        </div>

        {/* Buscador de entradas */}
        <div className="flex items-center gap-2 max-w-sm rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Buscar por IP, instancia u operadora..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground text-foreground text-xs"
          />
        </div>

        {/* Tabla del Libro Mayor */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-surface-muted/50 text-[11px] font-semibold text-muted-foreground">
              <tr>
                <th className="px-3.5 py-2.5">IP Pública</th>
                <th className="px-3.5 py-2.5">CloudPhone Dueño</th>
                <th className="px-3.5 py-2.5">Módem / Serial</th>
                <th className="px-3.5 py-2.5">Operadora</th>
                <th className="px-3.5 py-2.5">Último Uso</th>
                <th className="px-3.5 py-2.5">Estado Retención</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-[11px]">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3.5 py-6 text-center text-muted-foreground font-sans">
                    No hay registros de IPs en el historial con los filtros actuales.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-hover/50 transition-colors">
                    <td className="px-3.5 py-2 font-bold text-foreground">
                      {row.ip}
                    </td>
                    <td
                      onClick={() => onSelectInstance?.(row.instance_name)}
                      className="px-3.5 py-2 font-sans font-semibold text-primary hover:underline cursor-pointer"
                      title="Abrir CloudPhone en Vista Enfocada"
                    >
                      {row.instance_name}
                    </td>
                    <td className="px-3.5 py-2 text-muted-foreground">
                      {row.usb_id}
                    </td>
                    <td className="px-3.5 py-2 font-sans text-foreground">
                      {row.carrier || 'Móvil'}
                    </td>
                    <td className="px-3.5 py-2 text-muted-foreground text-[10px]">
                      {new Date(row.last_seen_at).toLocaleString()}
                    </td>
                    <td className="px-3.5 py-2 font-sans">
                      {row.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          Activa (Protegida)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          Expirada
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
