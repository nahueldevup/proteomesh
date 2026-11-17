import { Smartphone, MapPin, Zap } from 'lucide-react';

export const STEPS = [
  { id: 'device' as const, label: '1. Dispositivo & SIM', icon: Smartphone },
  { id: 'location' as const, label: '2. Geolocalización GPS', icon: MapPin },
  { id: 'review' as const, label: '3. Recursos & Crear', icon: Zap },
];

export type StepId = (typeof STEPS)[number]['id'];

export const COUNTRY_NAMES: Record<string, string> = {
  ar: 'Argentina',
  us: 'Estados Unidos',
  br: 'Brasil',
  mx: 'México',
  es: 'España',
};

export const RAM_PRESETS = ['2.5g', '3.0g', '4.0g'];
export const CPU_PRESETS = [
  { label: 'Auto SMT (Recomendado)', value: 'auto', desc: 'Asignación dinámica de slots SMT Zen 3 libres' },
  { label: '4 Hilos SMT (1,9, 2,10)', value: '1,9,2,10', desc: '2 núcleos físicos Zen 3 completos' },
  { label: '2 Hilos SMT (1,9)', value: '1,9', desc: '1 núcleo físico Zen 3' },
  { label: '4 Hilos Planos (0-3)', value: '0-3', desc: 'Cores consecutivos genéricos' },
];

export interface PinnedItem {
  id: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  timezone?: string;
  isCustom: boolean;
  isDefault: boolean;
}
