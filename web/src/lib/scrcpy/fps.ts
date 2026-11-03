/**
 * Store externo (sin React) para el FPS de ventana de 1 s del stream scrcpy.
 *
 * Está indexado por `adbPort` (un stream por instancia): cada tarjeta lee su
 * propio valor, sin mezclarse con otras instancias. Los badges se suscriben
 * vía `useSyncExternalStore` para re-renderizar solo ellos, no todo el árbol.
 */

type Listener = () => void;

interface StoreEntry {
  value: number;
  listeners: Set<Listener>;
}

const stores = new Map<number, StoreEntry>();

function entry(key: number): StoreEntry {
  let e = stores.get(key);
  if (!e) {
    e = { value: 0, listeners: new Set() };
    stores.set(key, e);
  }
  return e;
}

export function setFpsValue(key: number, value: number): void {
  const e = entry(key);
  const next = Math.max(0, Math.round(value));
  if (e.value === next) return;
  e.value = next;
  for (const listener of e.listeners) listener();
}

export function subscribeFps(key: number, listener: Listener): () => void {
  const e = entry(key);
  e.listeners.add(listener);
  return () => {
    e.listeners.delete(listener);
  };
}

export function getFpsSnapshot(key: number): number {
  return stores.get(key)?.value ?? 0;
}

/**
 * FPS de una ventana: frames pintados en los últimos `windowMs` milisegundos.
 * `windowMs <= 0` se trata como 1 s para evitar división por cero.
 */
export function computeWindowFps(framesInWindow: number, windowMs: number): number {
  const seconds = windowMs > 0 ? windowMs / 1000 : 1;
  return Math.max(0, Math.round(framesInWindow / seconds));
}
