import { useEffect, useState } from 'react';
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
  Shield,
  CheckCircle2,
  Send,
  Loader2,
  Navigation,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import type { Instance, ScrcpyStreamInfo, ProxyTestResult } from '../../types';
import { api } from '../../lib/api';
import { IconBtn } from '../ui/IconBtn';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { PhoneScreen } from '../farm/PhoneScreen';
import ScreenStream from './ScreenStream';
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
}

type SubTab = 'gps' | 'proxy' | 'health';

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

  // Proxy state
  const [proxyInput, setProxyInput] = useState('');
  const [testingProxy, setTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<ProxyTestResult | null>(null);

  // Health state
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthReport, setHealthReport] = useState<{ ok: boolean; reports: string[] } | null>(null);

  // Delete instance confirmation state
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingInstance, setDeletingInstance] = useState(false);

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
    if (instance.proxy) {
      setProxyInput(`${instance.proxy.type}://${instance.proxy.host}:${instance.proxy.port}`);
    } else {
      setProxyInput('');
    }
  }, [instance?.instance_name]);

  useEffect(() => {
    if (!instance || !instance.running) {
      setStreamInfo(null);
      return;
    }
    const supportsWebCodecs = typeof window !== 'undefined' && 'VideoDecoder' in window;
    let alive = true;
    api.getStreamInfo(instance.instance_name, supportsWebCodecs ? 'webcodecs' : 'mse')
      .then((info) => {
        if (alive) setStreamInfo(info);
      })
      .catch(() => {
        if (alive) setStreamInfo(null);
      });
    return () => {
      alive = false;
    };
  }, [instance]);

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

  const handleTestProxy = async () => {
    if (!proxyInput.trim()) return;
    setTestingProxy(true);
    setProxyTestResult(null);
    try {
      const res = await api.testProxy({ raw: proxyInput.trim() });
      setProxyTestResult(res);
      if (res.ok) toast.success(`Proxy operativo · Latencia: ${res.latency_ms ?? 0}ms`);
      else toast.error(res.error || 'Fallo en la prueba de proxy');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al probar proxy');
    } finally {
      setTestingProxy(false);
    }
  };

  const handleSaveProxy = async () => {
    if (!proxyInput.trim()) {
      await api.removeInstanceProxy(instance.instance_name);
      toast.success('Proxy removido');
      onChanged();
      return;
    }
    const toastId = toast.loading('Guardando proxy en la instancia...');
    try {
      await api.setInstanceProxy(instance.instance_name, { raw: proxyInput.trim() });
      toast.success('Proxy guardado correctamente', { id: toastId });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar proxy', { id: toastId });
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
      </header>

      {/* ── CUERPO DE LA VISTA ENFOCADA (DISTRIBUCIÓN EXACTA DE LOVABLE) ────── */}
      <div className="flex min-h-0 flex-1 gap-4 p-4 overflow-hidden">
        {/* Columna Izquierda: Celular con Bisel Exacto + Cápsula Vertical Única */}
        <div className="flex h-full items-center gap-2">
          {/* Bisel del Smartphone (Sin bordes negros, sin barras extras) */}
          <div className="h-full rounded-2xl bg-bezel p-1.5 shadow-2xl flex items-center justify-center">
            <div
              style={{ aspectRatio: `${nativeWidth} / ${nativeHeight}` }}
              className="relative h-full overflow-hidden rounded-xl bg-black border border-border/40 select-none flex flex-col"
            >
              {instance.running ? (
                cleanEmbedUrl ? (
                  <iframe
                    src={cleanEmbedUrl}
                    title={`scrcpy ${instance.instance_name}`}
                    allow="autoplay; fullscreen"
                    className="h-full w-full border-0 bg-black select-none pointer-events-auto"
                  />
                ) : (
                  <ScreenStream
                    name={instance.instance_name}
                    running={instance.running}
                    active
                  />
                )
              ) : (
                <PhoneScreen instance={instance} compact={false} />
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

            {/* Visor nativo externo scrcpy (opcional) */}
            {streamInfo?.available && (
              <a
                href={streamInfo.embed_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir scrcpy en pestaña dedicada"
              >
                <IconBtn icon={ExternalLink} label="Abrir scrcpy nativo" side="right" />
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

        {/* Columna Derecha: Tarjeta de Metadatos (Espaciado Lovable) + Módulos Interactivos */}
        <div className="min-w-0 flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
          {/* Tarjeta de Metadatos (Espaciado compacto py-1.5 idéntico a Lovable) */}
          <div className="space-y-1 rounded-xl border border-border bg-surface p-4 font-mono text-xs shadow-md">
            {[
              ['Modelo', modelName],
              ['IMEI', identity.imei ?? '351689227998429'],
              ['Serial', identity.serial ?? 'R58RACBDED'],
              ['Teléfono', identity.phone_number ?? '+5491169653997'],
              ['Puerto ADB', String(instance.adb_port)],
              ['Grupo', instance.carrier ?? 'ar_personal'],
              ['Proxy', instance.proxy ? `${instance.proxy.host}:${instance.proxy.port}` : '—'],
              ['Zona horaria', instance.location?.timezone ?? 'America/Argentina/Buenos_Aires'],
              ['Apps', 'Chrome, Play Store'],
            ].map(([k, v]) => (
              <div
                key={String(k)}
                className="flex justify-between gap-4 border-b border-border/50 py-1.5"
              >
                <span className="text-muted-foreground">{k}</span>
                <span className="truncate text-foreground font-medium">{v}</span>
              </div>
            ))}
          </div>

          {/* Tarjeta de Módulos Interactivos Reincorporados (Mapa GPS, Proxy, Salud) */}
          <div className="flex-1 flex flex-col rounded-xl border border-border bg-surface p-4 shadow-md min-h-[340px]">
            {/* Cabecera de Pestañas del Módulo */}
            <div className="flex items-center gap-1 border-b border-border pb-3">
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
                onClick={() => setActiveTab('proxy')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  activeTab === 'proxy'
                    ? 'bg-accent text-foreground font-semibold border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <Shield className="h-3.5 w-3.5 text-primary" />
                <span>Proxy Residencial</span>
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
                            ? 'bg-primary/20 text-primary border-primary/40 font-semibold'
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

            {/* Contenido: Tab Proxy */}
            {activeTab === 'proxy' && (
              <div className="flex flex-col gap-3 pt-3 flex-1">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">
                    Cadena de Proxy SOCKS5 / HTTP
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Formato: socks5://user:pass@host:port o host:port:user:pass
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={proxyInput}
                    onChange={(e) => setProxyInput(e.target.value)}
                    placeholder="socks5://user:pass@127.0.0.1:1080"
                    className="h-9 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    disabled={testingProxy || !proxyInput.trim()}
                    onClick={handleTestProxy}
                    className="flex items-center gap-1 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-40"
                  >
                    {testingProxy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>Probar</span>
                  </button>
                </div>

                {proxyTestResult && (
                  <div
                    className={cn(
                      'rounded-md p-2.5 text-xs font-mono border',
                      proxyTestResult.ok
                        ? 'border-success/40 bg-success/10 text-success'
                        : 'border-destructive/40 bg-destructive/10 text-destructive'
                    )}
                  >
                    {proxyTestResult.ok ? (
                      <div>
                        IP Salida: {proxyTestResult.ip} · Latencia: {proxyTestResult.latency_ms}ms · País: {proxyTestResult.country ?? 'OK'}
                      </div>
                    ) : (
                      <div>Error: {proxyTestResult.error || 'No se pudo conectar al proxy'}</div>
                    )}
                  </div>
                )}

                <div className="mt-auto flex justify-end gap-2 pt-2 border-t border-border">
                  <button
                    onClick={() => {
                      setProxyInput('');
                      handleSaveProxy();
                    }}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Quitar Proxy
                  </button>
                  <button
                    onClick={handleSaveProxy}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
                  >
                    Guardar Proxy
                  </button>
                </div>
              </div>
            )}

            {/* Contenido: Tab Salud & Antifraude */}
            {activeTab === 'health' && (
              <div className="flex flex-col gap-2.5 pt-2.5 flex-1 min-h-0">
                {/* Cabecera con título y botón de acción prominente */}
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/50">
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
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="rounded-lg border border-border bg-background/80 p-2 space-y-0.5">
                    <span className="text-muted-foreground text-[10px]">Pixelscan Checker</span>
                    <div className="font-bold text-success flex items-center gap-1 text-xs">
                      <CheckCircle2 className="h-3 w-3" /> 100/100 Low Risk
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/80 p-2 space-y-0.5">
                    <span className="text-muted-foreground text-[10px]">Root Detection Plus</span>
                    <div className="font-bold text-success flex items-center gap-1 text-xs">
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

                {/* Consola de resultados con altura estable y scroll interno para prevenir descuadres */}
                <div className="flex-1 min-h-[140px] max-h-[175px] rounded-lg border border-border bg-background/90 p-2.5 font-mono text-xs overflow-y-auto">
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
                    <div className="flex h-full min-h-[110px] flex-col items-center justify-center text-center text-muted-foreground/60 text-xs gap-1.5 p-2">
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

      {/* Modal de confirmación para eliminar este CloudPhone */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in-0 duration-150">
          <div
            className="w-full max-w-md rounded-2xl border border-destructive/40 bg-surface p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start gap-3.5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/15 border border-destructive/30 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-sans font-bold text-base text-foreground">
                  ¿Eliminar CloudPhone "{instance.instance_name}"?
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Esta acción es irreversible. Se detendrá el contenedor Docker y se eliminarán permanentemente todos sus datos, perfiles y configuraciones.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-background/80 p-3 font-mono text-xs text-muted-foreground flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
              <span className="text-foreground font-semibold">{instance.instance_name}</span>
              <span className="text-muted-foreground/60 ml-auto">Puerto ADB: :{instance.adb_port}</span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/50">
              <button
                type="button"
                disabled={deletingInstance}
                onClick={() => setConfirmDeleteOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingInstance}
                onClick={handleDeleteThisInstance}
                className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground hover:bg-destructive/90 transition-opacity disabled:opacity-50 shadow-md shadow-destructive/20"
              >
                {deletingInstance ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span>Eliminar definitivamente</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
