import { useState } from "react";
import { Shield } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mockAudit } from "@/data/mockData";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { Banner } from "@/components/shared/Banner";
import { DataTable, DataTableHeader, DataTableRow } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";

export default function AuditPage() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");

  const filtered = mockAudit.filter(e => {
    const matchSearch = e.detail.toLowerCase().includes(search.toLowerCase()) || e.user.toLowerCase().includes(search.toLowerCase());
    const matchModule = moduleFilter === "all" || e.module === moduleFilter;
    return matchSearch && matchModule;
  });

  const modules = [...new Set(mockAudit.map(e => e.module))];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Auditoría" />

      <Banner variant="primarySubtle" icon={<Shield className="w-4 h-4 text-primary shrink-0" />}>
        <p className="text-sm text-foreground">Los registros de auditoría son inmutables y se conservan por 10 años conforme a las disposiciones regulatorias.</p>
      </Banner>

      <div className="glass-card p-4 flex items-center gap-4">
        <SearchInput wrapperClassName="flex-1" placeholder="Buscar en bitácora…" value={search} onChange={e => setSearch(e.target.value)} />
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Módulo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {modules.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable>
        <table className="w-full">
          <DataTableHeader headers={["Timestamp", "Usuario", "IP", "Acción", "Módulo", "Objeto", "Detalle"]} />
          <tbody>
            {filtered.map(entry => (
              <DataTableRow key={entry.id}>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{entry.timestamp}</td>
                <td className="px-4 py-3 text-sm font-medium text-foreground">{entry.user}</td>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{entry.ip}</td>
                <td className="px-4 py-3"><StatusBadge className="bg-primary/10 text-primary">{entry.action}</StatusBadge></td>
                <td className="px-4 py-3 text-sm">{entry.module}</td>
                <td className="px-4 py-3 text-xs font-mono">{entry.object}</td>
                <td className="px-4 py-3 text-sm text-foreground">{entry.detail}</td>
              </DataTableRow>
            ))}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}
