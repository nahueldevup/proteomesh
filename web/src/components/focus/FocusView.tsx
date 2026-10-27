import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Power,
  Volume2,
  Volume1,
  Triangle,
  Circle,
  Square,
  Camera,
  Smartphone,
  Type,
  Link2,
  ExternalLink,
  MapPin,
  CheckCircle2,
  Send,
  Loader2,
  Navigation,
  Trash2,
  Sun,
  Moon,
  Monitor,
  Zap,
  Usb,
  ShieldAlert,
  RotateCw,
} from 'lucide-react';
import type { Instance, ScrcpyStreamInfo, InstanceUsbNetworkState } from '../../types';
import { api } from '../../lib/api';
import { IconBtn } from '../ui/IconBtn';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ConfirmDeleteModal } from '../ui/ConfirmDeleteModal';
import { InteractiveScreen } from './InteractiveScreen';
import { MapPicker } from '../MapPicker';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

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
}

type SubTab = 'gps' | 'network' | 'health';

const QUICK_CITIES = [
  { name: 'Buenos Aires', lat: -34.603722, lon: -58.381592, tz: 'America/Argentina/Buenos_Aires' },
  { name: 'São Paulo', lat: -23.55052, lon: -46.633308, tz: 'America/Sao_Paulo' },
  { name: 'Miami', lat: 25.76168, lon: -80.19179, tz: 'America/New_York' },
  { name: 'New York', lat: 40.712776, lon: -74.005974, tz: 'America/New_York' },
  { name: 'Madrid', lat: 40.416775, lon: -3.70379, tz: 'Europe/Madrid' },
  { name: 'CDMX', lat: 19.432608, lon: -99.133209, tz: 'America/Mexico_City' },
];

