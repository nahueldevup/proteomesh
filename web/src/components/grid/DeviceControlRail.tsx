import { cn } from '../../lib/utils';

interface DeviceControlRailProps {
  visible?: boolean;
  className?: string;
}

/**
 * Esqueleto del riel vertical de control que se adosa a la derecha del chasis.
 *
 * - Va como hermano del nodo con `aspectRatio`, nunca dentro de la pantalla ni
 *   del overlay del canvas.
 * - Reserva permanentemente `w-7` para evitar CLS al enfocar/des enfocar.
 * - Detiene la propagación de click/double-click para no interactuar con la
 *   selección/foco de la tarjeta.
 */
export function DeviceControlRail({
  visible = true,
  className = '',
}: DeviceControlRailProps) {
  return (
    <div
      className={cn(
        'flex h-full w-7 shrink-0 flex-col items-center gap-1 overflow-y-auto rounded-sm border border-border p-0.5',
        visible ? 'bg-card' : 'bg-transparent border-transparent',
        className
      )}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-hidden={!visible}
    >
      {visible &&
        Array.from({ length: 14 }).map((_, i) => (
          <button
            key={i}
            type="button"
            disabled
            aria-label={`Acción ${i + 1}`}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-muted/30 text-muted-foreground/30"
          >
            <span className="font-mono text-[8px]">{i + 1}</span>
          </button>
        ))}
    </div>
  );
}
