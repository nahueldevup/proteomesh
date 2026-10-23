import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  Square,
  RefreshCw,
  Activity,
  MapPin,
  Shield,
  Smartphone,
  Copy,
  Check,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Monitor,
} from 'lucide-react';
import { api } from '../lib/api';
import { MapPicker } from './MapPicker';
import { ScreenViewer } from './ScreenViewer';
import type { Instance, ProxyTestResult } from '../types';

interface DeviceDetailDrawerProps {
  instance: Instance | null;
  onClose: () => void;
  onRefresh: () => void;
  defaultTab?: 'screen' | 'info' | 'location' | 'proxy' | 'health';
}

export const DeviceDetailDrawer: React.FC<DeviceDetailDrawerProps> = ({
  instance,
  onClose,
  onRefresh,
  defaultTab,
}) => {
  const [activeTab, setActiveTab] = useState<'screen' | 'info' | 'location' | 'proxy' | 'health'>(
    defaultTab || (instance?.running ? 'screen' : 'info')
  );

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    } else if (instance?.running && activeTab === 'info') {
      setActiveTab('screen');
    }
  }, [instance?.instance_name, defaultTab]);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Acción estado
  const [actionLoading, setActionLoading] = useState(false);
  const [healthReports, setHealthReports] = useState<string[] | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);

  // Location edit
  const [editLat, setEditLat] = useState(instance?.location?.latitude || -34.603722);
  const [editLon, setEditLon] = useState(instance?.location?.longitude || -58.381592);
  const [editCity, setEditCity] = useState(instance?.location?.city || 'Buenos Aires');
  const [savingLocation, setSavingLocation] = useState(false);
  const [locSuccess, setLocSuccess] = useState(false);

  // Proxy edit
  const [proxyUrl, setProxyUrl] = useState(
    instance?.proxy
      ? `${instance.proxy.type}://${instance.proxy.username ? `${instance.proxy.username}:${instance.proxy.password}@` : ''}${instance.proxy.host}:${instance.proxy.port}`
      : ''
  );
  const [testingProxy, setTestingProxy] = useState(false);
  const [proxyTestRes, setProxyTestRes] = useState<ProxyTestResult | null>(null);
  const [savingProxy, setSavingProxy] = useState(false);

  // Sincronizar estado local si cambia la instancia seleccionada
  useEffect(() => {
    if (!instance) return;
    setEditLat(instance.location?.latitude || -34.603722);
    setEditLon(instance.location?.longitude || -58.381592);
    setEditCity(instance.location?.city || 'Buenos Aires');
    setProxyUrl(
      instance.proxy
        ? `${instance.proxy.type}://${instance.proxy.username ? `${instance.proxy.username}:${instance.proxy.password}@` : ''}${instance.proxy.host}:${instance.proxy.port}`
        : ''
    );
  }, [instance?.instance_name]);

  if (!instance) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleStart = async () => {
    setActionLoading(true);
    try {
      await api.startInstance(instance.instance_name);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      await api.stopInstance(instance.instance_name);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunHealth = async () => {
    setActionLoading(true);
    try {
      const h = await api.getHealth(instance.instance_name);
      setHealthOk(h.ok);
      setHealthReports(h.reports);
      setActiveTab('health');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveLocation = async () => {
    setSavingLocation(true);
    setLocSuccess(false);
    try {
      await api.setInstanceLocation(instance.instance_name, {
        latitude: editLat,
        longitude: editLon,
        city: editCity,
      });
      setLocSuccess(true);
      onRefresh();
      setTimeout(() => setLocSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingLocation(false);
    }
  };

  const handleSaveProxy = async () => {
    setSavingProxy(true);
    try {
      if (proxyUrl.trim()) {
        await api.setInstanceProxy(instance.instance_name, {
          raw_proxy: proxyUrl.trim(),
          auto_sync_location: true,
        });
      } else {
        await api.removeInstanceProxy(instance.instance_name);
      }
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingProxy(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Cabecera */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-100 font-mono text-sm">
            {instance.instance_name.slice(-2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">{instance.instance_name}</h2>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                  instance.running
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${instance.running ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                {instance.running ? 'Online' : 'Offline'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 font-mono">Puerto: {instance.adb_port} · ADB: 127.0.0.1:{instance.adb_port}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {instance.running ? (
            <button
              onClick={handleStop}
              disabled={actionLoading}
              className="px-2.5 py-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-300 border border-red-800/60 rounded text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Detener</span>
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={actionLoading}
              className="px-2.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-300 border border-emerald-800/60 rounded text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Iniciar</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pestañas de detalle */}
      <div className="flex border-b border-zinc-800 bg-zinc-900/30 px-4 gap-1 shrink-0 overflow-x-auto">
        {[
          { id: 'screen', label: 'Pantalla & Control', icon: Monitor },
          { id: 'info', label: 'Identidad & Hardware', icon: Smartphone },
          { id: 'location', label: 'Ubicación GPS', icon: MapPin },
          { id: 'proxy', label: 'Proxy Residencial', icon: Shield },
          { id: 'health', label: 'Salud', icon: Activity },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-medium border-b-2 transition-all shrink-0 ${
                isActive
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* TAB 0: PANTALLA & CONTROL REMOTO */}
        {activeTab === 'screen' && (
          <div className="animate-in fade-in duration-150">
            <ScreenViewer instance={instance} onRefreshInstance={onRefresh} />
          </div>
        )}

        {/* TAB 1: IDENTIDAD */}
        {activeTab === 'info' && (
          <div className="space-y-4 text-xs animate-in fade-in duration-150">
            <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-3 space-y-2.5">
              <span className="font-semibold text-zinc-200 block text-xs border-b border-zinc-800 pb-1.5">
                Identificadores GSMA / IEEE
              </span>

              {[
                { label: 'IMEI (Luhn)', value: instance.identity?.imei, key: 'imei' },
                { label: 'Número de Serie', value: instance.identity?.serial, key: 'serial' },
                { label: 'Dirección MAC Wi-Fi', value: instance.identity?.wifi_mac, key: 'mac' },
                { label: 'SSID / Router', value: `${instance.identity?.wifi_ssid} (${instance.identity?.wifi_bssid})`, key: 'ssid' },
                { label: 'Número SIM', value: instance.identity?.phone_number, key: 'phone' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between text-zinc-400">
                  <span className="text-zinc-500">{item.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-zinc-200">{item.value || 'N/A'}</span>
                    {item.value && (
                      <button
                        onClick={() => handleCopy(item.value!, item.key)}
                        className="text-zinc-500 hover:text-zinc-200"
                      >
                        {copiedKey === item.key ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-3 space-y-2">
              <span className="font-semibold text-zinc-200 block text-xs border-b border-zinc-800 pb-1.5">
                Especificación del Perfil
              </span>
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-zinc-500">Plantilla</span>
                <span className="font-medium text-zinc-200">{instance.template}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-zinc-500">Operadora</span>
                <span className="font-medium text-zinc-200">{instance.carrier}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-zinc-500">Límites Asignados</span>
                <span className="font-mono text-zinc-200">
                  RAM: {instance.limits?.memory || 'default'} · CPU: {instance.limits?.cpus || 'default'}
                </span>
              </div>
            </div>

            {/* Comando scrcpy */}
            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
              <span className="text-[11px] text-zinc-500 block mb-1">Comando de Control Remoto (scrcpy)</span>
              <div className="flex items-center justify-between bg-zinc-950 p-2 rounded border border-zinc-800/80 font-mono text-xs text-zinc-300">
                <span>scrcpy -s 127.0.0.1:{instance.adb_port}</span>
                <button
                  onClick={() => handleCopy(`scrcpy -s 127.0.0.1:${instance.adb_port}`, 'scrcpy')}
                  className="text-zinc-500 hover:text-zinc-200 ml-2"
                >
                  {copiedKey === 'scrcpy' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: UBICACIÓN GPS */}
        {activeTab === 'location' && (
          <div className="space-y-4 text-xs animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-300">
                {instance.running ? 'Modificación en Caliente (En Vivo)' : 'Configuración en Frío'}
              </span>
              {locSuccess && (
                <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>GPS inyectado con éxito</span>
                </span>
              )}
            </div>

            <MapPicker
              latitude={editLat}
              longitude={editLon}
              city={editCity}
              onChange={(lat, lon, newCity) => {
                setEditLat(lat);
                setEditLon(lon);
                if (newCity) setEditCity(newCity);
              }}
              className="h-[260px] w-full rounded-lg overflow-hidden border border-zinc-800"
            />

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3">
                <label className="block text-[11px] text-zinc-500 mb-1">Nombre / Ciudad</label>
                <input
                  type="text"
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Latitud</label>
                <input
                  type="number"
                  step="any"
                  value={editLat}
                  onChange={(e) => setEditLat(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Longitud</label>
                <input
                  type="number"
                  step="any"
                  value={editLon}
                  onChange={(e) => setEditLon(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 font-mono"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleSaveLocation}
                  disabled={savingLocation}
                  className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  {savingLocation && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{savingLocation ? 'Guardando...' : 'Aplicar GPS'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PROXY */}
        {activeTab === 'proxy' && (
          <div className="space-y-4 text-xs animate-in fade-in duration-150">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Proxy Residencial Asignado
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={proxyUrl}
                  onChange={(e) => setProxyUrl(e.target.value)}
                  placeholder="socks5://user:pass@host:port o host:port:user:pass"
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!proxyUrl.trim()) return;
                    setTestingProxy(true);
                    setProxyTestRes(null);
                    try {
                      const res = await api.testProxy({ proxy_url: proxyUrl.trim() });
                      setProxyTestRes(res);
                    } catch (err: any) {
                      setProxyTestRes({ ok: false, error: err.message });
                    } finally {
                      setTestingProxy(false);
                    }
                  }}
                  disabled={testingProxy || !proxyUrl.trim()}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {testingProxy && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
                  <span>Probar</span>
                </button>
              </div>
            </div>

            {proxyTestRes && (
              <div
                className={`p-3 rounded-lg border ${
                  proxyTestRes.ok
                    ? 'bg-emerald-950/20 border-emerald-800/60 text-emerald-200'
                    : 'bg-red-950/20 border-red-800/60 text-red-300'
                }`}
              >
                {proxyTestRes.ok ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between font-medium text-emerald-400">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Conectado: {proxyTestRes.ip}</span>
                      </span>
                      <span className="font-mono text-[11px]">{proxyTestRes.latency_ms} ms</span>
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {proxyTestRes.city ? `${proxyTestRes.city}, ` : ''}{proxyTestRes.country} · {proxyTestRes.timezone}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-red-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{proxyTestRes.error}</span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleSaveProxy}
              disabled={savingProxy}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-xs transition-colors flex items-center justify-center gap-2"
            >
              {savingProxy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{savingProxy ? 'Actualizando...' : proxyUrl.trim() ? 'Guardar y Auto-Sincronizar' : 'Remover Proxy (Conexión Directa)'}</span>
            </button>
          </div>
        )}

        {/* TAB 4: SALUD */}
        {activeTab === 'health' && (
          <div className="space-y-4 text-xs animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-200">Protocolo de Verificación de Salud</span>
              <button
                onClick={handleRunHealth}
                disabled={actionLoading}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${actionLoading ? 'animate-spin' : ''}`} />
                <span>Re-verificar</span>
              </button>
            </div>

            {healthReports ? (
              <div className="space-y-2">
                <div
                  className={`p-2.5 rounded border font-medium flex items-center gap-2 ${
                    healthOk
                      ? 'bg-emerald-950/20 border-emerald-800/60 text-emerald-300'
                      : 'bg-red-950/20 border-red-800/60 text-red-300'
                  }`}
                >
                  {healthOk ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span>{healthOk ? 'Salud del CloudPhone: 100% Óptima' : 'Se encontraron advertencias'}</span>
                </div>
                <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800 space-y-1 font-mono text-[11px]">
                  {healthReports.map((r, i) => (
                    <div key={i} className="text-zinc-300">{r}</div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-zinc-500">
                <button
                  onClick={handleRunHealth}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium"
                >
                  Ejecutar 7 Checks de Salud
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
