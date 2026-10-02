import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { EnviarVerificacionDialog } from "@/components/verificacion/EnviarVerificacionDialog";
import { EstadoIdentidad } from "@/components/verificacion/EstadoIdentidad";
import {
  ETIQUETA_ESTADO,
  verificacionesVigentes,
  type EstadoVerificacion,
} from "@/lib/api/verificacion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, Search, ShieldCheck, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EncabezadoSeccion } from "@/components/estela/EncabezadoSeccion";
import { TONO_ESTADO } from "@/lib/verificacion-labels";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { listarClientes, crearCliente, ultimasEvaluaciones } from "@/lib/api/clientes";
import { BadgeRiesgo } from "@/components/riesgo/BadgeRiesgo";
import type { CanalDistribucion, NuevoClienteInput, TipoPersona } from "@/types/domain";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { LABELS, nivelConocimiento } from "@/lib/perfil-actividad";
import { PendientesAviso } from "@/components/aviso/PendientesAviso";
import {
  SIN_APELLIDO,
  pendientesCompareciente,
  pendientesIdentificacion,
} from "@/lib/aviso/completitud";
import { SelectCatalogo } from "@/components/aviso/SelectCatalogo";
import { useCatalogo } from "@/hooks/useCatalogo";

const tipoLabel: Record<TipoPersona, string> = { fisica: "Persona Física", moral: "Persona Moral" };

/**
 * Lo que Didit corre, en orden.
 *
 * Venía de la pantalla de Identidad. Es la explicación de un botón que está en
 * esta tabla —«Verificar»—, y la explicación de un botón pertenece a la
 * pantalla donde está el botón.
 */
const PASOS_DIDIT = [
  { paso: "Captura del documento", detalle: "INE, pasaporte o FM" },
  { paso: "Validación del documento", detalle: "elementos de seguridad y OCR" },
  { paso: "Prueba de vida", detalle: "que sea la persona, en vivo" },
  { paso: "Face match", detalle: "contra la foto del documento" },
  { paso: "Resolución", detalle: "aprobada, rechazada o a revisión" },
];

/** Una cifra del padrón. El ámbar sólo cuando hay algo que atender. */
function Metrica({
  etiqueta,
  valor,
  nota,
  alerta,
}: {
  etiqueta: string;
  valor: number | string;
  nota?: string;
  alerta?: boolean;
}) {
  return (
    <div className={cn("estela-placa p-4", alerta && "estela-filo border-t-ikan-ambar")}>
      <p className="estela-antetitulo text-muted-foreground">{etiqueta}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-extrabold tabular-nums",
          alerta ? "text-[#7A4F00] dark:text-ikan-ambar" : "text-foreground",
        )}
      >
        {valor}
      </p>
      {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

/** Nombre de despliegue de una persona física: el mismo orden que arma la BD.
 *  Se calcula aquí sólo para mostrarlo y para no mandar la columna vacía. */
function nombreCompuesto(f: { nombre: string; apellido_paterno: string; apellido_materno: string }) {
  return [f.nombre, f.apellido_paterno, f.apellido_materno]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" ");
}

const FORM_INICIAL = {
  tipo_persona: "fisica" as TipoPersona,
  // Persona física: el aviso pide las partes por separado (layout fep 3.5.1-3.5.3).
  // `nombre_razon_social` deja de capturarse a mano en física: lo compone la BD.
  nombre: "",
  apellido_paterno: "",
  apellido_materno: "",
  fecha_nacimiento: "",
  // Persona moral
  razon_social: "",
  fecha_constitucion: "",
  rfc: "",
  curp: "",
  pais_nacionalidad_clave: "MX",
  actividad_economica_clave: "",
  nacionalidad: "Mexicana",
  entidad_federativa: "",
  entidad_federativa_clave: "",
  pais_residencia_iso2: "MX",
  // Factores del catálogo de las RCG (migration 0041). Se capturan AQUÍ y no
  // después: el canal por el que llegó alguien deja de saberse en cuanto pasa
  // el día, y la frecuencia esperada sólo la sabe quien la declara.
  canal_distribucion: "",
  municipio: "",
  frecuencia_esperada_anual: "",
  email: "",
  telefono: "",
  ocupacion: "",
  origen_recursos: "",
};

