import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type {
  Instance,
  IpLedgerResponse,
  UsbNetworkOverview,
  CustomLocationsCatalog,
  LocationData,
  ApkEntry,
  FileEntry,
} from '../types';

export const queryKeys = {
  usb: ['usb-overview'] as const,
  instances: ['instances'] as const,
  ipLedger: ['ip-ledger'] as const,
  networkState: (name?: string) => ['network-state', name] as const,
  streamInfo: (name?: string, player?: string) => ['stream-info', name, player] as const,
  locationsCatalog: ['locations-catalog'] as const,
  locationPresets: ['location-presets'] as const,
  apks: ['apks'] as const,
  installedApks: ['installed-apks'] as const,
  files: (phoneName?: string, fullPath?: string) => ['files', phoneName, fullPath] as const,
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
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.pending_offer || (data?.waiting_queue && data.waiting_queue.length > 0)) {
        return 1000;
      }
      return 3000;
    },
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

export function useApkCatalog(options?: { enabled?: boolean }) {
  return useQuery<ApkEntry[]>({
    queryKey: queryKeys.apks,
    queryFn: () => api.getApks(),
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

export function useInstalledApks(options?: { enabled?: boolean }) {
  return useQuery<Record<string, string[]>>({
    queryKey: queryKeys.installedApks,
    queryFn: () => api.getInstalledApks().catch(() => ({})),
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

export function useDeviceFiles(
  phoneName?: string,
  fullPath?: string,
  options?: { enabled?: boolean }
) {
  return useQuery<FileEntry[]>({
    queryKey: queryKeys.files(phoneName, fullPath),
    queryFn: () => (phoneName && fullPath ? api.listFiles(phoneName, fullPath) : Promise.resolve([])),
    staleTime: 10_000,
    enabled: Boolean(phoneName && fullPath && (options?.enabled ?? true)),
  });
}
