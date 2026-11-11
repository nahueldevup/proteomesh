import { Check, Sparkles } from 'lucide-react';
import type { Carrier, TemplateItem } from '../../types';
import { cn } from '../../lib/utils';
import { COUNTRY_NAMES } from './wizardTypes';

export interface StepDeviceSimProps {
  name: string;
  setName: (name: string) => void;
  port: number;
  setPort: (port: number) => void;
  existingPorts: number[];
  selectedCarrier: string;
  setSelectedCarrier: (carrier: string) => void;
  carriers: Carrier[];
  phoneNumber: string;
  setPhoneNumber: (phone: string) => void;
  onGeneratePhoneNumber: () => void;
  brands: string[];
  selectedBrand: string;
  onSelectBrand: (brand: string) => void;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  currentBrandModels: TemplateItem[];
}

export function StepDeviceSim({
  name,
  setName,
  port,
  setPort,
  existingPorts,
  selectedCarrier,
  setSelectedCarrier,
  carriers,
  phoneNumber,
  setPhoneNumber,
  onGeneratePhoneNumber,
  brands,
  selectedBrand,
  onSelectBrand,
  selectedModel,
  onSelectModel,
  currentBrandModels,
}: StepDeviceSimProps) {
  return (
    <div className="space-y-4">
      {/* Fila: Nombre, Puerto ADB, Operadora y Línea Móvil */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Nombre de la Instancia
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
            className="w-full h-8.5 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="ej: phone-01"
          />
          <span className="text-[10px] text-muted-foreground mt-1 block">Minúsculas, números o guiones</span>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Puerto ADB
          </label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            className={cn(
              'w-full h-8.5 rounded-md border bg-background px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1',
              existingPorts.includes(port)
                ? 'border-destructive focus:ring-destructive'
                : 'border-input focus:ring-primary'
            )}
            min={1024}
            max={65535}
          />
          <span className={cn('text-[10px] mt-1 block', existingPorts.includes(port) ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-muted-foreground')}>
            {existingPorts.includes(port) ? 'Puerto en uso' : 'Mapeado al 5555 del contenedor'}
          </span>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Operadora Móvil (SIM)
          </label>
          <select
            value={selectedCarrier}
            onChange={(e) => setSelectedCarrier(e.target.value)}
            className="w-full h-8.5 rounded-md border border-input bg-background px-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary capitalize"
          >
            {carriers.map((c) => {
              const country = COUNTRY_NAMES[c.country_iso.toLowerCase()] || c.country_iso.toUpperCase();
              return (
                <option key={c.id} value={c.id}>
                  {c.carrier_name} ({country})
                </option>
              );
            })}
          </select>
          <span className="text-[10px] text-muted-foreground mt-1 block">Red móvil y telemetría oficial</span>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-foreground">
              Línea Móvil (SIM)
            </label>
            <button
              type="button"
              onClick={onGeneratePhoneNumber}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition-colors cursor-pointer"
              title="Generar nuevo número con prefijo Formosa (3704 / 3705)"
            >
              <Sparkles className="h-3 w-3" />
              <span>Generar</span>
            </button>
          </div>
          <input
            type="text"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9+]/g, ''))}
            className="w-full h-8.5 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="ej: 3704123456"
          />
          <span className="text-[10px] text-muted-foreground mt-1 block">Formosa (3704/3705) o manual</span>
        </div>
      </div>

      {/* Selector de Fabricante */}
      {brands.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">Fabricante</label>
            <span className="text-[11px] font-mono text-muted-foreground">
              {currentBrandModels.length} modelos oficiales
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {brands.map((brand) => (
              <button
                key={brand}
                type="button"
                onClick={() => onSelectBrand(brand)}
                className={cn(
                  'h-8 px-4 rounded-md border text-xs font-medium capitalize transition-all cursor-pointer',
                  selectedBrand === brand
                    ? 'bg-emerald-500/15 border-primary text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                {brand}
              </button>
            ))}
          </div>

          {/* Cuadrícula de Modelos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 max-h-56 overflow-y-auto pr-1">
            {currentBrandModels.map((m) => {
              const isSelected = selectedModel === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => onSelectModel(m.id)}
                  className={cn(
                    'p-2.5 rounded-md border cursor-pointer transition-all',
                    isSelected
                      ? 'bg-emerald-500/10 border-primary text-foreground'
                      : 'bg-background/60 border-border hover:border-muted-foreground/40 text-muted-foreground'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-foreground">{m.name}</span>
                    {isSelected && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                    <span>SoC: {m.soc_model}</span>
                    <span>{m.screen}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
