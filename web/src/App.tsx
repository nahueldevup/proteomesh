import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Smartphone,
  MapPin,
  ShieldCheck,
  Search,
  CheckSquare,
  Plus,
  Command as CmdIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Usb,
  Clock,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { api } from './lib/api';
import type { Instance, LocationData, UsbNetworkOverview } from './types';
import { CreateDeviceModal } from './components/CreateDeviceModal';
import DeviceGrid from './components/grid/DeviceGrid';
import BulkBar from './components/grid/BulkBar';
import FocusView from './components/focus/FocusView';
import UsbNetworkCenter from './components/network/UsbNetworkCenter';
import { CustomLocationsManager } from './components/locations/CustomLocationsManager';
import { TooltipProvider } from './components/ui/tooltip';
import { IconBtn } from './components/ui/IconBtn';
import { Slider } from './components/ui/slider';
import { cn } from './lib/utils';

type ViewMode = 'grid' | 'focus';
type NavTab = 'instances' | 'network' | 'locations' | 'proxies';

const NAV = [
  { id: 'instances' as const, label: 'CloudPhones', icon: Smartphone },
  { id: 'network' as const, label: 'Centro de Red USB', icon: Usb },
  { id: 'locations' as const, label: 'Mapa y ubicaciones', icon: MapPin },
];

