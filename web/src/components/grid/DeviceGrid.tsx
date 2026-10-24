import { useEffect, useRef } from 'react';
import { Smartphone, Plus } from 'lucide-react';
import type { Instance } from '../../types';
import DeviceCard from './DeviceCard';

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
      if (e.key === 'Escape') {
        onClearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectAll, onClearSelection]);

  const handleSelectWithShift = (name: string, shiftKey?: boolean) => {
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
  };

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
        />
      ))}
      {onOpenCreate && (
        <button
          type="button"
          onClick={onOpenCreate}
          className="group flex flex-col items-center justify-center aspect-[9/19.5] rounded-xl border border-dashed border-border/70 hover:border-primary/60 bg-bezel/40 hover:bg-bezel/80 cursor-pointer transition-all select-none text-muted-foreground hover:text-primary p-2"
          title="Crear nuevo CloudPhone"
        >
          <div className="grid h-8 w-8 place-items-center rounded-md border border-border group-hover:border-primary/50 group-hover:bg-primary/10 transition-colors">
            <Plus className="h-4 w-4" />
          </div>
          <span className="mt-2 font-mono text-[9px] font-semibold tracking-wider opacity-70 group-hover:opacity-100 uppercase">
            + Nuevo
          </span>
        </button>
      )}
    </div>
  );
}
