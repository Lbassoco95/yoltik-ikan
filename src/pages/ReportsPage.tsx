import { Plus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockReports } from "@/data/mockData";
import { formatMxnWithUnit } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { Banner } from "@/components/shared/Banner";
import { DataTable, DataTableHeader, DataTableRow } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { reportStatusColors, reportTypeColors } from "@/lib/status-colors";

export default function ReportsPage() {
  const tdpaReports = mockReports.filter(r => ["OR", "OI", "OP"].includes(r.type));
  const avReports = mockReports.filter(r => r.type === "Aviso");
  const generateButton = (
    <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
      <Plus className="w-4 h-4" /> Generar Aviso
    </Button>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Reportes y Avisos" action={generateButton} />

      {/* Deadline banners */}
      <div className="grid grid-cols-2 gap-4">
        <Banner variant="warning" icon={<Clock className="w-4 h-4 text-warning" />}>
          <p className="text-sm">OR pendientes: <strong>1 operación</strong>. Plazo: 15 días hábiles</p>
        </Banner>
        <Banner variant="vulnerable" icon={<Clock className="w-4 h-4 text-vulnerable" />}>
          <p className="text-sm">Avisos pendientes: <strong>1 operación</strong>. Plazo: día 17 (faltan 3 días)</p>
        </Banner>
      </div>

      <Tabs defaultValue="tdpa">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="tdpa">TDPA — CNBV/UIF</TabsTrigger>
          <TabsTrigger value="av">AV — SAT/SPPLD</TabsTrigger>
        </TabsList>

        <TabsContent value="tdpa" className="mt-4">
          <DataTable>
            <table className="w-full">
              <DataTableHeader headers={["Folio", "Tipo", "Fecha detección", "Fecha envío", "Cliente", "Monto", "Estado"]} />
              <tbody>
                {tdpaReports.map(r => (
                  <DataTableRow key={r.id} className="cursor-pointer">
                    <td className="px-4 py-3 text-sm font-mono">{r.folio}</td>
                    <td className="px-4 py-3"><StatusBadge className={reportTypeColors[r.type]}>{r.type}</StatusBadge></td>
                    <td className="px-4 py-3 text-sm">{r.detectionDate}</td>
                    <td className="px-4 py-3 text-sm">{r.sendDate || "—"}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{r.clientName}</td>
                    <td className="px-4 py-3 text-sm font-semibold">{formatMxnWithUnit(r.amount)}</td>
                    <td className="px-4 py-3"><StatusBadge className={reportStatusColors[r.status]}>{r.status}</StatusBadge></td>
                  </DataTableRow>
                ))}
              </tbody>
            </table>
          </DataTable>
        </TabsContent>

        <TabsContent value="av" className="mt-4">
          <DataTable>
            <table className="w-full">
              <DataTableHeader headers={["Folio", "Mes", "Prioridad", "Cliente", "Monto", "Activo", "Alerta", "Estado"]} />
              <tbody>
                {avReports.map(r => (
                  <DataTableRow key={r.id} className="cursor-pointer">
                    <td className="px-4 py-3 text-sm font-mono">{r.folio}</td>
                    <td className="px-4 py-3 text-sm">{r.month}</td>
                    <td className="px-4 py-3">
                      <StatusBadge className={r.priority === "24hrs" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}>{r.priority}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{r.clientName}</td>
                    <td className="px-4 py-3 text-sm font-semibold">{formatMxnWithUnit(r.amount)}</td>
                    <td className="px-4 py-3"><StatusBadge className="bg-vulnerable/10 text-vulnerable">{r.asset}</StatusBadge></td>
                    <td className="px-4 py-3 text-sm font-mono">{r.alertCode}</td>
                    <td className="px-4 py-3"><StatusBadge className={reportStatusColors[r.status]}>{r.status}</StatusBadge></td>
                  </DataTableRow>
                ))}
              </tbody>
            </table>
          </DataTable>
        </TabsContent>
      </Tabs>
    </div>
  );
}
