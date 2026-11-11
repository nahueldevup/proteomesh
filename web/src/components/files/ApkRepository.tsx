import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Upload,
  Trash2,
  Package,
  Layers,
  Check,
  X,
  Loader2,
  AlertTriangle,
  Star,
  Cpu,
  Hash,
  Smartphone,
  ChevronDown,
  Rocket,
  CircleSlash,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "../ui/switch";
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
import type { Instance, ApkEntry } from "../../types";
import { api } from "../../lib/api";
import { useApkCatalog, useInstalledApks, queryKeys } from "../../lib/queries";
import { cn, getErrorMessage } from "../../lib/utils";

type Filter = "all" | "default" | "bundle" | "apk";
type JobState = "queued" | "running" | "ok" | "skip" | "fail";
type UploadState = { id: string; name: string; progress: number; stage: string };

const hue = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

export function AppIcon({ apk, size = 36 }: { apk: { name: string; pkg: string }; size?: number }) {
  const label = (apk.name || apk.pkg || "AP").slice(0, 2).toUpperCase();
  return (
    <div
      className="grid shrink-0 place-items-center rounded-md font-mono text-sm font-semibold text-foreground select-none"
      style={{ width: size, height: size, background: `oklch(0.38 0.09 ${hue(apk.pkg || apk.name)})` }}
    >
      {label}
    </div>
  );
}

function isArmSplit(s: string) {
  return /arm|armeabi/.test(s) || (/x86\./.test(s) && !/x86_64/.test(s));
}

function deriveDisplayName(originalName: string, pkg: string): string {
  if (pkg.includes("facebook.katana")) return "Facebook";
  if (pkg.includes("devcheck")) return "DevCheck";
  if (pkg.includes("deviceinfohw")) return "Device Info HW";
  if (pkg.includes("iglite")) return "PUBG Lite";
  if (pkg.includes("aurora.store")) return "Aurora Store";
  if (pkg.includes("fakewifi")) return "FakeWifi";

  const base = originalName.replace(/\.[^.]+$/, "");
  const parts = base.split(/[_.-]/).filter(Boolean);
  const candidate = parts[0]?.replace(/^\w/, (c) => c.toUpperCase());
  if (candidate && candidate.length > 2 && !/^\d+$/.test(candidate)) return candidate;
  const pkgParts = pkg.split(".");
  return (pkgParts[pkgParts.length - 1] || base).replace(/^\w/, (c) => c.toUpperCase());
}

interface ApkRepositoryProps {
  instances: Instance[];
  onRefreshInstances?: () => void;
}

