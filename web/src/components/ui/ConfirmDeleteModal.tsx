import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  instances: string[];
  busy?: boolean;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  instances,
  busy = false,
}) => {
  // Manejo de teclado (Escape para salir)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, busy]);

  if (!isOpen) return null;

  const count = instances.length;
  const title =
    count === 1
      ? `¿Eliminar CloudPhone "${instances[0]}"?`
      : `¿Eliminar ${count} CloudPhones seleccionados?`;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in-0 duration-150"
      onClick={(e) => {
        // Cierre al dar clic en el fondo exterior (backdrop)
        if (e.target === e.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border/80 bg-surface/98 p-5 shadow-2xl shadow-black/80 space-y-3.5 animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera compacta y sobria */}
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-destructive/30 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <h3 className="font-sans text-sm font-bold text-foreground truncate">
              {title}
            </h3>
            <p className="text-xs text-muted-foreground leading-normal">
              Esta acción es irreversible. Se detendrá el contenedor Docker y se purgarán todos sus datos y configuraciones.
            </p>
          </div>
        </div>

        {/* Lista de terminales a eliminar con tipografía técnica mono */}
        <div className="rounded-md border border-border/60 bg-background/70 p-2.5 max-h-32 overflow-y-auto font-mono text-xs text-muted-foreground space-y-1">
          {instances.map((name) => (
            <div key={name} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
              <span className="text-foreground font-semibold truncate">{name}</span>
            </div>
          ))}
        </div>

        {/* Botones de acción finos y minimalistas */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-8 rounded-md border border-border bg-background px-3 font-mono text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex h-8 items-center gap-1.5 rounded-md bg-destructive px-3 font-mono text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 transition-opacity disabled:opacity-50 shadow-sm"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            <span>Eliminar definitivamente</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
