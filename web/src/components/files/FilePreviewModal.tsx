import { useQuery } from '@tanstack/react-query';
import { Loader2, Download, Music } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { api } from '../../lib/api';
import type { FileEntry } from '../../types';

interface FilePreviewModalProps {
  file: FileEntry | null;
  phoneName: string;
  fullPath: string;
  onClose: () => void;
  onDownload: (file: FileEntry) => void;
}

const isImg = (n: string) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(n);
const isText = (n: string) => /\.(txt|json|xml|log|vcf|csv|md|ini|conf|prop|sh|yaml|yml)$/i.test(n);
const isMedia = (n: string) => /\.(mp4|webm|mkv|mov|mp3|wav|ogg|m4a|opus)$/i.test(n);

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

function formatDate(ts: number): string {
  try {
    const d = new Date(ts * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  } catch {
    return '—';
  }
}

export function FilePreviewModal({
  file,
  phoneName,
  fullPath,
  onClose,
  onDownload,
}: FilePreviewModalProps) {
  const isTextFile = Boolean(file && isText(file.name));
  const filePath = file ? `${fullPath}/${file.name}` : '';

  const {
    data: previewContent,
    isLoading: loadingPreview,
    error: previewError,
  } = useQuery({
    queryKey: ['file-preview', phoneName, filePath],
    queryFn: async () => {
      const res = await fetch(api.getFileViewUrl(phoneName, filePath));
      if (!res.ok) throw new Error('Error al leer el archivo desde el dispositivo');
      return res.text();
    },
    enabled: Boolean(file && isTextFile && phoneName),
    staleTime: 30_000,
  });

  return (
    <Dialog
      open={!!file}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl bg-card border-border p-4">
        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-border">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold text-foreground">
              {file?.name}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs text-muted-foreground mt-0.5">
              {file
                ? `${fmtBytes(file.size)} · ${formatDate(file.mtime)} · ${fullPath}/${file.name}`
                : ''}
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="mt-3 flex max-h-[70vh] items-center justify-center overflow-hidden rounded bg-black/40 p-2">
          {file && isImg(file.name) ? (
            <img
              src={api.getFileViewUrl(phoneName, `${fullPath}/${file.name}`)}
              alt={file.name}
              className="max-h-[65vh] max-w-full rounded object-contain select-none"
            />
          ) : file && isText(file.name) ? (
            loadingPreview ? (
              <div className="flex items-center gap-2 py-12 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" /> Leyendo archivo...
              </div>
            ) : previewError ? (
              <div className="py-12 text-xs text-danger">
                Error al leer el archivo desde el dispositivo
              </div>
            ) : (
              <pre className="max-h-[65vh] w-full overflow-auto rounded bg-surface p-3 font-mono text-xs text-foreground/90 whitespace-pre-wrap select-text border border-border">
                <code>{previewContent}</code>
              </pre>
            )
          ) : file && isMedia(file.name) ? (
            /\.(mp4|webm|mkv|mov)$/i.test(file.name) ? (
              <video
                controls
                className="max-h-[65vh] max-w-full rounded"
                src={api.getFileViewUrl(phoneName, `${fullPath}/${file.name}`)}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 p-6 w-full">
                <Music className="size-12 text-primary/60" />
                <audio
                  controls
                  className="w-full max-w-md"
                  src={api.getFileViewUrl(phoneName, `${fullPath}/${file.name}`)}
                />
              </div>
            )
          ) : (
            <div className="py-12 text-xs text-muted-foreground">
              Vista previa no disponible para este formato
            </div>
          )}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (file) onDownload(file);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium hover:bg-surface-2 cursor-pointer transition-colors"
          >
            <Download className="size-3.5" /> Descargar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 cursor-pointer transition-opacity"
          >
            Cerrar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
