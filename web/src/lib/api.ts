import type { Instance, TemplateItem, Carrier, LocationData, ProxyTestResult } from '../types';

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
};
