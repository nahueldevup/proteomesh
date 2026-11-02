import { forwardRef, type ButtonHTMLAttributes, type ComponentType } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { cn } from '../../lib/utils';

export type IconBtnVariant = 'ghost' | 'solid' | 'primary' | 'danger' | 'success' | 'active' | 'warning';

const variants: Record<IconBtnVariant, string> = {
  ghost: 'text-foreground/80 hover:text-foreground hover:bg-muted',
  solid: 'bg-card text-foreground hover:bg-muted border border-border',
  primary: 'bg-primary text-primary-foreground hover:opacity-90 font-bold',
  danger: 'text-destructive hover:bg-destructive/15',
  success: 'text-success hover:bg-success/15',
  active: 'bg-primary/20 text-foreground ring-1 ring-primary/60 font-semibold',
  warning: 'text-warning hover:bg-warning/15',
};

interface IconBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ComponentType<{ className?: string }>;
  label: string;
  variant?: IconBtnVariant;
  size?: 'sm' | 'md' | 'lg';
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export const IconBtn = forwardRef<HTMLButtonElement, IconBtnProps>(function IconBtn(
  {
    icon: Icon,
    label,
    variant = 'ghost',
    size = 'md',
    side = 'bottom',
    className,
    disabled,
    ...rest
  },
  ref
) {
  const sz = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  const isz = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          aria-label={label}
          disabled={disabled}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-sm transition-colors',
            'disabled:pointer-events-none disabled:opacity-40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            sz,
            variants[variant],
            className
          )}
          {...rest}
        >
          <Icon className={isz} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
});
