import { useCallback, useEffect, useRef } from 'react';
import { Smartphone, Plus } from 'lucide-react';
import type { Instance, UsbNetworkOverview } from '../../types';
import DeviceCard, { type UsbSlice } from './DeviceCard';

interface DeviceGridProps {
  instances: Instance[];
  selected: Set<string>;
  cols: number;
  syncMode?: boolean;
  onToggleSelect: (name: string, shiftKey?: boolean) => void;
  onOpen: (name: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onOpenCreate?: () => void;
  usbOverview?: UsbNetworkOverview | null;
  onNetworkChange?: () => void;
}

export default function DeviceGrid({
  instances,
  selected,
  cols,
  syncMode = false,
  onToggleSelect,
  onOpen,
  onSelectAll,
  onClearSelection,
  onOpenCreate,
  usbOverview,
  onNetworkChange,
}: DeviceGridProps) {
  const lastSelectedRef = useRef<string | null>(null);

  // Atajos de teclado: Ctrl+A / Cmd+A para seleccionar todo, Esc para deseleccionar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        onSelectAll();
      }
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][data-state="open"]')) {
        onClearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onSelectAll, onClearSelection]);

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
    <div
      className="grid gap-3 transition-all duration-200"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      }}
    >
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
        />
      ))}
      {onOpenCreate && (
        <button
          type="button"
          onClick={onOpenCreate}
          className="group flex h-full min-h-[220px] w-full flex-col items-center justify-center rounded-sm border border-dashed border-device-card-border bg-new-card p-2 text-muted-foreground shadow-xs transition-all hover:border-primary/60 hover:bg-accent/70 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          title="Crear nuevo CloudPhone"
        >
          <div className="grid h-8 w-8 place-items-center rounded-md border border-device-card-border transition-colors group-hover:border-primary/50 group-hover:bg-primary/10">
            <Plus className="h-4 w-4" />
          </div>
          <span className="mt-2 font-mono text-[9px] font-semibold tracking-wider uppercase opacity-70 group-hover:opacity-100">
            + Nuevo
          </span>
        </button>
      )}
    </div>
  );
}
