import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type {
  Instance,
  IpLedgerResponse,
  UsbNetworkOverview,
  CustomLocationsCatalog,
  LocationData,
} from '../types';

export const queryKeys = {
  usb: ['usb-overview'] as const,
  instances: ['instances'] as const,
  ipLedger: ['ip-ledger'] as const,
  networkState: (name?: string) => ['network-state', name] as const,
  streamInfo: (name?: string, player?: string) => ['stream-info', name, player] as const,
  locationsCatalog: ['locations-catalog'] as const,
  locationPresets: ['location-presets'] as const,
};

export const EMPTY_CATALOG: CustomLocationsCatalog = {
  locations: [],
  groups: [],
  pinned_presets: [],
  default_location: undefined,
};

export const EMPTY_PRESETS: Record<string, LocationData> = {};

export function useUsbOverview() {
  return useQuery<UsbNetworkOverview>({
    queryKey: queryKeys.usb,
    queryFn: () => api.getUsbNetworkStatus(),
    refetchInterval: (query) =>
      query.state.data?.pending_offer ? 2000 : 3000,
    refetchIntervalInBackground: false,
  });
}

export function useInstances(paused: boolean) {
  return useQuery<Instance[]>({
    queryKey: queryKeys.instances,
    queryFn: () => api.getInstances(),
    refetchInterval: paused ? false : 5000,
    refetchIntervalInBackground: false,
  });
}

export function useIpLedger() {
  return useQuery<IpLedgerResponse>({
    queryKey: queryKeys.ipLedger,
    queryFn: () => api.getIpLedger(150, false),
    refetchInterval: 6000,
  });
}

export function useLocationsCatalog(options?: { enabled?: boolean }) {
  return useQuery<CustomLocationsCatalog>({
    queryKey: queryKeys.locationsCatalog,
    queryFn: () => api.getCustomLocations(),
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

export function useLocationPresets(options?: { enabled?: boolean }) {
  return useQuery<Record<string, LocationData>>({
    queryKey: queryKeys.locationPresets,
    queryFn: () => api.getLocationPresets().catch(() => ({})),
    staleTime: 60_000,
    enabled: options?.enabled,
  });
}
