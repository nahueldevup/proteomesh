import { useState } from 'react';
import {
  Power,
  RotateCw,
  Radio,
  ArrowLeft,
  Home,
  Type,
  Link2,
  PackagePlus,
  MapPin,
  Globe,
  X,
  VolumeX,
  Send,
  Loader2,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { IconBtn } from '../ui/IconBtn';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { api } from '../../lib/api';
import type { LocationData } from '../../types';
import { toast } from 'sonner';

interface BulkBarProps {
  selectedNames: string[];
  groupMode: boolean;
  onToggleGroupMode: () => void;
  onClear: () => void;
  onRefresh: () => void;
  locationPresets?: Record<string, LocationData>;
}

export default function BulkBar({
  selectedNames,
  groupMode,
  onToggleGroupMode,
  onClear,
  onRefresh,
  locationPresets = {},
}: BulkBarProps) {
  const [busy, setBusy] = useState<string | null>(null);

  // Popover state
  const [textOpen, setTextOpen] = useState(false);
  const [textValue, setTextValue] = useState('');

  const [urlOpen, setUrlOpen] = useState(false);
  const [urlValue, setUrlValue] = useState('');

  const [apkOpen, setApkOpen] = useState(false);
  const [apkValue, setApkValue] = useState('');

  const [gpsOpen, setGpsOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [proxyValue, setProxyValue] = useState('');

  // Confirm delete modal state
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const count = selectedNames.length;
  if (count === 0) return null;

  const handleExecuteDelete = async () => {
    setBusy('delete');
    try {
      const res = await api.groupLifecycle(selectedNames, 'delete');
      const fails = res.results.filter((r) => !r.ok);
      if (fails.length === 0) {
        toast.success(
          selectedNames.length === 1
            ? `Perfil '${selectedNames[0]}' eliminado correctamente`
            : `${selectedNames.length} perfiles eliminados correctamente`
        );
      } else {
        toast.warning(
          `Eliminados: ${res.succeeded}, fallos: ${fails.length}`
        );
      }
      setConfirmDeleteOpen(false);
      onClear();
      onRefresh();
    } catch (e: any) {
      toast.error(`Error al eliminar: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const runLifecycle = async (action: 'start' | 'stop' | 'restart') => {
    setBusy(action);
    const label = action === 'start' ? 'Encendiendo' : action === 'stop' ? 'Apagando' : 'Reiniciando';
    const toastId = toast.loading(`${label} ${count} CloudPhones...`);
    try {
      await api.groupLifecycle(selectedNames, action);
      toast.success(`${count} CloudPhones actualizados`, { id: toastId });
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error en acción grupal', { id: toastId });
    } finally {
      setBusy(null);
    }
  };

  const runKey = async (key: string, label: string) => {
    setBusy(`key-${key}`);
    try {
      await api.groupKey(selectedNames, key);
      toast.success(`Tecla "${label}" enviada a ${count} dispositivos`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar tecla');
    } finally {
      setBusy(null);
    }
  };

  const handleSendText = async () => {
    if (!textValue.trim()) return;
    const txt = textValue.trim();
    setTextOpen(false);
    setTextValue('');
    const toastId = toast.loading(`Escribiendo en ${count} dispositivos...`);
    try {
      const res = await api.groupText(selectedNames, txt);
      toast.success(`Texto enviado a ${res.success} dispositivos`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar texto en lote', { id: toastId });
    }
  };

  const handleSendUrl = async () => {
    if (!urlValue.trim()) return;
    let url = urlValue.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    setUrlOpen(false);
    setUrlValue('');
    const toastId = toast.loading(`Abriendo URL en ${count} dispositivos...`);
    try {
      const res = await api.groupLaunchUrl(selectedNames, url);
      toast.success(`URL abierta en ${res.success} dispositivos`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al abrir URL en lote', { id: toastId });
    }
  };

  const handleInstallApk = async () => {
    if (!apkValue.trim()) return;
    const apk = apkValue.trim();
    setApkOpen(false);
    setApkValue('');
    toast.info(`Despliegue de paquete iniciado para ${count} dispositivos: ${apk}`);
  };

  const handleSetGps = async (loc: LocationData) => {
    setGpsOpen(false);
    const toastId = toast.loading(`Asignando GPS ${loc.city} a ${count} dispositivos...`);
    try {
      await api.groupSetLocation(selectedNames, {
        latitude: loc.latitude,
        longitude: loc.longitude,
        altitude: loc.altitude || 20.0,
        city: loc.city,
        timezone: loc.timezone,
      });
      toast.success(`GPS actualizado a ${loc.city}`, { id: toastId });
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar GPS en lote', { id: toastId });
    }
  };

  const handleSetProxy = async () => {
    if (!proxyValue.trim()) return;
    const raw = proxyValue.trim();
    setProxyOpen(false);
    setProxyValue('');
    const toastId = toast.loading(`Configurando proxy en ${count} dispositivos...`);
    try {
      let type = 'socks5';
      let host = '';
      let port = 1080;
      let username: string | undefined;
      let password: string | undefined;

      if (raw.includes('://')) {
        const parsed = new URL(raw);
        type = parsed.protocol.replace(':', '');
        host = parsed.hostname;
        port = Number(parsed.port) || (type === 'socks5' ? 1080 : 8080);
        if (parsed.username) username = decodeURIComponent(parsed.username);
        if (parsed.password) password = decodeURIComponent(parsed.password);
      } else {
        const parts = raw.split(':');
        host = parts[0];
        port = Number(parts[1]) || 1080;
        if (parts.length >= 4) {
          username = parts[2];
          password = parts[3];
        }
      }

      await api.groupSetProxy(selectedNames, { type, host, port, username, password });
      toast.success(`Proxy asignado a ${count} dispositivos`, { id: toastId });
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al asignar proxy en lote', { id: toastId });
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-border bg-popover/95 p-1.5 shadow-2xl backdrop-blur">
        {/* Contador de seleccionados en verde neón exacto de Lovable */}
        <div className="flex items-center gap-2 px-2 font-mono text-xs">
          <span className="grid h-6 min-w-6 place-items-center rounded bg-primary px-1 font-bold text-primary-foreground">
            {count}
          </span>
        </div>

        <Sep />

        {/* Encender / Silenciar / Reiniciar / Sincronizar */}
        <IconBtn
          icon={busy === 'start' ? Loader2 : Power}
          label="Encender"
          side="top"
          disabled={busy !== null}
          onClick={() => runLifecycle('start')}
        />
        <IconBtn
          icon={VolumeX}
          label="Silenciar audio en todos"
          side="top"
          variant="danger"
          onClick={() => toast.info(`Audio silenciado en ${count} dispositivos`)}
        />
        <IconBtn
          icon={busy === 'restart' ? Loader2 : RotateCw}
          label="Reiniciar"
          side="top"
          disabled={busy !== null}
          onClick={() => runLifecycle('restart')}
        />
        <IconBtn
          icon={Radio}
          label={
            groupMode
              ? 'Sincronizado: lo que toques se repite'
              : 'Sincronizar toques'
          }
          side="top"
          variant={groupMode ? 'active' : 'ghost'}
          onClick={onToggleGroupMode}
        />

        <Sep />

        {/* Navegación física y acciones rápidas */}
        <IconBtn
          icon={ArrowLeft}
          label="Atrás en todos"
          side="top"
          disabled={busy !== null}
          onClick={() => runKey('back', 'Atrás')}
        />
        <IconBtn
          icon={Home}
          label="Inicio en todos"
          side="top"
          disabled={busy !== null}
          onClick={() => runKey('home', 'Inicio')}
        />

        {/* Escribir texto */}
        <Popover open={textOpen} onOpenChange={setTextOpen}>
          <PopoverTrigger asChild>
            <div>
              <IconBtn
                icon={Type}
                label="Escribir texto en todos"
                side="top"
                variant={textOpen ? 'active' : 'ghost'}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-72 p-2">
            <div className="mb-2 text-xs text-muted-foreground">Escribir texto en todos</div>
            <div className="flex gap-1">
              <input
                type="text"
                autoFocus
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                placeholder="Texto…"
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              />
              <IconBtn icon={Send} label="Enviar" variant="primary" onClick={handleSendText} />
            </div>
          </PopoverContent>
        </Popover>

        {/* Abrir URL */}
        <Popover open={urlOpen} onOpenChange={setUrlOpen}>
          <PopoverTrigger asChild>
            <div>
              <IconBtn
                icon={Link2}
                label="Abrir URL"
                side="top"
                variant={urlOpen ? 'active' : 'ghost'}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-72 p-2">
            <div className="mb-2 text-xs text-muted-foreground">Abrir URL</div>
            <div className="flex gap-1">
              <input
                type="text"
                autoFocus
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendUrl()}
                placeholder="https://…"
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              />
              <IconBtn icon={Send} label="Abrir" variant="primary" onClick={handleSendUrl} />
            </div>
          </PopoverContent>
        </Popover>

        {/* Instalar app */}
        <Popover open={apkOpen} onOpenChange={setApkOpen}>
          <PopoverTrigger asChild>
            <div>
              <IconBtn
                icon={PackagePlus}
                label="Instalar app"
                side="top"
                variant={apkOpen ? 'active' : 'ghost'}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-72 p-2">
            <div className="mb-2 text-xs text-muted-foreground">Instalar app</div>
            <div className="flex gap-1">
              <input
                type="text"
                autoFocus
                value={apkValue}
                onChange={(e) => setApkValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInstallApk()}
                placeholder="Nombre del APK o enlace…"
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              />
              <IconBtn icon={Send} label="Instalar" variant="primary" onClick={handleInstallApk} />
            </div>
          </PopoverContent>
        </Popover>

        <Sep />

        {/* Cambiar GPS */}
        <Popover open={gpsOpen} onOpenChange={setGpsOpen}>
          <PopoverTrigger asChild>
            <div>
              <IconBtn
                icon={MapPin}
                label="Cambiar GPS"
                side="top"
                variant={gpsOpen ? 'active' : 'ghost'}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-56 max-h-64 overflow-y-auto p-1">
            <div className="px-2 py-1 text-xs text-muted-foreground">Presets GPS</div>
            <div className="flex flex-col gap-0.5">
              {Object.entries(locationPresets).map(([key, loc]) => (
                <button
                  key={key}
                  onClick={() => handleSetGps(loc)}
                  className="flex items-center justify-between rounded px-2 py-1.5 text-xs text-foreground/80 hover:bg-accent hover:text-foreground text-left"
                >
                  <span className="truncate">{loc.city}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Cambiar Proxy */}
        <Popover open={proxyOpen} onOpenChange={setProxyOpen}>
          <PopoverTrigger asChild>
            <div>
              <IconBtn
                icon={Globe}
                label="Cambiar proxy"
                side="top"
                variant={proxyOpen ? 'active' : 'ghost'}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-72 p-2">
            <div className="mb-2 text-xs text-muted-foreground">Configurar Proxy</div>
            <div className="flex gap-1">
              <input
                type="text"
                autoFocus
                value={proxyValue}
                onChange={(e) => setProxyValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSetProxy()}
                placeholder="socks5://host:port"
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm font-mono"
              />
              <IconBtn icon={Send} label="Aplicar" variant="primary" onClick={handleSetProxy} />
            </div>
          </PopoverContent>
        </Popover>

        <Sep />

        {/* Eliminar perfiles seleccionados con modal de confirmación */}
        <IconBtn
          icon={Trash2}
          label={count === 1 ? 'Eliminar perfil seleccionado' : `Eliminar ${count} perfiles seleccionados`}
          side="top"
          variant="danger"
          onClick={() => setConfirmDeleteOpen(true)}
        />

        <Sep />

        {/* Deseleccionar */}
        <IconBtn
          icon={X}
          label="Quitar selección (Esc)"
          side="top"
          onClick={onClear}
        />
      </div>

      {/* Modal de confirmación para eliminar perfiles */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in-0 duration-150">
          <div
            className="w-full max-w-md rounded-2xl border border-destructive/40 bg-surface p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start gap-3.5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/15 border border-destructive/30 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-sans font-bold text-base text-foreground">
                  {selectedNames.length === 1
                    ? `¿Eliminar CloudPhone "${selectedNames[0]}"?`
                    : `¿Eliminar ${selectedNames.length} CloudPhones seleccionados?`}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Esta acción es irreversible. Se detendrá el contenedor Docker y se eliminarán permanentemente todos los datos y la configuración del dispositivo.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-background/80 p-3 max-h-36 overflow-y-auto font-mono text-xs text-muted-foreground space-y-1.5">
              {selectedNames.map((name) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                  <span className="text-foreground font-semibold truncate">{name}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/50">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setConfirmDeleteOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={handleExecuteDelete}
                className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground hover:bg-destructive/90 transition-opacity disabled:opacity-50 shadow-md shadow-destructive/20"
              >
                {busy === 'delete' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span>Eliminar definitivamente</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const Sep = () => <div className="mx-1 h-6 w-px bg-border" />;
