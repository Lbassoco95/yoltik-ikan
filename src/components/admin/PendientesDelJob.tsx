import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  aprobarCargaBorrador, descartarCargaBorrador, diferenciaCargaBorrador,
  listarCargasPendientes, listarErroresJobPendientes, marcarErrorAtendido,
} from "@/lib/api/listas";
import { cn } from "@/lib/utils";

/**
 * Lo que el job dejó pendiente de decisión humana.
 *
 * Va arriba de todo en la consola a propósito: si el job falló o dejó una
 * propuesta esperando, es lo primero que alguien de Kawiil tiene que ver.
 * Una lista desactualizada no avisa por su cuenta.
 */
export function PendientesDelJob() {
  const queryClient = useQueryClient();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [motivoDescarte, setMotivoDescarte] = useState("");

  const errores = useQuery({
    queryKey: ["listas", "job", "errores"],
    queryFn: listarErroresJobPendientes,
  });
  const pendientes = useQuery({
    queryKey: ["listas", "job", "pendientes"],
    queryFn: listarCargasPendientes,
  });
  const diferencia = useQuery({
    queryKey: ["listas", "job", "diferencia", abierta],
    queryFn: () => diferenciaCargaBorrador(abierta as string),
    enabled: abierta != null,
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["listas"] });

  const aprobar = useMutation({
    mutationFn: (id: string) => aprobarCargaBorrador(id),
    onSuccess: (r) => {
      invalidar(); setAbierta(null);
      toast.success(
        `Carga aplicada: ${r.promovidos.toLocaleString("es-MX")} registros` +
          (r.desactivados > 0
            ? `, ${r.desactivados.toLocaleString("es-MX")} dados de baja.`
            : "."),
      );
    },
    onError: (e: Error) => toast.error(e.message, { duration: 12000 }),
  });

  const descartar = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      descartarCargaBorrador(id, motivo),
    onSuccess: () => {
      invalidar(); setAbierta(null); setMotivoDescarte("");
      toast.success("Propuesta descartada. El estado vigente no cambió.");
    },
    onError: (e: Error) => toast.error(e.message, { duration: 12000 }),
  });

  const atender = useMutation({
    mutationFn: (id: string) => marcarErrorAtendido(id),
    onSuccess: () => invalidar(),
  });

  const hayErrores = (errores.data ?? []).length > 0;
  const hayPendientes = (pendientes.data ?? []).length > 0;
  if (!hayErrores && !hayPendientes) return null;

  return (
    <div className="space-y-3">
      {/* Errores del job */}
      {(errores.data ?? []).map((e) => (
        <div
          key={e.id}
          className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-destructive">
              El job de «{e.fuente_nombre}» falló
            </p>
            <p className="text-foreground mt-0.5">{e.error_mensaje}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(e.iniciado_en).toLocaleString("es-MX")}
              {Object.keys(e.detalle ?? {}).length > 0 && (
                <span className="font-mono ml-2">{JSON.stringify(e.detalle)}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              La lista sigue con la última versión aprobada: un job fallido no altera nada.
            </p>
          </div>
          <Button
            variant="ghost" size="sm" className="shrink-0 text-xs"
            onClick={() => atender.mutate(e.id)}
          >
            Marcar revisado
          </Button>
        </div>
      ))}

      {/* Propuestas esperando decisión */}
      {(pendientes.data ?? []).map((c) => (
        <div key={c.id} className="estela-placa p-5 border-warning/40">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-semibold text-foreground">
                Actualización propuesta · {c.fuente_codigo}
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {c.notas ?? "Sin notas"}
                {c.fecha_publicacion_fuente && (
                  <> · publicada el{" "}
                    {new Date(c.fecha_publicacion_fuente + "T12:00:00").toLocaleDateString("es-MX")}
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Todavía no afecta a ninguna organización. Se aplica sólo si la apruebas.
              </p>
            </div>
            <Button
              variant={abierta === c.id ? "secondary" : "outline"}
              size="sm"
              onClick={() => { setAbierta(abierta === c.id ? null : c.id); setMotivoDescarte(""); }}
            >
              {abierta === c.id ? "Ocultar" : "Revisar cambios"}
            </Button>
          </div>

          {abierta === c.id && (
            <div className="mt-4 space-y-4 border-t border-border pt-4">
              {diferencia.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Calculando la diferencia…
                </div>
              ) : diferencia.isError ? (
                <p className="text-sm text-destructive">{(diferencia.error as Error).message}</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(diferencia.data ?? []).map((d) => (
                    <div
                      key={d.concepto}
                      className={cn(
                        "rounded-lg border p-3",
                        d.concepto === "Saldrían de la lista" && d.cantidad > 0
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-border bg-muted/30",
                      )}
                    >
                      <span className="block text-2xl font-bold tabular-nums">
                        {d.cantidad.toLocaleString("es-MX")}
                      </span>
                      <span className="block text-sm font-medium">{d.concepto}</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">{d.nota}</span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <Textarea
                  value={motivoDescarte}
                  onChange={(ev) => setMotivoDescarte(ev.target.value)}
                  placeholder="Si vas a descartarla, escribe por qué (queda como constancia)"
                  rows={2}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline" className="gap-2"
                  disabled={!motivoDescarte.trim() || descartar.isPending}
                  onClick={() => descartar.mutate({ id: c.id, motivo: motivoDescarte.trim() })}
                >
                  <X className="w-4 h-4" /> Descartar
                </Button>
                <Button
                  className="gap-2"
                  disabled={aprobar.isPending}
                  onClick={() => aprobar.mutate(c.id)}
                >
                  {aprobar.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Check className="w-4 h-4" />}
                  Aprobar y aplicar
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
