import { useState, type ReactNode } from 'react';
import {
  Loader2,
  MonitorPlay,
  Play,
  Power,
  Send,
  Square,
  Type,
  Volume1,
  Volume2,
} from 'lucide-react';
import type { Instance } from '../../types';
import { api } from '../../lib/api';

interface ControlPanelProps {
  instance: Instance;
  onChanged: () => void;
}

function ActionButton({
  onClick,
  disabled,
  title,
  children,
  tone = 'default',
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: ReactNode;
  tone?: 'default' | 'danger' | 'success';
}) {
  const tones = {
    default: 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:text-white',
    danger: 'border-red-900/60 bg-red-950/40 text-red-400 hover:border-red-800 hover:text-red-300',
    success: 'border-emerald-900/60 bg-emerald-950/40 text-emerald-400 hover:border-emerald-800 hover:text-emerald-300',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export default function ControlPanel({ instance, onChanged }: ControlPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setFeedback(null);
    try {
      await fn();
      setFeedback(`${label} enviado`);
      setTimeout(() => setFeedback(null), 2000);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : `Error en ${label}`);
    } finally {
      setBusy(null);
    }
  };

  const name = instance.instance_name;
  const running = instance.running;

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4">
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Controles</h3>
        <p className="mt-1 text-xs text-zinc-400">
          {running ? 'Dispositivo conectado' : 'Dispositivo apagado'}
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <p className="mb-2 text-[11px] font-medium text-zinc-500">Energía</p>
        {running ? (
          <ActionButton title="Apagar" tone="danger" disabled={busy !== null}
            onClick={() => run('Apagado', async () => { await api.stopInstance(name); onChanged(); })}>
            {busy === 'Apagado' ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
            Apagar
          </ActionButton>
        ) : (
          <ActionButton title="Encender" tone="success" disabled={busy !== null}
            onClick={() => run('Encendido', async () => { await api.startInstance(name); onChanged(); })}>
            {busy === 'Encendido' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Encender
          </ActionButton>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <p className="mb-2 text-[11px] font-medium text-zinc-500">Hardware</p>
        <div className="grid grid-cols-3 gap-2">
          <ActionButton title="Power" disabled={!running || busy !== null}
            onClick={() => run('Power', () => api.sendKey(name, 'power'))}>
            <Power size={14} />
          </ActionButton>
          <ActionButton title="Subir volumen" disabled={!running || busy !== null}
            onClick={() => run('Volumen +', () => api.sendKey(name, 'volup'))}>
            <Volume2 size={14} />
          </ActionButton>
          <ActionButton title="Bajar volumen" disabled={!running || busy !== null}
            onClick={() => run('Volumen -', () => api.sendKey(name, 'voldown'))}>
            <Volume1 size={14} />
          </ActionButton>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
          <Type size={12} /> Inyección de texto
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void run('Texto', () => api.sendText(name, text));
            setText('');
          }}
          className="flex gap-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribir en Android..."
            disabled={!running}
            className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-blue-600 focus:outline-none disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={!running || !text.trim()}
            className="rounded-lg border border-zinc-800 bg-zinc-800 px-2 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-40"
          >
            <Send size={13} />
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <p className="mb-2 text-[11px] font-medium text-zinc-500">Abrir URL</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!url.trim()) return;
            void run('URL', () => api.launchUrl(name, url));
          }}
          className="flex gap-2"
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            disabled={!running}
            className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-blue-600 focus:outline-none disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={!running || !url.trim()}
            className="rounded-lg border border-zinc-800 bg-zinc-800 px-2 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-40"
          >
            <Send size={13} />
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <p className="mb-2 text-[11px] font-medium text-zinc-500">Ventana nativa</p>
        <ActionButton title="Abrir scrcpy" disabled={!running || busy !== null}
          onClick={() => run('scrcpy', () => api.launchScrcpy(name))}>
          {busy === 'scrcpy' ? <Loader2 size={14} className="animate-spin" /> : <MonitorPlay size={14} />}
          Abrir scrcpy
        </ActionButton>
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
          Abre la ventana scrcpy en el escritorio del host (requiere DISPLAY).
        </p>
      </div>

      {feedback && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-[11px] text-zinc-300">
          {feedback}
        </div>
      )}
    </div>
  );
}
