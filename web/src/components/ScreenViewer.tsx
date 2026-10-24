import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  ArrowLeft,
  Camera,
  Circle,
  ExternalLink,
  Link2,
  Loader2,
  Pause,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  Send,
  Smartphone,
  Square,
  Type,
  Users,
  Volume1,
  Volume2,
  Zap,
} from 'lucide-react';
import type { Instance, ScrcpyStreamInfo } from '../types';
import { api } from '../lib/api';
import ScreenStream from './focus/ScreenStream';
import { IconBtn } from './ui/IconBtn';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { toast } from 'sonner';

interface ScreenViewerProps {
  instance: Instance;
  groupInstances?: string[];
  groupMode?: boolean;
  onStart?: () => void;
  onChanged?: () => void;
}

export default function ScreenViewer({
  instance,
  groupInstances = [],
  groupMode = false,
  onStart,
  onChanged,
}: ScreenViewerProps) {
  const [paused, setPaused] = useState(false);
  const [starting, setStarting] = useState(false);
  const [, setLive] = useState(false);
  const [streamInfo, setStreamInfo] = useState<ScrcpyStreamInfo | null>(null);
  const [preferNative, setPreferNative] = useState(true);
  const [nativeLoaded, setNativeLoaded] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  // Popovers
  const [textOpen, setTextOpen] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlValue, setUrlValue] = useState('');

  const screenRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number; t: number } | null>(null);

  const nativeWidth = Number(instance.display?.width) || 1080;
  const nativeHeight = Number(instance.display?.height) || 2340;
  const grouped = groupMode && groupInstances.length > 1;
  const nativeActive = instance.running && !grouped && preferNative && !!streamInfo?.available;

  useEffect(() => {
    if (!instance.running) {
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
  }, [instance.instance_name, instance.running]);

  const toNative = useCallback(
    (clientX: number, clientY: number) => {
      const rect = screenRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const x = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * nativeWidth;
      const y = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1) * nativeHeight;
      return { x: Math.round(x), y: Math.round(y) };
    },
    [nativeWidth, nativeHeight]
  );

  const sendKey = async (key: string, label: string) => {
    try {
      if (grouped) await api.groupKey(groupInstances, key);
      else await api.sendKey(instance.instance_name, key);
      toast.success(`Tecla ${label} enviada`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al enviar tecla');
    }
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (!instance.running) return;
    pointerStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };

  const handlePointerUp = async (e: PointerEvent) => {
    if (!instance.running || !pointerStart.current) return;
    const start = pointerStart.current;
    pointerStart.current = null;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const distance = Math.hypot(dx, dy);
    try {
      if (distance < 12) {
        const { x, y } = toNative(e.clientX, e.clientY);
        if (grouped) await api.groupTap(groupInstances, x, y);
        else await api.sendTap(instance.instance_name, x, y);
      } else {
        const from = toNative(start.x, start.y);
        const to = toNative(e.clientX, e.clientY);
        const duration = Math.min(Math.max(Date.now() - start.t, 120), 1200);
        if (grouped) await api.groupSwipe(groupInstances, from.x, from.y, to.x, to.y, duration);
        else await api.sendSwipe(instance.instance_name, from.x, from.y, to.x, to.y, duration);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar gesto táctil');
    }
  };

  const handleTogglePower = async () => {
    setStarting(true);
    const toastId = toast.loading(instance.running ? 'Apagando dispositivo...' : 'Encendiendo dispositivo...');
    try {
      if (instance.running) {
        await api.stopInstance(instance.instance_name);
        toast.success('Dispositivo apagado', { id: toastId });
      } else {
        await api.startInstance(instance.instance_name);
        toast.success('Dispositivo encendido', { id: toastId });
        onStart?.();
      }
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cambiar estado', { id: toastId });
    } finally {
      setStarting(false);
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
      toast.success('Captura descargada');
    } catch {
      toast.error('No se pudo descargar la captura');
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
      toast.success('Texto enviado al dispositivo');
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
      toast.success('URL abierta en el navegador');
    } catch {
      toast.error('Error al abrir URL');
    }
  };

  return (
    <div className="relative flex h-full min-h-0 w-full items-center justify-center p-4 select-none">
      {grouped && (
        <div className="absolute left-6 top-4 z-30 flex items-center gap-2 rounded-full border border-violet-500/40 bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-300 backdrop-blur">
          <Users size={13} />
          Modo Grupo · {groupInstances.length} dispositivos sincronizados
        </div>
      )}

      <div className="flex h-full max-h-[860px] items-center gap-3.5">
        {/* ── BASTIDOR DE CHASSIS MÓVIL (CUADRA EXACTO CON LA PANTALLA) ── */}
        <div className="relative flex h-full max-h-full items-center justify-center rounded-[2.2rem] bg-zinc-950 border-[5px] border-zinc-800/90 shadow-2xl ring-1 ring-zinc-700/60 p-2 transition-all">
          {/* Pantalla con Aspect Ratio Matemáticamente Exacto */}
          <div
            ref={screenRef}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            style={{ aspectRatio: `${nativeWidth} / ${nativeHeight}` }}
            className="relative h-full max-h-full overflow-hidden rounded-[1.6rem] bg-black border border-zinc-900 shadow-inner flex flex-col"
          >
            {/* Notch / Cámara Punch-Hole Superior Centrada */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-black border border-zinc-800 shadow-inner z-30 pointer-events-none" />

            {/* Barra de Estado Transparente de Cabecera */}
            <div className="absolute top-1.5 inset-x-3 flex items-center justify-between text-[9px] font-mono text-zinc-400/90 z-20 pointer-events-none drop-shadow">
              <span className="font-semibold">12:00</span>
              <span className="text-[8px] tracking-wider">5G 100%</span>
            </div>

            {/* Stream Scrcpy de Baja Latencia o Canvas */}
            {nativeActive && streamInfo ? (
              <div className="relative h-full w-full bg-black">
                {!nativeLoaded && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-zinc-950">
                    <Loader2 size={24} className="animate-spin text-emerald-400" />
                    <p className="text-xs text-zinc-400">Conectando visor scrcpy H.264...</p>
                  </div>
                )}
                <iframe
                  key={frameKey}
                  src={streamInfo.embed_url}
                  title={`scrcpy ${instance.instance_name}`}
                  allow="autoplay; fullscreen"
                  onLoad={() => setNativeLoaded(true)}
                  className="h-full w-full border-0 bg-black"
                />
              </div>
            ) : instance.running ? (
              paused ? (
                <div className="flex h-full items-center justify-center text-xs text-zinc-600">
                  Stream pausado
                </div>
              ) : (
                <ScreenStream
                  name={instance.instance_name}
                  running={instance.running}
                  active={!paused}
                  onFirstFrame={() => setLive(true)}
                />
              )
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center text-zinc-700">
                <Smartphone size={40} className="opacity-30" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Dispositivo Apagado
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    Enciende el CloudPhone para iniciar la pantalla interactiva.
                  </p>
                </div>
              </div>
            )}

            {/* Barra inferior de gestos Android integrada */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 h-1 w-16 rounded-full bg-white/30 pointer-events-none z-20" />
          </div>
        </div>

        {/* ── DOCK LATERAL DE CONTROL (ESTRICTAMENTE BOTONES DE ICONO CON TOOLTIPS) ── */}
        <div className="flex flex-col gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-md">
          {/* Encendido / Apagado */}
          <IconBtn
            icon={starting ? Loader2 : instance.running ? PowerOff : Power}
            label={instance.running ? 'Apagar dispositivo' : 'Encender dispositivo'}
            variant={instance.running ? 'danger' : 'success'}
            side="right"
            disabled={starting}
            onClick={handleTogglePower}
          />

          <SepVertical />

          {/* Botones Físicos Android: Atrás, Inicio, Recientes */}
          <IconBtn
            icon={ArrowLeft}
            label="Atrás (Android Back)"
            side="right"
            disabled={!instance.running}
            onClick={() => sendKey('back', 'Atrás')}
          />
          <IconBtn
            icon={Circle}
            label="Inicio (Android Home)"
            side="right"
            disabled={!instance.running}
            onClick={() => sendKey('home', 'Inicio')}
          />
          <IconBtn
            icon={Square}
            label="Apps Recientes (Android Recents)"
            side="right"
            disabled={!instance.running}
            onClick={() => sendKey('recents', 'Recientes')}
          />

          <SepVertical />

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

          <SepVertical />

          {/* Captura de pantalla */}
          <IconBtn
            icon={Camera}
            label="Descargar captura de pantalla"
            side="right"
            disabled={!instance.running}
            onClick={handleDownload}
          />

          {/* Escribir texto vía Popover */}
          <Popover open={textOpen} onOpenChange={setTextOpen}>
            <PopoverTrigger asChild>
              <div>
                <IconBtn
                  icon={Type}
                  label="Escribir texto vía ADB"
                  side="right"
                  variant={textOpen ? 'active' : 'ghost'}
                  disabled={!instance.running}
                />
              </div>
            </PopoverTrigger>
            <PopoverContent side="right" className="w-72">
              <div className="mb-2 text-xs font-semibold text-zinc-200">Escribir texto</div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  autoFocus
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                  placeholder="Texto a enviar..."
                  className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
                <IconBtn icon={Send} label="Enviar" variant="primary" size="sm" onClick={handleSendText} />
              </div>
            </PopoverContent>
          </Popover>

          {/* Abrir URL vía Popover */}
          <Popover open={urlOpen} onOpenChange={setUrlOpen}>
            <PopoverTrigger asChild>
              <div>
                <IconBtn
                  icon={Link2}
                  label="Abrir enlace en el navegador"
                  side="right"
                  variant={urlOpen ? 'active' : 'ghost'}
                  disabled={!instance.running}
                />
              </div>
            </PopoverTrigger>
            <PopoverContent side="right" className="w-72">
              <div className="mb-2 text-xs font-semibold text-zinc-200">Abrir URL</div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  autoFocus
                  value={urlValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendUrl()}
                  placeholder="https://..."
                  className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
                <IconBtn icon={Send} label="Abrir" variant="primary" size="sm" onClick={handleSendUrl} />
              </div>
            </PopoverContent>
          </Popover>

          <SepVertical />

          {/* Alternar Stream: Scrcpy nativo vs Canvas */}
          {instance.running && streamInfo?.available && (
            <IconBtn
              icon={Zap}
              label={preferNative ? 'Usando scrcpy (cambiar a canvas)' : 'Usando canvas (cambiar a scrcpy)'}
              variant={preferNative ? 'active' : 'solid'}
              side="right"
              onClick={() => setPreferNative((v) => !v)}
            />
          )}

          {/* Recargar stream */}
          <IconBtn
            icon={RefreshCw}
            label="Recargar stream"
            side="right"
            disabled={!instance.running}
            onClick={() => {
              setNativeLoaded(false);
              setFrameKey((k) => k + 1);
            }}
          />

          {/* Pausar stream (solo en canvas) */}
          {!preferNative && (
            <IconBtn
              icon={paused ? Play : Pause}
              label={paused ? 'Reanudar stream' : 'Pausar stream'}
              side="right"
              disabled={!instance.running}
              onClick={() => setPaused((p) => !p)}
            />
          )}

          {/* Abrir en pestaña nueva */}
          {streamInfo?.embed_url && (
            <a
              href={streamInfo.embed_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir scrcpy en pestaña dedicada"
            >
              <IconBtn icon={ExternalLink} label="Abrir en ventana nueva" side="right" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

const SepVertical = () => <div className="mx-auto my-0.5 h-px w-5 bg-zinc-800" />;
