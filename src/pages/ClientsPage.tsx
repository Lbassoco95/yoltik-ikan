import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mockClients } from "@/data/mockData";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { DataTable, DataTableHeader, DataTableRow } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { clientRiskBadgeTintColors, clientStatusColors } from "@/lib/status-colors";

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
      <PageHeader title="Clientes" action={<Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
          <Plus className="w-4 h-4" /> Nuevo Cliente
        </Button>} />

      {/* Filters */}
      <div className="glass-card p-4 flex items-center gap-4">
        <SearchInput wrapperClassName="flex-1" placeholder="Buscar por nombre o RFC…" value={search} onChange={e => setSearch(e.target.value)} />
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
      <DataTable>
        <table className="w-full">
          <DataTableHeader headers={["ID", "Nombre / Razón Social", "Tipo", "RFC", "Riesgo", "Estado", "Últ. Actualización", ""]} trackingWider />
          <tbody>
            {filtered.map(client => (
              <DataTableRow
                key={client.id}
                className="cursor-pointer"
                onClick={() => navigate(`/clientes/${client.id}`)}
              >
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{client.id}</td>
                <td className="px-4 py-3 text-sm font-medium text-foreground">{client.name}</td>
                <td className="px-4 py-3"><StatusBadge className="bg-muted text-muted-foreground">{client.type}</StatusBadge></td>
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{client.rfc}</td>
                <td className="px-4 py-3"><StatusBadge className={clientRiskBadgeTintColors[client.riskLevel]}>{client.riskLevel}</StatusBadge></td>
                <td className="px-4 py-3"><StatusBadge className={clientStatusColors[client.status]}>{client.status}</StatusBadge></td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{client.lastUpdate}</td>
                <td className="px-4 py-3 text-sm text-accent font-medium hover:underline">Ver</td>
              </DataTableRow>
            ))}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}
