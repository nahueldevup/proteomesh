export interface LocationData {
  city: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  timezone?: string;
  custom_name?: string;
  custom_location_id?: string;
  group_name?: string;
}

export interface LocationGroup {
  id: string;
  name: string;
  color?: string;
  description?: string;
  created_at?: string;
}

export interface CustomLocation {
  id: string;
  name: string;
  group_id?: string | null;
  city: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  timezone?: string;
  is_pinned?: boolean;
  created_at?: string;
}

export interface DefaultLocation {
  id?: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  timezone?: string;
  target_type?: 'custom' | 'preset';
}

export interface CustomLocationsCatalog {
  groups: LocationGroup[];
  locations: CustomLocation[];
  pinned_presets?: string[];
  default_location?: DefaultLocation;
}

export interface ProxyConfig {
  type: string;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
  exit_ip?: string | null;
}

export interface ProxyTestResult {
  ok: boolean;
  ip?: string;
  country?: string;
  country_code?: string;
  city?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  latency_ms?: number;
  error?: string;
  proxy?: ProxyConfig;
}

export interface Instance {
  instance_name: string;
  template?: string;
  carrier?: string;
  adb_port: number;
  running: boolean;
  docker_status?: string;
  location?: LocationData;
  proxy?: ProxyConfig;
  limits?: {
    memory?: string;
    cpus?: string;
    pids_limit?: number;
  };
  identity?: {
    imei?: string;
    serial?: string;
    wifi_mac?: string;
    wifi_ssid?: string;
    wifi_bssid?: string;
    phone_number?: string;
  };
  display?: {
    width?: number;
    height?: number;
    density?: number;
    [key: string]: unknown;
  };
}

export interface TemplateItem {
  id: string;
  name: string;
  market_name?: string;
  platform?: string;
  soc_model?: string;
  gpu_renderer?: string;
  screen?: string;
}

export interface Carrier {
  id: string;
  carrier_name: string;
  operator_numeric: string;
  country_iso: string;
  phone_type?: string;
  network_type?: string;
  timezone?: string;
}

export interface ScrcpyLaunchResult {
  status: string;
  instance: string;
  adb_port: number;
  message: string;
}

export interface GroupActionResult {
  instance: string;
  ok: boolean;
  error?: string | null;
}

export interface ScrcpyStreamInfo {
  available: boolean;
  provider: string;
  base_url: string;
  udid: string;
  player: string;
  embed_url: string;
}

export interface GroupResponse {
  status: string;
  action: string;
  total: number;
  succeeded: number;
  results: GroupActionResult[];
}

export interface RouteItem {
  id: number;
  label: string;
  type: string;
  host: string;
  port: number;
  username?: string | null;
  auth?: boolean;
  enabled: boolean;
  status: 'active' | 'idle' | 'disabled';
  assigned_instance?: string | null;
  exit_ip?: string | null;
  latency_ms?: number | null;
  created_at?: string;
}

export interface UsbDevice {
  serial: string;
  state: string;
  model?: string | null;
  tether_enabled?: boolean;
  usb_state?: string | null;
  supported: boolean;
  phase: number;
}

export interface RoutesOverview {
  routes: RouteItem[];
  usb_devices: UsbDevice[];
  leases: Array<{
    id: number;
    instance_id: string;
    exit_ip: string;
    transport: string;
    metadata?: Record<string, unknown>;
    acquired_at?: string;
  }>;
  summary: { routes: number; active: number; quarantined: number };
}

export interface InstanceNetworkStatus {
  instance: string;
  running: boolean;
  has_proxy: boolean;
  proxy?: ProxyConfig | null;
  lease?: {
    exit_ip: string;
    transport: string;
    metadata?: Record<string, unknown>;
    acquired_at?: string;
  } | null;
  tunnel_active: boolean;
  quarantined: boolean;
  usb_attached?: boolean;
  state: 'routed' | 'quarantined' | 'direct' | 'pending' | string;
  exit_ip?: string | null;
  latency_ms?: number | null;
  last_error?: string | null;
  updated_at?: string | null;
}

// NET-USB-001 Types
export interface UsbPhysicalPhone {
  serial: string;
  iface: string;
  model: string;
  carrier: string;
  network_type: string;
  battery: string;
  mobile_data: boolean;
  airplane_mode: boolean;
  gateway?: string | null;
  subnet?: string | null;
  assigned_instance?: string | null;
  status: 'idle' | 'assigned' | 'rotating' | 'error';
  public_ip?: string | null;
}

export interface PendingOffer {
  instance: string;
  expires_in_seconds: number;
  device_serial?: string;
  expires_at?: number;
}

export interface UsbNetworkSummary {
  total_usb: number;
  free_usb: number;
  assigned_usb: number;
  waiting_count: number;
  ttl: string;
}

export interface UsbNetworkOverview {
  summary: UsbNetworkSummary;
  pending_offer?: PendingOffer | null;
  waiting_queue: string[];
  devices: UsbPhysicalPhone[];
}

export interface IpLedgerEntry {
  id: number;
  ip: string;
  instance_name: string;
  usb_id: string;
  carrier?: string | null;
  first_seen_at: string;
  last_seen_at: string;
  expires_at: string;
  is_active: boolean;
}

export interface IpLedgerResponse {
  ttl: string;
  total_entries: number;
  entries: IpLedgerEntry[];
}

export interface InstanceUsbNetworkState {
  instance: string;
  running: boolean;
  state: 'QUARANTINE' | 'WAITING_USB' | 'OFFERED' | 'RELEASING' | 'ROTATING_IP' | 'CONNECTED_USB' | 'OFFLINE' | string;
  pending_offer?: PendingOffer | null;
  assigned_usb?: Record<string, unknown> | null;
  public_ip?: string | null;
  queue_position?: number | null;
  message?: string | null;
  error?: string | null;
  updated_at?: string | null;
}
