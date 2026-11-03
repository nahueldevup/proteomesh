import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  getActivePopoverId,
  setActivePopoverId,
  releaseIfActive,
  subscribePopover,
} from './popoverStore';

/**
 * Hook para controlar la apertura exclusiva de un popover.
 *
 * Devuelve `{ open, onOpenChange }` compatible con `<Popover open={open} onOpenChange={onOpenChange}>`.
 * - Al abrirse, activa su `id` en el store global y cierra cualquier otro popover abierto.
 * - Al cerrarse (clic fuera, Escape o acción), libera el `id` activo.
 * - Al desmontarse el componente mientras estaba abierto, libera automáticamente el `id`.
 */
export function useExclusivePopover(id: string): {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
} {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribePopover(onStoreChange),
    []
  );

  const open = useSyncExternalStore(
    subscribe,
    () => getActivePopoverId() === id,
    () => false
  );

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setActivePopoverId(id);
      } else {
        releaseIfActive(id);
      }
    },
    [id]
  );

  useEffect(() => {
    return () => {
      releaseIfActive(id);
    };
  }, [id]);

  return { open, onOpenChange };
}
