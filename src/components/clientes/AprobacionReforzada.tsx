import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  aprobacionDelExpediente,
  aprobarExpediente,
  DETALLE_CALIDAD,
  ETIQUETA_CALIDAD,
  expedienteVigente,
  type CalidadAprobacion,
} from "@/lib/api/expediente-reforzado";
import { useAuth } from "@/lib/auth-context";

/**
 * La aprobación del expediente reforzado, dentro del expediente.
 *
 * Va aquí y no en una bandeja aparte por la misma razón que la identificación y
 * la estructura societaria: quien aprueba necesita ver lo que está aprobando.
 * Una pantalla que sólo muestre el nombre y un botón convierte la aprobación en
 * un trámite.
 *
 * Sólo aparece en riesgo alto. El expediente reforzado es para N3; ponerlo en
 * todos los expedientes lo volvería un paso de alta más y diluiría su función,
 * que es exactamente lo que el art. 23 Ter 4 no quiere.
 */
export function AprobacionReforzada({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  const [calidad, setCalidad] = useState<CalidadAprobacion | "">("");
  const [notas, setNotas] = useState("");

  const { data: aprobacion, isLoading } = useQuery({
    queryKey: ["aprobacion-expediente", clientId],
    queryFn: () => aprobacionDelExpediente(clientId),
  });

  const { data: vigente } = useQuery({
    queryKey: ["expediente-vigente", clientId],
    queryFn: () => expedienteVigente(clientId),
  });

  const aprobar = useMutation({
    mutationFn: () =>
      aprobarExpediente(clientId, calidad as CalidadAprobacion, notas),
    onSuccess: () => {
      toast.success("Expediente reforzado aprobado");
      setNotas("");
      queryClient.invalidateQueries({
        queryKey: ["aprobacion-expediente", clientId],
      });
      queryClient.invalidateQueries({
        queryKey: ["expediente-vigente", clientId],
      });
    },
    // El mensaje viene de la base y dice exactamente por qué no se pudo: que el
    // operador no aprueba, o que hay una evaluación posterior. Repetirlo aquí
    // en otras palabras sería tener dos versiones de la misma regla.
    onError: (e: Error) => toast.error(e.message, { duration: 14000 }),
  });

  // El operador ve la sección —tiene que saber que el acto está frenado y por
  // qué— pero no el formulario. Esconderla del todo dejaría el bloqueo sin
  // explicación desde la pantalla donde se topa con él.
  const puedeAprobar = roles.includes("oc") || roles.includes("admin");

  if (isLoading) {
    return (
      <div className="glass-card p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando la aprobación…
      </div>
    );
  }

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 mt-0.5 text-primary shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Aprobación del expediente reforzado
          </p>
          <p className="text-xs text-muted-foreground max-w-3xl">
            El art. 23 Ter 5 de las RCG pide la aprobación de un directivo o su
            equivalente
            <strong> antes de operar</strong>. Mientras no esté, los actos de
            este compareciente no se registran. En una notaría el equivalente
            del directivo es el notario titular: por eso se pide la calidad en
            que se aprueba, y no un cargo que no existe.
          </p>
        </div>
      </div>

      {vigente ? (
        <div className="rounded-md border border-jade/30 bg-jade/5 p-3 space-y-1">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-jade" />
            Aprobado y vigente
          </p>
          <p className="text-xs text-muted-foreground">
            {ETIQUETA_CALIDAD[aprobacion?.calidad as CalidadAprobacion] ??
              "Sin calidad"}{" "}
            ·{" "}
            {aprobacion?.aprobado_en
              ? new Date(aprobacion.aprobado_en).toLocaleString("es-MX")
              : "sin fecha"}
          </p>
          {aprobacion?.notas && (
            <p className="text-xs text-muted-foreground">
              «{aprobacion.notas}»
            </p>
          )}
          {aprobacion?.autoaprobacion && (
            <p className="text-xs text-warning">
              Autoaprobación: quien aprobó es el Oficial de Cumplimiento
              designado o quien capturó el expediente. Fija responsabilidad y
              fecha, pero no es un segundo par de ojos, y por eso este
              expediente se revisa al 100 % en la auditoría anual del art. 18
              fr. XI. Lo calcula la base comparando identidades; nadie lo
              declara.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-3 space-y-1">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            {aprobacion?.aprobado_en
              ? "La aprobación dejó de cubrir"
              : "Sin aprobación: los actos están frenados"}
          </p>
          <p className="text-xs text-muted-foreground">
            {aprobacion?.aprobado_en
              ? "Hubo una evaluación de riesgo posterior a la firma. Una aprobación no se estira " +
                "sola a hechos que nadie miró al aprobar: hay que volver a aprobar sobre los " +
                "hechos nuevos."
              : "Ningún acto de este compareciente se puede registrar hasta que el notario " +
                "titular, un directivo designado o el Oficial de Cumplimiento apruebe el " +
                "expediente."}
          </p>
        </div>
      )}

      {puedeAprobar ? (
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              ¿En qué calidad apruebas?
            </label>
            <Select
              value={calidad}
              onValueChange={(v) => setCalidad(v as CalidadAprobacion)}
            >
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue placeholder="Elige la calidad" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ETIQUETA_CALIDAD) as CalidadAprobacion[]).map(
                  (c) => (
                    <SelectItem key={c} value={c}>
                      {ETIQUETA_CALIDAD[c]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            {calidad && (
              <p className="text-xs text-muted-foreground">
                {DETALLE_CALIDAD[calidad]}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Qué revisaste antes de aprobar
            </label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Lo que sostiene la decisión. Queda en la bitácora y es lo que se lee en una verificación."
            />
          </div>

          <Button
            onClick={() => aprobar.mutate()}
            disabled={!calidad || aprobar.isPending}
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {aprobar.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {vigente ? "Volver a aprobar" : "Aprobar el expediente"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          Tu rol no aprueba expedientes reforzados. El operador no aprueba, ni
          por delegación ni por ausencia del titular: si el titular no está, el
          expediente espera. Un permiso que se afloja «sólo por hoy» deja de ser
          un control.
        </p>
      )}
    </div>
  );
}
