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
  radius_km?: number;
  show_radius?: boolean;
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
  assigned_usb?: AssignedUsb | null;
  public_ip?: string | null;
  queue_position?: number | null;
  message?: string | null;
  error?: string | null;
  updated_at?: string | null;
}

export interface ClaimUsbResult {
  status: 'connected' | 'waiting' | string;
  message?: string;
  queue_position?: number;
  public_ip?: string | null;
}

export interface DeclineOfferResult {
  status?: string;
  next_offered?: string | null;
}

export interface QuarantineResult {
  status?: string;
  popped_next?: string | null;
}

export interface RotateIpResult {
  status?: string;
  new_ip: string;
}

export interface TestRotationResult {
  status?: string;
  elapsed_seconds: number;
}

export interface TogglePinResult {
  location?: CustomLocation;
  pinned_presets?: string[];
}

export interface InstanceLocationPayload {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  city?: string;
  timezone?: string;
  custom_name?: string;
  custom_location_id?: string;
}

export interface CreateInstancePayload {
  name: string;
  template: string;
  carrier: string;
  phone_number?: string;
  port: number;
  start: boolean;
  limits: { memory: string; cpus: string };
  custom_location: InstanceLocationPayload;
}

export interface AssignedUsb {
  serial?: string;
  model?: string;
  iface?: string;
  gateway?: string;
  carrier?: string;
}

// WEB-017: Repositorio de APKs y Gestor de archivos
export interface ApkEntry {
  id: number;
  sha256: string;
  original_name: string;
  package: string;
  version_name: string;
  version_code: number;
  size: number;
  is_default: boolean;
  created_at: string;
  entry_type?: 'monolithic' | 'bundle';
  bundle_format?: string;
  splits_info?: {
    base_file: string;
    total_splits: number;
    splits: Array<{ file: string; split_id: string; abi: string | null; size: number }>;
    has_obb?: boolean;
    warning?: string;
  };
  has_obb?: boolean;
  warning?: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  mtime: number;
}

export interface InstallResult {
  instance: string;
  ok: boolean;
  status: 'ok' | 'failed' | 'skipped';
  error?: string | null;
}
