import { lazy, Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import {
  Smartphone,
  MapPin,
  Search,
  CheckSquare,
  Plus,
  Sun,
  Moon,
  Usb,
  Plug,
  Clock,
  FolderArchive,
} from 'lucide-react';
import { Toaster } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, useInstances, useUsbOverview, useLocationPresets, EMPTY_PRESETS } from './lib/queries';
import type { Instance } from './types';
import DeviceGrid from './components/grid/DeviceGrid';
import BulkBar from './components/grid/BulkBar';
import { TooltipProvider } from './components/ui/tooltip';
import { GlobalTooltip } from './components/ui/GlobalTooltip';
import { IconBtn } from './components/ui/IconBtn';

import { cn } from './lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from './components/ui/sidebar';

const CreateDeviceModal = lazy(() =>
  import('./components/CreateDeviceModal').then((m) => ({ default: m.CreateDeviceModal }))
);
const FocusView = lazy(() => import('./components/focus/FocusView'));
const UsbNetworkCenter = lazy(() => import('./components/network/UsbNetworkCenter'));
const CustomLocationsManager = lazy(() =>
  import('./components/locations/CustomLocationsManager').then((m) => ({ default: m.CustomLocationsManager }))
);
const ApkFileManager = lazy(() =>
  import('./components/files/ApkFileManager').then((m) => ({ default: m.default }))
);

type ViewMode = 'grid' | 'focus';
type NavTab = 'instances' | 'network' | 'locations' | 'files';

const NO_INSTANCES: Instance[] = [];

function SidebarBrand() {
  return (
    <>
      <div className="hidden group-data-[state=expanded]/sidebar:flex items-center gap-2 px-1 min-w-0">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-sm border border-primary/40 bg-primary/15 font-mono text-[11px] font-black text-sidebar-foreground">
          PM
        </div>
        <div className="min-w-0">
          <div className="truncate font-mono text-xs font-bold tracking-wider text-sidebar-foreground">PROTEOMESH</div>
          <div className="font-mono text-[9px] text-muted-foreground">DEVICE FLEET</div>
        </div>
      </div>
      <div className="flex w-full justify-center group-data-[state=expanded]/sidebar:hidden">
        <SidebarTrigger className="h-8 w-8 rounded-sm hover:bg-sidebar-accent" />
      </div>
    </>
  );
}

