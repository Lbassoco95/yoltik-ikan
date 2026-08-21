import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listarHallazgos } from "@/lib/api/hallazgos";
import { invocarMotor } from "@/lib/api/operaciones";
import type { EstadoHallazgo, Hallazgo, SeveridadTipologia } from "@/types/domain";
import { formatMxn } from "@/lib/utils";
import { cn } from "@/lib/utils";

// Bandeja del OC alimentada por el Motor PLD (tabla `hallazgo`).
const columns: { title: string; estados: EstadoHallazgo[]; color: string }[] = [
  { title: "Abiertos", estados: ["abierto"], color: "border-t-destructive" },
  { title: "En revisión", estados: ["en_revision"], color: "border-t-warning" },
  { title: "Inusual", estados: ["confirmado_inusual"], color: "border-t-vulnerable" },
  { title: "Preocupante", estados: ["confirmado_preocupante"], color: "border-t-destructive" },
  { title: "Descartados", estados: ["descartado", "falso_positivo"], color: "border-t-muted-foreground" },
];

const severidadClass: Record<SeveridadTipologia, string> = {
  critica: "bg-destructive/10 text-destructive",
  alta: "bg-destructive/10 text-destructive",
  media: "bg-warning/10 text-warning",
  baja: "bg-muted text-muted-foreground",
};

function esMock(h: Hallazgo): boolean {
  return h.regla_payload?.fuente_mock === true;
}

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const { data: hallazgos = [], isLoading, isError, error } = useQuery({
    queryKey: ["hallazgos"],
    queryFn: listarHallazgos,
  });

  const recorrer = useMutation({
    mutationFn: () => invocarMotor(), // sin operation_id: evalúa todas las operaciones de la organización
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hallazgos"] });
      toast.success("Motor ejecutado sobre las operaciones de la organización");
    },
    onError: (e: Error) => toast.error(`No se pudo ejecutar el motor: ${e.message}`),
  });

  const hayMock = hallazgos.some(esMock);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bandeja de hallazgos</h1>
          <p className="text-sm text-muted-foreground">
            Hallazgos generados por el Motor PLD. El OC confirma, marca inusual/preocupante o descarta.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => recorrer.mutate()}
          disabled={recorrer.isPending}
          title="Ejecuta el Motor PLD sobre todas las operaciones de la organización"
        >
          {recorrer.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Recorrer motor
        </Button>
      </div>

      {hayMock && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
          <span>
            <strong>DEMO — sin integración real.</strong> Algunos hallazgos usan datos simulados
            (analítica on-chain y listas OFAC/GAFI como snapshot en BD), señalados con la etiqueta
            <span className="mx-1 status-badge bg-warning/20 text-warning text-[10px]">DEMO</span>
            en la tarjeta.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando hallazgos…
        </div>
      ) : isError ? (
        <div className="p-8 text-center text-destructive text-sm">
          No se pudieron cargar los hallazgos: {(error as Error)?.message}
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-4 h-[calc(100vh-220px)]">
          {columns.map((col) => {
            const items = hallazgos.filter((h) => col.estados.includes(h.estado));
            return (
              <div key={col.title} className={cn("glass-card border-t-4 p-4 flex flex-col", col.color)}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-foreground">{col.title}</h2>
                  <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full">{items.length}</span>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto">
                  {items.map((h) => (
                    <div
                      key={h.id}
                      className="bg-muted/40 rounded-lg p-4 cursor-pointer hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-foreground">
                          {h.tipologia_codigo}
                        </span>
                        {esMock(h) && (
                          <span className="status-badge bg-warning/20 text-warning text-[10px]">DEMO</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-foreground mt-1">{h.tipologia_nombre}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {h.client?.nombre_razon_social ?? "Cliente —"}
                      </p>
                      {h.operation && (
                        <p className="text-sm font-bold text-foreground mt-2">
                          {formatMxn(h.operation.monto_mxn)}
                          {h.operation.activo_virtual ? ` · ${h.operation.activo_virtual}` : ""}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-3">
                        <span className={cn("status-badge text-[10px]", severidadClass[h.severidad])}>
                          {h.severidad}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(h.creado_en).toLocaleDateString("es-MX")}
                        </span>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">Sin hallazgos</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
