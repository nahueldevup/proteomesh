import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Globe,
  MapPin,
  Shield,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Cpu,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { api } from '../lib/api';
import { MapPicker } from './MapPicker';
import type { TemplateItem, Carrier, ProxyTestResult } from '../types';

interface CreateDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingPorts: number[];
}

const TABS = ['hardware', 'carrier', 'location', 'proxy', 'limits'] as const;
type TabId = typeof TABS[number];

const TAB_CONFIG = [
  { id: 'hardware' as const, label: '1. Hardware', icon: Cpu },
  { id: 'carrier' as const, label: '2. Operadora', icon: Globe },
  { id: 'location' as const, label: '3. GPS', icon: MapPin },
  { id: 'proxy' as const, label: '4. Proxy', icon: Shield },
  { id: 'limits' as const, label: '5. Recursos', icon: Zap },
];

export const CreateDeviceModal: React.FC<CreateDeviceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingPorts,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('hardware');

  // Form state
  const [name, setName] = useState('');
  const [port, setPort] = useState(5580);
  const [selectedBrand, setSelectedBrand] = useState('samsung');
  const [selectedModel, setSelectedModel] = useState('samsung/a54x');
  const [selectedCarrier, setSelectedCarrier] = useState('ar_personal');
  const [startImmediately, setStartImmediately] = useState(false);

  // Limits
  const [memoryLimit, setMemoryLimit] = useState('2.5g');
  const [cpuLimit, setCpuLimit] = useState('0-3');

  // Location
  const [latitude, setLatitude] = useState(-34.603722);
  const [longitude, setLongitude] = useState(-58.381592);
  const [altitude] = useState(25.0);
  const [city, setCity] = useState('Buenos Aires');
  const [timezone, setTimezone] = useState('America/Argentina/Buenos_Aires');

  // Proxy
  const [rawProxy, setRawProxy] = useState('');
  const [testingProxy, setTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<ProxyTestResult | null>(null);
  const [autoSyncProxyLocation, setAutoSyncProxyLocation] = useState(true);

  // Catalogs
  const [templates, setTemplates] = useState<Record<string, TemplateItem[]>>({});
  const [carriers, setCarriers] = useState<Carrier[]>([]);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Reset al abrir
  useEffect(() => {
    if (!isOpen) return;

    setActiveTab('hardware');
    setErrorMessage(null);
    setSuccessMessage(null);
    setProxyTestResult(null);

    // Calcular siguiente puerto libre
    let nextPort = 5580;
    while (existingPorts.includes(nextPort)) {
      nextPort += 2;
    }
    setPort(nextPort);
    setName(`phone-${String(nextPort).slice(-2)}`);

    async function loadData() {
      setLoading(true);
      try {
        const [tData, cData] = await Promise.all([
          api.getTemplates(),
          api.getCarriers(),
        ]);
        setTemplates(tData);
        setCarriers(cData);
      } catch (err: any) {
        setErrorMessage(err.message || 'Error al cargar catalogos del servidor');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isOpen, existingPorts]);

  if (!isOpen) return null;

  const currentTabIndex = TABS.indexOf(activeTab);
  const isFirstTab = currentTabIndex === 0;
  const isLastTab = currentTabIndex === TABS.length - 1;

  const goNext = () => {
    if (!isLastTab) setActiveTab(TABS[currentTabIndex + 1]);
  };
  const goPrev = () => {
    if (!isFirstTab) setActiveTab(TABS[currentTabIndex - 1]);
  };

  // Proxy test
  const handleTestProxy = async () => {
    if (!rawProxy.trim()) return;
    setTestingProxy(true);
    setProxyTestResult(null);
    try {
      const res = await api.testProxy({ proxy_url: rawProxy.trim() });
      setProxyTestResult(res);
      if (res.ok && res.latitude && res.longitude && autoSyncProxyLocation) {
        setLatitude(res.latitude);
        setLongitude(res.longitude);
        setCity(`${res.city || ''}, ${res.country || ''}`.replace(/^, |, $/g, '').trim() || 'Proxy Location');
        if (res.timezone) setTimezone(res.timezone);
      }
    } catch (err: any) {
      setProxyTestResult({ ok: false, error: err.message });
    } finally {
      setTestingProxy(false);
    }
  };

  // Submit
  const handleSubmit = async () => {
    if (!name.trim()) {
      setErrorMessage('El nombre de la instancia es obligatorio');
      setActiveTab('hardware');
      return;
    }
    if (existingPorts.includes(port)) {
      setErrorMessage(`El puerto ${port} ya esta en uso por otra instancia`);
      setActiveTab('hardware');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const payload: any = {
        name: name.trim().toLowerCase(),
        template: selectedModel,
        carrier: selectedCarrier,
        port: Number(port),
        start: startImmediately,
        limits: {
          memory: memoryLimit,
          cpus: cpuLimit,
        },
        custom_location: {
          city,
          latitude,
          longitude,
          altitude,
          accuracy: 4.2,
          timezone,
        },
      };

      if (rawProxy.trim()) {
        payload.raw_proxy = rawProxy.trim();
      }

      await api.createInstance(payload);
      setSuccessMessage(`CloudPhone "${name}" creado con exito`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 800);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al aprovisionar el CloudPhone');
    } finally {
      setSubmitting(false);
    }
  };

  const brands = Object.keys(templates);
  const currentBrandModels = templates[selectedBrand] || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Crear Nuevo CloudPhone</h2>
              <p className="text-xs text-zinc-500">Configura identidad, hardware, SIM y geolocalizacion</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de pestanas con indicador de progreso */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/30 px-4 gap-1 shrink-0 overflow-x-auto">
          {TAB_CONFIG.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isPast = TABS.indexOf(tab.id) < currentTabIndex;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 py-3 px-3 text-xs font-medium border-b-2 transition-all shrink-0 ${
                  isActive
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                    : isPast
                    ? 'border-transparent text-zinc-300'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {isPast ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Contenido con scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Mensajes de error/exito */}
          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">Error: </span>
                <span>{errorMessage}</span>
              </div>
              <button onClick={() => setErrorMessage(null)} className="ml-auto text-red-400 hover:text-red-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="font-medium">{successMessage}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="text-xs">Cargando catalogos de hardware y red...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: HARDWARE & MODELO */}
              {activeTab === 'hardware' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                        Nombre de la Instancia
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
                        placeholder="ej: phone-01"
                      />
                      <span className="text-[10px] text-zinc-500 mt-1 block">Solo minusculas, numeros, guiones</span>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                        Puerto ADB
                      </label>
                      <input
                        type="number"
                        value={port}
                        onChange={(e) => setPort(Number(e.target.value))}
                        className={`w-full bg-zinc-900 border rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500 font-mono ${
                          existingPorts.includes(port) ? 'border-red-500/60' : 'border-zinc-800'
                        }`}
                        min={1024}
                        max={65535}
                      />
                      {existingPorts.includes(port) ? (
                        <span className="text-[10px] text-red-400 mt-1 block">Puerto en uso</span>
                      ) : (
                        <span className="text-[10px] text-zinc-500 mt-1 block">Mapeado a 5555 del contenedor</span>
                      )}
                    </div>
                  </div>

                  {brands.length > 0 && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-2">Fabricante</label>
                        <div className="flex gap-2">
                          {brands.map((brand) => (
                            <button
                              key={brand}
                              type="button"
                              onClick={() => {
                                setSelectedBrand(brand);
                                const firstModel = templates[brand]?.[0]?.id;
                                if (firstModel) setSelectedModel(firstModel);
                              }}
                              className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium capitalize transition-all ${
                                selectedBrand === brand
                                  ? 'bg-blue-600/10 border-blue-500 text-blue-400'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                              }`}
                            >
                              {brand}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-2">
                          Modelo ({currentBrandModels.length} disponibles)
                        </label>
                        <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                          {currentBrandModels.map((m) => {
                            const isSelected = selectedModel === m.id;
                            return (
                              <div
                                key={m.id}
                                onClick={() => setSelectedModel(m.id)}
                                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                  isSelected
                                    ? 'bg-blue-500/10 border-blue-500 text-blue-100'
                                    : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-semibold text-xs text-zinc-100">{m.name}</span>
                                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />}
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                  <span>SoC: {m.soc_model}</span>
                                  <span className="font-mono">{m.screen}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB 2: OPERADORA SIM */}
              {activeTab === 'carrier' && (
                <div className="space-y-4">
                  <label className="block text-xs font-medium text-zinc-300">
                    Operadora Telefonica
                  </label>
                  {carriers.length === 0 ? (
                    <div className="py-8 text-center text-zinc-500 text-xs">
                      No hay operadoras cargadas en el servidor
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {carriers.map((c) => {
                        const isSelected = selectedCarrier === c.id;
                        return (
                          <div
                            key={c.id}
                            onClick={() => setSelectedCarrier(c.id)}
                            className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                              isSelected
                                ? 'bg-blue-500/10 border-blue-500'
                                : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            <div>
                              <div className="text-xs font-medium text-zinc-100">{c.carrier_name}</div>
                              <div className="text-[11px] text-zinc-500">
                                MCC/MNC: <span className="font-mono">{c.operator_numeric}</span> ·{' '}
                                <span className="uppercase">{c.country_iso}</span>
                              </div>
                            </div>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: MAPA & GPS */}
              {activeTab === 'location' && (
                <div className="space-y-4">
                  <MapPicker
                    latitude={latitude}
                    longitude={longitude}
                    city={city}
                    onChange={(lat, lon, newCity) => {
                      setLatitude(lat);
                      setLongitude(lon);
                      if (newCity) setCity(newCity);
                      else setCity(`Coordenadas (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
                    }}
                    height="300px"
                  />

                  <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[11px] font-medium text-zinc-400 mb-1">Ciudad</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-zinc-400 mb-1">Latitud</label>
                      <input
                        type="number"
                        step="any"
                        value={latitude}
                        onChange={(e) => setLatitude(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-zinc-400 mb-1">Longitud</label>
                      <input
                        type="number"
                        step="any"
                        value={longitude}
                        onChange={(e) => setLongitude(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: PROXY RESIDENCIAL */}
              {activeTab === 'proxy' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Proxy Residencial (SOCKS5 / HTTP)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={rawProxy}
                        onChange={(e) => setRawProxy(e.target.value)}
                        placeholder="socks5://user:pass@host:port o host:port:user:pass"
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleTestProxy}
                        disabled={testingProxy || !rawProxy.trim()}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-medium text-zinc-200 rounded-lg transition-colors flex items-center gap-2"
                      >
                        {testingProxy && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
                        <span>Probar</span>
                      </button>
                    </div>
                    <span className="text-[10px] text-zinc-500 mt-1 block">
                      Deja vacio para conexion directa (sin proxy)
                    </span>
                  </div>

                  {proxyTestResult && (
                    <div
                      className={`p-3.5 rounded-lg border text-xs ${
                        proxyTestResult.ok
                          ? 'bg-emerald-950/20 border-emerald-800/60 text-emerald-200'
                          : 'bg-red-950/20 border-red-800/60 text-red-300'
                      }`}
                    >
                      {proxyTestResult.ok ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 font-medium text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Proxy Verificado</span>
                            <span className="ml-auto text-[11px] font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                              {proxyTestResult.latency_ms} ms
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-zinc-400">
                            <div>IP: <span className="text-zinc-200 font-mono">{proxyTestResult.ip}</span></div>
                            <div>Pais: <span className="text-zinc-200">{proxyTestResult.city ? `${proxyTestResult.city}, ` : ''}{proxyTestResult.country}</span></div>
                            <div>TZ: <span className="text-zinc-200 font-mono">{proxyTestResult.timezone}</span></div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-red-400">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{proxyTestResult.error || 'No se pudo conectar al proxy'}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSyncProxyLocation}
                      onChange={(e) => setAutoSyncProxyLocation(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-700 text-blue-500 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span className="text-xs text-zinc-300">
                      Auto-sincronizar GPS con ubicacion del proxy
                    </span>
                  </label>
                </div>
              )}

              {/* TAB 5: RECURSOS */}
              {activeTab === 'limits' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                        Memoria RAM
                      </label>
                      <input
                        type="text"
                        value={memoryLimit}
                        onChange={(e) => setMemoryLimit(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
                        placeholder="2.5g"
                      />
                      <span className="text-[10px] text-zinc-500 mt-1 block">Recomendado: 2.5g</span>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                        CPU Pinning
                      </label>
                      <input
                        type="text"
                        value={cpuLimit}
                        onChange={(e) => setCpuLimit(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
                        placeholder="0-3"
                      />
                      <span className="text-[10px] text-zinc-500 mt-1 block">Recomendado: 0-3 (4 hilos dedicados)</span>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={startImmediately}
                      onChange={(e) => setStartImmediately(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-700 text-blue-500 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span className="text-xs text-zinc-300 font-medium">
                      Iniciar contenedor inmediatamente
                    </span>
                  </label>

                  {/* Resumen final */}
                  <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2">
                    <div className="text-xs font-semibold text-zinc-200 border-b border-zinc-800 pb-2">
                      Resumen de Configuracion
                    </div>
                    <div className="grid grid-cols-2 gap-y-1.5 text-[11px]">
                      <span className="text-zinc-500">Nombre:</span>
                      <span className="text-zinc-200 font-mono">{name || '(sin nombre)'}</span>
                      <span className="text-zinc-500">Puerto ADB:</span>
                      <span className="text-zinc-200 font-mono">{port}</span>
                      <span className="text-zinc-500">Modelo:</span>
                      <span className="text-zinc-200">{selectedModel}</span>
                      <span className="text-zinc-500">Operadora:</span>
                      <span className="text-zinc-200">{selectedCarrier}</span>
                      <span className="text-zinc-500">GPS:</span>
                      <span className="text-zinc-200 font-mono">{latitude.toFixed(4)}, {longitude.toFixed(4)}</span>
                      <span className="text-zinc-500">Ciudad:</span>
                      <span className="text-zinc-200">{city}</span>
                      <span className="text-zinc-500">Proxy:</span>
                      <span className="text-zinc-200 font-mono">{rawProxy || 'Conexion directa'}</span>
                      <span className="text-zinc-500">RAM / CPU:</span>
                      <span className="text-zinc-200 font-mono">{memoryLimit} / {cpuLimit}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Pie con navegacion y accion */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-zinc-800 bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={isFirstTab}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 text-xs font-medium text-zinc-300 rounded-lg border border-zinc-800 transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Anterior</span>
            </button>
            <span className="text-[10px] text-zinc-600 font-mono">
              Paso {currentTabIndex + 1} de {TABS.length}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-400 rounded-lg border border-zinc-800 transition-colors"
            >
              Cancelar
            </button>

            {isLastTab ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !name.trim()}
                className="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-semibold text-white rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{submitting ? 'Creando...' : 'Crear CloudPhone'}</span>
                {!submitting && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
              >
                <span>Siguiente</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
