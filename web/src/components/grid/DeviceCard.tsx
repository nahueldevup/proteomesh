import { memo, useCallback, useEffect, useState, useRef } from 'react';
import type { Instance, PendingOffer, UsbPhysicalPhone } from '../../types';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { PhoneScreen } from '../farm/PhoneScreen';
import { ScrcpyLiveScreen } from '../farm/ScrcpyLiveScreen';
import { DeviceControlRail } from './DeviceControlRail';

export interface UsbSlice {
  isOffered: boolean;
  pendingOffer: PendingOffer | null;
  isWaiting: boolean;
  waitingPos: number | null;
  assignedDev: UsbPhysicalPhone | null;
}

interface DeviceCardProps {
  instance: Instance;
  index: number;
  selected: boolean;
  onToggleSelect: (name: string, shiftKey?: boolean) => void;
  onOpen: (name: string) => void;
  syncMode?: boolean;
  usb: UsbSlice;
  onNetworkChange?: () => void;
  isFocused?: boolean;
  onFocus?: (name: string) => void;
  onReleaseFocus?: () => void;
  domRef?: React.Ref<HTMLDivElement>;
}

function DeviceCard({
  instance,
  index,
  selected,
  onToggleSelect,
  onOpen,
  syncMode = false,
  usb,
  onNetworkChange,
  isFocused = false,
  onFocus,
  onReleaseFocus,
  domRef,
}: DeviceCardProps) {
  const [tick, setTick] = useState(0);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const domRefRef = useRef(domRef);
  useEffect(() => {
    domRefRef.current = domRef;
  }, [domRef]);

  const setRefs = useCallback((el: HTMLDivElement | null) => {
    cardRef.current = el;
    const d = domRefRef.current;
    if (typeof d === 'function') {
      d(el);
    } else if (d) {
      (d as React.MutableRefObject<HTMLDivElement | null>).current = el;
    }
  }, []);

  // Pausar actualización periódica de pantalla cuando la tarjeta está fuera del viewport
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: '100px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!instance.running || !isVisible) return;

    let interval: number | undefined;
    const startPolling = () => {
      if (interval !== undefined) return;
      interval = window.setInterval(() => setTick((t) => t + 1), 4000);
    };
    const stopPolling = () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
        interval = undefined;
      }
    };
    const handleVisibility = () => {
      if (document.hidden) stopPolling();
      else startPolling();
    };

    if (!document.hidden) startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [instance.running, instance.instance_name, isVisible]);

  const handleScreenTap = async (relX: number, relY: number) => {
    if (!syncMode || !instance.running) return;
    const nativeWidth = Number(instance.display?.width) || 1080;
    const nativeHeight = Number(instance.display?.height) || 2340;
    try {
      await api.sendTap(instance.instance_name, relX * nativeWidth, relY * nativeHeight);
    } catch (err) {
      console.error('Error al enviar tap sincronizado:', err);
    }
  };

  const nativeWidth = Number(instance.display?.width) || 720;
  const nativeHeight = Number(instance.display?.height) || 1560;

  return (
    <div
      ref={setRefs}
      onClick={(e) => {
        onToggleSelect(instance.instance_name, e.shiftKey);
        if (instance.running) {
          onFocus?.(instance.instance_name);
        }
      }}
      onDoubleClick={() => onOpen(instance.instance_name)}
      className={cn(
        'h-full rounded-sm bg-bezel p-1 border flex items-center justify-center gap-1 shrink-0 cursor-pointer select-none transition-all',
        isFocused
          ? 'border-primary ring-2 ring-primary glow-selected shadow-md'
          : selected
          ? 'border-primary ring-1 ring-primary glow-selected'
          : 'border-border hover:border-foreground/40'
      )}
    >
      <div
        style={{ aspectRatio: `${nativeWidth} / ${nativeHeight}` }}
        className="relative h-full overflow-hidden rounded-xs bg-black border border-border/40 select-none flex flex-col"
      >
        {/* Thumbnail estático subyacente */}
        <PhoneScreen
          instance={instance}
          interactive={syncMode && selected && !isFocused}
          compact
          tick={tick}
          onTap={handleScreenTap}
        />

        {/* Live Scrcpy Stream cuando la tarjeta está enfocada (Lazy: solo 1 activa a 30 FPS) */}
        {isFocused && instance.running && (
          <ScrcpyLiveScreen
            instance={instance}
            isFocused={isFocused}
            onReleaseFocus={() => onReleaseFocus?.()}
            visible={isVisible}
          />
        )}

        {/* Slot index tag */}
        <span className="absolute left-1 top-1 rounded-xs bg-black/90 border border-white/20 px-1.5 py-px font-mono text-[9px] font-bold text-white shadow-xs z-20 select-none">
          {index + 1}
        </span>

      </div>

      {/* Riel vertical de control (Ticket 2): hermano de la pantalla, nunca overlay */}
      <DeviceControlRail
        mode="rack"
        instance={instance}
        usb={usb}
        onOpen={onOpen}
        onNetworkChange={onNetworkChange}
      />
    </div>
  );
}

function areDeviceCardPropsEqual(prev: DeviceCardProps, next: DeviceCardProps): boolean {
  if (
    prev.index !== next.index ||
    prev.selected !== next.selected ||
    prev.syncMode !== next.syncMode ||
    prev.onToggleSelect !== next.onToggleSelect ||
    prev.onOpen !== next.onOpen ||
    prev.onNetworkChange !== next.onNetworkChange ||
    prev.isFocused !== next.isFocused ||
    prev.onFocus !== next.onFocus ||
    prev.onReleaseFocus !== next.onReleaseFocus
  ) {
    return false;
  }

  const pu = prev.usb;
  const nu = next.usb;
  if (
    pu.isOffered !== nu.isOffered ||
    pu.isWaiting !== nu.isWaiting ||
    pu.waitingPos !== nu.waitingPos ||
    pu.assignedDev?.serial !== nu.assignedDev?.serial ||
    pu.assignedDev?.carrier !== nu.assignedDev?.carrier ||
    pu.assignedDev?.iface !== nu.assignedDev?.iface ||
    pu.pendingOffer?.expires_at !== nu.pendingOffer?.expires_at ||
    pu.pendingOffer?.instance !== nu.pendingOffer?.instance
  ) {
    return false;
  }

  const pi = prev.instance;
  const ni = next.instance;
  if (
    pi.instance_name !== ni.instance_name ||
    pi.running !== ni.running ||
    pi.adb_port !== ni.adb_port ||
    pi.display?.width !== ni.display?.width ||
    pi.display?.height !== ni.display?.height ||
    pi.carrier !== ni.carrier ||
    pi.docker_status !== ni.docker_status ||
    pi.identity?.phone_number !== ni.identity?.phone_number ||
    pi.location?.custom_name !== ni.location?.custom_name ||
    pi.location?.city !== ni.location?.city ||
    pi.location?.latitude !== ni.location?.latitude ||
    pi.location?.longitude !== ni.location?.longitude ||
    pi.proxy?.host !== ni.proxy?.host ||
    pi.proxy?.port !== ni.proxy?.port ||
    pi.limits?.memory !== ni.limits?.memory ||
    pi.limits?.cpus !== ni.limits?.cpus
  ) {
    return false;
  }

  return true;
}

export default memo(DeviceCard, areDeviceCardPropsEqual);
