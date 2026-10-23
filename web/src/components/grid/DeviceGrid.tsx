import { CheckSquare, Smartphone, Square } from 'lucide-react';
import type { Instance } from '../../types';
import DeviceCard from './DeviceCard';

interface DeviceGridProps {
  instances: Instance[];
  selected: Set<string>;
  onToggleSelect: (name: string) => void;
  onOpen: (name: string) => void;
  onToggleSelectAll: () => void;
}

export default function DeviceGrid({
  instances,
  selected,
  onToggleSelect,
  onOpen,
  onToggleSelectAll,
}: DeviceGridProps) {
  const allSelected = instances.length > 0 && instances.every((i) => selected.has(i.instance_name));

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={onToggleSelectAll}
          disabled={instances.length === 0}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40"
        >
          {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
          {allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
        </button>
        <span className="text-[11px] text-zinc-500">
          {instances.length} dispositivo{instances.length === 1 ? '' : 's'}
          {selected.size > 0 && ` · ${selected.size} seleccionado${selected.size === 1 ? '' : 's'}`}
        </span>
      </div>

      {instances.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-800 py-20 text-center">
          <Smartphone size={36} className="text-zinc-700" />
          <p className="text-sm text-zinc-400">No hay CloudPhones que coincidan.</p>
          <p className="text-xs text-zinc-600">Creá uno nuevo desde el botón superior.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {instances.map((instance) => (
            <DeviceCard
              key={instance.instance_name}
              instance={instance}
              selected={selected.has(instance.instance_name)}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
