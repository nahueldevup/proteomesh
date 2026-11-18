import { useEffect, useState } from 'react';
import { Archive, CalendarClock, Database, History, Loader2, Lock, Power, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Switch } from '../ui/switch';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queries';
import type { BackupItem, BackupScheduleStatus } from '../../types';
import { OptionRow, PassphraseInput, Segmented, Stepper, btn } from './BackupPrimitives';

const shell = 'max-w-md gap-0 overflow-hidden p-0';

function Head({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-4 py-3 text-left">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
        {icon}
      </span>
      <div>
        <DialogTitle className="font-mono text-sm">{title}</DialogTitle>
        <DialogDescription className="text-xs">{desc}</DialogDescription>
      </div>
    </DialogHeader>
  );
}

export function CreateBackupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (b: BackupItem) => void;
}) {
  const qc = useQueryClient();
  const [encrypt, setEncrypt] = useState(true);
  const [pass, setPass] = useState('');
  const [db, setDb] = useState(true);
  const [keep, setKeep] = useState(5);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setPass('');
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (encrypt && pass.trim().length < 4)
      return toast.error('La frase de paso debe tener al menos 4 caracteres');
    setBusy(true);
    try {
      const r = await api.createBackup({
        passphrase: encrypt ? pass : undefined,
        no_encrypt: !encrypt,
        include_db: db,
        keep,
      });
      toast.success(`Respaldo creado: ${r.filename}`);
      await qc.invalidateQueries({ queryKey: queryKeys.backups });
      onCreated(r);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear respaldo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={shell}>
        <Head
          icon={<Archive className="size-4" />}
          title="Nuevo respaldo en caliente"
          desc="Se genera sin detener los CloudPhones en ejecución."
        />
        <form onSubmit={submit}>
          <div className="flex flex-col gap-px bg-border">
            <OptionRow
              icon={<Lock className="size-3.5" />}
              title="Cifrar con AES-256"
              desc="PBKDF2 · 100.000 iteraciones. Sin la frase no se puede restaurar."
              control={<Switch checked={encrypt} onCheckedChange={setEncrypt} />}
            />
            {encrypt && (
              <div className="bg-background px-3 pb-2.5">
                <PassphraseInput value={pass} onChange={setPass} autoFocus />
              </div>
            )}
            <OptionRow
              icon={<Database className="size-3.5" />}
              title="Incluir bases SQLite"
              desc="proteomesh.db · ip_ledger.db · routes.db"
              control={<Switch checked={db} onCheckedChange={setDb} />}
            />
            <OptionRow
              icon={<History className="size-3.5" />}
              title="Copias a retener"
              desc="Las más antiguas se rotan automáticamente."
              control={<Stepper value={keep} onChange={setKeep} />}
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-surface px-4 py-3">
            <button type="button" onClick={() => onOpenChange(false)} className={btn.outline}>
              Cancelar
            </button>
            <button type="submit" disabled={busy} className={btn.primary}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}{' '}
              Crear respaldo
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleDialog({
  open,
  onOpenChange,
  schedule,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  schedule?: BackupScheduleStatus;
}) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [freq, setFreq] = useState<'daily' | 'weekly'>('daily');
  const [time, setTime] = useState('03:00');
  const [keep, setKeep] = useState(5);
  const [encrypt, setEncrypt] = useState(true);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && schedule) {
      setEnabled(schedule.active);
      setFreq(schedule.frequency === 'weekly' ? 'weekly' : 'daily');
      setTime(schedule.time || '03:00');
      setKeep(schedule.keep || 5);
      setEncrypt(schedule.encrypted);
      setPass('');
    }
  }, [open, schedule]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enabled && encrypt && !pass.trim() && !schedule?.encrypted)
      return toast.error('Ingresá una frase de paso para la ejecución desatendida');
    setBusy(true);
    try {
      await api.updateBackupSchedule({
        enabled,
        frequency: freq,
        time,
        keep,
        no_encrypt: !encrypt,
        passphrase: encrypt && pass ? pass : undefined,
      });
      toast.success(
        enabled
          ? `Timer programado: ${freq === 'daily' ? 'diario' : 'semanal'} a las ${time}`
          : 'Timer desactivado'
      );
      qc.invalidateQueries({ queryKey: queryKeys.backupSchedule });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={shell}>
        <Head
          icon={<CalendarClock className="size-4" />}
          title="Respaldo automático"
          desc="Systemd timer en el host Linux, sin intervención."
        />
        <form onSubmit={submit}>
          <div className="flex flex-col gap-px bg-border">
            <OptionRow
              icon={<Power className="size-3.5" />}
              title="Timer activo"
              desc="Ejecutar respaldos en segundo plano."
              control={<Switch checked={enabled} onCheckedChange={setEnabled} />}
            />
            <div className={enabled ? 'flex flex-col gap-px' : 'pointer-events-none flex flex-col gap-px opacity-50'}>
              <div className="grid grid-cols-2 gap-3 bg-background px-3 py-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Frecuencia</span>
                  <Segmented
                    value={freq}
                    onChange={setFreq}
                    options={[
                      { value: 'daily', label: 'Diaria' },
                      { value: 'weekly', label: 'Semanal' },
                    ]}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Hora</span>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="h-[30px] rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground outline-none [color-scheme:dark] focus:ring-1 focus:ring-ring"
                  />
                </label>
              </div>
              <OptionRow
                icon={<History className="size-3.5" />}
                title="Copias a retener"
                desc="Rotación automática de históricos."
                control={<Stepper value={keep} onChange={setKeep} />}
              />
              <OptionRow
                icon={<Lock className="size-3.5" />}
                title="Cifrar respaldos"
                desc={
                  schedule?.encrypted
                    ? 'Dejá la frase vacía para conservar la actual.'
                    : 'La frase se guarda en el host para correr desatendido.'
                }
                control={<Switch checked={encrypt} onCheckedChange={setEncrypt} />}
              />
              {encrypt && (
                <div className="bg-background px-3 pb-2.5">
                  <PassphraseInput
                    value={pass}
                    onChange={setPass}
                    placeholder={schedule?.encrypted ? '•••••• (sin cambios)' : 'Frase de paso'}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-surface px-4 py-3">
            <button type="button" onClick={() => onOpenChange(false)} className={btn.outline}>
              Cancelar
            </button>
            <button type="submit" disabled={busy} className={btn.primary}>
              {busy && <Loader2 className="size-3.5 animate-spin" />} Guardar programación
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteBackupDialog({
  backup,
  onOpenChange,
  onDeleted,
}: {
  backup: BackupItem | null;
  onOpenChange: (o: boolean) => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!backup) return;
    setBusy(true);
    try {
      await api.deleteBackup(backup.filename);
      toast.success('Respaldo eliminado');
      await qc.invalidateQueries({ queryKey: queryKeys.backups });
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!backup} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
        <div className="flex flex-col gap-2 px-4 py-4">
          <DialogTitle className="flex items-center gap-2 font-mono text-sm">
            <Trash2 className="size-4 text-destructive" /> Eliminar respaldo
          </DialogTitle>
          <DialogDescription className="text-xs">Se borrará del host de forma permanente:</DialogDescription>
          <code className="break-all rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-[11px] text-foreground">
            {backup?.filename}
          </code>
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-surface px-4 py-3">
          <button type="button" onClick={() => onOpenChange(false)} className={btn.outline}>
            Cancelar
          </button>
          <button type="button" onClick={run} disabled={busy} className={btn.danger}>
            {busy && <Loader2 className="size-3.5 animate-spin" />} Eliminar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
