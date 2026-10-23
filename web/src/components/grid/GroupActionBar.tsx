import { Loader2, MousePointerClick, Power, PowerOff, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';

interface GroupActionBarProps {
  count: number;
  selectedNames: string[];
  groupMode: boolean;
  onToggleGroupMode: () => void;
  onClear: () => void;
  onAction: (action: 'start' | 'stop' | 'restart') => Promise<void>;
}

export default function GroupActionBar({
  count,
  selectedNames,
  groupMode,
  onToggleGroupMode,
  onClear,
  onAction,
}: GroupActionBarProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const run = async (action: 'start' | 'stop' | 'restart') => {
    setBusy(action);
    setFeedback(null);
    try {
      await onAction(action);
      setFeedback(`Acción "${action}" enviada a ${selectedNames.length} dispositivos`);
      setTimeout(() => setFeedback(null), 3000);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Error en la acción de grupo');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto relative flex items-center gap-2 rounded-2xl border border-zinc-700/80 bg-zinc-900/95 px-3 py-2 shadow-2xl shadow-black/60 backdrop-blur">
        <div className="mr-1 flex items-center gap-2 border-r border-zinc-700/70 pr-3">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white">
            {count}
          </span>
          <span className="text-[11px] font-medium text-zinc-300">seleccionados</span>
        </div>

        <button
          onClick={() => void run('start')}
          disabled={busy !== null}
          title="Encender seleccionados"
          className="flex items-center gap-1.5 rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-2.5 py-1.5 text-[11px] font-medium text-emerald-400 transition-colors hover:border-emerald-800 hover:text-emerald-300 disabled:opacity-40"
        >
          {busy === 'start' ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
          Encender
        </button>

        <button
          onClick={() => void run('stop')}
          disabled={busy !== null}
          title="Apagar seleccionados"
          className="flex items-center gap-1.5 rounded-lg border border-red-900/60 bg-red-950/40 px-2.5 py-1.5 text-[11px] font-medium text-red-400 transition-colors hover:border-red-800 hover:text-red-300 disabled:opacity-40"
        >
          {busy === 'stop' ? <Loader2 size={13} className="animate-spin" /> : <PowerOff size={13} />}
          Apagar
        </button>

        <button
          onClick={() => void run('restart')}
          disabled={busy !== null}
          title="Reiniciar seleccionados"
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-40"
        >
          {busy === 'restart' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
          Reiniciar
        </button>

        <button
          onClick={onToggleGroupMode}
          title="Sincronizar toques entre los dispositivos seleccionados"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
            groupMode
              ? 'border-violet-500/60 bg-violet-500/20 text-violet-300'
              : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white'
          }`}
        >
          <MousePointerClick size={13} />
          Modo Grupo
          <span
            className={`ml-0.5 h-3.5 w-6 rounded-full p-0.5 transition-colors ${
              groupMode ? 'bg-violet-500' : 'bg-zinc-600'
            }`}
          >
            <span
              className={`block h-2.5 w-2.5 rounded-full bg-white transition-transform ${
                groupMode ? 'translate-x-2.5' : ''
              }`}
            />
          </span>
        </button>

        <button
          onClick={onClear}
          title="Limpiar selección"
          className="ml-1 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <X size={14} />
        </button>

        {feedback && (
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1 text-[10px] text-zinc-300 shadow-lg">
            {feedback}
          </div>
        )}
      </div>
    </div>
  );
}
