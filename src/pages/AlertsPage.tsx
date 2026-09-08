import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import ExpedienteHallazgoDialog from "@/components/hallazgos/ExpedienteHallazgoDialog";
import { listarHallazgos } from "@/lib/api/hallazgos";
import { recorrerMotor } from "@/lib/api/operaciones";
import {
  SEVERIDAD_CLASS,
  URGENCIA_CLASS,
  URGENCIA_LABEL,
  URGENCIA_NOTA,
  urgenciaValida,
} from "@/lib/hallazgos-labels";
import type { EstadoHallazgo, Hallazgo } from "@/types/domain";
import { formatMxn } from "@/lib/utils";
import { EncabezadoSeccion } from "@/components/estela/EncabezadoSeccion";
import { cn } from "@/lib/utils";

/**
 * Bandeja del OC alimentada por el Motor PLD (tabla `hallazgo`).
 *
 * El filo superior de cada columna dice, en los significados de la paleta, en
 * qué punto del trabajo está lo que hay debajo:
 *
 *   Abiertos      ámbar   lo que le toca atender. Era rojo, que dice «roto»:
 *                         un hallazgo recién levantado no es una avería, es
 *                         trabajo pendiente. Confundir las dos cosas hace que
 *                         la avería de verdad se pierda entre ellas.
 *   En revisión   jade    alguien lo tiene en la mano.
 *   Inusual       navy    clasificado, no urgente.
 *   Preocupante   barro   confirmado de riesgo alto, y no se deshace. Es el
 *                         único barro de la pantalla, que es como se usa.
 *   Descartados   verde   resuelto.
 *
 * `border-t-vulnerable` no existía en el tema: esa columna llevaba desde
 * siempre saliendo sin filo.
 */
const columns: { title: string; estados: EstadoHallazgo[]; color: string }[] = [
  { title: "Abiertos", estados: ["abierto"], color: "border-t-ikan-ambar" },
  { title: "En revisión", estados: ["en_revision"], color: "border-t-accent" },
  { title: "Inusual", estados: ["confirmado_inusual"], color: "border-t-primary" },
  { title: "Preocupante", estados: ["confirmado_preocupante"], color: "border-t-ikan-barro" },
  { title: "Descartados", estados: ["descartado", "falso_positivo"], color: "border-t-success" },
];

function esMock(h: Hallazgo): boolean {
  return h.regla_payload?.fuente_mock === true;
}

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [expedienteId, setExpedienteId] = useState<string | null>(null);
  const { data: hallazgos = [], isLoading, isError, error } = useQuery({
    queryKey: ["hallazgos"],
    queryFn: listarHallazgos,
  });

  const recorrer = useMutation({
    mutationFn: recorrerMotor, // evalúa todas las operaciones de la organización; lanza si falla
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["hallazgos"] });
      queryClient.invalidateQueries({ queryKey: ["hallazgos", "abiertos", "count"] });
      toast.success(
        `Motor ejecutado: ${r.hallazgos_creados} hallazgo(s) nuevo(s) sobre ${r.operaciones_procesadas} operación(es).`,
      );
    },
    onError: (e: Error) => toast.error(`No se pudo ejecutar el motor: ${e.message}`),
  });

  const hayMock = hallazgos.some(esMock);

  return (
    <div className="space-y-6 animate-fade-in">
      <EncabezadoSeccion
        titulo="Bandeja de hallazgos"
        descripcion="Hallazgos generados por el Motor PLD. El OC confirma, marca inusual o preocupante, o descarta."
        acciones={
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => recorrer.mutate()}
            disabled={recorrer.isPending}
            title="Ejecuta el Motor PLD sobre todas las operaciones de la organización"
          >
            {recorrer.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Recorrer motor
          </Button>
        }
      />

      {hayMock && (
        <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-ikan-ambar" />
          <span>
            <strong>DEMO — sin integración real.</strong> Algunos hallazgos usan datos simulados
            (analítica on-chain y listas OFAC/GAFI como snapshot en BD), señalados con la etiqueta
            <span className="mx-1 rounded-sm bg-warning/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-warning-ink">DEMO</span>
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
        <div className="-mx-1 grid auto-cols-[minmax(230px,1fr)] grid-flow-col gap-3 overflow-x-auto px-1 pb-2 lg:h-[calc(100vh-260px)] lg:auto-cols-fr">
          {columns.map((col) => {
            const items = hallazgos.filter((h) => col.estados.includes(h.estado));
            return (
              <div key={col.title} className={cn("flex flex-col rounded-md border border-border border-t-[3px] bg-card p-3.5", col.color)}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="estela-antetitulo text-foreground">{col.title}</h2>
                  <span className="estela-dato rounded-sm bg-muted px-1.5 py-0.5 text-xs font-bold text-foreground">
                    {items.length}
                  </span>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto">
                  {items.map((h) => {
                    const urgencia = urgenciaValida(h.clasificacion_urgencia);
                    return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setExpedienteId(h.id)}
                      aria-label={`Abrir expediente del hallazgo ${h.tipologia_codigo} — ${h.tipologia_nombre}`}
                      className="w-full cursor-pointer rounded-md border border-border bg-muted/40 p-3.5 text-left transition-colors hover:border-accent/50 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="estela-dato text-xs font-bold text-accent">
                          {h.tipologia_codigo}
                        </span>
                        {urgencia && (
                          <span
                            className={cn("status-badge text-xs", URGENCIA_CLASS[urgencia])}
                            title={URGENCIA_NOTA}
                          >
                            {URGENCIA_LABEL[urgencia]}
                          </span>
                        )}
                        {esMock(h) && (
                          <span className="rounded-sm bg-warning/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-warning-ink">DEMO</span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] font-semibold leading-snug text-foreground">{h.tipologia_nombre}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {h.client?.nombre_razon_social ?? "Cliente —"}
                      </p>
                      {h.operation && (
                        <p className="estela-dato mt-2 text-sm font-bold text-foreground">
                          {formatMxn(h.operation.monto_mxn)}
                          {h.operation.activo_virtual ? ` · ${h.operation.activo_virtual}` : ""}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-3">
                        <span className={cn("status-badge text-xs", SEVERIDAD_CLASS[h.severidad])}>
                          {h.severidad}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(h.creado_en).toLocaleDateString("es-MX")}
                        </span>
                      </div>
                    </button>
                    );
                  })}
                  {items.length === 0 && (
                    <p className="py-8 text-center text-xs text-muted-foreground">Sin hallazgos</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Expediente del hallazgo: detalle, soporte documental y bitácora.
          Se lee de `hallazgos` para que el panel refleje el estado ya
          refrescado tras cada mutación. */}
      <ExpedienteHallazgoDialog
        hallazgo={hallazgos.find((h) => h.id === expedienteId) ?? null}
        open={!!expedienteId}
        onOpenChange={(abierto) => {
          if (!abierto) setExpedienteId(null);
        }}
      />
    </div>
  );
}