export function App() {
  const [activeNav, setActiveNav] = useState<NavTab>('instances');
  const [instances, setInstances] = useState<Instance[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');

  // Mosaico vs Enfocado
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [focusedName, setFocusedName] = useState<string | null>(null);

  // Columnas dinámicas del mosaico (8 por defecto, como en Lovable)
  const [cols, setCols] = useState(8);

  // Selección múltiple y control de grupo
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [groupMode, setGroupMode] = useState(false);

  // Barra lateral colapsable (colapsada por defecto como en Lovable)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createPresetModel, setCreatePresetModel] = useState<string | undefined>(undefined);

  // Tema Claro / Oscuro con persistencia en localStorage
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('pm-theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
    }
    localStorage.setItem('pm-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  };

  // Datos para otras pestañas
  const [locationPresets, setLocationPresets] = useState<Record<string, LocationData>>({});

  // Atajo de teclado universal Ctrl+B / Cmd+B para alternar el menú lateral
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Estado del Pool de Red USB y Cola FIFO (NET-USB-001)
  const [usbOverview, setUsbOverview] = useState<UsbNetworkOverview | null>(null);

  const fetchUsbOverview = useCallback(async () => {
    try {
      const data = await api.getUsbNetworkStatus();
      setUsbOverview(data);
    } catch {
      // Silenciar si la API aún no está disponible
    }
  }, []);

  useEffect(() => {
    fetchUsbOverview();
    const interval = setInterval(() => {
      fetchUsbOverview();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchUsbOverview]);

  const fetchInstances = async () => {
    try {
      const data = await api.getInstances();
      setInstances(data);
      const names = new Set(data.map((i) => i.instance_name));
      setSelectedNames((prev) => {
        const next = new Set([...prev].filter((n) => names.has(n)));
        return next.size === prev.size ? prev : next;
      });
    } catch (err) {
      console.error('Error fetching instances:', err);
    }
  };

  useEffect(() => {
    fetchInstances();
    const interval = setInterval(() => {
      // Pausar polling en segundo plano si el modal de creación está abierto
      if (!isCreateOpen) {
        fetchInstances();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isCreateOpen]);

  useEffect(() => {
    if (activeNav === 'locations' && Object.keys(locationPresets).length === 0) {
      api.getLocationPresets().then(setLocationPresets).catch(console.error);
    }
  }, [activeNav]);

  const filteredInstances = instances.filter((inst) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      inst.instance_name.toLowerCase().includes(q) ||
      (inst.template || '').toLowerCase().includes(q) ||
      (inst.location?.city || '').toLowerCase().includes(q) ||
      String(inst.adb_port).includes(q);

    if (statusFilter === 'online') return matchesSearch && inst.running;
    if (statusFilter === 'offline') return matchesSearch && !inst.running;
    return matchesSearch;
  });

  const onlineCount = instances.filter((i) => i.running).length;
  const existingPorts = useMemo(() => instances.map((i) => i.adb_port), [instances]);
  const focusedInstance = instances.find((i) => i.instance_name === focusedName) ?? null;
  const selectedList = [...selectedNames];
  const allFilteredSelected =
    filteredInstances.length > 0 &&
    filteredInstances.every((i) => selectedNames.has(i.instance_name));

  const toggleSelect = (name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visible = filteredInstances.map((i) => i.instance_name);
    if (allFilteredSelected) {
      setSelectedNames((prev) => {
        const next = new Set(prev);
        visible.forEach((n) => next.delete(n));
        return next;
      });
    } else {
      setSelectedNames((prev) => {
        const next = new Set(prev);
        visible.forEach((n) => next.add(n));
        return next;
      });
    }
  };

  const clearSelection = () => {
    setSelectedNames(new Set());
    setGroupMode(false);
  };

  const openFocus = (name: string) => {
    setFocusedName(name);
    setViewMode('focus');
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Toaster richColors position="top-right" theme={theme} />

        {/* ── BARRA LATERAL (APP SHELL MODERNO) ───────────────────── */}
        <aside
          className={cn(
            'flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200',
            sidebarCollapsed ? 'w-14' : 'w-56'
          )}
        >
          {/* Cabecera / Toggle superior del Sidebar */}
          {sidebarCollapsed ? (
            <div className="flex h-14 items-center justify-center border-b border-sidebar-border px-2">
              <IconBtn
                icon={PanelLeftOpen}
                label="Expandir menú (Ctrl+B)"
                side="right"
                className="text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={() => setSidebarCollapsed(false)}
              />
            </div>
          ) : (
            <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground shadow-sm">
                  PM
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold tracking-wide text-sidebar-foreground">PROTEOMESH</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {onlineCount}/{instances.length} online
                  </div>
                </div>
              </div>
              <IconBtn
                icon={PanelLeftClose}
                label="Contraer menú (Ctrl+B)"
                side="right"
                className="shrink-0 text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={() => setSidebarCollapsed(true)}
              />
            </div>
          )}

          {/* Acción Principal Superior: Crear CloudPhone */}
          <div className="p-2 pb-1">
            {sidebarCollapsed ? (
              <div className="flex justify-center">
                <IconBtn
                  icon={Plus}
                  label="Crear CloudPhone"
                  variant="primary"
                  side="right"
                  className="h-9 w-9 rounded-lg"
                  onClick={() => {
                    setCreatePresetModel(undefined);
                    setIsCreateOpen(true);
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCreatePresetModel(undefined);
                  setIsCreateOpen(true);
                }}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all active:scale-[0.98]"
              >
                <Plus className="h-4 w-4 stroke-[2.5]" />
                <span className="truncate">Crear CloudPhone</span>
              </button>
            )}
          </div>

          {/* Navegación */}
          <nav className="flex flex-1 flex-col gap-1 p-2 pt-1">
            {NAV.map((n) => {
              const active = activeNav === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    setActiveNav(n.id);
                    if (n.id === 'instances') setViewMode('grid');
                  }}
                  title={sidebarCollapsed ? n.label : undefined}
                  className={cn(
                    'flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors text-left',
                    active
                      ? 'bg-sidebar-accent text-primary font-medium'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                >
                  <n.icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{n.label}</span>}
                </button>
              );
            })}
          </nav>

          {/* Botones inferiores: Comandos y Modo Claro/Oscuro */}
          <div
            className={cn(
              'flex gap-1 border-t border-sidebar-border p-2',
              sidebarCollapsed ? 'flex-col items-center' : 'items-center justify-between'
            )}
          >
            <div className={cn('flex gap-1', sidebarCollapsed && 'flex-col items-center')}>
              <IconBtn
                icon={CmdIcon}
                label="Comandos (Ctrl+K)"
                side="right"
                onClick={() => toast.info('Consola rápida disponible')}
              />
              <IconBtn
                icon={theme === 'dark' ? Sun : Moon}
                label={theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
                side="right"
                onClick={toggleTheme}
              />
            </div>
            {!sidebarCollapsed && (
              <span className="font-mono text-[10px] text-muted-foreground/60 pr-1 select-none">
                v2.4
              </span>
            )}
          </div>
        </aside>

        {/* ── ÁREA PRINCIPAL ───────────────────────────────────────────────── */}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Cabecera / Toolbar (Exacta de Lovable) */}
          {activeNav === 'instances' && viewMode === 'grid' && (
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 bg-background">
              {/* Buscador */}
              <div className="relative w-64 min-w-0">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar…"
                  className="h-9 w-full rounded-full border border-input bg-surface pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Filtro segmentado: Todos / Online / Offline */}
              <div className="flex rounded-full border border-border p-0.5 text-xs bg-background">
                {(['all', 'online', 'offline'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={cn(
                      'rounded-full px-3.5 py-1 text-xs transition-colors',
                      statusFilter === f
                        ? 'bg-accent text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {f === 'all' ? 'Todos' : f === 'online' ? 'Online' : 'Offline'}
                  </button>
                ))}
              </div>

              {/* Indicador de Pool USB en Tiempo Real (NET-USB-001) */}
              <div className="flex items-center gap-1.5 pl-1">
                <button
                  onClick={() => setActiveNav('network')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-hover transition-colors"
                  title="Abrir Centro de Red USB"
                >
                  <Usb className="h-3.5 w-3.5 text-primary" />
                  <span>
                    USB Libres:{' '}
                    <strong className={cn(usbOverview && usbOverview.summary.free_usb > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted-foreground')}>
                      {usbOverview ? `${usbOverview.summary.free_usb}/${usbOverview.summary.total_usb}` : '—'}
                    </strong>
                  </span>
                </button>
                {usbOverview && usbOverview.summary.waiting_count > 0 && (
                  <button
                    onClick={() => setActiveNav('network')}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 dark:bg-amber-950/30 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                    title="Ver CloudPhones en cola de espera"
                  >
                    <Clock className="h-3 w-3" />
                    <span>En espera: {usbOverview.summary.waiting_count}</span>
                  </button>
                )}
              </div>

              {/* Botón Seleccionar Todo */}
              <IconBtn
                icon={CheckSquare}
                label="Seleccionar todo (Ctrl+A)"
                onClick={toggleSelectAll}
              />

              {/* Slider de Columnas (min 4, max 12) + Selector de Tema */}
              <div className="ml-auto flex items-center gap-3">
                <div className="flex w-36 items-center gap-2 font-mono text-xs text-muted-foreground">
                  <Slider
                    min={4}
                    max={12}
                    step={1}
                    value={[cols]}
                    onValueChange={(v) => setCols(v[0] ?? 8)}
                  />
                  <span>{cols}</span>
                </div>
                <div className="h-4 w-px bg-border" />
                <IconBtn
                  icon={theme === 'dark' ? Sun : Moon}
                  label={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
                  onClick={toggleTheme}
                />
              </div>
            </header>
          )}

          {/* Cuerpo Central */}
          {activeNav === 'instances' && viewMode === 'grid' && (
            <div className="grid-bg flex-1 overflow-auto p-4 pb-24">
              <DeviceGrid
                instances={filteredInstances}
                selected={selectedNames}
                cols={cols}
                syncMode={groupMode}
                onToggleSelect={toggleSelect}
                onOpen={openFocus}
                onSelectAll={toggleSelectAll}
                onClearSelection={clearSelection}
                onOpenCreate={() => setIsCreateOpen(true)}
                usbOverview={usbOverview}
                onNetworkChange={fetchUsbOverview}
              />
            </div>
          )}

          {/* Pestaña: CloudPhone en Vista Enfocada */}
          {activeNav === 'instances' && viewMode === 'focus' && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <FocusView
                instance={focusedInstance}
                instances={filteredInstances}
                onBack={() => setViewMode('grid')}
                onSelectInstance={openFocus}
                groupInstances={selectedList}
                groupMode={groupMode}
                onChanged={fetchInstances}
                theme={theme}
                onToggleTheme={toggleTheme}
                locationPresets={locationPresets}
              />
            </div>
          )}

          {/* Pestaña: Mapa y Geolocalización */}
          {activeNav === 'locations' && (
            <CustomLocationsManager
              instances={instances}
              onRefreshInstances={fetchInstances}
              locationPresets={locationPresets}
            />
          )}

          {/* Pestaña: Centro de Red USB & Historial de IPs (NET-USB-001) */}
          {activeNav === 'network' && (
            <UsbNetworkCenter
              instances={instances}
              onSelectInstance={(name) => {
                openFocus(name);
              }}
            />
          )}

          {/* Pestaña: Proxies (Legado / Fase Futura) */}
          {activeNav === 'proxies' && (
            <div className="flex-1 overflow-auto p-6">
              <div className="mx-auto max-w-xl space-y-4 py-8">
                <div className="space-y-1 text-center">
                  <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">
                    Verificador de Proxies Residenciales
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Comprueba latencia, IP pública y país antes de asignarlo
                  </p>
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-card p-5">
                  <label className="block text-xs font-medium text-foreground">
                    Cadena de Proxy SOCKS5 / HTTP
                  </label>
                  <input
                    type="text"
                    placeholder="socks5://user:pass@host:port"
                    className="h-9 w-full rounded-md border border-input bg-surface px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    onClick={() => toast.info('Función de test activa')}
                    className="h-9 w-full rounded-md bg-primary text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    Ejecutar Test de Conexión
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Modal de Creación */}
        <CreateDeviceModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={fetchInstances}
          existingPorts={existingPorts}
          presetModel={createPresetModel}
        />

        {/* Barra Flotante de Acciones en Lote (Idéntica a Lovable) */}
        {activeNav === 'instances' && viewMode === 'grid' && selectedNames.size > 0 && (
          <BulkBar
            selectedNames={selectedList}
            groupMode={groupMode}
            onToggleGroupMode={() => setGroupMode((g) => !g)}
            onClear={clearSelection}
            onRefresh={fetchInstances}
            locationPresets={locationPresets}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

export default App;
