import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Folder,
  FolderOpen,
  FileText,
  FileImage,
  FileVideo,
  FileArchive,
  FileAudio,
  Download,
  Send,
  Trash2,
  Upload,
  ChevronRight,
  Search,
  LayoutGrid,
  List,
  Smartphone,
  X,
  Loader2,
  Camera,
  Image,
  FileDown,
  HardDrive,
  Film,
  Music,
  Maximize2,
  FolderPlus,
  Check as CheckIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import type { Instance, FileEntry } from "../../types";
import { api } from "../../lib/api";
import { useDeviceFiles, queryKeys } from "../../lib/queries";
import { cn, getErrorMessage } from "../../lib/utils";
import { IconBtn } from "../ui/IconBtn";
import { FilePreviewModal } from "./FilePreviewModal";

const ROOT_NAMES = ["Download", "DCIM", "Pictures", "Movies", "Music", "Documents"] as const;
type RootName = (typeof ROOT_NAMES)[number];

const ROOT_ICON: Record<RootName, React.ComponentType<{ className?: string }>> = {
  Download: FileDown,
  DCIM: Camera,
  Pictures: Image,
  Movies: Film,
  Music: Music,
  Documents: FileText,
};

function iconFor(e: FileEntry) {
  if (e.type === "directory") return Folder;
  const ext = e.name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return FileImage;
  if (["mp4", "mkv", "mov"].includes(ext)) return FileVideo;
  if (["zip", "rar", "7z", "apk", "apkm", "xapk", "apks"].includes(ext)) return FileArchive;
  if (["ogg", "mp3", "m4a", "wav"].includes(ext)) return FileAudio;
  return FileText;
}

const isImg = (n: string) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(n);
const isText = (n: string) => /\.(txt|json|xml|log|vcf|csv|md|ini|conf|prop|sh|yaml|yml)$/i.test(n);
const isMedia = (n: string) => /\.(mp4|webm|mkv|mov|mp3|wav|ogg|m4a|opus)$/i.test(n);

function fmtBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

