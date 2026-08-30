import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatMxn, cn } from "@/lib/utils";
import { esReferenciaSinConfirmar, type ParametroVigente } from "@/lib/parametros";

/** Histórico completo, no sólo lo vigente: un acto de 2025 se juzga con la UMA
 *  de 2025 aunque la revisión ocurra en 2029. */
async function listarHistorico(): Promise<(ParametroVigente & { vigente_hasta: string | null })[]> {
  const { data, error } = await supabase
    .from("parametro_regulatorio")
    .select("*")
    .order("codigo")
    .order("vigente_desde", { ascending: false });
  if (error) throw new Error(`No se pudieron leer los parámetros: ${error.message}`);
  return (data ?? []) as unknown as (ParametroVigente & { vigente_hasta: string | null })[];
}

function vigenteHoy(p: { vigente_desde: string; vigente_hasta: string | null }): boolean {
  const hoy = new Date().toISOString().slice(0, 10);
  return p.vigente_desde <= hoy && (p.vigente_hasta == null || p.vigente_hasta > hoy);
}

export default function AdminParametrosPage() {
  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ["admin", "parametros"],
    queryFn: listarHistorico,
  });

  const sinConfirmar = data.filter(esReferenciaSinConfirmar).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Parámetros regulatorios</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Valores fijados por una autoridad, con su vigencia y su fuente. El motor y el front
          los leen de aquí; ninguno declara cifras propias.
        </p>
      </div>

      {sinConfirmar > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
          <span>
            <strong>
              {sinConfirmar} {sinConfirmar === 1 ? "parámetro" : "parámetros"} sin validar por
              Kawiil-Cumplimiento.
            </strong>{" "}
            Están sembrados y el motor los usa, pero nadie ha cotejado la cifra contra el texto
            legal vigente. La UI los marca como referencia hasta que se confirmen.
          </span>
        </div>
      )}

      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </div>
        ) : isError ? (
          <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Parámetro", "Alcance", "Valor", "Vigencia", "Fuente", "Estado"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((p) => {
                  const activo = vigenteHoy(p);
                  return (
                    <tr
                      key={`${p.codigo}-${p.sector}-${p.vigente_desde}`}
                      className={cn(
                        "border-b border-border last:border-0",
                        !activo && "opacity-55",
                      )}
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-foreground">{p.nombre}</span>
                        <span className="block text-[13px] font-mono text-muted-foreground mt-0.5">
                          {p.codigo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {p.sector === "*" ? "Todas" : `Fracción ${p.sector}`}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold tabular-nums">
                        {p.unidad === "mxn"
                          ? formatMxn(p.valor_numerico)
                          : `${p.valor_numerico.toLocaleString("es-MX")} ${p.unidad.toUpperCase()}`}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(p.vigente_desde).toLocaleDateString("es-MX")}
                        {p.vigente_hasta
                          ? ` — ${new Date(p.vigente_hasta).toLocaleDateString("es-MX")}`
                          : " — vigente"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[260px]">
                        {p.fuente}
                        {p.publicacion_dof && (
                          <span className="block text-[13px] mt-0.5">{p.publicacion_dof}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!activo ? (
                          <span className="status-badge bg-muted text-muted-foreground">
                            Histórico
                          </span>
                        ) : esReferenciaSinConfirmar(p) ? (
                          <span className="status-badge bg-warning/10 text-warning">
                            Sin confirmar
                          </span>
                        ) : (
                          <span className="status-badge bg-success/10 text-success">Confirmado</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">
          <strong className="text-foreground">Alta de valores nuevos, pendiente.</strong> Registrar
          una UMA nueva todavía se hace por SQL. Es de bajo riesgo porque cambia una vez al año,
          pero cerrar la vigencia anterior y abrir la nueva debe ser una sola operación
          transaccional, no dos pasos: por eso no se improvisó aquí.
        </span>
      </div>
    </div>
  );
}
