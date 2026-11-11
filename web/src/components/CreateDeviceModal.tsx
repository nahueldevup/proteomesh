import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { api } from '../lib/api';
import { useLocationsCatalog, useLocationPresets, EMPTY_PRESETS } from '../lib/queries';
import type { MapPinItem } from './MapPicker';
import { getPresetDisplay } from '../lib/locations';
import type {
  TemplateItem,
  Carrier,
  CustomLocation,
  CreateInstancePayload,
} from '../types';
import { cn, getErrorMessage } from '../lib/utils';
import {
  STEPS,
  type StepId,
  type PinnedItem,
} from './create-wizard/wizardTypes';
import { StepDeviceSim } from './create-wizard/StepDeviceSim';
import { StepGpsProxy } from './create-wizard/StepGpsProxy';
import { StepResourcesSummary } from './create-wizard/StepResourcesSummary';

interface CreateDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingPorts: number[];
  presetModel?: string;
}

const EMPTY_LOCATIONS: CustomLocation[] = [];
const EMPTY_PINNED: string[] = [];

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
  const [startImmediately, setStartImmediately] = useState(true);

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

  // Catalogs via TanStack Query (shared cache)
  const { data: locCatalog } = useLocationsCatalog({ enabled: isOpen });
  const { data: locPresets = EMPTY_PRESETS } = useLocationPresets({ enabled: isOpen });

  const customLocations = locCatalog?.locations ?? EMPTY_LOCATIONS;
  const pinnedPresets = locCatalog?.pinned_presets ?? EMPTY_PINNED;
  const defaultLocData = locCatalog?.default_location ?? null;
  const locationPresets = locPresets;

  const [templates, setTemplates] = useState<Record<string, TemplateItem[]>>({});
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [selectedCustomLoc, setSelectedCustomLoc] = useState<CustomLocation | null>(null);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Prevención de reinicio: Inicializar SOLO una vez al pasar de cerrado a abierto
  const prevIsOpenRef = useRef(false);
  const [defaultLocationApplied, setDefaultLocationApplied] = useState(false);

  // Inicialización de ubicación predeterminada en render (sin sincronización forzada en efecto)
  if (isOpen && locCatalog?.default_location && !defaultLocationApplied) {
    setDefaultLocationApplied(true);
    const def = locCatalog.default_location;
    setLatitude(def.latitude);
    setLongitude(def.longitude);
    setCity(def.city);
    if (def.timezone) {
      setTimezone(def.timezone);
    }
    const found = (locCatalog.locations || []).find((l: CustomLocation) => l.id === def.id);
    if (found) setSelectedCustomLoc(found);
  }
  if (!isOpen && defaultLocationApplied) {
    setDefaultLocationApplied(false);
  }

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

      if (Object.keys(templates).length === 0) {
        setLoading(true);
        Promise.all([api.getTemplates(), api.getCarriers()])
          .then(([tData, cData]) => {
            setTemplates(tData);
            setCarriers(cData);
          })
          .catch((err) => {
            setErrorMessage(getErrorMessage(err) || 'Error al cargar catálogos del servidor');
          })
          .finally(() => setLoading(false));
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, existingPorts, presetModel, templates]);

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
      const payload: CreateInstancePayload = {
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
    } catch (err) {
      setErrorMessage(getErrorMessage(err) || 'Error al aprovisionar el CloudPhone');
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

  const pinnedItems = useMemo<PinnedItem[]>(() => {
    const items: PinnedItem[] = [];
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

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-sm animate-in fade-in-0 duration-150" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[99999] w-[calc(100%-2rem)] max-w-4xl max-h-[92vh] -translate-x-1/2 -translate-y-1/2 flex flex-col rounded-sm border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 focus:outline-none"
        >
          {/* Cabecera Técnica */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="grid h-7 w-7 place-items-center rounded-sm border border-primary/40 bg-primary/20 text-foreground font-mono">
                <Smartphone className="h-3.5 w-3.5" />
              </div>
              <div>
                <Dialog.Title asChild>
                  <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">Crear Nuevo CloudPhone</h2>
                </Dialog.Title>
                <p className="font-mono text-[11px] text-muted-foreground">
                  Configura hardware, operadora SIM, geolocalización y límites
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-7 w-7 place-items-center rounded-sm border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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
                    'flex items-center gap-2 py-2.5 px-3.5 text-xs font-mono font-medium border-b-2 transition-all shrink-0 cursor-pointer',
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
                  <StepDeviceSim
                    name={name}
                    setName={setName}
                    port={port}
                    setPort={setPort}
                    existingPorts={existingPorts}
                    selectedCarrier={selectedCarrier}
                    setSelectedCarrier={setSelectedCarrier}
                    carriers={carriers}
                    phoneNumber={phoneNumber}
                    setPhoneNumber={setPhoneNumber}
                    onGeneratePhoneNumber={() => setPhoneNumber(generateFormosaNumber())}
                    brands={brands}
                    selectedBrand={selectedBrand}
                    onSelectBrand={(brand) => {
                      setSelectedBrand(brand);
                      const firstModel = templates[brand]?.[0]?.id;
                      if (firstModel) setSelectedModel(firstModel);
                    }}
                    selectedModel={selectedModel}
                    onSelectModel={setSelectedModel}
                    currentBrandModels={currentBrandModels}
                  />
                )}

                {/* ── PASO 2: GEOLOCALIZACIÓN GPS & PROXY RESIDENCIAL ─────────────── */}
                {activeStep === 'location' && (
                  <StepGpsProxy
                    city={city}
                    setCity={setCity}
                    latitude={latitude}
                    setLatitude={setLatitude}
                    longitude={longitude}
                    setLongitude={setLongitude}
                    setTimezone={setTimezone}
                    selectedCustomLoc={selectedCustomLoc}
                    setSelectedCustomLoc={setSelectedCustomLoc}
                    pinnedItems={pinnedItems}
                    customLocations={customLocations}
                    mapMarkers={mapMarkers}
                  />
                )}

                {/* ── PASO 3: RECURSOS & RESUMEN DETERMINISTA ──────────────────────── */}
                {activeStep === 'review' && (
                  <StepResourcesSummary
                    memoryLimit={memoryLimit}
                    setMemoryLimit={setMemoryLimit}
                    cpuLimit={cpuLimit}
                    setCpuLimit={setCpuLimit}
                    startImmediately={startImmediately}
                    setStartImmediately={setStartImmediately}
                    name={name}
                    port={port}
                    selectedModel={selectedModel}
                    selectedCarrier={selectedCarrier}
                    carriers={carriers}
                    phoneNumber={phoneNumber}
                    city={city}
                    latitude={latitude}
                    longitude={longitude}
                  />
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
                className="h-8 px-3 rounded-md border border-border bg-background text-xs font-mono font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-30 flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
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
                className="h-8 px-3.5 rounded-md border border-border bg-background text-xs font-mono font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              {isLastStep ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !name.trim() || existingPorts.includes(port)}
                  className="flex h-8 items-center gap-2 rounded-md bg-primary px-4 font-sans text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 shadow-sm shadow-primary/20 cursor-pointer disabled:cursor-not-allowed"
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
                  className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-4 font-sans text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-sm shadow-primary/20 cursor-pointer"
                >
                  <span>Siguiente</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
