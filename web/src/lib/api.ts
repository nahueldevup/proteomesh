import type { Instance, TemplateItem, Carrier, LocationData, ProxyTestResult, ScrcpyLaunchResult, GroupResponse, ScrcpyStreamInfo } from '../types';

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
