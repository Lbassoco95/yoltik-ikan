import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Search, Shield, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { barrerEnListas, coberturaDelBarrido, estadoDeListas } from "@/lib/api/listas";
import {
  explicaEfecto,
  explicaEstadoFuente,
  explicaFundamento,
  labelEfecto,
  labelEstadoFuente,
  labelFundamento,
  labelSituacion,
  NATURALEZA_LABEL,
} from "@/lib/listas";
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
  // Contra qué se barrió y contra qué no. Se pide siempre, no sólo cuando hay
  // búsqueda: la respuesta no depende del término y así ya está cuando el
  // resultado llega vacío, que es justo el momento en que hace falta.
  const cobertura = useQuery({
    queryKey: ["listas", "cobertura"],
    queryFn: coberturaDelBarrido,
  });
  // El BARRIDO, no un `ilike`. Antes esta pantalla buscaba por subcadena sobre
  // `v_listas_vigentes`, que es otra cosa: no mira alias —el 75% de la
  // superficie de cotejo de la ONU— no respeta el modo de operación, así que
  // habría mostrado coincidencias de una lista en validación, y no pasa por la
  // compuerta del corroborante. El control vivía en la base y la pantalla no
  // lo llamaba.
  const resultados = useQuery({
    queryKey: ["listas", "barrido", busqueda],
    queryFn: () => barrerEnListas({ nombre: busqueda }),
    enabled: busqueda.trim().length >= 3,
  });
  const barrido = resultados.data;

  // Dos huecos que se veían iguales y no lo son. Uno se resuelve bajando un
  // archivo que existe; el otro con una determinación jurídica que nadie ha
  // hecho, y mientras no se haga no se puede afirmar que la fuente esté
  // cubierta. Mostrarlos juntos le diría al sujeto obligado que se resuelven
  // igual.
  const pendienteCarga = (estado.data ?? []).filter((l) => l.estado === "pendiente_carga");
  const pendienteDeterminacion = (estado.data ?? []).filter(
    (l) => l.estado === "pendiente_determinacion",
  );
  const totalVigentes = (estado.data ?? []).reduce((n, l) => n + l.registros_vigentes, 0);

  // Instrucción 307 de Cumplimiento: la vía de consulta no disponible «se dice
  // como lo que es, no "sin coincidencias"». Este buscador es justo donde
  // alguien concluye que la persona está limpia, y hay una pregunta que NO
  // contesta: si es Persona Políticamente Expuesta. Esa no se resuelve
  // cotejando nombres —la lista de la UIF no se puede obtener y el catálogo de
  // cargos se contrasta contra el cargo declarado, no contra el nombre—, así
  // que un resultado vacío aquí no dice nada sobre eso.
  const viaNoDisponible = (estado.data ?? []).filter((l) => l.estado === "via_no_disponible");

  // Instrucción 297: el barrido no consulta las fuentes en validación, y «la
  // pantalla lo declara». Sin esta línea, excluirlas sería esconderlas — y un
  // «sin coincidencias» contra listas que nadie miró es la mentira más cara
  // que este producto puede decir.
  const noBarridas = (cobertura.data ?? []).filter((c) => !c.se_barrio);

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
            ) : (barrido?.coincidencias.length ?? 0) === 0 ? (
              <div className="flex items-start gap-3 rounded-md border border-border estela-aviso px-4 py-3 text-sm">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span>
                  Sin coincidencias para «{busqueda.trim()}» en las listas cargadas.
                  {totalVigentes === 0 && (
                    <strong className="block mt-1 text-warning-ink">
                      Cuidado: todavía no hay ninguna lista cargada, así que este resultado no
                      significa que la persona esté limpia.
                    </strong>
                  )}
                  {noBarridas.length > 0 && (
                    <span className="block mt-2">
                      <strong className="text-warning-ink">
                        {noBarridas.length === 1
                          ? "Esta búsqueda NO incluyó una fuente"
                          : `Esta búsqueda NO incluyó ${noBarridas.length} fuentes`}
                        :
                      </strong>
                      <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {noBarridas.map((c) => (
                          <li key={c.fuente}>
                            · <span className="font-medium">{c.fuente_nombre}</span> — {c.motivo}
                          </li>
                        ))}
                      </ul>
                    </span>
                  )}
                  {(barrido?.suprimidas.no_corroborables ?? 0) > 0 && (
                    <span className="block mt-2 text-muted-foreground">
                      {barrido!.suprimidas.no_corroborables.toLocaleString("es-MX")} coincidencias
                      por alias de baja calidad no se muestran porque no se pudieron corroborar:
                      ni la lista ni el expediente traen fecha de nacimiento con la que
                      confirmarlas.
                    </span>
                  )}
                  {viaNoDisponible.length > 0 && (
                    <span className="block mt-1 text-muted-foreground">
                      Esta búsqueda tampoco resuelve si la persona es Políticamente Expuesta: eso
                      no se coteja por nombre. Se determina contra el cargo que declare, y la
                      lista de la UIF no se puede obtener por ley.
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                {(barrido?.coincidencias ?? []).map((r) => (
                  <div
                    key={r.registro_id}
                    className={cn(
                      "flex items-start gap-3 rounded-md border px-4 py-3",
                      // El color sale del EFECTO declarado por la fuente, no de
                      // una noción propia de «bloqueante»: la ONU impide y OFAC
                      // eleva la diligencia, y pintarlas igual sería bloquear de
                      // más o de menos.
                      r.efecto === "impedimento"
                        ? "border-destructive/40 bg-destructive/10"
                        : "border-warning/40 bg-warning/10",
                    )}
                  >
                    <AlertTriangle
                      className={cn(
                        "w-4 h-4 mt-0.5 shrink-0",
                        r.efecto === "impedimento" ? "text-destructive" : "text-warning-ink",
                      )}
                    />
                    <div className="text-sm flex-1">
                      <p className="font-semibold">{r.nombre}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">
                        {r.fuente_nombre}
                        {r.rfc && <span className="estela-dato"> · {r.rfc}</span>}
                        {r.situacion && <> · {labelSituacion(r.situacion)}</>}
                        {r.alta_fecha && (
                          <> · desde el {new Date(r.alta_fecha).toLocaleDateString("es-MX")}</>
                        )}
                      </p>
                      {/* CÓMO cotejó. Una coincidencia contra un alias de baja
                          calidad corroborada por fecha de nacimiento no se
                          explica igual que una contra el nombre primario, y
                          quien revisa necesita la diferencia para decidir. */}
                      <p className="text-muted-foreground text-xs mt-0.5">
                        {r.coincide_por === "rfc"
                          ? "Coteja por RFC."
                          : r.coincide_por === "nombre"
                            ? "Coteja por el nombre principal de la lista."
                            : r.coincide_por === "alias"
                              ? "Coteja por un alias de la lista."
                              : "Coteja por un alias de baja calidad declarada por la fuente."}
                        {r.corroboracion_detalle && ` ${r.corroboracion_detalle}`}
                      </p>
                      <p
                        className={cn(
                          "text-xs mt-1 font-medium",
                          r.efecto === "impedimento" ? "text-destructive" : "text-warning-ink",
                        )}
                      >
                        {explicaEfecto(r.efecto)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Las contradichas. No son un descarte silencioso: una
                coincidencia de nombre con fecha de nacimiento distinta es una
                NO-COINCIDENCIA DEMOSTRADA, y asentarla es mejor prueba de que
                el control corrió que no haberla producido nunca. */}
            {(barrido?.descartadas.length ?? 0) > 0 && (
              <div className="mt-3 rounded-md border border-border estela-aviso px-4 py-3 text-xs">
                <p className="font-medium text-foreground">
                  {barrido!.descartadas.length === 1
                    ? "Una coincidencia quedó descartada por contradicción"
                    : `${barrido!.descartadas.length} coincidencias quedaron descartadas por contradicción`}
                  :
                </p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {barrido!.descartadas.map((d) => (
                    <li key={d.registro_id}>
                      · <span className="font-medium">{d.nombre}</span> ({d.fuente_nombre}) —{" "}
                      {d.detalle}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-muted-foreground">
                  Se registran a propósito: quedan como constancia de que el barrido corrió y de
                  por qué esa persona no es la de la lista.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Aviso cuando faltan listas por cargar */}
      {pendienteCarga.length > 0 && !estado.isLoading && (
        <div className="flex items-start gap-3 rounded-md border border-warning/40 estela-aviso bg-gradient-to-r from-warning/15 to-warning/5 px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-ikan-ambar" />
          <span>
            <strong>
              {pendienteCarga.length === 1
                ? "Una lista todavía no tiene datos cargados"
                : `${pendienteCarga.length} listas todavía no tienen datos cargados`}
              :
            </strong>{" "}
            {pendienteCarga.map((l) => l.nombre).join(", ")}. Un barrido sin coincidencias contra
            una lista vacía no acredita nada.
          </span>
        </div>
      )}

      {pendienteDeterminacion.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-warning/40 estela-aviso bg-gradient-to-r from-warning/15 to-warning/5 px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-ikan-ambar" />
          <span>
            <strong>
              {pendienteDeterminacion.length === 1
                ? "Una fuente está pendiente de determinación"
                : `${pendienteDeterminacion.length} fuentes están pendientes de determinación`}
              :
            </strong>{" "}
            {pendienteDeterminacion.map((l) => l.nombre).join(", ")}. No es que falte un archivo:
            falta resolver si la obligación de consultarlas existe. Hasta entonces no se puede
            afirmar que estén cubiertas.
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
                {/* Aquí decía «Obligatoria». Afirmaba que la ley manda
                    consultar la fuente, y el art. 18 no lo manda en ninguna de
                    sus once fracciones: era poner en pantalla, frente al
                    usuario, el argumento que en una visita de verificación se
                    cae. Lo sustituyen las dos etiquetas de abajo —efecto y
                    fundamento—, que responden preguntas distintas e
                    independientes. Instrucciones 334 a 337. */}
                {l.fundamento_efectivo && (
                  <span
                    className={cn(
                      "status-badge text-xs shrink-0",
                      l.fundamento_efectivo === "obligacion_ley"
                        ? "bg-accent/10 text-accent"
                        : l.fundamento_efectivo === "pendiente_manual"
                          ? "bg-warning/15 text-warning-ink"
                          : "bg-muted text-muted-foreground",
                    )}
                    title={explicaFundamento(l.fundamento_efectivo)}
                  >
                    {labelFundamento(l.fundamento_efectivo)}
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
                {l.estado === "cargada" && l.actualizada_al ? (
                  <span className="status-badge bg-success/10 text-success text-xs">
                    Actualizada al {new Date(l.actualizada_al + "T12:00:00").toLocaleDateString("es-MX")}
                  </span>
                ) : l.estado === "en_validacion" ? (
                  /* Tiene datos y fecha, pero no barre. Va en ámbar porque sí
                     hay algo que atender: falta revisarla y ponerla a operar.
                     Y la fecha se muestra igual, que es de lo que se trata
                     validar. */
                  <span className="status-badge bg-warning/15 text-warning-ink text-xs">
                    En validación
                    {l.actualizada_al &&
                      ` · datos al ${new Date(l.actualizada_al + "T12:00:00").toLocaleDateString("es-MX")}`}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "status-badge text-xs",
                      // Ámbar es «lo que le toca atender». Ni `no_aplica` ni
                      // `via_no_disponible` le toca a nadie: la primera no
                      // obliga y la segunda no se puede resolver. Pintarlas de
                      // ámbar pondría dos pendientes falsos en la pantalla y
                      // le quitaría peso a los que sí lo son.
                      l.estado === "no_aplica" || l.estado === "via_no_disponible"
                        ? "bg-muted text-muted-foreground"
                        : "bg-warning/15 text-warning-ink",
                    )}
                  >
                    {labelEstadoFuente(l.estado)}
                  </span>
                )}

                {/* Qué produce una coincidencia. Es atributo de la fuente: la ONU
                    vincula a México y una coincidencia impide; OFAC es derecho
                    extranjero y eleva la diligencia. Tratarlas igual sería
                    bloquear de más o de menos, y las dos cosas son graves. */}
                <span
                  className={cn(
                    "status-badge text-xs",
                    l.efecto === "impedimento"
                      ? "bg-destructive/10 text-destructive"
                      : l.efecto === "eleva_diligencia"
                        ? "bg-warning/15 text-warning-ink"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {l.efectos_por_situacion
                    ? "Efecto según la situación"
                    : labelEfecto(l.efecto)}
                </span>
              </div>

              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {l.estado === "pendiente_determinacion" ||
                l.estado === "no_aplica" ||
                l.estado === "via_no_disponible"
                  ? explicaEstadoFuente(l.estado)
                  : l.efectos_por_situacion
                    ? "El definitivo impide operar; el presunto exige diligencia reforzada sin ser " +
                      "hallazgo confirmado; desvirtuado y sentencia favorable quedan como dato."
                    : explicaEfecto(l.efecto)}
              </p>

              <div className="flex items-baseline gap-4 pt-1 border-t border-border">
                <div>
                  <span className="block text-xl font-bold tabular-nums text-foreground">
                    {l.registros_vigentes.toLocaleString("es-MX")}
                  </span>
                  <span className="text-[13px] text-muted-foreground">registros vigentes</span>
                </div>
                {l.registros_bloqueantes > 0 && (
                  <div>
                    <span className="block text-xl font-bold tabular-nums text-destructive">
                      {l.registros_bloqueantes.toLocaleString("es-MX")}
                    </span>
                    <span className="text-[13px] text-muted-foreground">impiden operar</span>
                  </div>
                )}
                {l.registros_eleva_diligencia > 0 && (
                  <div>
                    <span className="block text-xl font-bold tabular-nums text-warning-ink">
                      {l.registros_eleva_diligencia.toLocaleString("es-MX")}
                    </span>
                    <span className="text-[13px] text-muted-foreground">elevan la diligencia</span>
                  </div>
                )}
                {l.registros_sin_efecto_declarado > 0 && (
                  <div>
                    <span className="block text-xl font-bold tabular-nums text-warning-ink">
                      {l.registros_sin_efecto_declarado.toLocaleString("es-MX")}
                    </span>
                    <span className="text-[13px] text-muted-foreground">sin efecto declarado</span>
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
