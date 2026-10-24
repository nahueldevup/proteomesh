import { useState } from 'react';
import { Power, Loader2 } from 'lucide-react';
import type { Instance } from '../../types';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

const APP_TONES = [
  'bg-info',
  'bg-success',
  'bg-warning',
  'bg-destructive',
  'bg-chart-5',
  'bg-primary',
];

interface PhoneScreenProps {
  instance: Instance;
  interactive?: boolean;
  compact?: boolean;
  tick?: number;
  onTap?: (relX: number, relY: number) => void;
}

export function PhoneScreen({
  instance,
  interactive = false,
  compact = true,
  tick = 0,
  onTap,
}: PhoneScreenProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);

  if (!instance.running) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-screen-off text-muted-foreground/50 select-none">
        <Power className={compact ? 'h-4 w-4' : 'h-8 w-8'} />
      </div>
    );
  }

  if (instance.docker_status?.toLowerCase().includes('restarting') || instance.docker_status?.toLowerCase().includes('starting')) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-screen-off text-primary select-none">
        <Loader2 className={cn('animate-spin', compact ? 'h-4 w-4' : 'h-8 w-8')} />
      </div>
    );
  }

  const icons = 16;
  const screenUrl = api.getScreenUrl(instance.instance_name, tick);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive && !onTap) return;
    const r = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - r.left) / r.width;
    const relY = (e.clientY - r.top) / r.height;
    setRipple({ x: relX, y: relY, key: Date.now() });
    onTap?.(relX, relY);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'relative h-full w-full overflow-hidden bg-gradient-to-b from-info/30 via-secondary to-background select-none',
        interactive && 'cursor-crosshair'
      )}
    >
      {/* Intento de renderizado de captura real de ReDroid */}
      {!imgError && (
        <img
          src={screenUrl}
          alt={instance.instance_name}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          className={cn(
            'absolute inset-0 h-full w-full object-cover select-none pointer-events-none transition-opacity duration-300',
            imgLoaded ? 'opacity-100 z-10' : 'opacity-0'
          )}
          loading="lazy"
        />
      )}

      {/* Launcher estilizado simulado (cuando la imagen aún carga o si no hay display activo) */}
      <div className="flex h-full w-full flex-col justify-between p-[4%]">
        <div>
          <div className="flex items-center justify-between px-[3%] pt-[2%] font-mono text-[clamp(6px,1.5cqw,11px)] text-foreground/70">
            <span>12:00</span>
            <span>▮▮▮</span>
          </div>
          <div className="mx-[4%] mt-[6%] h-[4%] min-h-[4px] rounded-full bg-foreground/15" />
          <div className="grid grid-cols-4 gap-[8%] px-[6%] pt-[10%]">
            {Array.from({ length: icons }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'aspect-square rounded-[28%] opacity-85',
                  APP_TONES[(i + instance.adb_port) % APP_TONES.length]
                )}
              />
            ))}
          </div>
        </div>

        <div className="mx-auto h-[3px] w-[32%] rounded-full bg-foreground/50 mb-1" />
      </div>

      {/* Ripple táctil interactivo */}
      {ripple && (
        <span
          key={ripple.key}
          className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 animate-tap rounded-full border-2 border-primary bg-primary/30 z-30"
          style={{ left: `${ripple.x * 100}%`, top: `${ripple.y * 100}%` }}
        />
      )}
    </div>
  );
}
