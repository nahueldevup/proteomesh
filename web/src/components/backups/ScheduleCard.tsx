import { CalendarClock, Loader2, Lock, Play, Settings2, Unlock } from 'lucide-react';
import type { BackupScheduleStatus } from '../../types';
import { cn } from '../../lib/utils';
import { KV, btn } from './BackupPrimitives';
import { formatDate, relativeTime } from './backupFormat';

export function ScheduleCard({
  schedule,
  loading,
  onEdit,
  onTrigger,
  triggering,
}: {
  schedule?: BackupScheduleStatus;
  loading: boolean;
  onEdit: () => void;
  onTrigger: () => void;
  triggering: boolean;
}) {
  const active = !!schedule?.active;
  const freq = schedule?.frequency === 'weekly' ? 'Semanal' : 'Diaria';
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-3 py-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-md border',
            active
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-surface text-muted-foreground'
          )}
        >
          <CalendarClock className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <span
              className={cn(
                'size-1.5 rounded-full',
                active ? 'bg-success animate-pulse' : 'bg-muted-foreground'
              )}
            />
            {loading
              ? 'Consultando timer…'
              : active
              ? `${freq} a las ${schedule?.time}`
              : 'Timer desactivado'}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {schedule?.calendar_spec ? `systemd · ${schedule.calendar_spec}` : 'systemd timer'}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px border-y border-border bg-border">
        <KV
          label="Próxima"
          value={
            active && schedule?.next_run ? (
              <span className="text-primary">{relativeTime(schedule.next_run)}</span>
            ) : (
              '—'
            )
          }
        />
        <KV label="Última" value={relativeTime(schedule?.last_run)} />
        <KV label="Retención" value={`${schedule?.keep ?? '—'} copias`} />
        <KV
          label="Cifrado"
          value={
            schedule?.encrypted ? (
              <span className="inline-flex items-center gap-1 text-success">
                <Lock className="size-3" />
                AES-256
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-warning">
                <Unlock className="size-3" />
                Plano
              </span>
            )
          }
        />
      </div>
      {schedule?.next_run && active && (
        <div className="border-b border-border px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
          next_run {formatDate(schedule.next_run)}
        </div>
      )}
      <div className="flex gap-2 px-3 py-2.5">
        <button type="button" onClick={onEdit} className={cn(btn.outline, 'flex-1')}>
          <Settings2 className="size-3.5" /> Configurar
        </button>
        <button
          type="button"
          onClick={onTrigger}
          disabled={triggering || !active}
          className={cn(btn.outline, 'flex-1')}
          title={!active ? 'Activá el timer para probarlo' : undefined}
        >
          {triggering ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}{' '}
          Probar ahora
        </button>
      </div>
    </div>
  );
}
