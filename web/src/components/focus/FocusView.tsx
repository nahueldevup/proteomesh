import { useEffect, useState, useCallback, useMemo, useRef, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useLocationsCatalog, EMPTY_CATALOG } from '../../lib/queries';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  ExternalLink,
  MapPin,
  CheckCircle2,
  Sun,
  Moon,
  Monitor,
  Zap,
  Usb,
  Camera,
} from 'lucide-react';
import type {
  Instance,
  CustomLocation,
  LocationGroup,
  CustomLocationsCatalog,
  LocationData,
} from '../../types';
import { api } from '../../lib/api';
import { IconBtn } from '../ui/IconBtn';
import { InteractiveScreen } from './InteractiveScreen';
import { ScrcpyLiveScreen } from '../farm/ScrcpyLiveScreen';
import { DeviceControlRail } from '../grid/DeviceControlRail';
import { getPresetDisplay } from '../../lib/locations';
import { toast } from 'sonner';
import { cn, getErrorMessage } from '../../lib/utils';
import { useFps } from '../../lib/scrcpy/useFps';
import { useExclusivePopover } from '../../lib/useExclusivePopover';
import { FocusMetadataGrid } from './FocusMetadataGrid';
import { FocusGpsTab } from './FocusGpsTab';
import { FocusProxyTab } from './FocusProxyTab';
import { FocusHealthTab } from './FocusHealthTab';

interface FocusViewProps {
  instance: Instance | null;
  instances: Instance[];
  onBack: () => void;
  onSelectInstance: (name: string) => void;
  groupInstances: string[];
  groupMode: boolean;
  onChanged: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  locationPresets?: Record<string, LocationData>;
  onOpenFilesManager?: (instanceName: string) => void;
}

type SubTab = 'gps' | 'network' | 'health';

function StreamFpsLabel({ adbPort }: { adbPort: number }) {
  const fps = useFps(adbPort);
  return <span>{fps} FPS</span>;
}

