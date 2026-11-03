/**
 * Store global exclusivo para popovers en la UI.
 *
 * Garantiza que a lo sumo un solo popover esté abierto a la vez en toda la
 * aplicación (tarjetas del rack, vista enfocada o barra de selección masiva).
 */

type Listener = () => void;

let activePopoverId: string | null = null;
const listeners = new Set<Listener>();

export function getActivePopoverId(): string | null {
  return activePopoverId;
}

export function setActivePopoverId(id: string | null): void {
  if (activePopoverId === id) return;
  activePopoverId = id;
  for (const listener of listeners) listener();
}

export function closeActivePopover(): void {
  setActivePopoverId(null);
}

/**
 * Libera el popover activo únicamente si coincide con el `id` provisto.
 * Usado al desmontar componentes o al solicitar el cierre específico.
 * Retorna `true` si liberó el ID, o `false` si no era el ID activo.
 */
export function releaseIfActive(id: string): boolean {
  if (activePopoverId === id) {
    activePopoverId = null;
    for (const listener of listeners) listener();
    return true;
  }
  return false;
}

export function subscribePopover(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
