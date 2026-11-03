import { useSyncExternalStore } from 'react';
import { subscribeFps, getFpsSnapshot } from './fps';

/**
 * Suscribe un componente al FPS de ventana de 1 s del stream scrcpy.
 * Solo el componente que lo usa se re-renderiza cuando el valor cambia.
 */
export function useFps(): number {
  return useSyncExternalStore(subscribeFps, getFpsSnapshot, getFpsSnapshot);
}
