import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import type { Instance } from '../../types';
import { useScrcpyStream } from '../../lib/scrcpy/useScrcpyStream';
import { useFps } from '../../lib/scrcpy/useFps';
import { AndroidKeyCode, TouchAction } from '../../lib/scrcpy/protocol';

interface ScrcpyLiveScreenProps {
  instance: Instance;
  isFocused: boolean;
  onReleaseFocus: () => void;
  className?: string;
  visible?: boolean;
}

export function ScrcpyLiveScreen({
  instance,
  isFocused,
  onReleaseFocus,
  className = '',
  visible = true,
}: ScrcpyLiveScreenProps) {
  const nativeWidth = Number(instance.display?.width) || 720;
  const nativeHeight = Number(instance.display?.height) || 1560;
  const isPointerDownRef = useRef(false);
  const backTimeoutRef = useRef<number | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(() =>
    typeof document !== 'undefined' ? document.hidden : false
  );

  useEffect(() => {
    const onVisibility = () => setDocumentHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const [debugOpen, setDebugOpen] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setDebugOpen((s) => !s);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  const {
    canvasRef,
    status,
    error,
    hasFirstFrame,
    telemetry,
    sendTouch,
    sendScroll,
    sendKeyCode,
    sendText,
    reconnectNow,
  } = useScrcpyStream({
    adbPort: instance.adb_port,
    width: nativeWidth,
    height: nativeHeight,
    enabled: isFocused && instance.running && visible && !documentHidden,
    debugOpen,
  });

  // Al cambiar de instancia (FocusView reutiliza el componente sin key),
  // resetear estado local de puntero y timeouts pendientes.
  useEffect(() => {
    isPointerDownRef.current = false;
    if (backTimeoutRef.current) {
      window.clearTimeout(backTimeoutRef.current);
      backTimeoutRef.current = null;
    }
  }, [instance.instance_name]);

  useEffect(() => {
    if (isFocused && canvasRef.current) {
      canvasRef.current.focus();
    }
  }, [isFocused, canvasRef]);

  const isLive = status === 'live';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    // ESC siempre libera el foco, incluso antes del primer frame.
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onReleaseFocus();
      return;
    }

    // Mientras no haya imagen, ignorar el resto de la entrada para evitar
    // toques contra el frame anterior o coordenadas obsoletas.
    if (!isLive) {
      // Pero sí bloqueamos atajos del navegador mientras el canvas tiene foco.
      blockBrowserShortcuts(e);
      return;
    }

    if (e.key === 'Process' || isComposing) {
      // IME en composición: no interceptar.
      return;
    }

    blockBrowserShortcuts(e);

    let androidCode: number | null = null;
    if (e.key === 'Backspace') androidCode = AndroidKeyCode.KEYCODE_DEL;
    else if (e.key === 'Enter') androidCode = AndroidKeyCode.KEYCODE_ENTER;
    else if (e.key === 'Tab') androidCode = AndroidKeyCode.KEYCODE_TAB;
    else if (e.key === 'ArrowUp') androidCode = AndroidKeyCode.KEYCODE_DPAD_UP;
    else if (e.key === 'ArrowDown') androidCode = AndroidKeyCode.KEYCODE_DPAD_DOWN;
    else if (e.key === 'ArrowLeft') androidCode = AndroidKeyCode.KEYCODE_DPAD_LEFT;
    else if (e.key === 'ArrowRight') androidCode = AndroidKeyCode.KEYCODE_DPAD_RIGHT;
    else if (e.key === 'Home') androidCode = AndroidKeyCode.KEYCODE_HOME;

    if (androidCode !== null) {
      e.preventDefault();
      e.stopPropagation();
      sendKeyCode(0, androidCode);
      return;
    }

    // Caracteres imprimibles, incluyendo astrales (e.key.length === 2 para
    // algunos planes altos) y AltGraph.
    const isAstral = e.key.length === 2 && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(e.key);
    const isAltGr = e.getModifierState('AltGraph');
    const isPrintable =
      (e.key.length === 1 || isAstral) &&
      (!e.ctrlKey || isAltGr) &&
      !e.metaKey;

    if (isPrintable) {
      e.preventDefault();
      e.stopPropagation();
      sendText(e.key);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!isLive) return;
    if (e.key === 'Process' || isComposing) return;

    let androidCode: number | null = null;
    if (e.key === 'Backspace') androidCode = AndroidKeyCode.KEYCODE_DEL;
    else if (e.key === 'Enter') androidCode = AndroidKeyCode.KEYCODE_ENTER;
    else if (e.key === 'Tab') androidCode = AndroidKeyCode.KEYCODE_TAB;
    else if (e.key === 'ArrowUp') androidCode = AndroidKeyCode.KEYCODE_DPAD_UP;
    else if (e.key === 'ArrowDown') androidCode = AndroidKeyCode.KEYCODE_DPAD_DOWN;
    else if (e.key === 'ArrowLeft') androidCode = AndroidKeyCode.KEYCODE_DPAD_LEFT;
    else if (e.key === 'ArrowRight') androidCode = AndroidKeyCode.KEYCODE_DPAD_RIGHT;
    else if (e.key === 'Home') androidCode = AndroidKeyCode.KEYCODE_HOME;

    if (androidCode !== null) {
      e.preventDefault();
      e.stopPropagation();
      sendKeyCode(1, androidCode);
    }
  };

  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLCanvasElement>) => {
    setIsComposing(false);
    if (e.data) sendText(e.data);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLCanvasElement>) => {
    if (!isLive) return;
    const text = e.clipboardData.getData('text');
    if (text) {
      e.preventDefault();
      e.stopPropagation();
      sendText(text);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    canvasRef.current?.focus();

    if (!isLive) return;

    if (e.button === 2) {
      sendKeyCode(0, AndroidKeyCode.KEYCODE_BACK);
      if (backTimeoutRef.current) window.clearTimeout(backTimeoutRef.current);
      backTimeoutRef.current = window.setTimeout(() => {
        backTimeoutRef.current = null;
        sendKeyCode(1, AndroidKeyCode.KEYCODE_BACK);
      }, 50);
      return;
    }

    if (e.button === 0) {
      isPointerDownRef.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignorar si el puntero no puede capturarse
      }
      sendTouch(TouchAction.ACTION_DOWN, e.clientX, e.clientY);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLive || !isPointerDownRef.current) return;
    sendTouch(TouchAction.ACTION_MOVE, e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLive || !isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignorar si el puntero ya fue liberado
    }
    sendTouch(TouchAction.ACTION_UP, e.clientX, e.clientY);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLive) return;
    sendScroll(e.clientX, e.clientY, e.deltaX, e.deltaY);
  };

  if (!isFocused || !instance.running) {
    return null;
  }

  return (
    <div
      data-live-screen
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className={`absolute inset-0 z-10 h-full w-full bg-black select-none overflow-hidden ${className}`}
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onPaste={handlePaste}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="h-full w-full object-cover select-none pointer-events-auto touch-none cursor-crosshair focus:outline-none"
      />

      {/* Indicador de estado / carga */}
      {!hasFirstFrame && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/90 text-primary pointer-events-auto">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider text-center px-2">
            {status === 'error' ? error || 'Error de streaming' : statusLabel(status)}
          </span>
          {status === 'error' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                reconnectNow();
              }}
              className="rounded-sm border border-primary/40 bg-primary/20 px-2 py-0.5 text-[10px] font-mono font-bold text-primary hover:bg-primary/30"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {/* Badge de FPS real y estado */}
      {hasFirstFrame && <FpsBadge adbPort={instance.adb_port} />}

      {/* Panel de telemetría ligero (Ctrl+Shift+D) */}
      {debugOpen && <TelemetryOverlay telemetry={telemetry} />}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'connecting':
      return 'Conectando WebSocket...';
    case 'waiting-idr':
      return 'Esperando imagen clave (IDR)...';
    case 'reconnecting':
      return 'Reconectando...';
    case 'live':
      return 'Sincronizando...';
    default:
      return 'Iniciando stream...';
  }
}

