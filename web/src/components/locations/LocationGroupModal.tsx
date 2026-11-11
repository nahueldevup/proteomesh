import React from 'react';
import { Folder, Check, Loader2 } from 'lucide-react';
import type { LocationGroup } from '../../types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { PALETTE_COLORS, fieldClass, fieldLabelClass } from './locationsTypes';

export interface LocationGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingGroup: LocationGroup | null;
  groupNameInput: string;
  setGroupNameInput: (val: string) => void;
  groupColorInput: string;
  setGroupColorInput: (val: string) => void;
  groupDescInput: string;
  setGroupDescInput: (val: string) => void;
  savingGroup: boolean;
  onSaveGroup: (e: React.FormEvent) => void;
}

export const LocationGroupModal: React.FC<LocationGroupModalProps> = ({
  open,
  onOpenChange,
  editingGroup,
  groupNameInput,
  setGroupNameInput,
  groupColorInput,
  setGroupColorInput,
  groupDescInput,
  setGroupDescInput,
  savingGroup,
  onSaveGroup,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 p-0">
        <DialogHeader className="border-b border-border p-4 pr-10">
          <DialogTitle className="flex items-center gap-2 font-mono text-sm">
            <Folder className="size-4 text-primary" />
            {editingGroup ? 'Editar grupo' : 'Nuevo grupo de geolocalizaciones'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Los grupos colorean los pines del mapa y permiten filtrar el catálogo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSaveGroup} className="space-y-3 p-4">
          <div>
            <label className={fieldLabelClass} htmlFor="group-name">
              Nombre del grupo *
            </label>
            <input
              id="group-name"
              type="text"
              required
              placeholder="Ej: Sedes LATAM, Zonas bancarias…"
              value={groupNameInput}
              onChange={(e) => setGroupNameInput(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div>
            <span className={fieldLabelClass}>Color distintivo</span>
            <div className="flex flex-wrap items-center gap-2">
              {PALETTE_COLORS.map((col) => (
                <button
                  type="button"
                  key={col}
                  onClick={() => setGroupColorInput(col)}
                  aria-label={`Color ${col}`}
                  className={cn(
                    'grid size-6 cursor-pointer place-items-center rounded-full border-2 transition-transform hover:scale-110',
                    groupColorInput === col ? 'scale-110 border-foreground' : 'border-transparent'
                  )}
                  style={{ backgroundColor: col }}
                >
                  {groupColorInput === col && <Check className="size-3 text-background" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={fieldLabelClass} htmlFor="group-desc">
              Descripción (opcional)
            </label>
            <input
              id="group-desc"
              type="text"
              placeholder="Objetivo o referencia del grupo…"
              value={groupDescInput}
              onChange={(e) => setGroupDescInput(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 cursor-pointer rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingGroup || !groupNameInput.trim()}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {savingGroup && <Loader2 className="size-3.5 animate-spin" />}
              {editingGroup ? 'Guardar cambios' : 'Crear grupo'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
