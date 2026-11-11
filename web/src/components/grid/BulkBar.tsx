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
  X,
  Send,
  Loader2,
  Trash2,
  ShieldAlert,
  Usb,
  BookmarkPlus,
} from 'lucide-react';
import { IconBtn } from '../ui/IconBtn';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ConfirmDeleteModal } from '../ui/ConfirmDeleteModal';
import { api } from '../../lib/api';
import { useLocationsCatalog, EMPTY_CATALOG, useApkCatalog } from '../../lib/queries';
import { cn, getErrorMessage } from '../../lib/utils';
import type { LocationData } from '../../types';
import { toast } from 'sonner';
import { useExclusivePopover } from '../../lib/useExclusivePopover';

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

  // Popovers exclusivos (bulk bar)
  const textPopover = useExclusivePopover('bulk:text');
  const [textValue, setTextValue] = useState('');

  const urlPopover = useExclusivePopover('bulk:url');
  const [urlValue, setUrlValue] = useState('');

  const apkPopover = useExclusivePopover('bulk:apk');
  const { data: apks = [], isLoading: apksLoading } = useApkCatalog({ enabled: apkPopover.open });
  const [selectedApkId, setSelectedApkId] = useState<number | null>(null);
  const [installingApk, setInstallingApk] = useState(false);

  const gpsPopover = useExclusivePopover('bulk:gps');
  const { data: catalog = EMPTY_CATALOG } = useLocationsCatalog({ enabled: gpsPopover.open });
  const customLocations = catalog.locations;

  // Confirm delete modal state
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const count = selectedNames.length;
  if (count < 2) return null;

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
    } catch (e) {
      toast.error(`Error al eliminar: ${getErrorMessage(e)}`);
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
      toast.error(err instanceof Error ? getErrorMessage(err) : 'Error en acción grupal', { id: toastId });
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
      toast.error(err instanceof Error ? getErrorMessage(err) : 'Error al enviar tecla');
    } finally {
      setBusy(null);
    }
  };

  const handleSendText = async () => {
    if (!textValue.trim()) return;
    const txt = textValue.trim();
    textPopover.onOpenChange(false);
    setTextValue('');
    const toastId = toast.loading(`Escribiendo en ${count} dispositivos...`);
    try {
      const res = await api.groupText(selectedNames, txt);
      toast.success(`Texto enviado a ${res.success} dispositivos`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? getErrorMessage(err) : 'Error al enviar texto en lote', { id: toastId });
    }
  };

  const handleSendUrl = async () => {
    if (!urlValue.trim()) return;
    let url = urlValue.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    urlPopover.onOpenChange(false);
    setUrlValue('');
    const toastId = toast.loading(`Abriendo URL en ${count} dispositivos...`);
    try {
      const res = await api.groupLaunchUrl(selectedNames, url);
      toast.success(`URL abierta en ${res.success} dispositivos`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? getErrorMessage(err) : 'Error al abrir URL en lote', { id: toastId });
    }
  };

  const handleInstallApk = async () => {
    if (selectedApkId === null) {
      toast.error('Seleccioná un APK del repositorio');
      return;
    }
    setInstallingApk(true);
    try {
      const results = await api.installApks(selectedApkId, selectedNames);
      const ok = results.filter((r) => r.ok && r.status === 'ok').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;
      const failed = results.filter((r) => !r.ok && r.status === 'failed').length;
      toast.success(`Instalación: ${ok} ok, ${skipped} omitidas, ${failed} fallos`);
      apkPopover.onOpenChange(false);
      onRefresh();
    } catch (err) {
      toast.error(`Error al instalar APK: ${getErrorMessage(err)}`);
    } finally {
      setInstallingApk(false);
    }
  };

  const handleSetGps = async (loc: LocationData) => {
    gpsPopover.onOpenChange(false);
    const displayName = loc.custom_name || loc.city;
    const toastId = toast.loading(`Asignando GPS "${displayName}" a ${count} dispositivos...`);
    try {
      await api.groupSetLocation(selectedNames, {
        latitude: loc.latitude,
        longitude: loc.longitude,
        altitude: loc.altitude || 20.0,
        city: loc.city,
        timezone: loc.timezone,
        custom_name: loc.custom_name,
        custom_location_id: loc.custom_location_id,
      });
      toast.success(`GPS actualizado a "${displayName}"`, { id: toastId });
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? getErrorMessage(err) : 'Error al cambiar GPS en lote', { id: toastId });
    }
  };

  const handleBatchQuarantine = async () => {
    setBusy('quarantine');
    const toastId = toast.loading(`Aislando ${count} CloudPhones y liberando módems USB...`);
    try {
      await api.batchQuarantine(selectedNames);
      toast.success(`${count} CloudPhones puestos en cuarentena segura`, { id: toastId });
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? getErrorMessage(err) : 'Error al aislar en lote', { id: toastId });
    } finally {
      setBusy(null);
    }
  };

  const handleBatchClaim = async () => {
    setBusy('claim');
    const toastId = toast.loading(`Reclamando conexiones USB para ${count} CloudPhones...`);
    try {
      const results = await Promise.allSettled(selectedNames.map((name) => api.claimUsb(name)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      const ok = results.length - failed;
      if (failed === 0) {
        toast.success(`Reclamo USB enviado a ${ok} CloudPhones`, { id: toastId });
      } else {
        toast.warning(`Reclamo USB: ${ok} enviados, ${failed} con error`, { id: toastId });
      }
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? getErrorMessage(err) : 'Error al reclamar USB en lote', { id: toastId });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-sm border border-border bg-card p-1 shadow-md">
        {/* Contador de seleccionados en ámbar técnico */}
        <div className="flex items-center gap-2 px-1.5 font-mono text-xs">
          <span className="grid h-6 min-w-6 place-items-center rounded-xs bg-primary px-1 font-bold text-primary-foreground font-mono">
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
        <Popover open={textPopover.open} onOpenChange={textPopover.onOpenChange}>
          <PopoverTrigger asChild>
            <IconBtn
                icon={Type}
                label="Escribir texto en todos"
                side="top"
                variant={textPopover.open ? 'active' : 'ghost'}
              />
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
        <Popover open={urlPopover.open} onOpenChange={urlPopover.onOpenChange}>
          <PopoverTrigger asChild>
            <IconBtn
                icon={Link2}
                label="Abrir URL"
                side="top"
                variant={urlPopover.open ? 'active' : 'ghost'}
              />
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
        <Popover open={apkPopover.open} onOpenChange={apkPopover.onOpenChange}>
          <PopoverTrigger asChild>
            <IconBtn
                icon={PackagePlus}
                label="Instalar app"
                side="top"
                variant={apkPopover.open ? 'active' : 'ghost'}
              />
          </PopoverTrigger>
          <PopoverContent side="top" className="w-80 p-2">
            <div className="mb-2 text-xs font-bold text-foreground">Instalar APK del repositorio</div>
            {apksLoading ? (
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
              </div>
            ) : apks.length === 0 ? (
              <div className="py-2 text-xs text-muted-foreground">No hay APKs disponibles.</div>
            ) : (
              <div className="mb-2 max-h-40 overflow-y-auto space-y-1">
                {apks.map((apk) => (
                  <button
                    key={apk.id}
                    type="button"
                    onClick={() => setSelectedApkId(apk.id)}
                    className={cn(
                      'w-full rounded-xs border px-2 py-1 text-left text-xs transition-colors',
                      selectedApkId === apk.id
                        ? 'border-primary bg-primary/20 text-foreground font-semibold'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <div className="truncate">{apk.original_name}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{apk.package}</div>
                  </button>
                ))}
              </div>
            )}
            <IconBtn
              icon={installingApk ? Loader2 : Send}
              label="Instalar en seleccionados"
              variant="primary"
              disabled={selectedApkId === null || apks.length === 0 || installingApk}
              onClick={handleInstallApk}
              className={installingApk ? 'animate-spin' : ''}
            />
          </PopoverContent>
        </Popover>

        <Sep />

        {/* Cambiar GPS */}
        <Popover open={gpsPopover.open} onOpenChange={gpsPopover.onOpenChange}>
          <PopoverTrigger asChild>
            <IconBtn
                icon={MapPin}
                label="Cambiar GPS"
                side="top"
                variant={gpsPopover.open ? 'active' : 'ghost'}
              />
          </PopoverTrigger>
          <PopoverContent side="top" className="w-64 max-h-72 overflow-y-auto p-1.5 space-y-2">
            {customLocations.length > 0 && (
              <div>
                <div className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold text-primary uppercase tracking-wider">
                  <BookmarkPlus className="h-3 w-3" />
                  <span>Ubicaciones Custom</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {customLocations.map((loc) => (
                    <button
                      key={loc.id}
                      onClick={() =>
                        handleSetGps({
                          city: loc.city,
                          latitude: loc.latitude,
                          longitude: loc.longitude,
                          altitude: loc.altitude,
                          timezone: loc.timezone,
                          custom_name: loc.name,
                          custom_location_id: loc.id,
                        })
                      }
                      className="flex flex-col rounded px-2 py-1 text-left text-xs hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <span className="font-semibold text-foreground truncate">{loc.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate">{loc.city}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Presets Oficiales
              </div>
              <div className="flex flex-col gap-0.5">
                {Object.entries(locationPresets).map(([key, loc]) => (
                  <button
                    key={key}
                    onClick={() => handleSetGps(loc)}
                    className="flex items-center justify-between rounded px-2 py-1 text-xs text-foreground/80 hover:bg-accent hover:text-foreground text-left"
                  >
                    <span className="truncate">{loc.city}</span>
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Reclamar Conexión USB en Lote */}
        <IconBtn
          icon={busy === 'claim' ? Loader2 : Usb}
          label="Reclamar conexión USB en lote"
          side="top"
          disabled={busy !== null}
          onClick={handleBatchClaim}
        />

        {/* Poner en Cuarentena / Soltar Red en Lote */}
        <IconBtn
          icon={busy === 'quarantine' ? Loader2 : ShieldAlert}
          label="Soltar red / Poner en cuarentena"
          side="top"
          disabled={busy !== null}
          onClick={handleBatchQuarantine}
        />

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

      {/* Modal de confirmación para eliminar perfiles (Portal en document.body con backdrop dismiss y diseño fino) */}
      <ConfirmDeleteModal
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleExecuteDelete}
        instances={selectedNames}
        busy={busy === 'delete'}
      />
    </div>
  );
}

const Sep = () => <div className="mx-1 h-6 w-px bg-border" />;
