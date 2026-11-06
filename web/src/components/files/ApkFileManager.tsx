import { useState, useEffect } from "react";
import { Package, FolderOpen } from "lucide-react";
import type { Instance } from "../../types";
import { cn } from "../../lib/utils";
import { ApkRepository } from "./ApkRepository";
import { FileExplorer } from "./FileExplorer";

export type ApkManagerTab = "apks" | "files";

interface ApkFileManagerProps {
  instances: Instance[];
  preselectedInstance?: string;
  initialTab?: ApkManagerTab;
  onRefreshInstances?: () => void;
}

export default function ApkFileManager({
  instances,
  preselectedInstance,
  initialTab = "apks",
  onRefreshInstances,
}: ApkFileManagerProps) {
  const [tab, setTab] = useState<ApkManagerTab>(initialTab);

  useEffect(() => {
    if (preselectedInstance) {
      setTab("files");
    }
  }, [preselectedInstance]);

  const onlineCount = instances.filter((p) => p.running).length;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background overflow-hidden">
      {/* CABECERA PRINCIPAL ESTILO LOVABLE */}
      <header className="flex h-[55px] items-center gap-4 border-b border-border px-4 py-2.5 shrink-0 bg-background select-none">
        <h1 className="flex items-center gap-2 font-mono text-base font-semibold text-foreground">
          <Package className="size-4 text-primary" /> APKs y Archivos
        </h1>

        <div className="flex rounded-md border border-border bg-surface p-0.5 text-sm">
          {(
            [
              ["apks", "Repositorio APKs", Package],
              ["files", "Archivos", FolderOpen],
            ] as const
          ).map(([k, label, IconComponent]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-3 py-1 transition-colors cursor-pointer text-sm font-medium",
                tab === k
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <IconComponent className="size-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" /> {onlineCount}/{instances.length} online
        </div>
      </header>

      {/* VISTA ACTIVA: REPOSITORIO APKS O EXPLORADOR DE ARCHIVOS */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {tab === "apks" ? (
          <ApkRepository instances={instances} onRefreshInstances={onRefreshInstances} />
        ) : (
          <FileExplorer instances={instances} preselectedInstance={preselectedInstance} />
        )}
      </div>
    </div>
  );
}
