import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Download, ExternalLink, Loader2, Pause, Play, Radio, RefreshCw, Smartphone, Users, Zap } from 'lucide-react';
import type { Instance, ScrcpyStreamInfo } from '../types';
import { api } from '../lib/api';
import ScreenStream from './focus/ScreenStream';

interface ScreenViewerProps {
  instance: Instance;
  groupInstances?: string[];
  groupMode?: boolean;
  onStart?: () => void;
}

export default function ScreenViewer({ instance, groupInstances = [], groupMode = false, onStart }: ScreenViewerProps) {
  const [paused, setPaused] = useState(false);
  const [starting, setStarting] = useState(false);
  const [live, setLive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [streamInfo, setStreamInfo] = useState<ScrcpyStreamInfo | null>(null);
  const [preferNative, setPreferNative] = useState(true);
  const [nativeLoaded, setNativeLoaded] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const screenRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number; t: number } | null>(null);

  const nativeWidth = Number(instance.display?.width) || 1080;
  const nativeHeight = Number(instance.display?.height) || 2340;
  const grouped = groupMode && groupInstances.length > 1;
  const nativeActive = instance.running && !grouped && preferNative && !!streamInfo?.available;

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(null), 2200);
    return () => window.clearTimeout(t);
  }, [message]);

  useEffect(() => {
    if (!instance.running) {
      setStreamInfo(null);
      return;
    }
    const supportsWebCodecs = typeof window !== 'undefined' && 'VideoDecoder' in window;
    let alive = true;
    api.getStreamInfo(instance.instance_name, supportsWebCodecs ? 'webcodecs' : 'mse')
      .then((info) => { if (alive) setStreamInfo(info); })
      .catch(() => { if (alive) setStreamInfo(null); });
    return () => { alive = false; };
  }, [instance.instance_name, instance.running]);

  const toNative = useCallback((clientX: number, clientY: number) => {
    const rect = screenRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const x = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * nativeWidth;
    const y = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1) * nativeHeight;
    return { x: Math.round(x), y: Math.round(y) };
  }, [nativeWidth, nativeHeight]);

  const sendKey = async (key: string) => {
    try {
      if (grouped) await api.groupKey(groupInstances, key);
      else await api.sendKey(instance.instance_name, key);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error al enviar tecla');
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!instance.running) return;
    pointerStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };

  const handlePointerUp = async (e: React.PointerEvent) => {
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
      setMessage(err instanceof Error ? err.message : 'Error al enviar gesto');
    }
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      await api.startInstance(instance.instance_name);
      onStart?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo iniciar');
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
    } catch {
      setMessage('No se pudo descargar la captura');
    }
  };

  if (nativeActive && streamInfo) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col gap-2 p-3">
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              scrcpy
            </span>
            <span className="truncate text-[11px] text-zinc-400">
              30 FPS · H.264 · {streamInfo.player === 'webcodecs' ? 'WebCodecs' : 'MSE'}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => {
                setNativeLoaded(false);
                setFrameKey((k) => k + 1);
              }}
              title="Reconectar stream"
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-100"
            >
              <RefreshCw size={14} />
            </button>
            <a
              href={streamInfo.embed_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir en pestaña nueva"
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-100"
            >
              <ExternalLink size={14} />
            </a>
            <button
              onClick={() => setPreferNative(false)}
              title="Cambiar al visor canvas (fallback)"
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
            >
              Canvas
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-700/60 bg-black shadow-2xl shadow-black/60 ring-1 ring-zinc-800/80">
          {!nativeLoaded && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-950">
              <Loader2 size={22} className="animate-spin text-emerald-400" />
              <div className="text-center">
                <p className="text-xs font-medium text-zinc-300">Conectando visor nativo scrcpy</p>
                <p className="mt-1 text-[10px] text-zinc-500">H.264 · baja latencia</p>
              </div>
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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6">
            <p className="text-[10px] text-zinc-400">
              Control nativo scrcpy · el teclado y el ratón se gestionan dentro del visor
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full items-center justify-center p-3">
      {grouped && (
        <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full border border-violet-500/40 bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-300">
          <Users size={13} />
          Grupo · {groupInstances.length} dispositivos
        </div>
      )}

      <div
        className="relative flex h-full max-h-full flex-col rounded-[2rem] border border-zinc-700/80 bg-black shadow-2xl shadow-black/60 ring-1 ring-zinc-800"
        style={{ aspectRatio: `${nativeWidth} / ${nativeHeight}` }}
      >
        <div className="flex items-center justify-between rounded-t-[2rem] border-b border-zinc-800/80 bg-zinc-950/95 px-3 py-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-400">
            {instance.running && live ? (
              <>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                EN VIVO
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                {instance.running ? 'CONECTANDO' : 'OFFLINE'}
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPaused((p) => !p)}
              disabled={!instance.running}
              title={paused ? 'Reanudar stream' : 'Pausar stream'}
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30"
            >
              {paused ? <Play size={13} /> : <Pause size={13} />}
            </button>
            <button
              onClick={handleDownload}
              disabled={!instance.running}
              title="Descargar captura"
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30"
            >
              <Download size={13} />
            </button>
            {instance.running && streamInfo?.available && (
              <button
                onClick={() => setPreferNative(true)}
                title="Volver al visor nativo scrcpy (baja latencia)"
                className="flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
              >
                <Zap size={11} /> scrcpy
              </button>
            )}
          </div>
        </div>

        <div
          ref={screenRef}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          className="relative min-h-0 flex-1 overflow-hidden bg-zinc-950"
        >
          {instance.running ? (
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
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <Smartphone size={40} className="text-zinc-700" />
              <div>
                <p className="text-sm font-medium text-zinc-300">Dispositivo apagado</p>
                <p className="mt-1 max-w-[180px] text-xs text-zinc-500">
                  Inicia el CloudPhone para ver la pantalla y controlarlo.
                </p>
              </div>
              <button
                onClick={handleStart}
                disabled={starting}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                {starting ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
                Encender dispositivo
              </button>
            </div>
          )}

          {message && (
            <div className="absolute inset-x-3 bottom-3 z-30 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-[11px] text-amber-200">
              {message}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 rounded-b-[2rem] border-t border-zinc-800/80 bg-zinc-950 px-4 py-1.5">
          <button
            onClick={() => sendKey('back')}
            disabled={!instance.running}
            title="Atrás"
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            onClick={() => sendKey('home')}
            disabled={!instance.running}
            title="Inicio"
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={() => sendKey('recents')}
            disabled={!instance.running}
            title="Recientes"
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
