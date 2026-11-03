/**
 * Store externo (sin React) para el FPS de ventana de 1 s del stream scrcpy.
 *
 * El hook publica el valor aquí; los badges (card y FocusView) se suscriben
 * vía `useSyncExternalStore` para re-renderizar solo ellos, no todo el árbol.
 */

type Listener = () => void;

let currentFps = 0;
const listeners = new Set<Listener>();

export function setFpsValue(value: number): void {
  const next = Math.max(0, Math.round(value));
  if (currentFps === next) return;
  currentFps = next;
  for (const listener of listeners) listener();
}

export function subscribeFps(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFpsSnapshot(): number {
  return currentFps;
}

/**
 * FPS de una ventana: frames pintados en los últimos `windowMs` milisegundos.
 * `windowMs <= 0` se trata como 1 s para evitar división por cero.
 */
export function computeWindowFps(framesInWindow: number, windowMs: number): number {
  const seconds = windowMs > 0 ? windowMs / 1000 : 1;
  return Math.max(0, Math.round(framesInWindow / seconds));
}
