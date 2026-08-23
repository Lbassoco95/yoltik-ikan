import { Plus, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockReports } from "@/data/mockData";
import { cn, formatMxn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

const typeColors = { OR: "bg-primary/10 text-primary", OI: "bg-secondary/10 text-secondary", OP: "bg-vulnerable/10 text-vulnerable", Aviso: "bg-accent/10 text-accent" };
const statusColors = { Borrador: "bg-muted text-muted-foreground", Enviado: "bg-success/10 text-success", Acusado: "bg-accent/10 text-accent" };

// Borradores de aviso Fracción XII (DEMO) — usan los comparecientes reales del seed.
const notariaAvisos = [
  { folio: "XII-2026-0001", tipoActo: "Compraventa de inmueble", fecha: "2026-08-18", compareciente: "María Fernanda Ruiz Demo", monto: 2000000 },
  { folio: "XII-2026-0002", tipoActo: "Poder irrevocable", fecha: "2026-08-18", compareciente: "María Fernanda Ruiz Demo", monto: 0 },
  { folio: "XII-2026-0003", tipoActo: "Constitución de sociedad", fecha: "2026-08-19", compareciente: "Inmobiliaria Demo del Bajío S.A. de C.V.", monto: 1000000 },
];

export default function ReportsPage() {
  const { perfilActividad } = useAuth();
  const esNotarias = perfilActividad === "notarias";
  const tdpaReports = mockReports.filter(r => ["OR", "OI", "OP"].includes(r.type));
  const avReports = mockReports.filter(r => r.type === "Aviso");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Reportes y Avisos</h1>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
          <Plus className="w-4 h-4" /> Generar Aviso
        </Button>
      </div>

      {/* Deadline banners */}
      {esNotarias ? (
        <div className="bg-warning/10 border border-warning/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <Clock className="w-4 h-4 text-warning" />
          <p className="text-sm">
            Borradores de Aviso (Fracción XII) pendientes de generar: <strong>3</strong>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-warning/10 border border-warning/30 rounded-lg px-4 py-3 flex items-center gap-3">
            <Clock className="w-4 h-4 text-warning" />
            <p className="text-sm">OR pendientes: <strong>1 operación</strong>. Plazo: 15 días hábiles</p>
          </div>
          <div className="bg-vulnerable/10 border border-vulnerable/30 rounded-lg px-4 py-3 flex items-center gap-3">
            <Clock className="w-4 h-4 text-vulnerable" />
            <p className="text-sm">Avisos pendientes: <strong>1 operación</strong>. Plazo: día 17 (faltan 3 días)</p>
          </div>
        </div>
      )}

      {esNotarias ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
            <span>
              <strong>DEMO — sin generación real de avisos.</strong> Borradores ilustrativos de
              Fracción XII a partir de los actos capturados; la generación y el envío del Aviso al
              SAT/SPPLD son trabajo posterior.
            </span>
          </div>
          <Tabs defaultValue="xii">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="xii">Avisos — Fracción XII (SAT/SPPLD)</TabsTrigger>
            </TabsList>
            <TabsContent value="xii" className="mt-4">
              <div className="glass-card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {["Folio", "Tipo de acto", "Fecha", "Compareciente", "Valor", "Estado"].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {notariaAvisos.map(a => (
                      <tr key={a.folio} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono">{a.folio}</td>
                        <td className="px-4 py-3 text-sm">{a.tipoActo}</td>
                        <td className="px-4 py-3 text-sm">{a.fecha}</td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{a.compareciente}</td>
                        <td className="px-4 py-3 text-sm font-semibold">{formatMxn(a.monto)}</td>
                        <td className="px-4 py-3"><span className={cn("status-badge", statusColors.Borrador)}>Borrador</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
      <Tabs defaultValue="tdpa">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="tdpa">TDPA — CNBV/UIF</TabsTrigger>
          <TabsTrigger value="av">AV — SAT/SPPLD</TabsTrigger>
        </TabsList>

        <TabsContent value="tdpa" className="mt-4">
          <div className="glass-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Folio", "Tipo", "Fecha detección", "Fecha envío", "Cliente", "Monto", "Estado"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tdpaReports.map(r => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-sm font-mono">{r.folio}</td>
                    <td className="px-4 py-3"><span className={cn("status-badge", typeColors[r.type])}>{r.type}</span></td>
                    <td className="px-4 py-3 text-sm">{r.detectionDate}</td>
                    <td className="px-4 py-3 text-sm">{r.sendDate || "—"}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{r.clientName}</td>
                    <td className="px-4 py-3 text-sm font-semibold">${r.amount.toLocaleString()} MXN</td>
                    <td className="px-4 py-3"><span className={cn("status-badge", statusColors[r.status])}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="av" className="mt-4">
          <div className="glass-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Folio", "Mes", "Prioridad", "Cliente", "Monto", "Activo", "Alerta", "Estado"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {avReports.map(r => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-sm font-mono">{r.folio}</td>
                    <td className="px-4 py-3 text-sm">{r.month}</td>
                    <td className="px-4 py-3">
                      <span className={cn("status-badge", r.priority === "24hrs" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{r.priority}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{r.clientName}</td>
                    <td className="px-4 py-3 text-sm font-semibold">${r.amount.toLocaleString()} MXN</td>
                    <td className="px-4 py-3"><span className="status-badge bg-vulnerable/10 text-vulnerable">{r.asset}</span></td>
                    <td className="px-4 py-3 text-sm font-mono">{r.alertCode}</td>
                    <td className="px-4 py-3"><span className={cn("status-badge", statusColors[r.status])}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
}
