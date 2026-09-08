import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EncabezadoSeccion } from "@/components/estela/EncabezadoSeccion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listarClientes } from "@/lib/api/clientes";
import { verificacionesVigentes } from "@/lib/api/verificacion";
import {
  listarOperaciones,
  crearOperacion,
  invocarMotor,
  actualizarDatosActo,
} from "@/lib/api/operaciones";
import type { FormaPago, NuevaOperacionInput, TipoOperacion } from "@/types/domain";
import { formatMxn, cn } from "@/lib/utils";
import { useParametros } from "@/hooks/useParametros";
import { PARAM } from "@/lib/parametros";
import { evaluarArticulo32 } from "@/lib/riesgo/articulo32";
import { useAuth } from "@/lib/auth-context";
import {
  LABELS,
  NOTA_CANALES,
  TIPOS_ACTO_NOTARIA,
  SUPUESTOS_AVISO_XII,
  canalDeActo,
  labelTipoActo,
} from "@/lib/perfil-actividad";
import { getClavesPadron } from "@/lib/api/organizacion";
import { PendientesAviso } from "@/components/aviso/PendientesAviso";
import { CapturaActo } from "@/components/aviso/CapturaActo";
import { SelectCatalogo } from "@/components/aviso/SelectCatalogo";

/**
 * Actos en los que hay un inmueble del que hablar.
 *
 * La ubicación del inmueble se preguntaba en TODOS los actos de fe pública,
 * incluida la constitución de una sociedad, donde no hay ninguno. Un formulario
 * que pide un dato que no existe no es sólo ruido: invita a inventarlo, y ese
 * invento acaba calificando la zona geográfica del expediente.
 *
 * La lista es corta a propósito. El fideicomiso entra porque el traslativo de
 * dominio suele serlo sobre un inmueble, aunque no siempre; ahí el campo es
 * opcional y quedarse vacío es una respuesta válida. Si Cumplimiento quiere
 * otro conjunto, es esta constante.
 */
const ACTOS_CON_INMUEBLE = new Set([
  "transmision_inmueble",
  "constitucion_modificacion_fideicomiso",
]);
import type { DatosActo } from "@/lib/aviso/valores-acto";
import { useActiveRole } from "@/hooks/useActiveRole";
import type { Operation } from "@/types/domain";
import {
  catalogosPendientes,
  pendientesActo,
  pendientesIdentificacion,
  pendientesCompareciente,
  pendientesSujetoObligado,
} from "@/lib/aviso/completitud";


const TIPOS: { value: TipoOperacion; label: string }[] = [
  { value: "compra_fiat_cripto", label: "Compra fiat → cripto" },
  { value: "venta_cripto_fiat", label: "Venta cripto → fiat" },
  { value: "retiro_cripto", label: "Retiro cripto" },
  { value: "deposito_fiat", label: "Depósito fiat" },
  { value: "otro", label: "Otro" },
];

/** Hoy, en AAAA-MM-DD local. El acto se firma hoy en la inmensa mayoría de los
 *  casos; que venga precargada evita que el notario lo deje en la fecha de
 *  captura sin darse cuenta cuando sí difiere. */
function hoyISO() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

const FORM_INICIAL = {
  client_id: "",
  tipo: "compra_fiat_cripto" as TipoOperacion,
  monto_mxn: "",
  activo_virtual: "",
  pais_iso2: "",
  tipo_acto: "",
  fecha: hoyISO(),
  instrumento_publico: "",
  datos_acto: {} as DatosActo,
  forma_pago: "" as FormaPago | "",
  pais_origen_recursos: "",
  // Zona geográfica del inmueble (migration 0041). Del INMUEBLE, no del
  // domicilio del cliente: son cosas distintas y las dos cuentan como factor
  // geográfico. Alguien domiciliado en Guadalajara que compra en una zona de
  // atención es justo el caso que el factor existe para ver.
  entidad_federativa_inmueble: "",
  municipio_inmueble: "",
  efectivo_mxn: "",
  fecha_pago: "",
  pago_de_tercero: false,
};

