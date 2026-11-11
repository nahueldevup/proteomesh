import type { Carrier } from '../../types';
import { cn } from '../../lib/utils';
import { RAM_PRESETS, CPU_PRESETS } from './wizardTypes';

export interface StepResourcesSummaryProps {
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
      {/* Asignación de Recursos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-foreground">
            Memoria RAM
          </span>
          <div className="flex gap-1.5">
            {RAM_PRESETS.map((p) => (
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
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            Recomendado: 2.5g (Óptimo para 120Hz)
          </span>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-foreground">
            CPU Pinning (Aislamiento de Hilos)
          </span>
          <div className="flex gap-1.5">
            {CPU_PRESETS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCpuLimit(c.value)}
                className={cn(
                  'flex-1 h-8 rounded-md border font-mono text-xs transition-colors cursor-pointer',
                  cpuLimit === c.value
                    ? 'bg-emerald-500/15 border-primary text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'bg-background border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {c.value}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            Asignación de núcleos de CPU para mitigar contención
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
            <span className="font-bold text-foreground">{name}</span>
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
            <span className="text-foreground">{memoryLimit.toUpperCase()} RAM · CPU {cpuLimit}</span>
          </div>
          <div className="flex justify-between border-b border-border/30 py-1">
            <span className="text-muted-foreground">GPS / Ciudad:</span>
            <span className="text-foreground">{city} ({latitude.toFixed(2)}, {longitude.toFixed(2)})</span>
          </div>
          <div className="flex justify-between border-b border-border/30 py-1">
            <span className="text-muted-foreground">Red / Aislamiento:</span>
            <span className="text-foreground">Cuarentena T=0 (Módem USB)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
