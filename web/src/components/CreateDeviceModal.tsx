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
} from 'lucide-react';
import { api } from '../lib/api';
import { MapPicker } from './MapPicker';
import type { TemplateItem, Carrier, LocationData, ProxyTestResult } from '../types';

interface CreateDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingPorts: number[];
}

export const CreateDeviceModal: React.FC<CreateDeviceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingPorts,
}) => {
  const [activeTab, setActiveTab] = useState<'hardware' | 'carrier' | 'location' | 'proxy' | 'limits'>('hardware');

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
  const [locationPreset, setLocationPreset] = useState('ba');
  const [latitude, setLatitude] = useState(-34.603722);
  const [longitude, setLongitude] = useState(-58.381592);
  const [altitude, setAltitude] = useState(25.0);
  const [city, setCity] = useState('Buenos Aires, Argentina (Obelisco)');
  const [timezone, setTimezone] = useState('America/Argentina/Buenos_Aires');

  // Proxy
  const [rawProxy, setRawProxy] = useState('');
  const [testingProxy, setTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<ProxyTestResult | null>(null);
  const [autoSyncProxyLocation, setAutoSyncProxyLocation] = useState(true);

  // Catalogs
  const [templates, setTemplates] = useState<Record<string, TemplateItem[]>>({});
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [locationPresets, setLocationPresets] = useState<Record<string, LocationData>>({});

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cargar catálogos
  useEffect(() => {
    if (!isOpen) return;

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
        const [tData, cData, lData] = await Promise.all([
          api.getTemplates(),
          api.getCarriers(),
          api.getLocationPresets(),
        ]);
        setTemplates(tData);
        setCarriers(cData);
        setLocationPresets(lData);
      } catch (err: any) {
        setErrorMessage(err.message || 'Error al cargar catálogos del servidor');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isOpen, existingPorts]);

  if (!isOpen) return null;

  // Manejar cambio de preset geográfico
  const handleSelectPreset = (key: string) => {
    const p = locationPresets[key];
    if (p) {
      setLocationPreset(key);
      setLatitude(p.latitude);
      setLongitude(p.longitude);
      setAltitude(p.altitude || 25.0);
      setCity(p.city);
      if (p.timezone) setTimezone(p.timezone);
    }
  };

  // Manejar prueba de proxy
  const handleTestProxy = async () => {
    if (!rawProxy.trim()) return;
    setTestingProxy(true);
    setProxyTestResult(null);
    try {
      const res = await api.testProxy({ proxy_url: rawProxy.trim() });
      setProxyTestResult(res);

      // Si fue exitoso y autoSync está activo, sincronizar mapa
      if (res.ok && res.latitude && res.longitude && autoSyncProxyLocation) {
        setLatitude(res.latitude);
        setLongitude(res.longitude);
        setCity(`${res.city || ''}, ${res.country || ''}`.trim());
        if (res.timezone) setTimezone(res.timezone);
      }
    } catch (err: any) {
      setProxyTestResult({ ok: false, error: err.message });
    } finally {
      setTestingProxy(false);
    }
  };

  // Enviar creación
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al aprovisionar el CloudPhone');
    } finally {
      setSubmitting(false);
    }
  };

  const brands = Object.keys(templates);
  const currentBrandModels = templates[selectedBrand] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Crear Nuevo CloudPhone</h2>
              <p className="text-xs text-zinc-500">Configura identidad física, hardware, SIM y geolocalización</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de pestañas */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/30 px-6 gap-2">
          {[
            { id: 'hardware', label: '1. Hardware & Modelo', icon: Cpu },
            { id: 'carrier', label: '2. Operadora SIM', icon: Globe },
            { id: 'location', label: '3. Mapa & GPS', icon: MapPin },
            { id: 'proxy', label: '4. Proxy Residencial', icon: Shield },
            { id: 'limits', label: '5. Recursos', icon: Zap },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-all ${
                  isActive
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Contenido con scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="text-xs">Cargando catálogos de hardware y red...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: HARDWARE & MODELO */}
              {activeTab === 'hardware' && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                        Identificador de Instancia
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
                        placeholder="ej: phone-01"
                        required
                      />
                      <span className="text-[11px] text-zinc-500">Solo letras minúsculas, números, guiones y guiones bajos</span>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                        Puerto ADB Host
                      </label>
                      <input
                        type="number"
                        value={port}
                        onChange={(e) => setPort(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500 font-mono"
                        min={1024}
                        max={65535}
                        required
                      />
                      <span className="text-[11px] text-zinc-500">Mapeado a 5555 del contenedor</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-2">
                      Fabricante
                    </label>
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
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {brand}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-2">
                      Modelo Fidedigno Oficial ({currentBrandModels.length} disponibles)
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
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
                </div>
              )}

              {/* TAB 2: OPERADORA SIM */}
              {activeTab === 'carrier' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <label className="block text-xs font-medium text-zinc-300">
                    Selecciona Operadora Telefónica Celular (Argentina e Internacional)
                  </label>
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
                              MCC/MNC: <span className="font-mono">{c.operator_numeric}</span> · País: <span className="uppercase">{c.country_iso}</span>
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: MAPA & GPS */}
              {activeTab === 'location' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Presets Rápidos de Ciudades
                    </label>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {Object.keys(locationPresets).map((presetKey) => (
                        <button
                          key={presetKey}
                          type="button"
                          onClick={() => handleSelectPreset(presetKey)}
                          className={`px-2.5 py-1 rounded text-[11px] border capitalize transition-all ${
                            locationPreset === presetKey
                              ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {presetKey}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Mapa Interactivo Leaflet */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Selector Visual de Mapa (Haz clic o arrastra la chincheta)
                    </label>
                    <MapPicker
                      latitude={latitude}
                      longitude={longitude}
                      city={city}
                      onChange={(lat, lon, newCity) => {
                        setLatitude(lat);
                        setLongitude(lon);
                        setLocationPreset('');
                        if (newCity) setCity(newCity);
                        else setCity(`Coordenadas (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
                      }}
                    />
                  </div>

                  {/* Coordenadas finas */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[11px] font-medium text-zinc-400 mb-1">Nombre / Ciudad</label>
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
                <div className="space-y-4 animate-in fade-in duration-150">
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
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium text-zinc-200 rounded-lg transition-colors flex items-center gap-2"
                      >
                        {testingProxy && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
                        <span>Probar Conexión</span>
                      </button>
                    </div>
                    <span className="text-[11px] text-zinc-500 mt-1 block">
                      Deja este campo vacío si la instancia se conectará directamente a internet.
                    </span>
                  </div>

                  {/* Resultado de la prueba */}
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
                            <span>Proxy Verificado con Éxito</span>
                            <span className="ml-auto text-[11px] font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                              {proxyTestResult.latency_ms} ms
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-zinc-400">
                            <div>IP Salida: <span className="text-zinc-200 font-mono">{proxyTestResult.ip}</span></div>
                            <div>País: <span className="text-zinc-200">{proxyTestResult.city ? `${proxyTestResult.city}, ` : ''}{proxyTestResult.country}</span></div>
                            <div>Zona: <span className="text-zinc-200 font-mono">{proxyTestResult.timezone}</span></div>
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

                  <label className="flex items-center gap-2 cursor-pointer pt-2">
                    <input
                      type="checkbox"
                      checked={autoSyncProxyLocation}
                      onChange={(e) => setAutoSyncProxyLocation(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-800 text-blue-500 focus:ring-0"
                    />
                    <span className="text-xs text-zinc-300">
                      Auto-sincronizar GPS y huso horario con la ubicación geográfica del proxy
                    </span>
                  </label>
                </div>
              )}

              {/* TAB 5: RECURSOS */}
              {activeTab === 'limits' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                        Límite de Memoria RAM
                      </label>
                      <input
                        type="text"
                        value={memoryLimit}
                        onChange={(e) => setMemoryLimit(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
                        placeholder="2.5g"
                      />
                      <span className="text-[11px] text-zinc-500">Recomendado: 2.5g (ideal para estabilidad y densidad)</span>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                        Asignación de CPU Pinning
                      </label>
                      <input
                        type="text"
                        value={cpuLimit}
                        onChange={(e) => setCpuLimit(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
                        placeholder="0-3"
                      />
                      <span className="text-[11px] text-zinc-500">Recomendado: 0-3 (4 hilos dedicados para UI + encoder)</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={startImmediately}
                        onChange={(e) => setStartImmediately(e.target.checked)}
                        className="rounded bg-zinc-900 border-zinc-800 text-blue-500 focus:ring-0"
                      />
                      <span className="text-xs text-zinc-300 font-medium">
                        Iniciar contenedor Docker inmediatamente tras la creación
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Pie con botones de acción */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-900/50">
          <div className="text-xs text-zinc-500">
            {selectedModel.split('/')[1] || selectedModel} · {selectedCarrier} · {city}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-300 rounded-lg border border-zinc-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !name.trim()}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-medium text-white rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submitting ? 'Aprovisionando...' : 'Crear CloudPhone'}</span>
              {!submitting && <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