export default function OperationsPage() {
  // El buscador del encabezado navega aquí con ?q=. Se toma como valor
  // INICIAL, no como fuente de verdad: a partir de ahí manda el campo de esta
  // pantalla, y escribir en él no reescribe la URL a cada tecla.
  const [parametrosUrl] = useSearchParams();
  const [search, setSearch] = useState(() => parametrosUrl.get("q") ?? "");
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  // Acto cuyo expediente se está completando desde la lista. El detalle del
  // acto rara vez está entero el día de la firma.
  const [actoEnCurso, setActoEnCurso] = useState<Operation | null>(null);
  /** Forma de pago y origen del acto que se está completando (migration 0036). */
  // `FormaPago | ""` y no `string`: la columna es un enum de tres valores, y con
  // el tipo suelto un valor equivocado llegaba hasta la base para fallar ahí.
  const [extrasEnCurso, setExtrasEnCurso] = useState<{
    forma_pago: FormaPago | "";
    pais_origen_recursos: string;
  }>({ forma_pago: "", pais_origen_recursos: "" });
  const [datosEnCurso, setDatosEnCurso] = useState<DatosActo>({});
  const queryClient = useQueryClient();
  const { perfilActividad } = useAuth();
  const { activeRole } = useActiveRole();
  // Completar un acto ya registrado es de OC/Admin: la política
  // `operation_update_motor_or_oc` sólo se lo permite a ellos y el flujo del
  // Operador termina con el acuse (docs/ROLES.md).
  const puedeCompletar = activeRole === "oc" || activeRole === "admin";
  const L = LABELS[perfilActividad];
  const esNotarias = perfilActividad === "notarias";

  // Umbrales y UMA vienen de `parametro_regulatorio` (migration 0011), no de
  // constantes. Si un parámetro no está vigente, `valor()` devuelve undefined
  // y la UI muestra un guion en vez de inventar una cifra.
  const { valor: valorParam } = useParametros();
  const umaMxn = valorParam(PARAM.UMA_DIARIA);
  // Activos virtuales. Los umbrales de 645 y 3,210 UMA que había aquí quedaron
  // DEROGADOS por la reforma DOF 16/07/2025: son 210 UMA por operación y 4 UMA
  // sobre la contraprestación cobrada. La pantalla los publicaba mientras el
  // motor ya usaba los vigentes.
  const umbralOperacionUma = valorParam(PARAM.XVI_OPERACION, "XVI");
  const umbralComisionUma = valorParam(PARAM.XVI_CONTRAPRESTACION, "XVI");
  const umbralOperacionMxn =
    umaMxn != null && umbralOperacionUma != null ? umbralOperacionUma * umaMxn : undefined;
  const umbralComisionMxn =
    umaMxn != null && umbralComisionUma != null ? umbralComisionUma * umaMxn : undefined;

  const { data: operaciones = [], isLoading, isError, error } = useQuery({
    queryKey: ["operaciones"],
    queryFn: listarOperaciones,
  });
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: listarClientes });

  // Se comparte la misma clave de caché que Comparecientes e Identidad: las
  // tres pantallas tienen que decir lo mismo del mismo compareciente.
  const { data: verificaciones, isLoading: cargandoVerificaciones } = useQuery({
    queryKey: ["verificaciones-vigentes"],
    queryFn: async () => {
      const filas = await verificacionesVigentes();
      return new Map(filas.map((v) => [v.client_id, v.estado]));
    },
    enabled: esNotarias,
  });
  // Las claves del padrón se revisan una vez, no acto por acto: si faltan,
  // ningún aviso de la organización se puede generar.
  const { data: clavesPadron } = useQuery({
    queryKey: ["claves-padron"],
    queryFn: getClavesPadron,
    enabled: esNotarias,
  });

  const nombrePorCliente = new Map(clientes.map((c) => [c.id, c.nombre_razon_social]));
  const clientePorId = new Map(clientes.map((c) => [c.id, c]));

  /**
   * Qué umbral rebasa el monto, dicho con palabras.
   *
   * La fila se tiñe según esto, pero el tinte no informa a nadie que no
   * distinga esos colores, ni sobrevive a imprimir la tabla en blanco y negro.
   * El color refuerza; el texto es el que lleva el significado.
   */
  function umbralRebasado(monto: number): { etiqueta: string; clase: string } | null {
    if (umbralOperacionMxn != null && monto >= umbralOperacionMxn)
      return {
        // El texto lleva la cifra vigente, no una escrita a mano: si mañana
        // cambia el catálogo, cambia la etiqueta.
        etiqueta: `Alcanza el umbral de aviso (${umbralOperacionUma?.toLocaleString("es-MX")} UMA)`,
        clase: "bg-warning/15 text-warning-ink",
      };
    return null;
  }

  /** Cuántos datos le faltan a un acto ya registrado para entrar al aviso.
   *  Se calcula en la lista para que el rezago se vea sin abrir nada. */
  function bloqueosDelActo(op: (typeof operaciones)[number]): number {
    const cli = clientePorId.get(op.client_id);
    return [
      ...pendientesSujetoObligado(clavesPadron ?? {}),
      ...(cli ? pendientesCompareciente(cli) : []),
      ...pendientesActo({
        fecha: op.fecha,
        instrumento_publico: op.instrumento_publico,
        tipo_acto: (op.contraparte as Record<string, unknown> | null)?.tipo_acto as string,
        datos_acto: op.datos_acto,
      }),
    ].filter((p) => p.gravedad === "bloquea_aviso").length;
  }

  const alta = useMutation({
    mutationFn: async (input: NuevaOperacionInput) => {
      const op = await crearOperacion(input);
      // Recorrido completo, no acotado al acto: es lo que deja la constancia
      // de evaluación y lo que permite que una regla agregada vea su ventana.
      // El acuse al Operador sigue siendo neutro.
      await invocarMotor();
      return op;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operaciones"] });
      // El motor acaba de correr: la bandeja del OC y el periodo del aviso
      // cambiaron, y si no se refrescan la pantalla sigue enseñando el estado
      // de antes de la evaluación.
      queryClient.invalidateQueries({ queryKey: ["hallazgos"] });
      queryClient.invalidateQueries({ queryKey: ["hallazgos", "abiertos", "count"] });
      queryClient.invalidateQueries({ queryKey: ["periodo-aviso"] });
      toast.success("Operación registrada");
      setDialogAbierto(false);
      setForm(FORM_INICIAL);
    },
    onError: (e: Error) => toast.error(`No se pudo registrar: ${e.message}`),
  });

  const filtered = operaciones.filter((o) =>
    (nombrePorCliente.get(o.client_id) ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  /**
   * `diferir` sólo lo pasa el botón secundario, y es una decisión explícita de
   * quien captura: registrar el acto ahora y completar su expediente después.
   */
  function enviar(diferirExpediente = false) {
    if (!form.client_id) {
      toast.error(esNotarias ? "Seleccione un compareciente" : "Seleccione un cliente");
      return;
    }
    const monto = Number(form.monto_mxn);
    if (!Number.isFinite(monto) || monto < 0) {
      toast.error(esNotarias ? "Valor del acto inválido" : "Monto inválido");
      return;
    }
    if (esNotarias && !form.tipo_acto) {
      toast.error("Seleccione el tipo de acto");
      return;
    }
    if (!form.fecha) {
      toast.error(esNotarias ? "Capture la fecha del acto" : "Capture la fecha de la operación");
      return;
    }
    // El único rechazo de captura que se permite: un número de instrumento con
    // coma o punto hace que el portal tire el aviso completo el día 17, y
    // corregirlo entonces significa volver al protocolo. Se ataja aquí.
    const instrumento = form.instrumento_publico.trim().toUpperCase();
    if (instrumento && !/^[0-9A-Z_-]{1,20}$/.test(instrumento)) {
      toast.error(
        "El número de instrumento sólo admite letras, dígitos, guion medio y guion bajo",
      );
      return;
    }

    // Lo que el acto necesita para poder entrar al aviso, exigido AHORA.
    //
    // Estos datos están en el instrumento que se acaba de firmar: el tipo de
    // poder, el tipo de persona de cada compareciente, el capital social. El
    // día 17 no están en ninguna parte más que en el protocolo, y quien captura
    // ya no tiene a nadie a quien preguntarle. Dejarlos pasar por omisión es
    // mover el trabajo al peor momento posible y con menos información.
    //
    // Se exige SÓLO lo del acto. Lo que le falte al compareciente se exige en
    // su alta, y las claves del padrón en la configuración: cada registro
    // responde por lo suyo. Bloquear el acto porque a otra persona le falta el
    // RFC dejaría el instrumento SIN REGISTRAR, y un acto que no está en el
    // sistema no se ve, no se persigue y no aparece en ninguna bandeja.
    //
    // Y por lo mismo el bloqueo no es absoluto. Una modificación patrimonial
    // pide trece campos de su rama; si el que captura no tiene uno a mano a las
    // seis de la tarde, la alternativa a diferirlo no es que lo complete: es
    // que el acto no exista en Ikán. Así que se puede diferir a propósito, con
    // un botón aparte que dice lo que hace, y el acto queda contado como
    // incompleto en la lista y en el aviso hasta que alguien lo cierre.
    //
    // Lo que NO se difiere son la fecha, el instrumento y el tipo de acto: sin
    // ellos el registro no identifica nada y no habría ni a qué volver. Ésos se
    // validan arriba y no tienen escape.
    const faltanDelActo = pendientesActo({
      fecha: form.fecha,
      instrumento_publico: form.instrumento_publico,
      tipo_acto: form.tipo_acto,
      datos_acto: form.datos_acto,
    }).filter((p) => p.gravedad === "bloquea_aviso" && p.momento === "captura");

    if (esNotarias && faltanDelActo.length > 0 && !diferirExpediente) {
      toast.error(
        faltanDelActo.length === 1
          ? faltanDelActo[0].detalle
          : `Faltan ${faltanDelActo.length} datos del acto. Están en la lista de abajo.`,
      );
      return;
    }

    // El artículo 32 se para aquí también. El trigger de la base lo impediría
    // igual, pero un error de base de datos delante de quien captura no explica
    // nada y no dice qué hacer. Esto sí.
    if (avisoArt32?.prohibido) {
      toast.error("El artículo 32 no permite liquidar este acto en efectivo", {
        description: avisoArt32.detalle,
      });
      return;
    }

    // Las señales (país, tipo de acto) viajan en contraparte (jsonb).
    const contraparte: Record<string, unknown> = {};
    if (form.pais_iso2.trim()) contraparte.pais_iso2 = form.pais_iso2.trim().toUpperCase();
    if (esNotarias && form.tipo_acto) contraparte.tipo_acto = form.tipo_acto;

    alta.mutate({
      client_id: form.client_id,
      // En notarías el acto no es una operación cripto; se usa 'otro' y el detalle
      // viaja en contraparte.tipo_acto.
      tipo: esNotarias ? "otro" : form.tipo,
      monto_mxn: monto,
      activo_virtual: esNotarias ? undefined : form.activo_virtual.trim() || undefined,
      contraparte: Object.keys(contraparte).length ? contraparte : undefined,
      datos_acto: esNotarias ? form.datos_acto : undefined,
      forma_pago: form.forma_pago || undefined,
      pais_origen_recursos: form.pais_origen_recursos.trim().toUpperCase() || undefined,
      entidad_federativa_inmueble: form.entidad_federativa_inmueble.trim() || undefined,
      municipio_inmueble: form.municipio_inmueble.trim() || undefined,
      efectivo_mxn: form.efectivo_mxn ? Number(form.efectivo_mxn) : undefined,
      fecha_pago: form.fecha_pago || undefined,
      pago_de_tercero: form.pago_de_tercero || undefined,
      // Mediodía local: la fecha del acto es un día, no un instante, y guardarla
      // a las 00:00 la corre al día anterior en husos al oeste de UTC.
      fecha: new Date(`${form.fecha}T12:00:00`).toISOString(),
      instrumento_publico: instrumento || undefined,
    });
  }

  const guardarExpediente = useMutation({
    mutationFn: () =>
      actualizarDatosActo(actoEnCurso!.id, datosEnCurso, extrasEnCurso),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operaciones"] });
      toast.success("Expediente del acto actualizado");
      setActoEnCurso(null);
    },
    onError: (e: Error) => toast.error(`No se pudo guardar: ${e.message}`),
  });

  /**
   * Cambiar de tipo de acto cambia la rama entera del formato del aviso: lo
   * capturado para la anterior no tiene dónde ir, así que se descarta.
   *
   * Se pregunta antes, y sólo si hay algo que perder. Descartarlo en silencio
   * significa que quien tocó el selector por error se entera cuando ya vació
   * media captura.
   */
  function cambiarTipoActo(tipo_acto: string) {
    setForm((f) => {
      if (f.tipo_acto === tipo_acto) return f;
      const hayCaptura = Object.keys(f.datos_acto).length > 0;
      if (
        hayCaptura &&
        !window.confirm(
          "Cambiar el tipo de acto borra el expediente capturado para el anterior. ¿Continuar?",
        )
      )
        return f;
      return { ...f, tipo_acto, datos_acto: {} };
    });
  }

  // Lo que le faltaría a este acto para entrar al aviso, calculado mientras se
  // captura.
  const comparecienteSeleccionado = clientes.find((c) => c.id === form.client_id);
  const pendientesDelAlta = esNotarias
    ? [
        ...pendientesSujetoObligado(clavesPadron ?? {}),
        ...(comparecienteSeleccionado
          ? pendientesCompareciente(comparecienteSeleccionado)
          : []),
        // Que falte identificar al compareciente NO impide registrar el acto:
        // el instrumento ya se firmó y no registrarlo sería peor. Pero se dice
        // aquí, mientras la persona sigue enfrente y todavía se le puede pedir.
        ...(comparecienteSeleccionado
          ? pendientesIdentificacion(verificaciones?.get(comparecienteSeleccionado.id), {
              tipoPersona: comparecienteSeleccionado.tipo_persona,
              cargando: cargandoVerificaciones,
            })
          : []),
        ...pendientesActo({
          fecha: form.fecha,
          instrumento_publico: form.instrumento_publico,
          tipo_acto: form.tipo_acto,
          datos_acto: form.datos_acto,
        }),
      ]
    : [];
  /**
   * Lo que le falta al ACTO, que es lo único que puede diferirse.
   *
   * Se recalcula aquí para el botón. Lo del compareciente y lo del sujeto
   * obligado no entran: no son de este registro y no se arreglan en esta
   * pantalla.
   */
  const faltanDelActoAhora = esNotarias
    ? pendientesActo({
        fecha: form.fecha,
        instrumento_publico: form.instrumento_publico,
        tipo_acto: form.tipo_acto,
        datos_acto: form.datos_acto,
      }).filter((p) => p.gravedad === "bloquea_aviso" && p.momento === "captura")
    : [];

  const catalogosDelActo = form.tipo_acto ? catalogosPendientes(form.tipo_acto) : [];
  const canal = form.tipo_acto ? canalDeActo(form.tipo_acto) : undefined;

  /**
   * La prohibición del artículo 32, evaluada mientras se captura.
   *
   * El candado de verdad vive en un trigger de la base (migration 0039) y ahí
   * se queda: una validación que sólo existiera aquí la saltaría cualquiera con
   * la API. Esto es para que quien captura se entere ANTES de pulsar
   * «Registrar» —enterarse al guardar es enterarse tarde, con el compareciente
   * enfrente y el instrumento firmado—.
   *
   * La UMA es la del día del pago, no la de hoy: el límite se mide así.
   */
  const avisoArt32 = form.efectivo_mxn
    ? evaluarArticulo32({
        tipo_acto: form.tipo_acto,
        efectivo_mxn: Number(form.efectivo_mxn),
        umaDelDiaDelPago: valorParam(PARAM.UMA_DIARIA, "*"),
        limitesUma: (codigo) => valorParam(codigo, "XII"),
      })
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <EncabezadoSeccion
        titulo={L.operaciones}
        acciones={
          <Button className="gap-2" onClick={() => setDialogAbierto(true)}>
            <Plus className="h-4 w-4" /> {L.operacionNuevaBtn}
          </Button>
        }
      />

      <div className="estela-placa p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={esNotarias ? "Buscar por compareciente…" : "Buscar por cliente…"}
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {esNotarias ? (
        <div className="estela-placa p-4">
          <p className="text-sm font-semibold text-foreground">
            Cuándo hay que avisar — fe pública
          </p>
          {/* Las cifras salen del catálogo de parámetros, el mismo que consulta
              el motor. Estuvieron escritas a mano aquí y se quedaron publicando
              16,000 UMA cuando la reforma las bajó a 8,000: la pantalla decía
              una cosa y el motor hacía otra. */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SUPUESTOS_AVISO_XII.map((s) => {
              const umbral = s.codigo ? valorParam(s.codigo, "XII") : null;
              return (
                <div key={s.concepto} className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">{s.concepto}</p>
                  <p className="text-lg font-bold text-foreground">
                    {s.codigo === null
                      ? "Siempre"
                      : umbral != null
                        ? `Desde ${umbral.toLocaleString("es-MX")} UMA`
                        : "—"}
                  </p>
                  {/* En pesos, además de en UMA: la cifra en UMA no le dice
                      nada a nadie hasta que se traduce. */}
                  {s.codigo !== null && umbral != null && umaMxn != null && (
                    <p className="text-[13px] text-muted-foreground tabular-nums">
                      {formatMxn(umbral * umaMxn)} con la UMA de hoy
                    </p>
                  )}
                  <p className="text-[13px] text-muted-foreground mt-1">{s.detalle}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-6 gap-y-1">
          <span>
            Aviso por operación ({umbralOperacionUma?.toLocaleString("es-MX") ?? "—"} UMA):{" "}
            <strong>{umbralOperacionMxn != null ? formatMxn(umbralOperacionMxn) : "—"}</strong>
          </span>
          <span>
            Aviso por comisión cobrada ({umbralComisionUma?.toLocaleString("es-MX") ?? "—"} UMA):{" "}
            <strong>{umbralComisionMxn != null ? formatMxn(umbralComisionMxn) : "—"}</strong>
          </span>
        </div>
      )}

      <div className="estela-placa overflow-x-auto">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando operaciones…
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-destructive text-sm">
            No se pudieron cargar las operaciones: {(error as Error)?.message}
          </div>
        ) : (
          <table className="w-full min-w-[48rem]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {[
                  "Fecha",
                  esNotarias ? "Compareciente" : "Cliente",
                  ...(esNotarias ? ["Instrumento"] : []),
                  "Monto",
                  esNotarias ? "Tipo de acto" : "Tipo",
                  esNotarias ? "Valor (UMA)" : "Activo",
                  // El umbral de monto sólo dice algo en activos virtuales. En
                  // fe pública no hay una cifra única que responda: el poder
                  // irrevocable y la constitución de persona moral se avisan
                  // siempre, y el inmueble y el fideicomiso tienen umbrales
                  // distintos. La respuesta la da el motor, columna siguiente.
                  ...(esNotarias ? [] : ["Umbral"]),
                  "Requiere aviso",
                  ...(esNotarias ? ["Expediente"] : []),
                ].map((h) => (
                  <th
                    key={h}
                    className="estela-antetitulo text-muted-foreground px-4 py-3 text-left"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((op) => (
                <tr
                  key={op.id}
                  className={cn(
                    "border-b border-border last:border-0 transition-colors",
                    // Ámbar, no rojo: un acto que alcanza el umbral es algo que
                    // atender, no algo roto. Y el tinte no informa por sí solo
                    // —la columna "Requiere aviso" lleva el texto—: refuerza.
                    op.requiere_aviso || op.evaluada_en == null
                      ? "bg-warning/5"
                      : "hover:bg-muted/50",
                  )}
                >
                  <td className="px-4 py-3 text-sm">
                    {new Date(op.fecha).toLocaleDateString("es-MX")}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {nombrePorCliente.get(op.client_id) ?? op.client_id}
                  </td>
                  {esNotarias && (
                    <td className="px-4 py-3 text-sm">
                      {op.instrumento_publico ?? (
                        <span className="text-muted-foreground">sin capturar</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm font-semibold">{formatMxn(op.monto_mxn)}</td>
                  <td className="px-4 py-3 text-sm">
                    {esNotarias ? labelTipoActo((op.contraparte as Record<string, unknown>)?.tipo_acto) : op.tipo}
                  </td>
                  <td className="px-4 py-3">
                    {esNotarias ? (
                      <span className="text-sm text-muted-foreground">
                        {umaMxn != null
                          ? `${Math.round(op.monto_mxn / umaMxn).toLocaleString("es-MX")} UMA`
                          : "—"}
                      </span>
                    ) : (
                      <span className="status-badge bg-muted text-muted-foreground">
                        {op.activo_virtual ?? "—"}
                      </span>
                    )}
                  </td>
                  {!esNotarias && (
                    <td className="px-4 py-3">
                      {(() => {
                        const u = umbralRebasado(op.monto_mxn);
                        return u ? (
                          <span className={cn("status-badge text-xs", u.clase)}>{u.etiqueta}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Por debajo</span>
                        );
                      })()}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    {/* Tres estados, no dos. "No" y "todavía nadie lo ha
                        mirado" no son lo mismo, y confundirlos es lo que hacía
                        que un mes de actos sin evaluar se presentara en ceros. */}
                    {op.evaluada_en == null ? (
                      <span className="status-badge bg-warning/15 text-warning-ink">Sin evaluar</span>
                    ) : op.requiere_aviso ? (
                      <span className="status-badge bg-warning/15 text-warning-ink">Sí</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">No</span>
                    )}
                  </td>
                  {esNotarias &&
                    (() => {
                      const faltan = bloqueosDelActo(op);
                      const tipoActo = (op.contraparte as Record<string, unknown> | null)
                        ?.tipo_acto as string | undefined;
                      return (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {/* "Completo" sobre una transmisión de inmueble se lee
                                como "ya entra al aviso del mes", y ese acto va
                                por DeclaraNOT con su propio plazo de 15 días
                                naturales. El expediente puede estar completo y
                                aun así no estar reportado. */}
                            {tipoActo && canalDeActo(tipoActo) === "declaranot" ? (
                              <span className="status-badge bg-warning/15 text-warning-ink">
                                Por DeclaraNOT
                              </span>
                            ) : faltan === 0 ? (
                              <span className="status-badge bg-success/10 text-success">
                                Completo
                              </span>
                            ) : (
                              <span className="status-badge bg-warning/15 text-warning-ink">
                                Faltan {faltan}
                              </span>
                            )}
                            {/* También en los actos de DeclaraNOT. Su expediente
                                del layout no existe —ese acto no va por el
                                SPPLD— pero la forma de pago y el origen de los
                                recursos sí les aplican, y de hecho es en la
                                transmisión de inmuebles donde la prohibición de
                                efectivo del artículo 32 pesa más. */}
                            {puedeCompletar && tipoActo && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setActoEnCurso(op);
                                  setDatosEnCurso((op.datos_acto ?? {}) as DatosActo);
                                  setExtrasEnCurso({
                                    forma_pago: op.forma_pago ?? "",
                                    pais_origen_recursos: op.pais_origen_recursos ?? "",
                                  });
                                }}
                              >
                                Completar
                              </Button>
                            )}
                          </div>
                        </td>
                      );
                    })()}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={esNotarias ? 9 : 7}
                    className="px-4 py-8 text-center text-muted-foreground text-sm"
                  >
                    {L.operacionesVacio}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={dialogAbierto} onOpenChange={setDialogAbierto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{L.operacionAltaTitulo}</DialogTitle>
            <DialogDescription>{L.operacionAltaDesc}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>{esNotarias ? "Compareciente" : "Cliente"}</Label>
              <Select
                value={form.client_id}
                onValueChange={(v) => setForm({ ...form, client_id: v })}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={esNotarias ? "Seleccione un compareciente…" : "Seleccione un cliente…"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre_razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {esNotarias ? (
                <div className="col-span-2">
                  <Label>Tipo de acto</Label>
                  <Select
                    value={form.tipo_acto}
                    onValueChange={cambiarTipoActo}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione el tipo de acto…" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_ACTO_NOTARIA.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={form.tipo}
                    onValueChange={(v) => setForm({ ...form, tipo: v as TipoOperacion })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>{esNotarias ? "Valor del acto (MXN)" : "Monto (MXN)"}</Label>
                <Input
                  type="number"
                  value={form.monto_mxn}
                  onChange={(e) => setForm({ ...form, monto_mxn: e.target.value })}
                />
              </div>
              <div>
                <Label>{esNotarias ? "Fecha del acto" : "Fecha de la operación"}</Label>
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                />
                {esNotarias && (
                  <p className="text-[13px] text-muted-foreground mt-1">
                    La de la firma del instrumento, no la de captura.
                  </p>
                )}
              </div>
              {esNotarias && (
                <div>
                  <Label>Número de instrumento</Label>
                  <Input
                    placeholder="45321"
                    maxLength={20}
                    value={form.instrumento_publico}
                    onChange={(e) =>
                      setForm({ ...form, instrumento_publico: e.target.value.toUpperCase() })
                    }
                  />
                  <p className="text-[13px] text-muted-foreground mt-1">
                    Sin comas ni puntos. Acepta ceros a la izquierda y guiones.
                  </p>
                </div>
              )}

              {/* Los dos datos que la matriz de riesgo pedía y no existían en
                  ninguna parte, así que el OC los contestaba de memoria
                  (migration 0036). La forma de pago además es el único dato que
                  permite vigilar la prohibición de efectivo del artículo 32:
                  sus umbrales llevan cargados desde la 0030 sin que nada
                  pudiera consultarlos. */}
              <div>
                <Label>Forma de pago</Label>
                <Select
                  value={form.forma_pago}
                  onValueChange={(v) => setForm({ ...form, forma_pago: v as FormaPago })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bancarizado">
                      Bancarizado — transferencia o cheque nominativo
                    </SelectItem>
                    <SelectItem value="mixto">Mixto — parte en efectivo</SelectItem>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[13px] text-muted-foreground mt-1">
                  Responde una variable de la matriz de riesgo. «Mixto» cuenta como efectivo
                  para la prohibición del artículo 32.
                </p>
              </div>

              {/* Sólo cuando hubo efectivo. Pedir el monto en una operación
                  bancarizada es preguntar por algo que no existe, y además la
                  base rechaza esa combinación (migration 0039). */}
              {(form.forma_pago === "mixto" || form.forma_pago === "efectivo") && (
                <>
                  <div>
                    <Label>Efectivo entregado (MXN)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.efectivo_mxn}
                      onChange={(e) => setForm({ ...form, efectivo_mxn: e.target.value })}
                    />
                    {avisoArt32 && (
                      // Rojo, no ámbar: el artículo 32 no es algo que atender,
                      // es algo que impide. Y se dice ANTES de intentar
                      // guardar, aunque el candado de la base lo pare igual:
                      // enterarse al pulsar «Registrar» es enterarse tarde.
                      <p
                        className={cn(
                          "text-[13px] mt-1",
                          avisoArt32.prohibido ? "text-destructive font-medium" : "text-muted-foreground",
                        )}
                      >
                        {avisoArt32.detalle}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>Día del pago</Label>
                    <Input
                      type="date"
                      value={form.fecha_pago}
                      onChange={(e) => setForm({ ...form, fecha_pago: e.target.value })}
                    />
                    <p className="text-[13px] text-muted-foreground mt-1">
                      El límite del artículo 32 se mide con la UMA de ESE día, no la del
                      instrumento. Si se deja vacío se usa la fecha del acto.
                    </p>
                  </div>
                </>
              )}

              <div className="flex items-start gap-2 rounded-md border p-3">
                <input
                  id="pago-tercero"
                  type="checkbox"
                  className="mt-1"
                  checked={form.pago_de_tercero}
                  onChange={(e) => setForm({ ...form, pago_de_tercero: e.target.checked })}
                />
                <Label htmlFor="pago-tercero" className="font-normal cursor-pointer">
                  El pago proviene de un tercero
                  <span className="block text-[13px] text-muted-foreground font-normal">
                    Alguien distinto del compareciente. Es una señal por sí misma, con
                    independencia del monto: dice quién está detrás de la operación.
                  </span>
                </Label>
              </div>

              <div>
                <Label>País de origen de los recursos</Label>
                <Input
                  placeholder="MX"
                  maxLength={2}
                  value={form.pais_origen_recursos}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      pais_origen_recursos: e.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                    })
                  }
                />
                <p className="text-[13px] text-muted-foreground mt-1">
                  De dónde viene el dinero, que no es lo mismo que dónde vive el compareciente.
                  Se coteja contra las listas del GAFI.
                </p>
              </div>
              {/* Zona geográfica nacional. Las RCG exigen zona geográfica como
                  factor, y zona geográfica no es país: para una notaría que
                  opera enteramente en territorio nacional, un campo de país que
                  siempre responde «México» no discrimina en el noventa y tantos
                  por ciento de los expedientes. */}
              {esNotarias && ACTOS_CON_INMUEBLE.has(form.tipo_acto) && (
                <>
                  <SelectCatalogo
                    catalogo="entidad_federativa"
                    etiqueta="Entidad federativa del inmueble"
                    valor={form.entidad_federativa_inmueble}
                    onChange={(v) => setForm({ ...form, entidad_federativa_inmueble: v })}
                  />
                  <div>
                    <Label>Municipio del inmueble</Label>
                    <Input
                      placeholder="Zapopan"
                      value={form.municipio_inmueble}
                      onChange={(e) => setForm({ ...form, municipio_inmueble: e.target.value })}
                    />
                    <p className="text-[13px] text-muted-foreground mt-1">
                      Se coteja contra la lista interna de zonas de atención, junto con el
                      domicilio del compareciente. Se toma la más alta de las dos.
                    </p>
                  </div>
                </>
              )}
              {!esNotarias && (
                <div>
                  <Label>Activo virtual</Label>
                  <Input
                    placeholder="BTC, ETH, USDT, XMR…"
                    value={form.activo_virtual}
                    onChange={(e) => setForm({ ...form, activo_virtual: e.target.value })}
                  />
                </div>
              )}
              <div>
                <Label>
                  {esNotarias ? "País del socio o contraparte" : "País de la contraparte"}
                </Label>
                <Input
                  placeholder="MX, IR…"
                  maxLength={2}
                  value={form.pais_iso2}
                  onChange={(e) => setForm({ ...form, pais_iso2: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
          </div>

          {esNotarias && (
            <div className="space-y-3">
              {canal === "declaranot" && (
                <div className="rounded-md bg-warning/10 p-3">
                  <p className="text-xs font-semibold text-foreground">
                    Este acto se presenta por DeclaraNOT, no por el SPPLD
                  </p>
                  <p className="text-[13px] text-warning-ink mt-1">{NOTA_CANALES}</p>
                </div>
              )}

              {catalogosDelActo.length > 0 && (
                <div className="rounded-md bg-warning/10 p-3">
                  <p className="text-[13px] text-warning-ink">
                    DEMO — sin integración real: estos catálogos de la UIF todavía no están
                    cargados en Ikán ({catalogosDelActo.join(", ")}), así que sus claves se
                    capturan a mano. Los carga Kawiil desde la consola de plataforma.
                  </p>
                </div>
              )}

              {form.tipo_acto && canal === "sppld" && (
                <div className="rounded-md border p-3 space-y-3">
                  <p className="text-sm font-semibold text-foreground">
                    Expediente del acto — {labelTipoActo(form.tipo_acto)}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Lo que pide el formato de fe pública para esta rama. Está todo en el
                    instrumento que se acaba de firmar; el día 17 ya no lo está, y quien capture
                    entonces no tendrá a quién preguntarle. Si algo no lo tiene a la mano,
                    «Registrar y completar después» guarda el acto y lo deja contado como
                    incompleto hasta que alguien lo cierre.
                  </p>
                  <CapturaActo
                    tipoActo={form.tipo_acto}
                    datos={form.datos_acto}
                    onChange={(datos_acto) => setForm((f) => ({ ...f, datos_acto }))}
                  />
                </div>
              )}

              <PendientesAviso
                pendientes={pendientesDelAlta}
                compacto
                canal={canal}
              />
            </div>
          )}

          <DialogFooter className="sm:justify-between gap-2">
            <Button variant="outline" onClick={() => setDialogAbierto(false)}>
              Cancelar
            </Button>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              {/* La salida, y sólo cuando hace falta. Aparece nada más si lo que
                  falta es del expediente del acto: la fecha, el instrumento y
                  el tipo no se difieren nunca, porque sin ellos el registro no
                  identifica nada y no habría ni a qué volver. */}
              {faltanDelActoAhora.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => enviar(true)}
                  disabled={alta.isPending}
                  className="gap-2"
                  title="El acto queda registrado y su expediente cuenta como incompleto hasta que alguien lo cierre."
                >
                  Registrar y completar después
                </Button>
              )}
              <Button
                className="gap-2"
                onClick={() => enviar()}
                disabled={alta.isPending}
              >
                {alta.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Registrar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completar el expediente de un acto ya registrado. El notario casi
          nunca tiene todo el día de la firma: el RFC de un socio llega
          después, y el aviso se cierra el 17. */}
      <Dialog open={!!actoEnCurso} onOpenChange={(v) => !v && setActoEnCurso(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-3xl">
          <DialogHeader>
            <DialogTitle>Expediente del acto</DialogTitle>
            <DialogDescription>
              {actoEnCurso
                ? `${labelTipoActo(
                    (actoEnCurso.contraparte as Record<string, unknown> | null)?.tipo_acto,
                  )} · instrumento ${actoEnCurso.instrumento_publico ?? "sin capturar"}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {actoEnCurso && (
            <>
              {/* Los actos anteriores a la 0036 nacieron sin estos dos datos, y
                  sin manera de completarlos después se quedarían para siempre
                  sin poder cerrar su matriz de riesgo. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border p-3">
                <div>
                  <Label>Forma de pago</Label>
                  <Select
                    value={extrasEnCurso.forma_pago}
                    onValueChange={(v) =>
                      setExtrasEnCurso({ ...extrasEnCurso, forma_pago: v as FormaPago })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bancarizado">
                        Bancarizado — transferencia o cheque nominativo
                      </SelectItem>
                      <SelectItem value="mixto">Mixto — parte en efectivo</SelectItem>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>País de origen de los recursos</Label>
                  <Input
                    placeholder="MX"
                    maxLength={2}
                    value={extrasEnCurso.pais_origen_recursos}
                    onChange={(e) =>
                      setExtrasEnCurso({
                        ...extrasEnCurso,
                        pais_origen_recursos: e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z]/g, ""),
                      })
                    }
                  />
                </div>
                <p className="sm:col-span-2 text-[13px] text-muted-foreground">
                  Los dos responden variables de la matriz de riesgo del compareciente. De
                  dónde viene el dinero no es lo mismo que dónde vive quien comparece.
                </p>
              </div>

              {canalDeActo(
                (actoEnCurso.contraparte as Record<string, unknown> | null)?.tipo_acto,
              ) === "sppld" ? (
                <CapturaActo
                  tipoActo={
                    (actoEnCurso.contraparte as Record<string, unknown> | null)?.tipo_acto as string
                  }
                  datos={datosEnCurso}
                  onChange={setDatosEnCurso}
                />
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  Este acto se presenta por DeclaraNOT, no por el SPPLD, así que no tiene
                  expediente en el formato de fe pública. Los dos datos de arriba sí le aplican.
                </p>
              )}
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setActoEnCurso(null)}>
              Cancelar
            </Button>
            <Button
              className="gap-2"
              onClick={() => guardarExpediente.mutate()}
              disabled={guardarExpediente.isPending}
            >
              {guardarExpediente.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
