import type { ReactNode } from 'react';
import type { IpLedgerEntry } from '../../types';

export type NetworkTab = 'modems' | 'ledger';

export const NO_ENTRIES: IpLedgerEntry[] = [];
export const GRACE_SECONDS = 5;
export const PAGE_SIZES = [15, 20, 50, 100];

export const TTL_OPTIONS = [
  { value: '24h', label: '24 Horas', hint: 'Rotación agresiva, reutiliza IPs al día siguiente' },
  { value: '7d', label: '7 Días (Recomendado)', hint: 'Equilibrio entre pool disponible y aislamiento' },
  { value: '30d', label: '30 Días', hint: 'Aislamiento fuerte, reduce el pool reutilizable' },
  { value: 'permanent', label: 'Permanente', hint: 'Una IP nunca se repite entre CloudPhones' },
];

export const ttlLabel = (ttl: string) => TTL_OPTIONS.find((o) => o.value === ttl)?.label.split(' (')[0] ?? ttl;

export interface MetricCellProps {
  icon: ReactNode;
  label: string;
  value: number | string;
  sub: string;
  bar?: number | undefined;
  valueClassName?: string | undefined;
  onClick?: (() => void) | undefined;
  title?: string | undefined;
}
