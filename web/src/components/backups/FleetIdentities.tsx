import { useMemo, useState } from 'react';
import { Check, Copy, Cpu, Search, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
import type { BackupItem, Instance } from '../../types';
import { cn } from '../../lib/utils';
import { MetricCell, SectionLabel, KV, btn } from './BackupPrimitives';
import { formatDate, freshnessTone, hoursSince, relativeTime, toneText } from './backupFormat';

function CopyCell({ value }: { value?: string }) {
  const [ok, setOk] = useState(false);
  if (!value)
    return <span className="text-muted-foreground/60">—</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}
      className="group inline-flex max-w-full cursor-pointer items-center gap-1 truncate font-mono text-xs text-foreground hover:text-primary"
    >
      <span className="truncate">{value}</span>
      {ok ? (
        <Check className="size-3 shrink-0 text-success" />
      ) : (
        <Copy className="size-3 shrink-0 opacity-0 group-hover:opacity-60" />
      )}
    </button>
  );
}

export function FleetIdentities({
  instances,
  lastBackup,
  onBackupNow,
}: {
  instances: Instance[];
  lastBackup: BackupItem | null;
  onBackupNow: () => void;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      instances.filter((i) => {
        const t = q.toLowerCase();
        return (
          !t ||
          [
            i.instance_name,
            i.template,
            i.carrier,
            i.identity?.imei,
            i.identity?.serial,
            i.identity?.wifi_mac,
          ].some((v) => v?.toLowerCase().includes(t))
        );
      }),
    [instances, q]
  );

  const complete = (i: Instance) =>
    !!(i.identity?.imei && i.identity?.serial && i.identity?.wifi_mac);
  const running = instances.filter((i) => i.running).length;
  const completeCount = instances.filter(complete).length;
  const hrs = hoursSince(lastBackup?.modified_at);
  const tone = freshnessTone(hrs);
  const current = instances.find((i) => i.instance_name === sel) ?? rows[0] ?? null;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* ── TABLA PRINCIPAL ── */}
      <section className="flex min-w-0 flex-1 flex-col border-r border-border">
        <div className="grid shrink-0 grid-cols-4 gap-px border-b border-border bg-border select-none">
          <MetricCell
            icon={<Smartphone className="size-3.5 text-primary" />}
            label="CloudPhones"
            value={instances.length}
            sub={`${running} en ejecución`}
            bar={instances.length ? running / instances.length : 0}
          />
          <MetricCell
            icon={<Cpu className="size-3.5 text-success" />}
            label="Identidad completa"
            value={`${completeCount}/${instances.length}`}
            sub="IMEI · serial · MAC"
            bar={instances.length ? completeCount / instances.length : 0}
          />
          <MetricCell
            icon={<ShieldCheck className={cn('size-3.5', toneText[tone])} />}
            label="Último resguardo"
            value={relativeTime(lastBackup?.modified_at)}
            valueClassName={cn('text-base', toneText[tone])}
            sub={lastBackup?.encrypted ? 'cifrado' : lastBackup ? 'plano' : 'sin respaldo'}
          />
          <MetricCell
            icon={<ShieldAlert className="size-3.5 text-warning" />}
            label="Sin cubrir"
            value={instances.length - completeCount}
            sub="identidades parciales"
          />
        </div>

        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <div className="flex h-7 w-72 items-center gap-2 rounded-md border border-input bg-background px-2">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar dispositivo, IMEI, MAC…"
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">{rows.length} dispositivos</span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed text-left">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="w-[150px] px-3 py-2 font-medium">Dispositivo</th>
                <th className="w-[130px] px-3 py-2 font-medium">Modelo</th>
                <th className="px-3 py-2 font-medium">IMEI</th>
                <th className="px-3 py-2 font-medium">Serial</th>
                <th className="px-3 py-2 font-medium">MAC Wi-Fi</th>
                <th className="w-[96px] px-3 py-2 text-right font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr
                  key={i.instance_name}
                  onClick={() => setSel(i.instance_name)}
                  className={cn(
                    'cursor-pointer border-b border-border transition-colors hover:bg-surface',
                    current?.instance_name === i.instance_name && 'bg-accent/60 hover:bg-accent/60'
                  )}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          i.running ? 'bg-success' : 'bg-muted-foreground'
                        )}
                      />
                      <span className="truncate font-mono text-xs font-semibold text-foreground">
                        {i.instance_name}
                      </span>
                    </div>
                  </td>
                  <td className="truncate px-3 py-2 text-xs text-muted-foreground">{i.template ?? '—'}</td>
                  <td className="px-3 py-2">
                    <CopyCell value={i.identity?.imei} />
                  </td>
                  <td className="px-3 py-2">
                    <CopyCell value={i.identity?.serial} />
                  </td>
                  <td className="px-3 py-2">
                    <CopyCell value={i.identity?.wifi_mac} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {complete(i) ? (
                      <span className="rounded-sm border border-success/40 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] text-success">
                        completa
                      </span>
                    ) : (
                      <span className="rounded-sm border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] text-warning">
                        parcial
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Sin dispositivos que coincidan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── ASIDE INSPECTOR 380px — sin border-l (evita bug 379px) ── */}
      <aside className="flex w-[380px] shrink-0 flex-col overflow-y-auto bg-background">
        <SectionLabel>Ficha de identidad</SectionLabel>
        {current ? (
          <>
            <div className="flex items-center gap-3 border-b border-border px-3 py-3">
              <span className="flex size-9 items-center justify-center rounded-md border border-border bg-surface text-primary">
                <Smartphone className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold text-foreground">{current.instance_name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {current.template} · {current.carrier ?? 'sin operador'} · ADB {current.adb_port}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-px border-b border-border bg-border">
              <KV label="IMEI" value={<CopyCell value={current.identity?.imei} />} />
              <KV label="Serial" value={<CopyCell value={current.identity?.serial} />} />
              <KV label="MAC Wi-Fi" value={<CopyCell value={current.identity?.wifi_mac} />} />
              <KV label="Teléfono" value={<CopyCell value={current.identity?.phone_number} />} />
            </div>
          </>
        ) : (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No hay CloudPhones en la flota.
          </p>
        )}
        <SectionLabel>Estado de resguardo</SectionLabel>
        <div className="flex flex-col gap-2.5 px-3 py-3">
          <div
            className={cn(
              'rounded-md border p-2.5 text-[11px] leading-snug',
              tone === 'success'
                ? 'border-success/40 bg-success/10'
                : tone === 'warning'
                ? 'border-warning/40 bg-warning/10'
                : 'border-destructive/40 bg-destructive/10'
            )}
          >
            <div className={cn('font-semibold', toneText[tone])}>
              {tone === 'success'
                ? 'Flota resguardada'
                : tone === 'warning'
                ? 'Respaldo desactualizado'
                : 'Sin respaldo reciente'}
            </div>
            <div className="text-muted-foreground">
              {lastBackup ? (
                <>
                  Último: <span className="font-mono">{formatDate(lastBackup.modified_at)}</span>. Cambios
                  posteriores en identidades no están protegidos.
                </>
              ) : (
                'Ninguna identidad está respaldada todavía.'
              )}
            </div>
          </div>
          <button type="button" onClick={onBackupNow} className={btn.primary}>
            <ShieldCheck className="size-3.5" /> Respaldar flota ahora
          </button>
        </div>
      </aside>
    </div>
  );
}
