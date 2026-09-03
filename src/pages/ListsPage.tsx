import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Search, Shield, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { estadoDeListas, listarVigentes } from "@/lib/api/listas";
import { labelSituacion, NATURALEZA_LABEL } from "@/lib/listas";
import { cn } from "@/lib/utils";

/**
 * Listas restrictivas, vista del sujeto obligado.
 *
 * SÓLO LECTURA por diseño: las listas las mantiene Kawiil desde su consola de
 * plataforma, y la RLS lo impone —esta pantalla no tiene botón de actualizar
 * porque la organización no puede actualizarlas aunque quisiera.
 *
 * Antes esta pantalla mostraba seis listas con conteos y fechas inventados,
 * incluida «UIF — 342 entradas — Actualizada». Afirmaba una capacidad que no
 * existía, frente a un cliente que compra cumplimiento. Ahora muestra lo que
 * hay, y cuando no hay nada lo dice.
 */
export default function ListsPage() {
  const [busqueda, setBusqueda] = useState("");

  const estado = useQuery({ queryKey: ["listas", "estado"], queryFn: estadoDeListas });
  const resultados = useQuery({
    queryKey: ["listas", "busqueda", busqueda],
    queryFn: () => listarVigentes(undefined, busqueda),
    enabled: busqueda.trim().length >= 3,
  });

  const sinCargar = (estado.data ?? []).filter((l) => l.actualizada_al == null);
  const totalVigentes = (estado.data ?? []).reduce((n, l) => n + l.registros_vigentes, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="estela-titulo text-2xl font-extrabold tracking-tight text-foreground">Listas restrictivas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Las mantiene Kawiil y se actualizan para todas las organizaciones a la vez. Tu
          organización las consulta; no las edita.
        </p>
      </div>

      {/* Buscador */}
      <div className="estela-placa p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar una persona o empresa en todas las listas…"
            className="pl-10"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {busqueda.trim().length > 0 && busqueda.trim().length < 3 && (
          <p className="text-xs text-muted-foreground mt-2">Escriba al menos tres letras.</p>
        )}

        {busqueda.trim().length >= 3 && (
          <div className="mt-4">
            {resultados.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Buscando…
              </div>
            ) : resultados.isError ? (
              <p className="text-sm text-destructive">{(resultados.error as Error).message}</p>
            ) : (resultados.data ?? []).length === 0 ? (
              <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span>
                  Sin coincidencias para «{busqueda.trim()}» en las listas cargadas.
                  {totalVigentes === 0 && (
                    <strong className="block mt-1 text-warning-ink">
                      Cuidado: todavía no hay ninguna lista cargada, así que este resultado no
                      significa que la persona esté limpia.
                    </strong>
                  )}
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                {(resultados.data ?? []).map((r) => (
                  <div
                    key={r.registro_id}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border px-4 py-3",
                      r.bloqueante
                        ? "border-destructive/40 bg-destructive/10"
                        : "border-warning/40 bg-warning/10",
                    )}
                  >
                    <AlertTriangle
                      className={cn("w-4 h-4 mt-0.5 shrink-0", r.bloqueante ? "text-destructive" : "text-warning-ink")}
                    />
                    <div className="text-sm flex-1">
                      <p className="font-semibold">{r.nombre}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">
                        {r.fuente_nombre}
                        {r.rfc && <span className="font-mono"> · {r.rfc}</span>}
                        {r.situacion && <> · {labelSituacion(r.situacion)}</>}
                        {r.alta_fecha && (
                          <> · desde el {new Date(r.alta_fecha).toLocaleDateString("es-MX")}</>
                        )}
                      </p>
                      <p className={cn("text-xs mt-1 font-medium", r.bloqueante ? "text-destructive" : "text-warning-ink")}>
                        {r.bloqueante
                          ? "Coincidencia que exige acción antes de continuar con la operación."
                          : "Señal informativa: no confirma nada por sí sola, pero justifica debida diligencia reforzada."}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Aviso cuando faltan listas por cargar */}
      {sinCargar.length > 0 && !estado.isLoading && (
        <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning-ink" />
          <span>
            <strong>
              {sinCargar.length === 1
                ? "Una lista todavía no tiene datos cargados"
                : `${sinCargar.length} listas todavía no tienen datos cargados`}
              :
            </strong>{" "}
            {sinCargar.map((l) => l.nombre).join(", ")}. Un barrido sin coincidencias contra una
            lista vacía no acredita nada.
          </span>
        </div>
      )}

      {/* Estado por lista */}
      <div className="grid gap-3 md:grid-cols-2">
        {estado.isLoading ? (
          <div className="estela-placa p-8 flex items-center justify-center gap-2 text-muted-foreground md:col-span-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </div>
        ) : estado.isError ? (
          <p className="estela-placa p-6 text-sm text-destructive md:col-span-2">
            {(estado.error as Error).message}
          </p>
        ) : (
          (estado.data ?? []).map((l) => (
            <div key={l.codigo} className="estela-placa p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Shield
                    className={cn(
                      "w-5 h-5 mt-0.5 shrink-0",
                      l.registros_vigentes > 0 ? "text-accent" : "text-muted-foreground",
                    )}
                  />
                  <div>
                    <h3 className="font-semibold text-foreground leading-tight">{l.nombre}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{l.autoridad}</p>
                  </div>
                </div>
                {l.obligatoria && (
                  <span className="status-badge bg-accent/10 text-accent text-xs shrink-0">
                    Obligatoria
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <span
                  className={cn(
                    "status-badge text-xs",
                    l.naturaleza === "fiscal"
                      ? "bg-muted text-muted-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {NATURALEZA_LABEL[l.naturaleza]}
                </span>
                {l.actualizada_al ? (
                  <span className="status-badge bg-success/10 text-success text-xs">
                    Actualizada al {new Date(l.actualizada_al + "T12:00:00").toLocaleDateString("es-MX")}
                  </span>
                ) : (
                  <span className="status-badge bg-warning/10 text-warning-ink text-xs">
                    Sin datos cargados
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-4 pt-1 border-t border-border">
                <div>
                  <span className="block text-xl font-bold tabular-nums text-foreground">
                    {l.registros_vigentes.toLocaleString("es-MX")}
                  </span>
                  <span className="text-[13px] text-muted-foreground">registros vigentes</span>
                </div>
                {l.registros_bloqueantes !== l.registros_vigentes && (
                  <div>
                    <span className="block text-xl font-bold tabular-nums text-destructive">
                      {l.registros_bloqueantes.toLocaleString("es-MX")}
                    </span>
                    <span className="text-[13px] text-muted-foreground">exigen acción</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
