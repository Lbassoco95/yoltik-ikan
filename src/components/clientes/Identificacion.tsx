import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnviarVerificacionDialog } from "@/components/verificacion/EnviarVerificacionDialog";
import {
  ETIQUETA_ESTADO,
  leerResumen,
  verificacionesDeCliente,
  type EstadoVerificacion,
} from "@/lib/api/verificacion";
import {
  pendientesCompareciente,
  pendientesIdentificacion,
} from "@/lib/aviso/completitud";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { TONO_ESTADO } from "@/lib/verificacion-labels";
import type { Client, CondicionPep } from "@/types/domain";

/**
 * La identificación del compareciente, dentro de su expediente.
 *
 * Estaba sólo en una pantalla general: se veía cuántos comparecientes estaban
 * verificados, pero no QUÉ resolvió Didit de ninguno en particular, y la
 * condición de PPE no se veía en ningún lado aunque el webhook la escribiera.
 * Un expediente que no enseña su propia identificación obliga a salirse de él
 * para responder la pregunta más básica que tiene.
 */

const TEXTO_PEP: Record<CondicionPep, { etiqueta: string; detalle: string }> = {
  no_pep: {
    etiqueta: "No es persona políticamente expuesta",
    detalle: "El screening de listas no encontró coincidencias de PPE.",
  },
  pep_nacional: {
    etiqueta: "PPE nacional",
    detalle:
      "Cumplimiento resolvió la coincidencia como persona políticamente expuesta nacional.",
  },
  pep_extranjera: {
    etiqueta: "PPE federal o extranjera",
    detalle:
      "Cumplimiento resolvió la coincidencia como PPE federal o extranjera.",
  },
  familiar_o_asociado: {
    etiqueta: "Familiar o asociado de una PPE",
    detalle:
      "Cónyuge, familiar hasta segundo grado o asociado cercano de una persona políticamente expuesta.",
  },
  coincidencia_sin_resolver: {
    etiqueta: "Coincidencia de PPE sin resolver",
    detalle:
      "El screening encontró una coincidencia y nadie la ha resuelto todavía. No es lo mismo que no ser PPE.",
  },
};

/** Las categorías que devuelve el screening, en español. */
const TEXTO_CATEGORIA: Record<string, string> = {
  pep: "Persona políticamente expuesta",
  sanction: "Sanción",
  sancion: "Sanción",
  adverse_media: "Nota periodística adversa",
  warning: "Advertencia",
  fitness_probity: "Idoneidad y probidad",
  sin_clasificar: "Coincidencia sin categoría reconocible",
};

