import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Instance, IpLedgerResponse, UsbNetworkOverview } from '../types';

export const queryKeys = {
  usb: ['usb-overview'] as const,
  instances: ['instances'] as const,
  ipLedger: ['ip-ledger'] as const,
  networkState: (name?: string) => ['network-state', name] as const,
  streamInfo: (name?: string, player?: string) => ['stream-info', name, player] as const,
};

export function useUsbOverview() {
  return useQuery<UsbNetworkOverview>({
    queryKey: queryKeys.usb,
    queryFn: () => api.getUsbNetworkStatus(),
    refetchInterval: 2000,
  });
}

export function useInstances(paused: boolean) {
  return useQuery<Instance[]>({
    queryKey: queryKeys.instances,
    queryFn: () => api.getInstances(),
    refetchInterval: paused ? false : 5000,
  });
}

export function useIpLedger() {
  return useQuery<IpLedgerResponse>({
    queryKey: queryKeys.ipLedger,
    queryFn: () => api.getIpLedger(150, false),
    refetchInterval: 6000,
  });
}
