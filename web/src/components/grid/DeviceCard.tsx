import { useEffect, useState } from 'react';
import type { Instance } from '../../types';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { PhoneScreen } from '../farm/PhoneScreen';

interface DeviceCardProps {
  instance: Instance;
  index: number;
  selected: boolean;
  onToggleSelect: (name: string, shiftKey?: boolean) => void;
  onOpen: (name: string) => void;
  syncMode?: boolean;
}

export default function DeviceCard({
  instance,
  index,
  selected,
  onToggleSelect,
  onOpen,
  syncMode = false,
}: DeviceCardProps) {
  const [tick, setTick] = useState(0);

  // Intervalo de recarga de snapshot para dispositivos encendidos
  useEffect(() => {
    if (!instance.running) return;
    const interval = window.setInterval(() => setTick((t) => t + 1), 4000);
    return () => window.clearInterval(interval);
  }, [instance.running, instance.instance_name]);

  const handleScreenTap = async (relX: number, relY: number) => {
    if (!syncMode || !instance.running) return;
    const nativeWidth = Number(instance.display?.width) || 1080;
    const nativeHeight = Number(instance.display?.height) || 2340;
    try {
      await api.sendTap(instance.instance_name, relX * nativeWidth, relY * nativeHeight);
    } catch (err) {
      console.error('Error al enviar tap sincronizado:', err);
    }
  };

  return (
    <div
      onClick={(e) => onToggleSelect(instance.instance_name, e.shiftKey)}
      onDoubleClick={() => onOpen(instance.instance_name)}
      className={cn(
        'group cursor-pointer select-none rounded-xl bg-bezel p-1 transition',
        selected ? 'glow-selected' : 'ring-1 ring-border hover:ring-muted-foreground'
      )}
    >
      <div className="relative aspect-[9/19.5] overflow-hidden rounded-lg [container-type:inline-size]">
        <PhoneScreen
          instance={instance}
          interactive={syncMode && selected}
          compact
          tick={tick}
          onTap={handleScreenTap}
        />
        <span className="absolute left-1 top-1 rounded bg-background/80 px-1 font-mono text-[9px] text-foreground/80 z-20">
          {index + 1}
        </span>
      </div>

      <div className="flex items-center gap-1 px-1 pt-1 font-mono text-[9.5px]">
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            instance.running
              ? 'bg-success shadow-[0_0_6px_#4ade80]'
              : 'bg-muted-foreground/40'
          )}
        />
        <span className="truncate flex-1 text-foreground/90 font-medium" title={instance.instance_name}>
          {instance.instance_name}
        </span>
        <span className="ml-auto shrink-0 text-muted-foreground text-[8.5px]">
          :{instance.adb_port}
        </span>
      </div>
    </div>
  );
}
