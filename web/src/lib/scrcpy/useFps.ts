import { useCallback, useSyncExternalStore } from 'react';
import { subscribeFps, getFpsSnapshot } from './fps';

/**
 * Suscribe un componente al FPS de ventana de 1 s del stream scrcpy de una
 * instancia (clave `adbPort`). Solo el componente que lo usa se re-renderiza
 * cuando el valor cambia; React desuscribe automáticamente al desmontar.
 */
export function useFps(key: number): number {
  const subscribe = useCallback(
    (listener: () => void) => subscribeFps(key, listener),
    [key],
  );
  return useSyncExternalStore(subscribe, () => getFpsSnapshot(key), () => getFpsSnapshot(key));
}
