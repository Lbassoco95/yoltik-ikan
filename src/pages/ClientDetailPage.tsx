import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Shield, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  evaluarRiesgoCliente,
  getCliente,
  getPlantillaRiesgoActiva,
  ultimaEvaluacion,
} from "@/lib/api/clientes";
import { BadgeRiesgo } from "@/components/riesgo/BadgeRiesgo";
import { listarOperacionesDeCliente } from "@/lib/api/operaciones";
import { paisesEnListas, zonasDeAtencion } from "@/lib/api/catalogos";
import {
  faltanPorResponder,
  indicadoresDerivados,
  prellenarMatriz,
  type ContextoPrellenado,
  type RespuestaSugerida,
} from "@/lib/riesgo/prellenado";
import {
  elementosAplicables,
  evaluarMatriz,
  respuestasCompletas,
  variablePuntua,
  type ContextoEvaluacion,
} from "@/lib/riesgo/matriz";
import { operacionesEnVentana } from "@/lib/riesgo/perfil-transaccional";
import { cn, formatMxn } from "@/lib/utils";
import { useParametros } from "@/hooks/useParametros";
import { PARAM } from "@/lib/parametros";
import type { SectorAV, TipoPersona } from "@/types/domain";
import { useAuth } from "@/lib/auth-context";
import { LABELS, labelTipoActo, nivelConocimiento } from "@/lib/perfil-actividad";

const tipoLabel: Record<TipoPersona, string> = { fisica: "Persona Física", moral: "Persona Moral" };

const riesgoClase: Record<"bajo" | "medio" | "alto", string> = {
  bajo: "text-jade",
  medio: "text-warning",
  alto: "text-destructive",
};

