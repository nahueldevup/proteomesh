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

export const RAM_PRESETS = ['2.0g', '2.5g', '3.0g', '4.0g'];
export const CPU_PRESETS = [
  { label: '2 Hilos (0-1)', value: '0-1' },
  { label: '4 Hilos (0-3)', value: '0-3' },
  { label: '8 Hilos (0-7)', value: '0-7' },
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
