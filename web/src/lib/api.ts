import type {
  Instance,
  DefaultLocation,
  ClaimUsbResult,
  DeclineOfferResult,
  QuarantineResult,
  RotateIpResult,
  TestRotationResult,
  TogglePinResult,
  InstanceLocationPayload,
  CreateInstancePayload,
  TemplateItem,
  Carrier,
  LocationData,
  ScrcpyLaunchResult,
  GroupResponse,
  ScrcpyStreamInfo,
  UsbNetworkOverview,
  InstanceUsbNetworkState,
  IpLedgerResponse,
  CustomLocation,
  LocationGroup,
  CustomLocationsCatalog,
  ApkEntry,
  FileEntry,
  InstallResult,
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

  async createInstance(data: CreateInstancePayload): Promise<Instance> {
    const res = await fetch(`${API_BASE}/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Instance>(res);
  },

  async startInstance(name: string): Promise<unknown> {
    const res = await fetch(`${API_BASE}/instances/${name}/start`, { method: 'POST' });
    return handleResponse<unknown>(res);
  },

  async stopInstance(name: string): Promise<unknown> {
    const res = await fetch(`${API_BASE}/instances/${name}/stop`, { method: 'POST' });
    return handleResponse<unknown>(res);
  },

  async restartInstance(name: string): Promise<unknown> {
    const res = await fetch(`${API_BASE}/instances/${name}/restart`, { method: 'POST' });
    return handleResponse<unknown>(res);
  },

  async deleteInstance(name: string): Promise<unknown> {
    const res = await fetch(`${API_BASE}/instances/${name}`, { method: 'DELETE' });
    return handleResponse<unknown>(res);
  },

  async getHealth(name: string): Promise<{ instance_name: string; ok: boolean; reports: string[] }> {
    const res = await fetch(`${API_BASE}/instances/${name}/health`);
    return handleResponse<{ instance_name: string; ok: boolean; reports: string[] }>(res);
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

  async togglePin(targetType: 'custom' | 'preset', targetId: string, pinned?: boolean): Promise<TogglePinResult> {
    const res = await fetch(`${API_BASE}/locations/toggle-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_type: targetType, target_id: targetId, pinned }),
    });
    return handleResponse<TogglePinResult>(res);
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
  }): Promise<DefaultLocation> {
    const res = await fetch(`${API_BASE}/locations/default`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<DefaultLocation>(res);
  },

  async setInstanceLocation(name: string, payload: InstanceLocationPayload): Promise<unknown> {
    const res = await fetch(`${API_BASE}/locations/instances/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<unknown>(res);
  },

  // =========================================================
  // NET-USB-001: Red USB Dinámica, Cuarentena e Historial de IPs
  // =========================================================
  async getUsbNetworkStatus(): Promise<UsbNetworkOverview> {
    const res = await fetch(`${API_BASE}/network/status`);
    return handleResponse<UsbNetworkOverview>(res);
  },

  async getInstanceUsbNetworkState(name: string): Promise<InstanceUsbNetworkState> {
    const res = await fetch(`${API_BASE}/instances/${name}/network/state`);
    return handleResponse<InstanceUsbNetworkState>(res);
  },

  async claimUsb(name: string, preferredSerial?: string, stealFrom?: string): Promise<ClaimUsbResult> {
    const res = await fetch(`${API_BASE}/instances/${name}/network/claim-usb`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preferred_serial: preferredSerial || null,
        steal_from: stealFrom || null,
      }),
    });
    return handleResponse<ClaimUsbResult>(res);
  },

  async declineOffer(name: string, requeue: boolean = true): Promise<DeclineOfferResult> {
    const res = await fetch(`${API_BASE}/instances/${name}/network/decline-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requeue }),
    });
    return handleResponse<DeclineOfferResult>(res);
  },

  async quarantineInstance(name: string): Promise<QuarantineResult> {
    const res = await fetch(`${API_BASE}/instances/${name}/network/quarantine`, { method: 'POST' });
    return handleResponse<QuarantineResult>(res);
  },

  async rotateInstanceIp(name: string): Promise<RotateIpResult> {
    const res = await fetch(`${API_BASE}/instances/${name}/network/rotate-ip`, { method: 'POST' });
    return handleResponse<RotateIpResult>(res);
  },

  async batchQuarantine(instances: string[]): Promise<unknown> {
    const res = await fetch(`${API_BASE}/network/batch-quarantine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances }),
    });
    return handleResponse<unknown>(res);
  },

  async testUsbRotation(serial: string): Promise<TestRotationResult> {
    const res = await fetch(`${API_BASE}/network/usb/test-rotation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial }),
    });
    return handleResponse<TestRotationResult>(res);
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

  async getScreenshot(name: string): Promise<Blob> {
    const res = await fetch(api.getScreenUrl(name));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  },

  getScreenUrl(name: string, timestamp?: number, fresh?: boolean): string {
    const t = timestamp || Date.now();
    const freshQuery = fresh ? '&fresh=1' : '';
    return `${API_BASE}/instances/${name}/screen?format=jpeg&max_width=540&t=${t}${freshQuery}`;
  },

  async sendTap(name: string, x: number, y: number): Promise<unknown> {
    const res = await fetch(`${API_BASE}/instances/${name}/input/tap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: Math.round(x), y: Math.round(y) }),
    });
    return handleResponse<unknown>(res);
  },

  async sendSwipe(name: string, x1: number, y1: number, x2: number, y2: number, durationMs: number = 300): Promise<unknown> {
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
    return handleResponse<unknown>(res);
  },

  async sendKey(name: string, key: string): Promise<unknown> {
    const res = await fetch(`${API_BASE}/instances/${name}/input/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    return handleResponse<unknown>(res);
  },

  async sendText(name: string, text: string): Promise<unknown> {
    const res = await fetch(`${API_BASE}/instances/${name}/input/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return handleResponse<unknown>(res);
  },

  async launchUrl(name: string, url: string): Promise<unknown> {
    const res = await fetch(`${API_BASE}/instances/${name}/launch-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    return handleResponse<unknown>(res);
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

  async groupSetLocation(instances: string[], payload: InstanceLocationPayload): Promise<{ success: number; failed: number }> {
    const results = await Promise.allSettled(instances.map((name) => api.setInstanceLocation(name, payload)));
    const success = results.filter((r) => r.status === 'fulfilled').length;
    return { success, failed: results.length - success };
  },

  // ── Repositorio de APKs (WEB-017) ────────────────────────────────────────
  async getApks(): Promise<ApkEntry[]> {
    const res = await fetch(`${API_BASE}/apks`);
    return handleResponse<ApkEntry[]>(res);
  },

  async uploadApk(file: File, onProgress?: (percent: number) => void): Promise<ApkEntry> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/apks`);
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
      }
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText) as ApkEntry);
        } else {
          let detail = `HTTP ${xhr.status}`;
          try {
            const data = JSON.parse(xhr.responseText);
            detail = data.detail || data.message || detail;
          } catch {
            // ignore
          }
          reject(new Error(detail));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('Error de red al subir APK')));
      xhr.send(form);
    });
  },

  async deleteApk(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/apks/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  },

  async setDefaultApks(ids: number[]): Promise<{ marked: number }> {
    const res = await fetch(`${API_BASE}/apks/defaults`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    return handleResponse<{ marked: number }>(res);
  },

  async installApks(apkId: number, instances: string[]): Promise<InstallResult[]> {
    const res = await fetch(`${API_BASE}/apks/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apk_id: apkId, instances }),
    });
    return handleResponse<InstallResult[]>(res);
  },

  // ── Gestor de archivos (WEB-017) ─────────────────────────────────────────
  async listFiles(instance: string, path: string): Promise<FileEntry[]> {
    const q = new URLSearchParams({ instance, path });
    const res = await fetch(`${API_BASE}/files?${q.toString()}`);
    return handleResponse<FileEntry[]>(res);
  },

  async uploadFile(instance: string, path: string, file: File): Promise<FileEntry> {
    const q = new URLSearchParams({ instance, path });
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/files/upload?${q.toString()}`, {
      method: 'POST',
      body: form,
    });
    return handleResponse<FileEntry>(res);
  },

  async downloadFile(instance: string, path: string): Promise<Blob> {
    const q = new URLSearchParams({ instance, path });
    const res = await fetch(`${API_BASE}/files/download?${q.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  },

  async deleteFile(instance: string, path: string): Promise<void> {
    const q = new URLSearchParams({ instance, path });
    const res = await fetch(`${API_BASE}/files?${q.toString()}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  },

  async sendFile(
    sourceInstance: string,
    sourcePath: string,
    targetInstance: string,
    targetPath: string
  ): Promise<FileEntry> {
    const res = await fetch(`${API_BASE}/files/send-to`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_instance: sourceInstance,
        source_path: sourcePath,
        target_instance: targetInstance,
        target_path: targetPath,
      }),
    });
    return handleResponse<FileEntry>(res);
  },

};
