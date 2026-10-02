import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeftRight, Clock, Loader2, Users } from "lucide-react";
import { EncabezadoSeccion } from "@/components/estela/EncabezadoSeccion";
import { CartuchoParametro } from "@/components/estela/CartuchoParametro";
import { BitacoraLinea } from "@/components/estela/BitacoraLinea";
import { listarEventos } from "@/lib/api/bitacora";
import { actorLegible, descripcionEvento } from "@/lib/bitacora-labels";
import { useAuth } from "@/lib/auth-context";
import { useActiveRole } from "@/hooks/useActiveRole";
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
  medio:       { label: "Medio",          barra: "bg-warning",     texto: "text-warning-ink" },
  alto:        { label: "Alto",           barra: "bg-destructive", texto: "text-destructive" },
  alto_oficio: { label: "Alto de oficio", barra: "bg-destructive", texto: "text-destructive" },
};

export default function DashboardPage() {
  const { profile, perfilActividad } = useAuth();
  const { activeRole } = useActiveRole();
  const esNotarias = perfilActividad === "notarias";
  const { valor: valorParam, parametro: buscarParam } = useParametros();
  const umaMxn = valorParam(PARAM.UMA_DIARIA);
  // El registro completo, no sólo el número: es lo que deja pintar el
  // cartucho con su fundamento —fuente, DOF, vigencia, quién lo validó—.
  const uma = buscarParam(PARAM.UMA_DIARIA);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tablero"],
    queryFn: metricasTablero,
  });

  /**
   * Lo último que pasó, en el tablero.
   *
   * La bitácora ya existía, pero sólo se llegaba a ella entrando a Auditoría y
   * pasando por tres filtros. Puesta aquí responde a otra pregunta, que es la
   * que alguien se hace al abrir por la mañana: qué se movió desde ayer. Ocho
   * líneas —lo que cabe sin desplazar—; la pantalla completa sigue en
   * Auditoría.
   *
   * El operador no la ve: la política `evento_select` sólo devuelve filas a OC
   * y Admin, así que pedirla con su sesión sería una consulta que vuelve vacía.
   */
  const veBitacora = activeRole === "oc" || activeRole === "admin";
  const { data: eventos = [] } = useQuery({
    queryKey: ["tablero", "bitacora"],
    queryFn: () => listarEventos({ limite: 8 }),
    enabled: veBitacora,
  });

  const maxOps = useMemo(
    () => Math.max(1, ...(data?.operacionesPorDia ?? []).map((d) => d.total)),
    [data],
  );
  const totalRiesgo = useMemo(
    () => (data?.riesgoPorNivel ?? []).reduce((n, r) => n + r.total, 0),
    [data],
  );

  const abiertos = data?.hallazgosAbiertos ?? 0;
  const urgentes = data?.hallazgosUrgentes ?? 0;
  const urgeAlgo = abiertos > 0 || urgentes > 0;

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
      label: "Sin matriz evaluada",
      valor: data?.clientesSinEvaluar,
      icono: AlertTriangle,
      to: "/clientes",
      alerta: (data?.clientesSinEvaluar ?? 0) > 0,
      nota: "Requisito de debida diligencia",
    },
    {
      label: "Confirmados este periodo",
      valor:
        (data?.hallazgosPorEstado.confirmado_inusual ?? 0) +
        (data?.hallazgosPorEstado.confirmado_preocupante ?? 0),
      icono: Clock,
      to: "/alertas",
    },
  ];

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/30 estela-vidrio p-5 text-sm text-destructive">
        {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Sin `capitalize` en la fecha: pintaba «Domingo, 30 De Agosto De 2026».
          Las mayúsculas de título son del inglés; en español va todo en
          minúscula salvo la inicial de la oración. */}
      <EncabezadoSeccion
        titulo={`Hola, ${profile?.nombre ?? ""}`}
        descripcion={
          <span className="first-letter:uppercase">
            {new Date().toLocaleDateString("es-MX", { dateStyle: "long" })}
          </span>
        }
      />

      {/* ESTELA pide una sola cosa arriba del todo: lo que urge hoy. Antes las
          cuatro cifras salían del mismo tamaño y con el mismo peso, así que
          «hallazgos por atender» pesaba igual que «clientes activos» y quien
          abría el tablero tenía que leer las cuatro para saber si le tocaba
          hacer algo. Ahora lo urgente ocupa una tarjeta ancha con filo y el
          resto se demota a fila de cifras.

          La tarjeta cambia de tono con lo que hay, no de forma: ámbar cuando
          hay algo que atender, jade cuando no. El estado va en el texto —el
          color sólo refuerza—. */}
      {!isLoading && (
        <div
          className={cn(
            "estela-filo rounded-md border estela-vidrio p-5 sm:p-6",
            urgeAlgo
              ? "border-ikan-ambar/40 border-t-ikan-ambar"
              : "border-border border-t-accent",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className={cn(
                  "estela-antetitulo text-muted-foreground m-0",
                  urgeAlgo ? "text-[#7A4F00] dark:text-ikan-ambar" : "text-accent",
                )}
              >
                {urgeAlgo ? "Lo que urge hoy" : "Al corriente"}
              </p>
              <h2 className="m-0 mt-1 text-lg font-bold text-foreground">
                {urgeAlgo
                  ? `${abiertos} hallazgo${abiertos === 1 ? "" : "s"} por atender`
                  : "No hay hallazgos por atender"}
              </h2>
              <p className="m-0 mt-1 text-[13px] text-muted-foreground">
                {urgeAlgo
                  ? "El Motor PLD los levantó. Confirmarlos o descartarlos es del Oficial de Cumplimiento."
                  : "Si esperabas alguno, corre el motor desde Alertas."}
              </p>
            </div>

            {urgentes > 0 && (
              // El único ámbar macizo de la pantalla. Texto navy sobre ámbar:
              // el blanco no llega a contraste AA.
              <span className="shrink-0 rounded-sm border-l-[3px] border-ikan-ambar bg-warning/15 px-3 py-1.5 text-xs font-bold text-warning-ink">
                {urgentes} con atención inmediata · SLA interno 24 h
              </span>
            )}
          </div>

          {abiertos > 0 && (
            <Link
              to="/alertas"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ikan-jade-oscuro px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#005A4C]"
            >
              Ir a la bandeja de hallazgos
            </Link>
          )}
        </div>
      )}

      {/* Cifras demotadas. Sin variación porcentual: no hay histórico que la
          sostenga. Los dos contadores de hallazgos ya viven en el héroe, así
          que aquí sólo queda el volumen de cartera. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            to={t.to}
            className={cn(
              "estela-placa px-4 py-3.5 transition-colors hover:border-accent/50",
              t.alerta && "border-ikan-ambar/40",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="estela-antetitulo text-muted-foreground">{t.label}</span>
              <t.icono className={cn("h-4 w-4 shrink-0", t.alerta ? "text-ikan-ambar" : "text-muted-foreground")} />
            </div>
            <span className={cn(
              "mt-1.5 block text-2xl font-extrabold tabular-nums",
              t.alerta ? "text-[#7A4F00] dark:text-ikan-ambar" : "text-foreground",
            )}>
              {isLoading ? "—" : (t.valor ?? 0).toLocaleString("es-MX")}
            </span>
            {t.nota && <span className="mt-0.5 block text-xs text-muted-foreground">{t.nota}</span>}
          </Link>
        ))}
      </div>

      {/* El cartucho de la UMA. La cifra ya salía en el subtítulo de la
          cabecera, suelta y sin decir de dónde venía: quien la leía no tenía
          forma de comprobarla. La base guardaba fuente, publicación en el DOF
          y vigencia desde el principio; lo que faltaba era enseñarlas. */}
      {uma && <CartuchoParametro parametro={uma} titulo="UMA vigente" />}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-md border border-border estela-vidrio p-10 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando el tablero…
        </div>
      ) : (
        <>
          {/* Tablero de hallazgos */}
          <div className="estela-placa p-5">
            <h2 className="mb-4 text-base font-bold text-foreground">
              Hallazgos del Motor PLD
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {COLUMNAS.map((col) => {
                const total = col.estados.reduce(
                  (n, e) => n + (data?.hallazgosPorEstado[e] ?? 0), 0,
                );
                return (
                  <div key={col.titulo} className="rounded-md border border-border estela-aviso p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="estela-antetitulo text-muted-foreground">{col.titulo}</span>
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
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Actividad de 14 días. Una sola serie: el título la nombra y no
                necesita leyenda. */}
            <div className="estela-placa p-5">
              <h2 className="text-base font-bold text-foreground">
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
                      className="w-full rounded-t-sm bg-accent transition-colors group-hover:bg-ikan-jade-oscuro"
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
            <div className="estela-placa p-5">
              <h2 className="text-base font-bold text-foreground">
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
                        <div className="h-1.5 overflow-hidden rounded-sm bg-muted">
                          <div className={cn("h-full rounded-sm", cfg.barra)} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          </div>

          {/* El hilo de bitácora. Los hashes no están para que nadie los lea
              enteros: están para que se vea que existen. Es la diferencia
              entre un registro de actividad y una bitácora oponible. */}
          {veBitacora && eventos.length > 0 && (
            <div className="estela-placa p-5">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-base font-bold text-foreground">Lo último en la bitácora</h2>
                <Link
                  to="/auditoria"
                  className="shrink-0 text-xs font-semibold text-accent hover:underline"
                >
                  Ver la bitácora completa
                </Link>
              </div>
              <div>
                {eventos.map((e) => (
                  <BitacoraLinea
                    key={e.id}
                    sello={new Date(e.registrado_en).toLocaleString("es-MX", {
                      dateStyle: "short",
                      timeStyle: "medium",
                    })}
                    hash={e.cadena_hash}
                    descripcion={descripcionEvento(e)}
                    actor={actorLegible(e)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
