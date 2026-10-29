import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

interface SidebarContextValue {
  open: boolean;
  collapsed: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar debe usarse dentro de SidebarProvider');
  return context;
}

export function SidebarProvider({
  children,
  defaultOpen = false,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const value = useMemo(() => ({ open, collapsed: !open, setOpen, toggle }), [open, setOpen, toggle]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'b') return;
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      )) return;
      event.preventDefault();
      toggle();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function Sidebar({
  children,
  className,
  collapsible,
  ...props
}: HTMLAttributes<HTMLElement> & { collapsible: 'icon' }) {
  const { collapsed } = useSidebar();
  return (
    <aside
      data-collapsible={collapsible}
      data-state={collapsed ? 'collapsed' : 'expanded'}
      className={cn(
        'group/sidebar relative z-20 flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-13' : 'w-60',
        className
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('shrink-0 border-b border-sidebar-border p-2', className)} {...props} />;
}

export function SidebarContent({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <nav aria-label="Navegación principal" className={cn('min-h-0 flex-1 overflow-y-auto p-2', className)} {...props} />;
}

export function SidebarGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('mb-4 last:mb-0', className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  const { collapsed } = useSidebar();
  if (collapsed) return null;
  return (
    <h2
      className={cn('mb-1 px-2 font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground', className)}
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1', className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-w-0', className)} {...props} />;
}

interface SidebarMenuButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  badge?: ReactNode;
  tooltip?: ReactNode;
  variant?: 'default' | 'primary';
}

export function SidebarMenuButton({
  icon: Icon,
  label,
  active = false,
  badge,
  tooltip,
  variant = 'default',
  className,
  ...props
}: SidebarMenuButtonProps) {
  const { collapsed } = useSidebar();
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'flex h-9 w-full min-w-0 items-center gap-2 rounded-sm px-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
        collapsed && 'justify-center px-0',
        variant === 'primary'
          ? 'border border-primary/35 bg-primary/15 font-semibold text-sidebar-foreground hover:bg-primary/25'
          : active
            ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
        className
      )}
      {...props}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && badge !== undefined && badge !== null && (
        <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{badge}</span>
      )}
    </button>
  );

  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarFooter({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <footer className={cn('shrink-0 border-t border-sidebar-border p-2', className)} {...props} />;
}

export function SidebarTrigger({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { collapsed, toggle } = useSidebar();
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = `${collapsed ? 'Expandir' : 'Contraer'} menú (Ctrl+B)`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-expanded={!collapsed}
          onClick={toggle}
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            className
          )}
          {...props}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarRail({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { collapsed, toggle } = useSidebar();
  return (
    <button
      type="button"
      aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
      title={collapsed ? 'Expandir menú' : 'Contraer menú'}
      aria-expanded={!collapsed}
      onClick={toggle}
      className={cn(
        'absolute -right-1.5 top-0 z-30 h-full w-3 cursor-ew-resize bg-transparent after:absolute after:inset-y-0 after:right-1.5 after:w-px after:bg-sidebar-border after:transition-colors hover:after:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:after:bg-primary',
        className
      )}
      {...props}
    />
  );
}

export function SidebarInset({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={cn('relative flex min-w-0 flex-1 flex-col overflow-hidden', className)} {...props} />;
}
