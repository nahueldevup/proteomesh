import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Power, Loader2 } from 'lucide-react';
import type { Instance } from '../../types';
import { api } from '../../lib/api';
import { cn, getErrorMessage } from '../../lib/utils';

interface InteractiveScreenProps {
  instance: Instance;
  className?: string;
  onActionFeedback?: (msg: string) => void;
}

export function InteractiveScreen({
  instance,
  className,
  onActionFeedback,
}: InteractiveScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [currentFrame, setCurrentFrame] = useState<string>('');
  const [isLoadingFirst, setIsLoadingFirst] = useState(true);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const lastWheelTimeRef = useRef<number>(0);

  const nativeWidth = Number(instance.display?.width) || 1080;
  const nativeHeight = Number(instance.display?.height) || 2340;

  // Carga continua de fotogramas sin parpadeos (Double Buffering)
  const frameInFlightRef = useRef(false);
  const loadFrame = useCallback(() => {
    if (!instance.running || frameInFlightRef.current) return;
    frameInFlightRef.current = true;
    const url = api.getScreenUrl(instance.instance_name, Date.now());
    const img = new Image();
    img.onload = () => {
      frameInFlightRef.current = false;
      setCurrentFrame(url);
      setIsLoadingFirst(false);
    };
    img.onerror = () => {
      frameInFlightRef.current = false;
    };
    img.src = url;
  }, [instance.instance_name, instance.running]);

  useEffect(() => {
    if (!instance.running) {
      setCurrentFrame('');
      setIsLoadingFirst(false);
      return;
    }

    setIsLoadingFirst(true);
    loadFrame();

    // Intervalo de actualización en reposo (~500ms para mantener fluidez)
    const timer = window.setInterval(loadFrame, 500);
    return () => window.clearInterval(timer);
  }, [instance.instance_name, instance.running, loadFrame]);

  // Disparo de refresco acelerado tras una acción táctil
  const triggerFastRefresh = () => {
    setTimeout(loadFrame, 60);
    setTimeout(loadFrame, 180);
    setTimeout(loadFrame, 350);
  };

  // ── MANEJADORES DE RATÓN Y TACTIL DIRECTO ────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!instance.running || !containerRef.current) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    dragStartRef.current = { x, y, time: Date.now() };
    setIsInteracting(true);
  };

  const handleMouseUp = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!instance.running || !containerRef.current || !dragStartRef.current) {
      setIsInteracting(false);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    const start = dragStartRef.current;
    dragStartRef.current = null;
    setIsInteracting(false);

    const scaleX = nativeWidth / rect.width;
    const scaleY = nativeHeight / rect.height;

    const dx = endX - start.x;
    const dy = endY - start.y;
    const dist = Math.hypot(dx, dy);

    // Si el desplazamiento fue menor a 8 píxeles se trata de un TAP táctil
    if (dist < 8) {
      const realX = Math.round(start.x * scaleX);
      const realY = Math.round(start.y * scaleY);
      const relX = start.x / rect.width;
      const relY = start.y / rect.height;

      setRipple({ x: relX, y: relY, key: Date.now() });
      onActionFeedback?.(`Tap: (${realX}, ${realY})`);

      try {
        await api.sendTap(instance.instance_name, realX, realY);
        triggerFastRefresh();
      } catch (err) {
        onActionFeedback?.(`Error tap: ${getErrorMessage(err)}`);
      }
    } else {
      // Si el desplazamiento es mayor o igual a 8 píxeles se trata de un SWIPE / ARRASTRE
      const realX1 = Math.round(start.x * scaleX);
      const realY1 = Math.round(start.y * scaleY);
      const realX2 = Math.round(endX * scaleX);
      const realY2 = Math.round(endY * scaleY);
      const durationMs = Math.min(Math.max(Date.now() - start.time, 120), 800);

      onActionFeedback?.(`Swipe: (${realX1}, ${realY1}) → (${realX2}, ${realY2})`);

      try {
        await api.sendSwipe(instance.instance_name, realX1, realY1, realX2, realY2, durationMs);
        triggerFastRefresh();
      } catch (err) {
        onActionFeedback?.(`Error swipe: ${getErrorMessage(err)}`);
      }
    }
  };

  // Soporte para scroll natural con rueda de ratón
  const handleWheel = async (e: React.WheelEvent<HTMLDivElement>) => {
    if (!instance.running) return;
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 250) return; // Debounce de scroll
    lastWheelTimeRef.current = now;

    const centerX = Math.round(nativeWidth / 2);
    const startY = Math.round(nativeHeight * 0.65);
    const endY = Math.round(nativeHeight * 0.35);

    try {
      if (e.deltaY > 0) {
        // Rueda hacia abajo -> Scroll contenido hacia abajo (Swipe arriba)
        await api.sendSwipe(instance.instance_name, centerX, startY, centerX, endY, 200);
      } else if (e.deltaY < 0) {
        // Rueda hacia arriba -> Scroll contenido hacia arriba (Swipe abajo)
        await api.sendSwipe(instance.instance_name, centerX, endY, centerX, startY, 200);
      }
      triggerFastRefresh();
    } catch {
      // Ignorar error de scroll en background
    }
  };

  // Estado: Teléfono apagado
  if (!instance.running) {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center gap-2 bg-screen-off text-muted-foreground select-none', className)}>
        <Power className="h-10 w-10 opacity-30 stroke-[1.5]" />
        <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground/60">Dispositivo Apagado</span>
      </div>
    );
  }

  // Estado: Teléfono iniciando / reiniciando
  const isStarting =
    instance.docker_status?.toLowerCase().includes('restarting') ||
    instance.docker_status?.toLowerCase().includes('starting');

  if (isStarting) {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center gap-3 bg-screen-off text-primary select-none', className)}>
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="font-mono text-xs text-muted-foreground">Iniciando ReDroid...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      className={cn(
        'relative h-full w-full overflow-hidden bg-black select-none cursor-pointer',
        isInteracting && 'cursor-crosshair',
        className
      )}
      title="Usa el ratón sobre la pantalla: Clic para Tap, Arrastre para Swipe, Rueda para Scroll"
    >
      {/* Fotograma en vivo de alta fidelidad */}
      {currentFrame ? (
        <img
          src={currentFrame}
          alt={instance.instance_name}
          className="h-full w-full object-cover select-none pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-black text-muted-foreground/40 font-mono text-xs">
          {isLoadingFirst ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : 'Sin señal'}
        </div>
      )}

      {/* Onda expansiva táctil de retroalimentación (Ripple) */}
      {ripple && (
        <span
          key={ripple.key}
          className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-tap rounded-full border-2 border-emerald-400 bg-emerald-500/30 z-30 shadow-xs"
          style={{ left: `${ripple.x * 100}%`, top: `${ripple.y * 100}%` }}
        />
      )}
    </div>
  );
}
