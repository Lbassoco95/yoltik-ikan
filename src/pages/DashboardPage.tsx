import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeftRight, Clock, Loader2, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { metricasTablero } from "@/lib/api/dashboard";
import { useParametros } from "@/hooks/useParametros";
import { PARAM } from "@/lib/parametros";
import { formatMxn, cn } from "@/lib/utils";
import { ESTADO_LABEL } from "@/lib/hallazgos-labels";
import type { ClasificacionRiesgo, EstadoHallazgo } from "@/types/domain";

/**
 * Tablero del sujeto obligado.
 *
 * Todo lo que se muestra sale de la base. Antes era `mockData` completo
 * —clientes, alertas, operaciones por día y distribución de riesgo, todo
 * inventado— y era la primera pantalla que veía un notario.
 *
 * Regla que se sigue aquí: lo que no se puede calcular, no se muestra. No hay
 * variaciones porcentuales porque no hay histórico contra el cual compararlas;
 * inventar una tendencia es peor que omitirla.
 */

/** Las columnas del tablero de hallazgos. El orden es el del trabajo del OC:
 *  lo que llega, lo que está en sus manos, y lo ya resuelto. */
const COLUMNAS: { estados: EstadoHallazgo[]; titulo: string }[] = [
  { estados: ["abierto"], titulo: "Nuevos" },
  { estados: ["en_revision"], titulo: "En análisis" },
  { estados: ["confirmado_inusual", "confirmado_preocupante"], titulo: "Confirmados" },
  { estados: ["descartado", "falso_positivo"], titulo: "Cerrados" },
];

/** Niveles de riesgo con su color semántico. NO es una paleta categórica: son
 *  estados, y por eso usan los tokens de estado del sistema. Cada barra lleva
 *  su etiqueta y su número —nunca sólo color— porque el ámbar no alcanza 3:1
 *  contra el fondo y ámbar y verde quedan cerca para daltonismo protán. */
const RIESGO: Record<ClasificacionRiesgo, { label: string; barra: string; texto: string }> = {
  bajo:        { label: "Bajo",           barra: "bg-success",     texto: "text-success" },
  medio:       { label: "Medio",          barra: "bg-warning",     texto: "text-warning" },
  alto:        { label: "Alto",           barra: "bg-destructive", texto: "text-destructive" },
  alto_oficio: { label: "Alto de oficio", barra: "bg-destructive", texto: "text-destructive" },
};

