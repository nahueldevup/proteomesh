import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  Lock,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Unlock,
  XCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queries';
import type { BackupItem } from '../../types';
import { cn } from '../../lib/utils';
import { KV, PassphraseInput, Segmented, btn } from './BackupPrimitives';
import { formatDate, relativeTime } from './backupFormat';

type Mode = 'verify' | 'restore';

export function BackupInspector({
  backup,
  onDelete,
}: {
  backup: BackupItem;
  onDelete: (b: BackupItem) => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('verify');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [dest, setDest] = useState('');
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setPass('');
    setResult(null);
    setConfirm(false);
    setDest('');
    setMode('verify');
  }, [backup.filename]);

  const needsPass = backup.encrypted;
  const ext = backup.filename.endsWith('.enc') ? '.tar.gz.enc' : '.tar.gz';

  const verify = async () => {
    if (needsPass && !pass.trim()) return toast.error('Ingresá la frase de paso para verificar');
    setBusy(true);
    setResult(null);
    try {
      const res = await api.verifyBackup({
        filename: backup.filename,
        passphrase: needsPass ? pass : undefined,
      });
      setResult({ valid: res.valid, message: res.message });
    } catch (err) {
      setResult({
        valid: false,
        message: err instanceof Error ? err.message : 'Fallo de descifrado',
      });
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (needsPass && !pass.trim()) return toast.error('Ingresá la frase de paso para descifrar');
    if (!confirm) return toast.error('Confirmá la sobreescritura de identidades');
    setBusy(true);
    const id = toast.loading(`Restaurando ${backup.filename}…`);
    try {
      const res = await api.restoreBackup({
        filename: backup.filename,
        passphrase: needsPass ? pass : undefined,
        restore_dest: dest.trim() || undefined,
      });
      toast.success(`Restaurado en ${res.restore_dest}`, { id });
      setConfirm(false);
      setPass('');
      [queryKeys.backups, queryKeys.instances, queryKeys.ipLedger, queryKeys.usb].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: k })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al restaurar', { id });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Identificación del archivo */}
      <div className="flex items-start gap-3 border-b border-border px-3 py-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-md border',
            backup.encrypted
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-warning/40 bg-warning/10 text-warning'
          )}
        >
          {backup.encrypted ? <Lock className="size-4" /> : <Unlock className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="break-all font-mono text-xs font-semibold leading-snug text-foreground">
            {backup.filename}
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
            {relativeTime(backup.modified_at)} · {backup.size_human}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-border bg-border">
        <KV label="Creado" value={formatDate(backup.modified_at)} />
        <KV label="Tamaño" value={`${backup.size_human}`} />
        <KV
          label="Cifrado"
          value={
            backup.encrypted ? (
              <span className="text-success">{(backup.cipher || 'aes-256-cbc').toUpperCase()}</span>
            ) : (
              <span className="text-warning">Plano</span>
            )
          }
        />
        <KV label="Formato" value={ext} />
      </div>

      <div className="flex gap-2 border-b border-border px-3 py-2.5">
        <a
          href={api.getDownloadBackupUrl(backup.filename)}
          download
          className={cn(btn.outline, 'flex-1')}
        >
          <Download className="size-3.5" /> Descargar
        </a>
        <button type="button" onClick={() => onDelete(backup)} className={btn.ghostDanger}>
          <Trash2 className="size-3.5" /> Eliminar
        </button>
      </div>

      {/* Operaciones */}
      <div className="flex flex-col gap-2.5 px-3 py-3">
        <Segmented<Mode>
          value={mode}
          onChange={(m) => {
            setMode(m);
            setResult(null);
          }}
          options={[
            { value: 'verify', label: <><ShieldCheck className="size-3.5" /> Verificar</> },
            { value: 'restore', label: <><RotateCcw className="size-3.5" /> Restaurar</> },
          ]}
        />

        <p className="text-[11px] leading-snug text-muted-foreground">
          {mode === 'verify'
            ? 'Comprueba integridad y contraseña sin descomprimir ni tocar el disco.'
            : 'Reemplaza identidades y bases SQLite del entorno activo con este respaldo.'}
        </p>

        {needsPass ? (
          <PassphraseInput value={pass} onChange={setPass} invalid={result?.valid === false} />
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground">
            <Unlock className="size-3.5" /> Archivo plano: no requiere frase de paso
          </div>
        )}

        {mode === 'restore' && (
          <>
            <input
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              placeholder="Destino (vacío = entorno activo)"
              className="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
            />
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-[11px] leading-snug text-foreground">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
                className="mt-0.5 accent-[var(--warning)]"
              />
              <span>
                <AlertTriangle className="mr-1 inline size-3 text-warning" />
                Entiendo que se sobrescribirán IMEI, MAC, seriales y bases actuales.
              </span>
            </label>
          </>
        )}

        {mode === 'verify' ? (
          <button type="button" onClick={verify} disabled={busy} className={btn.primary}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}{' '}
            Verificar integridad
          </button>
        ) : (
          <button
            type="button"
            onClick={restore}
            disabled={busy || !confirm}
            className={btn.danger}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}{' '}
            Restaurar respaldo
          </button>
        )}

        {result && mode === 'verify' && (
          <div
            className={cn(
              'flex items-start gap-2 rounded-md border p-2 text-[11px] leading-snug',
              result.valid
                ? 'border-success/40 bg-success/10'
                : 'border-destructive/40 bg-destructive/10'
            )}
          >
            {result.valid ? (
              <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" />
            ) : (
              <XCircle className="mt-px size-3.5 shrink-0 text-destructive" />
            )}
            <div className="min-w-0">
              <div
                className={cn(
                  'font-semibold',
                  result.valid ? 'text-success' : 'text-destructive'
                )}
              >
                {result.valid ? 'Respaldo íntegro' : 'Verificación fallida'}
              </div>
              <div className="break-words font-mono text-muted-foreground">{result.message}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function InspectorEmpty() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <FileArchive className="size-6 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">
        Seleccioná un respaldo para verificarlo, restaurarlo o descargarlo.
      </p>
    </div>
  );
}