export function App() {
  const [activeNav, setActiveNav] = useState<NavTab>('instances');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');

  // Mosaico vs Enfocado
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [focusedName, setFocusedName] = useState<string | null>(null);

  // Selección múltiple y control de grupo
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [groupMode, setGroupMode] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createPresetModel, setCreatePresetModel] = useState<string | undefined>(undefined);
  const [filesPreselectedInstance, setFilesPreselectedInstance] = useState<string | undefined>(undefined);

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

  const selectRange = useCallback((names: string[]) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      names.forEach((n) => next.add(n));
      return next;
    });
  }, []);

  const openFocus = useCallback((name: string) => {
    setFocusedName(name);
    setViewMode('focus');
    setActiveNav('instances');
  }, []);

  const closeFocus = useCallback(() => {
    setViewMode('grid');
  }, []);

  const openFilesManager = useCallback((name?: string) => {
    setFilesPreselectedInstance(name);
    setActiveNav('files');
  }, []);

  return (
    <TooltipProvider delayDuration={150}>
      <GlobalTooltip />
      <SidebarProvider defaultOpen={false}>
        <div className="flex h-screen w-full overflow-hidden bg-background">
          <Toaster richColors position="top-right" theme={theme} />

          <Sidebar collapsible="icon">
            <SidebarHeader>
              <div className="flex h-8 items-center justify-between">
                <SidebarBrand />
                <div className="hidden group-data-[state=expanded]/sidebar:block">
                  <SidebarTrigger className="h-7 w-7 rounded-sm hover:bg-sidebar-accent" />
                </div>
              </div>
              <div className="group-data-[state=collapsed]/sidebar:mt-0 mt-1">
                <SidebarMenuButton
                  icon={Plus}
                  label="Crear CloudPhone"
                  variant="primary"
                  onClick={() => {
                    setCreatePresetModel(undefined);
                    setIsCreateOpen(true);
                  }}
                />
              </div>
              <div className="my-1 h-px w-6 bg-border mx-auto group-data-[state=expanded]/sidebar:w-full" />
            </SidebarHeader>

            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Flota</SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      icon={Smartphone}
                      label="CloudPhones"
                      active={activeNav === 'instances'}
                      badge={
                        <span className="rounded-full bg-sidebar-accent/80 border border-sidebar-border/70 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-muted-foreground">
                          {instances.length}
                        </span>
                      }
                      tooltip={`CloudPhones · ${instances.length}`}
                      onClick={() => {
                        setActiveNav('instances');
                        setViewMode('grid');
                      }}
                    />
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarGroupLabel>Conectividad</SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      icon={Plug}
                      label="Centro de Red"
                      active={activeNav === 'network'}
                      badge={
                        usbOverview ? (
                          <span
                            className={cn(
                              'rounded-full px-1.5 py-0.5 font-mono text-[9px] font-semibold border',
                              usbOverview.summary.waiting_count > 0
                                ? 'border-warning/40 bg-warning/15 text-warning font-bold'
                                : 'border-sidebar-border/70 bg-sidebar-accent/80 text-muted-foreground'
                            )}
                          >
                            {usbOverview.summary.free_usb}/{usbOverview.summary.total_usb}
                          </span>
                        ) : undefined
                      }
                      tooltip={`Centro de Red USB${usbOverview ? ` · ${usbOverview.summary.free_usb}/${usbOverview.summary.total_usb} libres` : ''}${(usbOverview?.summary.waiting_count ?? 0) > 0 ? ` · ${usbOverview?.summary.waiting_count} en espera` : ''}`}
                      onClick={() => setActiveNav('network')}
                    />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      icon={MapPin}
                      label="Mapa y ubicaciones"
                      active={activeNav === 'locations'}
                      onClick={() => setActiveNav('locations')}
                    />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      icon={FolderArchive}
                      label="APKs y Archivos"
                      active={activeNav === 'files'}
                      onClick={() => {
                        setFilesPreselectedInstance(undefined);
                        setActiveNav('files');
                      }}
                    />
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
              <div className="flex items-center justify-center group-data-[state=expanded]/sidebar:justify-between px-1">
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer group-data-[state=expanded]/sidebar:flex group-data-[state=expanded]/sidebar:w-full group-data-[state=expanded]/sidebar:h-9 group-data-[state=expanded]/sidebar:px-2 group-data-[state=expanded]/sidebar:gap-2 group-data-[state=expanded]/sidebar:text-xs"
                >
                  {theme === 'dark' ? <Sun className="size-4 shrink-0" /> : <Moon className="size-4 shrink-0" />}
                  <span className="group-data-[state=collapsed]/sidebar:hidden">
                    {theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
                  </span>
                </button>
                <kbd className="font-mono text-[9px] text-muted-foreground/70 bg-sidebar-accent border border-sidebar-border/70 rounded px-1 py-0.5 group-data-[state=collapsed]/sidebar:hidden">
                  Ctrl+B
                </kbd>
              </div>
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>

        {/* ── ÁREA PRINCIPAL ───────────────────────────────────────────────── */}
        <SidebarInset>
          <Suspense fallback={null}>
          {/* Cabecera / Toolbar (solo en la grilla de CloudPhones) */}
          {activeNav === 'instances' && viewMode === 'grid' && (
            <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/40 px-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
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

              </div>
            </header>
          )}

          {/* Cuerpo Central */}
          {activeNav === 'instances' && viewMode === 'grid' && (
            <div className="grid-bg flex-1 min-h-0 overflow-hidden p-4">
              <DeviceGrid
                instances={filteredInstances}
                selected={selectedNames}
                syncMode={groupMode}
                onToggleSelect={toggleSelect}
                onSelectRange={selectRange}
                onOpen={openFocus}
                onSelectAll={toggleSelectAll}
                onClearSelection={clearSelection}
                usbOverview={usbOverview}
                onNetworkChange={fetchUsbOverview}
                onOpenFilesManager={openFilesManager}
              />
            </div>
          )}

          {/* Pestaña: CloudPhone en Vista Enfocada */}
          {activeNav === 'instances' && viewMode === 'focus' && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <FocusView
                instance={focusedInstance}
                instances={filteredInstances}
                onBack={closeFocus}
                onSelectInstance={openFocus}
                groupInstances={selectedList}
                groupMode={groupMode}
                onChanged={fetchInstances}
                theme={theme}
                onToggleTheme={toggleTheme}
                locationPresets={locationPresets}
                onOpenFilesManager={openFilesManager}
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

          {/* Pestaña: Repositorio de APKs y Gestor de archivos (WEB-017) */}
          {activeNav === 'files' && (
            <ApkFileManager
              instances={instances}
              preselectedInstance={filesPreselectedInstance}
              initialTab={filesPreselectedInstance ? 'files' : 'apks'}
              onRefreshInstances={fetchInstances}
            />
          )}

          </Suspense>
        </SidebarInset>

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
        {activeNav === 'instances' && viewMode === 'grid' && selectedNames.size >= 2 && (
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
      </SidebarProvider>
    </TooltipProvider>
  );
}

export default App;
