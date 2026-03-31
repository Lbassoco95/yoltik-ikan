import { Shield, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const lists = [
  { name: "OFAC — SDN List", source: "EE.UU. — Dept. del Tesoro", lastUpdate: "2026-03-28", entries: "12,456", status: "Actualizada" },
  { name: "ONU — Lista consolidada", source: "Consejo de Seguridad ONU", lastUpdate: "2026-03-27", entries: "1,823", status: "Actualizada" },
  { name: "UIF — Lista de personas bloqueadas", source: "Unidad de Inteligencia Financiera", lastUpdate: "2026-03-25", entries: "342", status: "Actualizada" },
  { name: "PEPs — Personas Políticamente Expuestas", source: "Catálogo nacional", lastUpdate: "2026-03-20", entries: "8,901", status: "Actualizada" },
  { name: "UE — Lista de sanciones", source: "Unión Europea", lastUpdate: "2026-03-26", entries: "3,567", status: "Actualizada" },
  { name: "GAFI — Países de alto riesgo", source: "Grupo de Acción Financiera", lastUpdate: "2026-03-15", entries: "24", status: "Actualizada" },
];

export default function ListsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Listas Restrictivas</h1>
        <Button variant="outline" className="gap-2"><RefreshCw className="w-4 h-4" /> Actualizar todas</Button>
      </div>

      <div className="glass-card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar persona o entidad en listas…" className="pl-10" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {lists.map(list => (
          <div key={list.name} className="glass-card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">{list.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{list.source}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{list.entries} registros</span>
              <span className={cn("status-badge bg-success/10 text-success")}>{list.status}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">Última actualización: {list.lastUpdate}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
