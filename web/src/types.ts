export interface LocationData {
  city: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  timezone?: string;
}

export interface ProxyConfig {
  type: string;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
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
