import { useState, useEffect } from 'react';
import {
  Smartphone,
  Layers,
  MapPin,
  ShieldCheck,
  Search,
  CheckSquare,
  Plus,
  Command as CmdIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Cpu,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { api } from './lib/api';
import type { Instance, TemplateItem, LocationData } from './types';
import { CreateDeviceModal } from './components/CreateDeviceModal';
import DeviceGrid from './components/grid/DeviceGrid';
import BulkBar from './components/grid/BulkBar';
import FocusView from './components/focus/FocusView';
import { TooltipProvider } from './components/ui/tooltip';
import { IconBtn } from './components/ui/IconBtn';
import { Slider } from './components/ui/slider';
import { cn } from './lib/utils';

type ViewMode = 'grid' | 'focus';
type NavTab = 'instances' | 'templates' | 'locations' | 'proxies';

const NAV = [
  { id: 'instances' as const, label: 'CloudPhones', icon: Smartphone },
  { id: 'templates' as const, label: 'Catálogo de modelos', icon: Layers },
  { id: 'locations' as const, label: 'Mapa y ubicaciones', icon: MapPin },
  { id: 'proxies' as const, label: 'Verificador de proxies', icon: ShieldCheck },
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

  // Datos para otras pestañas
  const [templatesCatalog, setTemplatesCatalog] = useState<Record<string, TemplateItem[]>>({});
  const [locationPresets, setLocationPresets] = useState<Record<string, LocationData>>({});

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
    const interval = setInterval(fetchInstances, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeNav === 'templates' && Object.keys(templatesCatalog).length === 0) {
      api.getTemplates().then(setTemplatesCatalog).catch(console.error);
    }
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
  const existingPorts = instances.map((i) => i.adb_port);
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

  const handleOpenCreateWithModel = (modelId: string) => {
    setCreatePresetModel(modelId);
    setIsCreateOpen(true);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Toaster richColors position="top-right" theme="dark" />

        {/* ── BARRA LATERAL (IDÉNTICA A LOVABLE APPSHELL) ───────────────────── */}
        <aside
          className={cn(
            'flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200',
            sidebarCollapsed ? 'w-14' : 'w-56'
          )}
        >
          {/* Logo / Cabecera */}
          <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">
              PM
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="truncate text-sm font-bold tracking-wide">PROTEOMESH</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {onlineCount}/{instances.length} online
                </div>
              </div>
            )}
          </div>

          {/* Navegación */}
          <nav className="flex flex-1 flex-col gap-1 p-2">
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
                      ? 'bg-sidebar-accent text-primary'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                >
                  <n.icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{n.label}</span>}
                </button>
              );
            })}
          </nav>

          {/* Botones inferiores: +, CMD, Toggle */}
          <div
            className={cn(
              'flex gap-1 border-t border-sidebar-border p-2',
              sidebarCollapsed ? 'flex-col items-center' : 'items-center'
            )}
          >
            <IconBtn
              icon={Plus}
              label="Crear CloudPhone"
              variant="primary"
              side="right"
              onClick={() => {
                setCreatePresetModel(undefined);
                setIsCreateOpen(true);
              }}
            />
            <IconBtn
              icon={CmdIcon}
              label="Comandos (Ctrl+K)"
              side="right"
              onClick={() => toast.info('Consola rápida disponible')}
            />
            <IconBtn
              icon={sidebarCollapsed ? PanelLeftOpen : PanelLeftClose}
              label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
              side="right"
              className={sidebarCollapsed ? '' : 'ml-auto'}
              onClick={() => setSidebarCollapsed((v) => !v)}
            />
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

              {/* Botón Seleccionar Todo */}
              <IconBtn
                icon={CheckSquare}
                label="Seleccionar todo (Ctrl+A)"
                onClick={toggleSelectAll}
              />

              {/* Slider de Columnas (min 4, max 12) */}
              <div className="ml-auto flex w-40 items-center gap-2 font-mono text-xs text-muted-foreground">
                <Slider
                  min={4}
                  max={12}
                  step={1}
                  value={[cols]}
                  onValueChange={(v) => setCols(v[0] ?? 8)}
                />
                <span>{cols}</span>
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
              />
            </div>
          )}

          {/* Pestaña: CloudPhone en Vista Enfocada */}
          {activeNav === 'instances' && viewMode === 'focus' && (
            <div className="flex-1 overflow-hidden">
              <FocusView
                instance={focusedInstance}
                instances={filteredInstances}
                onBack={() => setViewMode('grid')}
                onSelectInstance={openFocus}
                groupInstances={selectedList}
                groupMode={groupMode}
                onChanged={fetchInstances}
              />
            </div>
          )}

          {/* Pestaña: Catálogo de Modelos */}
          {activeNav === 'templates' && (
            <div className="flex-1 overflow-auto p-4 space-y-6">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Catálogo Oficial de 17 Dispositivos Móviles
                </h3>
                <p className="text-xs text-muted-foreground">
                  Plantillas de hardware certificadas (SoC, GPU, sensores y displays oficiales)
                </p>
              </div>

              {Object.entries(templatesCatalog).map(([brand, models]) => (
                <div key={brand} className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>
                      {brand} ({models.length} modelos)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {models.map((m) => (
                      <div
                        key={m.id}
                        className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition-all hover:border-muted-foreground/40"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-card-foreground">{m.name}</span>
                            <IconBtn
                              icon={Plus}
                              label={`Crear CloudPhone ${m.name}`}
                              size="sm"
                              variant="primary"
                              onClick={() => handleOpenCreateWithModel(m.id)}
                            />
                          </div>
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                            <Cpu className="h-3 w-3 text-muted-foreground" />
                            <span>{m.soc_model}</span>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[10px] text-muted-foreground">
                          <span>{m.gpu_renderer}</span>
                          <span className="font-mono">{m.screen}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pestaña: Mapa y Geolocalización */}
          {activeNav === 'locations' && (
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-foreground">Presets de Geolocalización Global</h3>
                <p className="text-xs text-muted-foreground">
                  Coordenadas y zonas horarias validadas para simulación física
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {Object.entries(locationPresets).map(([key, loc]) => (
                  <div
                    key={key}
                    className="space-y-1.5 rounded-xl border border-border bg-card p-3.5 transition-all hover:border-muted-foreground/40"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold capitalize text-card-foreground">
                        {loc.city}
                      </span>
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                    </div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {loc.timezone}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pestaña: Proxies */}
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
