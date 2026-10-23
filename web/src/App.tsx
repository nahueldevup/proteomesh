import { useState, useEffect } from 'react';
import {
  Smartphone,
  Plus,
  RefreshCw,
  Search,
  MapPin,
  Shield,
  Layers,
  CheckCircle2,
  Cpu,
  LayoutGrid,
} from 'lucide-react';
import { api } from './lib/api';
import type { Instance, TemplateItem, LocationData } from './types';
import { CreateDeviceModal } from './components/CreateDeviceModal';
import DeviceGrid from './components/grid/DeviceGrid';
import GroupActionBar from './components/grid/GroupActionBar';
import FocusView from './components/focus/FocusView';

type ViewMode = 'grid' | 'focus';

export function App() {
  const [activeNav, setActiveNav] = useState<'instances' | 'templates' | 'locations' | 'proxies'>('instances');
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped'>('all');

  // Vista Mosaico / Enfocado
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [focusedName, setFocusedName] = useState<string | null>(null);

  // Selección múltiple y control de grupo
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [groupMode, setGroupMode] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Standalone tab data
  const [templatesCatalog, setTemplatesCatalog] = useState<Record<string, TemplateItem[]>>({});
  const [locationPresets, setLocationPresets] = useState<Record<string, LocationData>>({});

  const fetchInstances = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstances();
    const interval = setInterval(fetchInstances, 8000);
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

    if (statusFilter === 'running') return matchesSearch && inst.running;
    if (statusFilter === 'stopped') return matchesSearch && !inst.running;
    return matchesSearch;
  });

  const onlineCount = instances.filter((i) => i.running).length;
  const existingPorts = instances.map((i) => i.adb_port);
  const focusedInstance = instances.find((i) => i.instance_name === focusedName) ?? null;
  const selectedList = [...selectedNames];

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
    const allSelected = visible.length > 0 && visible.every((n) => selectedNames.has(n));
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (allSelected) visible.forEach((n) => next.delete(n));
      else visible.forEach((n) => next.add(n));
      return next;
    });
  };

  const openFocus = (name: string) => {
    setFocusedName(name);
    setViewMode('focus');
  };

  const handleGroupAction = async (action: 'start' | 'stop' | 'restart') => {
    await api.groupLifecycle(selectedList, action);
    await fetchInstances();
  };

  const isFullBleed = activeNav === 'instances' && viewMode === 'focus';

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 font-sans text-zinc-100 select-none">
      {/* ── BARRA LATERAL ─────────────────────────────────────────────────── */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950">
        <div className="flex items-center gap-3 border-b border-zinc-800/80 p-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold tracking-wider text-white shadow-lg shadow-blue-500/20">
            PM
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-zinc-100">
              <span>PROTEOMESH</span>
              <span className="rounded border border-blue-500/20 bg-blue-500/10 px-1 py-0.2 font-mono text-[10px] text-blue-400">
                v1.0
              </span>
            </div>
            <div className="text-[11px] text-zinc-500">CloudPhone Platform</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
            Gestión de Flota
          </div>

          {[
            { id: 'instances', label: 'CloudPhones', icon: Smartphone, count: instances.length },
            { id: 'templates', label: 'Catálogo de Modelos', icon: Layers, count: 17 },
            { id: 'locations', label: 'Mapa & Ubicaciones', icon: MapPin },
            { id: 'proxies', label: 'Verificador de Proxies', icon: Shield },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id as typeof activeNav)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                  isActive
                    ? 'border border-blue-500/20 bg-blue-600/10 text-blue-400 shadow-sm'
                    : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </div>
                {item.count !== undefined && (
                  <span
                    className={`rounded px-1.5 py-0.2 font-mono text-[10px] ${
                      isActive ? 'bg-blue-500/20 text-blue-300' : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="space-y-1.5 border-t border-zinc-800/80 bg-zinc-900/20 p-3 text-[11px] text-zinc-500">
          <div className="flex items-center justify-between">
            <span>Motor Android:</span>
            <span className="font-mono text-zinc-400">13 / API 33</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Root Hiding:</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> 100/100
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Render Mode:</span>
            <span className="font-mono text-zinc-400">Guest 30 FPS</span>
          </div>
        </div>
      </aside>

      {/* ── ÁREA PRINCIPAL ────────────────────────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-zinc-800/80 bg-zinc-900/30 px-6">
          {activeNav === 'instances' && viewMode === 'grid' ? (
            <div className="flex max-w-md flex-1 items-center gap-3">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por ID, modelo, ciudad, puerto..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 py-1.5 pl-8 pr-3 text-xs text-zinc-100 transition-colors placeholder:text-zinc-500 focus:border-blue-500/80 focus:outline-none"
                />
              </div>

              <div className="flex shrink-0 items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-[11px]">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`rounded px-2 py-1 font-medium transition-colors ${
                    statusFilter === 'all' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setStatusFilter('running')}
                  className={`rounded px-2 py-1 font-medium transition-colors ${
                    statusFilter === 'running' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Online ({onlineCount})
                </button>
                <button
                  onClick={() => setStatusFilter('stopped')}
                  className={`rounded px-2 py-1 font-medium transition-colors ${
                    statusFilter === 'stopped' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Offline ({instances.length - onlineCount})
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              {activeNav === 'instances' && (
                <>
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Vista enfocada</span>
                </>
              )}
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchInstances}
              className="rounded-lg border border-zinc-800 p-2 text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-zinc-100"
              title="Actualizar datos"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>

            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] hover:bg-blue-500 active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Crear CloudPhone</span>
            </button>
          </div>
        </header>

        <div
          className={
            isFullBleed
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
              : 'flex-1 overflow-y-auto p-6'
          }
        >
          {activeNav === 'instances' && viewMode === 'grid' && (
            <div>
              <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
                  <div className="text-[11px] font-medium text-zinc-500">Total CloudPhones</div>
                  <div className="mt-1 font-mono text-xl font-bold text-zinc-100">{instances.length}</div>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
                  <div className="text-[11px] font-medium text-zinc-500">Instancias Conectadas</div>
                  <div className="mt-1 font-mono text-xl font-bold text-emerald-400">{onlineCount}</div>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
                  <div className="text-[11px] font-medium text-zinc-500">Límite RAM Seguro</div>
                  <div className="mt-1 font-mono text-xl font-bold text-zinc-100">2.5 GB / inst</div>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
                  <div className="text-[11px] font-medium text-zinc-500">Tasa de Refresco</div>
                  <div className="mt-1 font-mono text-xl font-bold text-blue-400">30 FPS (Opt.)</div>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/20">
                <DeviceGrid
                  instances={filteredInstances}
                  selected={selectedNames}
                  onToggleSelect={toggleSelect}
                  onOpen={openFocus}
                  onToggleSelectAll={toggleSelectAll}
                />
              </div>
            </div>
          )}

          {activeNav === 'instances' && viewMode === 'focus' && (
            <FocusView
              instance={focusedInstance}
              onBack={() => setViewMode('grid')}
              groupInstances={selectedList}
              groupMode={groupMode}
              onChanged={fetchInstances}
            />
          )}

          {activeNav === 'templates' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Catálogo de 17 Plantillas Oficiales de Hardware</h3>
                <p className="text-xs text-zinc-500">Especificaciones CMOS, sensores MEMS y TACs oficiales</p>
              </div>

              {Object.entries(templatesCatalog).map(([brand, models]) => (
                <div key={brand} className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>{brand} ({models.length} modelos)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {models.map((m) => (
                      <div key={m.id} className="space-y-1.5 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5">
                        <div className="text-xs font-semibold text-zinc-100">{m.name}</div>
                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
                          <Cpu className="h-3 w-3 text-zinc-500" />
                          <span>{m.soc_model}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-zinc-800 pt-1 text-[11px] text-zinc-500">
                          <span>{m.gpu_renderer}</span>
                          <span className="font-mono text-zinc-400">{m.screen}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeNav === 'locations' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Explorador de Geolocalización Global</h3>
                <p className="text-xs text-zinc-500">20 presets mundiales integrados en el motor de ProteoMesh</p>
              </div>

              <div className="grid grid-cols-4 gap-3">
                {Object.entries(locationPresets).map(([key, loc]) => (
                  <div key={key} className="space-y-1 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium capitalize text-zinc-200">
                      <MapPin className="h-3 w-3 shrink-0 text-blue-400" />
                      <span>{key}</span>
                    </div>
                    <div className="truncate text-[11px] text-zinc-400">{loc.city}</div>
                    <div className="font-mono text-[10px] text-zinc-500">
                      {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                    </div>
                    <div className="truncate font-mono text-[10px] text-zinc-500">{loc.timezone}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeNav === 'proxies' && (
            <div className="mx-auto max-w-xl space-y-4 py-8">
              <div className="space-y-1 text-center">
                <Shield className="mx-auto h-8 w-8 text-blue-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Verificador Asíncrono de Proxies Residenciales</h3>
                <p className="text-xs text-zinc-500">Prueba la latencia, IP pública de salida y país antes de asignarlo</p>
              </div>

              <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                <label className="block text-xs font-medium text-zinc-300">Cadena de Proxy SOCKS5 / HTTP</label>
                <input
                  type="text"
                  placeholder="socks5://user:pass@host:port o ip:port:user:pass"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
                />
                <button className="w-full rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500">
                  Ejecutar Test de Conexión
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <CreateDeviceModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={fetchInstances}
        existingPorts={existingPorts}
      />

      {activeNav === 'instances' && selectedNames.size > 1 && viewMode === 'grid' && (
        <GroupActionBar
          count={selectedNames.size}
          selectedNames={selectedList}
          groupMode={groupMode}
          onToggleGroupMode={() => setGroupMode((g) => !g)}
          onClear={() => {
            setSelectedNames(new Set());
            setGroupMode(false);
          }}
          onAction={handleGroupAction}
        />
      )}
    </div>
  );
}

export default App;
