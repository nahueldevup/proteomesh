import { useState, type ReactNode } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Fingerprint,
  Globe2,
  Loader2,
  MapPin,
  Network,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import type { Instance } from '../../types';
import { api } from '../../lib/api';
import { MapPicker } from '../MapPicker';

interface InfoAccordionProps {
  instance: Instance;
  onChanged: () => void;
}

function Section({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-800/80">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-zinc-900/50"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
          {icon}
          {title}
        </span>
        {open ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="break-all text-right font-mono text-[11px] text-zinc-300">{value || '—'}</span>
    </div>
  );
}

export default function InfoAccordion({ instance, onChanged }: InfoAccordionProps) {
  const [health, setHealth] = useState<{ ok: boolean; reports: string[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);

  const identity = instance.identity || {};
  const location = instance.location;
  const proxy = instance.proxy;

  const checkHealth = async () => {
    setChecking(true);
    try {
      setHealth(await api.getHealth(instance.instance_name));
    } catch (e) {
      setHealth({ ok: false, reports: [e instanceof Error ? e.message : 'Error al verificar'] });
    } finally {
      setChecking(false);
    }
  };

  const updateLocation = async (lat: number, lon: number, city?: string) => {
    setGpsBusy(true);
    try {
      await api.setInstanceLocation(instance.instance_name, {
        latitude: lat,
        longitude: lon,
        city: city || location?.city || 'Custom',
      });
      onChanged();
    } finally {
      setGpsBusy(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Información</h3>
      </div>

      <Section title="Identidad" icon={<Fingerprint size={14} />} defaultOpen>
        <Row label="IMEI" value={identity.imei} />
        <Row label="Serial" value={identity.serial} />
        <Row label="MAC WiFi" value={identity.wifi_mac} />
        <Row label="SSID" value={identity.wifi_ssid} />
        <Row label="BSSID" value={identity.wifi_bssid} />
        <Row label="Teléfono" value={identity.phone_number} />
        <Row label="Plantilla" value={instance.template} />
        <Row label="Puerto ADB" value={String(instance.adb_port)} />
      </Section>

      <Section title="GPS" icon={<MapPin size={14} />} defaultOpen>
        {location ? (
          <>
            <div className="mb-2 flex items-center justify-between text-[11px]">
              <span className="font-medium text-zinc-300">{location.city}</span>
              {gpsBusy && <Loader2 size={12} className="animate-spin text-zinc-500" />}
            </div>
            <div className="overflow-hidden rounded-lg border border-zinc-800">
              <MapPicker
                latitude={location.latitude}
                longitude={location.longitude}
                city={location.city}
                onChange={(lat, lon, city) => void updateLocation(lat, lon, city)}
                height="170px"
              />
            </div>
            <Row label="Latitud" value={location.latitude.toFixed(6)} />
            <Row label="Longitud" value={location.longitude.toFixed(6)} />
            <Row label="Timezone" value={location.timezone} />
          </>
        ) : (
          <p className="text-xs text-zinc-500">Sin ubicación configurada.</p>
        )}
      </Section>

      <Section title="Proxy" icon={<Network size={14} />}>
        {proxy ? (
          <>
            <Row label="Tipo" value={proxy.type?.toUpperCase()} />
            <Row label="Host" value={proxy.host} />
            <Row label="Puerto" value={String(proxy.port)} />
            <Row label="Usuario" value={proxy.username || 'Sin auth'} />
          </>
        ) : (
          <p className="text-xs text-zinc-500">Sin proxy asignado (red directa).</p>
        )}
      </Section>

      <Section title="Salud" icon={<Activity size={14} />}>
        <button
          onClick={() => void checkHealth()}
          disabled={checking}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {checking ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
          Verificar salud
        </button>
        {health ? (
          <div>
            <div
              className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${
                health.ok ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {health.ok ? <ShieldCheck size={14} /> : <ShieldX size={14} />}
              {health.ok ? 'Todos los chequeos OK' : 'Chequeos con errores'}
            </div>
            <ul className="space-y-1">
              {health.reports.map((r, i) => (
                <li key={i} className="break-words rounded bg-zinc-900/70 px-2 py-1 font-mono text-[10px] text-zinc-400">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-[11px] text-zinc-500">Ejecutá una verificación para ver los logs.</p>
        )}
      </Section>

      <Section title="Red" icon={<Globe2 size={14} />}>
        <Row label="Estado" value={instance.docker_status || (instance.running ? 'En ejecución' : 'Detenido')} />
        <Row label="Operadora" value={instance.carrier} />
        <Row label="Memoria" value={instance.limits?.memory} />
        <Row label="CPUs" value={instance.limits?.cpus} />
      </Section>
    </div>
  );
}