export default function ClientDetailPage() {
  const { id } = useParams();
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  // Marca de cuál evaluación ya se precargó, para no pisar lo que el usuario
  // esté capturando cada vez que la consulta se revalide.
  const [precargada, setPrecargada] = useState<string | null>(null);
  const { perfilActividad, profile } = useAuth();
  const queryClient = useQueryClient();
  const L = LABELS[perfilActividad];
  const esNotarias = perfilActividad === "notarias";

  // UMA vigente desde `parametro_regulatorio`, no desde una constante.
  const { valor: valorParam } = useParametros();
  const umaMxn = valorParam(PARAM.UMA_DIARIA);

  const { data: client, isLoading } = useQuery({
    queryKey: ["cliente", id],
    queryFn: () => getCliente(id!),
    enabled: !!id,
  });
  const { data: ops = [] } = useQuery({
    queryKey: ["cliente-ops", id],
    queryFn: () => listarOperacionesDeCliente(id!),
    enabled: !!id,
  });
  // La plantilla vigente decide si hay matriz, no el perfil de actividad: así
  // no hay que tocar este archivo cuando entren joyerías, vehículos, etc.
  //
  // El sector viene de la ORGANIZACIÓN. Sin él, la consulta traía cualquier
  // plantilla activa, y como puede haber una activa por sector, un
  // compareciente de notaría podía evaluarse con la matriz de un exchange.
  const sectorOrg = profile?.organization_sectores?.[0] ?? null;
  const { data: plantilla } = useQuery({
    queryKey: ["plantilla-activa", sectorOrg],
    queryFn: () => getPlantillaRiesgoActiva(sectorOrg as SectorAV),
    enabled: sectorOrg != null,
  });

  // La calificación vigente. Sin esto, reabrir el expediente mostraba la matriz
  // en blanco como si nadie hubiera evaluado a este compareciente.
  const { data: evaluacion } = useQuery({
    queryKey: ["evaluacion", id],
    queryFn: () => ultimaEvaluacion(id!),
    enabled: !!id,
  });

  // El mismo snapshot de listas que usa el Motor PLD. Que la matriz y el motor
  // midan el riesgo de país contra fuentes distintas sería la manera más fácil
  // de que el sistema se contradiga sobre el mismo compareciente.
  const { data: listas } = useQuery({
    queryKey: ["paises-en-listas"],
    queryFn: paisesEnListas,
    staleTime: 10 * 60 * 1000,
  });

  // La lista interna de zonas de atención. Viene vacía hasta que Cumplimiento
  // la cargue, y mientras esté vacía la variable de zona no puntúa ni se pide.
  const { data: zonas = [] } = useQuery({
    queryKey: ["zonas-atencion"],
    queryFn: zonasDeAtencion,
    staleTime: 10 * 60 * 1000,
  });

  // Qué catálogos hay cargados hoy. Una variable que declara `requiere_catalogo`
  // y cuyo catálogo falta queda fuera del máximo, del mínimo y de la captura:
  // exigirla dejaría la matriz imposible de cerrar, y responderla «sin
  // observaciones» le daría la calificación más baja a cualquier ubicación.
  const catalogos = useMemo(
    () => new Set(zonas.length > 0 ? ["zona_atencion"] : []),
    [zonas.length],
  );

  /**
   * Lo que la matriz se responde sola.
   *
   * Se recalcula con el acto más reciente del compareciente: el riesgo no es
   * una foto del día del alta, se mueve con lo que la persona hace. Registrar
   * una operación en dólares cambia una respuesta, y la matriz tiene que
   * enterarse sin que nadie vuelva a abrirla a mano.
   */
  const contexto: ContextoPrellenado | null =
    plantilla && client
      ? {
          tipo_persona: client.tipo_persona,
          pais_iso2: client.pais_residencia_iso2,
          // La nacionalidad, aparte de la residencia: la matriz v3 toma el más
          // alto de los tres países y la DIVERGENCIA entre ellos es la señal.
          pais_nacionalidad: client.pais_nacionalidad_clave,
          tipo_acto: (ops[0]?.contraparte as Record<string, unknown> | null)?.tipo_acto as
            | string
            | undefined,
          moneda_origen: ops[0]?.moneda_origen,
          activo_virtual: ops[0]?.activo_virtual,
          forma_pago: ops[0]?.forma_pago,
          pais_origen_recursos: ops[0]?.pais_origen_recursos,
          actividad_clave: client.actividad_economica_clave,
          gafi_gris: listas?.gafi_gris,
          gafi_negra: listas?.gafi_negra,
          plenario_gafi: listas?.plenario,
          canal_distribucion: client.canal_distribucion,
          zonas_atencion: zonas,
          entidad_cliente: client.entidad_federativa_clave,
          municipio_cliente: client.municipio,
          entidad_inmueble: ops[0]?.entidad_federativa_inmueble,
          municipio_inmueble: ops[0]?.municipio_inmueble,
          frecuencia_esperada_anual: client.frecuencia_esperada_anual,
          // La MISMA ventana móvil de seis meses del art. 7 que usa el motor.
          // Dos ventanas distintas para el mismo cliente sería la manera más
          // fácil de que el sistema se contradiga sobre él.
          operaciones_en_ventana: operacionesEnVentana(ops.map((o) => o.fecha)),
          // El margen del perfil transaccional sale del registro versionado y
          // firmado, no de una constante: la instrucción 12 de la Adenda retiró
          // el redondeo que equivalía a una tolerancia del 50 % no documentada.
          // Sin parámetro cargado la variable se queda sin responder.
          margen_perfil: valorParam(PARAM.MARGEN_PERFIL, "XII"),
        }
      : null;

  const sugeridas: RespuestaSugerida[] =
    plantilla && contexto ? prellenarMatriz(plantilla.configuracion, contexto) : [];
  const porVariable = new Map(sugeridas.map((r) => [r.variable_codigo, r]));

  // Las banderas booleanas que no suman puntos pero fuerzan la banda: hoy sólo
  // el llamado a la acción del GAFI, que el puntaje agrupa con la lista gris
  // —agrupar para puntuar es aceptable— y que el flujo tiene que separar,
  // porque conlleva contramedidas y no simplemente diligencia reforzada.
  const indicadores = contexto ? indicadoresDerivados(contexto) : {};
  const ctxEvaluacion: ContextoEvaluacion = {
    catalogos_disponibles: catalogos,
    indicadores,
  };

  // Se abre con lo que se respondió la última vez. Volver a capturar veinte
  // variables para cambiar una sola es la clase de fricción que hace que la
  // matriz no se actualice nunca.
  //
  // Y lo que nunca se ha respondido arranca con la sugerencia del sistema. NO
  // pisa lo que el OC ya contestó: una evaluación guardada es su juicio, y
  // reescribirla con una deducción del software sería sustituirlo en silencio.
  useEffect(() => {
    if (evaluacion && evaluacion.id !== precargada) {
      setRespuestas(evaluacion.respuestas ?? {});
      setPrecargada(evaluacion.id);
    }
  }, [evaluacion, precargada]);

  useEffect(() => {
    if (sugeridas.length === 0) return;
    setRespuestas((previas) => {
      const siguientes = { ...previas };
      let cambio = false;
      for (const r of sugeridas) {
        if (typeof siguientes[r.variable_codigo] !== "number") {
          siguientes[r.variable_codigo] = r.valor;
          cambio = true;
        }
      }
      return cambio ? siguientes : previas;
    });
    // Depende del contenido, no de la identidad del arreglo: se recalcula en
    // cada render y compararlo por referencia dispararía el efecto siempre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sugeridas)]);

  const guardar = useMutation({
    mutationFn: () =>
      evaluarRiesgoCliente(plantilla!, client!, respuestas, {
        ...ctxEvaluacion,
        plenario_gafi: listas?.plenario,
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["cliente", id] });
      queryClient.invalidateQueries({ queryKey: ["evaluacion", id] });
      queryClient.invalidateQueries({ queryKey: ["evaluaciones"] });
      for (const w of r.warnings) toast.warning(w);
      toast.success(
        `Evaluación guardada · score ${r.score_total} · riesgo ${r.clasificacion.toUpperCase()}` +
          (r.triggers_activados.length ? ` (alto de oficio: ${r.triggers_activados.join(", ")})` : ""),
      );
    },
    onError: (e: Error) => toast.error(`No se pudo guardar la evaluación: ${e.message}`),
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando cliente…
      </div>
    );
  }
  if (!client) return <div className="p-8 text-center text-muted-foreground">Cliente no encontrado</div>;

  const kyc = client.datos_kyc ?? {};
  const elementos = plantilla ? elementosAplicables(plantilla.configuracion, client.tipo_persona) : [];
  const completa = plantilla
    ? respuestasCompletas(plantilla.configuracion, client.tipo_persona, respuestas, catalogos)
    : false;
  // Vista previa en vivo: mismo cálculo que se persistirá al guardar.
  const preview = completa
    ? evaluarMatriz(plantilla!.configuracion, client.tipo_persona, respuestas, ctxEvaluacion)
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <Link
        to="/clientes"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {L.volverAClientes}
      </Link>

      <div className="glass-card p-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-bold text-foreground">{client.nombre_razon_social}</h1>
          <div className="text-right shrink-0">
            <BadgeRiesgo
              clasificacion={evaluacion?.clasificacion}
              score={evaluacion?.score_total}
            />
            <p className="text-[13px] text-muted-foreground mt-1">
              {evaluacion
                ? `Evaluado el ${new Date(evaluacion.evaluado_en).toLocaleDateString("es-MX")}`
                : "Sin matriz aplicada"}
            </p>
            {evaluacion?.motivo_alto_de_oficio && (
              <p className="text-[13px] text-destructive mt-0.5 max-w-xs">
                {evaluacion.motivo_alto_de_oficio}
              </p>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {tipoLabel[client.tipo_persona]} · {client.rfc ?? "sin RFC"} ·{" "}
          {nivelConocimiento(client.tipo_persona, client.nivel_kyc)}
          {client.alto_de_oficio && (
            <span className="ml-2 status-badge bg-destructive/10 text-destructive">Alto de oficio</span>
          )}
        </p>
      </div>

      <Tabs defaultValue="datos" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="datos">Datos generales</TabsTrigger>
          {/* La pestaña existe si la organización tiene una plantilla vigente
              para su sector, no según el perfil de actividad. Así no hay que
              tocar este condicional al entrar joyerías, vehículos, etc. */}
          {plantilla && <TabsTrigger value="matriz">Matriz de riesgo</TabsTrigger>}
          <TabsTrigger value="operaciones">{esNotarias ? "Actos" : "Operaciones"}</TabsTrigger>
        </TabsList>

        <TabsContent value="datos">
          <div className="glass-card p-6 grid grid-cols-2 gap-6">
            {[
              { label: "Nombre / Razón social", value: client.nombre_razon_social },
              { label: "RFC", value: client.rfc ?? "N/A" },
              { label: "CURP", value: client.curp ?? "N/A" },
              { label: "Nacionalidad", value: client.nacionalidad ?? "N/A" },
              { label: "Entidad federativa", value: client.entidad_federativa ?? "N/A" },
              { label: "País de residencia", value: client.pais_residencia_iso2 ?? "N/A" },
              { label: "Email", value: (kyc.email as string) ?? "N/A" },
              { label: "Teléfono", value: (kyc.telefono as string) ?? "N/A" },
              { label: "Ocupación / giro", value: (kyc.ocupacion as string) ?? "N/A" },
              { label: "Origen de recursos", value: (kyc.origen_recursos as string) ?? "N/A" },
            ].map((f) => (
              <div key={f.label}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {f.label}
                </p>
                <p className="text-sm font-medium text-foreground mt-1">{f.value}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        {plantilla && (
        <TabsContent value="matriz">
          {!plantilla ? (
            <div className="glass-card p-6 text-sm text-muted-foreground">
              Esta organización no tiene una matriz de riesgo vigente.
            </div>
          ) : (
            <div className="space-y-4">
              {elementos.map((el) => (
                <div key={el.codigo} className="glass-card p-5">
                  <p className="text-sm font-semibold text-foreground mb-3">{el.nombre}</p>
                  <div className="space-y-3">
                    {el.variables.map((v) => {
                      const sugerida = porVariable.get(v.codigo);
                      // Una variable cuyo catálogo no está cargado no puntúa y
                      // no se pide. Se muestra deshabilitada y con el motivo:
                      // esconderla dejaría a la matriz aparentando que ese
                      // factor no existe, y las RCG lo exigen aunque hoy no se
                      // pueda calificar.
                      const sinCatalogo = !variablePuntua(v, catalogos);
                      // Sugerida y todavía sin tocar por el OC. Si él la
                      // cambió, deja de ser del sistema y la marca se va.
                      const delSistema =
                        sugerida != null && respuestas[v.codigo] === sugerida.valor;
                      return (
                      <div key={v.codigo} className="grid grid-cols-2 gap-3 items-start">
                        <div>
                          <span className="text-sm text-muted-foreground">{v.pregunta}</span>
                          {sinCatalogo && (
                            <p className="text-[13px] mt-0.5 text-warning">
                              No califica todavía: la lista interna «{v.requiere_catalogo}» está
                              vacía. La variable queda fuera del puntaje hasta que Cumplimiento la
                              cargue, en vez de responder «sin observaciones» a cualquier ubicación.
                            </p>
                          )}
                          {/* La fuente, siempre. Una respuesta que el software
                              puso y que nadie puede rastrear es peor que un
                              campo vacío: el OC la firma sin saber de dónde
                              salió. */}
                          {delSistema && (
                            // Ámbar cuando salió de un valor por omisión y no de un
                            // dato del expediente. Que las dos se vieran igual haría
                            // que nadie fuera a revisar la que sí hace falta revisar.
                            <p
                              className={cn(
                                "text-[13px] mt-0.5",
                                sugerida!.por_defecto ? "text-warning" : "text-accent",
                              )}
                            >
                              {sugerida!.por_defecto
                                ? "Sin dato para determinarla: "
                                : "La respondió el sistema: "}
                              {sugerida!.fuente}
                              {sugerida!.por_defecto
                                ? " Revísala."
                                : " Cámbiala si no corresponde."}
                            </p>
                          )}
                        </div>
                        <Select
                          value={respuestas[v.codigo]?.toString() ?? ""}
                          disabled={sinCatalogo}
                          onValueChange={(val) =>
                            setRespuestas({ ...respuestas, [v.codigo]: Number(val) })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione…" />
                          </SelectTrigger>
                          <SelectContent>
                            {v.opciones.map((o) => (
                              <SelectItem key={o.valor} value={o.valor.toString()}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* La bandera de flujo, aparte del puntaje. El llamado a la
                  acción del GAFI conlleva CONTRAMEDIDAS, no diligencia
                  reforzada: la escala lo agrupa con la lista gris y aquí se
                  separa, porque el flujo no puede agruparlos. */}
              {indicadores.GAFI_LLAMADO_ACCION && (
                <div className="glass-card p-4 border-l-4 border-l-destructive">
                  <p className="text-sm font-semibold text-foreground">
                    País bajo llamado a la acción del GAFI
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Conlleva contramedidas, no sólo diligencia reforzada. El expediente entra en
                    banda alta con independencia del puntaje y requiere revisión del Oficial de
                    Cumplimiento antes de continuar.
                  </p>
                </div>
              )}

              <div className="glass-card p-4 flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  {completa ? (
                    <>
                      Captura completa.{" "}
                      {preview!.indice != null ? (
                        <>
                          Índice:{" "}
                          <strong className="text-foreground">{preview!.indice}</strong> de 100
                          {" "}(puntaje {preview!.score_total} de {preview!.maximo})
                        </>
                      ) : (
                        <>
                          Score: <strong className="text-foreground">{preview!.score_total}</strong>
                        </>
                      )}{" "}
                      · Riesgo:{" "}
                      <strong className={riesgoClase[preview!.clasificacion]}>
                        {preview!.clasificacion.toUpperCase()}
                      </strong>
                      {preview!.triggers_activados.length > 0 && (
                        <> · alto de oficio por {preview!.triggers_activados.join(", ")}</>
                      )}
                      {/* Los cortes de 40 y 70 no se han calibrado contra una
                          muestra real. Presentarlos como definitivos es justo
                          lo que la Adenda pide no hacer. */}
                      {preview!.provisional && (
                        <span className="block text-warning mt-1">
                          Clasificación provisional: los cortes de la escala todavía no se han
                          calibrado contra una muestra real de expedientes.
                        </span>
                      )}
                      {preview!.variables_sin_catalogo.length > 0 && (
                        <span className="block text-warning mt-1">
                          {preview!.variables_sin_catalogo.length} variable(s) quedaron fuera del
                          puntaje por falta de su lista interna.
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      El sistema respondió{" "}
                      <strong className="text-foreground">{sugeridas.length}</strong> de{" "}
                      <strong className="text-foreground">
                        {sugeridas.length + faltanPorResponder(
                          plantilla!.configuracion, client.tipo_persona, respuestas, catalogos,
                        ).length}
                      </strong>{" "}
                      con lo que ya está capturado. Faltan las que no puede saber por sí solo:
                      si el compareciente es PEP y quién es el beneficiario controlador.
                    </>
                  )}
                </p>
                <Button
                  className="gap-2 shrink-0"
                  disabled={!completa || guardar.isPending}
                  onClick={() => guardar.mutate()}
                >
                  {guardar.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Guardar evaluación
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
        )}

        <TabsContent value="operaciones">
          <div className="glass-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {[
                    "Fecha",
                    esNotarias ? "Tipo de acto" : "Tipo",
                    "Monto",
                    esNotarias ? "Valor (UMA)" : "Activo",
                    "Requiere aviso",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ops.map((op) => (
                  <tr key={op.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-sm">
                      {new Date(op.fecha).toLocaleDateString("es-MX")}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {esNotarias ? labelTipoActo((op.contraparte as Record<string, unknown>)?.tipo_acto) : op.tipo}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">{formatMxn(op.monto_mxn)}</td>
                    <td className="px-4 py-3 text-sm">
                      {esNotarias
                        ? umaMxn != null
                          ? `${Math.round(op.monto_mxn / umaMxn).toLocaleString("es-MX")} UMA`
                          : "—"
                        : (op.activo_virtual ?? "—")}
                    </td>
                    <td className="px-4 py-3">
                      {op.requiere_aviso ? (
                        <span className="status-badge bg-warning/10 text-warning">Sí</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">No</span>
                      )}
                    </td>
                  </tr>
                ))}
                {ops.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Sin operaciones registradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
