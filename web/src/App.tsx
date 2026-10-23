import { useState, useEffect } from 'react';
import {
  Smartphone,
  Plus,
  Play,
  Square,
  RefreshCw,
  Search,
  MapPin,
  Shield,
  Layers,
  ChevronRight,
  CheckCircle2,
  Cpu,
  Monitor,
} from 'lucide-react';
import { api } from './lib/api';
import type { Instance, TemplateItem, LocationData } from './types';
import { CreateDeviceModal } from './components/CreateDeviceModal';
import { DeviceDetailDrawer } from './components/DeviceDetailDrawer';

export function App() {
  const [activeNav, setActiveNav] = useState<'instances' | 'templates' | 'locations' | 'proxies'>('instances');
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped'>('all');

  // Modals & Drawers
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [drawerTab, setDrawerTab] = useState<'screen' | 'info' | 'location' | 'proxy' | 'health'>('screen');

  // Standalone tab data
  const [templatesCatalog, setTemplatesCatalog] = useState<Record<string, TemplateItem[]>>({});
  const [locationPresets, setLocationPresets] = useState<Record<string, LocationData>>({});

  // Cargar lista de instancias
  const fetchInstances = async () => {
    setLoading(true);
    try {
      const data = await api.getInstances();
      setInstances(data);
      if (selectedInstance) {
        const updated = data.find((i) => i.instance_name === selectedInstance.instance_name);
        if (updated) setSelectedInstance(updated);
      }
    } catch (err: any) {
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

  // Cargar catálogo de templates si se navega allí
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

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans select-none">
      {/* ── BARRA LATERAL ESTILO GEELARK ──────────────────────────────────── */}
      <aside className="w-64 border-r border-zinc-800/80 bg-zinc-950 flex flex-col shrink-0">
        {/* Brand Header */}
        <div className="p-4 border-b border-zinc-800/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20 text-xs tracking-wider">
            PM
          </div>
          <div>
            <div className="font-semibold text-xs tracking-wide text-zinc-100 flex items-center gap-1.5">
              <span>PROTEOMESH</span>
              <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1 py-0.2 rounded font-mono">
                v1.0
              </span>
            </div>
            <div className="text-[11px] text-zinc-500">CloudPhone Platform</div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-3 space-y-1">
          <div className="text-[10px] font-semibold tracking-wider text-zinc-600 uppercase px-3 py-1">
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
                onClick={() => setActiveNav(item.id as any)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.count !== undefined && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    isActive ? 'bg-blue-500/20 text-blue-300' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer info */}
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-900/20 text-[11px] text-zinc-500 space-y-1.5">
          <div className="flex items-center justify-between">
            <span>Motor Android:</span>
            <span className="font-mono text-zinc-400">13 / API 33</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Root Hiding:</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> 100/100
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Render Mode:</span>
            <span className="font-mono text-zinc-400">Guest 30 FPS</span>
          </div>
        </div>
      </aside>

      {/* ── ÁREA PRINCIPAL ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-zinc-950">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-zinc-800/80 bg-zinc-900/30 px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por ID, modelo, ciudad, puerto..."
                className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/80 transition-colors"
              />
            </div>

            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 shrink-0 text-[11px]">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2 py-1 rounded font-medium transition-colors ${
                  statusFilter === 'all' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setStatusFilter('running')}
                className={`px-2 py-1 rounded font-medium transition-colors ${
                  statusFilter === 'running' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Online ({onlineCount})
              </button>
              <button
                onClick={() => setStatusFilter('stopped')}
                className={`px-2 py-1 rounded font-medium transition-colors ${
                  statusFilter === 'stopped' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Offline ({instances.length - onlineCount})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchInstances}
              className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 rounded-lg border border-zinc-800 transition-colors"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>

            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear CloudPhone</span>
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: INSTANCIAS */}
          {activeNav === 'instances' && (
            <div className="space-y-4">
              {/* Tarjetas de métricas rápidas */}
              <div className="grid grid-cols-4 gap-4">
                <div className="p-3.5 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
                  <div className="text-[11px] font-medium text-zinc-500">Total CloudPhones</div>
                  <div className="text-xl font-bold font-mono text-zinc-100 mt-1">{instances.length}</div>
                </div>
                <div className="p-3.5 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
                  <div className="text-[11px] font-medium text-zinc-500">Instancias Conectadas</div>
                  <div className="text-xl font-bold font-mono text-emerald-400 mt-1">{onlineCount}</div>
                </div>
                <div className="p-3.5 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
                  <div className="text-[11px] font-medium text-zinc-500">Límite RAM Seguro</div>
                  <div className="text-xl font-bold font-mono text-zinc-100 mt-1">2.5 GB / inst</div>
                </div>
                <div className="p-3.5 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
                  <div className="text-[11px] font-medium text-zinc-500">Tasa de Refresco</div>
                  <div className="text-xl font-bold font-mono text-blue-400 mt-1">30 FPS (Opt.)</div>
                </div>
              </div>

              {/* Tabla de Dispositivos */}
              <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-900/20">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 text-[11px]">
                      <th className="py-3 px-4 font-medium">Instancia</th>
                      <th className="py-3 px-4 font-medium">Estado</th>
                      <th className="py-3 px-4 font-medium">Modelo & Hardware</th>
                      <th className="py-3 px-4 font-medium">Ubicación GPS</th>
                      <th className="py-3 px-4 font-medium">Operadora</th>
                      <th className="py-3 px-4 font-medium">Proxy Residencial</th>
                      <th className="py-3 px-4 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {filteredInstances.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-zinc-500">
                          No se encontraron CloudPhones activos.
                        </td>
                      </tr>
                    ) : (
                      filteredInstances.map((inst) => {
                        const isSelected = selectedInstance?.instance_name === inst.instance_name;
                        return (
                          <tr
                            key={inst.instance_name}
                            onClick={() => setSelectedInstance(inst)}
                            className={`hover:bg-zinc-800/30 cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-500/5' : ''
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="font-semibold text-zinc-100 font-mono flex items-center gap-2">
                                <Smartphone className="w-3.5 h-3.5 text-zinc-400" />
                                <span>{inst.instance_name}</span>
                              </div>
                              <span className="text-[10px] text-zinc-500 font-mono">ADB :{inst.adb_port}</span>
                            </td>

                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium ${
                                  inst.running
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-zinc-800/60 text-zinc-400 border border-zinc-700/40'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${inst.running ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                                {inst.running ? 'Online' : 'Offline'}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <div className="text-zinc-200 font-medium">
                                {inst.template?.split('/')[1] || inst.template || 'A54 5G'}
                              </div>
                              <div className="text-[10px] text-zinc-500 font-mono">{inst.identity?.serial || 'SM-A546M'}</div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5 text-zinc-300">
                                <MapPin className="w-3 h-3 text-blue-400 shrink-0" />
                                <span className="truncate max-w-[150px]">{inst.location?.city || 'Buenos Aires'}</span>
                              </div>
                              <div className="text-[10px] text-zinc-500 font-mono">
                                {inst.location ? `${inst.location.latitude.toFixed(2)}, ${inst.location.longitude.toFixed(2)}` : '-'}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="text-zinc-300">{inst.carrier || 'ar_personal'}</div>
                              <div className="text-[10px] text-zinc-500 font-mono">{inst.identity?.phone_number || '-'}</div>
                            </td>

                            <td className="py-3 px-4">
                              {inst.proxy ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                                  <Shield className="w-3 h-3" />
                                  <span>{inst.proxy.host}:{inst.proxy.port}</span>
                                </span>
                              ) : (
                                <span className="text-[11px] text-zinc-500 font-mono">Conexión Directa</span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                {inst.running && (
                                  <button
                                    onClick={() => {
                                      setSelectedInstance(inst);
                                      setDrawerTab('screen');
                                    }}
                                    className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/40 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors"
                                    title="Abrir pantalla interactiva y control remoto"
                                  >
                                    <Monitor className="w-3.5 h-3.5" />
                                    <span>Pantalla</span>
                                  </button>
                                )}

                                {inst.running ? (
                                  <button
                                    onClick={async () => {
                                      await api.stopInstance(inst.instance_name);
                                      fetchInstances();
                                    }}
                                    className="p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/60 rounded transition-colors"
                                    title="Detener contenedor"
                                  >
                                    <Square className="w-3.5 h-3.5 fill-current" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      await api.startInstance(inst.instance_name);
                                      fetchInstances();
                                    }}
                                    className="p-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 rounded transition-colors"
                                    title="Iniciar contenedor"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                  </button>
                                )}

                                <button
                                  onClick={() => {
                                    setSelectedInstance(inst);
                                    setDrawerTab('info');
                                  }}
                                  className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                                  title="Detalles y configuración"
                                >
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: CATÁLOGO DE MODELOS */}
          {activeNav === 'templates' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Catálogo de 17 Plantillas Oficiales de Hardware</h3>
                <p className="text-xs text-zinc-500">Especificaciones CMOS, sensores MEMS y TACs oficiales</p>
              </div>

              {Object.entries(templatesCatalog).map(([brand, models]) => (
                <div key={brand} className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>{brand} ({models.length} modelos)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {models.map((m) => (
                      <div key={m.id} className="p-3.5 bg-zinc-900/50 border border-zinc-800/80 rounded-xl space-y-1.5">
                        <div className="font-semibold text-xs text-zinc-100">{m.name}</div>
                        <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 font-mono">
                          <Cpu className="w-3 h-3 text-zinc-500" />
                          <span>{m.soc_model}</span>
                        </div>
                        <div className="text-[11px] text-zinc-500 flex items-center justify-between pt-1 border-t border-zinc-800">
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

          {/* TAB 3: MAPA & PRESETS */}
          {activeNav === 'locations' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Explorador de Geolocalización Global</h3>
                <p className="text-xs text-zinc-500">20 presets mundiales integrados en el motor de ProteoMesh</p>
              </div>

              <div className="grid grid-cols-4 gap-3">
                {Object.entries(locationPresets).map(([key, loc]) => (
                  <div key={key} className="p-3 bg-zinc-900/50 border border-zinc-800/80 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                      <MapPin className="w-3 h-3 text-blue-400 shrink-0" />
                      <span className="capitalize">{key}</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">{loc.city}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono truncate">{loc.timezone}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: VERIFICADOR DE PROXIES */}
          {activeNav === 'proxies' && (
            <div className="max-w-xl mx-auto py-8 space-y-4">
              <div className="text-center space-y-1">
                <Shield className="w-8 h-8 text-blue-400 mx-auto" />
                <h3 className="text-sm font-semibold text-zinc-100">Verificador Asíncrono de Proxies Residenciales</h3>
                <p className="text-xs text-zinc-500">Prueba la latencia, IP pública de salida y país antes de asignarlo</p>
              </div>

              <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
                <label className="block text-xs font-medium text-zinc-300">Cadena de Proxy SOCKS5 / HTTP</label>
                <input
                  type="text"
                  placeholder="socks5://user:pass@host:port o ip:port:user:pass"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-blue-500"
                />
                <button className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-500/20">
                  Ejecutar Test de Conexión
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── MODAL DE CREACIÓN ─────────────────────────────────────────────── */}
      <CreateDeviceModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={fetchInstances}
        existingPorts={existingPorts}
      />

      {/* ── SLIDE-OVER DE DETALLES DEL DISPOSITIVO ────────────────────────── */}
      <DeviceDetailDrawer
        instance={selectedInstance}
        onClose={() => setSelectedInstance(null)}
        onRefresh={fetchInstances}
        defaultTab={drawerTab}
      />
    </div>
  );
}

export default App;