export default function FocusView({
  instance,
  instances,
  onBack,
  onSelectInstance,
  groupInstances = [],
  groupMode = false,
  onChanged,
  theme,
  onToggleTheme,
}: FocusViewProps) {
  const [streamInfo, setStreamInfo] = useState<ScrcpyStreamInfo | null>(null);
  const [activeTab, setActiveTab] = useState<SubTab>('gps');

  // Popovers state
  const [textOpen, setTextOpen] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlValue, setUrlValue] = useState('');

  // Map state
  const [mapLat, setMapLat] = useState(-34.603722);
  const [mapLon, setMapLon] = useState(-58.381592);
  const [mapCity, setMapCity] = useState('Buenos Aires');
  const [mapBusy, setMapBusy] = useState(false);

  // Network / USB state (NET-USB-001)
  const [networkState, setNetworkState] = useState<InstanceUsbNetworkState | null>(null);
  const [networkBusy, setNetworkBusy] = useState(false);

  const fetchNetworkState = useCallback(async () => {
    if (!instance) return;
    try {
      const st = await api.getInstanceUsbNetworkState(instance.instance_name);
      setNetworkState(st);
    } catch {
      // Silenciar si no está disponible
    }
  }, [instance?.instance_name]);

  useEffect(() => {
    fetchNetworkState();
    const interval = window.setInterval(fetchNetworkState, 5000);
    return () => window.clearInterval(interval);
  }, [fetchNetworkState]);

  // Health state
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthReport, setHealthReport] = useState<{ ok: boolean; reports: string[] } | null>(null);

  // Delete instance confirmation state
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingInstance, setDeletingInstance] = useState(false);
  const [streamMode, setStreamMode] = useState<'scrcpy' | 'canvas'>('scrcpy');

  const handleDeleteThisInstance = async () => {
    if (!instance) return;
    setDeletingInstance(true);
    try {
      await api.deleteInstance(instance.instance_name);
      toast.success(`CloudPhone "${instance.instance_name}" eliminado correctamente`);
      setConfirmDeleteOpen(false);
      onChanged?.();
      onBack();
    } catch (err: any) {
      toast.error(`Error al eliminar: ${err.message}`);
    } finally {
      setDeletingInstance(false);
    }
  };

  useEffect(() => {
    if (!instance) return;
    if (instance.location) {
      setMapLat(instance.location.latitude);
      setMapLon(instance.location.longitude);
      setMapCity(instance.location.city || 'Buenos Aires');
    }
  }, [instance?.instance_name]);

  // Consulta periódica del streaming de alta fidelidad (ws-scrcpy)
  useEffect(() => {
    if (!instance || !instance.running) {
      setStreamInfo(null);
      return;
    }
    const supportsWebCodecs = typeof window !== 'undefined' && 'VideoDecoder' in window;
    let alive = true;

    const checkStream = () => {
      api.getStreamInfo(instance.instance_name, supportsWebCodecs ? 'webcodecs' : 'mse')
        .then((info) => {
          if (alive) setStreamInfo(info);
        })
        .catch(() => {
          if (alive) setStreamInfo(null);
        });
    };

    checkStream();
    // Reintentar si ws-scrcpy estaba arrancando o tras reconexión
    const retryTimer = window.setInterval(checkStream, 4000);

    return () => {
      alive = false;
      window.clearInterval(retryTimer);
    };
  }, [instance?.instance_name, instance?.running]);

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

  const grouped = groupMode && groupInstances.length > 1;
  const nativeWidth = Number(instance.display?.width) || 1080;
  const nativeHeight = Number(instance.display?.height) || 2340;

  const sendKey = async (key: string, label: string) => {
    try {
      if (grouped) await api.groupKey(groupInstances, key);
      else await api.sendKey(instance.instance_name, key);
      toast.success(`Tecla ${label} enviada`);
    } catch {
      toast.error('Error al enviar comando');
    }
  };

  const handleTogglePower = async () => {
    const toastId = toast.loading(instance.running ? 'Apagando…' : 'Encendiendo…');
    try {
      if (instance.running) {
        await api.stopInstance(instance.instance_name);
        toast.success('Dispositivo apagado', { id: toastId });
      } else {
        await api.startInstance(instance.instance_name);
        toast.success('Dispositivo encendido', { id: toastId });
      }
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cambiar estado', { id: toastId });
    }
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(api.getScreenUrl(instance.instance_name));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${instance.instance_name}-${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Captura guardada');
    } catch {
      toast.error('Error al capturar pantalla');
    }
  };

  const handleSendText = async () => {
    if (!textValue.trim()) return;
    const txt = textValue.trim();
    setTextOpen(false);
    setTextValue('');
    try {
      if (grouped) await api.groupText(groupInstances, txt);
      else await api.sendText(instance.instance_name, txt);
      toast.success('Texto enviado');
    } catch {
      toast.error('Error al enviar texto');
    }
  };

  const handleSendUrl = async () => {
    if (!urlValue.trim()) return;
    let url = urlValue.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    setUrlOpen(false);
    setUrlValue('');
    try {
      if (grouped) await api.groupLaunchUrl(groupInstances, url);
      else await api.launchUrl(instance.instance_name, url);
      toast.success('URL abierta');
    } catch {
      toast.error('Error al abrir URL');
    }
  };

  const handleLaunchNativeScrcpy = async () => {
    if (!instance) return;
    try {
      const res = await api.launchScrcpy(instance.instance_name);
      if (res.status === 'success' || res.status === 'ok') {
        toast.success(res.message || 'Scrcpy nativo iniciado');
      } else {
        toast.error(res.message || 'No se pudo iniciar scrcpy');
      }
    } catch (err: any) {
      toast.error(`Fallo al lanzar scrcpy: ${err.message}`);
    }
  };

  const handleSaveGps = async () => {
    setMapBusy(true);
    const toastId = toast.loading(`Actualizando GPS a ${mapCity}...`);
    try {
      await api.setInstanceLocation(instance.instance_name, {
        latitude: mapLat,
        longitude: mapLon,
        city: mapCity,
        altitude: 25.0,
      });
      toast.success(`GPS actualizado: ${mapCity}`, { id: toastId });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar ubicación', { id: toastId });
    } finally {
      setMapBusy(false);
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
      toast.error(err instanceof Error ? err.message : 'Error al aislar instancia', { id: toastId });
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
      toast.error(err instanceof Error ? err.message : 'Fallo al reclamar módem USB', { id: toastId });
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
      toast.error(err instanceof Error ? err.message : 'Error al rotar IP', { id: toastId });
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
      toast.error(e instanceof Error ? e.message : 'Error al verificar salud');
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
    : 'Samsung A54x';

  const identity = instance.identity || {};

  // URL del streaming nativo scrcpy sin toolbars (usando el proxy same-origin de Vite)
  const cleanEmbedUrl = streamInfo?.available && streamInfo.embed_url
    ? streamInfo.embed_url.replace(/^https?:\/\/[^/]+/, '/ws-scrcpy')
    : null;

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
        <span className="text-sm text-muted-foreground">{instance.location?.city ?? 'Sin GPS'}</span>

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
                <span>30 FPS</span>
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
          <div className="h-full rounded-2xl bg-bezel p-1.5 shadow-2xl flex items-center justify-center">
            <div
              style={{ aspectRatio: `${nativeWidth} / ${nativeHeight}` }}
              className="relative h-full overflow-hidden rounded-xl bg-black border border-border/40 select-none flex flex-col"
            >
              {instance.running ? (
                streamMode === 'scrcpy' && cleanEmbedUrl ? (
                  <iframe
                    src={cleanEmbedUrl}
                    title={`scrcpy ${instance.instance_name}`}
                    allow="autoplay; fullscreen"
                    className="h-full w-full border-0 bg-black select-none pointer-events-auto"
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

          {/* Barra Única Vertical de Control (Exacta de Lovable con Popovers) */}
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-1 shadow-lg">
            {/* Encender / Apagar */}
            <IconBtn
              icon={Power}
              label={instance.running ? 'Apagar' : 'Encender'}
              side="right"
              onClick={handleTogglePower}
            />

            {/* Volumen */}
            <IconBtn
              icon={Volume2}
              label="Subir volumen"
              side="right"
              disabled={!instance.running}
              onClick={() => sendKey('volume_up', 'Volumen +')}
            />
            <IconBtn
              icon={Volume1}
              label="Bajar volumen"
              side="right"
              disabled={!instance.running}
              onClick={() => sendKey('volume_down', 'Volumen -')}
            />

            {/* Navegación Android */}
            <IconBtn
              icon={Triangle}
              label="Atrás"
              side="right"
              className="-rotate-90"
              disabled={!instance.running}
              onClick={() => sendKey('back', 'Atrás')}
            />
            <IconBtn
              icon={Circle}
              label="Inicio"
              side="right"
              disabled={!instance.running}
              onClick={() => sendKey('home', 'Inicio')}
            />
            <IconBtn
              icon={Square}
              label="Recientes"
              side="right"
              disabled={!instance.running}
              onClick={() => sendKey('recents', 'Recientes')}
            />

            {/* Captura de Pantalla */}
            <IconBtn
              icon={Camera}
              label="Captura"
              side="right"
              disabled={!instance.running}
              onClick={handleDownload}
            />

            {/* Escribir texto con Popover */}
            <Popover open={textOpen} onOpenChange={setTextOpen}>
              <PopoverTrigger asChild>
                <div>
                  <IconBtn
                    icon={Type}
                    label="Escribir texto"
                    side="right"
                    variant={textOpen ? 'active' : 'ghost'}
                    disabled={!instance.running}
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent side="right" className="w-72 p-2">
                <div className="mb-2 text-xs text-muted-foreground font-mono">Escribir vía ADB</div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    autoFocus
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                    placeholder="Texto a enviar…"
                    className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <IconBtn icon={Send} label="Enviar" variant="primary" onClick={handleSendText} />
                </div>
              </PopoverContent>
            </Popover>

            {/* Abrir URL con Popover */}
            <Popover open={urlOpen} onOpenChange={setUrlOpen}>
              <PopoverTrigger asChild>
                <div>
                  <IconBtn
                    icon={Link2}
                    label="Abrir URL"
                    side="right"
                    variant={urlOpen ? 'active' : 'ghost'}
                    disabled={!instance.running}
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent side="right" className="w-72 p-2">
                <div className="mb-2 text-xs text-muted-foreground font-mono">Abrir enlace en Chrome</div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    autoFocus
                    value={urlValue}
                    onChange={(e) => setUrlValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendUrl()}
                    placeholder="https://…"
                    className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <IconBtn icon={Send} label="Abrir" variant="primary" onClick={handleSendUrl} />
                </div>
              </PopoverContent>
            </Popover>

            {/* Lanzar Scrcpy Nativo para baja latencia extrema (Ventana externa) */}
            <IconBtn
              icon={Monitor}
              label="Lanzar Scrcpy de escritorio (ventana nativa)"
              side="right"
              disabled={!instance.running}
              onClick={handleLaunchNativeScrcpy}
            />

            {/* Visor scrcpy web en pestaña dedicada (opcional) */}
            {streamInfo?.available && (
              <a
                href={streamInfo.embed_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir scrcpy web en pestaña dedicada"
              >
                <IconBtn icon={ExternalLink} label="Abrir scrcpy web en pestaña" side="right" />
              </a>
            )}

            {/* Eliminar CloudPhone */}
            <div className="my-1 h-px bg-border/60" />
            <IconBtn
              icon={Trash2}
              label="Eliminar CloudPhone"
              variant="danger"
              side="right"
              onClick={() => setConfirmDeleteOpen(true)}
            />
          </div>
        </div>

        {/* Columna Derecha: Tarjeta de Metadatos (Compacta en 2 columnas) + Módulos Interactivos */}
        <div className="min-w-0 flex-1 flex flex-col gap-3 h-full overflow-hidden">
          {/* Tarjeta de Metadatos (Distribución compacta en 2 columnas, espaciado fino Lovable) */}
          <div className="rounded-xl border border-border bg-surface p-3 font-mono text-xs shadow-md shrink-0">
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
              {[
                ['Modelo', modelName],
                ['Puerto ADB', String(instance.adb_port)],
                ['IMEI', identity.imei ?? '351689227998429'],
                ['Grupo', instance.carrier ?? 'ar_personal'],
                ['Serial', identity.serial ?? 'R58RACBDED'],
                ['Proxy', instance.proxy?.exit_ip ? `${instance.proxy.exit_ip} (${instance.proxy.type.toUpperCase()})` : (instance.proxy ? `${instance.proxy.host}:${instance.proxy.port}` : '—')],
                ['Red USB', networkState?.public_ip ? `${networkState.public_ip} (Módem USB)` : (networkState?.state === 'QUARANTINE' ? 'Cuarentena (Aislado)' : (networkState?.state === 'WAITING_USB' ? `En Cola (#${networkState.queue_position})` : 'Cuarentena T=0'))],
                ['Teléfono', identity.phone_number ?? '+549****3997'],
                ['Zona horaria', instance.location?.timezone ?? 'America/Argentina/Buenos_Aires'],
              ].map(([k, v]) => (
                <div
                  key={String(k)}
                  className="flex items-center justify-between gap-2 border-b border-border/40 py-1"
                >
                  <span className="text-muted-foreground text-[11px] shrink-0">{k}</span>
                  <span className="truncate text-foreground font-medium text-[11px] text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tarjeta de Módulos Interactivos Reincorporados (Mapa GPS, Proxy, Salud) */}
          <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-border bg-surface p-3.5 shadow-md overflow-hidden">
            {/* Cabecera de Pestañas del Módulo */}
            <div className="flex items-center gap-1 border-b border-border pb-2.5 shrink-0">
              <button
                onClick={() => setActiveTab('gps')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  activeTab === 'gps'
                    ? 'bg-accent text-foreground font-semibold border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <span>Geolocalización GPS</span>
              </button>

              <button
                onClick={() => setActiveTab('network')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  activeTab === 'network'
                    ? 'bg-accent text-foreground font-semibold border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <Usb className="h-3.5 w-3.5 text-primary" />
                <span>Red USB & Cuarentena</span>
              </button>

              <button
                onClick={() => setActiveTab('health')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  activeTab === 'health'
                    ? 'bg-accent text-foreground font-semibold border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span>Salud & Antifraude</span>
              </button>
            </div>

            {/* Contenido: Tab GPS */}
            {activeTab === 'gps' && (
              <div className="flex flex-col gap-2.5 pt-2.5 flex-1">
                {/* Cabecera de acción con presets y botón prominente Actualizar GPS */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-muted-foreground font-mono mr-0.5">Presets:</span>
                    {QUICK_CITIES.map((c) => (
                      <button
                        key={c.name}
                        onClick={() => {
                          setMapLat(c.lat);
                          setMapLon(c.lon);
                          setMapCity(c.name);
                        }}
                        className={cn(
                          'rounded px-2 py-0.5 text-[10px] font-mono transition-colors border',
                          mapCity === c.name
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 font-semibold'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>

                  <button
                    disabled={mapBusy}
                    onClick={handleSaveGps}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 font-sans text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 shadow-sm shrink-0"
                  >
                    {mapBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
                    <span>Actualizar GPS</span>
                  </button>
                </div>

                {/* Mapa Interactivo Leaflet (sin overlays redundantes ni marcas de agua) */}
                <div className="rounded-lg border border-border overflow-hidden h-[190px] relative">
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
                </div>

                {/* Coordenadas seleccionadas */}
                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                  <div>
                    <span className="font-semibold text-foreground">{mapCity}:</span> {mapLat.toFixed(4)}, {mapLon.toFixed(4)}
                  </div>
                  <span className="text-[10px]">Arrastra el marcador o haz clic en el mapa</span>
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
                            <span className="text-foreground">{(networkState.assigned_usb as any).model || 'Android'} ({(networkState.assigned_usb as any).serial})</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Interfaz / Gateway:</span>
                            <span className="text-foreground">{(networkState.assigned_usb as any).iface} · {(networkState.assigned_usb as any).gateway}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Operadora Móvil:</span>
                            <span className="text-foreground">{(networkState.assigned_usb as any).carrier || 'Móvil'}</span>
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

                {/* Métricas clave */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono shrink-0">
                  <div className="rounded-lg border border-border bg-background/80 p-2 space-y-0.5">
                    <span className="text-muted-foreground text-[10px]">Pixelscan Checker</span>
                    <div className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-xs">
                      <CheckCircle2 className="h-3 w-3" /> 100/100 Low Risk
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/80 p-2 space-y-0.5">
                    <span className="text-muted-foreground text-[10px]">Root Detection Plus</span>
                    <div className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-xs">
                      <CheckCircle2 className="h-3 w-3" /> 0/39 Detecciones
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/80 p-2 space-y-0.5">
                    <span className="text-muted-foreground text-[10px]">Framework Root</span>
                    <div className="font-bold text-foreground text-xs truncate">Magisk 30.6 + Zygisk</div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/80 p-2 space-y-0.5">
                    <span className="text-muted-foreground text-[10px]">Módulos Inyectados</span>
                    <div className="font-bold text-foreground text-xs truncate">LSPosed / GmsCompat</div>
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

      {/* Modal de confirmación para eliminar este CloudPhone (Portal en document.body con backdrop dismiss y diseño fino) */}
      <ConfirmDeleteModal
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDeleteThisInstance}
        instances={instance ? [instance.instance_name] : []}
        busy={deletingInstance}
      />
    </div>
  );
}