export default function FocusView({
  instance,
  instances,
  onBack,
  onSelectInstance,
  groupInstances: _groupInstances = [],
  groupMode: _groupMode = false,
  onChanged,
  theme,
  onToggleTheme,
  locationPresets,
  onOpenFilesManager,
}: FocusViewProps) {
  const [activeTab, setActiveTab] = useState<SubTab>('gps');

  // Map & Custom Location state
  const [mapLat, setMapLat] = useState(-34.603722);
  const [mapLon, setMapLon] = useState(-58.381592);
  const [mapCity, setMapCity] = useState('Buenos Aires');
  const [mapBusy, setMapBusy] = useState(false);

  // Catálogo de Ubicaciones Custom & Pins (compartido via TanStack Query)
  const { data: customCatalog = EMPTY_CATALOG } = useLocationsCatalog();
  const [selectedCustomLoc, setSelectedCustomLoc] = useState<CustomLocation | null>(null);
  const geoPrefix = `focus-geo:${instance?.instance_name ?? 'none'}`;
  const customSelectorPopover = useExclusivePopover(`${geoPrefix}:custom-selector`);
  const [customSearchQuery, setCustomSearchQuery] = useState('');
  const saveCustomPopover = useExclusivePopover(`${geoPrefix}:save-custom`);
  const [customNameInput, setCustomNameInput] = useState('');
  const [customGroupInput, setCustomGroupInput] = useState('');
  const [saveCustomIsPinned, setSaveCustomIsPinned] = useState(true);
  const [savingCustom, setSavingCustom] = useState(false);
  const lastLoadedInstanceNameRef = useRef<string | null>(null);

  // Búsqueda y filtrado de ubicaciones custom en selector
  const filteredCustomLocations = useMemo<CustomLocation[]>(() => {
    const q = customSearchQuery.trim().toLowerCase();
    if (!q) return customCatalog.locations;
    return customCatalog.locations.filter((loc: CustomLocation) => {
      const matchName = loc.name.toLowerCase().includes(q);
      const matchCity = loc.city.toLowerCase().includes(q);
      const grp = loc.group_id ? customCatalog.groups.find((g: LocationGroup) => g.id === loc.group_id) : null;
      const matchGroup = grp ? grp.name.toLowerCase().includes(q) : false;
      return matchName || matchCity || matchGroup;
    });
  }, [customCatalog.locations, customCatalog.groups, customSearchQuery]);

  // Lista de accesos rápidos fijados para FocusView
  const pinnedCustomLocations = useMemo<CustomLocation[]>(() => {
    return customCatalog.locations.filter((loc: CustomLocation) => loc.is_pinned);
  }, [customCatalog.locations]);

  const pinnedPresetsList = useMemo(() => {
    const list = customCatalog.pinned_presets || ['ba', 'sao-paulo', 'miami', 'new-york'];
    return list.map((key) => getPresetDisplay(key, locationPresets));
  }, [customCatalog.pinned_presets, locationPresets]);

  // Network / USB state (NET-USB-001)
  const queryClient = useQueryClient();
  const instanceName = instance?.instance_name;
  const { data: networkState = null } = useQuery({
    queryKey: queryKeys.networkState(instanceName),
    queryFn: () => api.getInstanceUsbNetworkState(instanceName!),
    enabled: Boolean(instanceName),
    refetchInterval: 5000,
  });
  const fetchNetworkState = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.networkState(instanceName) }),
    [queryClient, instanceName]
  );

  const [networkBusy, setNetworkBusy] = useState(false);

  // Health state
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthReport, setHealthReport] = useState<{ ok: boolean; reports: string[] } | null>(null);

  const [streamMode, setStreamMode] = useState<'scrcpy' | 'canvas'>('scrcpy');

  useEffect(() => {
    if (!instance) return;
    // Solo sincronizar automáticamente cuando cambia de contenedor seleccionado (evita que el polling de 5s resetee la selección del usuario)
    if (lastLoadedInstanceNameRef.current !== instance.instance_name) {
      lastLoadedInstanceNameRef.current = instance.instance_name;

      if (instance.location) {
        setMapLat(instance.location.latitude);
        setMapLon(instance.location.longitude);
        setMapCity(instance.location.city || customCatalog.default_location?.city || 'Buenos Aires');

        if (instance.location.custom_location_id) {
          const found = customCatalog.locations.find((l) => l.id === instance.location?.custom_location_id);
          if (found) setSelectedCustomLoc(found);
          else setSelectedCustomLoc(null);
        } else if (instance.location.custom_name) {
          const found = customCatalog.locations.find((l) => l.name === instance.location?.custom_name);
          if (found) setSelectedCustomLoc(found);
          else setSelectedCustomLoc(null);
        } else {
          setSelectedCustomLoc(null);
        }
      } else if (customCatalog.default_location) {
        setMapLat(customCatalog.default_location.latitude);
        setMapLon(customCatalog.default_location.longitude);
        setMapCity(customCatalog.default_location.city);
        setSelectedCustomLoc(null);
      }
    }
  }, [instance, customCatalog.locations, customCatalog.default_location]);

  // Estado del streaming ws-scrcpy: se consulta hasta que esté disponible
  const supportsWebCodecs = typeof window !== 'undefined' && 'VideoDecoder' in window;
  const streamPlayer = supportsWebCodecs ? 'webcodecs' : 'mse';
  const { data: streamData } = useQuery({
    queryKey: queryKeys.streamInfo(instanceName, streamPlayer),
    queryFn: () => api.getStreamInfo(instanceName!, streamPlayer),
    enabled: Boolean(instanceName) && Boolean(instance?.running),
    refetchInterval: (query) => (query.state.data?.available ? false : 4000),
    retry: false,
  });
  const streamInfo = instance?.running ? streamData : undefined;

  if (!instance) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <Smartphone size={40} className="text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Teléfono no encontrado</p>
        <button
          onClick={onBack}
          className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-accent text-foreground"
        >
          Volver
        </button>
      </div>
    );
  }

  const currentIndex = instances.findIndex((i) => i.instance_name === instance.instance_name);
  const handleNavigate = (delta: number) => {
    if (instances.length === 0) return;
    const nextIndex = (currentIndex + delta + instances.length) % instances.length;
    const nextInst = instances[nextIndex];
    if (nextInst) onSelectInstance(nextInst.instance_name);
  };

  const nativeWidth = Number(instance.display?.width) || 1080;
  const nativeHeight = Number(instance.display?.height) || 2340;

  const handleLaunchNativeScrcpy = async () => {
    if (!instance) return;
    try {
      const res = await api.launchScrcpy(instance.instance_name);
      if (res.status === 'success' || res.status === 'ok') {
        toast.success(res.message || 'Scrcpy nativo iniciado');
      } else {
        toast.error(res.message || 'No se pudo iniciar scrcpy');
      }
    } catch (err) {
      toast.error(`Fallo al lanzar scrcpy: ${getErrorMessage(err)}`);
    }
  };

  const handleSaveGps = async () => {
    if (!instance) return;
    setMapBusy(true);
    const displayName = selectedCustomLoc ? selectedCustomLoc.name : mapCity;
    const toastId = toast.loading(`Actualizando GPS a ${displayName}...`);
    try {
      await api.setInstanceLocation(instance.instance_name, {
        latitude: mapLat,
        longitude: mapLon,
        city: mapCity,
        altitude: selectedCustomLoc?.altitude ?? 25.0,
        custom_name: selectedCustomLoc ? selectedCustomLoc.name : undefined,
        custom_location_id: selectedCustomLoc ? selectedCustomLoc.id : undefined,
      });
      toast.success(`GPS actualizado: ${displayName}`, { id: toastId });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? getErrorMessage(e) : 'Error al guardar ubicación', { id: toastId });
    } finally {
      setMapBusy(false);
    }
  };

  const handleCreateCustomLocationHere = async (e: FormEvent) => {
    e.preventDefault();
    if (!customNameInput.trim()) {
      toast.error('Ingresa un nombre para la ubicación');
      return;
    }
    setSavingCustom(true);
    try {
      const created = await api.createCustomLocation({
        name: customNameInput.trim(),
        group_id: customGroupInput || undefined,
        city: mapCity,
        latitude: mapLat,
        longitude: mapLon,
        altitude: 25.0,
        is_pinned: saveCustomIsPinned,
      });
      toast.success(
        saveCustomIsPinned
          ? `Ubicación "${created.name}" guardada y fijada en barra rápida`
          : `Ubicación "${created.name}" guardada en Custom`
      );
      setCustomNameInput('');
      saveCustomPopover.onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
      setSelectedCustomLoc(created);
    } catch (err) {
      toast.error(`Error al guardar: ${getErrorMessage(err)}`);
    } finally {
      setSavingCustom(false);
    }
  };

  const handleTogglePinLocation = async (loc: CustomLocation) => {
    try {
      await api.togglePin('custom', loc.id, !loc.is_pinned);
      queryClient.setQueryData<CustomLocationsCatalog>(
        queryKeys.locationsCatalog,
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            locations: prev.locations.map((l) =>
              l.id === loc.id ? { ...l, is_pinned: !loc.is_pinned } : l
            ),
          };
        }
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
      toast.success(
        !loc.is_pinned
          ? `"${loc.name}" fijada en accesos rápidos`
          : `"${loc.name}" desfijada de accesos rápidos`
      );
    } catch (err) {
      toast.error(`Error: ${getErrorMessage(err)}`);
    }
  };

  const handleQuarantine = async () => {
    if (!instance) return;
    setNetworkBusy(true);
    const toastId = toast.loading('Poniendo en cuarentena y liberando módem...');
    try {
      await api.quarantineInstance(instance.instance_name);
      toast.success('Instancia en cuarentena segura (ADB y scrcpy activos)', { id: toastId });
      await fetchNetworkState();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? getErrorMessage(err) : 'Error al aislar instancia', { id: toastId });
    } finally {
      setNetworkBusy(false);
    }
  };

  const handleClaimUsb = async () => {
    if (!instance) return;
    setNetworkBusy(true);
    const toastId = toast.loading('Reclamando conexión de módem USB...');
    try {
      const res = await api.claimUsb(instance.instance_name);
      if (res.status === 'waiting') {
        toast.info(res.message || 'Instancia en cola FIFO de espera', { id: toastId });
      } else {
        toast.success(`Conexión USB activa · IP: ${res.public_ip}`, { id: toastId });
      }
      await fetchNetworkState();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? getErrorMessage(err) : 'Fallo al reclamar módem USB', { id: toastId });
    } finally {
      setNetworkBusy(false);
    }
  };

  const handleRotateIp = async () => {
    if (!instance) return;
    setNetworkBusy(true);
    const toastId = toast.loading('Rotando IP móvil vía Modo Avión (ADB)...');
    try {
      const res = await api.rotateInstanceIp(instance.instance_name);
      toast.success(`Nueva IP móvil obtenida: ${res.new_ip}`, { id: toastId });
      await fetchNetworkState();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? getErrorMessage(err) : 'Error al rotar IP', { id: toastId });
    } finally {
      setNetworkBusy(false);
    }
  };

  const handleCheckHealth = async () => {
    setHealthChecking(true);
    try {
      const h = await api.getHealth(instance.instance_name);
      setHealthReport(h);
      if (h.ok) toast.success('Todas las verificaciones de integridad pasaron (100/100)');
      else toast.warning('Se detectaron advertencias de root o integridad');
    } catch (e) {
      toast.error(e instanceof Error ? getErrorMessage(e) : 'Error al verificar salud');
    } finally {
      setHealthChecking(false);
    }
  };

  const modelRaw = instance.template || '';
  const modelName = modelRaw
    ? modelRaw
        .replace(/^templates\//, '')
        .replace(/\.json$/, '')
        .split('/')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ')
    : '—';

  return (
    <div className="flex h-full min-h-0 flex-col bg-background select-none">
      {/* ── CABECERA SUPERIOR (IDÉNTICA A LOVABLE) ─────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 bg-background">
        <button
          onClick={onBack}
          aria-label="Volver"
          className="grid h-8 w-8 place-items-center rounded-md hover:bg-accent text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <IconBtn icon={ChevronLeft} label="Anterior" onClick={() => handleNavigate(-1)} />
        <IconBtn icon={ChevronRight} label="Siguiente" onClick={() => handleNavigate(1)} />
        <span className="font-mono font-bold text-foreground text-sm">{instance.instance_name}</span>
        <span className="text-xs md:text-sm text-muted-foreground flex items-center gap-1">
          {instance.location?.custom_name ? (
            <>
              <span className="font-semibold text-primary">{instance.location.custom_name}</span>
              <span className="text-[11px] text-muted-foreground">({instance.location.city})</span>
            </>
          ) : (
            instance.location?.city ?? 'Sin GPS'
          )}
        </span>

        {/* Selector de Modo de Streaming (30 FPS Ultra-Baja Latencia vs Fallback HD) */}
        <div className="ml-auto flex items-center gap-2">
          {instance.running && (
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 text-xs font-mono">
              <button
                type="button"
                onClick={() => setStreamMode('scrcpy')}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors cursor-pointer',
                  streamMode === 'scrcpy'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Streaming Scrcpy nativo (~20ms baja latencia a 30 FPS)"
              >
                <Zap className="h-3 w-3" />
                <StreamFpsLabel adbPort={instance.adb_port} />
              </button>
              <button
                type="button"
                onClick={() => setStreamMode('canvas')}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors cursor-pointer',
                  streamMode === 'canvas'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Modo Captura Continua (Fallback HD)"
              >
                <Camera className="h-3 w-3" />
                <span>HD</span>
              </button>
            </div>
          )}

          {instance.running && (
            <IconBtn
              icon={Monitor}
              label="Lanzar Scrcpy de escritorio"
              onClick={handleLaunchNativeScrcpy}
            />
          )}

          {streamInfo?.available && (
            <IconBtn
              icon={ExternalLink}
              label="Abrir scrcpy web en pestaña"
              onClick={() => window.open(streamInfo.embed_url, '_blank', 'noopener,noreferrer')}
            />
          )}

          {onToggleTheme && (
            <IconBtn
              icon={theme === 'dark' ? Sun : Moon}
              label={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
              onClick={onToggleTheme}
            />
          )}
        </div>
      </header>

      {/* ── CUERPO DE LA VISTA ENFOCADA (DISTRIBUCIÓN EXACTA DE LOVABLE) ────── */}
      <div className="flex min-h-0 flex-1 gap-4 p-4 overflow-hidden">
        {/* Columna Izquierda: Celular con Bisel Exacto + Cápsula Vertical Única */}
        <div className="flex h-full items-center gap-2">
          {/* Bisel del Smartphone con Pantalla Interactiva Táctil */}
          <div className="h-full rounded-sm bg-bezel p-1 border border-border flex items-center justify-center">
            <div
              style={{ aspectRatio: `${nativeWidth} / ${nativeHeight}` }}
              className="relative h-full overflow-hidden rounded-xs bg-black border border-border/40 select-none flex flex-col"
            >
              {instance.running ? (
                streamMode === 'scrcpy' ? (
                  <ScrcpyLiveScreen
                    key={instance.instance_name}
                    instance={instance}
                    isFocused={true}
                    onReleaseFocus={() => {}}
                    className="relative h-full w-full"
                  />
                ) : (
                  <InteractiveScreen
                    instance={instance}
                    onActionFeedback={(msg) => toast.info(msg, { duration: 1500 })}
                  />
                )
              ) : (
                <InteractiveScreen
                  instance={instance}
                  onActionFeedback={(msg) => toast.info(msg, { duration: 1500 })}
                />
              )}
            </div>
          </div>

          {/* Barra vertical unificada de control */}
          <DeviceControlRail
            mode="focus"
            instance={instance}
            networkState={networkState}
            onBack={onBack}
            onChanged={onChanged}
            onNetworkChange={fetchNetworkState}
            onOpenFilesManager={onOpenFilesManager}
          />
        </div>

        {/* Columna Derecha: Tarjeta de Metadatos + Módulos Interactivos */}
        <div className="min-w-0 flex-1 flex flex-col gap-2.5 h-full overflow-hidden">
          {/* Tarjeta de Metadatos (Distribución compacta en 2 columnas) */}
          <FocusMetadataGrid
            instance={instance}
            modelName={modelName}
            networkState={networkState}
          />

          {/* Tarjeta de Módulos Interactivos (Mapa GPS, Proxy, Salud) */}
          <div className="flex-1 min-h-0 flex flex-col rounded-sm border border-border bg-card p-3 overflow-hidden">
            {/* Cabecera de Pestañas del Módulo */}
            <div role="tablist" className="flex items-center gap-1 border-b border-border pb-2 shrink-0">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'gps'}
                onClick={() => setActiveTab('gps')}
                className={cn(
                  'flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-mono font-medium transition-colors cursor-pointer',
                  activeTab === 'gps'
                    ? 'bg-muted text-foreground font-bold border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <MapPin className="h-3 w-3 text-primary" />
                <span>Geolocalización GPS</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'network'}
                onClick={() => setActiveTab('network')}
                className={cn(
                  'flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-mono font-medium transition-colors cursor-pointer',
                  activeTab === 'network'
                    ? 'bg-muted text-foreground font-bold border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Usb className="h-3 w-3 text-primary" />
                <span>Red USB & Cuarentena</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'health'}
                onClick={() => setActiveTab('health')}
                className={cn(
                  'flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-mono font-medium transition-colors cursor-pointer',
                  activeTab === 'health'
                    ? 'bg-muted text-foreground font-bold border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <CheckCircle2 className="h-3 w-3 text-primary" />
                <span>Salud & Antifraude</span>
              </button>
            </div>

            {/* Contenido: Tab GPS */}
            {activeTab === 'gps' && (
              <FocusGpsTab
                mapLat={mapLat}
                setMapLat={setMapLat}
                mapLon={mapLon}
                setMapLon={setMapLon}
                mapCity={mapCity}
                setMapCity={setMapCity}
                mapBusy={mapBusy}
                selectedCustomLoc={selectedCustomLoc}
                setSelectedCustomLoc={setSelectedCustomLoc}
                customCatalog={customCatalog}
                customSelectorPopover={customSelectorPopover}
                customSearchQuery={customSearchQuery}
                setCustomSearchQuery={setCustomSearchQuery}
                saveCustomPopover={saveCustomPopover}
                customNameInput={customNameInput}
                setCustomNameInput={setCustomNameInput}
                customGroupInput={customGroupInput}
                setCustomGroupInput={setCustomGroupInput}
                saveCustomIsPinned={saveCustomIsPinned}
                setSaveCustomIsPinned={setSaveCustomIsPinned}
                savingCustom={savingCustom}
                filteredCustomLocations={filteredCustomLocations}
                pinnedCustomLocations={pinnedCustomLocations}
                pinnedPresetsList={pinnedPresetsList}
                onSaveGps={handleSaveGps}
                onCreateCustomLocationHere={handleCreateCustomLocationHere}
                onTogglePinLocation={handleTogglePinLocation}
              />
            )}

            {/* Contenido: Tab Red USB & Cuarentena (NET-USB-001) */}
            {activeTab === 'network' && (
              <FocusProxyTab
                networkState={networkState}
                networkBusy={networkBusy}
                onRotateIp={handleRotateIp}
                onQuarantine={handleQuarantine}
                onClaimUsb={handleClaimUsb}
              />
            )}

            {/* Contenido: Tab Salud & Antifraude */}
            {activeTab === 'health' && (
              <FocusHealthTab
                healthChecking={healthChecking}
                healthReport={healthReport}
                onCheckHealth={handleCheckHealth}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
