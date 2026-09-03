import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  EXENCION_BC,
  EXENCION_BC_CERRADA,
  borrarBeneficiario,
  borrarSocio,
  crearSocio,
  getCascada,
  guardarDatosSociedad,
  guardarExencionBc,
  listarBeneficiarios,
  listarSocios,
  listarTiposSociales,
  motivoDelBloqueo,
  practicarPaso,
  registrarBeneficiario,
  type ExencionBc,
} from "@/lib/api/beneficiario-controlador";
import { listarClientes } from "@/lib/api/clientes";
import {
  CASCADA_VACIA,
  CRITERIO_UMBRAL,
  ORDEN_PASOS,
  UMBRAL_BC,
  alcanzaUmbral,
  cascadaResuelta,
  estructuraNoDeterminable,
  motivoDeUmbral,
  practicarPasoI,
  revisarMinimoDeSocios,
  sePuedePracticar,
  siguientePaso,
  type EstadoPaso,
  type Paso,
} from "@/lib/riesgo/beneficiario-controlador";
import { cn } from "@/lib/utils";
import type { Client, TipoPersona } from "@/types/domain";

/**
 * Estructura societaria y cascada del Beneficiario Controlador.
 *
 * Fuente: Adenda 2 de Kawiil-Cumplimiento (31/08/2026), que transcribe el
 * Capítulo III Quinquies de las RCG —art. 23 Quinquies y siguientes— publicado
 * en el DOF el 07/08/2026.
 *
 * Vive DENTRO del expediente del compareciente y no en una pantalla aparte: el
 * beneficiario controlador no es un trámite paralelo, es parte de conocer a
 * este cliente, y separarlo obligaría a cambiar de pantalla para responder una
 * pregunta que la matriz de riesgo hace sobre el mismo expediente.
 */

const TEXTO_PASO: Record<Paso, { titulo: string; descripcion: string }> = {
  I: {
    titulo: "Paso I · Titularidad",
    descripcion:
      `Quien posea el ${UMBRAL_BC} % o más de la composición accionaria o parte social, ` +
      "por titularidad o por derechos de voto.",
  },
  II: {
    titulo: "Paso II · Control por otros medios",
    descripcion:
      "Quien ejerza el control por medios distintos a la titularidad: funciones de " +
      "estrategia, decisión y dirección de las principales políticas.",
  },
  III: {
    titulo: "Paso III · Funcionario de mayor grado",
    descripcion:
      "Quien ocupe la posición de funcionario administrativo de mayor grado. Llegar aquí " +
      "significa que la estructura de control NO fue determinable.",
  },
};

const ETIQUETA_ESTADO: Record<EstadoPaso, string> = {
  no_practicado: "Sin practicar",
  practicado_sin_resultado: "Practicado, no arrojó a nadie",
  practicado_con_resultado: "Practicado, con resultado",
};