function blockBrowserShortcuts(e: React.KeyboardEvent<HTMLCanvasElement>) {
  // Estos atajos se pueden neutralizar de forma fiable mientras el canvas
  // tiene el foco. No incluimos Ctrl+W/Ctrl+T/Ctrl+N porque los navegadores
  // reservan el cierre/pestaña/ventana y no permiten cancelarlos de forma
  // confiable.
  if (e.key === 'F5' || e.key === 'F11') {
    e.preventDefault();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'r' || e.key.toLowerCase() === 'l')) {
    e.preventDefault();
  }
}

function FpsBadge({ adbPort }: { adbPort: number }) {
  const fps = useFps(adbPort);
  return (
    <span className="absolute left-7 top-1 z-20 inline-flex items-center gap-1 rounded-xs bg-primary text-primary-foreground font-mono text-[8px] font-bold px-1.5 py-px shadow-xs animate-in fade-in duration-150">
      <Zap className="h-2.5 w-2.5" />
      {fps} FPS
    </span>
  );
}

function TelemetryOverlay({ telemetry }: { telemetry: import('../../lib/scrcpy/useScrcpyStream').ScrcpyTelemetry }) {
  return (
    <div className="absolute right-1 top-6 z-30 min-w-[140px] rounded-xs border border-border bg-black/90 p-1.5 font-mono text-[9px] text-primary-foreground/90 shadow-xs pointer-events-none">
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">FPS pintados</span>
        <span className="font-bold">{telemetry.fpsPainted}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">Cola decoder</span>
        <span className="font-bold">{telemetry.decodeQueueSizeMax}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">Buffer WS</span>
        <span className="font-bold">{telemetry.bufferedAmountMax}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">Reconexiones</span>
        <span className="font-bold">{telemetry.reconnects}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">1er frame</span>
        <span className="font-bold">{telemetry.firstFrameMs ?? '-'} ms</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">Config</span>
        <span className="font-bold">{telemetry.decoderConfig}</span>
      </div>
    </div>
  );
}
