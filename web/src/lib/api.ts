import type {
  Instance,
  TemplateItem,
  Carrier,
  LocationData,
  ProxyTestResult,
  ScrcpyLaunchResult,
  GroupResponse,
  ScrcpyStreamInfo,
  UsbNetworkOverview,
  UsbPhysicalPhone,
  InstanceUsbNetworkState,
  IpLedgerResponse,
  CustomLocation,
  LocationGroup,
  CustomLocationsCatalog,
} from '../types';

const API_BASE = '/api/v1';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      errorDetail = data.detail || data.message || errorDetail;
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }
  return res.json();
}

export const api = {
  // Instancias
  async getInstances(): Promise<Instance[]> {
    const res = await fetch(`${API_BASE}/instances`);
    return handleResponse<Instance[]>(res);
  },

  async getInstance(name: string): Promise<Instance> {
    const res = await fetch(`${API_BASE}/instances/${name}`);
    return handleResponse<Instance>(res);
  },

  async createInstance(data: any): Promise<Instance> {
    const res = await fetch(`${API_BASE}/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Instance>(res);
  },

  async startInstance(name: string): Promise<any> {
    const res = await fetch(`${API_BASE}/instances/${name}/start`, { method: 'POST' });
    return handleResponse<any>(res);
  },

  async stopInstance(name: string): Promise<any> {
    const res = await fetch(`${API_BASE}/instances/${name}/stop`, { method: 'POST' });
    return handleResponse<any>(res);
  },

  async deleteInstance(name: string): Promise<any> {
    const res = await fetch(`${API_BASE}/instances/${name}`, { method: 'DELETE' });
    return handleResponse<any>(res);
  },

  async getHealth(name: string): Promise<{ instance_name: string; ok: boolean; reports: string[] }> {
    const res = await fetch(`${API_BASE}/instances/${name}/health`);
    return handleResponse<any>(res);
  },

  // Catálogo de Plantillas
  async getTemplates(): Promise<Record<string, TemplateItem[]>> {
    const res = await fetch(`${API_BASE}/templates`);
    return handleResponse<Record<string, TemplateItem[]>>(res);
  },

  // Operadoras
  async getCarriers(): Promise<Carrier[]> {
    const res = await fetch(`${API_BASE}/carriers`);
    return handleResponse<Carrier[]>(res);
  },

  async createCarrier(data: Carrier): Promise<Carrier> {
    const res = await fetch(`${API_BASE}/carriers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Carrier>(res);
  },

  // Geolocalización
  async getLocationPresets(): Promise<Record<string, LocationData>> {
    const res = await fetch(`${API_BASE}/locations`);
    return handleResponse<Record<string, LocationData>>(res);
  },

  async getCustomLocations(): Promise<CustomLocationsCatalog> {
    const res = await fetch(`${API_BASE}/locations/custom`);
    return handleResponse<CustomLocationsCatalog>(res);
  },

  async createCustomLocation(payload: Partial<CustomLocation>): Promise<CustomLocation> {
    const res = await fetch(`${API_BASE}/locations/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<CustomLocation>(res);
  },

  async updateCustomLocation(id: string, payload: Partial<CustomLocation>): Promise<CustomLocation> {
    const res = await fetch(`${API_BASE}/locations/custom/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<CustomLocation>(res);
  },

  async deleteCustomLocation(id: string): Promise<{ ok: boolean; deleted: string }> {
    const res = await fetch(`${API_BASE}/locations/custom/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<{ ok: boolean; deleted: string }>(res);
  },

  async createLocationGroup(payload: { name: string; color?: string; description?: string }): Promise<LocationGroup> {
    const res = await fetch(`${API_BASE}/locations/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<LocationGroup>(res);
  },

  async updateLocationGroup(id: string, payload: Partial<LocationGroup>): Promise<LocationGroup> {
    const res = await fetch(`${API_BASE}/locations/groups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<LocationGroup>(res);
  },

  async deleteLocationGroup(id: string): Promise<{ ok: boolean; deleted: string }> {
    const res = await fetch(`${API_BASE}/locations/groups/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<{ ok: boolean; deleted: string }>(res);
  },

  async togglePin(targetType: 'custom' | 'preset', targetId: string, pinned?: boolean): Promise<any> {
    const res = await fetch(`${API_BASE}/locations/toggle-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_type: targetType, target_id: targetId, pinned }),
    });
    return handleResponse<any>(res);
  },

  async updatePinnedPresets(pinnedPresets: string[]): Promise<{ ok: boolean; pinned_presets: string[] }> {
    const res = await fetch(`${API_BASE}/locations/pinned-presets`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned_presets: pinnedPresets }),
    });
    return handleResponse<{ ok: boolean; pinned_presets: string[] }>(res);
  },

  async getDefaultLocation(): Promise<any> {
    const res = await fetch(`${API_BASE}/locations/default`);
    return handleResponse<any>(res);
  },

  async setDefaultLocation(payload: {
    target_type?: 'custom' | 'preset';
    target_id?: string;
    name?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
    altitude?: number;
    accuracy?: number;
    timezone?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/locations/default`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async getInstanceLocation(name: string): Promise<any> {
    const res = await fetch(`${API_BASE}/locations/instances/${name}`);
    return handleResponse<any>(res);
  },

  async setInstanceLocation(name: string, payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/locations/instances/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  // Proxies
  async testProxy(payload: any): Promise<ProxyTestResult> {
    const res = await fetch(`${API_BASE}/proxies/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<ProxyTestResult>(res);
  },

  async setInstanceProxy(name: string, payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/instances/${name}/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async removeInstanceProxy(name: string): Promise<any> {
    const res = await fetch(`${API_BASE}/instances/${name}/proxy`, { method: 'DELETE' });
    return handleResponse<any>(res);
  },

  // =========================================================
  // NET-USB-001: Red USB Dinámica, Cuarentena e Historial de IPs
  // =========================================================
  async getUsbNetworkStatus(): Promise<UsbNetworkOverview> {
    const res = await fetch(`${API_BASE}/network/status`);
    return handleResponse<UsbNetworkOverview>(res);
  },

  async getUsbDevices(): Promise<{ devices: UsbPhysicalPhone[] }> {
    const res = await fetch(`${API_BASE}/network/usb`);
    return handleResponse<{ devices: UsbPhysicalPhone[] }>(res);
  },

  async getInstanceUsbNetworkState(name: string): Promise<InstanceUsbNetworkState> {
    const res = await fetch(`${API_BASE}/instances/${name}/network/state`);
    return handleResponse<InstanceUsbNetworkState>(res);
  },

  async claimUsb(name: string, preferredSerial?: string, stealFrom?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/instances/${name}/network/claim-usb`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preferred_serial: preferredSerial || null,
        steal_from: stealFrom || null,
      }),
    });
    return handleResponse<any>(res);
  },

  async declineOffer(name: string, requeue: boolean = true): Promise<any> {
    const res = await fetch(`${API_BASE}/instances/${name}/network/decline-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requeue }),
    });
    return handleResponse<any>(res);
  },

  async quarantineInstance(name: string): Promise<any> {
    const res = await fetch(`${API_BASE}/instances/${name}/network/quarantine`, { method: 'POST' });
    return handleResponse<any>(res);
  },

  async rotateInstanceIp(name: string): Promise<any> {
    const res = await fetch(`${API_BASE}/instances/${name}/network/rotate-ip`, { method: 'POST' });
    return handleResponse<any>(res);
  },

  async batchQuarantine(instances: string[]): Promise<any> {
    const res = await fetch(`${API_BASE}/network/batch-quarantine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances }),
    });
    return handleResponse<any>(res);
  },

  async testUsbRotation(serial: string): Promise<any> {
    const res = await fetch(`${API_BASE}/network/usb/test-rotation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial }),
    });
    return handleResponse<any>(res);
  },

  async getIpLedger(limit: number = 150, activeOnly: boolean = false): Promise<IpLedgerResponse> {
    const res = await fetch(`${API_BASE}/network/ip-ledger?limit=${limit}&active_only=${activeOnly}`);
    return handleResponse<IpLedgerResponse>(res);
  },

  async setIpLedgerTtl(ttl: string): Promise<{ status: string; ttl: string }> {
    const res = await fetch(`${API_BASE}/network/ip-ledger/ttl`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl }),
    });
    return handleResponse<{ status: string; ttl: string }>(res);
  },

  async purgeIpLedger(): Promise<{ status: string; purged: number }> {
    const res = await fetch(`${API_BASE}/network/ip-ledger/purge`, { method: 'POST' });
    return handleResponse<{ status: string; purged: number }>(res);
  },

  // Control Interactivo y Pantalla
  async launchScrcpy(name: string): Promise<ScrcpyLaunchResult> {
    const res = await fetch(`${API_BASE}/instances/${name}/scrcpy`, { method: 'POST' });
    return handleResponse<ScrcpyLaunchResult>(res);
  },

  async getStreamInfo(name: string, player: string = 'mse'): Promise<ScrcpyStreamInfo> {
    const res = await fetch(`${API_BASE}/instances/${name}/stream-info?player=${encodeURIComponent(player)}`);
    return handleResponse<ScrcpyStreamInfo>(res);
  },

  getScreenUrl(name: string, timestamp?: number): string {
    const t = timestamp || Date.now();
    return `${API_BASE}/instances/${name}/screen?format=jpeg&max_width=540&t=${t}`;
  },

  async sendTap(name: string, x: number, y: number): Promise<any> {
    const res = await fetch(`${API_BASE}/instances/${name}/input/tap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: Math.round(x), y: Math.round(y) }),
    });
    return handleResponse<any>(res);
  },

  async sendSwipe(name: string, x1: number, y1: number, x2: number, y2: number, durationMs: number = 300): Promise<any> {
    const res = await fetch(`${API_BASE}/instances/${name}/input/swipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x1: Math.round(x1),
        y1: Math.round(y1),
        x2: Math.round(x2),
        y2: Math.round(y2),
        duration_ms: durationMs,
      }),
    });
    return handleResponse<any>(res);
  },

  async sendKey(name: string, key: string): Promise<any> {
    const res = await fetch(`${API_BASE}/instances/${name}/input/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    return handleResponse<any>(res);
  },

  async sendText(name: string, text: string): Promise<any> {
    const res = await fetch(`${API_BASE}/instances/${name}/input/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return handleResponse<any>(res);
  },

  async launchUrl(name: string, url: string): Promise<any> {
    const res = await fetch(`${API_BASE}/instances/${name}/launch-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    return handleResponse<any>(res);
  },

  // Control de Grupo (Multi-Touch)
  async groupTap(instances: string[], x: number, y: number): Promise<GroupResponse> {
    const res = await fetch(`${API_BASE}/instances/group/input/tap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances, x: Math.round(x), y: Math.round(y) }),
    });
    return handleResponse<GroupResponse>(res);
  },

  async groupSwipe(instances: string[], x1: number, y1: number, x2: number, y2: number, durationMs: number = 300): Promise<GroupResponse> {
    const res = await fetch(`${API_BASE}/instances/group/input/swipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances,
        x1: Math.round(x1), y1: Math.round(y1),
        x2: Math.round(x2), y2: Math.round(y2),
        duration_ms: durationMs,
      }),
    });
    return handleResponse<GroupResponse>(res);
  },

  async groupKey(instances: string[], key: string): Promise<GroupResponse> {
    const res = await fetch(`${API_BASE}/instances/group/input/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances, key }),
    });
    return handleResponse<GroupResponse>(res);
  },

  async groupLifecycle(instances: string[], action: 'start' | 'stop' | 'restart' | 'delete'): Promise<GroupResponse> {
    const res = await fetch(`${API_BASE}/instances/group/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances }),
    });
    return handleResponse<GroupResponse>(res);
  },

  async groupText(instances: string[], text: string): Promise<{ success: number; failed: number }> {
    const results = await Promise.allSettled(instances.map((name) => api.sendText(name, text)));
    const success = results.filter((r) => r.status === 'fulfilled').length;
    return { success, failed: results.length - success };
  },

  async groupLaunchUrl(instances: string[], url: string): Promise<{ success: number; failed: number }> {
    const results = await Promise.allSettled(instances.map((name) => api.launchUrl(name, url)));
    const success = results.filter((r) => r.status === 'fulfilled').length;
    return { success, failed: results.length - success };
  },

  async groupSetLocation(instances: string[], payload: any): Promise<{ success: number; failed: number }> {
    const results = await Promise.allSettled(instances.map((name) => api.setInstanceLocation(name, payload)));
    const success = results.filter((r) => r.status === 'fulfilled').length;
    return { success, failed: results.length - success };
  },

  async groupSetProxy(instances: string[], payload: any): Promise<{ success: number; failed: number }> {
    const results = await Promise.allSettled(instances.map((name) => api.setInstanceProxy(name, payload)));
    const success = results.filter((r) => r.status === 'fulfilled').length;
    return { success, failed: results.length - success };
  },
};
