import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Package,
  FolderArchive,
  Trash2,
  Upload,
  Download,
  Send,
  Loader2,
  Smartphone,
  ChevronRight,
  Folder,
  FileText,
  HardDrive,
  CheckSquare,
  Square,
} from 'lucide-react';
import type { Instance, ApkEntry, FileEntry } from '../../types';
import { api } from '../../lib/api';
import { cn, getErrorMessage } from '../../lib/utils';
import { IconBtn } from '../ui/IconBtn';
import { ConfirmDeleteModal } from '../ui/ConfirmDeleteModal';

export type ApkManagerTab = 'apks' | 'files';

interface ApkFileManagerProps {
  instances: Instance[];
  preselectedInstance?: string;
  initialTab?: ApkManagerTab;
  onRefreshInstances?: () => void;
}

const ROOTS = [
  { path: '/sdcard/Download', label: 'Download' },
  { path: '/sdcard/DCIM', label: 'DCIM' },
  { path: '/sdcard/Pictures', label: 'Pictures' },
  { path: '/sdcard/Documents', label: 'Documents' },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

function formatDate(ts: number): string {
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return '—';
  }
}

export default function ApkFileManager({
  instances,
  preselectedInstance,
  initialTab = 'apks',
  onRefreshInstances,
}: ApkFileManagerProps) {
  const [activeTab, setActiveTab] = useState<ApkManagerTab>(initialTab);

  // ── APK tab state ──
  const [apks, setApks] = useState<ApkEntry[]>([]);
  const [apksLoading, setApksLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [installingApkId, setInstallingApkId] = useState<number | null>(null);
  const [selectedInstallInstances, setSelectedInstallInstances] = useState<Set<string>>(new Set());
  const [defaultIds, setDefaultIds] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Files tab state ──
  const [selectedInstance, setSelectedInstance] = useState<string | undefined>(preselectedInstance);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [availableRoots, setAvailableRoots] = useState<{ path: string; realpath: string; label: string }[]>([]);
  const [sendTargetInstance, setSendTargetInstance] = useState<string>('');
  const [sendFilePath, setSendFilePath] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<FileEntry | null>(null);
  const fileUploadRef = useRef<HTMLInputElement>(null);

  const runningInstances = useMemo(() => instances.filter((i) => i.running), [instances]);

  const fetchApks = async () => {
    setApksLoading(true);
    try {
      const data = await api.getApks();
      setApks(data);
      setDefaultIds(new Set(data.filter((a) => a.is_default).map((a) => a.id)));
    } catch (err) {
      toast.error(`Error al listar APKs: ${getErrorMessage(err)}`);
    } finally {
      setApksLoading(false);
    }
  };

  useEffect(() => {
    fetchApks();
  }, []);

  // ── APK handlers ──
  const handleFileSelect = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.apk')) {
      toast.error('Solo se permiten archivos .apk');
      return;
    }
    setUploadProgress(0);
    try {
      await api.uploadApk(file, (p) => setUploadProgress(p));
      toast.success(`APK "${file.name}" subido`);
      await fetchApks();
    } catch (err) {
      toast.error(`Error al subir APK: ${getErrorMessage(err)}`);
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteApk = async (id: number, name: string) => {
    try {
      await api.deleteApk(id);
      toast.success(`APK "${name}" eliminado`);
      await fetchApks();
    } catch (err) {
      toast.error(`Error al eliminar APK: ${getErrorMessage(err)}`);
    }
  };

  const toggleDefault = async (id: number) => {
    const next = new Set(defaultIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    try {
      await api.setDefaultApks([...next]);
      setDefaultIds(next);
      toast.success('APKs por defecto actualizados');
    } catch (err) {
      toast.error(`Error al guardar defaults: ${getErrorMessage(err)}`);
      await fetchApks();
    }
  };

  const handleInstall = async (apkId: number) => {
    const targets = [...selectedInstallInstances];
    if (targets.length === 0) {
      toast.error('Seleccioná al menos una instancia');
      return;
    }
    setInstallingApkId(apkId);
    try {
      const results = await api.installApks(apkId, targets);
      const ok = results.filter((r) => r.ok && r.status === 'ok').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;
      const failed = results.filter((r) => !r.ok && r.status === 'failed').length;
      toast.success(`Instalación: ${ok} ok, ${skipped} omitidas, ${failed} fallos`);
      onRefreshInstances?.();
    } catch (err) {
      toast.error(`Error en instalación: ${getErrorMessage(err)}`);
    } finally {
      setInstallingApkId(null);
    }
  };

  // ── Files handlers ──
  const fetchRoots = async (_instance: string) => {
    // TODO: el backend podría exponer /api/v1/files/roots; por ahora usamos la whitelist.
    setAvailableRoots(ROOTS.map((r) => ({ path: r.path, realpath: r.path, label: r.label })));
  };

  const fetchFiles = async (instance: string, path: string) => {
    setFilesLoading(true);
    try {
      const data = await api.listFiles(instance, path);
      setFiles(data);
    } catch (err) {
      toast.error(`Error al listar archivos: ${getErrorMessage(err)}`);
      setFiles([]);
    } finally {
      setFilesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'files') return;
    if (!selectedInstance && instances.length > 0) {
      setSelectedInstance(instances[0].instance_name);
      return;
    }
    if (selectedInstance && currentPath) {
      fetchFiles(selectedInstance, currentPath);
    } else if (selectedInstance) {
      setCurrentPath(null);
      fetchRoots(selectedInstance);
    }
  }, [activeTab, selectedInstance, currentPath, instances]);

  const handleUploadFile = async (file: File) => {
    if (!selectedInstance || !currentPath) return;
    try {
      await api.uploadFile(selectedInstance, currentPath, file);
      toast.success(`Archivo "${file.name}" subido`);
      await fetchFiles(selectedInstance, currentPath);
    } catch (err) {
      toast.error(`Error al subir archivo: ${getErrorMessage(err)}`);
    } finally {
      if (fileUploadRef.current) fileUploadRef.current.value = '';
    }
  };

  const handleDownload = async (entry: FileEntry) => {
    if (!selectedInstance) return;
    try {
      const blob = await api.downloadFile(selectedInstance, entry.path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(`Error al descargar: ${getErrorMessage(err)}`);
    }
  };

  const confirmDeleteFile = async () => {
    if (!selectedInstance || !fileToDelete) return;
    try {
      await api.deleteFile(selectedInstance, fileToDelete.path);
      toast.success(`Archivo "${fileToDelete.name}" eliminado`);
      setFileToDelete(null);
      if (currentPath) await fetchFiles(selectedInstance, currentPath);
    } catch (err) {
      toast.error(`Error al eliminar: ${getErrorMessage(err)}`);
    }
  };

  const handleSendFile = async () => {
    if (!selectedInstance || !sendFilePath || !sendTargetInstance) return;
    try {
      const result = await api.sendFile(selectedInstance, sendFilePath, sendTargetInstance, currentPath || '/sdcard/Download');
      toast.success(`Archivo enviado a ${sendTargetInstance}: ${result.name}`);
      setSendFilePath(null);
      setSendTargetInstance('');
    } catch (err) {
      toast.error(`Error al enviar archivo: ${getErrorMessage(err)}`);
    }
  };

  const breadcrumb = useMemo(() => {
    if (!currentPath) return [];
    const parts = currentPath.split('/').filter(Boolean);
    const acc: { label: string; path: string }[] = [];
    let path = '';
    for (const part of parts) {
      path += `/${part}`;
      acc.push({ label: part, path });
    }
    return acc;
  }, [currentPath]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background p-4">
      <header className="mb-3 flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h1 className="font-mono text-lg font-bold text-foreground">APKs y Archivos</h1>
        </div>
        <div className="flex rounded-sm border border-border bg-muted/40 p-0.5 text-xs font-mono">
          {(['apks', 'files'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={cn(
                'flex items-center gap-1 rounded-xs px-3 py-1 font-medium transition-colors',
                activeTab === t
                  ? 'bg-card text-foreground font-bold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t === 'apks' ? <Package className="h-3 w-3" /> : <FolderArchive className="h-3 w-3" />}
              {t === 'apks' ? 'Repositorio APKs' : 'Gestor de archivos'}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'apks' && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {/* Zona de subida */}
          <div
            className="rounded-sm border border-dashed border-border bg-card/50 p-4 text-center transition-colors hover:bg-card"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFileSelect(f);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".apk"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            />
            <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-1 text-xs text-muted-foreground">
              Arrastrá un APK o hacé clic para subir (máx. 150 MB)
            </p>
            {uploadProgress !== null && (
              <div className="mx-auto mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>

          {/* Tabla de APKs */}
          <div className="min-h-0 flex-1 overflow-auto rounded-sm border border-border bg-card">
            {apksLoading && apks.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando APKs…
              </div>
            ) : apks.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                No hay APKs en el repositorio.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2">Package</th>
                    <th className="px-3 py-2">Versión</th>
                    <th className="px-3 py-2">Tamaño</th>
                    <th className="px-3 py-2">Default</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {apks.map((apk) => (
                    <tr key={apk.id} className="hover:bg-muted/40">
                      <td className="px-3 py-2 font-medium text-foreground">{apk.original_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{apk.package}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {apk.version_name} ({apk.version_code})
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{formatBytes(apk.size)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleDefault(apk.id)}
                          className={cn(
                            'inline-flex h-4 w-8 items-center rounded-full transition-colors',
                            defaultIds.has(apk.id) ? 'bg-primary' : 'bg-muted'
                          )}
                        >
                          <span
                            className={cn(
                              'inline-block h-3 w-3 rounded-full bg-white transition-transform',
                              defaultIds.has(apk.id) ? 'translate-x-4' : 'translate-x-0.5'
                            )}
                          />
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <select
                            multiple
                            size={Math.min(4, runningInstances.length || 1)}
                            className="hidden"
                            value={[...selectedInstallInstances]}
                            onChange={(e) => {
                              const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
                              setSelectedInstallInstances(new Set(opts));
                            }}
                          >
                            {runningInstances.map((i) => (
                              <option key={i.instance_name} value={i.instance_name}>
                                {i.instance_name}
                              </option>
                            ))}
                          </select>
                          <IconBtn
                            icon={installingApkId === apk.id ? Loader2 : Send}
                            label="Instalar en seleccionados"
                            size="sm"
                            disabled={selectedInstallInstances.size === 0 || installingApkId !== null}
                            onClick={() => handleInstall(apk.id)}
                            className={installingApkId === apk.id ? 'animate-spin' : ''}
                          />
                          <IconBtn
                            icon={Trash2}
                            label="Eliminar APK"
                            size="sm"
                            variant="danger"
                            onClick={() => handleDeleteApk(apk.id, apk.original_name)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Selector de instancias para instalar */}
          <div className="rounded-sm border border-border bg-card p-2">
            <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
              Instalar APK seleccionado en:
            </div>
            <div className="flex flex-wrap gap-1">
              {runningInstances.length === 0 && (
                <span className="text-xs text-muted-foreground">No hay instancias encendidas</span>
              )}
              {runningInstances.map((i) => {
                const selected = selectedInstallInstances.has(i.instance_name);
                return (
                  <button
                    key={i.instance_name}
                    type="button"
                    onClick={() => {
                      const next = new Set(selectedInstallInstances);
                      if (selected) next.delete(i.instance_name);
                      else next.add(i.instance_name);
                      setSelectedInstallInstances(next);
                    }}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-xs border px-2 py-1 text-xs transition-colors',
                      selected
                        ? 'border-primary bg-primary/20 text-foreground font-semibold'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {selected ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                    {i.instance_name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'files' && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <select
              value={selectedInstance ?? ''}
              onChange={(e) => {
                setSelectedInstance(e.target.value);
                setCurrentPath(null);
                setFiles([]);
              }}
              className="h-8 rounded-sm border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Seleccionar CloudPhone</option>
              {instances.map((i) => (
                <option key={i.instance_name} value={i.instance_name}>
                  {i.instance_name} {i.running ? '(online)' : '(offline)'}
                </option>
              ))}
            </select>

            {currentPath && (
              <>
                <button
                  type="button"
                  onClick={() => setCurrentPath(null)}
                  className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  <HardDrive className="h-3 w-3" /> Raíces
                </button>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                {breadcrumb.map((part, idx) => (
                  <span key={part.path} className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentPath(part.path)}
                      className="text-xs text-foreground hover:text-primary"
                    >
                      {part.label}
                    </button>
                    {idx < breadcrumb.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  </span>
                ))}
              </>
            )}

            {currentPath && (
              <div className="ml-auto flex items-center gap-1">
                <input
                  ref={fileUploadRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUploadFile(e.target.files[0])}
                />
                <IconBtn icon={Upload} label="Subir archivo" size="sm" onClick={() => fileUploadRef.current?.click()} />
              </div>
            )}
          </div>

          {!currentPath && selectedInstance && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {availableRoots.map((root) => (
                <button
                  key={root.path}
                  type="button"
                  onClick={() => setCurrentPath(root.path)}
                  className="flex flex-col items-center gap-2 rounded-sm border border-border bg-card p-4 text-center transition-colors hover:bg-muted"
                >
                  <Folder className="h-8 w-8 text-primary" />
                  <span className="text-xs font-mono font-medium text-foreground">{root.label || root.path}</span>
                </button>
              ))}
            </div>
          )}

          {currentPath && (
            <div className="min-h-0 flex-1 overflow-auto rounded-sm border border-border bg-card">
              {filesLoading && files.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando archivos…
                </div>
              ) : files.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                  Directorio vacío.
                </div>
              ) : (
                <table className="w-full text-left text-xs font-mono">
                  <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">Tamaño</th>
                      <th className="px-3 py-2">Modificado</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {files.map((entry) => (
                      <tr key={entry.path} className="hover:bg-muted/40">
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => entry.type === 'directory' && setCurrentPath(entry.path)}
                            className="flex items-center gap-1.5 text-foreground hover:text-primary"
                            disabled={entry.type !== 'directory'}
                          >
                            {entry.type === 'directory' ? (
                              <Folder className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            {entry.name}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {entry.type === 'directory' ? '—' : formatBytes(entry.size)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{formatDate(entry.mtime)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {entry.type === 'file' && (
                              <>
                                <IconBtn icon={Download} label="Descargar" size="sm" onClick={() => handleDownload(entry)} />
                                <IconBtn
                                  icon={Send}
                                  label="Enviar a otro CloudPhone"
                                  size="sm"
                                  onClick={() => {
                                    setSendFilePath(entry.path);
                                    setSendTargetInstance(
                                      instances.find((i) => i.instance_name !== selectedInstance)?.instance_name || ''
                                    );
                                  }}
                                />
                              </>
                            )}
                            <IconBtn
                              icon={Trash2}
                              label="Eliminar"
                              size="sm"
                              variant="danger"
                              onClick={() => setFileToDelete(entry)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal enviar archivo */}
      {sendFilePath && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-sm border border-border bg-card p-4 shadow-xl">
            <div className="mb-3 font-mono text-sm font-bold text-foreground">Enviar archivo</div>
            <p className="mb-2 text-xs text-muted-foreground">Origen: {sendFilePath}</p>
            <select
              value={sendTargetInstance}
              onChange={(e) => setSendTargetInstance(e.target.value)}
              className="mb-3 h-8 w-full rounded-sm border border-border bg-background px-2 text-xs text-foreground"
            >
              <option value="">Seleccionar destino</option>
              {instances
                .filter((i) => i.instance_name !== selectedInstance)
                .map((i) => (
                  <option key={i.instance_name} value={i.instance_name}>
                    {i.instance_name}
                  </option>
                ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSendFilePath(null)}
                className="rounded-sm border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSendFile}
                disabled={!sendTargetInstance}
                className="rounded-sm bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={fileToDelete !== null}
        onClose={() => setFileToDelete(null)}
        onConfirm={confirmDeleteFile}
        instances={fileToDelete ? [fileToDelete.name] : []}
      />
    </div>
  );
}
