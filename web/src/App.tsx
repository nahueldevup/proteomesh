import { lazy, Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import {
  Smartphone,
  MapPin,
  Search,
  CheckSquare,
  Plus,
  PanelLeftClose,
  Sun,
  Moon,
  Usb,
  Clock,
} from 'lucide-react';
import { Toaster } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, useInstances, useUsbOverview, useLocationPresets, EMPTY_PRESETS } from './lib/queries';
import type { Instance } from './types';
import DeviceGrid from './components/grid/DeviceGrid';
import BulkBar from './components/grid/BulkBar';
import { TooltipProvider } from './components/ui/tooltip';
import { IconBtn } from './components/ui/IconBtn';
import { Slider } from './components/ui/slider';
import { cn } from './lib/utils';

const CreateDeviceModal = lazy(() =>
  import('./components/CreateDeviceModal').then((m) => ({ default: m.CreateDeviceModal }))
);
const FocusView = lazy(() => import('./components/focus/FocusView'));
const UsbNetworkCenter = lazy(() => import('./components/network/UsbNetworkCenter'));
const CustomLocationsManager = lazy(() =>
  import('./components/locations/CustomLocationsManager').then((m) => ({ default: m.CustomLocationsManager }))
);

type ViewMode = 'grid' | 'focus';
type NavTab = 'instances' | 'network' | 'locations';

const NAV = [
  { id: 'instances' as const, label: 'CloudPhones', icon: Smartphone },
  { id: 'network' as const, label: 'Centro de Red USB', icon: Usb },
  { id: 'locations' as const, label: 'Mapa y ubicaciones', icon: MapPin },
];

const NO_INSTANCES: Instance[] = [];

