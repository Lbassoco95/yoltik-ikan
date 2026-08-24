import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Shield, AlertTriangle, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getCliente, getPlantillaRiesgoXVI } from "@/lib/api/clientes";
import { listarOperacionesDeCliente } from "@/lib/api/operaciones";
import { elementosAplicables, respuestasCompletas } from "@/lib/riesgo/matriz";
import { formatMxn, UMA_MXN } from "@/lib/utils";
import type { TipoPersona } from "@/types/domain";
import { useAuth } from "@/lib/auth-context";
import { LABELS, labelTipoActo } from "@/lib/perfil-actividad";

const tipoLabel: Record<TipoPersona, string> = { fisica: "Persona Física", moral: "Persona Moral" };

export default function ClientDetailPage() {
  const { id } = useParams();
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  const { perfilActividad } = useAuth();
  const L = LABELS[perfilActividad];
  const esNotarias = perfilActividad === "notarias";

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
  const { data: plantilla } = useQuery({
    queryKey: ["plantilla-xvi"],
    queryFn: getPlantillaRiesgoXVI,
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
    ? respuestasCompletas(plantilla.configuracion, client.tipo_persona, respuestas)
    : false;

  return (
    <div className="space-y-6 animate-fade-in">
      <Link
        to="/clientes"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {L.volverAClientes}
      </Link>

      <div className="glass-card p-6">
        <h1 className="text-xl font-bold text-foreground">{client.nombre_razon_social}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {tipoLabel[client.tipo_persona]} · {client.rfc ?? "sin RFC"} · Nivel {client.nivel_kyc}
          {client.alto_de_oficio && (
            <span className="ml-2 status-badge bg-destructive/10 text-destructive">Alto de oficio</span>
          )}
        </p>
      </div>

      <Tabs defaultValue="datos" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="datos">Datos generales</TabsTrigger>
          {/* La matriz de riesgo aún no tiene plantilla para sector XII; se oculta
              en notarías para no mostrar el error de plantilla inexistente. */}
          {!esNotarias && <TabsTrigger value="matriz">Matriz de riesgo</TabsTrigger>}
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

        {!esNotarias && (
        <TabsContent value="matriz">
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-warning">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-sm">
              <strong>DEMO — sin fórmula confirmada.</strong> La captura de respuestas funciona,
              pero el cálculo de <em>score</em> y clasificación está pendiente de la fórmula oficial
              de ponderación (Excel Ixim Pay). Por eso la evaluación aún no se guarda.
            </p>
          </div>

          {!plantilla ? (
            <div className="glass-card p-6 text-sm text-muted-foreground">
              No se encontró la plantilla de matriz XVI.
            </div>
          ) : (
            <div className="space-y-4">
              {elementos.map((el) => (
                <div key={el.codigo} className="glass-card p-5">
                  <p className="text-sm font-semibold text-foreground mb-3">{el.nombre}</p>
                  <div className="space-y-3">
                    {el.variables.map((v) => (
                      <div key={v.codigo} className="grid grid-cols-2 gap-3 items-center">
                        <span className="text-sm text-muted-foreground">{v.pregunta}</span>
                        <Select
                          value={respuestas[v.codigo]?.toString() ?? ""}
                          onValueChange={(val) =>
                            setRespuestas({ ...respuestas, [v.codigo]: Number(val) })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona…" />
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
                    ))}
                  </div>
                </div>
              ))}

              <div className="glass-card p-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {completa ? "Captura completa." : "Captura incompleta."} Score:{" "}
                  <strong className="text-foreground">pendiente de fórmula</strong>
                </p>
                <Button disabled title="Bloqueado hasta confirmar la fórmula de scoring (RCG-0)">
                  Guardar evaluación (pendiente)
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
                        ? `${Math.round(op.monto_mxn / UMA_MXN).toLocaleString("es-MX")} UMA`
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
