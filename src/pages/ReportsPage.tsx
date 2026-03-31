import { Plus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockReports } from "@/data/mockData";
import { cn } from "@/lib/utils";

const typeColors = { OR: "bg-primary/10 text-primary", OI: "bg-secondary/10 text-secondary", OP: "bg-vulnerable/10 text-vulnerable", Aviso: "bg-accent/10 text-accent" };
const statusColors = { Borrador: "bg-muted text-muted-foreground", Enviado: "bg-success/10 text-success", Acusado: "bg-accent/10 text-accent" };

export default function ReportsPage() {
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
    </div>
  );
}
