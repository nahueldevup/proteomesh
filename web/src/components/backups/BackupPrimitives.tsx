import { useState, type ReactNode } from 'react';
import { Eye, EyeOff, KeyRound, Minus, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

export function MetricCell({
  icon,
  label,
  value,
  sub,
  bar,
  barClass = 'bg-success',
  onClick,
  valueClassName,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub: ReactNode;
  bar?: number;
  barClass?: string;
  onClick?: () => void;
  valueClassName?: string;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col gap-1 bg-background px-4 py-2.5 text-left',
        onClick && 'cursor-pointer transition-colors hover:bg-surface'
      )}
    >
      <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </span>
      <span className="flex items-baseline gap-2">
        <span
          className={cn(
            'font-mono text-xl font-semibold leading-none tabular-nums text-foreground',
            valueClassName
          )}
        >
          {value}
        </span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{sub}</span>
      </span>
      {bar !== undefined && (
        <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <span
            className={cn('block h-full rounded-full transition-all', barClass)}
            style={{ width: `${Math.round(Math.min(1, Math.max(0, bar)) * 100)}%` }}
          />
        </span>
      )}
    </Comp>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-surface px-3 select-none">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
      {right}
    </div>
  );
}

export function KV({
  label,
  value,
  mono = true,
  className,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5 bg-background px-3 py-2', className)}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn('truncate text-xs text-foreground', mono && 'font-mono')}>{value}</span>
    </div>
  );
}

export function PassphraseInput({
  value,
  onChange,
  placeholder = 'Frase de paso',
  autoFocus,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div
      className={cn(
        'flex h-8 items-center gap-2 rounded-md border bg-background px-2 focus-within:ring-1 focus-within:ring-ring',
        invalid ? 'border-destructive' : 'border-input'
      )}
    >
      <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        type={show ? 'text' : 'password'}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="cursor-pointer text-muted-foreground hover:text-foreground"
        aria-label={show ? 'Ocultar' : 'Mostrar'}
      >
        {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 30,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <div className="inline-flex h-8 items-center rounded-md border border-input bg-background">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-full w-7 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
        disabled={value <= min}
      >
        <Minus className="size-3" />
      </button>
      <span className="min-w-[3.5rem] text-center font-mono text-xs tabular-nums text-foreground">
        {value}
        {suffix ? ` ${suffix}` : ''}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-full w-7 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
        disabled={value >= max}
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'sm',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex rounded-md border border-border bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm font-medium whitespace-nowrap transition-colors cursor-pointer',
            size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
            value === o.value ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function OptionRow({
  icon,
  title,
  desc,
  control,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 bg-background px-3 py-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-[11px] leading-snug text-muted-foreground">{desc}</div>
      </div>
      {control}
    </div>
  );
}

export const btn = {
  primary:
    'inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50',
  outline:
    'inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50',
  danger:
    'inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-destructive px-3 text-xs font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50',
  ghostDanger:
    'inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-destructive/40 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50',
};
