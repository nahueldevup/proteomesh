import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  instances: string[];
  busy?: boolean;
}

export const ConfirmDeleteModal = ({
  isOpen,
  onClose,
  onConfirm,
  instances,
  busy = false,
}: ConfirmDeleteModalProps) => {
  const count = instances.length;
  const title =
    count === 1
      ? `¿Eliminar CloudPhone "${instances[0]}"?`
      : `¿Eliminar ${count} CloudPhones seleccionados?`;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm animate-in fade-in-0 duration-150" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[99999] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-card p-4 shadow-2xl space-y-3 animate-in zoom-in-95 duration-150 focus:outline-none"
        >
          <div className="flex items-start gap-2.5">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-sm border border-destructive/40 bg-destructive/10 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <Dialog.Title asChild>
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-foreground truncate">
                  {title}
                </h3>
              </Dialog.Title>
              <p className="text-[11px] text-muted-foreground leading-normal">
                Esta acción es irreversible. Se detendrá el contenedor Docker y se purgarán todos sus datos y configuraciones.
              </p>
            </div>
          </div>

          <div className="rounded-sm border border-border bg-background/80 p-2 max-h-32 overflow-y-auto font-mono text-[11px] text-muted-foreground space-y-1">
            {instances.map((name) => (
              <div key={name} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                <span className="text-foreground font-semibold truncate">{name}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="h-8 rounded-sm border border-border bg-background px-3 font-mono text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="flex h-8 items-center gap-1.5 rounded-sm bg-destructive text-destructive-foreground hover:opacity-90 px-3 font-mono text-xs font-semibold transition-opacity disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              <span>Eliminar definitivamente</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