export function EstructuraSocietaria({ client }: { client: Client }) {
  const qc = useQueryClient();
  const clientId = client.id;
  const [abrirSocio, setAbrirSocio] = useState(false);
  const [abrirBeneficiario, setAbrirBeneficiario] = useState<Paso | null>(null);

  const { data: tipos = [] } = useQuery({
    queryKey: ["tipos-sociales"],
    queryFn: listarTiposSociales,
    staleTime: 60 * 60 * 1000,
  });
  const { data: socios = [], isLoading: cargandoSocios } = useQuery({
    queryKey: ["socios", clientId],
    queryFn: () => listarSocios(clientId),
  });
  const { data: cascada } = useQuery({
    queryKey: ["cascada-bc", clientId],
    queryFn: () => getCascada(clientId),
  });
  const { data: beneficiarios = [] } = useQuery({
    queryKey: ["beneficiarios", clientId],
    queryFn: () => listarBeneficiarios(clientId),
  });

  const estado = cascada?.estado ?? CASCADA_VACIA;
  const tipo = useMemo(
    () => tipos.find((t) => t.clave === client.tipo_social) ?? null,
    [tipos, client.tipo_social],
  );
  const revision = useMemo(
    () => revisarMinimoDeSocios(tipo, socios.length, client.pais_constitucion_clave),
    [tipo, socios.length, client.pais_constitucion_clave],
  );
  const pasoI = useMemo(() => practicarPasoI(socios), [socios]);
  // Exento sólo con la clave puesta: el art. 23 Quinquies 2 condiciona la
  // excepción a que el cliente la proporcione, y sin ella no aplica aunque la
  // sociedad cotice. La misma regla vive en el check de la base y en
  // `bc_exento()`; aquí se lee, no se reinventa.
  const exento =
    client.bc_exencion === "bolsa_de_valores" && (client.clave_pizarra ?? "").trim() !== "";

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["socios", clientId] });
    qc.invalidateQueries({ queryKey: ["cascada-bc", clientId] });
    qc.invalidateQueries({ queryKey: ["beneficiarios", clientId] });
    qc.invalidateQueries({ queryKey: ["cliente", clientId] });
  };

  // La excepción del art. 23 Quinquies 2. Se guarda al vuelo como el tipo
  // social: son datos del expediente, no un formulario que se envía.
  const guardarExencion = useMutation({
    mutationFn: (datos: { bc_exencion: ExencionBc | null; clave_pizarra: string | null }) =>
      guardarExencionBc(clientId, datos),
    onSuccess: () => {
      toast.success("Excepción actualizada");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardarTipo = useMutation({
    mutationFn: (datos: { tipo_social: string | null; pais_constitucion_clave: string | null }) =>
      guardarDatosSociedad(clientId, datos),
    onSuccess: () => {
      toast.success("Datos de la sociedad guardados");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const quitarSocio = useMutation({
    mutationFn: borrarSocio,
    onSuccess: () => {
      toast.success("Socio eliminado. Vuelve a practicar el paso I.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const quitarBeneficiario = useMutation({
    mutationFn: borrarBeneficiario,
    onSuccess: () => {
      toast.success("Beneficiario eliminado");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (client.tipo_persona !== "moral") {
    return (
      <div className="glass-card p-6 text-sm text-muted-foreground">
        La estructura societaria y el beneficiario controlador aplican a personas morales y
        fideicomisos. Este compareciente es persona física.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------------
          Tipo social. Va primero porque de él dependen el mínimo de socios
          y el anexo de identificación aplicable: sin tipo no se puede
          revisar nada.
      --------------------------------------------------------------- */}
      <section className="glass-card p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Tipo de sociedad</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            De él dependen el mínimo de socios y el anexo de identificación. Para sociedades
            constituidas fuera de México el mínimo se rige por la ley del lugar de constitución.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="tipo-social">Tipo social</Label>
            <Select
              value={client.tipo_social ?? ""}
              onValueChange={(v) =>
                guardarTipo.mutate({
                  tipo_social: v || null,
                  pais_constitucion_clave: client.pais_constitucion_clave,
                })
              }
            >
              <SelectTrigger id="tipo-social">
                <SelectValue placeholder="Sin capturar" />
              </SelectTrigger>
              <SelectContent>
                {tipos.map((t) => (
                  <SelectItem key={t.clave} value={t.clave}>
                    {t.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pais-const">País de constitución (clave de 2 letras)</Label>
            <Input
              id="pais-const"
              maxLength={2}
              defaultValue={client.pais_constitucion_clave ?? ""}
              placeholder="MX"
              onBlur={(e) => {
                const v = e.target.value.trim().toUpperCase() || null;
                if (v === (client.pais_constitucion_clave ?? null)) return;
                guardarTipo.mutate({ tipo_social: client.tipo_social, pais_constitucion_clave: v });
              }}
            />
          </div>
        </div>
        {tipo && (
          <p className="text-[13px] text-muted-foreground">{tipo.fundamento}</p>
        )}
      </section>

      {/* ---------------------------------------------------------------
          Socios
      --------------------------------------------------------------- */}
      <section className="glass-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Estructura societaria</h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Se capturan los dos porcentajes por socio: la Ley mide derechos de voto y las
              Reglas miden titularidad accionaria, y no siempre coinciden.
            </p>
          </div>
          <Button size="sm" onClick={() => setAbrirSocio(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Agregar socio
          </Button>
        </div>

        {/* La revisión del mínimo. Nunca con una constante global: la S.A.S.
            se constituye con un solo accionista. */}
        <div
          className={cn(
            "rounded-md px-3 py-2.5 text-[13px] flex gap-2",
            revision.cumple ? "bg-success/10 text-success" : "bg-warning/10 text-warning-ink",
          )}
        >
          {revision.cumple ? (
            <Check className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>
            <strong className="font-semibold">
              {revision.cumple ? "Mínimo de socios cumplido. " : "Revisar el número de socios. "}
            </strong>
            {revision.detalle}
          </span>
        </div>

        {cargandoSocios ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : socios.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin socios capturados. Sin ellos no se puede practicar el paso I.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["Socio", "Tipo", "Titularidad", "Voto", "Cargo", ""].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-muted-foreground uppercase py-2"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {socios.map((s) => {
                const alcanza = alcanzaUmbral(s);
                return (
                  <tr key={s.id} className="border-b border-border last:border-0 align-top">
                    <td className="py-2.5 text-sm">
                      <div className="font-medium">{s.nombre_razon_social}</div>
                      {alcanza && (
                        <div className="text-xs text-warning-ink mt-0.5">
                          Alcanza el umbral: {motivoDeUmbral(s)}
                        </div>
                      )}
                      {alcanza && s.tipo_persona === "moral" && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Persona moral: no es beneficiario, es un eslabón. Hay que ascender en la
                          cadena hasta la persona física que en última instancia ejerce el control.
                          {s.socio_client_id && (
                            <Link
                              to={`/clientes/${s.socio_client_id}`}
                              className="ml-1 inline-flex items-center text-primary hover:underline"
                            >
                              Abrir su expediente
                              <ArrowUpRight className="w-3 h-3 ml-0.5" />
                            </Link>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 text-sm">
                      {s.tipo_persona === "fisica" ? "Persona física" : "Persona moral"}
                    </td>
                    <td className="py-2.5 text-sm">
                      {s.porcentaje_titularidad != null ? `${s.porcentaje_titularidad} %` : "—"}
                    </td>
                    <td className="py-2.5 text-sm">
                      {s.porcentaje_voto != null ? `${s.porcentaje_voto} %` : "—"}
                    </td>
                    <td className="py-2.5 text-sm">{s.cargo ?? "—"}</td>
                    <td className="py-2.5 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Quitar a ${s.nombre_razon_social}`}
                        onClick={() => quitarSocio.mutate(s.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {socios.length > 0 && (
          <p className="text-[13px] text-muted-foreground">
            {pasoI.fisicas.length} persona{pasoI.fisicas.length === 1 ? "" : "s"} física
            {pasoI.fisicas.length === 1 ? "" : "s"} y {pasoI.morales_por_ascender.length} persona
            {pasoI.morales_por_ascender.length === 1 ? "" : "s"} moral
            {pasoI.morales_por_ascender.length === 1 ? "" : "es"} alcanzan el umbral.{" "}
            {CRITERIO_UMBRAL}
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------------
          La excepción del art. 23 Quinquies 2
      --------------------------------------------------------------- */}
      <section className="glass-card p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Excepción para no recabar beneficiario controlador
          </h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Es una prueba de categoría, no de nombre: no alcanza a empresas privadas, por grandes
            o conocidas que sean.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="bc-exencion">Supuesto</Label>
            <Select
              value={client.bc_exencion ?? "ninguna"}
              onValueChange={(v) =>
                guardarExencion.mutate({
                  bc_exencion: v === "ninguna" ? null : (v as ExencionBc),
                  clave_pizarra: client.clave_pizarra,
                })
              }
            >
              <SelectTrigger id="bc-exencion">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">Ninguna — se identifica el beneficiario</SelectItem>
                {EXENCION_BC.map((e) => (
                  <SelectItem key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {client.bc_exencion === "bolsa_de_valores" && (
            <div className="space-y-1.5">
              <Label htmlFor="clave-pizarra">Clave de pizarra</Label>
              <Input
                id="clave-pizarra"
                defaultValue={client.clave_pizarra ?? ""}
                placeholder="Obligatoria"
                onBlur={(e) => {
                  const v = e.target.value.trim().toUpperCase() || null;
                  if (v === (client.clave_pizarra ?? null)) return;
                  guardarExencion.mutate({
                    bc_exencion: "bolsa_de_valores",
                    clave_pizarra: v,
                  });
                }}
              />
              <p className="text-xs text-muted-foreground">
                {EXENCION_BC[0].ayuda}
              </p>
            </div>
          )}
        </div>

        {/* Una opción ausente sin explicación se lee como un olvido. */}
        <p className="text-[13px] text-muted-foreground">{EXENCION_BC_CERRADA}</p>

        {client.bc_exencion === "bolsa_de_valores" && !exento && (
          <div className="rounded-md bg-warning/10 text-warning-ink px-3 py-2.5 text-[13px] flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong className="font-semibold">La excepción no está surtiendo efecto. </strong>
              Falta la clave de pizarra, y sin ella el artículo no exime: hay que identificar al
              beneficiario controlador igual.
            </span>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------
          La cascada
      --------------------------------------------------------------- */}
      <section className="glass-card p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Beneficiario controlador · art. 23 Quinquies
          </h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Los tres pasos se practican en orden y no se salta ninguno. «Practicado sin resultado»
            y «sin practicar» son cosas distintas: la norma obliga a documentar el procedimiento
            seguido, no sólo su resultado.
          </p>
        </div>

        {estructuraNoDeterminable(estado) && (
          <div className="rounded-md bg-warning/10 text-warning-ink px-3 py-2.5 text-[13px] flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong className="font-semibold">Estructura de control no determinable. </strong>
              Se llegó al funcionario de mayor grado, lo que significa que ni la titularidad ni el
              control por otros medios arrojaron a nadie. Esto fuerza banda alta en la matriz de
              riesgo.
            </span>
          </div>
        )}

        {exento && (
          <div className="rounded-md bg-success/10 text-success px-3 py-2.5 text-[13px]">
            <strong className="font-semibold">Exento por el art. 23 Quinquies 2, fr. I. </strong>
            Emisora con valores inscritos y clave de pizarra {client.clave_pizarra}. No hace falta
            recabar los datos del beneficiario controlador, y la cascada queda disponible por si
            se quiere practicar de todos modos.
          </div>
        )}

        {!exento && !cascadaResuelta(estado) && (
          <div className="rounded-md bg-muted/60 px-3 py-2.5 text-[13px] text-muted-foreground">
            Expediente incompleto mientras el beneficiario controlador no esté resuelto.
            {siguientePaso(estado) && (
              <> Toca practicar el paso {siguientePaso(estado)}.</>
            )}
          </div>
        )}

        <div className="space-y-3">
          {ORDEN_PASOS.map((p) => {
            const fila = cascada?.pasos.find((x) => x.paso === p);
            const est = estado[p];
            const habilitado = sePuedePracticar(p, estado);
            return (
              <PasoCard
                key={p}
                paso={p}
                estado={est}
                nota={fila?.nota ?? null}
                practicadoEn={fila?.practicado_en ?? null}
                habilitado={habilitado}
                motivoBloqueo={habilitado ? null : motivoDelBloqueo(p, estado)}
                clientId={clientId}
                onListo={invalidar}
                onRegistrarBeneficiario={() => setAbrirBeneficiario(p)}
              />
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Beneficiarios identificados
      --------------------------------------------------------------- */}
      <section className="glass-card p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Beneficiarios controladores</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Cuando el cliente es persona moral o fideicomiso se recaban sólo cuatro datos del
            Anexo 3 y no se integra expediente completo: la verificación de identidad del art. 18
            fr. I está referida al Cliente con quien se realiza la Actividad Vulnerable, así que
            aquí no se corre.
          </p>
        </div>
        {beneficiarios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguno identificado todavía.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["Nombre", "Nacimiento", "Nacionalidad", "CURP", "RFC", "Paso", ""].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-muted-foreground uppercase py-2"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {beneficiarios.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 text-sm font-medium">
                    {[b.apellido_paterno, b.apellido_materno, b.nombre].filter(Boolean).join(" ")}
                  </td>
                  <td className="py-2.5 text-sm">
                    {new Date(`${b.fecha_nacimiento}T00:00:00`).toLocaleDateString("es-MX")}
                  </td>
                  <td className="py-2.5 text-sm">{b.pais_nacionalidad_clave}</td>
                  <td className="py-2.5 text-sm">
                    {b.curp ?? (b.sin_curp ? "No cuenta con CURP" : "—")}
                  </td>
                  <td className="py-2.5 text-sm">
                    {b.rfc ?? (b.sin_rfc ? "No cuenta con RFC" : "—")}
                  </td>
                  <td className="py-2.5 text-sm">
                    {b.paso === "III" ? (
                      <span className="status-badge bg-warning/10 text-warning-ink">
                        III · no determinable
                      </span>
                    ) : (
                      `Paso ${b.paso}`
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Quitar beneficiario"
                      onClick={() => quitarBeneficiario.mutate(b.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <DialogSocio
        abierto={abrirSocio}
        clientId={clientId}
        soloFisicas={tipo?.solo_personas_fisicas ?? false}
        onCerrar={() => setAbrirSocio(false)}
        onCreado={invalidar}
      />
      <DialogBeneficiario
        paso={abrirBeneficiario}
        clientId={clientId}
        socios={socios.map((s) => ({ id: s.id, nombre: s.nombre_razon_social }))}
        onCerrar={() => setAbrirBeneficiario(null)}
        onCreado={invalidar}
      />
    </div>
  );
}

// =====================================================================
// Un paso de la cascada
// =====================================================================

function PasoCard({
  paso,
  estado,
  nota,
  practicadoEn,
  habilitado,
  motivoBloqueo,
  clientId,
  onListo,
  onRegistrarBeneficiario,
}: {
  paso: Paso;
  estado: EstadoPaso;
  nota: string | null;
  practicadoEn: string | null;
  habilitado: boolean;
  motivoBloqueo: string | null;
  clientId: string;
  onListo: () => void;
  onRegistrarBeneficiario: () => void;
}) {
  const [capturando, setCapturando] = useState(false);
  const [texto, setTexto] = useState("");
  const [conResultado, setConResultado] = useState(true);

  const asentar = useMutation({
    mutationFn: () =>
      practicarPaso({
        client_id: clientId,
        paso,
        estado: conResultado ? "practicado_con_resultado" : "practicado_sin_resultado",
        nota: texto,
      }),
    onSuccess: () => {
      toast.success(`Paso ${paso} asentado`);
      setCapturando(false);
      setTexto("");
      onListo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const t = TEXTO_PASO[paso];
  return (
    <div
      className={cn(
        "rounded-lg border border-border p-4",
        !habilitado && estado === "no_practicado" && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{t.titulo}</h4>
          <p className="text-[13px] text-muted-foreground mt-0.5 max-w-2xl">{t.descripcion}</p>
        </div>
        <span
          className={cn(
            "status-badge shrink-0",
            estado === "practicado_con_resultado" && "bg-success/10 text-success",
            estado === "practicado_sin_resultado" && "bg-muted text-foreground",
            estado === "no_practicado" && "bg-muted/60 text-muted-foreground",
          )}
        >
          {ETIQUETA_ESTADO[estado]}
        </span>
      </div>

      {nota && (
        <p className="text-[13px] text-foreground mt-3 whitespace-pre-wrap">
          <span className="text-muted-foreground">Procedimiento seguido: </span>
          {nota}
          {practicadoEn && (
            <span className="text-muted-foreground">
              {" "}
              · {new Date(practicadoEn).toLocaleString("es-MX")}
            </span>
          )}
        </p>
      )}

      {motivoBloqueo && estado === "no_practicado" && (
        <p className="text-[13px] text-muted-foreground mt-3">{motivoBloqueo}</p>
      )}

      {habilitado && !capturando && (
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" onClick={() => setCapturando(true)}>
            {estado === "no_practicado" ? "Practicar este paso" : "Corregir lo asentado"}
          </Button>
          {estado === "practicado_con_resultado" && (
            <Button size="sm" variant="outline" onClick={onRegistrarBeneficiario}>
              <Plus className="w-4 h-4 mr-1.5" />
              Registrar beneficiario
            </Button>
          )}
        </div>
      )}

      {capturando && (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`nota-${paso}`}>
              Qué se hizo y qué se miró
            </Label>
            <Textarea
              id={`nota-${paso}`}
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej. Se revisó el acta constitutiva y el libro de registro de accionistas del 12/03/2026."
            />
            <p className="text-xs text-muted-foreground">
              Obligatorio: el art. 23 Quinquies obliga a documentar el procedimiento, no sólo su
              resultado.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id={`resultado-${paso}`}
              checked={conResultado}
              onCheckedChange={(v) => setConResultado(v === true)}
            />
            <Label htmlFor={`resultado-${paso}`} className="text-[13px] font-normal leading-snug">
              El paso arrojó a una o más personas físicas.
              <span className="block text-muted-foreground">
                Si se practicó y no arrojó a nadie, déjalo sin marcar: eso es lo que habilita el
                paso siguiente.
              </span>
            </Label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => asentar.mutate()} disabled={asentar.isPending}>
              {asentar.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Asentar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCapturando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Alta de socio
// =====================================================================

/**
 * El socio puede ser alguien ya registrado en Ikán o un nombre nuevo.
 *
 * Lo primero importa por dos razones: evita recapturar a quien ya compareció
 * —el caso que pidió Dirección: poner como socio al compareciente que se acaba
 * de dar de alta— y, cuando el socio es persona moral, deja la cadena enlazada
 * para poder ascender por ella sin adivinar a qué expediente corresponde.
 */
function DialogSocio({
  abierto,
  clientId,
  soloFisicas,
  onCerrar,
  onCreado,
}: {
  abierto: boolean;
  clientId: string;
  soloFisicas: boolean;
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const [desdeRegistro, setDesdeRegistro] = useState(true);
  const [socioClientId, setSocioClientId] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipoPersona, setTipoPersona] = useState<TipoPersona>("fisica");
  const [titularidad, setTitularidad] = useState("");
  const [voto, setVoto] = useState("");
  const [cargo, setCargo] = useState("");

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: listarClientes,
    enabled: abierto,
  });
  const candidatos = useMemo(
    () => clientes.filter((c) => c.id !== clientId),
    [clientes, clientId],
  );
  const elegido = candidatos.find((c) => c.id === socioClientId) ?? null;

  const limpiar = () => {
    setSocioClientId("");
    setNombre("");
    setTipoPersona("fisica");
    setTitularidad("");
    setVoto("");
    setCargo("");
  };

  const crear = useMutation({
    mutationFn: () => {
      const num = (v: string) => {
        const t = v.trim();
        if (!t) return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
      };
      return crearSocio({
        client_id: clientId,
        tipo_persona: desdeRegistro && elegido ? elegido.tipo_persona : tipoPersona,
        nombre_razon_social:
          desdeRegistro && elegido ? elegido.nombre_razon_social : nombre,
        socio_client_id: desdeRegistro && elegido ? elegido.id : null,
        porcentaje_titularidad: num(titularidad),
        porcentaje_voto: num(voto),
        cargo: cargo || null,
      });
    },
    onSuccess: () => {
      toast.success("Socio agregado");
      limpiar();
      onCerrar();
      onCreado();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const listo = desdeRegistro ? !!elegido : nombre.trim().length > 1;
  const tipoEfectivo = desdeRegistro && elegido ? elegido.tipo_persona : tipoPersona;
  const chocaConTipoSocial = soloFisicas && tipoEfectivo === "moral";

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar socio</DialogTitle>
          <DialogDescription>
            Se capturan los dos porcentajes por separado. El paso I dispara con cualquiera de los
            dos al {UMBRAL_BC} % o más.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={desdeRegistro ? "default" : "outline"}
              onClick={() => setDesdeRegistro(true)}
            >
              Ya está registrado
            </Button>
            <Button
              type="button"
              size="sm"
              variant={desdeRegistro ? "outline" : "default"}
              onClick={() => setDesdeRegistro(false)}
            >
              Capturar nombre
            </Button>
          </div>

          {desdeRegistro ? (
            <div className="space-y-1.5">
              <Label htmlFor="socio-registrado">Compareciente registrado</Label>
              <Select value={socioClientId} onValueChange={setSocioClientId}>
                <SelectTrigger id="socio-registrado">
                  <SelectValue placeholder="Elige de la lista" />
                </SelectTrigger>
                <SelectContent>
                  {candidatos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre_razon_social}
                      {c.tipo_persona === "moral" ? " · persona moral" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Queda enlazado a su expediente. Si es persona moral, la cadena sigue por ahí.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="socio-nombre">Nombre o razón social</Label>
                <Input
                  id="socio-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="socio-tipo">Tipo de persona</Label>
                <Select
                  value={tipoPersona}
                  onValueChange={(v) => setTipoPersona(v as TipoPersona)}
                >
                  <SelectTrigger id="socio-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fisica">Persona física</SelectItem>
                    <SelectItem value="moral">Persona moral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {chocaConTipoSocial && (
            <p className="text-[13px] text-warning-ink">
              La S.A.S. sólo admite personas físicas como accionistas (LGSM art. 260). Revisa el
              tipo social o el socio.
            </p>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="socio-titularidad">Titularidad %</Label>
              <Input
                id="socio-titularidad"
                inputMode="decimal"
                value={titularidad}
                onChange={(e) => setTitularidad(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="socio-voto">Voto %</Label>
              <Input
                id="socio-voto"
                inputMode="decimal"
                value={voto}
                onChange={(e) => setVoto(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="socio-cargo">Cargo</Label>
              <Input id="socio-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => crear.mutate()} disabled={!listo || crear.isPending}>
            {crear.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Alta de beneficiario controlador
// =====================================================================

/**
 * Los cuatro datos del Anexo 3, inciso a), numerales i), ii), iv) y ix), y nada
 * más. Ni expediente completo ni verificación de identidad: la del art. 18
 * fr. I está referida al Cliente con quien se realiza la Actividad Vulnerable.
 *
 * El «cuando cuente con ellas» de la CURP y el RFC aplica al DATO, no a la
 * obligación de preguntarlo, así que hay casilla para registrar la ausencia en
 * vez de dejar el campo en blanco sin decir nada.
 */
function DialogBeneficiario({
  paso,
  clientId,
  socios,
  onCerrar,
  onCreado,
}: {
  paso: Paso | null;
  clientId: string;
  socios: { id: string; nombre: string }[];
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const [apellidoPaterno, setApellidoPaterno] = useState("");
  const [apellidoMaterno, setApellidoMaterno] = useState("");
  const [nombre, setNombre] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [pais, setPais] = useState("MX");
  const [curp, setCurp] = useState("");
  const [rfc, setRfc] = useState("");
  const [sinCurp, setSinCurp] = useState(false);
  const [sinRfc, setSinRfc] = useState(false);
  const [socioId, setSocioId] = useState("");
  const [nota, setNota] = useState("");

  const limpiar = () => {
    setApellidoPaterno("");
    setApellidoMaterno("");
    setNombre("");
    setFechaNacimiento("");
    setPais("MX");
    setCurp("");
    setRfc("");
    setSinCurp(false);
    setSinRfc(false);
    setSocioId("");
    setNota("");
  };

  const crear = useMutation({
    mutationFn: () =>
      registrarBeneficiario({
        client_id: clientId,
        paso: paso as Paso,
        socio_id: socioId || null,
        apellido_paterno: apellidoPaterno,
        apellido_materno: apellidoMaterno || null,
        nombre,
        fecha_nacimiento: fechaNacimiento,
        pais_nacionalidad_clave: pais.trim().toUpperCase(),
        curp: curp || null,
        rfc: rfc || null,
        sin_curp: sinCurp,
        sin_rfc: sinRfc,
        nota: nota || null,
      }),
    onSuccess: () => {
      toast.success("Beneficiario controlador registrado");
      limpiar();
      onCerrar();
      onCreado();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const listo =
    apellidoPaterno.trim().length > 1 &&
    nombre.trim().length > 1 &&
    fechaNacimiento !== "" &&
    pais.trim().length === 2;

  return (
    <Dialog open={paso != null} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Beneficiario controlador · paso {paso}</DialogTitle>
          <DialogDescription>
            Sólo los cuatro datos del Anexo 3. No se integra expediente completo ni se corre
            verificación de identidad sobre el beneficiario controlador.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sin abreviaturas y en tres campos: así lo pide el numeral i). */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bc-paterno">Primer apellido</Label>
              <Input
                id="bc-paterno"
                value={apellidoPaterno}
                onChange={(e) => setApellidoPaterno(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bc-materno">Segundo apellido</Label>
              <Input
                id="bc-materno"
                value={apellidoMaterno}
                onChange={(e) => setApellidoMaterno(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bc-nombre">Nombre(s)</Label>
              <Input id="bc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bc-nacimiento">Fecha de nacimiento</Label>
              <Input
                id="bc-nacimiento"
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bc-pais">Nacionalidad (clave de 2 letras)</Label>
              <Input
                id="bc-pais"
                maxLength={2}
                value={pais}
                onChange={(e) => setPais(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bc-curp">CURP</Label>
              <Input
                id="bc-curp"
                value={curp}
                disabled={sinCurp}
                onChange={(e) => setCurp(e.target.value.toUpperCase())}
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="bc-sin-curp"
                  checked={sinCurp}
                  onCheckedChange={(v) => {
                    setSinCurp(v === true);
                    if (v === true) setCurp("");
                  }}
                />
                <Label htmlFor="bc-sin-curp" className="text-[13px] font-normal">
                  No cuenta con CURP
                </Label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bc-rfc">RFC</Label>
              <Input
                id="bc-rfc"
                value={rfc}
                disabled={sinRfc}
                onChange={(e) => setRfc(e.target.value.toUpperCase())}
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="bc-sin-rfc"
                  checked={sinRfc}
                  onCheckedChange={(v) => {
                    setSinRfc(v === true);
                    if (v === true) setRfc("");
                  }}
                />
                <Label htmlFor="bc-sin-rfc" className="text-[13px] font-normal">
                  No cuenta con RFC
                </Label>
              </div>
            </div>
          </div>

          {paso === "I" && socios.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="bc-socio">Socio del que sale</Label>
              <Select value={socioId} onValueChange={setSocioId}>
                <SelectTrigger id="bc-socio">
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  {socios.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="bc-nota">Nota</Label>
            <Textarea id="bc-nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => crear.mutate()} disabled={!listo || crear.isPending}>
            {crear.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
