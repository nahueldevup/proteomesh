import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface RootErrorBoundaryProps {
  children: ReactNode;
}

interface RootErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RootErrorBoundary] Error de renderizado no capturado:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen w-full items-center justify-center bg-background p-6 font-mono select-none">
          <div className="w-full max-w-md rounded-md border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <div className="grid size-9 place-items-center rounded-sm bg-destructive/15 text-destructive border border-destructive/30">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-foreground tracking-wide">
                  Error de Ejecución
                </h1>
                <p className="text-[11px] text-muted-foreground">
                  ProteoMesh Web colapsó en un componente interno
                </p>
              </div>
            </div>

            <div className="rounded-sm border border-border/80 bg-background/80 p-3 text-xs">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
                Detalle del fallo:
              </p>
              <pre className="text-[11px] text-destructive font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {this.state.error?.message || 'Error desconocido de renderizado'}
              </pre>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 rounded-sm border border-border bg-secondary px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                Reintentar
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
              >
                <RotateCcw className="size-3.5" />
                Recargar página
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
