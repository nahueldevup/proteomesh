import { useEffect, useState } from 'react';
import { MapPin, Smartphone } from 'lucide-react';
import type { Instance } from '../../types';
import { api } from '../../lib/api';

interface DeviceCardProps {
  instance: Instance;
  selected: boolean;
  onToggleSelect: (name: string) => void;
  onOpen: (name: string) => void;
}

export default function DeviceCard({ instance, selected, onToggleSelect, onOpen }: DeviceCardProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!instance.running) return;
    const interval = window.setInterval(() => setTick((t) => t + 1), 5000);
    return () => window.clearInterval(interval);
  }, [instance.running, instance.instance_name]);

  const model = instance.template?.split('/')[1] || instance.template || 'CloudPhone';

  return (
    <div
      onClick={() => onOpen(instance.instance_name)}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-zinc-900/40 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40 ${
        selected
          ? 'border-blue-500/70 ring-1 ring-blue-500/40'
          : 'border-zinc-800/80 hover:border-zinc-700'
      }`}
    >
      <label
        onClick={(e) => e.stopPropagation()}
        className="absolute left-2 top-2 z-20 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-zinc-700/80 bg-zinc-950/80 backdrop-blur"
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(instance.instance_name)}
          className="h-3.5 w-3.5 accent-blue-500"
        />
      </label>

      <span
        className={`absolute right-2 top-2 z-20 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur ${
          instance.running
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-zinc-900/80 text-zinc-500'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${instance.running ? 'animate-pulse bg-emerald-400' : 'bg-zinc-600'}`} />
        {instance.running ? 'Online' : 'Offline'}
      </span>

      <div className="relative flex h-52 items-center justify-center overflow-hidden bg-black/60">
        {instance.running ? (
          <img
            src={api.getScreenUrl(instance.instance_name, tick)}
            alt={`Pantalla de ${instance.instance_name}`}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-700">
            <Smartphone size={34} />
            <span className="text-[10px] uppercase tracking-wider">Apagado</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950/70 via-transparent to-transparent" />
      </div>

      <div className="space-y-1 px-3 pb-3 pt-2">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-xs font-semibold text-zinc-100">{instance.instance_name}</span>
          <span className="shrink-0 font-mono text-[10px] text-zinc-500">:{instance.adb_port}</span>
        </div>
        <div className="truncate text-[11px] text-zinc-400">{model}</div>
        <div className="flex items-center gap-1 truncate text-[11px] text-zinc-500">
          <MapPin size={11} className="shrink-0 text-blue-400" />
          <span className="truncate">{instance.location?.city || 'Sin GPS'}</span>
        </div>
      </div>
    </div>
  );
}
