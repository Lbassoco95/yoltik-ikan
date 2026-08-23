import { Users, AlertTriangle, FileCheck, Clock, TrendingDown, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { mockAlerts, mockClients, mockDailyOperations, mockRiskDistribution, recentActivity } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

const metrics = [
  { label: "Clientes activos", value: mockClients.filter(c => c.status === "Activo").length, change: "+12%", positive: true, icon: Users, color: "bg-accent" },
  { label: "Alertas pendientes", value: mockAlerts.filter(a => ["Nueva", "En análisis"].includes(a.status)).length, change: "", positive: false, icon: AlertTriangle, color: "bg-destructive" },
  { label: "Reportes enviados", value: 2, change: "este mes", positive: true, icon: FileCheck, color: "bg-success" },
  { label: "Expedientes por vencer", value: 3, change: "próximos 30 días", positive: false, icon: Clock, color: "bg-warning" },
  { label: "Falsos positivos", value: "18%", change: "-3%", positive: true, icon: TrendingDown, color: "bg-secondary" },
];

const kanbanColumns = [
  { title: "Nuevas", status: "Nueva" as const, color: "border-t-destructive" },
  { title: "En análisis", status: "En análisis" as const, color: "border-t-warning" },
  { title: "Escaladas", status: "Escalada" as const, color: "border-t-vulnerable" },
  { title: "Reportadas / Descartadas", status: null, color: "border-t-success" },
];

export default function DashboardPage() {
  const today = new Date().toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const { profile, perfilActividad } = useAuth();
  const esNotarias = perfilActividad === "notarias";
  const nombre = profile?.nombre ?? "";
  // Ajustes mínimos de copy por perfil (los datos siguen siendo mock por ahora).
  const metricsView = metrics.map((m) =>
    m.label === "Clientes activos" && esNotarias
      ? { ...m, label: "Comparecientes activos" }
      : m,
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Deadline banner */}
      <div className="bg-warning/10 border border-warning/30 rounded-lg px-4 py-3 flex items-center gap-3">
        <Clock className="w-5 h-5 text-warning shrink-0" />
        <p className="text-sm text-foreground">
          <strong>Recordatorio:</strong> Faltan 3 días para el plazo de presentación de Avisos (día 17). Consulta obligatoria del SPPLD pendiente (día 15 del mes).
        </p>
      </div>

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Hola, {nombre}</h1>
        <p className="text-sm text-muted-foreground capitalize">{today}</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-5 gap-4">
        {metricsView.map((m) => (
          <div key={m.label} className="metric-card">
            <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-xl", m.color)} />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{m.label}</p>
                <p className="text-3xl font-bold text-foreground mt-1">{m.value}</p>
                {m.change && (
                  <div className="flex items-center gap-1 mt-1">
                    {m.positive ? (
                      <TrendingUp className="w-3 h-3 text-success" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-warning" />
                    )}
                    <span className={cn("text-xs font-medium", m.positive ? "text-success" : "text-warning")}>{m.change}</span>
                  </div>
                )}
              </div>
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", m.color + "/10")}>
                <m.icon className={cn("w-5 h-5", m.color.replace("bg-", "text-"))} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Kanban + Charts */}
      <div className="grid grid-cols-5 gap-6">
        {/* Kanban */}
        <div className="col-span-3 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Tablero de Alertas</h2>
          <div className="grid grid-cols-4 gap-3">
            {kanbanColumns.map((col) => {
              const alerts = col.status
                ? mockAlerts.filter(a => a.status === col.status)
                : mockAlerts.filter(a => ["Reportada", "Descartada"].includes(a.status));
              return (
                <div key={col.title} className={cn("glass-card border-t-4 p-3", col.color)}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase">{col.title}</h3>
                    <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full">{alerts.length}</span>
                  </div>
                  <div className="space-y-2">
                    {alerts.map((alert) => (
                      <div key={alert.id} className="bg-muted/50 rounded-lg p-3 cursor-pointer hover:bg-muted transition-colors">
                        <p className="text-sm font-medium text-foreground truncate">{alert.clientName}</p>
                        <p className="text-xs text-muted-foreground mt-1 truncate">{alert.rule}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className={cn(
                            "status-badge text-[10px]",
                            alert.priority === "Alta" ? "bg-destructive/10 text-destructive" :
                            alert.priority === "Media" ? "bg-warning/10 text-warning" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {alert.priority}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{alert.daysInQueue}d</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel */}
        <div className="col-span-2 space-y-4">
          {/* Bar Chart */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">{esNotarias ? "Actos por día" : "Operaciones por día"}</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={mockDailyOperations.slice(-14)}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(215, 14%, 46%)" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(215, 14%, 46%)" }} />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid hsl(214,20%,90%)", fontSize: "12px" }}
                />
                <Bar dataKey="count" fill="hsl(155, 100%, 33%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Distribución por nivel de riesgo</h3>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie data={mockRiskDistribution} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={55} strokeWidth={2}>
                    {mockRiskDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {mockRiskDistribution.map((r) => (
                  <div key={r.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.fill }} />
                    <span className="text-sm text-foreground">{r.name}: <strong>{r.value}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Actividad reciente</h3>
            <div className="space-y-3">
              {recentActivity.map((a, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-xs text-muted-foreground w-12 shrink-0 pt-0.5">{a.time}</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <p className="text-sm text-foreground">{a.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