export default function DashboardPage() {
  const { profile, perfilActividad } = useAuth();
  const esNotarias = perfilActividad === "notarias";
  const { valor: valorParam } = useParametros();
  const umaMxn = valorParam(PARAM.UMA_DIARIA);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tablero"],
    queryFn: metricasTablero,
  });

  const maxOps = useMemo(
    () => Math.max(1, ...(data?.operacionesPorDia ?? []).map((d) => d.total)),
    [data],
  );
  const totalRiesgo = useMemo(
    () => (data?.riesgoPorNivel ?? []).reduce((n, r) => n + r.total, 0),
    [data],
  );

  const tiles = [
    {
      label: esNotarias ? "Comparecientes activos" : "Clientes activos",
      valor: data?.clientesActivos,
      icono: Users,
      to: "/clientes",
    },
    {
      label: esNotarias ? "Actos este mes" : "Operaciones este mes",
      valor: data?.operacionesDelMes,
      icono: ArrowLeftRight,
      to: "/operaciones",
    },
    {
      label: "Hallazgos por atender",
      valor: data?.hallazgosAbiertos,
      icono: AlertTriangle,
      to: "/alertas",
      alerta: (data?.hallazgosAbiertos ?? 0) > 0,
    },
    {
      label: "Con atención inmediata",
      valor: data?.hallazgosUrgentes,
      icono: Clock,
      to: "/alertas",
      alerta: (data?.hallazgosUrgentes ?? 0) > 0,
      nota: "SLA interno de 24 h",
    },
  ];

  if (isError) {
    return (
      <div className="glass-card p-6 text-sm text-destructive">
        {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Hola, {profile?.nombre ?? ""}
        </h1>
        {/* Sin `capitalize`: pintaba «Domingo, 30 De Agosto De 2026». Las
            mayúsculas de título son del inglés; en español va todo en minúscula
            salvo la inicial de la oración. */}
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {new Date().toLocaleDateString("es-MX", { dateStyle: "long" })}
          {umaMxn != null && (
            <span> · UMA vigente {formatMxn(umaMxn, true)}</span>
          )}
        </p>
      </div>

      {/* Cifras. Sin variación porcentual: no hay histórico que la sostenga. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            to={t.to}
            className={cn(
              "glass-card p-5 transition-colors hover:border-accent/40",
              t.alerta && "border-destructive/30",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t.label}
              </span>
              <t.icono className={cn("w-4 h-4 shrink-0", t.alerta ? "text-destructive" : "text-muted-foreground")} />
            </div>
            <span className={cn(
              "block text-3xl font-bold tabular-nums mt-2",
              t.alerta ? "text-destructive" : "text-foreground",
            )}>
              {isLoading ? "—" : (t.valor ?? 0).toLocaleString("es-MX")}
            </span>
            {t.nota && <span className="block text-[13px] text-muted-foreground mt-0.5">{t.nota}</span>}
          </Link>
        ))}
      </div>

      {isLoading ? (
        <div className="glass-card p-10 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando el tablero…
        </div>
      ) : (
        <>
          {/* Tablero de hallazgos */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Hallazgos del Motor PLD
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {COLUMNAS.map((col) => {
                const total = col.estados.reduce(
                  (n, e) => n + (data?.hallazgosPorEstado[e] ?? 0), 0,
                );
                return (
                  <div key={col.titulo} className="rounded-lg border border-border bg-muted/20 p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {col.titulo}
                      </span>
                      <span className="text-xl font-bold tabular-nums">{total}</span>
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {col.estados.map((e) => (
                        <li key={e} className="text-xs text-muted-foreground flex justify-between">
                          <span>{ESTADO_LABEL[e]}</span>
                          <span className="tabular-nums">{data?.hallazgosPorEstado[e] ?? 0}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            {(data?.hallazgosAbiertos ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground mt-4">
                No hay hallazgos por atender. Si esperabas alguno, corre el motor desde Alertas.
              </p>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Actividad de 14 días. Una sola serie: el título la nombra y no
                necesita leyenda. */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-foreground">
                {esNotarias ? "Actos por día" : "Operaciones por día"}
              </h2>
              <p className="text-xs text-muted-foreground mb-4">Últimos 14 días</p>
              <div className="flex items-end gap-1.5 h-40">
                {(data?.operacionesPorDia ?? []).map((d) => (
                  <div key={d.fecha} className="flex-1 flex flex-col items-center gap-1.5 group">
                    <span className="text-xs tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      {d.total}
                    </span>
                    <div
                      className="w-full rounded-t bg-accent transition-colors group-hover:bg-accent/80"
                      style={{ height: `${Math.max((d.total / maxOps) * 100, d.total > 0 ? 6 : 2)}%` }}
                      title={`${new Date(d.fecha + "T12:00:00").toLocaleDateString("es-MX")}: ${d.total}`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>
                  {new Date((data?.operacionesPorDia?.[0]?.fecha ?? "") + "T12:00:00")
                    .toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                </span>
                <span>hoy</span>
              </div>
            </div>

            {/* Riesgo por nivel. Barras etiquetadas: el color acompaña, no
                sustituye. */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-foreground">
                Nivel de riesgo de {esNotarias ? "los comparecientes" : "los clientes"}
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                Según su matriz más reciente
              </p>

              {totalRiesgo === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todavía no se ha evaluado la matriz de ningún{" "}
                  {esNotarias ? "compareciente" : "cliente"}. Se evalúa desde su ficha.
                </p>
              ) : (
                <div className="space-y-3">
                  {(data?.riesgoPorNivel ?? []).map((r) => {
                    const cfg = RIESGO[r.nivel];
                    const pct = Math.round((r.total / totalRiesgo) * 100);
                    return (
                      <div key={r.nivel}>
                        <div className="flex items-baseline justify-between text-sm mb-1">
                          <span className="font-medium text-foreground">{cfg.label}</span>
                          <span className="text-muted-foreground tabular-nums">
                            <strong className={cn("font-semibold", cfg.texto)}>{r.total}</strong>
                            <span className="text-xs"> · {pct}%</span>
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full", cfg.barra)} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(data?.clientesSinEvaluar ?? 0) > 0 && (
                <p className="text-xs text-warning mt-4 pt-3 border-t border-border">
                  {data!.clientesSinEvaluar}{" "}
                  {esNotarias ? "comparecientes" : "clientes"} sin matriz evaluada. La
                  clasificación de riesgo es un requisito de la debida diligencia.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
