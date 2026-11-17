import type { Carrier } from '../../types';
import { cn } from '../../lib/utils';
import { RAM_PRESETS, CPU_PRESETS } from './wizardTypes';

export interface StepResourcesSummaryProps {
  isDense: boolean;
  setIsDense: (dense: boolean) => void;
  memoryLimit: string;
  setMemoryLimit: (limit: string) => void;
  cpuLimit: string;
  setCpuLimit: (limit: string) => void;
  startImmediately: boolean;
  setStartImmediately: (start: boolean) => void;
  name: string;
  port: number;
  selectedModel: string;
  selectedCarrier: string;
  carriers: Carrier[];
  phoneNumber: string;
  city: string;
  latitude: number;
  longitude: number;
}

export function StepResourcesSummary({
  isDense,
  setIsDense,
  memoryLimit,
  setMemoryLimit,
  cpuLimit,
  setCpuLimit,
  startImmediately,
  setStartImmediately,
  name,
  port,
  selectedModel,
  selectedCarrier,
  carriers,
  phoneNumber,
  city,
  latitude,
  longitude,
}: StepResourcesSummaryProps) {
  const carrierName = carriers.find((c) => c.id === selectedCarrier)?.carrier_name || selectedCarrier;

  return (
    <div className="space-y-4">
      {/* Selector de Modo Denso */}
      <div
        role="switch"
        aria-checked={isDense}
        aria-label="Modo Denso (Flotas Livianas)"
        tabIndex={0}
        onClick={() => setIsDense(!isDense)}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            setIsDense(!isDense);
          }
        }}
        className={cn(
          'flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer',
          isDense
            ? 'bg-emerald-500/10 border-primary shadow-xs'
            : 'bg-background/60 border-border hover:border-border/80'
        )}
      >
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Modo Denso (Flotas Livianas)</span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium',
                isDense ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              )}
            >
              {isDense ? 'ACTIVADO' : 'ESTÁNDAR'}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {isDense
              ? 'Asigna 2048m RAM + 1200m Swap ZRAM. Habilita hasta 4 instancias simultáneas en 16 GiB.'
              : 'Activa esta opción para compactar la huella de memoria con compresión ZRAM del kernel.'}
          </p>
        </div>
        <div
          className={cn(
            'w-10 h-5 rounded-full transition-colors relative flex items-center p-0.5 shrink-0',
            isDense ? 'bg-primary' : 'bg-muted-foreground/30'
          )}
        >
          <div
            className={cn(
              'w-4 h-4 rounded-full bg-white transition-transform shadow-xs',
              isDense ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        </div>
      </div>

      {/* Asignación de Recursos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-foreground">
            Memoria RAM {isDense && <span className="text-primary font-normal">(Modo Denso)</span>}
          </span>
          <div className="flex gap-1.5">
            {isDense ? (
              <div className="flex-1 h-8 rounded-md border border-primary bg-emerald-500/15 flex items-center justify-center font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                2048m RAM + 1200m ZRAM
              </div>
            ) : (
              RAM_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setMemoryLimit(p)}
                  className={cn(
                    'flex-1 h-8 rounded-md border font-mono text-xs transition-colors cursor-pointer',
                    memoryLimit === p
                      ? 'bg-emerald-500/15 border-primary text-emerald-600 dark:text-emerald-400 font-bold'
                      : 'bg-background border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {p}
                </button>
              ))
            )}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            {isDense
              ? 'Descarga automática de memoria fría al swap ZRAM de host'
              : 'Recomendado: 2.5g (Óptimo para 120Hz con 700m swap)'}
          </span>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-foreground">
            CPU Pinning (Aislamiento SMT Zen 3)
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {CPU_PRESETS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCpuLimit(c.value)}
                title={c.desc}
                className={cn(
                  'h-8 px-2 rounded-md border font-mono text-[11px] transition-colors cursor-pointer text-left truncate flex items-center justify-between',
                  cpuLimit === c.value
                    ? 'bg-emerald-500/15 border-primary text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'bg-background border-border text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="truncate">{c.label}</span>
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            {CPU_PRESETS.find((c) => c.value === cpuLimit)?.desc || 'Mitiga contención de CPU'}
          </span>
        </div>
      </div>

      <label
        htmlFor="wizard-start-immediately"
        aria-label="Iniciar contenedor inmediatamente"
        className="flex items-center gap-2 cursor-pointer p-2 rounded-md border border-border bg-background/50"
      >
        <input
          id="wizard-start-immediately"
          type="checkbox"
          checked={startImmediately}
          onChange={(e) => setStartImmediately(e.target.checked)}
          className="rounded border-border text-primary focus:ring-0 h-4 w-4"
        />
        <div className="text-xs">
          <span className="font-semibold text-foreground">Iniciar contenedor inmediatamente</span>
          <p className="text-[11px] text-muted-foreground">
            Arranca el entorno Android y levanta el servicio ADB tras la creación
          </p>
        </div>
      </label>

      {/* Ficha Técnica de Resumen Determinista */}
      <div className="rounded-lg border border-border/80 bg-background/80 p-3.5 font-mono text-xs space-y-2">
        <div className="flex items-center justify-between border-b border-border/50 pb-2 text-foreground font-semibold">
          <span>Ficha Técnica de Aprovisionamiento</span>
          <span className="text-primary text-[11px]">ProteoMesh Deterministic</span>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
          <div className="flex justify-between border-b border-border/30 py-1">
            <span className="text-muted-foreground">Instancia:</span>
            <span className="text-foreground">{name || '---'}</span>
          </div>
          <div className="flex justify-between border-b border-border/30 py-1">
            <span className="text-muted-foreground">Puerto ADB:</span>
            <span className="text-foreground">:{port}</span>
          </div>
          <div className="flex justify-between border-b border-border/30 py-1">
            <span className="text-muted-foreground">Modelo:</span>
            <span className="text-foreground">{selectedModel}</span>
          </div>
          <div className="flex justify-between border-b border-border/30 py-1">
            <span className="text-muted-foreground">Operadora:</span>
            <span className="text-foreground">{carrierName}</span>
          </div>
          <div className="flex justify-between border-b border-border/30 py-1">
            <span className="text-muted-foreground">Línea Telefónica:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {phoneNumber ? (phoneNumber.startsWith('+') ? phoneNumber : `+549${phoneNumber}`) : 'Automática (Formosa)'}
            </span>
          </div>
          <div className="flex justify-between border-b border-border/30 py-1">
            <span className="text-muted-foreground">Recursos:</span>
            <span className="text-foreground">
              {isDense ? '2048M RAM · 1200M SWAP' : `${memoryLimit.toUpperCase()} RAM · 700M SWAP`}
              {' · '}
              {cpuLimit === 'auto' ? 'CPU AUTO SMT' : `CPU ${cpuLimit}`}
            </span>
          </div>
          <div className="flex justify-between border-b border-border/30 py-1">
            <span className="text-muted-foreground">GPS / Ciudad:</span>
            <span className="text-foreground">{city} ({latitude.toFixed(2)}, {longitude.toFixed(2)})</span>
          </div>
          <div className="flex justify-between border-b border-border/30 py-1">
            <span className="text-muted-foreground">Arranque Inmediato:</span>
            <span className={startImmediately ? 'text-primary' : 'text-muted-foreground'}>
              {startImmediately ? 'SÍ (Boot T=0)' : 'NO (Manual)'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
