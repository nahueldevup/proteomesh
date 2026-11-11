import {
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export interface FocusHealthTabProps {
  healthChecking: boolean;
  healthReport: { ok: boolean; reports: string[] } | null;
  onCheckHealth: () => void;
}

export function FocusHealthTab({
  healthChecking,
  healthReport,
  onCheckHealth,
}: FocusHealthTabProps) {
  return (
    <div className="flex flex-col gap-2.5 pt-2.5 flex-1 min-h-0 overflow-hidden">
      {/* Cabecera con título y botón de acción prominente */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <span>Auditoría de Integridad y Antifraude</span>
        </div>

        <button
          disabled={healthChecking}
          onClick={onCheckHealth}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 shadow-sm shrink-0 cursor-pointer"
        >
          {healthChecking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          <span>Ejecutar Diagnóstico</span>
        </button>
      </div>

      {/* Resumen del diagnóstico real (GET /instances/{name}/health) */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono shrink-0">
        <div className="rounded-lg border border-border bg-background/80 p-2 space-y-0.5">
          <span className="text-muted-foreground text-[10px]">Resultado</span>
          <div
            className={cn(
              'font-bold text-xs flex items-center gap-1',
              !healthReport
                ? 'text-muted-foreground'
                : healthReport.ok
                ? 'text-success'
                : 'text-warning'
            )}
          >
            {!healthReport ? '—' : healthReport.ok ? 'Sin alertas' : 'Con advertencias'}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background/80 p-2 space-y-0.5">
          <span className="text-muted-foreground text-[10px]">Comprobaciones</span>
          <div className="font-bold text-foreground text-xs">
            {healthReport ? healthReport.reports.length : '—'}
          </div>
        </div>
      </div>

      {/* Consola de resultados con altura flexible interna y scroll para PREVENIR cualquier desborde */}
      <div className="flex-1 min-h-0 rounded-lg border border-border bg-background/90 p-2.5 font-mono text-xs overflow-y-auto">
        {healthReport ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-primary">
              <span>Resultados de auditoría:</span>
              <span className="text-[10px] text-muted-foreground font-normal">
                {healthReport.reports.length} comprobaciones
              </span>
            </div>
            <ul className="list-disc pl-4 text-muted-foreground space-y-0.5 text-[11px]">
              {healthReport.reports.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex h-full min-h-[90px] flex-col items-center justify-center text-center text-muted-foreground/60 text-xs gap-1.5 p-2">
            <CheckCircle2 className="h-6 w-6 text-muted-foreground/30" />
            <span>Listo para auditar heurísticas de emulación y root.</span>
            <span className="text-[10px] text-muted-foreground/40">
              Haz clic en "Ejecutar Diagnóstico" arriba para iniciar el test.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
