import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Qué se estaba mostrando, para que el mensaje diga dónde falló. */
  donde?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * La red de seguridad que faltaba.
 *
 * Sin esto, cualquier error durante el render deja la PANTALLA EN BLANCO: React
 * desmonta el árbol entero y no queda nada, ni el menú. Quien lo ve no sabe si
 * la página está cargando, si no tiene permisos o si el sistema se rompió, y no
 * tiene nada que copiar para reportarlo.
 *
 * En una consola de cumplimiento eso es peor que en otro producto: una pantalla
 * en blanco es indistinguible de «no hay nada que revisar». Aquí el error se
 * muestra, con su texto, para que se pueda copiar y arreglar.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    // Queda en la consola del navegador con la traza completa, que es lo que
    // hace falta para dar con la línea.
    console.error("[Ikán] Error no controlado al renderizar", error, info);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="p-6">
        <div className="estela-placa p-6 space-y-4 max-w-3xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5 text-destructive shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Esta sección no se pudo mostrar
                {this.props.donde ? `: ${this.props.donde}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                El resto de la consola sigue funcionando. Lo de abajo es lo que
                hay que reportar; se puede copiar tal cual.
              </p>
            </div>
          </div>

          <pre className="text-xs bg-muted/60 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words text-foreground/80">
            {error.name}: {error.message}
            {info?.componentStack ? `\n${info.componentStack.trim()}` : ""}
          </pre>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => this.setState({ error: null, info: null })}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Recargar la página
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
