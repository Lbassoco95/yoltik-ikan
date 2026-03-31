import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Key, Webhook, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

const activities = [
  { name: "TDPA — Transmisor de Dinero", badge: "CNBV/UIF", active: true, color: "border-l-primary" },
  { name: "AV Fracción XVI — Activos Virtuales", badge: "LFPIORPI/SAT", active: true, color: "border-l-vulnerable" },
  { name: "AV Fracción V — Inmobiliaria", badge: "LFPIORPI/SAT", active: false, color: "border-l-muted" },
  { name: "AV Fracción XI — Joyas y metales", badge: "LFPIORPI/SAT", active: false, color: "border-l-muted" },
  { name: "AV Fracción XII — Vehículos", badge: "LFPIORPI/SAT", active: false, color: "border-l-muted" },
  { name: "AV Fracción XIII — Fe pública", badge: "LFPIORPI/SAT", active: false, color: "border-l-muted" },
  { name: "AV Fracción I — Juegos y sorteos", badge: "LFPIORPI/SAT", active: false, color: "border-l-muted" },
  { name: "AV Fracción II — Tarjetas prepagadas", badge: "LFPIORPI/SAT", active: false, color: "border-l-muted" },
];

const users = [
  { name: "Lic. Patricia Vega", email: "patricia.vega@cryptoex.mx", role: "Oficial de Cumplimiento", status: "Activo", lastAccess: "2026-03-28 14:30" },
  { name: "Ing. Marco Reyes", email: "marco.reyes@cryptoex.mx", role: "Administrador", status: "Activo", lastAccess: "2026-03-27 16:20" },
  { name: "Lic. Diana Flores", email: "diana.flores@cryptoex.mx", role: "Analista", status: "Activo", lastAccess: "2026-03-28 09:15" },
  { name: "Carlos López", email: "carlos.lopez@cryptoex.mx", role: "Operador", status: "Inactivo", lastAccess: "2026-02-15 11:00" },
];

export default function ConfigPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">Configuración</h1>

      {/* Activities */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Actividades habilitadas</h2>
        <div className="grid grid-cols-2 gap-4">
          {activities.map(a => (
            <div key={a.name} className={cn("glass-card p-4 border-l-4 flex items-center justify-between", a.color)}>
              <div>
                <p className={cn("text-sm font-medium", a.active ? "text-foreground" : "text-muted-foreground")}>{a.name}</p>
                <span className="status-badge bg-muted text-muted-foreground mt-1">{a.badge}</span>
              </div>
              <Switch checked={a.active} />
            </div>
          ))}
        </div>
      </section>

      {/* Company Data */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Datos del sujeto obligado</h2>
        <div className="glass-card p-6 grid grid-cols-2 gap-6">
          {[
            { label: "Razón social", value: "Crypto Exchange MX S.A. de C.V." },
            { label: "RFC", value: "CEM200301XX1" },
            { label: "Representante de cumplimiento", value: "Lic. Patricia Vega Sánchez" },
            { label: "Registro SPPLD", value: "SPPLD-2024-00342" },
          ].map(f => (
            <div key={f.label}>
              <p className="text-xs font-medium text-muted-foreground uppercase">{f.label}</p>
              <Input defaultValue={f.value} className="mt-1" />
            </div>
          ))}
        </div>
      </section>

      {/* Users */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Usuarios del sistema</h2>
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2"><Plus className="w-4 h-4" /> Nuevo usuario</Button>
        </div>
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Nombre", "Email", "Rol", "Estado", "Último acceso"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.email} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{u.name}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3"><span className="status-badge bg-primary/10 text-primary">{u.role}</span></td>
                  <td className="px-4 py-3"><span className={cn("status-badge", u.status === "Activo" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{u.status}</span></td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{u.lastAccess}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Integrations */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Integraciones</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <Key className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">API Keys</h3>
            </div>
            <p className="text-xs text-muted-foreground">2 claves activas</p>
            <Button variant="outline" size="sm" className="mt-3">Administrar</Button>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <Webhook className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Webhooks</h3>
            </div>
            <p className="text-xs text-muted-foreground">1 webhook configurado</p>
            <Button variant="outline" size="sm" className="mt-3">Administrar</Button>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <Link2 className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">SPPLD</h3>
            </div>
            <p className="text-xs text-success font-medium">Conectado ✓</p>
            <Button variant="outline" size="sm" className="mt-3">Configurar</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
