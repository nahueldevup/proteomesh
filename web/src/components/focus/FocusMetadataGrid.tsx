import type { Instance, InstanceUsbNetworkState } from '../../types';

export interface FocusMetadataGridProps {
  instance: Instance;
  modelName: string;
  networkState?: InstanceUsbNetworkState | null | undefined;
}

export function FocusMetadataGrid({ instance, modelName, networkState }: FocusMetadataGridProps) {
  const identity = instance.identity || {};

  const metadataItems: Array<[string, string]> = [
    ['Modelo', modelName],
    ['Puerto ADB', String(instance.adb_port)],
    ['IMEI', identity.imei ?? '—'],
    ['Operadora', instance.carrier ?? '—'],
    ['Serial', identity.serial ?? '—'],
    [
      'Proxy',
      instance.proxy?.exit_ip
        ? `${instance.proxy.exit_ip} (${instance.proxy.type.toUpperCase()})`
        : instance.proxy
        ? `${instance.proxy.host}:${instance.proxy.port}`
        : '—',
    ],
    [
      'Red USB',
      networkState?.public_ip
        ? `${networkState.public_ip} (Módem USB)`
        : networkState?.state === 'QUARANTINE'
        ? 'Cuarentena (Aislado)'
        : networkState?.state === 'WAITING_USB'
        ? `En Cola (#${networkState.queue_position})`
        : 'Cuarentena T=0',
    ],
    ['Teléfono', identity.phone_number ?? '—'],
    [
      'Ubicación GPS',
      instance.location?.custom_name
        ? `${instance.location.custom_name} (${instance.location.city})`
        : instance.location?.city ?? '—',
    ],
    ['Zona horaria', instance.location?.timezone ?? '—'],
  ];

  return (
    <div className="rounded-sm border border-border bg-card p-2.5 font-mono text-xs shrink-0">
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
        {metadataItems.map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between gap-2 border-b border-border/40 py-0.5"
          >
            <span className="text-muted-foreground text-[10px] shrink-0">{k}</span>
            <span className="truncate text-foreground font-medium text-[10px] text-right">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
