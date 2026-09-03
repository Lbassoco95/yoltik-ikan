import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EnviarVerificacionDialog } from "@/components/verificacion/EnviarVerificacionDialog";
import { listarClientes } from "@/lib/api/clientes";
import {
  ETIQUETA_ESTADO,
  verificacionesVigentes,
  type EstadoVerificacion,
  type VerificacionVigente,
} from "@/lib/api/verificacion";
import { pendientesCompareciente, pendientesIdentificacion } from "@/lib/aviso/completitud";
import { DETALLE_NIVEL, ETIQUETA_NIVEL } from "@/lib/riesgo/nivel-diligencia";
import { useAuth } from "@/lib/auth-context";
import { etiquetaConocimiento } from "@/lib/perfil-actividad";
import type { TipoPersona } from "@/types/domain";
import { cn } from "@/lib/utils";

/**
 * Identificación del compareciente.
 *
 * Esta pantalla enseñaba cuatro verificaciones inventadas —con nombres, scores
 * de prueba de vida y veredictos «Aprobado» y «Rechazado»— sin una sola marca
 * de que fueran de mentira. En un producto de cumplimiento eso no es un
 * placeholder: quien lo ve cuenta con ello, y decir que a una persona la
 * rechazó una verificación de identidad es una afirmación con consecuencias.
 *
 * Se sustituyó por un aviso de «sin integrar» con los ocho pasos que correrían
 * cuando hubiera proveedor. Eso era verdad el día que se escribió y dejó de
 * serlo cuando entró Didit: la verificación quedó viva en Comparecientes y
 * esta pantalla —la que se llama «Verificación», donde cualquiera la busca—
 * seguía diciendo que Ikán no había verificado la identidad de nadie, con el
 * contador de verificaciones clavado en cero y «Sin verificar» en cada
 * renglón, aunque la de al lado ya estuviera mostrando el resultado.
 *
 * Es el mismo error que los umbrales escritos a mano: una pantalla afirmando
 * sobre el estado del sistema algo que el sistema ya no hace. Ahora lee el
 * mismo dato que Comparecientes y desde aquí se abre la verificación.
 */

/**
 * Los niveles, con lo que significan de verdad.
 *
 * Las etiquetas anteriores decían que N2 era «Reforzado / Expediente
 * ampliado», y no lo es: N2 es el nivel ESTÁNDAR, el de todo cliente. Reforzada
 * es la N3. Un rótulo que llama reforzado a lo estándar hace creer que hay
 * medidas aplicadas que nadie aplicó.
 *
 * Salen del módulo puro para que la pantalla y la base digan lo mismo.
 */
const NIVEL_KYC: Record<string, { etiqueta: string; detalle: string }> = {
  N1: { etiqueta: `N1 · ${ETIQUETA_NIVEL.N1}`, detalle: DETALLE_NIVEL.N1 },
  N2: { etiqueta: `N2 · ${ETIQUETA_NIVEL.N2}`, detalle: DETALLE_NIVEL.N2 },
  N3: { etiqueta: `N3 · ${ETIQUETA_NIVEL.N3}`, detalle: DETALLE_NIVEL.N3 },
};

/**
 * Lo que Didit corre y lo que NO se guarda.
 *
 * La segunda mitad importa tanto como la primera: la conservación de la
 * fracción XII pasó a diez años, y lo que se guarde hoy se guarda una década.
 * Ikán conserva el resumen de la decisión —qué módulo corrió y con qué
 * resultado— y ni el documento, ni la biometría, ni la fecha de nacimiento.
 * Eso se queda en Didit (migration 0032).
 */
const PASOS_DIDIT = [
  { paso: "Captura del documento", detalle: "INE, pasaporte o FM" },
  { paso: "Validación del documento", detalle: "elementos de seguridad y OCR" },
  { paso: "Prueba de vida", detalle: "que sea la persona, en vivo" },
  { paso: "Face match", detalle: "contra la foto del documento" },
  { paso: "Resolución", detalle: "aprobada, rechazada o a revisión" },
];