export default function ClientsPage() {
  // El buscador del encabezado navega aquí con ?q=. Se toma como valor
  // INICIAL, no como fuente de verdad: a partir de ahí manda el campo de esta
  // pantalla, y escribir en él no reescribe la URL a cada tecla.
  interface AVerificar {
    id: string;
    nombre: string;
    tipoPersona: TipoPersona;
    correo: string | null;
    telefono: string | null;
  }
  const [aVerificar, setAVerificar] = useState<AVerificar | null>(null);
  /** A dónde ir al cerrar el diálogo, cuando viene del alta. */
  const [volverA, setVolverA] = useState<string | null>(null);
  const [parametrosUrl] = useSearchParams();
  const [search, setSearch] = useState(() => parametrosUrl.get("q") ?? "");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { perfilActividad, profile } = useAuth();
  const L = LABELS[perfilActividad];

  const { data: clientes = [], isLoading, isError, error } = useQuery({
    queryKey: ["clientes"],
    queryFn: listarClientes,
  });

  // La calificación vigente de cada compareciente. Se escribía y no se leía:
  // la lista mostraba a todos igual, evaluados o no.
  const { data: evaluaciones } = useQuery({
    queryKey: ["evaluaciones", clientes.map((c) => c.id).join(",")],
    queryFn: () => ultimasEvaluaciones(clientes.map((c) => c.id)),
    enabled: clientes.length > 0,
  });

  // El estado de identidad de cada compareciente. Va en una consulta aparte y
  // no en el join de clientes: es una vista distinta con su propia RLS, y si
  // Didit todavía no está configurado esto falla solo, sin tumbar la lista.
  const { data: verificaciones, refetch: recargarVerificaciones } = useQuery({
    queryKey: ["verificaciones-vigentes"],
    queryFn: async () => {
      const filas = await verificacionesVigentes();
      return new Map(filas.map((v) => [v.client_id, v.estado]));
    },
    retry: false,
  });

  /**
   * Lo que le falta a cada expediente.
   *
   * Se calculaba en la pantalla de Identidad, que era una segunda lista de los
   * mismos comparecientes: quien quería saber si el expediente de alguien
   * estaba completo tenía que salirse de Comparecientes, buscarlo otra vez en
   * otra tabla y volver. Dos listas del mismo padrón es una de más.
   *
   * Cuenta las dos cosas: los campos que el layout del aviso exige y la
   * identificación que exige el artículo 18. Un compareciente con todos sus
   * datos capturados y sin identificar no está completo, aunque su aviso pase
   * la validación del portal sin una queja. El portal no pregunta; la
   * autoridad, cuando revise, sí.
   */
  const completitud = useMemo(() => {
    const mapa = new Map<
      string,
      { faltan: number; delLayout: number }
    >();
    for (const c of clientes) {
      const estado = verificaciones?.get(c.id);
      const delLayout = pendientesCompareciente(c).filter(
        (x) => x.gravedad === "bloquea_aviso",
      ).length;
      const deIdentificacion = pendientesIdentificacion(estado, {
        tipoPersona: c.tipo_persona,
        cargando: verificaciones === undefined,
      }).length;
      mapa.set(c.id, { faltan: delLayout + deIdentificacion, delLayout });
    }
    return mapa;
  }, [clientes, verificaciones]);

  const resumen = useMemo(() => {
    const estados = clientes.map((c) => verificaciones?.get(c.id));
    return {
      capturados: clientes.length,
      verificados: estados.filter((e) => e === "aprobada").length,
      enCurso: estados.filter(
        (e) => e && e !== "aprobada" && e !== "rechazada",
      ).length,
      completos: clientes.filter(
        (c) => (completitud.get(c.id)?.faltan ?? 1) === 0,
      ).length,
    };
  }, [clientes, verificaciones, completitud]);

  const alta = useMutation({
    mutationFn: (input: NuevoClienteInput) => crearCliente(input),
    onSuccess: (cliente) => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      toast.success("Cliente registrado");
      setDialogAbierto(false);
      // El momento de verificar a alguien es cuando lo tienes enfrente, no
      // cuando te acuerdas tres días después. Antes había que registrarlo,
      // volver a la lista y buscarlo para mandarle la verificación; para
      // entonces el compareciente ya se fue de la notaría.
      //
      // El correo y el teléfono se pasan del formulario que se acaba de
      // llenar: volver a teclear el correo que escribiste hace diez segundos
      // es la clase de fricción que hace que nadie use la función.
      if (cliente.tipo_persona === "fisica") {
        setAVerificar({
          id: cliente.id,
          nombre: cliente.nombre_razon_social,
          tipoPersona: cliente.tipo_persona,
          correo: form.email.trim() || null,
          telefono: form.telefono.trim() || null,
        });
        setVolverA(`/clientes/${cliente.id}`);
      } else {
        navigate(`/clientes/${cliente.id}`);
      }
      setForm(FORM_INICIAL);
    },
    onError: (e: Error) => toast.error(`No se pudo registrar: ${e.message}`),
  });

  const filtered = clientes.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      c.nombre_razon_social.toLowerCase().includes(q) || (c.rfc ?? "").toLowerCase().includes(q);
    const matchType = typeFilter === "all" || c.tipo_persona === typeFilter;
    return matchSearch && matchType;
  });

  const esFisica = form.tipo_persona === "fisica";
  // La etiqueta legible del estado se saca del catálogo, no se escribe a mano:
  // así `entidad_federativa` y `entidad_federativa_clave` no se contradicen.
  const catEntidades = useCatalogo("entidad_federativa");

  /** Lo que ya se capturó, en la forma que espera el evaluador del layout. */
  const comparecienteEnCurso = {
    tipo_persona: form.tipo_persona,
    nombre_razon_social: esFisica ? nombreCompuesto(form) : form.razon_social,
    nombre: form.nombre,
    apellido_paterno: form.apellido_paterno,
    apellido_materno: form.apellido_materno,
    fecha_nacimiento: form.fecha_nacimiento,
    fecha_constitucion: form.fecha_constitucion,
    rfc: form.rfc,
    curp: form.curp,
    pais_nacionalidad_clave: form.pais_nacionalidad_clave,
    actividad_economica_clave: form.actividad_economica_clave,
  };
  const pendientes = pendientesCompareciente(comparecienteEnCurso);

  function enviar() {
    const nombreFinal = esFisica ? nombreCompuesto(form) : form.razon_social.trim();
    if (!nombreFinal) {
      toast.error(
        esFisica ? "Capture al menos nombre y apellido paterno" : "La razón social es obligatoria",
      );
      return;
    }
    // Lo que le falta al compareciente para poder entrar a un aviso, exigido
    // AHORA, que es cuando la persona está enfrente y trae su identificación en
    // la mano. El día 17 esos datos no están en ninguna parte y ya no hay a
    // quién preguntarle: la falta se arrastra hasta que el portal rechaza el
    // aviso completo por un apellido.
    //
    // Sólo lo del compareciente. Lo del acto se exige al registrar el acto y
    // las claves del padrón en la configuración: cada registro responde por lo
    // suyo, y así ninguno queda sin capturar por lo que le falte a otro.
    const faltan = pendientes.filter(
      (p) => p.gravedad === "bloquea_aviso" && p.momento === "captura",
    );
    if (perfilActividad === "notarias" && faltan.length > 0) {
      toast.error(
        faltan.length === 1
          ? faltan[0].detalle
          : `Faltan ${faltan.length} datos del compareciente. Están en la lista de abajo.`,
      );
      return;
    }

    const datos_kyc: Record<string, unknown> = {};
    if (form.email) datos_kyc.email = form.email;
    if (form.telefono) datos_kyc.telefono = form.telefono;
    if (form.ocupacion) datos_kyc.ocupacion = form.ocupacion;
    if (form.origen_recursos) datos_kyc.origen_recursos = form.origen_recursos;

    alta.mutate({
      tipo_persona: form.tipo_persona,
      // La BD lo recompone desde las partes en persona física (migration 0019);
      // se manda igual para que el insert nunca vaya con la columna vacía.
      nombre_razon_social: nombreFinal,
      nombre: esFisica ? form.nombre.trim() || undefined : undefined,
      apellido_paterno: esFisica ? form.apellido_paterno.trim() || undefined : undefined,
      apellido_materno: esFisica ? form.apellido_materno.trim() || undefined : undefined,
      fecha_nacimiento: esFisica ? form.fecha_nacimiento || undefined : undefined,
      fecha_constitucion: esFisica ? undefined : form.fecha_constitucion || undefined,
      pais_nacionalidad_clave: form.pais_nacionalidad_clave.trim() || undefined,
      actividad_economica_clave: form.actividad_economica_clave.trim() || undefined,
      rfc: form.rfc.trim() || undefined,
      curp: esFisica ? form.curp.trim() || undefined : undefined,
      nacionalidad: form.nacionalidad.trim() || undefined,
      entidad_federativa:
        catEntidades.descripcionDe(form.entidad_federativa_clave) ??
        (form.entidad_federativa.trim() || undefined),
      entidad_federativa_clave: form.entidad_federativa_clave.trim() || undefined,
      pais_residencia_iso2: form.pais_residencia_iso2.trim() || undefined,
      canal_distribucion:
        (form.canal_distribucion as CanalDistribucion) || undefined,
      municipio: form.municipio.trim() || undefined,
      // Sin declaración se manda undefined, no cero: cero operaciones al año es
      // una declaración y «no lo dijo» no lo es, y la matriz las trata distinto.
      frecuencia_esperada_anual:
        form.frecuencia_esperada_anual.trim() === ""
          ? undefined
          : Number(form.frecuencia_esperada_anual),
      datos_kyc,
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <EncabezadoSeccion
        titulo={L.clientes}
        acciones={
          <Button className="gap-2" onClick={() => setDialogAbierto(true)}>
            <Plus className="h-4 w-4" /> {L.clienteNuevoBtn}
          </Button>
        }
      />

      <div className="estela-placa flex flex-wrap items-center gap-3 p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o RFC…"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* Tres opciones no necesitan un desplegable. Un <Select> obliga a
            abrir, leer y elegir para saber qué filtros hay; en fichas están
            todas a la vista y el activo se ve sin pulsar nada. */}
        <div className="flex shrink-0 flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo de persona">
          {([
            { valor: "all", etiqueta: "Todos" },
            { valor: "fisica", etiqueta: "Persona física" },
            { valor: "moral", etiqueta: "Persona moral" },
          ] as const).map((f) => (
            <button
              key={f.valor}
              type="button"
              aria-pressed={typeFilter === f.valor}
              onClick={() => setTypeFilter(f.valor)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                typeFilter === f.valor
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div className="estela-placa overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando clientes…
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-destructive text-sm">
            No se pudieron cargar los clientes: {(error as Error)?.message}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {/* El RFC sale de columna propia y va bajo el nombre: en una
                    tabla de ocho columnas era la primera que se recortaba, y
                    pertenece al nombre. El hueco lo ocupa «Expediente», que es
                    lo que dice si con ese compareciente se puede presentar un
                    aviso. */}
                {["Compareciente", "Tipo", "Riesgo", "Conocimiento", "Alto de oficio", "Expediente", "Identidad", ""].map((h) => (
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
              {filtered.map((client) => (
                <tr
                  key={client.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/clientes/${client.id}`)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {client.nombre_razon_social}
                  </td>
                  <td className="px-4 py-3">
                    <span className="status-badge bg-muted text-muted-foreground">
                      {tipoLabel[client.tipo_persona]}
                    </span>
                  </td>
                  <td className="px-4 py-3 estela-dato text-sm text-muted-foreground">
                    {client.rfc ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <BadgeRiesgo
                      clasificacion={evaluaciones?.get(client.id)?.clasificacion}
                      score={evaluaciones?.get(client.id)?.score_total}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {nivelConocimiento(client.tipo_persona, client.nivel_kyc)}
                  </td>
                  <td className="px-4 py-3">
                    {client.alto_de_oficio ? (
                      <span className="status-badge bg-destructive/10 text-destructive">Sí</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">No</span>
                    )}
                  </td>
                  {/* El clic de la fila navega al detalle, así que lo que hay
                      aquí tiene que detener la propagación o el diálogo se abre
                      y la página cambia debajo. */}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <EstadoIdentidad
                      clientId={client.id}
                      estado={verificaciones?.get(client.id)}
                      onVerificar={() =>
                        setAVerificar({
                          id: client.id,
                          nombre: client.nombre_razon_social,
                          tipoPersona: client.tipo_persona,
                          // Lo que se capturó en el alta. Sin esto había que
                          // volver a teclear un correo que ya está en el
                          // expediente.
                          correo:
                            (client.datos_kyc?.email as string | undefined) ?? null,
                          telefono:
                            (client.datos_kyc?.telefono as string | undefined) ?? null,
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-accent font-medium hover:underline">Ver</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    {L.clientesVacio}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={dialogAbierto} onOpenChange={setDialogAbierto}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{L.clienteAltaTitulo}</DialogTitle>
            <DialogDescription>
              Captura del registro. La matriz de riesgo se evalúa como paso posterior desde
              el detalle.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label>Tipo de persona</Label>
              <Select
                value={form.tipo_persona}
                onValueChange={(v) => setForm({ ...form, tipo_persona: v as TipoPersona })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fisica">Persona Física</SelectItem>
                  <SelectItem value="moral">Persona Moral</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {esFisica ? (
              <>
                <div className="col-span-2">
                  <Label>Nombre(s)</Label>
                  <Input
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Apellido paterno</Label>
                  <Input
                    value={form.apellido_paterno}
                    onChange={(e) => setForm({ ...form, apellido_paterno: e.target.value })}
                  />
                  <p className="text-[13px] text-muted-foreground mt-1">
                    Si no tiene, captura {SIN_APELLIDO}.
                  </p>
                </div>
                <div>
                  <Label>Apellido materno</Label>
                  <Input
                    value={form.apellido_materno}
                    onChange={(e) => setForm({ ...form, apellido_materno: e.target.value })}
                  />
                  <p className="text-[13px] text-muted-foreground mt-1">
                    Si no tiene, captura {SIN_APELLIDO}.
                  </p>
                </div>
                <div>
                  <Label>Fecha de nacimiento</Label>
                  <Input
                    type="date"
                    value={form.fecha_nacimiento}
                    onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
                  />
                </div>
                <div>
                  <Label>CURP</Label>
                  <Input
                    value={form.curp}
                    maxLength={18}
                    onChange={(e) => setForm({ ...form, curp: e.target.value.toUpperCase() })}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="col-span-2">
                  <Label>Razón social</Label>
                  <Input
                    value={form.razon_social}
                    onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Fecha de constitución</Label>
                  <Input
                    type="date"
                    value={form.fecha_constitucion}
                    onChange={(e) => setForm({ ...form, fecha_constitucion: e.target.value })}
                  />
                </div>
              </>
            )}

            <div>
              <Label>RFC</Label>
              <Input
                value={form.rfc}
                maxLength={13}
                onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
              />
            </div>

            <SelectCatalogo
              catalogo="pais"
              etiqueta="País de nacionalidad"
              valor={form.pais_nacionalidad_clave}
              onChange={(v) => setForm({ ...form, pais_nacionalidad_clave: v })}
            />
            <SelectCatalogo
              catalogo={esFisica ? "actividad_economica" : "giro_mercantil"}
              etiqueta={esFisica ? "Actividad económica" : "Giro mercantil"}
              valor={form.actividad_economica_clave}
              onChange={(v) => setForm({ ...form, actividad_economica_clave: v })}
            />

            <div>
              <Label>Nacionalidad</Label>
              <Input
                value={form.nacionalidad}
                onChange={(e) => setForm({ ...form, nacionalidad: e.target.value })}
              />
            </div>
            <SelectCatalogo
              catalogo="entidad_federativa"
              etiqueta="Entidad federativa"
              valor={form.entidad_federativa_clave}
              onChange={(v) => setForm({ ...form, entidad_federativa_clave: v })}
            />
            <div>
              <Label>País de residencia</Label>
              <Input
                value={form.pais_residencia_iso2}
                placeholder="MX"
                maxLength={2}
                onChange={(e) =>
                  setForm({ ...form, pais_residencia_iso2: e.target.value.toUpperCase() })
                }
              />
            </div>
            <div>
              <Label>Municipio</Label>
              <Input
                value={form.municipio}
                placeholder="Guadalajara"
                onChange={(e) => setForm({ ...form, municipio: e.target.value })}
              />
            </div>
            {/* Canal de distribución: uno de los cuatro factores obligatorios
                de las RCG, y el que más aplica aquí porque el onboarding es
                remoto. NO se deduce de que haya verificación de Didit: se puede
                verificar a distancia a quien vino a la notaría. */}
            <div>
              <Label>Canal de distribución</Label>
              <Select
                value={form.canal_distribucion}
                onValueChange={(v) => setForm({ ...form, canal_distribucion: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="presencial">Presencial ante el fedatario</SelectItem>
                  <SelectItem value="remoto_verificacion_reforzada">
                    Remoto con verificación reforzada
                  </SelectItem>
                  <SelectItem value="remoto_estandar">Remoto estándar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Perfil transaccional (Cap. III Ter). La frecuencia esperada es
                la única pieza que no se puede calcular: la observada sale de la
                ventana móvil de seis meses del art. 7. */}
            <div>
              <Label>Operaciones esperadas al año</Label>
              <Input
                type="number"
                min={0}
                value={form.frecuencia_esperada_anual}
                placeholder="Lo que el cliente declara"
                onChange={(e) =>
                  setForm({ ...form, frecuencia_esperada_anual: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </div>
            <div>
              <Label>Ocupación / giro</Label>
              <Input
                value={form.ocupacion}
                onChange={(e) => setForm({ ...form, ocupacion: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Origen de recursos</Label>
              <Textarea
                rows={2}
                value={form.origen_recursos}
                onChange={(e) => setForm({ ...form, origen_recursos: e.target.value })}
              />
            </div>
          </div>

          {/* Qué pasa cuando se manda una verificación. Vivía en la pantalla de
          Identidad; es la explicación de un botón que está en esta tabla, así
          que su sitio es esta pantalla. Y la segunda mitad importa tanto como
          la primera: la conservación de la fracción XII pasó a diez años, y lo
          que se guarde hoy se guarda una década. */}
      <details className="estela-placa group p-5">
        <summary className="flex cursor-pointer list-none items-center gap-2 marker:content-none">
          <ShieldQuestion className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-sm font-bold text-foreground">
            Qué corre al verificar la identidad
          </span>
          <span className="ml-auto text-xs font-semibold text-accent group-open:hidden">
            Ver
          </span>
        </summary>
        <p className="mt-2 text-[13px] text-muted-foreground">
          El compareciente lo hace desde su teléfono, aquí mismo o por una liga.
        </p>
        <ol className="mt-4 space-y-3">
          {PASOS_DIDIT.map((paso, i) => (
            <li key={paso.paso} className="flex gap-3">
              <span className="estela-dato flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{paso.paso}</p>
                <p className="text-[13px] text-muted-foreground">{paso.detalle}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-border pt-3 text-[13px] leading-relaxed text-muted-foreground">
          Ikán conserva el resumen de la decisión —qué módulo corrió y con qué
          resultado—. Ni el documento, ni la biometría, ni la fecha de
          nacimiento: eso se queda en Didit.
        </p>
      </details>

      <PendientesAviso pendientes={pendientes} compacto />

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAbierto(false)}>
              Cancelar
            </Button>
            <Button
              className="gap-2"
              onClick={enviar}
              disabled={alta.isPending}
            >
              {alta.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Registrar cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EnviarVerificacionDialog
        clienteId={aVerificar?.id ?? null}
        clienteNombre={aVerificar?.nombre ?? ""}
        tipoPersona={aVerificar?.tipoPersona}
        correoSugerido={aVerificar?.correo ?? null}
        telefonoSugerido={aVerificar?.telefono ?? null}
        nombreOrganizacion={profile?.organization_name ?? "Su notaría"}
        onCerrar={() => {
          setAVerificar(null);
          // Sólo cuando venía del alta: desde la lista, cerrar el diálogo debe
          // dejarte donde estabas.
          if (volverA) {
            const destino = volverA;
            setVolverA(null);
            navigate(destino);
          }
        }}
        onEnviada={() => void recargarVerificaciones()}
      />
    </div>
  );
}

