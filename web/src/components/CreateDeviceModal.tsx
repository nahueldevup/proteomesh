import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Smartphone,
  MapPin,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
  Globe,
} from 'lucide-react';
import { api } from '../lib/api';
import { MapPicker } from './MapPicker';
import type { TemplateItem, Carrier, ProxyTestResult } from '../types';
import { cn } from '../lib/utils';

interface CreateDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingPorts: number[];
  presetModel?: string;
}

const STEPS = [
  { id: 'device' as const, label: '1. Dispositivo & SIM', icon: Smartphone },
  { id: 'location' as const, label: '2. GPS & Proxy', icon: MapPin },
  { id: 'review' as const, label: '3. Recursos & Crear', icon: Zap },
];
type StepId = typeof STEPS[number]['id'];

const RAM_PRESETS = ['2.0g', '2.5g', '3.0g', '4.0g'];
const CPU_PRESETS = [
  { label: '2 Hilos (0-1)', value: '0-1' },
  { label: '4 Hilos (0-3)', value: '0-3' },
  { label: '8 Hilos (0-7)', value: '0-7' },
];

export const CreateDeviceModal: React.FC<CreateDeviceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingPorts,
  presetModel,
}) => {
  const [activeStep, setActiveStep] = useState<StepId>('device');

  // Form State
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

  // Prevención de reinicio: Inicializar SOLO una vez al pasar de cerrado a abierto
  const prevIsOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setActiveStep('device');
      setErrorMessage(null);
      setSuccessMessage(null);

      // Calcular siguiente puerto libre
      let nextPort = 5580;
      while (existingPorts.includes(nextPort)) {
        nextPort += 2;
      }
      setPort(nextPort);
      setName(`phone-${String(nextPort).slice(-2)}`);

      if (presetModel) {
        setSelectedModel(presetModel);
        const b = presetModel.split('/')[0];
        if (b) setSelectedBrand(b);
      }

      // Cargar catálogos solo si no están cargados
      if (Object.keys(templates).length === 0) {
        setLoading(true);
        Promise.all([api.getTemplates(), api.getCarriers()])
          .then(([tData, cData]) => {
            setTemplates(tData);
            setCarriers(cData);
          })
          .catch((err: any) => {
            setErrorMessage(err.message || 'Error al cargar catálogos del servidor');
          })
          .finally(() => setLoading(false));
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // Manejo de teclado (Escape para cerrar)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, submitting]);

  if (!isOpen) return null;

  const currentStepIndex = STEPS.findIndex((s) => s.id === activeStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const goNext = () => {
    if (!isLastStep) setActiveStep(STEPS[currentStepIndex + 1].id);
  };
  const goPrev = () => {
    if (!isFirstStep) setActiveStep(STEPS[currentStepIndex - 1].id);
  };

  // Test de Proxy
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

  // Enviar Creación
  const handleSubmit = async () => {
    if (!name.trim()) {
      setErrorMessage('El nombre de la instancia es obligatorio');
      setActiveStep('device');
      return;
    }
    if (existingPorts.includes(port)) {
      setErrorMessage(`El puerto ${port} ya está en uso por otra instancia`);
      setActiveStep('device');
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
      setSuccessMessage(`CloudPhone "${name}" creado con éxito`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al aprovisionar el CloudPhone');
    } finally {
      setSubmitting(false);
    }
  };

  const brands = Object.keys(templates);
  const currentBrandModels = templates[selectedBrand] || [];

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in-0 duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-lg border border-border/80 bg-surface/98 shadow-2xl shadow-black/80 overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera Técnica Lovable */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 bg-background/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-md border border-primary/30 bg-primary/10 text-primary">
              <Smartphone className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-sans text-sm font-bold text-foreground">Crear Nuevo CloudPhone</h2>
              <p className="font-mono text-xs text-muted-foreground">
                Configura hardware, operadora SIM, geolocalización y límites
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stepper de 3 Pasos Compacto y Fino */}
        <div className="flex border-b border-border/60 bg-background/30 px-5 gap-1 shrink-0">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = activeStep === step.id;
            const isPast = idx < currentStepIndex;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(step.id)}
                className={cn(
                  'flex items-center gap-2 py-2.5 px-3.5 text-xs font-mono font-medium border-b-2 transition-all shrink-0',
                  isActive
                    ? 'border-primary text-primary bg-primary/10 font-semibold'
                    : isPast
                    ? 'border-transparent text-foreground hover:text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {isPast ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                <span>{step.label}</span>
              </button>
            );
          })}
        </div>

        {/* Contenedor de Contenido con Scroll Estable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {/* Mensajes de error/éxito */}
          {errorMessage && (
            <div className="p-3 bg-destructive/15 border border-destructive/30 rounded-md text-xs text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-mono">{errorMessage}</div>
              <button onClick={() => setErrorMessage(null)} className="text-destructive/70 hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-primary/15 border border-primary/30 rounded-md text-xs text-primary flex items-center gap-2 font-mono">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs font-mono">Cargando catálogo oficial de dispositivos y redes...</span>
            </div>
          ) : (
            <>
              {/* ── PASO 1: DISPOSITIVO & OPERADORA SIM ──────────────────────────── */}
              {activeStep === 'device' && (
                <div className="space-y-4">
                  {/* Fila: Nombre, Puerto ADB y Operadora */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Nombre de la Instancia
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                        className="w-full h-8.5 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="ej: phone-01"
                      />
                      <span className="text-[10px] text-muted-foreground mt-1 block">Minúsculas, números o guiones</span>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Puerto ADB
                      </label>
                      <input
                        type="number"
                        value={port}
                        onChange={(e) => setPort(Number(e.target.value))}
                        className={cn(
                          'w-full h-8.5 rounded-md border bg-background px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1',
                          existingPorts.includes(port)
                            ? 'border-destructive focus:ring-destructive'
                            : 'border-input focus:ring-primary'
                        )}
                        min={1024}
                        max={65535}
                      />
                      <span className={cn('text-[10px] mt-1 block', existingPorts.includes(port) ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
                        {existingPorts.includes(port) ? 'Puerto en uso' : 'Mapeado al 5555 del contenedor'}
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Operadora Móvil (SIM)
                      </label>
                      <select
                        value={selectedCarrier}
                        onChange={(e) => setSelectedCarrier(e.target.value)}
                        className="w-full h-8.5 rounded-md border border-input bg-background px-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary capitalize"
                      >
                        {carriers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.carrier_name} ({c.country_iso.toUpperCase()} · {c.operator_numeric})
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-muted-foreground mt-1 block">Spoofing MCC/MNC y telemetría</span>
                    </div>
                  </div>

                  {/* Selector de Fabricante */}
                  {brands.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-foreground">Fabricante</label>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {currentBrandModels.length} modelos oficiales
                        </span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {brands.map((brand) => (
                          <button
                            key={brand}
                            type="button"
                            onClick={() => {
                              setSelectedBrand(brand);
                              const firstModel = templates[brand]?.[0]?.id;
                              if (firstModel) setSelectedModel(firstModel);
                            }}
                            className={cn(
                              'h-8 px-4 rounded-md border text-xs font-medium capitalize transition-all',
                              selectedBrand === brand
                                ? 'bg-primary/15 border-primary text-primary font-bold'
                                : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                            )}
                          >
                            {brand}
                          </button>
                        ))}
                      </div>

                      {/* Cuadrícula de Modelos */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 max-h-56 overflow-y-auto pr-1">
                        {currentBrandModels.map((m) => {
                          const isSelected = selectedModel === m.id;
                          return (
                            <div
                              key={m.id}
                              onClick={() => setSelectedModel(m.id)}
                              className={cn(
                                'p-2.5 rounded-md border cursor-pointer transition-all',
                                isSelected
                                  ? 'bg-primary/10 border-primary text-foreground'
                                  : 'bg-background/60 border-border hover:border-muted-foreground/40 text-muted-foreground'
                              )}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-xs text-foreground">{m.name}</span>
                                {isSelected && <Check className="h-4 w-4 text-primary" />}
                              </div>
                              <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                                <span>SoC: {m.soc_model}</span>
                                <span>{m.screen}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── PASO 2: GEOLOCALIZACIÓN GPS & PROXY RESIDENCIAL ─────────────── */}
              {activeStep === 'location' && (
                <div className="space-y-4">
                  {/* Mapa Interactivo Leaflet con Presets */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        <span>Geolocalización GPS & Presets de Ciudades</span>
                      </label>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {city} · {latitude.toFixed(4)}, {longitude.toFixed(4)}
                      </span>
                    </div>

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
                      height="210px"
                      showPresets={true}
                      showInfoOverlay={false}
                    />

                    <div className="grid grid-cols-3 gap-2.5 pt-1">
                      <div>
                        <label className="block text-[11px] font-mono text-muted-foreground mb-1">Ciudad</label>
                        <input
                          type="text"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="w-full h-8 rounded-md border border-input bg-background px-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono text-muted-foreground mb-1">Latitud</label>
                        <input
                          type="number"
                          step="any"
                          value={latitude}
                          onChange={(e) => setLatitude(Number(e.target.value))}
                          className="w-full h-8 rounded-md border border-input bg-background px-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono text-muted-foreground mb-1">Longitud</label>
                        <input
                          type="number"
                          step="any"
                          value={longitude}
                          onChange={(e) => setLongitude(Number(e.target.value))}
                          className="w-full h-8 rounded-md border border-input bg-background px-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sección de Proxy Residencial */}
                  <div className="space-y-2 pt-2 border-t border-border/60">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-primary" />
                        <span>Proxy Residencial SOCKS5 / HTTP (Opcional)</span>
                      </label>
                      <span className="text-[10px] text-muted-foreground">Vacío = Conexión directa</span>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={rawProxy}
                        onChange={(e) => setRawProxy(e.target.value)}
                        placeholder="socks5://user:pass@host:port o host:port:user:pass"
                        className="flex-1 h-8.5 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={handleTestProxy}
                        disabled={testingProxy || !rawProxy.trim()}
                        className="h-8.5 px-3.5 rounded-md border border-border bg-secondary text-xs font-mono font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-40 flex items-center gap-1.5"
                      >
                        {testingProxy && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                        <span>Probar</span>
                      </button>
                    </div>

                    {proxyTestResult && (
                      <div
                        className={cn(
                          'p-2.5 rounded-md border text-xs font-mono',
                          proxyTestResult.ok
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-destructive/40 bg-destructive/10 text-destructive'
                        )}
                      >
                        {proxyTestResult.ok ? (
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">
                              ✓ IP: {proxyTestResult.ip} · País: {proxyTestResult.country}
                            </span>
                            <span>{proxyTestResult.latency_ms} ms</span>
                          </div>
                        ) : (
                          <span>Error: {proxyTestResult.error || 'Fallo de conexión'}</span>
                        )}
                      </div>
                    )}

                    <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                      <input
                        type="checkbox"
                        checked={autoSyncProxyLocation}
                        onChange={(e) => setAutoSyncProxyLocation(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-0 h-3.5 w-3.5"
                      />
                      <span className="text-xs text-muted-foreground">
                        Sincronizar coordenadas GPS automáticamente con la IP del proxy
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* ── PASO 3: RECURSOS & RESUMEN DETERMINISTA ──────────────────────── */}
              {activeStep === 'review' && (
                <div className="space-y-4">
                  {/* Asignación de Recursos */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">
                        Memoria RAM
                      </label>
                      <div className="flex gap-1.5">
                        {RAM_PRESETS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setMemoryLimit(p)}
                            className={cn(
                              'flex-1 h-8 rounded-md border font-mono text-xs transition-colors',
                              memoryLimit === p
                                ? 'bg-primary/15 border-primary text-primary font-bold'
                                : 'bg-background border-border text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground block">
                        Recomendado: 2.5g (Óptimo para 120Hz)
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">
                        CPU Pinning (Aislamiento de Hilos)
                      </label>
                      <div className="flex gap-1.5">
                        {CPU_PRESETS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setCpuLimit(c.value)}
                            className={cn(
                              'flex-1 h-8 rounded-md border font-mono text-xs transition-colors',
                              cpuLimit === c.value
                                ? 'bg-primary/15 border-primary text-primary font-bold'
                                : 'bg-background border-border text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {c.value}
                          </button>
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground block">
                        Asignación de núcleos de CPU para mitigar contención
                      </span>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md border border-border bg-background/50">
                    <input
                      type="checkbox"
                      checked={startImmediately}
                      onChange={(e) => setStartImmediately(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-0 h-4 w-4"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-foreground">Iniciar contenedor inmediatamente</span>
                      <p className="text-[11px] text-muted-foreground">
                        Arranca el entorno Android y levanta el servicio ADB tras la creación
                      </p>
                    </div>
                  </label>

                  {/* Ficha Técnica de Resumen Determinista */}
                  <div className="rounded-lg border border-border/80 bg-background/80 p-3.5 font-mono text-xs space-y-2">
                    <div className="flex items-center justify-between border-b border-border/50 pb-2 text-foreground font-semibold">
                      <span>Ficha Técnica de Aprovisionamiento</span>
                      <span className="text-primary text-[11px]">ProteoMesh Deterministic</span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                      <div className="flex justify-between border-b border-border/30 py-1">
                        <span className="text-muted-foreground">Instancia:</span>
                        <span className="font-bold text-foreground">{name}</span>
                      </div>
                      <div className="flex justify-between border-b border-border/30 py-1">
                        <span className="text-muted-foreground">Puerto ADB:</span>
                        <span className="text-foreground">:{port}</span>
                      </div>
                      <div className="flex justify-between border-b border-border/30 py-1">
                        <span className="text-muted-foreground">Modelo:</span>
                        <span className="text-foreground">{selectedModel}</span>
                      </div>
                      <div className="flex justify-between border-b border-border/30 py-1">
                        <span className="text-muted-foreground">Operadora:</span>
                        <span className="text-foreground">{selectedCarrier}</span>
                      </div>
                      <div className="flex justify-between border-b border-border/30 py-1">
                        <span className="text-muted-foreground">GPS / Ciudad:</span>
                        <span className="text-foreground">{city} ({latitude.toFixed(2)}, {longitude.toFixed(2)})</span>
                      </div>
                      <div className="flex justify-between border-b border-border/30 py-1">
                        <span className="text-muted-foreground">Proxy:</span>
                        <span className="text-foreground">{rawProxy ? 'Residencial' : 'Directo (Host)'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Pie con Navegación y Acciones */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border/60 bg-background/50 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={isFirstStep}
              className="h-8 px-3 rounded-md border border-border bg-background text-xs font-mono font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-30 flex items-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Anterior</span>
            </button>
            <span className="text-[11px] font-mono text-muted-foreground">
              Paso {currentStepIndex + 1} de {STEPS.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3.5 rounded-md border border-border bg-background text-xs font-mono font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              Cancelar
            </button>

            {isLastStep ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !name.trim() || existingPorts.includes(port)}
                className="flex h-8 items-center gap-2 rounded-md bg-primary px-4 font-sans text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 shadow-sm shadow-primary/20"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span>{submitting ? 'Aprovisionando...' : 'Crear CloudPhone'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-4 font-sans text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-sm shadow-primary/20"
              >
                <span>Siguiente</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