function formatDate(ts: number): string {
  try {
    const d = new Date(ts * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}`;
  } catch {
    return "—";
  }
}

function Check({ checked, onClick }: { checked: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={cn(
        "grid size-4 place-items-center rounded-[3px] border transition-colors cursor-pointer",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-muted-foreground/50"
      )}
    >
      {checked && <CheckIcon className="size-3 stroke-[3]" />}
    </button>
  );
}

function Empty({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return (
    <div className="grid place-items-center py-20 text-center select-none">
      <Icon className="mb-2 size-10 text-muted-foreground/40" />
      <div className="font-semibold text-foreground text-sm">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5 max-w-sm">{text}</div>
    </div>
  );
}

interface FileExplorerProps {
  instances: Instance[];
  preselectedInstance?: string;
}

export function FileExplorer({ instances, preselectedInstance }: FileExplorerProps) {
  const queryClient = useQueryClient();
  const [phoneName, setPhoneName] = useState<string>(
    preselectedInstance || instances[0]?.instance_name || "phone-80"
  );
  const [prevPreselected, setPrevPreselected] = useState(preselectedInstance);
  if (preselectedInstance && preselectedInstance !== prevPreselected) {
    setPrevPreselected(preselectedInstance);
    setPhoneName(preselectedInstance);
  }

  const [pathSegments, setPathSegments] = useState<string[]>(["Download"]);
  const [view, setView] = useState<"list" | "grid">("list");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<{ name: string; p: number }[]>([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Resuelve la instancia seleccionada actualmente
  const currentPhone = instances.find((p) => p.instance_name === phoneName) || instances[0] || null;

  // Ruta física canónica en Android
  const fullPath = "/sdcard/" + pathSegments.join("/");

  const { data: files = [], isLoading: loading } = useDeviceFiles(
    currentPhone?.instance_name,
    fullPath,
    { enabled: Boolean(currentPhone && currentPhone.running) }
  );

  const doCreateFolder = async () => {
    if (!currentPhone || !newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await api.createFolder(currentPhone.instance_name, fullPath, newFolderName.trim());
      toast.success(`Carpeta «${newFolderName.trim()}» creada correctamente`);
      setMkdirOpen(false);
      setNewFolderName("");
      queryClient.invalidateQueries({
        queryKey: queryKeys.files(currentPhone.instance_name, fullPath),
      });
    } catch (err) {
      toast.error(`Error al crear carpeta: ${getErrorMessage(err)}`);
    } finally {
      setCreatingFolder(false);
    }
  };

  const entries = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = files.filter((e) => e.name.toLowerCase().includes(q));
    return [...filtered].sort(
      (a, b) => Number(b.type === "directory") - Number(a.type === "directory") || a.name.localeCompare(b.name)
    );
  }, [files, query]);

  const go = (segments: string[]) => {
    setPathSegments(segments);
    setSelected([]);
    setQuery("");
  };

  const switchPhone = (name: string) => {
    setPhoneName(name);
    go(["Download"]);
  };

  const toggle = (n: string) =>
    setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));

  const selFiles = entries.filter((e) => selected.includes(e.name));

  const upload = async (fileList: FileList | File[]) => {
    if (!currentPhone) return;
    if (!currentPhone.running) {
      toast.error(`${currentPhone.instance_name} está apagado`);
      return;
    }
    const arr = Array.from(fileList);
    setUploading(arr.map((f) => ({ name: f.name, p: 0 })));

    let uploadedCount = 0;
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i];
      try {
        setUploading([{ name: f.name, p: 40 }]);
        await api.uploadFile(currentPhone.instance_name, fullPath, f);
        uploadedCount++;
      } catch (err) {
        toast.error(`Error al subir ${f.name}: ${getErrorMessage(err)}`);
      }
    }

    setUploading([]);
    if (uploadedCount > 0) {
      toast.success(`${uploadedCount} archivo(s) subidos a ${fullPath}`);
      queryClient.invalidateQueries({
        queryKey: queryKeys.files(currentPhone.instance_name, fullPath),
      });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const download = async (items: FileEntry[]) => {
    if (!currentPhone) return;
    const downloadables = items.filter((i) => i.type === "file");
    if (!downloadables.length) return;

    for (const item of downloadables) {
      try {
        const itemPath = `${fullPath}/${item.name}`;
        const blob = await api.downloadFile(currentPhone.instance_name, itemPath);
        const a = document.createElement("a");
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = item.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch (err) {
        toast.error(`Error al descargar ${item.name}: ${getErrorMessage(err)}`);
      }
    }
    toast.success(`Descarga iniciada para ${downloadables.length} archivo(s)`);
  };

  const doSend = async () => {
    if (!currentPhone || !sendTarget) return;
    const targetsToSend = selFiles.filter((f) => f.type === "file");
    if (!targetsToSend.length) return;

    let sent = 0;
    for (const item of targetsToSend) {
      try {
        const itemPath = `${fullPath}/${item.name}`;
        await api.sendFile(currentPhone.instance_name, itemPath, sendTarget, fullPath);
        sent++;
      } catch (err) {
        toast.error(`Error enviando ${item.name} a ${sendTarget}: ${getErrorMessage(err)}`);
      }
    }

    toast.success(`${sent} archivo(s) enviados a ${sendTarget}:${fullPath}`, {
      description: "Galería indexada en destino (MEDIA_SCANNER_SCAN_FILE)",
    });
    setSendOpen(false);
    setSendTarget(null);
    setSelected([]);
    queryClient.invalidateQueries({ queryKey: queryKeys.files(sendTarget, fullPath) });
    queryClient.invalidateQueries({
      queryKey: queryKeys.files(currentPhone.instance_name, fullPath),
    });
  };

  const doDelete = async () => {
    if (!currentPhone || !selected.length) return;
    let delCount = 0;
    for (const name of selected) {
      try {
        const itemPath = `${fullPath}/${name}`;
        await api.deleteFile(currentPhone.instance_name, itemPath);
        delCount++;
      } catch (err) {
        toast.error(`Error al borrar ${name}: ${getErrorMessage(err)}`);
      }
    }
    toast.success(`${delCount} elemento(s) eliminados`);
    setSelected([]);
    setDelOpen(false);
    queryClient.invalidateQueries({
      queryKey: queryKeys.files(currentPhone.instance_name, fullPath),
    });
  };

  const rowActions = (e: FileEntry) => (
    <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      {e.type === "file" && (isImg(e.name) || isText(e.name) || isMedia(e.name)) && (
        <IconBtn
          icon={Maximize2}
          label="Previsualizar archivo"
          size="sm"
          onClick={(ev) => {
            ev.stopPropagation();
            setPreviewFile(e);
          }}
        />
      )}
      {e.type === "file" && (
        <>
          <IconBtn
            icon={Download}
            label="Descargar a la PC"
            size="sm"
            onClick={(ev) => {
              ev.stopPropagation();
              download([e]);
            }}
          />
          <IconBtn
            icon={Send}
            label="Enviar a otro teléfono"
            size="sm"
            onClick={(ev) => {
              ev.stopPropagation();
              setSelected([e.name]);
              setSendOpen(true);
            }}
          />
        </>
      )}
      <IconBtn
        icon={Trash2}
        label="Eliminar"
        variant="danger"
        size="sm"
        onClick={(ev) => {
          ev.stopPropagation();
          setSelected([e.name]);
          setDelOpen(true);
        }}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />

      {/* ASIDE IZQUIERDO: DISPOSITIVOS Y CARPETAS RAÍZ */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="px-3 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground select-none">
          CloudPhones
        </div>
        <div className="max-h-[45%] space-y-0.5 overflow-auto px-2">
          {instances.map((p) => {
            const isSelected = p.instance_name === phoneName;
            return (
              <button
                key={p.instance_name}
                onClick={() => switchPhone(p.instance_name)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors cursor-pointer",
                  isSelected
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                )}
              >
                <div className="relative">
                  <Smartphone className="size-4" />
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-surface",
                      p.running ? "bg-success" : "bg-muted-foreground"
                    )}
                  />
                </div>
                <span className="flex-1 truncate font-mono text-xs">{p.instance_name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{p.running ? "" : "off"}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 border-t border-border px-3 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground select-none">
          Carpetas
        </div>
        <nav className="space-y-0.5 px-2">
          {ROOT_NAMES.map((r) => {
            const Ico = ROOT_ICON[r];
            const active = pathSegments[0] === r && pathSegments.length === 1;
            return (
              <button
                key={r}
                onClick={() => go([r])}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors cursor-pointer",
                  active
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                )}
              >
                <Ico className="size-4" />
                <span className="flex-1 text-left">{r}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border p-3 select-none">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <HardDrive className="size-3.5" /> /sdcard
            </span>
            <span className="font-mono text-foreground font-medium">
              {currentPhone?.running ? "13 / 32 GB" : "off"}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full transition-all", currentPhone?.running ? "bg-primary" : "bg-muted-foreground/30")}
              style={{ width: currentPhone?.running ? "40%" : "0%" }}
            />
          </div>
        </div>
      </aside>

      {/* SECCIÓN PRINCIPAL: ARCHIVOS */}
      <section
        className="relative flex min-w-0 flex-1 flex-col"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files) upload(e.dataTransfer.files);
        }}
      >
        {/* Barra superior de navegación y búsqueda */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 shrink-0">
          <nav className="flex min-w-0 flex-1 items-center gap-0.5 font-mono text-sm whitespace-nowrap overflow-x-auto scrollbar-none">
            <span className="flex shrink-0 items-center gap-1.5 rounded-sm px-1.5 py-1 text-muted-foreground select-none">
              <Smartphone className="size-3.5" /> {phoneName}
            </span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 px-1 text-muted-foreground select-none">sdcard</span>
            {pathSegments.map((seg, i) => (
              <span key={i} className="flex shrink-0 min-w-0 items-center gap-0.5">
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                <button
                  onClick={() => go(pathSegments.slice(0, i + 1))}
                  className={cn(
                    "truncate rounded-sm px-1.5 py-1 hover:bg-surface-2 cursor-pointer",
                    i === pathSegments.length - 1 ? "text-foreground font-semibold" : "text-muted-foreground"
                  )}
                >
                  {seg}
                </button>
              </span>
            ))}
          </nav>

          <div className="relative w-52 shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!currentPhone?.running}
              placeholder="Filtrar en carpeta…"
              className="h-8 w-full rounded-md border border-input bg-surface pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>

          <div className="flex rounded-md border border-border bg-surface p-0.5 shrink-0">
            {(
              [
                ["list", List],
                ["grid", LayoutGrid],
              ] as const
            ).map(([k, I]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                disabled={!currentPhone?.running}
                title={k === "list" ? "Lista" : "Cuadrícula"}
                className={cn(
                  "grid size-7 place-items-center rounded-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                  view === k ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <I className="size-3.5" />
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setNewFolderName("");
              setMkdirOpen(true);
            }}
            disabled={!currentPhone?.running}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 transition-colors"
          >
            <FolderPlus className="size-3.5 text-muted-foreground" /> Nueva carpeta
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            disabled={!currentPhone?.running}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            <Upload className="size-3.5" /> Subir aquí
          </button>
        </div>

        {/* Notificación de subida en progreso */}
        {uploading.length > 0 && (
          <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2 text-xs">
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span className="flex-1 truncate font-mono">
              Subiendo {uploading.map((u) => u.name).join(", ")} → {fullPath}
            </span>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
              <div className="stripe-progress h-full transition-all" style={{ width: "80%" }} />
            </div>
          </div>
        )}

        {/* Contenido principal: Tabla o Grid */}
        <div className="min-h-0 flex-1 overflow-auto">
          {!currentPhone?.running ? (
            <Empty
              icon={Smartphone}
              title={`${phoneName} está apagado`}
              text="Encendé el CloudPhone para explorar su almacenamiento."
            />
          ) : loading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground gap-2">
              <Loader2 className="size-4 animate-spin text-primary" /> Leyendo directorio {fullPath}...
            </div>
          ) : entries.length === 0 ? (
            <Empty
              icon={FolderOpen}
              title="Carpeta vacía"
              text="Arrastrá archivos desde tu PC o usá «Subir aquí»."
            />
          ) : view === "list" ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background text-left text-[11px] uppercase tracking-wider text-muted-foreground select-none">
                <tr className="border-b border-border">
                  <th className="w-10 py-2.5 pl-4">
                    <Check
                      checked={entries.length > 0 && selected.length === entries.length}
                      onClick={() =>
                        setSelected(selected.length === entries.length ? [] : entries.map((e) => e.name))
                      }
                    />
                  </th>
                  <th className="py-2.5 font-medium">Nombre</th>
                  <th className="w-32 px-4 py-2.5 text-right font-medium">Tamaño</th>
                  <th className="w-44 px-4 py-2.5 font-medium">Modificado</th>
                  <th className="w-28 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const Ico = iconFor(e);
                  const on = selected.includes(e.name);
                  return (
                    <tr
                      key={e.name}
                      onClick={() => toggle(e.name)}
                      onDoubleClick={() => {
                        if (e.type === "directory") {
                          go([...pathSegments, e.name]);
                        } else if (isImg(e.name) || isText(e.name) || isMedia(e.name)) {
                          setPreviewFile(e);
                        }
                      }}
                      className={cn(
                        "group cursor-default border-b border-border/60 transition-colors",
                        on ? "bg-primary/10" : "hover:bg-surface-2/60"
                      )}
                    >
                      <td className="py-2.5 pl-4">
                        <Check checked={on} onClick={() => toggle(e.name)} />
                      </td>
                      <td className="py-2.5">
                        <button
                          onClick={(ev) => {
                            if (e.type === "directory") {
                              ev.stopPropagation();
                              go([...pathSegments, e.name]);
                            }
                          }}
                          className={cn(
                            "flex min-w-0 items-center gap-2.5 text-left cursor-pointer",
                            e.type === "directory" ? "hover:text-primary font-medium" : "text-foreground font-normal"
                          )}
                        >
                          <Ico className={cn("size-4 shrink-0", e.type === "directory" ? "text-primary" : "text-muted-foreground")} />
                          <span className="truncate text-sm">{e.name}</span>
                        </button>
                      </td>
                      <td className="w-32 px-4 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {e.type === "directory" ? "—" : fmtBytes(e.size)}
                      </td>
                      <td className="w-44 px-4 py-2.5 font-mono text-xs text-muted-foreground">{formatDate(e.mtime)}</td>
                      <td className="w-28 px-4 py-2.5" onClick={(ev) => ev.stopPropagation()}>
                        {rowActions(e)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 p-4">
              {entries.map((e) => {
                const Ico = iconFor(e);
                const on = selected.includes(e.name);
                const isImage = isImg(e.name);
                const fileUrl = api.getFileViewUrl(phoneName, `${fullPath}/${e.name}`);

                return (
                  <div
                    key={e.name}
                    onClick={() => toggle(e.name)}
                    onDoubleClick={() => {
                      if (e.type === "directory") {
                        go([...pathSegments, e.name]);
                      } else if (isImg(e.name) || isText(e.name) || isMedia(e.name)) {
                        setPreviewFile(e);
                      }
                    }}
                    className={cn(
                      "group relative overflow-hidden rounded-md border bg-card transition-colors cursor-pointer select-none",
                      on ? "border-primary glow-primary" : "border-border hover:border-muted-foreground/40"
                    )}
                  >
                    <div className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden bg-surface-2">
                      {isImage && currentPhone?.running ? (
                        <img
                          src={fileUrl}
                          alt={e.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          onError={(ev) => {
                            ev.currentTarget.style.display = "none";
                          }}
                        />
                      ) : null}
                      {(!isImage || !currentPhone?.running) && (
                        <Ico
                          className={cn(
                            "size-8",
                            e.type === "directory" ? "text-primary" : "text-muted-foreground"
                          )}
                        />
                      )}
                      {isImage && (
                        <button
                          type="button"
                          title="Previsualizar imagen"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setPreviewFile(e);
                          }}
                          className="absolute right-1.5 bottom-1.5 grid size-6 place-items-center rounded bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80 cursor-pointer"
                        >
                          <Maximize2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="border-t border-border px-2 py-1.5">
                      <div className="truncate text-xs font-medium" title={e.name}>
                        {e.name}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {e.type === "directory" ? "Carpeta" : fmtBytes(e.size)}
                      </div>
                    </div>
                    <div className="absolute left-1.5 top-1.5 z-10">
                      <Check checked={on} onClick={() => toggle(e.name)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* BARRA FLOTANTE DE ACCIONES MASIVAS */}
        {selected.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-border bg-popover p-1 shadow-pop animate-in slide-in-from-bottom-2 fade-in">
              <span className="px-3 font-mono text-xs text-foreground select-none">
                {selected.length} seleccionado(s)
              </span>
              <div className="h-5 w-px bg-border" />
              <button
                type="button"
                onClick={() => download(selFiles)}
                disabled={!selFiles.some((f) => f.type === "file")}
                className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="size-3.5" /> Descargar
              </button>
              <button
                type="button"
                onClick={() => setSendOpen(true)}
                disabled={!selFiles.some((f) => f.type === "file")}
                className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="size-3.5" /> Enviar a…
              </button>
              <button
                type="button"
                onClick={() => setDelOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15 cursor-pointer"
              >
                <Trash2 className="size-3.5" /> Eliminar
              </button>
              <IconBtn
                icon={X}
                label="Deseleccionar"
                size="sm"
                onClick={() => setSelected([])}
              />
            </div>
          </div>
        )}

        {/* Footer de información */}
        <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border px-4 font-mono text-[11px] text-muted-foreground select-none whitespace-nowrap overflow-hidden">
          <span className="truncate">{fullPath}</span>
          <span className="shrink-0">{entries.length} elemento{entries.length === 1 ? "" : "s"}</span>
          <span className="ml-auto shrink-0 text-muted-foreground/75">
            {currentPhone?.running ? "Doble clic abre carpetas · arrastrá archivos para subir" : "CloudPhone desconectado"}
          </span>
        </footer>

        {/* OVERLAY DE ARRASTRE */}
        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-background/85 backdrop-blur-sm">
            <div className="text-center">
              <Upload className="mx-auto size-10 text-primary" />
              <p className="mt-3 text-lg font-semibold">Soltar en {phoneName}</p>
              <p className="font-mono text-xs text-muted-foreground">{fullPath}</p>
            </div>
          </div>
        )}
      </section>

      {/* DIÁLOGO ENVIAR A OTRO TELÉFONO */}
      <Dialog
        open={sendOpen}
        onOpenChange={(o) => {
          setSendOpen(o);
          if (!o) setSendTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar a otro teléfono</DialogTitle>
            <DialogDescription>
              {selFiles.filter((f) => f.type === "file").length} archivo(s) se copiarán a la misma ruta{" "}
              <span className="font-mono text-foreground">{fullPath}</span> del destino. Los nombres repetidos reciben
              sufijo numérico (_1) automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-auto">
            {instances
              .filter((p) => p.instance_name !== phoneName)
              .map((p) => (
                <button
                  key={p.instance_name}
                  disabled={!p.running}
                  onClick={() => setSendTarget(p.instance_name)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm cursor-pointer transition-colors",
                    !p.running && "cursor-not-allowed opacity-40",
                    sendTarget === p.instance_name
                      ? "border-primary bg-primary/10 glow-primary font-medium"
                      : "border-border hover:border-muted-foreground/40 bg-card"
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      p.running ? "bg-success" : "bg-muted-foreground"
                    )}
                  />
                  <span className="font-mono text-xs truncate">{p.instance_name}</span>
                </button>
              ))}
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setSendOpen(false)}
              className="h-9 rounded-md border border-border px-4 text-sm hover:bg-surface-2 cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={doSend}
              disabled={!sendTarget}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40 cursor-pointer transition-opacity"
            >
              <Send className="size-3.5" /> Enviar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO CONFIRMAR BORRADO */}
      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {selected.length} elemento(s) de {phoneName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs whitespace-pre-wrap">
              {selected.slice(0, 5).map((s) => `${fullPath}/${s}`).join("\n")}
              {selected.length > 5 && `\n…y ${selected.length - 5} más`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={doDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MODAL DE PREVISUALIZACIÓN DE ARCHIVO (LIGHTBOX / QUICK LOOK) */}
      <FilePreviewModal
        file={previewFile}
        phoneName={phoneName}
        fullPath={fullPath}
        onClose={() => setPreviewFile(null)}
        onDownload={(f) => download([f])}
      />

      {/* DIÁLOGO CREAR NUEVA CARPETA */}
      <Dialog open={mkdirOpen} onOpenChange={setMkdirOpen}>
        <DialogContent className="max-w-sm bg-card border-border p-4">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-foreground">Crear nueva carpeta</DialogTitle>
            <DialogDescription className="font-mono text-xs text-muted-foreground mt-1">
              Se creará en <span className="text-foreground">{fullPath}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3">
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nombre de la carpeta…"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolderName.trim() && !creatingFolder) {
                  doCreateFolder();
                }
              }}
              className="h-8 w-full rounded-md border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setMkdirOpen(false);
                setNewFolderName("");
              }}
              className="h-8 rounded-md border border-border px-3 text-xs hover:bg-surface-2 cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={doCreateFolder}
              disabled={!newFolderName.trim() || creatingFolder}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-40 cursor-pointer transition-opacity"
            >
              {creatingFolder && <Loader2 className="size-3 animate-spin" />} Crear
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
