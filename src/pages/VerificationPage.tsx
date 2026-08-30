import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, ShieldQuestion } from "lucide-react";
import { Link } from "react-router-dom";
import { listarClientes } from "@/lib/api/clientes";
import { pendientesCompareciente } from "@/lib/aviso/completitud";
import { cn } from "@/lib/utils";

/**
 * Identificación del compareciente.
 *
 * Esta pantalla enseñaba cuatro verificaciones inventadas —con nombres,
 * scores de prueba de vida y veredictos «Aprobado» y «Rechazado»— sin una sola
 * marca de que fueran de mentira. En un producto de cumplimiento eso no es un
 * placeholder: quien lo ve cuenta con ello, y decir que a una persona la
 * rechazó una verificación de identidad es una afirmación con consecuencias.
 *
 * Lo que se enseña ahora es lo que Ikán sabe de verdad hoy: los comparecientes
 * capturados y qué le falta a cada expediente para sostener un aviso. La
 * verificación no presencial —documento, prueba de vida, face match, RENAPO—
 * no está integrada, y el recuadro de arriba lo dice antes que nada.
 */

/** El flujo que correrá cuando haya proveedor. Es una descripción de lo que
 *  falta, no un resultado: por eso no lleva marcas de aprobado. */
const PASOS_PREVISTOS = [
  { paso: "Captura del documento", detalle: "INE, pasaporte o FM" },
  { paso: "OCR y extracción", detalle: "datos del documento" },
  { paso: "Validación del documento", detalle: "elementos de seguridad" },
  { paso: "Prueba de vida", detalle: "que sea la persona, en vivo" },
  { paso: "Face match", detalle: "contra la foto del documento" },
  { paso: "Validación CURP", detalle: "contra RENAPO" },
  { paso: "Consulta de listas", detalle: "OFAC, ONU, PEP, 69-B" },
  { paso: "Resolución", detalle: "aprobado, rechazado o revisión" },
];

const NIVEL_KYC: Record<string, { etiqueta: string; detalle: string }> = {
  N1: { etiqueta: "N1 · Básico", detalle: "Identificación simplificada" },
  N2: { etiqueta: "N2 · Reforzado", detalle: "Expediente ampliado" },
  N3: { etiqueta: "N3 · Debida diligencia reforzada", detalle: "Cliente de riesgo alto" },
};

export default function VerificationPage() {
  const { data: clientes = [], isLoading, isError, error } = useQuery({
    queryKey: ["clientes"],
    queryFn: listarClientes,
  });

  const conFaltantes = clientes.map((c) => ({
    cliente: c,
    faltan: pendientesCompareciente(c).filter((p) => p.gravedad === "bloquea_aviso").length,
  }));
  const completos = conFaltantes.filter((x) => x.faltan === 0).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">Identificación del compareciente</h1>

      <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
        <div className="text-sm text-foreground">
          {/* Encabezaba con «DEMO — sin integración real», que se lee como que
              TODO el entorno es de mentira, y contradecía el párrafo siguiente:
              los comparecientes de abajo son reales. Se acota al alcance. */}
          <p>
            <strong className="text-warning">Verificación de identidad: sin integrar.</strong> La
            verificación no presencial (documento, prueba de vida, face match, RENAPO) todavía no
            está conectada con ningún proveedor. Ikán no ha verificado la identidad de nadie.
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Lo que se ve abajo es el estado real del expediente de cada compareciente, capturado
            a mano. Ningún score, ningún veredicto: no existen todavía.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Metrica etiqueta="Comparecientes capturados" valor={clientes.length} />
        <Metrica
          etiqueta="Expedientes completos para aviso"
          valor={`${completos} de ${clientes.length}`}
        />
        <Metrica etiqueta="Verificaciones de identidad" valor="0" nota="sin integración" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando comparecientes…
            </div>
          ) : isError ? (
            <p className="p-6 text-sm text-destructive">
              No se pudieron cargar: {(error as Error).message}
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Compareciente", "Nivel KYC", "Expediente", "Identidad verificada"].map((h) => (
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
                {conFaltantes.map(({ cliente, faltan }) => {
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
                        <p className="text-[11px] text-muted-foreground">{cliente.rfc ?? "sin RFC"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">{nivel.etiqueta}</span>
                        <p className="text-[11px] text-muted-foreground">{nivel.detalle}</p>
                      </td>
                      <td className="px-4 py-3">
                        {/* El significado va en el texto, no sólo en el color. */}
                        <span
                          className={cn(
                            "status-badge text-[10px]",
                            faltan === 0
                              ? "bg-success/10 text-success"
                              : "bg-warning/10 text-warning",
                          )}
                        >
                          {faltan === 0 ? "Completo" : `Faltan ${faltan}`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="status-badge bg-muted text-muted-foreground text-[10px]">
                          Sin verificar
                        </span>
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
              <h3 className="text-sm font-semibold text-foreground">Cuando haya proveedor</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Los ocho pasos del flujo no presencial. Ninguno corre todavía.
              </p>
            </div>
          </div>

          <ol className="mt-4 space-y-3">
            {PASOS_PREVISTOS.map((p, i) => (
              <li key={p.paso} className="flex gap-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm text-foreground">{p.paso}</p>
                  <p className="text-[11px] text-muted-foreground">{p.detalle}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="text-[11px] text-warning mt-4">
            Los umbrales de aprobación (score de documento, de prueba de vida, de face match) los
            fija el proveedor junto con el Oficial de Cumplimiento. No se inventan aquí.
          </p>
        </div>
      </div>
    </div>
  );
}

function Metrica({
  etiqueta,
  valor,
  nota,
}: {
  etiqueta: string;
  valor: string | number;
  nota?: string;
}) {
  return (
    <div className="metric-card">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-accent" />
      <p className="text-xs font-medium text-muted-foreground uppercase">{etiqueta}</p>
      <p className="text-3xl font-bold text-foreground mt-1">{valor}</p>
      {nota && <p className="text-[11px] text-warning mt-0.5">{nota}</p>}
    </div>
  );
}
