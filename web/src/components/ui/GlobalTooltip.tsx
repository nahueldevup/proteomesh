import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipState {
  visible: boolean;
  text: string;
  x: number;
  y: number;
  placement: 'top' | 'bottom';
}

const INITIAL_STATE: TooltipState = {
  visible: false,
  text: '',
  x: 0,
  y: 0,
  placement: 'top',
};

const SHOW_DELAY_MS = 140;

/**
 * Interceptor global de tooltips para toda la aplicación.
 * Convierte automáticamente cualquier atributo `title="..."` o `data-tooltip="..."`
 * en un tooltip flotante estilizado (Geist Mono, borde sutil, fondo dark tech y shadow-xl),
 * suprimiendo de raíz el rectángulo negro nativo del sistema operativo.
 */
export function GlobalTooltip(): React.ReactPortal | null {
  const [state, setState] = useState<TooltipState>(INITIAL_STATE);
  const activeElRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const hide = () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
      if (activeElRef.current) {
        const orig = activeElRef.current.getAttribute('data-original-title');
        if (orig !== null) {
          activeElRef.current.setAttribute('title', orig);
          activeElRef.current.removeAttribute('data-original-title');
        }
        activeElRef.current = null;
      }
      setState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    const handlePointerOver = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !(target instanceof HTMLElement)) return;

      // Buscar el elemento más cercano con title o data-tooltip
      const trigger = target.closest<HTMLElement>('[title], [data-tooltip]');
      if (!trigger) return;

      // Si ya está activo en este elemento, no reiniciar
      if (trigger === activeElRef.current) return;

      // Si el elemento pertenece al DOM interno de Leaflet (que ya tiene sus propios tooltips .pm-tt), ignorar
      if (trigger.closest('.leaflet-pane, .leaflet-control-container')) return;

      let text = trigger.getAttribute('data-tooltip');
      const titleAttr = trigger.getAttribute('title');

      if (!text && titleAttr) {
        text = titleAttr.trim();
        // Suprimir el title nativo de HTML para que el SO no pinte el rectángulo negro
        trigger.setAttribute('data-original-title', titleAttr);
        trigger.removeAttribute('title');
      }

      if (!text) return;

      hide();
      activeElRef.current = trigger;

      timerRef.current = window.setTimeout(() => {
        if (!activeElRef.current || !activeElRef.current.isConnected) {
          hide();
          return;
        }

        const rect = activeElRef.current.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          hide();
          return;
        }

        const centerX = rect.left + rect.width / 2;
        // Si hay espacio arriba (>= 36px), posicionar arriba; sino, abajo
        const placement: 'top' | 'bottom' = rect.top >= 36 ? 'top' : 'bottom';
        const y = placement === 'top' ? rect.top - 6 : rect.bottom + 6;

        // Limitar x entre 16px y el ancho de ventana - 16px
        const safeX = Math.max(16, Math.min(window.innerWidth - 16, centerX));

        setState({
          visible: true,
          text: text!,
          x: safeX,
          y,
          placement,
        });
      }, SHOW_DELAY_MS);
    };

    const handlePointerOut = (e: PointerEvent) => {
      if (!activeElRef.current) return;
      // Verificar si el cursor realmente salió del elemento activo
      const related = e.relatedTarget as HTMLElement | null;
      if (related && activeElRef.current.contains(related)) return;
      hide();
    };

    // Ocultar inmediatamente al hacer clic, al scrollear o al presionar Escape
    const handleDismiss = () => hide();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };

    document.addEventListener('pointerover', handlePointerOver, { passive: true });
    document.addEventListener('pointerout', handlePointerOut, { passive: true });
    document.addEventListener('pointerdown', handleDismiss, { passive: true });
    document.addEventListener('scroll', handleDismiss, { capture: true, passive: true });
    window.addEventListener('keydown', handleKeyDown, { passive: true });

    return () => {
      hide();
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('pointerout', handlePointerOut);
      document.removeEventListener('pointerdown', handleDismiss);
      document.removeEventListener('scroll', handleDismiss, { capture: true });
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  if (!state.visible || !state.text || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      role="tooltip"
      aria-hidden="true"
      className="pointer-events-none fixed z-[9999] max-w-sm -translate-x-1/2 overflow-hidden rounded-md border border-border bg-popover/95 px-2.5 py-1 font-mono text-[11px] font-medium text-foreground shadow-xl backdrop-blur select-none animate-in fade-in-0 zoom-in-95 duration-100 ease-out whitespace-nowrap"
      style={{
        left: `${state.x}px`,
        top: `${state.y}px`,
        transform: state.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
      }}
    >
      {state.text}
    </div>,
    document.body
  );
}
