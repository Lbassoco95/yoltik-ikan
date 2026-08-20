import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Shield, Mail, Phone, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockClients, mockOperations, mockAlerts } from "@/data/mockData";
import { cn, formatMxnWithUnit } from "@/lib/utils";
import {
  DataTable,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  clientRiskSolidColors,
  operationStatusColors,
} from "@/lib/status-colors";

export default function ClientDetailPage() {
  const { id } = useParams();
  const client = mockClients.find((c) => c.id === id);
  if (!client)
    return (
      <div className="p-8 text-center text-muted-foreground">
        Cliente no encontrado
      </div>
    );

  const clientOps = mockOperations.filter((o) => o.clientId === client.id);
  const clientAlerts = mockAlerts.filter((a) => a.clientName === client.name);

  return (
    <div className="space-y-6 animate-fade-in">
      <Link
        to="/clientes"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Volver a clientes
      </Link>

      <div className="grid grid-cols-4 gap-6">
        {/* Main Content */}
        <div className="col-span-3">
          <div className="glass-card p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  {client.name}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {client.type === "PF" ? "Persona Física" : "Persona Moral"} ·{" "}
                  {client.rfc}
                </p>
              </div>
            </div>
          </div>

          <Tabs defaultValue="datos" className="space-y-4">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="datos">Datos generales</TabsTrigger>
              <TabsTrigger value="docs">Documentos</TabsTrigger>
              <TabsTrigger value="beneficiario">
                Beneficiario controlador
              </TabsTrigger>
              <TabsTrigger value="verificacion">Verificación</TabsTrigger>
              <TabsTrigger value="operaciones">Operaciones</TabsTrigger>
              <TabsTrigger value="historial">Historial</TabsTrigger>
            </TabsList>

            <TabsContent value="datos">
              <div className="glass-card p-6 grid grid-cols-2 gap-6">
                {[
                  { label: "Nombre completo", value: client.name },
                  { label: "RFC", value: client.rfc },
                  { label: "CURP", value: client.curp || "N/A" },
                  { label: "Nacionalidad", value: client.nationality },
                  { label: "Actividad económica", value: client.activity },
                  { label: "Email", value: client.email },
                  { label: "Teléfono", value: client.phone },
                  { label: "Última actualización", value: client.lastUpdate },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {f.label}
                    </p>
                    <p className="text-sm font-medium text-foreground mt-1">
                      {f.value}
                    </p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="docs">
              <div className="glass-card p-6 grid grid-cols-3 gap-4">
                {["INE Anverso", "INE Reverso", "Comprobante de domicilio"].map(
                  (doc) => (
                    <div
                      key={doc}
                      className="border border-border rounded-lg p-4 text-center"
                    >
                      <div className="w-full h-24 bg-muted rounded-md mb-3 flex items-center justify-center text-muted-foreground text-xs">
                        Preview
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        {doc}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Verificado ✓
                      </p>
                    </div>
                  ),
                )}
              </div>
            </TabsContent>

            <TabsContent value="beneficiario">
              <div className="glass-card p-6 text-sm text-muted-foreground">
                Información del beneficiario controlador conforme al Art. 3
                Fracc. IV RCG.{" "}
                {client.type === "PM"
                  ? "Pendiente de captura."
                  : "No aplica para persona física con operaciones menores."}
              </div>
            </TabsContent>

            <TabsContent value="verificacion">
              <div className="glass-card p-6">
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: "OCR Documento", score: 92, pass: true },
                    { label: "Prueba de vida", score: 95, pass: true },
                    { label: "Face Match", score: 91, pass: true },
                    { label: "CURP RENAPO", score: 100, pass: true },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="text-center p-4 rounded-lg bg-muted/30"
                    >
                      <p className="text-2xl font-bold text-foreground">
                        {s.score}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {s.label}
                      </p>
                      <p
                        className={cn(
                          "text-xs font-semibold mt-1",
                          s.pass ? "text-success" : "text-destructive",
                        )}
                      >
                        {s.pass ? "✓ Aprobado" : "✗ Fallido"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="operaciones">
              <DataTable>
                <table className="w-full">
                  <DataTableHeader
                    headers={["Fecha", "Tipo", "Monto", "Activo", "Estado"]}
                  />
                  <tbody>
                    {clientOps.map((op) => (
                      <DataTableRow key={op.id} hover={false}>
                        <td className="px-4 py-3 text-sm">{op.date}</td>
                        <td className="px-4 py-3 text-sm">{op.type}</td>
                        <td className="px-4 py-3 text-sm font-medium">
                          {formatMxnWithUnit(op.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm">{op.asset}</td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            className={operationStatusColors[op.status]}
                          >
                            {op.status}
                          </StatusBadge>
                        </td>
                      </DataTableRow>
                    ))}
                    {clientOps.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-muted-foreground"
                        >
                          Sin operaciones registradas
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </DataTable>
            </TabsContent>

            <TabsContent value="historial">
              <div className="glass-card p-6 space-y-4">
                {[
                  {
                    date: "2026-03-28",
                    text: "Nivel de riesgo actualizado a " + client.riskLevel,
                  },
                  { date: "2026-03-15", text: "Expediente KYC actualizado" },
                  { date: "2026-01-10", text: "Alta de cliente en el sistema" },
                ].map((e, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 border-l-2 border-accent pl-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {e.text}
                      </p>
                      <p className="text-xs text-muted-foreground">{e.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="glass-card p-5 text-center">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              Nivel de Riesgo
            </p>
            <div
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold",
                clientRiskSolidColors[client.riskLevel],
              )}
            >
              <Shield className="w-4 h-4" /> {client.riskLevel}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Próxima actualización: 2026-06-15
            </p>
          </div>

          <div className="glass-card p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
              Contacto
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />{" "}
                {client.email}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />{" "}
                {client.phone}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />{" "}
                {client.lastUpdate}
              </div>
            </div>
          </div>

          {clientAlerts.length > 0 && (
            <div className="glass-card p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
                Alertas activas
              </p>
              <div className="space-y-2">
                {clientAlerts.map((a) => (
                  <div
                    key={a.id}
                    className="text-xs p-2 rounded bg-destructive/5 text-destructive"
                  >
                    {a.rule}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
