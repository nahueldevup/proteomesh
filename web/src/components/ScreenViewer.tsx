import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  RotateCcw,
  Square,
  Circle,
  ChevronLeft,
  Power,
  Volume2,
  Volume1,
  Monitor,
  Send,
  Globe,
  Download,
  Loader2,
  CheckCircle2,
  Pause,
  ExternalLink,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Instance } from '../types';

interface ScreenViewerProps {
  instance: Instance;
  onRefreshInstance?: () => void;
}

export const ScreenViewer: React.FC<ScreenViewerProps> = ({
  instance,
  onRefreshInstance,
}) => {
  const [timestamp, setTimestamp] = useState<number>(() => Date.now());
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(true);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number>(1500);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  // Quick inputs
  const [textInput, setTextInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [scrcpyMessage, setScrcpyMessage] = useState<string | null>(null);

  // Mouse drag tracking for swipe
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // Native resolution resolution
  const nativeWidth = 1080;
  const nativeHeight = 2340;

  // Refresh interval
  useEffect(() => {
    if (!instance.running || !isAutoRefresh) return;
    const interval = setInterval(() => {
      setTimestamp(Date.now());
    }, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [instance.running, isAutoRefresh, refreshIntervalMs]);

  // Touch / Tap handler
  const handleImageMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    dragStartRef.current = { x, y, time: Date.now() };
  };

  const handleImageMouseUp = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !dragStartRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    const start = dragStartRef.current;
    dragStartRef.current = null;

    const scaleX = nativeWidth / rect.width;
    const scaleY = nativeHeight / rect.height;

    const dx = endX - start.x;
    const dy = endY - start.y;
    const dist = Math.hypot(dx, dy);

    // Si el movimiento fue menor a 8px, es un tap
    if (dist < 8) {
      const realX = Math.round(start.x * scaleX);
      const realY = Math.round(start.y * scaleY);
      setLastAction(`Tap (${realX}, ${realY})`);
      try {
        await api.sendTap(instance.instance_name, realX, realY);
        // Refrescar frame rápido tras acción
        setTimeout(() => setTimestamp(Date.now()), 300);
      } catch (err: any) {
        setLastAction(`Error tap: ${err.message}`);
      }
    } else {
      // Es un swipe
      const realX1 = Math.round(start.x * scaleX);
      const realY1 = Math.round(start.y * scaleY);
      const realX2 = Math.round(endX * scaleX);
      const realY2 = Math.round(endY * scaleY);
      const duration = Math.min(Math.max(Date.now() - start.time, 100), 1000);
      setLastAction(`Swipe (${realX1}, ${realY1}) → (${realX2}, ${realY2})`);
      try {
        await api.sendSwipe(instance.instance_name, realX1, realY1, realX2, realY2, duration);
        setTimeout(() => setTimestamp(Date.now()), 400);
      } catch (err: any) {
        setLastAction(`Error swipe: ${err.message}`);
      }
    }
  };

  // Android Navigation Keys
  const handleKey = async (key: string, label: string) => {
    setLastAction(`Tecla: ${label}`);
    try {
      await api.sendKey(instance.instance_name, key);
      setTimeout(() => setTimestamp(Date.now()), 300);
    } catch (err: any) {
      setLastAction(`Error tecla: ${err.message}`);
    }
  };

  // Launch scrcpy native
  const handleLaunchScrcpy = async () => {
    setActionLoading(true);
    setScrcpyMessage(null);
    try {
      const res = await api.launchScrcpy(instance.instance_name);
      setScrcpyMessage(res.message);
      setTimeout(() => setScrcpyMessage(null), 8000);
    } catch (err: any) {
      alert(`Error al lanzar scrcpy: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Send text
  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    setActionLoading(true);
    try {
      await api.sendText(instance.instance_name, textInput);
      setTextInput('');
      setLastAction('Texto inyectado');
      setTimeout(() => setTimestamp(Date.now()), 300);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Open URL
  const handleLaunchUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setActionLoading(true);
    try {
      await api.launchUrl(instance.instance_name, urlInput);
      setUrlInput('');
      setLastAction('URL abierta');
      setTimeout(() => setTimestamp(Date.now()), 800);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Download screenshot
  const handleDownloadScreenshot = () => {
    const link = document.createElement('a');
    link.href = api.getScreenUrl(instance.instance_name, Date.now());
    link.download = `${instance.instance_name}-screen-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Start instance if offline
  const handleStartInstance = async () => {
    setActionLoading(true);
    try {
      await api.startInstance(instance.instance_name);
      if (onRefreshInstance) onRefreshInstance();
      setTimestamp(Date.now());
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (!instance.running) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/30 border border-zinc-800 rounded-xl text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
          <Power className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">CloudPhone Apagado (Offline)</h3>
          <p className="text-xs text-zinc-500 max-w-xs mt-1">
            Inicia el contenedor Docker para ver la pantalla en tiempo real y operar el dispositivo.
          </p>
        </div>
        <button
          onClick={handleStartInstance}
          disabled={actionLoading}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
        >
          {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
          <span>Iniciar CloudPhone</span>
        </button>
      </div>
    );
  }

  const screenUrl = api.getScreenUrl(instance.instance_name, timestamp);

  return (
    <div className="space-y-4">
      {/* Barra superior de herramientas scrcpy */}
      <div className="bg-gradient-to-r from-blue-950/40 via-zinc-900/60 to-zinc-900/40 border border-blue-500/20 rounded-xl p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <Monitor className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
              <span>Control Remoto scrcpy</span>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-500/20 font-mono">
                OpenGL 30 FPS
              </span>
            </div>
            <div className="text-[11px] text-zinc-400">Ventana nativa de ultra baja latencia con teclado y ratón</div>
          </div>
        </div>

        <button
          onClick={handleLaunchScrcpy}
          disabled={actionLoading}
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0"
          title="Abre la ventana de scrcpy en el escritorio de tu sistema operativo"
        >
          {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
          <span>Abrir Ventana Nativa</span>
        </button>
      </div>

      {scrcpyMessage && (
        <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{scrcpyMessage}</span>
        </div>
      )}

      {/* Contenedor principal: Smartphone + Controles */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        {/* Smartphone Frame (Izquierda) */}
        <div className="md:col-span-7 flex flex-col items-center">
          {/* Carcasa del teléfono */}
          <div className="relative w-full max-w-[280px] bg-zinc-900 border-4 border-zinc-800 rounded-[28px] p-2 shadow-2xl shadow-black/80 flex flex-col">
            {/* Notch superior */}
            <div className="w-full h-4 flex items-center justify-center mb-1">
              <div className="w-16 h-3 bg-zinc-950 rounded-full flex items-center justify-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
                <div className="w-1 h-1 rounded-full bg-blue-500/60" />
              </div>
            </div>

            {/* Pantalla viva (Canvas interactivo) */}
            <div className="relative w-full aspect-[9/19.5] bg-black rounded-[18px] overflow-hidden border border-zinc-950 cursor-crosshair select-none">
              <img
                ref={imgRef}
                src={screenUrl}
                alt="Pantalla Android en vivo"
                draggable={false}
                onMouseDown={handleImageMouseDown}
                onMouseUp={handleImageMouseUp}
                onLoad={() => setImageLoading(false)}
                className="w-full h-full object-contain pointer-events-auto scrcpy-frame"
              />

              {/* Overlay de loading sutil */}
              {imageLoading && (
                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm p-1 rounded-full">
                  <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                </div>
              )}
            </div>

            {/* Barra de navegación virtual Android (Inferior) */}
            <div className="w-full pt-2 pb-1 flex items-center justify-around text-zinc-400">
              <button
                type="button"
                onClick={() => handleKey('back', 'Atrás')}
                className="p-1.5 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
                title="Atrás (Back)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleKey('home', 'Inicio')}
                className="p-1.5 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
                title="Inicio (Home)"
              >
                <Circle className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleKey('recents', 'Apps recientes')}
                className="p-1.5 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
                title="Multitarea (Recientes)"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Hint de uso */}
          <div className="text-[10px] text-zinc-500 mt-2 text-center">
            Haz clic para tocar la pantalla · Arrastra para deslizar (swipe)
          </div>
          {lastAction && (
            <div className="text-[10px] font-mono text-blue-400 mt-0.5 truncate max-w-full">
              {lastAction}
            </div>
          )}
        </div>

        {/* Panel lateral de controles y comandos (Derecha) */}
        <div className="md:col-span-5 space-y-3">
          {/* Botones de Hardware */}
          <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-2">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Botones de Hardware
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => handleKey('power', 'Encendido / Bloqueo')}
                className="p-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs flex flex-col items-center gap-1 transition-colors"
                title="Bloquear / Despertar pantalla"
              >
                <Power className="w-3.5 h-3.5 text-red-400" />
                <span className="text-[10px]">Bloqueo</span>
              </button>
              <button
                type="button"
                onClick={() => handleKey('volup', 'Volumen +')}
                className="p-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs flex flex-col items-center gap-1 transition-colors"
                title="Subir volumen"
              >
                <Volume2 className="w-3.5 h-3.5 text-zinc-300" />
                <span className="text-[10px]">Vol +</span>
              </button>
              <button
                type="button"
                onClick={() => handleKey('voldown', 'Volumen -')}
                className="p-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs flex flex-col items-center gap-1 transition-colors"
                title="Bajar volumen"
              >
                <Volume1 className="w-3.5 h-3.5 text-zinc-300" />
                <span className="text-[10px]">Vol -</span>
              </button>
            </div>
          </div>

          {/* Escribir texto rápido */}
          <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-2">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Escribir Texto en Android
            </span>
            <form onSubmit={handleSendText} className="flex gap-1.5">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Escribe texto o contraseña..."
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={actionLoading || !textInput.trim()}
                className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg transition-colors"
                title="Enviar texto"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

          {/* Abrir URL en Navegador */}
          <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-2">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Navegar a URL Web
            </span>
            <form onSubmit={handleLaunchUrl} className="flex gap-1.5">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="ej: pixelscan.net o google.com"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={actionLoading || !urlInput.trim()}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 rounded-lg transition-colors"
                title="Abrir en Chrome"
              >
                <Globe className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

          {/* Opciones de streaming y captura */}
          <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">Refresco Web en Vivo:</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1 ${
                    isAutoRefresh
                      ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {isAutoRefresh ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                  <span>{isAutoRefresh ? 'Pausar' : 'Reanudar'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTimestamp(Date.now())}
                  className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded"
                  title="Capturar frame actual ahora"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-zinc-400">Intervalo de captura:</span>
              <div className="flex gap-1">
                {[
                  { label: '1s', ms: 1000 },
                  { label: '2s', ms: 2000 },
                  { label: '3s', ms: 3000 },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setRefreshIntervalMs(item.ms)}
                    className={`px-1.5 py-0.5 text-[10px] rounded border ${
                      refreshIntervalMs === item.ms
                        ? 'bg-blue-600/30 border-blue-500/60 text-blue-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
              <span className="text-[11px] text-zinc-400">Captura de pantalla:</span>
              <button
                type="button"
                onClick={handleDownloadScreenshot}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px] flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3 h-3" />
                <span>Guardar PNG</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
