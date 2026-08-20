import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockOperations, UMA_VALUE } from "@/data/mockData";
import { cn, formatMxnValue, formatMxnWithUnit } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { DataTable, DataTableHeader, DataTableRow } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { operationStatusColors } from "@/lib/status-colors";

const threshold645 = 645 * UMA_VALUE;
const threshold3210 = 3210 * UMA_VALUE;

export default function OperationsPage() {
  const [search, setSearch] = useState("");
  const filtered = mockOperations.filter(o => o.clientName.toLowerCase().includes(search.toLowerCase()));
  const registerButton = (
    <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
      <Plus className="w-4 h-4" /> Registrar operación
    </Button>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Operaciones" action={registerButton} />

      <Tabs defaultValue="av">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="tdpa">TDPA</TabsTrigger>
          <TabsTrigger value="av">Activos Virtuales</TabsTrigger>
        </TabsList>

        <TabsContent value="tdpa" className="mt-4">
          <div className="glass-card p-8 text-center text-muted-foreground">
            Las operaciones TDPA se reciben automáticamente vía API. Módulo pendiente de conexión.
          </div>
        </TabsContent>

        <TabsContent value="av" className="mt-4 space-y-4">
          <div className="glass-card p-4">
            <SearchInput placeholder="Buscar por cliente…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="text-xs text-muted-foreground flex gap-6">
            <span>Umbral identificación (645 UMA): <strong>{formatMxnWithUnit(threshold645)}</strong></span>
            <span>Umbral restricción (3,210 UMA): <strong>{formatMxnWithUnit(threshold3210)}</strong></span>
          </div>

          <DataTable>
            <table className="w-full">
              <DataTableHeader headers={["ID", "Fecha", "Cliente", "Monto", "Tipo", "Activo", "Cantidad", "Hash", "TC MXN", "Estado"]} />
              <tbody>
                {filtered.map(op => (
                  <DataTableRow
                    key={op.id}
                    className={cn(
                      op.amount >= threshold3210 ? "bg-destructive/5" : op.amount >= threshold645 ? "bg-warning/5" : "hover:bg-muted/30"
                    )}
                    hover={false}
                  >
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{op.id}</td>
                    <td className="px-4 py-3 text-sm">{op.date}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{op.clientName}</td>
                    <td className="px-4 py-3 text-sm font-semibold">{formatMxnWithUnit(op.amount)}</td>
                    <td className="px-4 py-3 text-sm">{op.type}</td>
                    <td className="px-4 py-3"><StatusBadge className="bg-vulnerable/10 text-vulnerable">{op.asset}</StatusBadge></td>
                    <td className="px-4 py-3 text-sm font-mono">{op.quantity}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{op.hash}</td>
                    <td className="px-4 py-3 text-sm">{op.exchangeRate === undefined ? "" : formatMxnValue(op.exchangeRate)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge className={operationStatusColors[op.status]}>{op.status}</StatusBadge>
                    </td>
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