export function Identificacion({ client }: { client: Client }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [enviando, setEnviando] = useState(false);

  const {
    data: verificaciones = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["verificaciones-cliente", client.id],
    queryFn: () => verificacionesDeCliente(client.id),
  });

  const vigente = verificaciones[0] ?? null;
  const resumen = leerResumen(vigente?.resumen);
  const kyc = (client.datos_kyc ?? {}) as Record<string, unknown>;

  /**
   * Qué se quedó sin revisar en esta verificación, y por qué.
   *
   * Se arma cruzando dos cosas que Didit sí dice y no estábamos leyendo: los
   * módulos que realmente corrieron (`modulos_ejecutados`, que sale de
   * `features` en la decisión) y el motivo con el que el proveedor explica el
   * que no corrió. Nada de esto se deduce ni se supone: si el proveedor no lo
   * dice, aquí no aparece.
   */
  const faltaRevisar = useMemo(() => {
    const salida: { que: string; porque: string }[] = [];
    const corrieron = resumen.modulos_ejecutados;

    // Las listas: PPE, sanciones, adversos. Sólo se afirma que no corrieron
    // cuando Didit enumeró los módulos y AML no estaba entre ellos; si no
    // enumeró nada, no se sabe y no se dice.
    if (corrieron && !corrieron.some((m) => m.toUpperCase().includes("AML"))) {
      salida.push({
        que: "Listas restrictivas y antecedentes",
        porque:
          "el módulo AML no se ejecutó en esta sesión (PPE, sanciones y medios adversos)",
      });
    }

    if (resumen.validacion_base_no_corrio) {
      const b = resumen.validacion_base_no_corrio;
      const servicios = b.servicios?.length
        ? b.servicios.join(" · ")
        : "validación contra bases oficiales";
      salida.push({
        que: servicios,
        porque: b.mensaje ?? "el proveedor no ejecutó la consulta",
      });
    }

    return salida;
  }, [resumen]);

  const faltantes = [
    ...pendientesCompareciente(client),
    ...pendientesIdentificacion(vigente?.estado, {
      tipoPersona: client.tipo_persona,
      cargando: isLoading,
    }),
  ];

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------------
          Estado de la verificación
      --------------------------------------------------------------- */}
      <section className="estela-placa p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Verificación de identidad
            </h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Didit comprueba que la persona es quien dice ser: documento
              oficial, prueba de vida y cotejo facial.
            </p>
          </div>
          {client.tipo_persona === "fisica" && (
            <Button size="sm" onClick={() => setEnviando(true)}>
              {vigente ? "Volver a verificar" : "Verificar identidad"}
            </Button>
          )}
        </div>

        {client.tipo_persona === "moral" ? (
          <p className="text-sm text-muted-foreground">
            A una sociedad no se le verifica la identidad: no tiene documento
            oficial ni cara. Lo que se identifica de una persona moral son las
            personas físicas detrás, y eso vive en la pestaña «Estructura y
            beneficiario».
          </p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </p>
        ) : isError ? (
          <p className="text-sm text-destructive">
            No se pudo cargar: {(error as Error).message}
          </p>
        ) : !vigente ? (
          <p className="text-sm text-muted-foreground">
            No se le ha pedido la verificación. El expediente no está
            identificado.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className={cn("status-badge", TONO_ESTADO[vigente.estado])}>
                {ETIQUETA_ESTADO[vigente.estado]}
              </span>
              <span className="text-[13px] text-muted-foreground">
                Enviada el{" "}
                {new Date(vigente.solicitada_en).toLocaleString("es-MX")}
                {vigente.enviado_a
                  ? ` a ${vigente.enviado_a}`
                  : " en esta pantalla"}
                {vigente.resuelta_en &&
                  ` · resuelta el ${new Date(vigente.resuelta_en).toLocaleString("es-MX")}`}
              </span>
            </div>

            {/* Lo que Didit resolvió, módulo por módulo. Lo que no venga no se
                pinta: rellenar un hueco con «sin coincidencias» cuando el
                módulo no corrió es justo la afirmación que no se sostiene. */}
            {resumen.documento ||
            resumen.prueba_de_vida ||
            resumen.cotejo_facial ||
            resumen.listas ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {resumen.documento && (
                  <Bloque titulo="Documento de identidad">
                    <Dato etiqueta="Tipo" valor={resumen.documento.tipo} />
                    <Dato
                      etiqueta="País emisor"
                      valor={resumen.documento.pais}
                    />
                    <Dato
                      etiqueta="Nombre leído"
                      valor={resumen.documento.nombre_leido}
                    />
                    <Dato etiqueta="Vence" valor={resumen.documento.vence} />
                    {resumen.documento.avisos > 0 && (
                      <p className="text-[13px] text-warning-ink mt-1">
                        {resumen.documento.avisos} aviso
                        {resumen.documento.avisos === 1 ? "" : "s"} del
                        proveedor sobre el documento.
                      </p>
                    )}
                  </Bloque>
                )}
                {(resumen.prueba_de_vida || resumen.cotejo_facial) && (
                  <Bloque titulo="Biometría">
                    {resumen.prueba_de_vida && (
                      <Dato
                        etiqueta="Prueba de vida"
                        valor={etiquetaModulo(
                          resumen.prueba_de_vida.estado,
                          resumen.prueba_de_vida.puntaje,
                        )}
                      />
                    )}
                    {resumen.cotejo_facial && (
                      <Dato
                        etiqueta="Cotejo facial"
                        valor={etiquetaModulo(
                          resumen.cotejo_facial.estado,
                          resumen.cotejo_facial.puntaje,
                        )}
                      />
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Las imágenes y los datos biométricos se quedan en Didit.
                      Aquí sólo el resultado.
                    </p>
                  </Bloque>
                )}
                {resumen.listas && (
                  <Bloque titulo="Listas">
                    <Dato
                      etiqueta="Coincidencias"
                      valor={String(resumen.listas.coincidencias)}
                    />
                    {resumen.listas.categorias.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {resumen.listas.categorias.map((c) => (
                          <span
                            key={c}
                            className="status-badge bg-warning/15 text-warning-ink text-xs"
                          >
                            {TEXTO_CATEGORIA[c] ?? c}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Con QUÉ persona coincidió no se guarda: eso es información
                      de un tercero y se queda en el proveedor.
                    </p>
                  </Bloque>
                )}
                {/* Lo que NO se revisó. Va con los demás bloques y no en una
                    nota al pie, porque para el Oficial de Cumplimiento vale
                    tanto como los que sí: un expediente donde no consta que se
                    consultaron las listas no es un expediente donde no hubo
                    coincidencias.

                    Antes esto no se decía en ningún sitio. La regla del
                    resumen —«lo que no venga, no se pinta»— protege de
                    inventarse resultados, pero deja un silencio que se lee
                    como un «todo en orden». Aquí el silencio es la afirmación
                    peligrosa. */}
                {faltaRevisar.length > 0 && (
                  <Bloque titulo="Lo que NO se revisó">
                    <ul className="m-0 list-none space-y-1.5 p-0">
                      {faltaRevisar.map((f) => (
                        <li key={f.que} className="text-[13px]">
                          <span className="font-semibold text-warning-ink">
                            {f.que}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            — {f.porque}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">
                      No se consultó: no es que no hubiera coincidencias. Para
                      integrar el expediente del artículo 18, esto sigue
                      pendiente.
                    </p>
                  </Bloque>
                )}

                {resumen.canal && (
                  /* «Ubicación de la sesión», NO del cliente. La
                     geolocalización por red no es el domicilio del
                     compareciente ni el lugar del acto: en fe pública la
                     ubicación relevante es la del inmueble y la del domicilio
                     declarado. Rotularla mal llevaría a concluir de más. */
                  <Bloque titulo="Ubicación de la sesión">
                    <Dato
                      etiqueta="País de conexión"
                      valor={resumen.canal.pais ?? "sin dato"}
                    />
                    {resumen.canal.vpn_o_tor !== null && (
                      <Dato
                        etiqueta="VPN o Tor"
                        valor={
                          resumen.canal.vpn_o_tor
                            ? "Sí, detectado"
                            : "No detectado"
                        }
                      />
                    )}
                    {resumen.canal.centro_de_datos !== null && (
                      <Dato
                        etiqueta="Centro de datos"
                        valor={
                          resumen.canal.centro_de_datos
                            ? "Sí, detectado"
                            : "No detectado"
                        }
                      />
                    )}
                    {resumen.canal.divergencia_documento_km !== null && (
                      <Dato
                        etiqueta="Distancia al domicilio del documento"
                        valor={
                          `${Math.round(resumen.canal.divergencia_documento_km)} km` +
                          (resumen.canal.divergencia_documento_rumbo
                            ? ` al ${resumen.canal.divergencia_documento_rumbo}`
                            : "")
                        }
                      />
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Del canal se conserva el país y las banderas de red. La
                      dirección completa y las coordenadas no se guardan: son
                      evidencia de por dónde se conectó, no de dónde vive. Lo
                      que vale es la divergencia, no el punto.
                    </p>
                  </Bloque>
                )}
              </div>
            ) : (
              vigente.estado === "aprobada" && (
                <p className="text-[13px] text-muted-foreground">
                  El proveedor no devolvió detalle por módulo en esta
                  verificación.
                </p>
              )
            )}

            {verificaciones.length > 1 && (
              <details className="pt-2">
                <summary className="text-[13px] text-muted-foreground cursor-pointer">
                  {verificaciones.length - 1} verificación
                  {verificaciones.length - 1 === 1 ? "" : "es"} anterior
                  {verificaciones.length - 1 === 1 ? "" : "es"}
                </summary>
                <ul className="mt-2 space-y-1">
                  {verificaciones.slice(1).map((v) => (
                    <li
                      key={v.id}
                      className="text-[13px] text-muted-foreground"
                    >
                      {new Date(v.solicitada_en).toLocaleString("es-MX")} ·{" "}
                      {ETIQUETA_ESTADO[v.estado]}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>

      {/* ---------------------------------------------------------------
          Persona políticamente expuesta
      --------------------------------------------------------------- */}
      <section className="estela-placa p-6 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          Persona políticamente expuesta
        </h3>
        {client.condicion_pep == null ? (
          <p className="text-sm text-muted-foreground">
            Sin consultar. No es lo mismo que «no es PPE»: nadie lo ha
            preguntado todavía. La consulta corre con el screening de listas de
            la verificación.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "status-badge",
                  client.condicion_pep === "no_pep"
                    ? "bg-success/10 text-success"
                    : client.condicion_pep === "coincidencia_sin_resolver"
                      ? "bg-warning/15 text-warning-ink"
                      : "bg-warning/15 text-warning-ink",
                )}
              >
                {TEXTO_PEP[client.condicion_pep].etiqueta}
              </span>
            </div>
            <p className="text-[13px] text-muted-foreground">
              {TEXTO_PEP[client.condicion_pep].detalle}
            </p>
            {client.pep_evidencia && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 pt-1">
                {Object.entries(client.pep_evidencia).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                      {k.replace(/_/g, " ")}
                    </dt>
                    <dd className="text-[13px] text-foreground">
                      {typeof v === "string" || typeof v === "number"
                        ? String(v)
                        : JSON.stringify(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </section>

      {/* ---------------------------------------------------------------
          Qué falta
      --------------------------------------------------------------- */}
      <section className="estela-placa p-6 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          Qué le falta a este expediente
        </h3>
        {faltantes.length === 0 ? (
          <p className="text-sm text-success flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Nada pendiente para sostener un aviso.
          </p>
        ) : (
          <ul className="space-y-2">
            {faltantes.map((p) => (
              <li key={`${p.no}-${p.campo}`} className="flex gap-2 text-[13px]">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-ikan-ambar" />
                <span>
                  <strong className="font-medium text-foreground">
                    {p.campo}
                  </strong>{" "}
                  <span className="text-muted-foreground">({p.no})</span> —{" "}
                  {p.detalle}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Lo que no corre. Sin banner, un notario podría dar por hecha una
          comprobación que nadie hizo. */}
      <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-ikan-ambar" />
        <p className="text-[13px] text-foreground">
          <strong className="text-warning-ink">
            Verificar identidad no es integrar el expediente.
          </strong>{" "}
          Dos piezas del artículo 18 todavía no corren aquí: la validación de la
          CURP contra RENAPO y la consulta del listado 69-B del SAT.
        </p>
      </div>

      <EnviarVerificacionDialog
        clienteId={enviando ? client.id : null}
        clienteNombre={client.nombre_razon_social}
        tipoPersona={client.tipo_persona}
        correoSugerido={(kyc.email as string | undefined) ?? null}
        telefonoSugerido={(kyc.telefono as string | undefined) ?? null}
        nombreOrganizacion={profile?.organization_name ?? "Su notaría"}
        onCerrar={() => setEnviando(false)}
        onEnviada={() =>
          qc.invalidateQueries({
            queryKey: ["verificaciones-cliente", client.id],
          })
        }
      />
    </div>
  );
}

function Bloque({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border p-4">
      <h4 className="estela-antetitulo text-muted-foreground">
        {titulo}
      </h4>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <p className="text-[13px]">
      <span className="text-muted-foreground">{etiqueta}: </span>
      <span className="text-foreground">{valor}</span>
    </p>
  );
}

/**
 * El estado de un módulo con su puntaje.
 *
 * El puntaje sin el estado no dice nada —¿86 de qué?— y el estado sin el
 * puntaje esconde un aprobado raspado. Van juntos o no van.
 */
function etiquetaModulo(
  estado: string | null,
  puntaje: number | null,
): string | null {
  const est =
    estado === "Approved"
      ? "Aprobado"
      : estado === "Declined"
        ? "No pasó"
        : estado === "In Review"
          ? "En revisión"
          : estado;
  if (!est) return null;
  return puntaje != null ? `${est} · ${puntaje}` : est;
}