export function ApkRepository({ instances, onRefreshInstances }: ApkRepositoryProps) {
  const queryClient = useQueryClient();
  const { data: apks = [], isLoading: loading } = useApkCatalog();
  const { data: installedMap = {} } = useInstalledApks();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobState>>({});
  const [installing, setInstalling] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragging, setDragging] = useState(false);
  const [toDelete, setToDelete] = useState<ApkEntry | null>(null);
  const [showSplits, setShowSplits] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    return apks.filter((a) => {
      const q = query.toLowerCase();
      const displayName = deriveDisplayName(a.original_name, a.package).toLowerCase();
      const okQ = !q || displayName.includes(q) || a.package.toLowerCase().includes(q) || a.original_name.toLowerCase().includes(q);
      const isBundle = a.entry_type === "bundle";
      const okF =
        filter === "all" ||
        (filter === "default" && a.is_default) ||
        (filter === "bundle" && isBundle) ||
        (filter === "apk" && !isBundle);
      return okQ && okF;
    });
  }, [apks, query, filter]);

  const effectiveSelectedId =
    selectedId !== null && apks.some((a) => a.id === selectedId)
      ? selectedId
      : (apks[0]?.id ?? null);
  const sel = apks.find((a) => a.id === effectiveSelectedId) ?? null;
  const onlineInstances = instances.filter((p) => p.running);
  const totalSizeBytes = apks.reduce((s, a) => s + (a.size || 0), 0);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(1);

  const selectApk = (id: number) => {
    setSelectedId(id);
    setTargets([]);
    setJobs({});
    setShowSplits(false);
  };

  const toggleDefault = async (id: number) => {
    const targetApk = apks.find((x) => x.id === id);
    if (!targetApk) return;
    const willBeDefault = !targetApk.is_default;

    // Optimistic UI update
    await queryClient.cancelQueries({ queryKey: queryKeys.apks });
    const previousApks = queryClient.getQueryData<ApkEntry[]>(queryKeys.apks);

    queryClient.setQueryData<ApkEntry[]>(queryKeys.apks, (old) =>
      (old || []).map((a) => (a.id === id ? { ...a, is_default: willBeDefault } : a))
    );

    try {
      const currentDefaults = apks
        .map((a) => (a.id === id ? { ...a, is_default: willBeDefault } : a))
        .filter((a) => a.is_default)
        .map((a) => a.id);
      await api.setDefaultApks(currentDefaults);
      toast.success(
        willBeDefault
          ? `${deriveDisplayName(targetApk.original_name, targetApk.package)} se instalará en cada CloudPhone nuevo`
          : `${deriveDisplayName(targetApk.original_name, targetApk.package)} ya no se autoinstala`
      );
    } catch (err) {
      if (previousApks) {
        queryClient.setQueryData(queryKeys.apks, previousApks);
      }
      toast.error(`Error al actualizar default: ${getErrorMessage(err)}`);
    } finally {
      queryClient.invalidateQueries({ queryKey: queryKeys.apks });
    }
  };

  const startUpload = async (files: FileList | File[]) => {
    const ALLOWED_EXTS = [".apk", ".apkm", ".xapk", ".apks", ".zip"];
    const arr = Array.from(files);

    for (const file of arr) {
      const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
      if (!ALLOWED_EXTS.includes(ext)) {
        toast.error(`${file.name}: formato no soportado (.apk, .apkm, .xapk, .apks, .zip)`);
        continue;
      }

      const uploadId = crypto.randomUUID();
      setUploads((u) => [...u, { id: uploadId, name: file.name, progress: 0, stage: "Subiendo" }]);

      try {
        const res = await api.uploadApk(file, (percent) => {
          const stage =
            percent < 70
              ? "Subiendo"
              : percent < 90
              ? "Validando bundle y descompresión"
              : "Extrayendo metadatos (aapt2)";
          setUploads((u) =>
            u.map((x) => (x.id === uploadId ? { ...x, progress: Math.min(percent, 100), stage } : x))
          );
        });

        if (res.warning) {
          toast.warning(res.warning);
        }
        toast.success(`${res.entry_type === "bundle" ? "Bundle" : "APK"} "${file.name}" agregado al repositorio`);
        await queryClient.invalidateQueries({ queryKey: queryKeys.apks });
        if (res.id) selectApk(res.id);
      } catch (err) {
        const errMsg = getErrorMessage(err);
        if (errMsg.includes("413") || errMsg.toLowerCase().includes("límite")) {
          toast.error("El archivo supera el límite máximo de 300 MB");
        } else {
          toast.error(`Error al subir ${file.name}: ${errMsg}`);
        }
      } finally {
        setUploads((u) => u.filter((x) => x.id !== uploadId));
        if (fileRef.current) fileRef.current.value = "";
      }
    }
  };

  const install = async () => {
    if (!sel || !targets.length) return;
    setInstalling(true);

    const currentInstalled = installedMap[sel.package] || [];
    const init: Record<string, JobState> = {};
    targets.forEach((t) => (init[t] = currentInstalled.includes(t) ? "skip" : "queued"));
    setJobs(init);

    try {
      targets.forEach((t) => {
        if (init[t] === "queued") {
          setJobs((j) => ({ ...j, [t]: "running" }));
        }
      });

      const results = await api.installApks(sel.id, targets);
      const newJobs: Record<string, JobState> = { ...init };
      const newlyInstalled: string[] = [];

      results.forEach((r) => {
        if (r.ok && r.status === "ok") {
          newJobs[r.instance] = "ok";
          newlyInstalled.push(r.instance);
        } else if (r.status === "skipped") {
          newJobs[r.instance] = "skip";
        } else {
          newJobs[r.instance] = "fail";
        }
      });

      setJobs(newJobs);
      queryClient.setQueryData<Record<string, string[]>>(queryKeys.installedApks, (prev = {}) => ({
        ...prev,
        [sel.package]: [...new Set([...(prev[sel.package] || []), ...newlyInstalled])],
      }));
      queryClient.invalidateQueries({ queryKey: queryKeys.installedApks });

      const okCount = results.filter((r) => r.ok && r.status === "ok").length;
      const skipCount = results.filter((r) => r.status === "skipped").length;
      const failCount = results.filter((r) => !r.ok && r.status === "failed").length;

      (failCount ? toast.warning : toast.success)(
        `${deriveDisplayName(sel.original_name, sel.package)}: ${okCount} ok · ${skipCount} omitidas · ${failCount} fallos`
      );
      onRefreshInstances?.();
    } catch (err) {
      toast.error(`Error en instalación: ${getErrorMessage(err)}`);
    } finally {
      setInstalling(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const deletedId = toDelete.id;
    try {
      await api.deleteApk(deletedId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.apks });
      if (selectedId === deletedId) setSelectedId(null);
      toast.success(`${deriveDisplayName(toDelete.original_name, toDelete.package)} eliminada`);
    } catch (err) {
      toast.error(`Error al eliminar: ${getErrorMessage(err)}`);
    } finally {
      setToDelete(null);
    }
  };

  // Metadatos derivados del APK seleccionado
  const selDisplayName = sel ? deriveDisplayName(sel.original_name, sel.package) : "";
  const selSizeMB = sel ? (sel.size / (1024 * 1024)).toFixed(1) : "0";
  const selSplits = sel?.splits_info?.splits?.map((s) => s.file) || (sel?.entry_type === "bundle" ? ["base.apk"] : undefined);
  const selAbi = sel?.splits_info?.splits?.find((s) => s.abi)?.abi || (sel?.entry_type === "bundle" ? "x86_64" : "universal");
  const selDate = sel ? sel.created_at.slice(0, 10) : "";
  const selShaShort = sel ? sel.sha256.slice(0, 16) : "";
  const selInstalledList = sel ? installedMap[sel.package] || [] : [];

  return (
    <div
      className="relative flex min-h-0 flex-1 overflow-hidden"
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
        if (e.dataTransfer.files) startUpload(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept=".apk,.apkm,.xapk,.apks,.zip"
        onChange={(e) => e.target.files && startUpload(e.target.files)}
      />

      {/* LISTA CENTRAL DE APKS */}
      <section className="flex min-w-0 flex-1 flex-col border-r border-border">
        {/* Barra superior de búsqueda y filtros */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o package…"
              className="h-8 w-full rounded-md border border-input bg-surface pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
          <div className="flex rounded-md border border-border bg-surface p-0.5 text-xs">
            {(
              [
                ["all", "Todas"],
                ["default", "Default"],
                ["bundle", "Bundles"],
                ["apk", "APK"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn(
                  "rounded-sm px-2.5 py-1 transition-colors cursor-pointer",
                  filter === k ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 cursor-pointer"
          >
            <Upload className="size-3.5" /> Subir APK
          </button>
        </div>

        {/* Tiras de progreso en streaming */}
        {uploads.length > 0 && (
          <div className="space-y-1.5 border-b border-border bg-surface px-4 py-2">
            {uploads.map((u) => (
              <div key={u.id} className="flex items-center gap-3 text-xs">
                <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                <span className="min-w-0 flex-1 truncate font-mono">{u.name}</span>
                <span className="w-44 shrink-0 text-right text-muted-foreground">{u.stage}</span>
                <div className="h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-muted">
                  <div className="stripe-progress h-full transition-all" style={{ width: `${u.progress}%` }} />
                </div>
                <span className="w-9 shrink-0 text-right font-mono tabular-nums">{Math.round(u.progress)}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Tabla principal */}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-auto" />
              <col className="w-[139px]" />
              <col className="w-[167px]" />
              <col className="w-[94px]" />
              <col className="w-[131px]" />
              <col className="w-[104px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-background text-left text-[11px] uppercase tracking-wider text-muted-foreground select-none">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Aplicación</th>
                <th className="px-2 py-2 font-medium">Versión</th>
                <th className="px-2 py-2 font-medium">Tipo</th>
                <th className="px-2 py-2 text-right font-medium">Tamaño</th>
                <th className="px-2 py-2 font-medium">Instalada</th>
                <th className="px-4 py-2 text-center font-medium" title="Autoinstalar en CloudPhones nuevos">
                  Default
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const active = a.id === effectiveSelectedId;
                const displayName = deriveDisplayName(a.original_name, a.package);
                const sizeMB = (a.size / (1024 * 1024)).toFixed(1);
                const isBundle = a.entry_type === "bundle";
                const splitCount = a.splits_info?.total_splits || (isBundle ? 1 : 0);
                const installedList = installedMap[a.package] || [];

                return (
                  <tr
                    key={a.id}
                    onClick={() => selectApk(a.id)}
                    className={cn(
                      "group cursor-pointer border-b border-border/60 transition-colors",
                      active ? "bg-accent/60" : "hover:bg-surface-2/60"
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <AppIcon apk={{ name: displayName, pkg: a.package }} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{displayName}</div>
                          <div className="truncate font-mono text-xs text-muted-foreground">{a.package}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-xs">
                      <div>{a.version_name || "1.0.0"}</div>
                      <div className="text-muted-foreground">#{a.version_code || "1"}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {!isBundle ? (
                          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            APK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                            <Layers className="size-3" /> .{a.bundle_format || "zip"} · {splitCount}
                          </span>
                        )}
                        {a.has_obb && (
                          <span
                            className="rounded-sm bg-warning/15 px-1.5 py-0.5 font-mono text-[10px] text-warning"
                            title="El paquete contenía OBB que no se instalarán"
                          >
                            OBB
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums">{sizeMB} MB</td>
                    <td className="px-2 py-2.5" aria-label={`Instalada en ${installedList.length} de ${instances.length} instancias`}>
                      <div
                        className="flex items-center gap-2"
                        title={
                          installedList.length > 0
                            ? `Instalada en (${installedList.length}/${instances.length}): ${installedList.join(", ")}`
                            : "No instalada en ninguna instancia activa"
                        }
                      >
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted shrink-0">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-300",
                              installedList.length > 0 ? "bg-success" : "bg-transparent"
                            )}
                            style={{
                              width: instances.length
                                ? `${Math.min(100, Math.round((installedList.length / instances.length) * 100))}%`
                                : "0%",
                            }}
                          />
                        </div>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums select-none shrink-0">
                          {installedList.length}/{instances.length}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={a.is_default}
                        onCheckedChange={() => toggleDefault(a.id)}
                        className="data-[state=checked]:bg-success"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {visible.length === 0 && !loading && (
            <div className="grid place-items-center py-20 text-center text-sm text-muted-foreground">
              <Package className="mb-2 size-8 opacity-40" />
              Ninguna app coincide con la búsqueda.
            </div>
          )}

          {loading && visible.length === 0 && (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground gap-2">
              <Loader2 className="size-4 animate-spin text-primary" /> Cargando catálogo de APKs...
            </div>
          )}

          <button
            onClick={() => fileRef.current?.click()}
            className="mx-4 my-4 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-md border border-dashed border-border py-4 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary cursor-pointer"
          >
            <Upload className="size-3.5" /> Soltá archivos en cualquier parte · .apk .apkm .xapk .apks .zip · máx. 300 MB
          </button>
        </div>

        {/* Footer métricas */}
        <footer className="flex items-center gap-4 border-t border-border px-4 py-1.5 font-mono text-[11px] text-muted-foreground select-none">
          <span>{apks.length} apps</span>
          <span>{apks.filter((a) => a.is_default).length} default</span>
          <span>{totalSizeMB} MB en apk_repo/</span>
        </footer>
      </section>

      {/* ASIDE INSPECTOR / DESPLIEGUE */}
      <aside className="flex w-[380px] shrink-0 flex-col bg-surface">
        {sel ? (
          <>
            <div className="border-b border-border p-4">
              <div className="flex items-start gap-3">
                <AppIcon apk={{ name: selDisplayName, pkg: sel.package }} size={48} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold">{selDisplayName}</h2>
                  <p className="truncate font-mono text-xs text-muted-foreground">{sel.package}</p>
                  <p className="mt-0.5 font-mono text-xs">
                    v{sel.version_name || "1.0.0"} <span className="text-muted-foreground">({sel.version_code || "1"})</span>
                  </p>
                </div>
                <button
                  onClick={() => setToDelete(sel)}
                  title="Eliminar del repositorio"
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive cursor-pointer transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
                {[
                  ["Tamaño", `${selSizeMB} MB`],
                  ["ABI", selAbi],
                  ["Alta", selDate || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="bg-card px-2.5 py-2">
                    <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
                    <dd className="mt-0.5 truncate font-mono">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-2 flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground" title={sel.original_name}>
                <Hash className="size-3 shrink-0" /> {selShaShort}… · <span className="truncate">{sel.original_name}</span>
              </div>

              {sel.has_obb && (
                <div className="mt-3 flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Este paquete incluía datos OBB que no se copian al instalar.
                </div>
              )}

              <label htmlFor="apk-autoinstall-default" className="mt-3 flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-2.5">
                <Star className={cn("size-4", sel.is_default ? "text-success" : "text-muted-foreground")} />
                <div className="flex-1">
                  <div className="text-sm font-medium">Autoinstalar por defecto</div>
                  <div className="text-xs text-muted-foreground">Se instala una vez en cada CloudPhone nuevo</div>
                </div>
                <Switch
                  id="apk-autoinstall-default"
                  aria-label="Autoinstalar por defecto"
                  checked={sel.is_default}
                  onCheckedChange={() => toggleDefault(sel.id)}
                  className="data-[state=checked]:bg-success"
                />
              </label>

              {selSplits && selSplits.length > 0 && (
                <div className="mt-3 rounded-md border border-border bg-card">
                  <button
                    onClick={() => setShowSplits((s) => !s)}
                    className="flex w-full items-center gap-2 px-2.5 py-2 text-xs cursor-pointer"
                  >
                    <Cpu className="size-3.5 text-primary" />
                    <span className="flex-1 text-left">
                      {selSplits.length} splits · se instalan {selSplits.filter((s) => !isArmSplit(s)).length} ({selAbi})
                    </span>
                    <ChevronDown className={cn("size-3.5 transition-transform", showSplits && "rotate-180")} />
                  </button>
                  {showSplits && (
                    <ul className="max-h-36 space-y-0.5 overflow-auto border-t border-border px-2.5 py-2 font-mono text-[11px]">
                      {selSplits.map((s) => (
                        <li key={s} className={cn("flex items-center gap-1.5", isArmSplit(s) ? "text-muted-foreground line-through" : "")}>
                          {isArmSplit(s) ? <CircleSlash className="size-3" /> : <Check className="size-3 text-success" />} {s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* SECCIÓN DE DESPLIEGUE INSTALAR EN */}
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Instalar en</h3>
                <div className="flex gap-2 text-xs">
                  <button
                    className="text-primary hover:underline cursor-pointer"
                    disabled={installing}
                    onClick={() => setTargets(onlineInstances.filter((p) => !selInstalledList.includes(p.instance_name)).map((p) => p.instance_name))}
                  >
                    Faltantes
                  </button>
                  <button
                    className="text-primary hover:underline cursor-pointer"
                    disabled={installing}
                    onClick={() => setTargets(onlineInstances.map((p) => p.instance_name))}
                  >
                    Todas
                  </button>
                  <button
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                    disabled={installing}
                    onClick={() => {
                      setTargets([]);
                      setJobs({});
                    }}
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              <div className="grid min-h-0 grid-cols-2 gap-1.5 overflow-auto">
                {instances.map((p) => {
                  const on = targets.includes(p.instance_name);
                  const has = selInstalledList.includes(p.instance_name);
                  const job = jobs[p.instance_name];
                  return (
                    <button
                      key={p.instance_name}
                      disabled={!p.running || installing}
                      onClick={() =>
                        setTargets((t) => (on ? t.filter((x) => x !== p.instance_name) : [...t, p.instance_name]))
                      }
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-all cursor-pointer",
                        !p.running && "cursor-not-allowed opacity-50 bg-card/60",
                        on ? "border-primary bg-primary/10 glow-primary font-medium" : "border-border bg-card hover:border-muted-foreground/40"
                      )}
                    >
                      <Smartphone className="size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono">{p.instance_name}</div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className={cn("size-1.5 rounded-full", !p.running ? "bg-muted-foreground" : "bg-success")} />
                          {!p.running ? (
                            "apagado"
                          ) : job === "running" ? (
                            "instalando…"
                          ) : job === "ok" ? (
                            "instalada"
                          ) : job === "fail" ? (
                            "falló"
                          ) : job === "skip" ? (
                            "ya estaba"
                          ) : has ? (
                            <span className="text-success font-medium">ya instalada</span>
                          ) : (
                            "lista"
                          )}
                        </div>
                      </div>
                      {job === "running" ? (
                        <Loader2 className="size-3.5 animate-spin text-primary" />
                      ) : job === "ok" ? (
                        <Check className="size-3.5 text-success" />
                      ) : job === "fail" ? (
                        <X className="size-3.5 text-destructive" />
                      ) : has ? (
                        <Check className="size-3.5 text-success/60" />
                      ) : on ? (
                        <span className="size-3.5 rounded-sm bg-primary" />
                      ) : (
                        <span className="size-3.5 rounded-sm border border-border" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-auto pt-4">
                <button
                  onClick={install}
                  disabled={!targets.length || installing}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  {installing ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
                  {installing
                    ? "Instalando (2 en paralelo)…"
                    : targets.length
                    ? `Instalar en ${targets.length} teléfono${targets.length > 1 ? "s" : ""}`
                    : "Elegí teléfonos destino"}
                </button>
                <p className="mt-2 text-center text-[11px] text-muted-foreground font-mono">
                  {sel.entry_type === "bundle" ? `adb install-multiple · solo splits ${selAbi}` : "adb install -r"}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground">Seleccioná una app</div>
        )}
      </aside>

      {/* OVERLAY DE ARRASTRE */}
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-background/85 backdrop-blur-sm">
          <div className="text-center">
            <Upload className="mx-auto size-10 text-primary" />
            <p className="mt-3 text-lg font-semibold">Soltá para agregar al repositorio</p>
            <p className="font-mono text-xs text-muted-foreground">.apk · .apkm · .xapk · .apks · .zip — hasta 300 MB</p>
          </div>
        </div>
      )}

      {/* DIÁLOGO MODAL CONFIRMAR ELIMINACIÓN */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {toDelete ? deriveDisplayName(toDelete.original_name, toDelete.package) : "APK"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se borra el registro y el archivo de apk_repo/. Las instancias donde ya está instalada no se ven afectadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
