import { useState } from "react";
import { Search, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mockAudit } from "@/data/mockData";
import { IntegridadBitacora } from "@/components/bitacora/IntegridadBitacora";

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
      <h1 className="text-2xl font-bold text-foreground">Auditoría</h1>

      <IntegridadBitacora />

      {/* El texto anterior afirmaba diez años de conservación, cifra que no
          sale de la LFPIORPI —su artículo 18 habla de cinco— y que además
          acompañaba a una tabla de datos de ejemplo. Se corrige y se marca
          como referencia, igual que el resto de cifras regulatorias del repo,
          hasta que Kawiil-Cumplimiento la confirme. */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 flex items-start gap-3">
        <Shield className="w-4 h-4 mt-0.5 text-primary shrink-0" />
        <p className="text-sm text-foreground">
          La bitácora encadenada es inmutable: un registro no se modifica ni se borra, y una
          corrección entra como registro nuevo.{" "}
          <span className="text-warning">
            El plazo de conservación de cinco años (LFPIORPI artículo 18) está pendiente de
            confirmar con Kawiil-Cumplimiento.
          </span>
        </p>
      </div>

      <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
        <p className="text-xs text-warning">
          DEMO — sin integración real: la tabla de abajo sigue mostrando datos de ejemplo del
          andamiaje original. Los eventos reales ya se están registrando en la bitácora
          encadenada de arriba; conectar esta vista a ellos es el siguiente paso.
        </p>
      </div>

      <div className="glass-card p-4 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar en bitácora…" className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Módulo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {modules.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {["Timestamp", "Usuario", "IP", "Acción", "Módulo", "Objeto", "Detalle"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(entry => (
              <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{entry.timestamp}</td>
                <td className="px-4 py-3 text-sm font-medium text-foreground">{entry.user}</td>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{entry.ip}</td>
                <td className="px-4 py-3"><span className="status-badge bg-primary/10 text-primary">{entry.action}</span></td>
                <td className="px-4 py-3 text-sm">{entry.module}</td>
                <td className="px-4 py-3 text-xs font-mono">{entry.object}</td>
                <td className="px-4 py-3 text-sm text-foreground">{entry.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
