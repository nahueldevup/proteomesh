import { useMemo, useState } from 'react';
import {
  Archive,
  CalendarClock,
  FileArchive,
  HardDrive,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Unlock,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useBackups, useBackupSchedule, useInstances, queryKeys } from '../../lib/queries';
import { api } from '../../lib/api';
import type { BackupItem } from '../../types';
import { cn } from '../../lib/utils';
import { IconBtn } from '../ui/IconBtn';
import { MetricCell, SectionLabel, Segmented } from './BackupPrimitives';
import { BackupInspector, InspectorEmpty } from './BackupInspector';
import { ScheduleCard } from './ScheduleCard';
import { FleetIdentities } from './FleetIdentities';
import { CreateBackupDialog, DeleteBackupDialog, ScheduleDialog } from './BackupDialogs';
import { formatBytes, formatDate, freshnessTone, hoursSince, relativeTime, toneText } from './backupFormat';

type Tab = 'catalog' | 'fleet';
type Filter = 'all' | 'encrypted' | 'plain';

export function BackupsManager() {
  const queryClient = useQueryClient();
  const { data: backups = [], isLoading, isFetching, refetch } = useBackups();
  const { data: schedule, isLoading: scheduleLoading } = useBackupSchedule();
  const { data: instances = [] } = useInstances(false);

  const [tab, setTab] = useState<Tab>('catalog');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [toDelete, setToDelete] = useState<BackupItem | null>(null);
  const [triggering, setTriggering] = useState(false);

  const filtered = useMemo(
    () =>
      backups.filter((b) => {
        if (!b.filename.toLowerCase().includes(query.toLowerCase())) return false;
        if (filter === 'encrypted') return b.encrypted;
        if (filter === 'plain') return !b.encrypted;
        return true;
      }),
    [backups, query, filter]
  );

  const stats = useMemo(() => {
    const total = backups.reduce((a, b) => a + b.size_bytes, 0);
    const enc = backups.filter((b) => b.encrypted).length;
    const last = backups[0] ?? null;
    return { total, enc, last, max: Math.max(1, ...backups.map((b) => b.size_bytes)) };
  }, [backups]);

  const current = backups.find((b) => b.filename === selected) ?? filtered[0] ?? null;
  const freshness = freshnessTone(hoursSince(stats.last?.modified_at));

  const triggerNow = async () => {
    setTriggering(true);
    const id = toast.loading('Disparando timer de respaldo…');
    try {
      const r = await api.triggerBackupScheduleNow();
      toast.success(r.message || 'Ejecución iniciada en segundo plano', { id });
      queryClient.invalidateQueries({ queryKey: queryKeys.backups });
      queryClient.invalidateQueries({ queryKey: queryKeys.backupSchedule });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo disparar el timer', { id });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background font-sans">
      {/* ── CABECERA CANÓNICA 55px ── */}
      <header className="flex h-[55px] shrink-0 items-center gap-4 border-b border-border bg-background px-4 py-2.5 select-none">
        <h1 className="whitespace-nowrap font-mono text-base font-semibold text-foreground">
          Backups e Identidades
        </h1>
        <Segmented<Tab>
          size="md"
          value={tab}
          onChange={setTab}
          options={[
            {
              value: 'catalog',
              label: (
                <>
                  <FileArchive className="size-3.5" /> Catálogo{' '}
                  <span className="rounded-sm border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                    {backups.length}
                  </span>
                </>
              ),
            },
            {
              value: 'fleet',
              label: (
                <>
                  <Smartphone className="size-3.5" /> Identidades de flota{' '}
                  <span className="rounded-sm border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                    {instances.length}
                  </span>
                </>
              ),
            },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5">
          <IconBtn
            icon={RefreshCw}
            label="Recargar catálogo"
            onClick={() => refetch()}
            className={cn(isFetching && '[&_svg]:animate-spin')}
          />
          <IconBtn
            icon={CalendarClock}
            label="Programación automática"
            onClick={() => setScheduleOpen(true)}
          />
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-3.5" /> Nuevo respaldo
          </button>
        </div>
      </header>

      {tab === 'fleet' ? (
        <FleetIdentities
          instances={instances}
          lastBackup={stats.last}
          onBackupNow={() => setCreateOpen(true)}
        />
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* ── SECCIÓN PRINCIPAL ── */}
          <section className="flex min-w-0 flex-1 flex-col border-r border-border">
            {/* Métricas KPI */}
            <div className="grid shrink-0 grid-cols-4 gap-px border-b border-border bg-border select-none">
              <MetricCell
                icon={<Archive className="size-3.5 text-primary" />}
                label="Respaldos"
                value={backups.length}
                sub={`retención ${schedule?.keep ?? '—'}`}
              />
              <MetricCell
                icon={<HardDrive className="size-3.5 text-muted-foreground" />}
                label="Espacio en host"
                value={formatBytes(stats.total)}
                valueClassName="text-base"
                sub="ocupado"
              />
              <MetricCell
                icon={<Lock className="size-3.5 text-success" />}
                label="Cifrados"
                value={`${stats.enc}/${backups.length}`}
                sub="AES-256"
                bar={backups.length ? stats.enc / backups.length : 0}
                barClass={stats.enc === backups.length ? 'bg-success' : 'bg-warning'}
              />
              <MetricCell
                icon={<ShieldCheck className={cn('size-3.5', toneText[freshness])} />}
                label="Último respaldo"
                value={relativeTime(stats.last?.modified_at)}
                valueClassName={cn('text-base', toneText[freshness])}
                sub={
                  schedule?.active && schedule.next_run
                    ? `próx. ${relativeTime(schedule.next_run)}`
                    : 'timer apagado'
                }
                onClick={() => setScheduleOpen(true)}
              />
            </div>

            {/* Sub-toolbar */}
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
              <div className="flex h-7 w-72 items-center gap-2 rounded-md border border-input bg-background px-2">
                <Search className="size-3.5 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre de archivo…"
                  className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Segmented<Filter>
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'Todos' },
                  { value: 'encrypted', label: <><Lock className="size-3" /> Cifrados</> },
                  { value: 'plain', label: <><Unlock className="size-3" /> Planos</> },
                ]}
              />
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {filtered.length} de {backups.length}
              </span>
            </div>

            {/* Tabla de catálogo */}
            <div className="min-h-0 flex-1 overflow-auto">
              {isLoading ? (
                <div className="flex flex-col">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-11 animate-pulse border-b border-border bg-surface/50" />
                  ))}
                </div>
              ) : backups.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                  <span className="flex size-10 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground">
                    <Archive className="size-5" />
                  </span>
                  <div>
                    <div className="text-sm font-medium text-foreground">Todavía no hay respaldos</div>
                    <div className="text-xs text-muted-foreground">
                      Las identidades de la flota no están protegidas.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="size-3.5" /> Crear el primero
                  </button>
                </div>
              ) : (
                <table className="w-full table-fixed text-left">
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="w-10 px-3 py-2" />
                      <th className="px-3 py-2 font-medium">Archivo</th>
                      <th className="w-[150px] px-3 py-2 font-medium">Tamaño</th>
                      <th className="w-[140px] px-3 py-2 font-medium">Creado</th>
                      <th className="w-[84px] px-3 py-2 text-right font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((b, idx) => {
                      const active = current?.filename === b.filename;
                      return (
                        <tr
                          key={b.filename}
                          onClick={() => setSelected(b.filename)}
                          className={cn(
                            'group cursor-pointer border-b border-border transition-colors hover:bg-surface',
                            active && 'bg-accent/60 hover:bg-accent/60'
                          )}
                        >
                          <td className="px-3 py-2">
                            {b.encrypted ? (
                              <Lock className="size-3.5 text-success" />
                            ) : (
                              <Unlock className="size-3.5 text-warning" />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-mono text-xs font-medium text-foreground">
                                {b.filename}
                              </span>
                              {idx === 0 && query === '' && filter === 'all' && (
                                <span className="shrink-0 rounded-sm border border-primary/40 bg-primary/10 px-1.5 font-mono text-[10px] text-primary">
                                  último
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="w-[68px] shrink-0 font-mono text-xs tabular-nums text-foreground">
                                {b.size_human}
                              </span>
                              <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                                <span
                                  className="block h-full rounded-full bg-primary/70"
                                  style={{
                                    width: `${Math.max(4, (b.size_bytes / stats.max) * 100)}%`,
                                  }}
                                />
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-mono text-xs text-foreground">
                              {formatDate(b.modified_at)}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground">
                              {relativeTime(b.modified_at)}
                            </div>
                          </td>
                          <td className="px-2 py-1 text-right">
                            <div className="flex justify-end opacity-60 transition-opacity group-hover:opacity-100">
                              <a
                                href={api.getDownloadBackupUrl(b.filename)}
                                download
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Descargar"
                                className="inline-flex size-7 items-center justify-center rounded-sm text-foreground/80 hover:bg-muted hover:text-foreground"
                              >
                                <Download className="size-3.5" />
                              </a>
                              <IconBtn
                                icon={Trash2}
                                label="Eliminar"
                                size="sm"
                                variant="danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setToDelete(b);
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-6 text-center text-xs text-muted-foreground"
                        >
                          Ningún respaldo coincide con el filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* ── ASIDE INSPECTOR 380px — sin border-l (evita bug 379px) ── */}
          <aside className="flex w-[380px] shrink-0 flex-col overflow-y-auto bg-background">
            <SectionLabel>Respaldo seleccionado</SectionLabel>
            {current ? (
              <BackupInspector backup={current} onDelete={setToDelete} />
            ) : (
              <InspectorEmpty />
            )}
            <div className="border-t border-border" />
            <SectionLabel>Respaldo automático</SectionLabel>
            <ScheduleCard
              schedule={schedule}
              loading={scheduleLoading}
              onEdit={() => setScheduleOpen(true)}
              onTrigger={triggerNow}
              triggering={triggering}
            />
          </aside>
        </div>
      )}

      {/* ── DIÁLOGOS — renderizados en portal Radix a document.body (z-[9999]) ── */}
      <CreateBackupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(b) => {
          setTab('catalog');
          setSelected(b.filename);
        }}
      />
      <ScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} schedule={schedule} />
      <DeleteBackupDialog
        backup={toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        onDeleted={() => setSelected(null)}
      />
    </div>
  );
}
