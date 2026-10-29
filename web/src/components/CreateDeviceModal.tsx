import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Usb,
  Sparkles,
  Pin,
} from 'lucide-react';
import { api } from '../lib/api';
import { MapPicker, type MapPinItem } from './MapPicker';
import { getPresetDisplay } from './locations/CustomLocationsManager';
import type { TemplateItem, Carrier, CustomLocation } from '../types';
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
  { id: 'location' as const, label: '2. Geolocalización GPS', icon: MapPin },
  { id: 'review' as const, label: '3. Recursos & Crear', icon: Zap },
];
type StepId = typeof STEPS[number]['id'];

const COUNTRY_NAMES: Record<string, string> = {
  ar: 'Argentina',
  us: 'Estados Unidos',
  br: 'Brasil',
  mx: 'México',
  es: 'España',
};

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
  const [phoneNumber, setPhoneNumber] = useState('');
  const [startImmediately, setStartImmediately] = useState(false);

  // Generador de número de Formosa (3704 / 3705 + 6 dígitos)
  const generateFormosaNumber = () => {
    const prefix = Math.random() < 0.5 ? '3704' : '3705';
    const suffix = Math.floor(100000 + Math.random() * 900000);
    return `${prefix}${suffix}`;
  };

  // Limits
  const [memoryLimit, setMemoryLimit] = useState('2.5g');
  const [cpuLimit, setCpuLimit] = useState('0-3');

  // Location
  const [latitude, setLatitude] = useState(-34.603722);
  const [longitude, setLongitude] = useState(-58.381592);
  const [altitude] = useState(25.0);
  const [city, setCity] = useState('Buenos Aires');
  const [timezone, setTimezone] = useState('America/Argentina/Buenos_Aires');

  // Catalogs
  const [templates, setTemplates] = useState<Record<string, TemplateItem[]>>({});
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [customLocations, setCustomLocations] = useState<CustomLocation[]>([]);
  const [selectedCustomLoc, setSelectedCustomLoc] = useState<CustomLocation | null>(null);
  const [pinnedPresets, setPinnedPresets] = useState<string[]>([]);
  const [defaultLocData, setDefaultLocData] = useState<any>(null);
  const [locationPresets, setLocationPresets] = useState<Record<string, any>>({});

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
      setSelectedCustomLoc(null);

      // Calcular siguiente puerto libre
      let nextPort = 5580;
      while (existingPorts.includes(nextPort)) {
        nextPort += 2;
      }
      setPort(nextPort);
      setName(`phone-${String(nextPort).slice(-2)}`);
      setPhoneNumber(generateFormosaNumber());

      if (presetModel) {
        setSelectedModel(presetModel);
        const b = presetModel.split('/')[0];
        if (b) setSelectedBrand(b);
      }

      // Cargar catálogos
      const handleCatalogData = (locCatalog: any, locPresets: any) => {
        setCustomLocations(locCatalog.locations || []);
        setPinnedPresets(locCatalog.pinned_presets || []);
        setDefaultLocData(locCatalog.default_location || null);
        setLocationPresets(locPresets || {});

        if (locCatalog.default_location) {
          setLatitude(locCatalog.default_location.latitude);
          setLongitude(locCatalog.default_location.longitude);
          setCity(locCatalog.default_location.city);
          if (locCatalog.default_location.timezone) {
            setTimezone(locCatalog.default_location.timezone);
          }
          const found = (locCatalog.locations || []).find((l: any) => l.id === locCatalog.default_location?.id);
          if (found) setSelectedCustomLoc(found);
        }
      };

      if (Object.keys(templates).length === 0) {
        setLoading(true);
        Promise.all([
          api.getTemplates(),
          api.getCarriers(),
          api.getCustomLocations(),
          api.getLocationPresets().catch(() => ({})),
        ])
          .then(([tData, cData, locCatalog, locPresets]) => {
            setTemplates(tData);
            setCarriers(cData);
            handleCatalogData(locCatalog, locPresets);
          })
          .catch((err: any) => {
            setErrorMessage(err.message || 'Error al cargar catálogos del servidor');
          })
          .finally(() => setLoading(false));
      } else {
        Promise.all([
          api.getCustomLocations(),
          api.getLocationPresets().catch(() => ({})),
        ])
          .then(([locCatalog, locPresets]) => {
            handleCatalogData(locCatalog, locPresets);
          })
          .catch(() => {});
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

  const currentStepIndex = STEPS.findIndex((s) => s.id === activeStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const goNext = () => {
    if (!isLastStep) setActiveStep(STEPS[currentStepIndex + 1].id);
  };
  const goPrev = () => {
    if (!isFirstStep) setActiveStep(STEPS[currentStepIndex - 1].id);
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
        phone_number: phoneNumber.trim() || undefined,
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
          custom_name: selectedCustomLoc ? selectedCustomLoc.name : undefined,
          custom_location_id: selectedCustomLoc ? selectedCustomLoc.id : undefined,
        },
      };

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

  const mapMarkers = useMemo<MapPinItem[]>(() => {
    return (customLocations || [])
      .filter((loc) => loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number' && !isNaN(loc.latitude) && !isNaN(loc.longitude))
      .map((loc) => ({
        id: loc.id,
        name: loc.name || 'Ubicación',
        city: loc.city || '',
        lat: Number(loc.latitude),
        lon: Number(loc.longitude),
        isDefault: defaultLocData?.id === loc.id,
        color: loc.is_pinned ? '#f59e0b' : '#10b981',
      }));
  }, [customLocations, defaultLocData]);

  const pinnedItems = useMemo(() => {
    const items: Array<{
      id: string;
      name: string;
      city: string;
      lat: number;
      lon: number;
      timezone?: string;
      isDefault?: boolean;
      isCustom: boolean;
    }> = [];
    const seenIds = new Set<string>();

    // 1. Ubicaciones personalizadas fijadas con pin (is_pinned: true)
    (customLocations || []).filter((l) => l.is_pinned).forEach((loc) => {
      seenIds.add(loc.id);
      items.push({
        id: loc.id,
        name: loc.name,
        city: loc.city,
        lat: Number(loc.latitude),
        lon: Number(loc.longitude),
        timezone: loc.timezone,
        isDefault: defaultLocData?.id === loc.id,
        isCustom: true,
      });
    });

    // 2. Si default_location no está en la lista de pines, incluirla al inicio
    if (defaultLocData && defaultLocData.id && !seenIds.has(defaultLocData.id)) {
      seenIds.add(defaultLocData.id);
      items.unshift({
        id: defaultLocData.id,
        name: defaultLocData.name || defaultLocData.city || 'Predeterminada',
        city: defaultLocData.city || defaultLocData.name || '',
        lat: Number(defaultLocData.latitude),
        lon: Number(defaultLocData.longitude),
        timezone: defaultLocData.timezone,
        isDefault: true,
        isCustom: defaultLocData.target_type === 'custom' || String(defaultLocData.id).startsWith('loc_'),
      });
    }

    // 3. Presets oficiales fijados por el usuario
    (pinnedPresets || []).forEach((key) => {
      if (!seenIds.has(key)) {
        seenIds.add(key);
        const p = getPresetDisplay(key, locationPresets);
        if (p && typeof p.latitude === 'number' && typeof p.longitude === 'number' && !isNaN(p.latitude) && !isNaN(p.longitude)) {
          items.push({
            id: key,
            name: p.name,
            city: p.city,
            lat: p.latitude,
            lon: p.longitude,
            timezone: p.timezone,
            isDefault: defaultLocData?.target_type === 'preset' && defaultLocData?.id === key,
            isCustom: false,
          });
        }
      }
    });

    // 4. Si aún no hay pines configurados, mostrar las ubicaciones personalizadas existentes
    if (items.length === 0 && (customLocations || []).length > 0) {
      customLocations.forEach((loc) => {
        items.push({
          id: loc.id,
          name: loc.name,
          city: loc.city,
          lat: Number(loc.latitude),
          lon: Number(loc.longitude),
          timezone: loc.timezone,
          isDefault: false,
          isCustom: true,
        });
      });
    }

    return items;
  }, [customLocations, pinnedPresets, defaultLocData, locationPresets]);

  const brands = Object.keys(templates);
  const currentBrandModels = templates[selectedBrand] || [];

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in-0 duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-sm border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera Técnica */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center rounded-sm border border-primary/40 bg-primary/20 text-foreground font-mono">
              <Smartphone className="h-3.5 w-3.5" />
            </div>
            <div>
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">Crear Nuevo CloudPhone</h2>
              <p className="font-mono text-[11px] text-muted-foreground">
                Configura hardware, operadora SIM, geolocalización y límites
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-sm border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
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
                    ? 'border-primary text-primary bg-emerald-500/10 font-semibold'
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
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-md text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
              <div className="flex-1 font-mono">{errorMessage}</div>
              <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-300">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2 font-mono">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
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
                  {/* Fila: Nombre, Puerto ADB, Operadora y Línea Móvil */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                      <span className={cn('text-[10px] mt-1 block', existingPorts.includes(port) ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-muted-foreground')}>
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
                        {carriers.map((c) => {
                          const country = COUNTRY_NAMES[c.country_iso.toLowerCase()] || c.country_iso.toUpperCase();
                          return (
                            <option key={c.id} value={c.id}>
                              {c.carrier_name} ({country})
                            </option>
                          );
                        })}
                      </select>
                      <span className="text-[10px] text-muted-foreground mt-1 block">Red móvil y telemetría oficial</span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-foreground">
                          Línea Móvil (SIM)
                        </label>
                        <button
                          type="button"
                          onClick={() => setPhoneNumber(generateFormosaNumber())}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition-colors"
                          title="Generar nuevo número con prefijo Formosa (3704 / 3705)"
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>Generar</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9+]/g, ''))}
                        className="w-full h-8.5 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="ej: 3704123456"
                      />
                      <span className="text-[10px] text-muted-foreground mt-1 block">Formosa (3704/3705) o manual</span>
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
                                ? 'bg-emerald-500/15 border-primary text-emerald-600 dark:text-emerald-400 font-bold'
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
                                  ? 'bg-emerald-500/10 border-primary text-foreground'
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
                        <span>Geolocalización GPS & Pines</span>
                      </label>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {selectedCustomLoc ? (
                          <span className="text-primary font-semibold mr-1">📍 {selectedCustomLoc.name} ·</span>
                        ) : null}
                        {city} · {latitude.toFixed(4)}, {longitude.toFixed(4)}
                      </span>
                    </div>

                    {/* Barra de Pines Rápidos Configuradas por el Usuario */}
                    {pinnedItems.length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0 flex items-center gap-1 font-semibold">
                          <Pin className="h-3 w-3 text-amber-500 fill-amber-500" />
                          Pines:
                        </span>
                        {pinnedItems.map((pin) => {
                          const isSel =
                            (selectedCustomLoc?.id && selectedCustomLoc.id === pin.id) ||
                            (!selectedCustomLoc &&
                              Math.abs(latitude - pin.lat) < 0.001 &&
                              Math.abs(longitude - pin.lon) < 0.001);
                          return (
                            <button
                              key={pin.id}
                              type="button"
                              onClick={() => {
                                setLatitude(pin.lat);
                                setLongitude(pin.lon);
                                setCity(pin.city);
                                if (pin.timezone) setTimezone(pin.timezone);
                                if (pin.isCustom) {
                                  const found = customLocations.find((l) => l.id === pin.id);
                                  setSelectedCustomLoc(found || null);
                                } else {
                                  setSelectedCustomLoc(null);
                                }
                              }}
                              className={cn(
                                'rounded px-2 py-0.5 text-[10px] font-mono shrink-0 transition-colors border flex items-center gap-1',
                                isSel
                                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs'
                                  : 'bg-background text-muted-foreground border-border hover:text-foreground hover:bg-accent'
                              )}
                            >
                              {pin.isDefault && <span className="text-[9px] text-amber-500">⭐</span>}
                              <span>{pin.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <MapPicker
                      latitude={latitude}
                      longitude={longitude}
                      city={city}
                      onChange={(lat, lon, newCity) => {
                        setLatitude(lat);
                        setLongitude(lon);
                        const matched = customLocations.find(
                          (l) => Math.abs(l.latitude - lat) < 0.0001 && Math.abs(l.longitude - lon) < 0.0001
                        );
                        if (matched) {
                          setSelectedCustomLoc(matched);
                          setCity(matched.city);
                          if (matched.timezone) setTimezone(matched.timezone);
                        } else {
                          setSelectedCustomLoc(null);
                          if (newCity) setCity(newCity);
                          else setCity(`Coordenadas (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
                        }
                      }}
                      markers={mapMarkers}
                      height="210px"
                      showPresets={false}
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

                  {/* Red USB & Cuarentena en T=0 (NET-USB-001) */}
                  <div className="space-y-1.5 pt-2 border-t border-border/60">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <Usb className="h-4 w-4 text-primary" />
                      <span>Protección de Red: Cuarentena en T=0</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      El CloudPhone arrancará aislado del host en la cadena DOCKER-USER. Las apps no tendrán salida a Internet hasta reclamar un módem USB físico en el Centro de Red. El streaming táctil y ADB permanecen siempre activos en la red local.
                    </p>
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
                                ? 'bg-emerald-500/15 border-primary text-emerald-600 dark:text-emerald-400 font-bold'
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
                                ? 'bg-emerald-500/15 border-primary text-emerald-600 dark:text-emerald-400 font-bold'
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
                        <span className="text-foreground">
                          {carriers.find((c) => c.id === selectedCarrier)?.carrier_name || selectedCarrier}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-border/30 py-1">
                        <span className="text-muted-foreground">Línea Telefónica:</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {phoneNumber ? (phoneNumber.startsWith('+') ? phoneNumber : `+549${phoneNumber}`) : 'Automática (Formosa)'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-border/30 py-1">
                        <span className="text-muted-foreground">Recursos:</span>
                        <span className="text-foreground">{memoryLimit.toUpperCase()} RAM · CPU {cpuLimit}</span>
                      </div>
                      <div className="flex justify-between border-b border-border/30 py-1">
                        <span className="text-muted-foreground">GPS / Ciudad:</span>
                        <span className="text-foreground">{city} ({latitude.toFixed(2)}, {longitude.toFixed(2)})</span>
                      </div>
                      <div className="flex justify-between border-b border-border/30 py-1">
                        <span className="text-muted-foreground">Red / Aislamiento:</span>
                        <span className="text-foreground">Cuarentena T=0 (Módem USB)</span>
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
