import {
  Usb,
  RotateCw,
  ShieldAlert,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import type { InstanceUsbNetworkState } from '../../types';
import { cn } from '../../lib/utils';

export interface FocusProxyTabProps {
  networkState: InstanceUsbNetworkState | null | undefined;
  networkBusy: boolean;
  onRotateIp: () => void;
  onQuarantine: () => void;
  onClaimUsb: () => void;
}

export function FocusProxyTab({
  networkState,
  networkBusy,
  onRotateIp,
  onQuarantine,
  onClaimUsb,
}: FocusProxyTabProps) {
  return (
    <div className="flex flex-col gap-3 pt-2.5 flex-1 min-h-0 overflow-y-auto">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/50 shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Usb className="h-4 w-4 text-primary" />
          <span>Red Dinámica por Anclaje USB</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {networkState?.state === 'CONNECTED_USB' ? (
            <>
              <button
                onClick={onRotateIp}
                disabled={networkBusy}
                className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-40 cursor-pointer"
              >
                {networkBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3 text-primary" />}
                <span>Rotar IP (Modo Avión)</span>
              </button>
              <button
                onClick={onQuarantine}
                disabled={networkBusy}
                className="flex h-7 items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <ShieldAlert className="h-3 w-3 text-rose-500" />
                <span>Soltar Red</span>
              </button>
            </>
          ) : (
            <button
              onClick={onClaimUsb}
              disabled={networkBusy}
              className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-sm disabled:opacity-40 cursor-pointer"
            >
              {networkBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Usb className="h-3 w-3" />}
              <span>Reclamar Conexión USB</span>
            </button>
          )}
        </div>
      </div>

      {/* Tarjeta de Estado Principal */}
      <div
        className={cn(
          'rounded-xl border p-4 space-y-2.5 transition-all bg-surface',
          networkState?.state === 'CONNECTED_USB'
            ? 'border-emerald-500/40 ring-1 ring-emerald-500/15'
            : networkState?.state === 'WAITING_USB'
            ? 'border-amber-500/40 ring-1 ring-amber-500/15'
            : 'border-border'
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Estado de Conexión
          </span>
          {networkState?.state === 'CONNECTED_USB' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Conectado a Celular USB
            </span>
          ) : networkState?.state === 'WAITING_USB' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
              Esperando USB (#{networkState?.queue_position || 1})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-3 w-3 text-amber-500" />
              Cuarentena (Sin Internet)
            </span>
          )}
        </div>

        {networkState?.state === 'CONNECTED_USB' && (
          <div className="space-y-1.5 pt-1 border-t border-border/40 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">IP Pública de Salida:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">{networkState.public_ip || 'Validando...'}</span>
            </div>
            {networkState.assigned_usb && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Módem Físico:</span>
                  <span className="text-foreground">{networkState.assigned_usb.model || 'Android'} ({networkState.assigned_usb.serial})</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Interfaz / Gateway:</span>
                  <span className="text-foreground">{networkState.assigned_usb.iface} · {networkState.assigned_usb.gateway}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Operadora Móvil:</span>
                  <span className="text-foreground">{networkState.assigned_usb.carrier || 'Móvil'}</span>
                </div>
              </>
            )}
          </div>
        )}

        {networkState?.state !== 'CONNECTED_USB' && (
          <p className="text-xs text-muted-foreground leading-relaxed pt-1 border-t border-border/40">
            El contenedor está aislado por la regla de cortafuegos DOCKER-USER en el host CachyOS. Ningún paquete puede filtrarse hacia la red doméstica. ADB local y ws-scrcpy continúan funcionando normalmente.
          </p>
        )}
      </div>

      {/* Explicación de Evasión & Anti-Fraude */}
      <div className="rounded-lg border border-border bg-surface p-3 text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-semibold text-foreground text-[11px]">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          <span>Hardening Kernel Transparente (Sin Detección de Proxy)</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Las aplicaciones dentro del CloudPhone ven exclusivamente la interfaz física <code className="text-primary font-mono">eth0</code> (enmascarada como wlan0 por el módulo nativo). No existen interfaces <code className="text-primary font-mono">tun0</code> ni flags VPN en Android.
        </p>
      </div>
    </div>
  );
}
