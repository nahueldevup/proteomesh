import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
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
  Loader2,
  Navigation,
  Sun,
  Moon,
  Monitor,
  Zap,
  Usb,
  ShieldAlert,
  RotateCw,
  BookmarkPlus,
  Plus,
  Check,
  ChevronDown,
  Pin,
  Search,
  X,
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
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { InteractiveScreen } from './InteractiveScreen';
import { ScrcpyLiveScreen } from '../farm/ScrcpyLiveScreen';
import { DeviceControlRail } from '../grid/DeviceControlRail';
import { getPresetDisplay } from '../../lib/locations';
import { toast } from 'sonner';
import { cn, getErrorMessage } from '../../lib/utils';
import { useFps } from '../../lib/scrcpy/useFps';

const MapPicker = lazy(() => import('../MapPicker').then((m) => ({ default: m.MapPicker })));

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

  // Popovers state
  // Map & Custom Location state
  const [mapLat, setMapLat] = useState(-34.603722);
  const [mapLon, setMapLon] = useState(-58.381592);
  const [mapCity, setMapCity] = useState('Buenos Aires');
  const [mapBusy, setMapBusy] = useState(false);

  // Catálogo de Ubicaciones Custom & Pins (compartido via TanStack Query)
  const { data: customCatalog = EMPTY_CATALOG } = useLocationsCatalog();
  const [selectedCustomLoc, setSelectedCustomLoc] = useState<CustomLocation | null>(null);
  const [customSelectorOpen, setCustomSelectorOpen] = useState(false);
  const [customSearchQuery, setCustomSearchQuery] = useState('');
  const [saveCustomPopoverOpen, setSaveCustomPopoverOpen] = useState(false);
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

  const handleCreateCustomLocationHere = async (e: React.FormEvent) => {
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
      setSaveCustomPopoverOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
      setSelectedCustomLoc(created);
    } catch (err) {
      toast.error(`Error al guardar: ${getErrorMessage(err)}`);
    } finally {
      setSavingCustom(false);
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

  const identity = instance.identity || {};

  return (
    <div className="flex h-full min-h-0 flex-col bg-background select-none">
      {/* ── CABECERA SUPERIOR (IDÉNTICA A LOVABLE) ─────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 bg-background">
        <button
          onClick={onBack}
          aria-label="Volver"
          className="grid h-8 w-8 place-items-center rounded-md hover:bg-accent text-foreground transition-colors"
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

          {/* Barra vertical unificada de control (Ticket 2) */}
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
          <div className="rounded-sm border border-border bg-card p-2.5 font-mono text-xs shrink-0">
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
              {[
                ['Modelo', modelName],
                ['Puerto ADB', String(instance.adb_port)],
                ['IMEI', identity.imei ?? '—'],
                ['Operadora', instance.carrier ?? '—'],
                ['Serial', identity.serial ?? '—'],
                ['Proxy', instance.proxy?.exit_ip ? `${instance.proxy.exit_ip} (${instance.proxy.type.toUpperCase()})` : (instance.proxy ? `${instance.proxy.host}:${instance.proxy.port}` : '—')],
                ['Red USB', networkState?.public_ip ? `${networkState.public_ip} (Módem USB)` : (networkState?.state === 'QUARANTINE' ? 'Cuarentena (Aislado)' : (networkState?.state === 'WAITING_USB' ? `En Cola (#${networkState.queue_position})` : 'Cuarentena T=0'))],
                ['Teléfono', identity.phone_number ?? '—'],
                ['Ubicación GPS', instance.location?.custom_name ? `${instance.location.custom_name} (${instance.location.city})` : (instance.location?.city ?? '—')],
                ['Zona horaria', instance.location?.timezone ?? '—'],
              ].map(([k, v]) => (
                <div
                  key={String(k)}
                  className="flex items-center justify-between gap-2 border-b border-border/40 py-0.5"
                >
                  <span className="text-muted-foreground text-[10px] shrink-0">{k}</span>
                  <span className="truncate text-foreground font-medium text-[10px] text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>

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
                  'flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-mono font-medium transition-colors',
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
                  'flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-mono font-medium transition-colors',
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
                  'flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-mono font-medium transition-colors',
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
              <div className="flex flex-col gap-2.5 pt-2.5 flex-1 min-h-0">
                {/* Cabecera de acción con Selector Custom, Guardar Custom, Presets y Actualizar */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Popover: Selector de Ubicación Custom */}
                    <Popover open={customSelectorOpen} onOpenChange={setCustomSelectorOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-mono font-medium border transition-colors',
                            selectedCustomLoc
                              ? 'bg-primary/20 border-primary/50 text-foreground font-semibold'
                              : 'bg-background border-border text-foreground hover:bg-muted'
                          )}
                          title="Seleccionar entre tus ubicaciones personalizadas guardadas"
                        >
                          <BookmarkPlus className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate max-w-[130px]">
                            {selectedCustomLoc ? selectedCustomLoc.name : 'Ubicación Custom'}
                          </span>
                          <ChevronDown className={cn("h-3 w-3 opacity-60 shrink-0 transition-transform duration-200", customSelectorOpen && "rotate-180")} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" sideOffset={4} className="w-80 p-2.5 space-y-2">
                        <div className="flex items-center justify-between border-b border-border/50 pb-1.5 px-0.5">
                          <span className="text-[11px] font-bold text-foreground">Ubicaciones Personalizadas</span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {filteredCustomLocations.length} de {customCatalog.locations.length}
                          </span>
                        </div>

                        {/* Buscador de Ubicaciones Custom */}
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Buscar por nombre, ciudad o grupo..."
                            value={customSearchQuery}
                            onChange={(e) => setCustomSearchQuery(e.target.value)}
                            className="w-full h-8 rounded-md border border-border bg-background pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                          />
                          {customSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setCustomSearchQuery('')}
                              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground p-0.5"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Lista de Ubicaciones */}
                        <div className="max-h-60 overflow-y-auto space-y-1">
                          {customCatalog.locations.length === 0 ? (
                            <div className="p-3 text-center text-xs text-muted-foreground">
                              No tienes ubicaciones personalizadas aún. Guarda la actual con "+ Guardar Custom".
                            </div>
                          ) : filteredCustomLocations.length === 0 ? (
                            <div className="p-3 text-center text-xs text-muted-foreground">
                              No se encontraron ubicaciones para "{customSearchQuery}".
                            </div>
                          ) : (
                            filteredCustomLocations.map((loc: CustomLocation) => {
                              const isSelected = selectedCustomLoc?.id === loc.id;
                              const grp = loc.group_id
                                ? customCatalog.groups.find((g: LocationGroup) => g.id === loc.group_id)
                                : null;
                              return (
                                <div
                                  key={loc.id}
                                  className={cn(
                                    'group flex items-center justify-between rounded-md p-1.5 text-xs transition-colors',
                                    isSelected
                                      ? 'bg-primary/15 text-primary font-semibold'
                                      : 'hover:bg-accent text-foreground'
                                  )}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedCustomLoc(loc);
                                      setMapLat(loc.latitude);
                                      setMapLon(loc.longitude);
                                      setMapCity(loc.city);
                                      setCustomSelectorOpen(false);
                                      toast.info(`Seleccionada: ${loc.name}`);
                                    }}
                                    className="flex items-start gap-2 min-w-0 flex-1 text-left"
                                  >
                                    <span
                                      className="mt-1 h-2 w-2 rounded-full shrink-0"
                                      style={{ backgroundColor: grp?.color || '#10b981' }}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="truncate font-medium">{loc.name}</span>
                                        {grp && (
                                          <span className="text-[9px] text-muted-foreground truncate opacity-75">
                                            ({grp.name})
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground truncate">{loc.city}</div>
                                    </div>
                                  </button>

                                  <div className="flex items-center gap-1 shrink-0 ml-1">
                                    <button
                                      type="button"
                                      title={loc.is_pinned ? 'Desfijar de accesos rápidos' : 'Fijar en accesos rápidos'}
                                      onClick={async (e) => {
                                        e.stopPropagation();
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
                                      }}
                                      className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
                                    >
                                      <Pin
                                        className={cn(
                                          'h-3 w-3',
                                          loc.is_pinned ? 'text-amber-500 fill-amber-500' : 'opacity-40 group-hover:opacity-80'
                                        )}
                                      />
                                    </button>
                                    {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>

                    {/* Popover: Guardar coordenadas actuales como Custom */}
                    <Popover open={saveCustomPopoverOpen} onOpenChange={setSaveCustomPopoverOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-mono font-medium transition-colors",
                            saveCustomPopoverOpen
                              ? "border-primary bg-primary/20 text-foreground font-semibold"
                              : "border-border bg-background text-foreground hover:bg-muted"
                          )}
                          title="Guardar coordenadas actuales del mapa como nueva ubicación custom"
                        >
                          <Plus className={cn("h-3.5 w-3.5 text-primary transition-transform duration-200", saveCustomPopoverOpen && "rotate-45")} />
                          <span>Guardar Custom</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" sideOffset={4} className="w-72 p-3 space-y-3">
                        <div className="border-b border-border/50 pb-1.5">
                          <span className="text-xs font-bold text-foreground">Guardar Ubicación Custom</span>
                          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                            Coordenadas: {mapLat.toFixed(4)}, {mapLon.toFixed(4)}
                          </div>
                        </div>

                        <form onSubmit={handleCreateCustomLocationHere} className="space-y-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-foreground mb-1">
                              Nombre Personalizado *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Ej: Oficina Central, Depósito 2..."
                              value={customNameInput}
                              onChange={(e) => setCustomNameInput(e.target.value)}
                              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-foreground mb-1">
                              Grupo
                            </label>
                            <select
                              value={customGroupInput}
                              onChange={(e) => setCustomGroupInput(e.target.value)}
                              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="">(Sin Grupo)</option>
                              {customCatalog.groups.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Opción para fijar en accesos rápidos */}
                          <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                            <input
                              type="checkbox"
                              checked={saveCustomIsPinned}
                              onChange={(e) => setSaveCustomIsPinned(e.target.checked)}
                              className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                            />
                            <span className="text-[11px] text-foreground font-medium flex items-center gap-1 select-none">
                              <Pin className="h-3 w-3 text-amber-500 fill-amber-500" />
                              <span>Fijar en accesos rápidos</span>
                            </span>
                          </label>

                          <div className="flex items-center justify-end gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => setSaveCustomPopoverOpen(false)}
                              className="rounded px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              disabled={savingCustom || !customNameInput.trim()}
                              className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                            >
                              {savingCustom && <Loader2 className="h-3 w-3 animate-spin" />}
                              <span>Guardar</span>
                            </button>
                          </div>
                        </form>
                      </PopoverContent>
                    </Popover>

                    {/* Presets Rápidos y Ubicaciones Custom Fijadas */}
                    <div className="hidden md:flex items-center gap-1 pl-1 border-l border-border/60 overflow-x-auto scrollbar-none max-w-[500px]">
                      {/* Presets Globales Fijados */}
                      {pinnedPresetsList.map((c) => {
                        const isSelected = !selectedCustomLoc && (mapCity === c.name || mapCity === c.city);
                        const isDefaultPreset = customCatalog.default_location?.target_type === 'preset' && customCatalog.default_location?.id === c.key;
                        return (
                          <button
                            key={`pre-${c.key}`}
                            type="button"
                            title={isDefaultPreset ? `Preset predeterminado general: ${c.city}` : `Preset oficial: ${c.city}`}
                            onClick={() => {
                              setSelectedCustomLoc(null);
                              setMapLat(c.latitude);
                              setMapLon(c.longitude);
                              setMapCity(c.name);
                            }}
                            className={cn(
                              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors border shrink-0',
                              isSelected
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 font-semibold'
                                : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent'
                            )}
                          >
                            {isDefaultPreset && <span className="text-[9px] text-amber-500">⭐</span>}
                            <span>{c.name}</span>
                          </button>
                        );
                      })}

                      {/* Ubicaciones Personalizadas Fijadas */}
                      {pinnedCustomLocations.map((loc: CustomLocation) => {
                        const isSelected = selectedCustomLoc?.id === loc.id;
                        const isDefaultLoc = customCatalog.default_location?.id === loc.id;
                        const grp = loc.group_id
                          ? customCatalog.groups.find((g: LocationGroup) => g.id === loc.group_id)
                          : null;
                        return (
                          <button
                            key={`cust-${loc.id}`}
                            type="button"
                            title={isDefaultLoc ? `Predeterminada del sistema: ${loc.name} (${loc.city})` : `Ubicación personalizada: ${loc.name} (${loc.city})`}
                            onClick={() => {
                              setSelectedCustomLoc(loc);
                              setMapLat(loc.latitude);
                              setMapLon(loc.longitude);
                              setMapCity(loc.city);
                            }}
                            className={cn(
                              'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-sans transition-colors border max-w-[140px] truncate shrink-0',
                              isSelected
                                ? 'bg-primary/15 text-primary border-primary/50 font-semibold shadow-xs'
                                : 'border-border bg-background text-foreground/80 hover:text-foreground hover:bg-accent'
                            )}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: grp?.color || '#10b981' }}
                            />
                            {isDefaultLoc && <span className="text-[9px] text-amber-500 shrink-0">⭐</span>}
                            <span className="truncate">{loc.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Botón Prominente: Actualizar GPS */}
                  <button
                    disabled={mapBusy}
                    onClick={handleSaveGps}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 font-sans text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 shadow-sm shrink-0"
                  >
                    {mapBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
                    <span>
                      {selectedCustomLoc ? `Asignar: ${selectedCustomLoc.name}` : 'Actualizar GPS'}
                    </span>
                  </button>
                </div>

                {/* Mapa Interactivo Leaflet */}
                <div className="rounded-lg border border-border overflow-hidden h-[190px] relative">
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center bg-muted/20">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    }
                  >
                    <MapPicker
                      latitude={mapLat}
                      longitude={mapLon}
                      city={mapCity}
                      height="190px"
                      showPresets={false}
                      showInfoOverlay={false}
                      onChange={(lat, lon, cityName) => {
                        setMapLat(lat);
                        setMapLon(lon);
                        if (cityName) setMapCity(cityName);
                      }}
                    />
                  </Suspense>
                </div>

                {/* Coordenadas seleccionadas y Nombre Custom Activo */}
                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                  <div className="flex items-center gap-1.5 truncate">
                    {selectedCustomLoc ? (
                      <>
                        <span className="font-bold text-primary truncate">
                          📍 {selectedCustomLoc.name}
                        </span>
                        <span className="text-[10px] opacity-75 truncate">
                          ({mapCity}: {mapLat.toFixed(4)}, {mapLon.toFixed(4)})
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedCustomLoc(null)}
                          className="text-[9px] text-muted-foreground hover:text-foreground underline ml-1"
                        >
                          Limpiar
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-foreground">{mapCity}:</span>{' '}
                        <span>{mapLat.toFixed(4)}, {mapLon.toFixed(4)}</span>
                      </>
                    )}
                  </div>
                  <span className="text-[10px] shrink-0">Arrastra el marcador o haz clic en el mapa</span>
                </div>
              </div>
            )}

            {/* Contenido: Tab Red USB & Cuarentena (NET-USB-001) */}
            {activeTab === 'network' && (
              <div className="flex flex-col gap-3 pt-2.5 flex-1 min-h-0 overflow-y-auto">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/50 shrink-0 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Usb className="h-4 w-4 text-primary" />
                    <span>Red Dinámica por Anclaje USB</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {networkState?.state === 'CONNECTED_USB' ? (
                      <>
                        <button
                          onClick={handleRotateIp}
                          disabled={networkBusy}
                          className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-40"
                        >
                          {networkBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3 text-primary" />}
                          <span>Rotar IP (Modo Avión)</span>
                        </button>
                        <button
                          onClick={handleQuarantine}
                          disabled={networkBusy}
                          className="flex h-7 items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-40"
                        >
                          <ShieldAlert className="h-3 w-3 text-rose-500" />
                          <span>Soltar Red</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleClaimUsb}
                        disabled={networkBusy}
                        className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-sm disabled:opacity-40"
                      >
                        {networkBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Usb className="h-3 w-3" />}
                        <span>Reclamar Conexión USB</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Tarjeta de Estado Principal */}
                <div className={cn(
                  'rounded-xl border p-4 space-y-2.5 transition-all bg-surface',
                  networkState?.state === 'CONNECTED_USB'
                    ? 'border-emerald-500/40 ring-1 ring-emerald-500/15'
                    : networkState?.state === 'WAITING_USB'
                    ? 'border-amber-500/40 ring-1 ring-amber-500/15'
                    : 'border-border'
                )}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Estado de Conexión
                    </span>
                    {networkState?.state === 'CONNECTED_USB' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        Conectado a Celular USB
                      </span>
                    ) : networkState?.state === 'WAITING_USB' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                        <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                        Esperando USB (#{networkState?.queue_position || 1})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                        <ShieldAlert className="h-3 w-3 text-amber-500" />
                        Cuarentena (Sin Internet)
                      </span>
                    )}
                  </div>

                  {networkState?.state === 'CONNECTED_USB' && (
                    <div className="space-y-1.5 pt-1 border-t border-border/40 font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">IP Pública de Salida:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">{networkState.public_ip || 'Validando...'}</span>
                      </div>
                      {networkState.assigned_usb && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Módem Físico:</span>
                            <span className="text-foreground">{networkState.assigned_usb.model || 'Android'} ({networkState.assigned_usb.serial})</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Interfaz / Gateway:</span>
                            <span className="text-foreground">{networkState.assigned_usb.iface} · {networkState.assigned_usb.gateway}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Operadora Móvil:</span>
                            <span className="text-foreground">{networkState.assigned_usb.carrier || 'Móvil'}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {networkState?.state !== 'CONNECTED_USB' && (
                    <p className="text-xs text-muted-foreground leading-relaxed pt-1 border-t border-border/40">
                      El contenedor está aislado por la regla de cortafuegos DOCKER-USER en el host CachyOS. Ningún paquete puede filtrarse hacia la red doméstica. ADB local y ws-scrcpy continúan funcionando normalmente.
                    </p>
                  )}
                </div>

                {/* Explicación de Evasión & Anti-Fraude */}
                <div className="rounded-lg border border-border bg-surface p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground text-[11px]">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    <span>Hardening Kernel Transparente (Sin Detección de Proxy)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Las aplicaciones dentro del CloudPhone ven exclusivamente la interfaz física <code className="text-primary font-mono">eth0</code> (enmascarada como wlan0 por el módulo nativo). No existen interfaces <code className="text-primary font-mono">tun0</code> ni flags VPN en Android.
                  </p>
                </div>
              </div>
            )}

            {/* Contenido: Tab Salud & Antifraude */}
            {activeTab === 'health' && (
              <div className="flex flex-col gap-2.5 pt-2.5 flex-1 min-h-0 overflow-hidden">
                {/* Cabecera con título y botón de acción prominente */}
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/50 shrink-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span>Auditoría de Integridad y Antifraude</span>
                  </div>

                  <button
                    disabled={healthChecking}
                    onClick={handleCheckHealth}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 shadow-sm shrink-0"
                  >
                    {healthChecking ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    <span>Ejecutar Diagnóstico</span>
                  </button>
                </div>

                {/* Resumen del diagnóstico real (GET /instances/{name}/health) */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono shrink-0">
                  <div className="rounded-lg border border-border bg-background/80 p-2 space-y-0.5">
                    <span className="text-muted-foreground text-[10px]">Resultado</span>
                    <div
                      className={cn(
                        'font-bold text-xs flex items-center gap-1',
                        !healthReport
                          ? 'text-muted-foreground'
                          : healthReport.ok
                          ? 'text-success'
                          : 'text-warning'
                      )}
                    >
                      {!healthReport ? '—' : healthReport.ok ? 'Sin alertas' : 'Con advertencias'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/80 p-2 space-y-0.5">
                    <span className="text-muted-foreground text-[10px]">Comprobaciones</span>
                    <div className="font-bold text-foreground text-xs">
                      {healthReport ? healthReport.reports.length : '—'}
                    </div>
                  </div>
                </div>

                {/* Consola de resultados con altura flexible interna y scroll para PREVENIR cualquier desborde */}
                <div className="flex-1 min-h-0 rounded-lg border border-border bg-background/90 p-2.5 font-mono text-xs overflow-y-auto">
                  {healthReport ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-primary">
                        <span>Resultados de auditoría:</span>
                        <span className="text-[10px] text-muted-foreground font-normal">
                          {healthReport.reports.length} comprobaciones
                        </span>
                      </div>
                      <ul className="list-disc pl-4 text-muted-foreground space-y-0.5 text-[11px]">
                        {healthReport.reports.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[90px] flex-col items-center justify-center text-center text-muted-foreground/60 text-xs gap-1.5 p-2">
                      <CheckCircle2 className="h-6 w-6 text-muted-foreground/30" />
                      <span>Listo para auditar heurísticas de emulación y root.</span>
                      <span className="text-[10px] text-muted-foreground/40">
                        Haz clic en "Ejecutar Diagnóstico" arriba para iniciar el test.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