export default function VerificationPage() {
  const { profile } = useAuth();
  const [aVerificar, setAVerificar] = useState<{
    id: string;
    nombre: string;
    tipoPersona: TipoPersona;
    correo: string | null;
    telefono: string | null;
  } | null>(null);

  const { data: clientes = [], isLoading, isError, error } = useQuery({
    queryKey: ["clientes"],
    queryFn: listarClientes,
  });

  const {
    data: verificaciones,
    isLoading: cargandoVerificaciones,
    refetch: recargar,
  } = useQuery({
    queryKey: ["verificaciones-vigentes"],
    queryFn: async () => {
      const filas = await verificacionesVigentes();
      return new Map(filas.map((v: VerificacionVigente) => [v.client_id, v.estado]));
    },
  });

  // El expediente cuenta las dos cosas: los campos que el layout exige y la
  // identificación que exige el artículo 18. Un compareciente con todos sus
  // datos capturados y sin identificar no está completo, aunque su aviso pase
  // la validación del portal sin una queja.
  const conFaltantes = clientes.map((c) => {
    const estado = verificaciones?.get(c.id);
    const delLayout = pendientesCompareciente(c).filter(
      (p) => p.gravedad === "bloquea_aviso",
    ).length;
    const deIdentificacion = pendientesIdentificacion(estado, {
      tipoPersona: c.tipo_persona,
      cargando: cargandoVerificaciones,
    }).length;
    return { cliente: c, faltan: delLayout + deIdentificacion, delLayout, estado };
  });
  const completos = conFaltantes.filter((x) => x.faltan === 0).length;
  const verificados = conFaltantes.filter((x) => x.estado === "aprobada").length;
  const enCurso = conFaltantes.filter(
    (x) => x.estado && x.estado !== "aprobada" && x.estado !== "rechazada",
  ).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="estela-titulo text-2xl font-extrabold tracking-tight text-foreground">Identificación del compareciente</h1>

      {/* Lo que sigue sin integrarse, acotado. Didit resuelve quién es la
          persona; no consulta RENAPO ni las listas, y decir lo contrario sería
          darle al notario por hecha una comprobación que nadie hizo. */}
      <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning-ink" />
        <div className="text-sm text-foreground">
          <p>
            <strong className="text-warning-ink">Verificar identidad no es integrar el expediente.</strong>{" "}
            La verificación comprueba que la persona es quien dice ser. La identificación del
            artículo 18 es más que eso, y hay dos piezas que todavía no corren aquí: la validación
            de la CURP contra RENAPO y la consulta de listas (OFAC, ONU, PEP, 69-B).
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">
            La identificación sí cuenta para el expediente: un compareciente con todos sus datos
            capturados y sin verificar aparece incompleto, aunque su aviso pase la validación del
            portal sin una queja. El portal no pregunta; la autoridad, cuando revise, sí.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Metrica etiqueta="Comparecientes capturados" valor={clientes.length} />
        <Metrica etiqueta="Identidad verificada" valor={verificados} nota="con Didit" />
        <Metrica etiqueta="Verificaciones en curso" valor={enCurso} nota="enviadas, sin resolver" />
        <Metrica
          etiqueta="Expedientes completos"
          valor={`${completos} de ${clientes.length}`}
          nota="para sostener un aviso"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card overflow-x-auto">
          {isLoading ? (
            <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando comparecientes…
            </div>
          ) : isError ? (
            <p className="p-6 text-sm text-destructive">
              No se pudieron cargar: {(error as Error).message}
            </p>
          ) : (
            <table className="w-full min-w-[38rem]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Compareciente", "Conocimiento", "Expediente", "Identidad"].map((h) => (
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
                {conFaltantes.map(({ cliente, faltan, delLayout, estado }) => {
                  const nivel = NIVEL_KYC[cliente.nivel_kyc] ?? {
                    etiqueta: cliente.nivel_kyc,
                    detalle: "",
                  };
                  return (
                    <tr key={cliente.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          to={`/clientes/${cliente.id}`}
                          className="text-sm font-medium text-foreground hover:underline"
                        >
                          {cliente.nombre_razon_social}
                        </Link>
                        <p className="text-[13px] text-muted-foreground">{cliente.rfc ?? "sin RFC"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">
                          {etiquetaConocimiento(cliente.tipo_persona)} · {nivel.etiqueta}
                        </span>
                        <p className="text-[13px] text-muted-foreground">{nivel.detalle}</p>
                      </td>
                      <td className="px-4 py-3">
                        {/* El significado va en el texto, no sólo en el color. */}
                        <span
                          className={cn(
                            "status-badge text-xs",
                            faltan === 0
                              ? "bg-success/10 text-success"
                              : "bg-warning/10 text-warning-ink",
                          )}
                        >
                          {faltan === 0
                            ? "Completo"
                            : delLayout === 0
                              ? "Falta identificar"
                              : `Faltan ${faltan}`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <EstadoIdentidad
                          estado={estado}
                          onVerificar={() =>
                            setAVerificar({
                              id: cliente.id,
                              nombre: cliente.nombre_razon_social,
                              tipoPersona: cliente.tipo_persona,
                              correo:
                                (cliente.datos_kyc?.email as string | undefined) ?? null,
                              telefono:
                                (cliente.datos_kyc?.telefono as string | undefined) ?? null,
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
                {clientes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      Todavía no hay comparecientes capturados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="glass-card p-6 h-fit">
          <div className="flex items-start gap-2">
            <ShieldQuestion className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Qué corre al verificar</h3>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                El compareciente lo hace desde su teléfono, aquí mismo o por una liga.
              </p>
            </div>
          </div>

          <ol className="mt-4 space-y-3">
            {PASOS_DIDIT.map((p, i) => (
              <li key={p.paso} className="flex gap-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-muted text-muted-foreground text-[13px] font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm text-foreground">{p.paso}</p>
                  <p className="text-[13px] text-muted-foreground">{p.detalle}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-[13px] text-foreground font-medium">Qué se guarda y qué no</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              Ikán conserva el resumen de la decisión: qué comprobación corrió y con qué
              resultado. El documento y la biometría se quedan con el proveedor. La conservación
              de la fracción XII es de diez años, y lo que se guarde hoy se guarda una década.
            </p>
          </div>

          <p className="text-[13px] text-warning-ink mt-4">
            Los umbrales de aprobación —score de documento, de prueba de vida, de face match— los
            fija el proveedor junto con el Oficial de Cumplimiento. No se inventan aquí.
          </p>
        </div>
      </div>

      <EnviarVerificacionDialog
        clienteId={aVerificar?.id ?? null}
        clienteNombre={aVerificar?.nombre ?? ""}
        tipoPersona={aVerificar?.tipoPersona}
        correoSugerido={aVerificar?.correo ?? null}
        telefonoSugerido={aVerificar?.telefono ?? null}
        nombreOrganizacion={profile?.organization_name ?? "Su notaría"}
        onCerrar={() => setAVerificar(null)}
        onEnviada={() => void recargar()}
      />
    </div>
  );
}

/**
 * Estado de identidad de un compareciente.
 *
 * Sin verificación no se dice «no verificado», que suena a que falló: se
 * ofrece hacerla. Y cuando está aprobada se dice «identidad verificada», nunca
 * «identificado» a secas — identificar en el sentido del artículo 18 es
 * integrar el expediente, y eso es más que verificar quién es alguien.
 */
function EstadoIdentidad({
  estado,
  onVerificar,
}: {
  estado: EstadoVerificacion | undefined;
  onVerificar: () => void;
}) {
  if (!estado) {
    return (
      <Button size="sm" variant="ghost" className="gap-2" onClick={onVerificar}>
        <ShieldCheck className="w-4 h-4" /> Verificar
      </Button>
    );
  }

  // El color refuerza; el texto lleva el significado.
  const clase =
    estado === "aprobada"
      ? "bg-success/10 text-success"
      : estado === "rechazada"
        ? "bg-destructive/10 text-destructive"
        : estado === "en_progreso" || estado === "no_iniciada" || estado === "en_revision"
          ? "bg-accent/10 text-accent"
          : "bg-warning/10 text-warning-ink";

  return (
    <div className="flex items-center gap-2">
      <span className={cn("status-badge text-xs whitespace-nowrap", clase)}>
        {ETIQUETA_ESTADO[estado]}
      </span>
      {/* Se puede reintentar salvo cuando ya está aprobada: volver a pedirla
          ahí sólo gasta una verificación y confunde a la persona. */}
      {estado !== "aprobada" && (
        <Button size="sm" variant="ghost" onClick={onVerificar} className="h-7 px-2 text-xs">
          Reenviar
        </Button>
      )}
    </div>
  );
}

function Metrica({
  etiqueta,
  valor,
  nota,
}: {
  etiqueta: string;
  valor: number | string;
  nota?: string;
}) {
  return (
    <div className="glass-card p-4">
      <p className="text-xs text-muted-foreground uppercase">{etiqueta}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{valor}</p>
      {nota && <p className="text-[13px] text-muted-foreground">{nota}</p>}
    </div>
  );
}
