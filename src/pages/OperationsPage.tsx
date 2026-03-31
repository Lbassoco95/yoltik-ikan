import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockOperations, UMA_VALUE } from "@/data/mockData";
import { cn } from "@/lib/utils";

const threshold645 = 645 * UMA_VALUE;
const threshold3210 = 3210 * UMA_VALUE;

export default function OperationsPage() {
  const [search, setSearch] = useState("");
  const filtered = mockOperations.filter(o => o.clientName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Operaciones</h1>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
          <Plus className="w-4 h-4" /> Registrar operación
        </Button>
      </div>

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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por cliente…" className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="text-xs text-muted-foreground flex gap-6">
            <span>Umbral identificación (645 UMA): <strong>${threshold645.toLocaleString("es-MX", { maximumFractionDigits: 0 })} MXN</strong></span>
            <span>Umbral restricción (3,210 UMA): <strong>${threshold3210.toLocaleString("es-MX", { maximumFractionDigits: 0 })} MXN</strong></span>
          </div>

          <div className="glass-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["ID", "Fecha", "Cliente", "Monto", "Tipo", "Activo", "Cantidad", "Hash", "TC MXN", "Estado"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(op => (
                  <tr
                    key={op.id}
                    className={cn(
                      "border-b border-border last:border-0 transition-colors",
                      op.amount >= threshold3210 ? "bg-destructive/5" : op.amount >= threshold645 ? "bg-warning/5" : "hover:bg-muted/30"
                    )}
                  >
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{op.id}</td>
                    <td className="px-4 py-3 text-sm">{op.date}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{op.clientName}</td>
                    <td className="px-4 py-3 text-sm font-semibold">${op.amount.toLocaleString()} MXN</td>
                    <td className="px-4 py-3 text-sm">{op.type}</td>
                    <td className="px-4 py-3"><span className="status-badge bg-vulnerable/10 text-vulnerable">{op.asset}</span></td>
                    <td className="px-4 py-3 text-sm font-mono">{op.quantity}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{op.hash}</td>
                    <td className="px-4 py-3 text-sm">${op.exchangeRate?.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={cn("status-badge",
                        op.status === "Normal" ? "bg-success/10 text-success" :
                        op.status === "Alertada" ? "bg-warning/10 text-warning" :
                        "bg-destructive/10 text-destructive"
                      )}>{op.status}</span>
                    </td>
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