export function App() {
  const [activeNav, setActiveNav] = useState<NavTab>('instances');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');

  // Mosaico vs Enfocado
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [focusedName, setFocusedName] = useState<string | null>(null);

  // Columnas dinámicas del mosaico (8 por defecto)
  const [cols, setCols] = useState(8);

  // Selección múltiple y control de grupo
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [groupMode, setGroupMode] = useState(false);

  // Barra lateral colapsable
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

  // Datos de presets de ubicación globales
  const { data: locationPresets = EMPTY_PRESETS } = useLocationPresets();

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
  const queryClient = useQueryClient();
  const { data: usbOverview } = useUsbOverview();
  const { data: instancesData } = useInstances(isCreateOpen);
  const instances = instancesData ?? NO_INSTANCES;

  const fetchUsbOverview = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.usb }),
    [queryClient]
  );

  const fetchInstances = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.instances }),
    [queryClient]
  );

  useEffect(() => {
    if (!instancesData) return;
    const names = new Set(instancesData.map((i) => i.instance_name));
    setSelectedNames((prev) => {
      const next = new Set([...prev].filter((n) => names.has(n)));
      return next.size === prev.size ? prev : next;
    });
  }, [instancesData]);

  const filteredInstances = useMemo(() => instances.filter((inst) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      inst.instance_name.toLowerCase().includes(q) ||
      (inst.template || '').toLowerCase().includes(q) ||
      (inst.location?.city || '').toLowerCase().includes(q) ||
      String(inst.adb_port).includes(q);

    if (statusFilter === 'online') return matchesSearch && inst.running;
    if (statusFilter === 'offline') return matchesSearch && !inst.running;
    return matchesSearch;
  }), [instances, searchQuery, statusFilter]);

  const onlineCount = instances.filter((i) => i.running).length;
  const existingPorts = useMemo(() => instances.map((i) => i.adb_port), [instances]);
  const focusedInstance = instances.find((i) => i.instance_name === focusedName) ?? null;
  const selectedList = [...selectedNames];
  const allFilteredSelected =
    filteredInstances.length > 0 &&
    filteredInstances.every((i) => selectedNames.has(i.instance_name));

  const toggleSelect = useCallback((name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
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
  }, [filteredInstances, allFilteredSelected]);

  const clearSelection = useCallback(() => {
    setSelectedNames(new Set());
    setGroupMode(false);
  }, []);

  const openFocus = useCallback((name: string) => {
    setFocusedName(name);
    setViewMode('focus');
  }, []);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Toaster richColors position="top-right" theme={theme} />

        {/* ── BARRA LATERAL (INSPIRADA EN LINEAR / SUPABASE) ───────────────────── */}
        <aside
          className={cn(
            'flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 select-none',
            sidebarCollapsed ? 'w-13' : 'w-52'
          )}
        >
          {/* Cabecera / Toggle superior del Sidebar */}
          {sidebarCollapsed ? (
            <div className="flex h-12 items-center justify-center border-b border-sidebar-border px-1">
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                title="Expandir menú (Ctrl+B)"
                className="grid h-7 w-7 place-items-center rounded-sm border border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground font-mono text-xs font-bold hover:border-primary/50 transition-colors"
              >
                PM
              </button>
            </div>
          ) : (
            <div className="flex h-12 items-center justify-between border-b border-sidebar-border px-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="grid h-6 w-6 shrink-0 place-items-center rounded-sm border border-primary/40 bg-primary/20 text-foreground font-mono text-[11px] font-black">
                  PM
                </div>
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs font-bold tracking-wider text-sidebar-foreground">PROTEOMESH</div>
                  <div className="flex items-center gap-1 font-mono text-[10px] text-sidebar-foreground/60">
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', onlineCount > 0 ? 'bg-success' : 'bg-muted-foreground/40')} />
                    <span>{onlineCount}/{instances.length} online</span>
                  </div>
                </div>
              </div>
              <IconBtn
                icon={PanelLeftClose}
                label="Contraer menú (Ctrl+B)"
                side="right"
                className="h-7 w-7 rounded-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
                  side="right"
                  className="h-7 w-7 rounded-sm border border-primary/40 bg-primary/20 text-foreground hover:bg-primary/30"
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
                className="flex h-7.5 w-full items-center justify-center gap-1.5 rounded-sm border border-primary/40 bg-primary/20 text-foreground font-mono text-xs font-bold hover:bg-primary/30 transition-colors active:scale-[0.99]"
              >
                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                <span className="truncate">Crear CloudPhone</span>
              </button>
            )}
          </div>

          {/* Navegación */}
          <nav className="flex flex-1 flex-col gap-0.5 p-2 pt-1">
            {!sidebarCollapsed && (
              <div className="px-2 pt-1 pb-1 font-mono text-[9px] font-bold text-sidebar-foreground/40 uppercase tracking-widest">
                Vistas
              </div>
            )}
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
                    'flex h-7.5 items-center rounded-sm text-xs transition-colors text-left font-sans',
                    sidebarCollapsed ? 'justify-center w-full px-0' : 'gap-2 px-2',
                    active
                      ? 'bg-sidebar-accent text-sidebar-foreground font-semibold border-l-2 border-primary'
                      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                  )}
                >
                  <n.icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-primary' : 'text-sidebar-foreground/70')} />
                  {!sidebarCollapsed && (
                    <>
                      <span className="truncate flex-1">{n.label}</span>
                      {n.id === 'instances' && (
                        <span className="font-mono text-[10px] text-sidebar-foreground/50 bg-sidebar-accent/60 px-1 py-px rounded-xs">
                          {instances.length}
                        </span>
                      )}
                      {n.id === 'network' && usbOverview && (
                        <span className={cn('font-mono text-[10px] px-1 py-px rounded-xs', usbOverview.summary.waiting_count > 0 ? 'bg-primary/20 text-foreground font-bold' : 'text-sidebar-foreground/50 bg-sidebar-accent/60')}>
                          {usbOverview.summary.free_usb}/{usbOverview.summary.total_usb}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Botón inferior: Modo Claro/Oscuro */}
          <div
            className={cn(
              'flex border-t border-sidebar-border p-2',
              sidebarCollapsed ? 'flex-col items-center gap-1' : 'items-center justify-between'
            )}
          >
            <div className={cn('flex gap-1', sidebarCollapsed && 'flex-col items-center')}>
              <IconBtn
                icon={theme === 'dark' ? Sun : Moon}
                label={theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
                side="right"
                className="h-7 w-7 rounded-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={toggleTheme}
              />
            </div>
          </div>
        </aside>

        {/* ── ÁREA PRINCIPAL ───────────────────────────────────────────────── */}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <Suspense fallback={null}>
          {/* Cabecera / Toolbar */}
          {activeNav === 'instances' && viewMode === 'grid' && (
            <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3 bg-card/40">
              {/* Buscador */}
              <div className="relative w-60 min-w-0">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar CloudPhone…"
                  className="h-8 w-full rounded-sm border border-border bg-card pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                />
              </div>

              {/* Filtro segmentado: Todos / Online / Offline */}
              <div className="flex rounded-sm border border-border bg-muted/40 p-0.5 text-xs">
                {(['all', 'online', 'offline'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={cn(
                      'rounded-xs px-2.5 py-0.5 text-xs font-mono font-medium transition-colors',
                      statusFilter === f
                        ? 'bg-card text-foreground font-bold shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {f === 'all' ? 'Todos' : f === 'online' ? 'Online' : 'Offline'}
                  </button>
                ))}
              </div>

              {/* Indicador de Pool USB en Tiempo Real */}
              <div className="flex items-center gap-1.5 pl-1">
                <button
                  onClick={() => setActiveNav('network')}
                  className="h-8 inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-xs font-mono font-medium text-foreground hover:bg-muted transition-colors"
                  title="Abrir Centro de Red USB"
                >
                  <Usb className="h-3 w-3 text-primary" />
                  <span>
                    USB:{' '}
                    <strong className={cn(usbOverview && usbOverview.summary.free_usb > 0 ? 'text-success font-bold' : 'text-muted-foreground')}>
                      {usbOverview ? `${usbOverview.summary.free_usb}/${usbOverview.summary.total_usb}` : '—'}
                    </strong>
                  </span>
                </button>
                {usbOverview && usbOverview.summary.waiting_count > 0 && (
                  <button
                    onClick={() => setActiveNav('network')}
                    className="h-8 inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-2.5 text-xs font-mono font-bold text-foreground hover:bg-primary/20 transition-colors"
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
                className="h-8 w-8 rounded-sm"
              />

              {/* Slider de Columnas (min 4, max 12) + Selector de Tema */}
              <div className="ml-auto flex items-center gap-3">
                <div className="flex w-32 items-center gap-2 font-mono text-xs text-muted-foreground">
                  <Slider
                    min={4}
                    max={12}
                    step={1}
                    value={[cols]}
                    onValueChange={(v) => setCols(v[0] ?? 8)}
                  />
                  <span>{cols} cols</span>
                </div>
                <div className="h-4 w-px bg-border" />
                <IconBtn
                  icon={theme === 'dark' ? Sun : Moon}
                  label={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
                  onClick={toggleTheme}
                  className="h-8 w-8 rounded-sm"
                />
              </div>
            </header>
          )}

          {/* Cuerpo Central */}
          {activeNav === 'instances' && viewMode === 'grid' && (
            <div className="grid-bg flex-1 overflow-auto p-3.5 pb-24">
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
                overview={usbOverview}
                onRefresh={fetchUsbOverview}
              instances={instances}
              onSelectInstance={(name) => {
                openFocus(name);
              }}
            />
          )}

          </Suspense>
        </main>

        {/* Modal de Creación */}
        {isCreateOpen && (
          <Suspense fallback={null}>
            <CreateDeviceModal
              isOpen={isCreateOpen}
              onClose={() => setIsCreateOpen(false)}
              onSuccess={fetchInstances}
              existingPorts={existingPorts}
              presetModel={createPresetModel}
            />
          </Suspense>
        )}

        {/* Barra Flotante de Acciones en Lote */}
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
