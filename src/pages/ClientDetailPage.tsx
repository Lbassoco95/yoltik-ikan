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
  ultimoCambioDeNivel,
  guardarSubdivision,
} from "@/lib/api/clientes";
import { BadgeRiesgo } from "@/components/riesgo/BadgeRiesgo";
import { EstructuraSocietaria } from "@/components/clientes/EstructuraSocietaria";
import { Identificacion } from "@/components/clientes/Identificacion";
import { listarOperacionesDeCliente } from "@/lib/api/operaciones";
import {
  paisesEnListas,
  paisesQueExigenSubdivision,
  paisesSancionados,
  subdivisionesConRiesgo,
  zonasDeAtencion,
} from "@/lib/api/catalogos";
import {
  ACCION_POR_MOTIVO,
  faltasExplicadas,
  indicadoresDerivados,
  sancionesDelExpediente,
  prellenarMatriz,
  type ContextoPrellenado,
  type MotivoFalta,
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
import { estaBloqueado, indicadorDeSanciones } from "@/lib/riesgo/sanciones";
import { faltaSubdivision, paisDelDomicilio } from "@/lib/riesgo/subdivision";
import { banderaBandaDeUmbral, umbralDelActo } from "@/lib/riesgo/tramos";
import { cn, formatMxn } from "@/lib/utils";
import { useParametros } from "@/hooks/useParametros";
import { PARAM } from "@/lib/parametros";
import type { SectorAV, TipoPersona } from "@/types/domain";
import { useAuth } from "@/lib/auth-context";
import { LABELS, labelTipoActo, nivelConocimiento } from "@/lib/perfil-actividad";
import { DETALLE_NIVEL, ETIQUETA_NIVEL } from "@/lib/riesgo/nivel-diligencia";

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
  /** Variables que el OC cambió a mano en esta sesión. El pre-llenado no las pisa. */
  const [editadas, setEditadas] = useState<Set<string>>(new Set());
  /**
   * Clave de la opción elegida, por variable.
   *
   * Aparte del número porque el número no identifica la opción: `XII-ACT-01`
   * tiene once actos y cuatro valores de riesgo —seis valen 3 y cuatro valen
   * 4—, así que un select con valor 4 empataba con cuatro opciones a la vez.
   */
  const [claves, setClaves] = useState<Record<string, string>>({});
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
  // La clave lleva la ORGANIZACIÓN. `country_risk_list` es por organización y
  // RLS la acota, pero la caché de React Query no sabe de RLS: con una clave
  // global, un cambio de contexto dentro de los diez minutos de `staleTime`
  // serviría las listas de la organización anterior. Hoy un usuario pertenece a
  // una sola, así que es un riesgo teórico; cuesta una línea cerrarlo.
  const { data: listas, isSuccess: listasCargadas } = useQuery({
    queryKey: ["paises-en-listas", profile?.organization_id],
    queryFn: paisesEnListas,
    staleTime: 10 * 60 * 1000,
  });

  // Los países bajo sanción de la ONU y de OFAC (migration 0053). Consulta
  // aparte del GAFI y no un filtro más sobre la misma: miden cosas distintas y
  // pesan distinto, y devolverlas juntas invitaría a tratarlas igual.
  const { data: sanciones, isSuccess: sancionesCargadas } = useQuery({
    queryKey: ["paises-sancionados", profile?.organization_id],
    queryFn: paisesSancionados,
    staleTime: 10 * 60 * 1000,
  });

  // Por qué está en el nivel que está. Un nivel sin motivo a la vista es un
  // número que nadie puede discutir.
  const { data: cambioNivel } = useQuery({
    queryKey: ["cambio-nivel", id],
    queryFn: () => ultimoCambioDeNivel(id!),
    enabled: !!id,
  });

  // Las subdivisiones con nivel propio y los países que la exigen. Se leen de
  // la base y no se escriben en el código: la lista cambia por determinación de
  // una autoridad, y una copia aquí se queda vieja sin dar señal.
  const { data: subdivisiones = [] } = useQuery({
    queryKey: ["subdivisiones-riesgo"],
    queryFn: subdivisionesConRiesgo,
    staleTime: 60 * 60 * 1000,
  });
  const { data: exigenSubdivision } = useQuery({
    queryKey: ["paises-exigen-subdivision"],
    queryFn: paisesQueExigenSubdivision,
    staleTime: 60 * 60 * 1000,
  });

  // La lista interna de zonas de atención. Viene vacía hasta que Cumplimiento
  // la cargue, y mientras esté vacía la variable de zona no puntúa ni se pide.
  const { data: zonas = [] } = useQuery({
    queryKey: ["zonas-atencion", profile?.organization_id],
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
  // El acto más reciente, en UMA y contra el umbral que le toca. Se calcula con
  // la UMA vigente; el motor usa la del día del acto, y esa diferencia importa
  // sólo en el cruce del 1 de febrero.
  const actoReciente = ops[0];
  const tipoActoReciente = (actoReciente?.contraparte as Record<string, unknown> | null)
    ?.tipo_acto as string | undefined;
  const montoUma =
    actoReciente != null && umaMxn != null && umaMxn > 0
      ? actoReciente.monto_mxn / umaMxn
      : null;
  const umbralUma = umbralDelActo(tipoActoReciente, (c) => valorParam(c, "XII")).umbral;

  // Las banderas que suman FUERA de la escala de magnitud. La de banda de
  // umbral existía desde la instrucción 2 y nunca llegaba a `calcularIndice`:
  // se calculaba, se probaba, y su puntaje se perdía. Una operación al 95 % del
  // umbral puntuaba igual que una al 30 %.
  const bandera = montoUma != null ? banderaBandaDeUmbral(montoUma, umbralUma) : null;

  const contexto: ContextoPrellenado | null =
    plantilla && client
      ? {
          tipo_persona: client.tipo_persona,
          pais_iso2: client.pais_residencia_iso2,
          // La nacionalidad, aparte de la residencia: la matriz v3 toma el más
          // alto de los tres países y la DIVERGENCIA entre ellos es la señal.
          pais_nacionalidad: client.pais_nacionalidad_clave,
          tipo_acto: tipoActoReciente,
          moneda_origen: ops[0]?.moneda_origen,
          activo_virtual: ops[0]?.activo_virtual,
          forma_pago: ops[0]?.forma_pago,
          pais_origen_recursos: ops[0]?.pais_origen_recursos,
          actividad_clave: client.actividad_economica_clave,
          // El valor del acto en UMA y el umbral que le toca. Sin esto la
          // variable de magnitud —el corazón de la escala relativa al umbral—
          // no se pre-llenaba nunca, y la bandera de banda de umbral no tenía
          // con qué calcularse.
          monto_uma: montoUma,
          umbral_uma: umbralUma,
          // El snapshot del GAFI SÓLO cuando terminó de cargar.
          //
          // Con la consulta en vuelo, `nivelDePais` no encuentra al país en
          // ninguna lista y responde «sin observaciones»: Irán salía como
          // jurisdicción limpia y el valor quedaba escrito. Es el falso
          // negativo silencioso de manual, y encima se veía contestado.
          // Mientras no haya listas, la variable de país no se responde.
          gafi_gris: listasCargadas ? listas?.gafi_gris : undefined,
          gafi_negra: listasCargadas ? listas?.gafi_negra : undefined,
          plenario_gafi: listas?.plenario,
          // Las dos consultas tienen que haber terminado. Con las sanciones en
          // vuelo, un compareciente cubano saldría sin bandera y el valor
          // quedaría escrito: el mismo falso negativo que el del GAFI, con otra
          // lista.
          listas_cargadas: listasCargadas && sancionesCargadas,
          sanciones: sancionesCargadas ? sanciones : undefined,
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
          // «No hay actos» y «hay un acto al que le falta un dato» mandan al OC
          // a pantallas distintas, así que la matriz tiene que poder decir cuál
          // de las dos es.
          hay_actos: ops.length > 0,
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
  // El detalle de las sanciones, aparte del booleano que consume la matriz: un
  // bloqueo que no dice por qué no se puede levantar.
  const riesgoSanciones = contexto ? sancionesDelExpediente(contexto) : null;
  const bloqueado = estaBloqueado(riesgoSanciones);
  // La atención no levanta piso: se informa y nada más. Pintarla con el mismo
  // aviso que el riesgo alto trataría a un compareciente croata igual que a uno
  // iraní, que es justo lo que la Adenda 4 resolvió que no.
  const levantaPiso = indicadorDeSanciones(riesgoSanciones);

  // La subdivisión del domicilio, cuando el país la exige. No bloquea el alta
  // —el expediente se completa en pasos— pero tiene que verse: sin ella no se
  // puede distinguir un acto en Leópolis de uno en una región ocupada.
  const guardarSub = useMutation({
    mutationFn: (clave: string | null) => guardarSubdivision(client!.id, clave),
    onSuccess: () => {
      toast.success("Subdivisión guardada");
      queryClient.invalidateQueries({ queryKey: ["cliente", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // `client` es undefined mientras la consulta carga, y estas líneas corren
  // ANTES de la guarda de más abajo: los hooks se ejecutan todos antes de
  // cualquier return. Leer `client.subdivision_clave` sin protección reventaba
  // en el PRIMER render de cada visita, y como no había ErrorBoundary el
  // resultado era la pantalla en blanco. No fallaba a veces: fallaba siempre.
  const paisDomicilio = paisDelDomicilio(client);
  const subdivisionDelCliente = subdivisiones.find(
    (x) => x.clave === client?.subdivision_clave,
  );
  const subdivisionFalta =
    client != null &&
    exigenSubdivision != null &&
    faltaSubdivision(
      paisDomicilio,
      client.subdivision_clave,
      new Set(exigenSubdivision.keys()),
      client.subdivision_fuera_de_lista,
    );
  const ctxEvaluacion: ContextoEvaluacion = {
    catalogos_disponibles: catalogos,
    indicadores,
    claves,
    // Suma al puntaje sin entrar al máximo: es excepcional por definición y
    // meterla en el denominador diluiría todo lo demás.
    puntaje_extra: bandera?.puntos ?? 0,
  };

  // Se abre con lo que se respondió la última vez. Volver a capturar veinte
  // variables para cambiar una sola es la clase de fricción que hace que la
  // matriz no se actualice nunca.
  //
  // Abrir el expediente empieza un borrador NUEVO: lo que se cargó es la
  // evaluación anterior, que queda íntegra en `client_risk_assessment` y no se
  // toca. Por eso `editadas` arranca vacío.
  useEffect(() => {
    if (evaluacion && evaluacion.id !== precargada) {
      setRespuestas(evaluacion.respuestas ?? {});
      setClaves(evaluacion.respuestas_clave ?? {});
      setEditadas(new Set());
      setPrecargada(evaluacion.id);
    }
  }, [evaluacion, precargada]);

  /**
   * Las derivaciones del sistema PISAN lo que no haya tocado el OC.
   *
   * Antes sólo rellenaban huecos, y eso tenía dos consecuencias malas:
   *
   *   · Una evaluación guardada congelaba sus respuestas. Si el compareciente
   *     otorgaba después un poder irrevocable, la matriz seguía respondiendo
   *     con la compraventa anterior y el piso PODER_IRREVOCABLE no se
   *     activaba nunca. El comentario de arriba prometía justo lo contrario.
   *
   *   · Una respuesta escrita mientras las listas del GAFI iban en vuelo se
   *     quedaba, aunque después llegaran y dijeran otra cosa.
   *
   * Lo que se protege es el JUICIO DEL OC, no cualquier número que ya esté en
   * el formulario. Por eso se distingue: lo que él cambió a mano en esta
   * sesión no se pisa; lo demás se recalcula con los datos de hoy.
   *
   * La evaluación anterior no se pierde: es un registro histórico y sigue
   * entera en la base. Lo que se está editando es un borrador nuevo, y un
   * borrador nuevo tiene que reflejar el expediente de hoy.
   */
  useEffect(() => {
    if (sugeridas.length === 0) return;
    setRespuestas((previas) => {
      const siguientes = { ...previas };
      let cambio = false;
      for (const r of sugeridas) {
        if (editadas.has(r.variable_codigo)) continue;
        if (siguientes[r.variable_codigo] === r.valor) continue;
        siguientes[r.variable_codigo] = r.valor;
        cambio = true;
      }
      return cambio ? siguientes : previas;
    });
    // Y la clave, que es lo que identifica la opción cuando varias comparten
    // puntaje. Sin esto el select quedaba en blanco aunque el número estuviera.
    setClaves((previas) => {
      const siguientes = { ...previas };
      let cambio = false;
      for (const r of sugeridas) {
        if (!r.clave || editadas.has(r.variable_codigo)) continue;
        if (siguientes[r.variable_codigo] === r.clave) continue;
        siguientes[r.variable_codigo] = r.clave;
        cambio = true;
      }
      return cambio ? siguientes : previas;
    });
    // Depende del contenido, no de la identidad del arreglo: se recalcula en
    // cada render y compararlo por referencia dispararía el efecto siempre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sugeridas), editadas]);

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
  // Lo que falta, con el motivo de cada hueco.
  const faltas =
    plantilla && contexto
      ? faltasExplicadas(plantilla.configuracion, contexto, respuestas, catalogos)
      : [];
  // Agrupadas por causa, en el orden en que el OC las va a atender: primero lo
  // que se resuelve en otra pantalla, al final lo que le toca decidir a él.
  const ORDEN_MOTIVO: MotivoFalta[] = ["sin_actos", "sin_dato", "sin_parametro", "requiere_criterio"];
  const faltasPorMotivo = ORDEN_MOTIVO.map(
    (m) => [m, faltas.filter((f) => f.motivo === m)] as const,
  ).filter(([, lista]) => lista.length > 0);

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
          <span title={DETALLE_NIVEL[client.nivel_kyc]}>
            {nivelConocimiento(client.tipo_persona, client.nivel_kyc)} ·{" "}
            {ETIQUETA_NIVEL[client.nivel_kyc]}
          </span>
          {client.alto_de_oficio && (
            <span className="ml-2 status-badge bg-destructive/10 text-destructive">Alto de oficio</span>
          )}
        </p>
        {cambioNivel && (
          <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl">
            {cambioNivel.automatico ? "Subió" : "Se movió"} de {cambioNivel.desde} a{" "}
            {cambioNivel.hacia} el{" "}
            {new Date(cambioNivel.registrado_en).toLocaleDateString("es-MX")}:{" "}
            {cambioNivel.motivo}
            {!cambioNivel.automatico && " (decisión firmada)"}
          </p>
        )}
      </div>

      <Tabs defaultValue="datos" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="datos">Datos generales</TabsTrigger>
          {/* La pestaña existe si la organización tiene una plantilla vigente
              para su sector, no según el perfil de actividad. Así no hay que
              tocar este condicional al entrar joyerías, vehículos, etc. */}
          {plantilla && <TabsTrigger value="matriz">Matriz de riesgo</TabsTrigger>}
          {/* Sólo persona moral: el beneficiario controlador es de quien tiene
              estructura de propiedad. Una persona física no la tiene, y la
              pestaña sólo podría decir eso. */}
          {client.tipo_persona === "moral" && (
            <TabsTrigger value="estructura">Estructura y beneficiario</TabsTrigger>
          )}
          {/* La identificación vive DENTRO del expediente, no en un tablero
              aparte: lo que Didit resolvió de esta persona y su condición de
              PPE son datos de este expediente, y buscarlos en otra pantalla
              obliga a salirse de él para responder su pregunta más básica. */}
          <TabsTrigger value="identificacion">Identificación</TabsTrigger>
          <TabsTrigger value="operaciones">{esNotarias ? "Actos" : "Operaciones"}</TabsTrigger>
        </TabsList>

        <TabsContent value="datos" className="space-y-4">
          {/* La subdivisión sólo se ofrece cuando el país la exige. Pedirla
              siempre sería un campo libre que nadie sabe rellenar; ofrecer sólo
              las que tienen nivel la convierte en una pregunta contestable. */}
          {paisDomicilio && exigenSubdivision?.has(paisDomicilio) && (
            <div className="glass-card p-6 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Subdivisión del domicilio
                </h3>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  {exigenSubdivision.get(paisDomicilio)}
                </p>
              </div>
              <Select
                value={
                  client.subdivision_clave ??
                  (client.subdivision_fuera_de_lista ? "fuera" : "")
                }
                onValueChange={(v) => guardarSub.mutate(v)}
              >
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder="Sin capturar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fuera">
                    Ninguna de las listadas — el domicilio está fuera de esas regiones
                  </SelectItem>
                  {subdivisiones
                    .filter((x) => x.pais_iso2 === paisDomicilio)
                    .map((x) => (
                      <SelectItem key={x.clave} value={x.clave}>
                        {x.nombre} · {x.clave}
                        {x.pendiente_confirmacion ? " (pendiente de confirmar)" : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Sólo aparecen las subdivisiones con nivel de riesgo propio. «Ninguna de las
                listadas» es una respuesta válida y significa que el domicilio está en el país
                pero fuera de las regiones alcanzadas.
              </p>
            </div>
          )}

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
                      // ¿Sus opciones tienen clave estable? Entonces se
                      // identifican por ella y no por su puntaje.
                      const porClave = v.opciones.every((o) => o.clave != null);
                      // Sugerida y todavía sin tocar por el OC. Si él la
                      // cambió, deja de ser del sistema y la marca se va.
                      // Exacto, no por coincidencia de valor: si el OC eligió
                      // a mano el mismo número que el sistema, la respuesta es
                      // suya y no debe presentarse como derivada.
                      const delSistema =
                        sugerida != null &&
                        !editadas.has(v.codigo) &&
                        respuestas[v.codigo] === sugerida.valor;
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
                          // Se identifica por CLAVE cuando las opciones la
                          // traen: con el valor, un select en 4 empataba con
                          // las cuatro opciones que valen 4 y pintaba sus
                          // cuatro etiquetas concatenadas.
                          value={
                            porClave
                              ? (claves[v.codigo] ?? "")
                              : (respuestas[v.codigo]?.toString() ?? "")
                          }
                          disabled={sinCatalogo}
                          onValueChange={(val) => {
                            const elegida = porClave
                              ? v.opciones.find((o) => o.clave === val)
                              : v.opciones.find((o) => o.valor === Number(val));
                            if (!elegida) return;
                            setRespuestas({ ...respuestas, [v.codigo]: elegida.valor });
                            setClaves((c) =>
                              elegida.clave ? { ...c, [v.codigo]: elegida.clave } : c,
                            );
                            // A partir de aquí es juicio del OC y el
                            // pre-llenado deja de tocarla.
                            setEditadas((s) => new Set(s).add(v.codigo));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione…" />
                          </SelectTrigger>
                          <SelectContent>
                            {v.opciones.map((o) => (
                              // La clave como `key` y como `value`: con el
                              // valor había cuatro items con el mismo, que es
                              // clave duplicada en React y empate en el Select.
                              <SelectItem
                                key={o.clave ?? o.valor}
                                value={porClave ? (o.clave as string) : o.valor.toString()}
                              >
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

              {/* Mientras el snapshot no llegue, la variable de país no se
                  responde y la matriz no se puede cerrar. Decirlo evita que
                  alguien lo lea como un campo que se le olvidó contestar. */}
              {!listasCargadas && (
                <div className="glass-card p-4 border-l-4 border-l-warning">
                  <p className="text-sm text-muted-foreground">
                    Cargando el snapshot de listas del GAFI. El riesgo país no se responde hasta
                    que llegue: sin las listas, cualquier jurisdicción se vería como «sin
                    observaciones».
                  </p>
                </div>
              )}

              {/* Los puntos que suman FUERA de la escala de magnitud. */}
              {bandera && (
                <div className="glass-card p-4 border-l-4 border-l-warning">
                  <p className="text-sm font-semibold text-foreground">
                    Operación en banda de umbral · +{bandera.puntos} puntos
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{bandera.detalle}</p>
                </div>
              )}

              {/* La subdivisión que falta. Va ANTES del nivel de país porque
                  puede cambiarlo: Ucrania es riesgo alto y Crimea prohibición,
                  y sin la subdivisión el expediente se está calificando con la
                  mitad del dato. */}
              {subdivisionFalta && paisDomicilio && (
                <div className="glass-card p-4 border-l-4 border-l-warning">
                  <p className="text-sm font-semibold text-foreground">
                    Falta la subdivisión del domicilio
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {exigenSubdivision?.get(paisDomicilio)}
                  </p>
                </div>
              )}

              {/* Y cuando sí está, se dice cuál y en qué nivel: una prohibición
                  subnacional que no se nombra no se puede explicar. */}
              {subdivisionDelCliente && (
                <div
                  className={cn(
                    "glass-card p-4 border-l-4",
                    subdivisionDelCliente.nivel_territorial === "prohibicion"
                      ? "border-l-destructive"
                      : "border-l-warning",
                  )}
                >
                  <p className="text-sm font-semibold text-foreground">
                    {subdivisionDelCliente.nombre}
                    {subdivisionDelCliente.pendiente_confirmacion &&
                      " — cobertura pendiente de confirmación"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {subdivisionDelCliente.derivacion}
                  </p>
                </div>
              )}

              {/* El nivel 1 de la Adenda 3. NO es un piso: un piso deja el
                  expediente en banda alta y permite seguir, y aquí lo que
                  procede es detenerse y escalar. Por eso va antes que todo lo
                  demás y no se mezcla con el puntaje. */}
              {bloqueado && riesgoSanciones && (
                <div className="glass-card p-4 border-l-4 border-l-destructive">
                  <p className="text-sm font-semibold text-destructive">
                    Jurisdicción bajo embargo — no continuar sin escalar
                  </p>
                  <p className="text-sm text-foreground mt-1">{riesgoSanciones.motivo}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    No se resuelve con puntos. El acto requiere escalamiento al Oficial de
                    Cumplimiento antes de continuar.
                  </p>
                </div>
              )}

              {/* El nivel 2: piso de banda alta, sin bloqueo. */}
              {!bloqueado && levantaPiso && riesgoSanciones && (
                <div className="glass-card p-4 border-l-4 border-l-warning">
                  <p className="text-sm font-semibold text-foreground">
                    País bajo régimen de sanciones
                  </p>
                  <p className="text-sm text-foreground mt-1">{riesgoSanciones.motivo}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    El expediente entra en banda alta con independencia del puntaje.
                    {riesgoSanciones.hay_onu
                      ? " Alcanzado por el Consejo de Seguridad: las resoluciones vinculan a México y su omisión no se pondera con el enfoque basado en riesgo."
                      : " Alcanzado sólo por OFAC, que es derecho extranjero y no obliga a un fedatario mexicano: pesa como exposición a sanciones secundarias y valor indiciario."}
                  </p>
                </div>
              )}

              {/* El nivel 3: se informa y no puntúa. Cuántos puntos suma no
                  está fijado —la variable de país no tiene clave para él— y
                  poner un número inventado sería peor que no puntuarlo. */}
              {!bloqueado && !levantaPiso && riesgoSanciones && (
                <div className="glass-card p-4 border-l-4 border-l-muted">
                  <p className="text-sm font-semibold text-foreground">
                    Jurisdicción en atención
                  </p>
                  <p className="text-sm text-foreground mt-1">{riesgoSanciones.motivo}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    No levanta piso de banda alta ni bloquea: se informa para que el Oficial de
                    Cumplimiento lo considere. Cuánto debe sumar al puntaje está pendiente de
                    definirse, así que hoy no lo mueve.
                  </p>
                </div>
              )}

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
                      <strong className="text-foreground">{sugeridas.length + faltas.length}</strong>{" "}
                      con lo que ya está capturado.
                      {/* Cada hueco con SU motivo. El texto anterior estaba
                          escrito a mano y nombraba dos variables cuando podían
                          faltar seis, y escondía que se atienden en lugares
                          distintos: unas al registrar el acto, otras en el alta,
                          y sólo algunas las contesta el OC. */}
                      {faltasPorMotivo.map(([motivo, lista]) => (
                        <span key={motivo} className="block mt-2">
                          <strong className="text-foreground">
                            {lista.length === 1 ? "Falta" : `Faltan ${lista.length}`}
                          </strong>{" "}
                          — {lista.map((f) => f.pregunta).join(" · ")}.{" "}
                          <span className="text-warning">{ACCION_POR_MOTIVO[motivo]}</span>
                        </span>
                      ))}
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

        {client.tipo_persona === "moral" && (
          <TabsContent value="estructura">
            <EstructuraSocietaria client={client} />
          </TabsContent>
        )}

        <TabsContent value="identificacion">
          <Identificacion client={client} />
        </TabsContent>

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
