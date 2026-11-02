import { useCallback, useEffect, useRef, useState } from 'react';
import { Smartphone } from 'lucide-react';
import type { Instance, UsbNetworkOverview } from '../../types';
import DeviceCard, { type UsbSlice } from './DeviceCard';

interface DeviceGridProps {
  instances: Instance[];
  selected: Set<string>;
  syncMode?: boolean;
  onToggleSelect: (name: string, shiftKey?: boolean) => void;
  onOpen: (name: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  usbOverview?: UsbNetworkOverview | null;
  onNetworkChange?: () => void;
}

export default function DeviceGrid({
  instances,
  selected,
  syncMode = false,
  onToggleSelect,
  onOpen,
  onSelectAll,
  onClearSelection,
  usbOverview,
  onNetworkChange,
}: DeviceGridProps) {
  const lastSelectedRef = useRef<string | null>(null);
  const [focusedInstance, setFocusedInstance] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Si la selección global se vacía, liberar también el foco
  useEffect(() => {
    if (selected.size === 0) {
      setFocusedInstance(null);
    }
  }, [selected.size]);

  // Llevar a vista el teléfono enfocado sin smooth scroll durante arrastres
  useEffect(() => {
    if (!focusedInstance) return;
    const el = cardRefs.current.get(focusedInstance);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [focusedInstance]);

  // Atajos de teclado: Ctrl+A para todo; Esc en cascada (1º libera foco, 2º limpia selección)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      // No capturar Ctrl+A cuando el canvas de scrcpy tiene el foco: en ese
      // contexto el usuario espera seleccionar texto dentro de Android.
      const target = e.target as HTMLElement | null;
      const active = document.activeElement as HTMLElement | null;
      const insideLiveScreen =
        target?.closest?.('[data-live-screen]') != null ||
        active?.closest?.('[data-live-screen]') != null;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        if (insideLiveScreen) return;
        e.preventDefault();
        onSelectAll();
      }
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][data-state="open"]')) {
        if (focusedInstance !== null) {
          e.preventDefault();
          setFocusedInstance(null);
        } else {
          onClearSelection();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onSelectAll, onClearSelection, focusedInstance]);

  const usbFor = (name: string): UsbSlice => {
    const offer = usbOverview?.pending_offer?.instance === name ? usbOverview.pending_offer : null;
    const queueIndex = usbOverview?.waiting_queue?.indexOf(name) ?? -1;
    return {
      isOffered: offer !== null,
      pendingOffer: offer,
      isWaiting: queueIndex >= 0,
      waitingPos: queueIndex >= 0 ? queueIndex + 1 : null,
      assignedDev: usbOverview?.devices?.find((d) => d.assigned_instance === name) ?? null,
    };
  };

  const handleSelectWithShift = useCallback((name: string, shiftKey?: boolean) => {
    if (shiftKey && lastSelectedRef.current) {
      const idx1 = instances.findIndex((i) => i.instance_name === lastSelectedRef.current);
      const idx2 = instances.findIndex((i) => i.instance_name === name);
      if (idx1 !== -1 && idx2 !== -1) {
        const start = Math.min(idx1, idx2);
        const end = Math.max(idx1, idx2);
        const range = instances.slice(start, end + 1).map((i) => i.instance_name);
        range.forEach((n) => onToggleSelect(n, false));
        lastSelectedRef.current = name;
        return;
      }
    }
    lastSelectedRef.current = name;
    onToggleSelect(name, false);
  }, [instances, onToggleSelect]);

  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-24 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface border border-border text-muted-foreground">
          <Smartphone size={24} />
        </div>
        <p className="text-sm font-medium text-foreground">No se encontraron CloudPhones</p>
        <p className="text-xs text-muted-foreground">Ajusta los filtros o crea una nueva instancia.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center gap-4 overflow-x-auto overflow-y-hidden select-none scrollbar-stable">
      {instances.map((instance, index) => (
        <DeviceCard
          key={instance.instance_name}
          instance={instance}
          index={index}
          selected={selected.has(instance.instance_name)}
          syncMode={syncMode}
          onToggleSelect={handleSelectWithShift}
          onOpen={onOpen}
          usb={usbFor(instance.instance_name)}
          onNetworkChange={onNetworkChange}
          isFocused={focusedInstance === instance.instance_name}
          onFocus={(name) => setFocusedInstance(name)}
          onReleaseFocus={() => setFocusedInstance(null)}
          domRef={(el) => {
            if (el) cardRefs.current.set(instance.instance_name, el);
            else cardRefs.current.delete(instance.instance_name);
          }}
        />
      ))}
    </div>
  );
}
