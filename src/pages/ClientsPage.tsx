import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mockClients } from "@/data/mockData";
import { cn } from "@/lib/utils";

const riskColors = { Bajo: "bg-success/10 text-success", Medio: "bg-warning/10 text-warning", Alto: "bg-destructive/10 text-destructive" };
const statusColors = { Activo: "bg-success/10 text-success", Pendiente: "bg-warning/10 text-warning", Suspendido: "bg-destructive/10 text-destructive", "En revisión": "bg-vulnerable/10 text-vulnerable" };

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const navigate = useNavigate();

  const filtered = mockClients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.rfc.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || c.type === typeFilter;
    const matchRisk = riskFilter === "all" || c.riskLevel === riskFilter;
    return matchSearch && matchType && matchRisk;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
          <Plus className="w-4 h-4" /> Nuevo Cliente
        </Button>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre o RFC…" className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="PF">Persona Física</SelectItem>
            <SelectItem value="PM">Persona Moral</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Riesgo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="Bajo">Bajo</SelectItem>
            <SelectItem value="Medio">Medio</SelectItem>
            <SelectItem value="Alto">Alto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {["ID", "Nombre / Razón Social", "Tipo", "RFC", "Riesgo", "Estado", "Últ. Actualización", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(client => (
              <tr
                key={client.id}
                className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => navigate(`/clientes/${client.id}`)}
              >
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{client.id}</td>
                <td className="px-4 py-3 text-sm font-medium text-foreground">{client.name}</td>
                <td className="px-4 py-3"><span className="status-badge bg-muted text-muted-foreground">{client.type}</span></td>
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{client.rfc}</td>
                <td className="px-4 py-3"><span className={cn("status-badge", riskColors[client.riskLevel])}>{client.riskLevel}</span></td>
                <td className="px-4 py-3"><span className={cn("status-badge", statusColors[client.status])}>{client.status}</span></td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{client.lastUpdate}</td>
                <td className="px-4 py-3 text-sm text-accent font-medium hover:underline">Ver</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
