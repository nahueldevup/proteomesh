import type { LocationData } from '../types';

export const GLOBAL_PRESETS_MAP: Record<
  string,
  { key: string; name: string; city: string; latitude: number; longitude: number; timezone: string; altitude?: number }
> = {
  ba: { key: 'ba', name: 'Buenos Aires', city: 'Buenos Aires, Argentina (Obelisco)', latitude: -34.603722, longitude: -58.381592, timezone: 'America/Argentina/Buenos_Aires', altitude: 25 },
  'buenos-aires': { key: 'ba', name: 'Buenos Aires', city: 'Buenos Aires, Argentina (Obelisco)', latitude: -34.603722, longitude: -58.381592, timezone: 'America/Argentina/Buenos_Aires', altitude: 25 },
  'sao-paulo': { key: 'sao-paulo', name: 'São Paulo', city: 'São Paulo, Brasil', latitude: -23.55052, longitude: -46.633308, timezone: 'America/Sao_Paulo', altitude: 760 },
  miami: { key: 'miami', name: 'Miami', city: 'Miami, Florida, EE.UU.', latitude: 25.76168, longitude: -80.19179, timezone: 'America/New_York', altitude: 2 },
  'new-york': { key: 'new-york', name: 'New York', city: 'New York, EE.UU.', latitude: 40.712776, longitude: -74.005974, timezone: 'America/New_York', altitude: 10 },
  ny: { key: 'new-york', name: 'New York', city: 'New York, EE.UU.', latitude: 40.712776, longitude: -74.005974, timezone: 'America/New_York', altitude: 10 },
  cordoba: { key: 'cordoba', name: 'Córdoba', city: 'Córdoba, Argentina', latitude: -31.420083, longitude: -64.188776, timezone: 'America/Argentina/Cordoba', altitude: 390 },
  rosario: { key: 'rosario', name: 'Rosario', city: 'Rosario, Argentina', latitude: -32.9587, longitude: -60.693, timezone: 'America/Argentina/Cordoba', altitude: 31 },
  mendoza: { key: 'mendoza', name: 'Mendoza', city: 'Mendoza, Argentina', latitude: -32.89084, longitude: -68.82717, timezone: 'America/Argentina/Mendoza', altitude: 746 },
  bariloche: { key: 'bariloche', name: 'Bariloche', city: 'San Carlos de Bariloche, Argentina', latitude: -41.134258, longitude: -71.308525, timezone: 'America/Argentina/Salta', altitude: 840 },
  santiago: { key: 'santiago', name: 'Santiago', city: 'Santiago de Chile, Chile', latitude: -33.44889, longitude: -70.669265, timezone: 'America/Santiago', altitude: 570 },
  bogota: { key: 'bogota', name: 'Bogotá', city: 'Bogotá, Colombia', latitude: 4.710989, longitude: -74.072092, timezone: 'America/Bogota', altitude: 2640 },
  lima: { key: 'lima', name: 'Lima', city: 'Lima, Perú', latitude: -12.046374, longitude: -77.042793, timezone: 'America/Lima', altitude: 154 },
  cdmx: { key: 'cdmx', name: 'CDMX', city: 'Ciudad de México, México', latitude: 19.432608, longitude: -99.133209, timezone: 'America/Mexico_City', altitude: 2240 },
  mexico: { key: 'cdmx', name: 'CDMX', city: 'Ciudad de México, México', latitude: 19.432608, longitude: -99.133209, timezone: 'America/Mexico_City', altitude: 2240 },
  'los-angeles': { key: 'los-angeles', name: 'Los Angeles', city: 'Los Angeles, California, EE.UU.', latitude: 34.052235, longitude: -118.243683, timezone: 'America/Los_Angeles', altitude: 71 },
  madrid: { key: 'madrid', name: 'Madrid', city: 'Madrid, España', latitude: 40.416775, longitude: -3.70379, timezone: 'Europe/Madrid', altitude: 667 },
  barcelona: { key: 'barcelona', name: 'Barcelona', city: 'Barcelona, España', latitude: 41.387917, longitude: 2.169919, timezone: 'Europe/Madrid', altitude: 12 },
  london: { key: 'london', name: 'Londres', city: 'Londres, Reino Unido', latitude: 51.507351, longitude: -0.127758, timezone: 'Europe/London', altitude: 11 },
  tokyo: { key: 'tokyo', name: 'Tokio', city: 'Tokio, Japón', latitude: 35.676192, longitude: 139.650311, timezone: 'Asia/Tokyo', altitude: 40 },
};

export function getPresetDisplay(key: string, customPresets?: Record<string, LocationData>) {
  const cleanKey = key.toLowerCase();
  if (GLOBAL_PRESETS_MAP[cleanKey]) {
    return GLOBAL_PRESETS_MAP[cleanKey];
  }
  if (customPresets && customPresets[cleanKey]) {
    const p = customPresets[cleanKey];
    return {
      key: cleanKey,
      name: p.city.split(',')[0],
      city: p.city,
      latitude: p.latitude,
      longitude: p.longitude,
      timezone: p.timezone || 'UTC',
      altitude: p.altitude,
    };
  }
  return {
    key: cleanKey,
    name: key,
    city: key,
    latitude: 0,
    longitude: 0,
    timezone: 'UTC',
    altitude: 0,
  };
}
