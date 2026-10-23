import { ArrowLeft, Circle } from 'lucide-react';
import type { Instance } from '../../types';
import ScreenViewer from '../ScreenViewer';
import ControlPanel from './ControlPanel';
import InfoAccordion from './InfoAccordion';

interface FocusViewProps {
  instance: Instance | null;
  onBack: () => void;
  groupInstances: string[];
  groupMode: boolean;
  onChanged: () => void;
}

export default function FocusView({ instance, onBack, groupInstances, groupMode, onChanged }: FocusViewProps) {
  if (!instance) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <Circle size={40} className="text-zinc-800" />
        <p className="text-sm text-zinc-400">Seleccioná un dispositivo en el mosaico.</p>
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
        >
          <ArrowLeft size={14} /> Volver al mosaico
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800/80 px-4 py-2.5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
        >
          <ArrowLeft size={14} /> Mosaico
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-zinc-100">{instance.instance_name}</h2>
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              instance.running
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${instance.running ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            {instance.running ? 'Online' : 'Offline'}
          </span>
          {instance.location?.city && (
            <span className="hidden shrink-0 text-[11px] text-zinc-500 sm:block">{instance.location.city}</span>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 bg-zinc-950/60">
          <ScreenViewer
            key={instance.instance_name}
            instance={instance}
            groupInstances={groupInstances}
            groupMode={groupMode}
            onStart={onChanged}
          />
        </div>
        <div className="hidden w-72 shrink-0 border-l border-zinc-800/80 bg-zinc-950 md:flex lg:w-80">
          <ControlPanel instance={instance} onChanged={onChanged} />
        </div>
        <div className="hidden w-80 shrink-0 border-l border-zinc-800/80 bg-zinc-950 xl:flex 2xl:w-96">
          <InfoAccordion instance={instance} onChanged={onChanged} />
        </div>
      </div>
    </div>
  );
}
