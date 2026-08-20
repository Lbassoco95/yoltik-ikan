import {
  Users,
  AlertTriangle,
  FileCheck,
  Clock,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  mockAlerts,
  mockClients,
  mockDailyOperations,
  mockRiskDistribution,
  recentActivity,
} from "@/data/mockData";
import { PageHeader } from "@/components/shared/PageHeader";
import { Banner } from "@/components/shared/Banner";
import { MetricCard } from "@/components/shared/MetricCard";
import {
  AlertKanbanCard,
  AlertKanbanColumn,
} from "@/components/shared/AlertKanban";

const metrics = [
  {
    label: "Clientes activos",
    value: mockClients.filter((c) => c.status === "Activo").length,
    change: "+12%",
    positive: true,
    icon: Users,
    color: "bg-accent",
  },
  {
    label: "Alertas pendientes",
    value: mockAlerts.filter((a) => ["Nueva", "En análisis"].includes(a.status))
      .length,
    change: "",
    positive: false,
    icon: AlertTriangle,
    color: "bg-destructive",
  },
  {
    label: "Reportes enviados",
    value: 2,
    change: "este mes",
    positive: true,
    icon: FileCheck,
    color: "bg-success",
  },
  {
    label: "Expedientes por vencer",
    value: 3,
    change: "próximos 30 días",
    positive: false,
    icon: Clock,
    color: "bg-warning",
  },
  {
    label: "Falsos positivos",
    value: "18%",
    change: "-3%",
    positive: true,
    icon: TrendingDown,
    color: "bg-secondary",
  },
];

const kanbanColumns = [
  { title: "Nuevas", status: "Nueva" as const, color: "border-t-destructive" },
  {
    title: "En análisis",
    status: "En análisis" as const,
    color: "border-t-warning",
  },
  {
    title: "Escaladas",
    status: "Escalada" as const,
    color: "border-t-vulnerable",
  },
  {
    title: "Reportadas / Descartadas",
    status: null,
    color: "border-t-success",
  },
];

export default function DashboardPage() {
  const today = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Deadline banner */}
      <Banner
        variant="warning"
        icon={<Clock className="w-5 h-5 text-warning shrink-0" />}
      >
        <p className="text-sm text-foreground">
          <strong>Recordatorio:</strong> Faltan 3 días para el plazo de
          presentación de Avisos (día 17). Consulta obligatoria del SPPLD
          pendiente (día 15 del mes).
        </p>
      </Banner>

      {/* Greeting */}
      <PageHeader
        title="Buenos días, Patricia"
        subtitle={today}
        subtitleClassName="capitalize"
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-5 gap-4">
        {metrics.map((m) => (
          <MetricCard
            key={m.label}
            label={m.label}
            value={m.value}
            accent={m.color}
            icon={m.icon}
            trend={
              m.change
                ? {
                    value: m.change,
                    positive: m.positive,
                    icon: m.positive ? TrendingUp : TrendingDown,
                  }
                : undefined
            }
          />
        ))}
      </div>

      {/* Kanban + Charts */}
      <div className="grid grid-cols-5 gap-6">
        {/* Kanban */}
        <div className="col-span-3 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Tablero de Alertas
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {kanbanColumns.map((col) => {
              const alerts = col.status
                ? mockAlerts.filter((a) => a.status === col.status)
                : mockAlerts.filter((a) =>
                    ["Reportada", "Descartada"].includes(a.status),
                  );
              return (
                <AlertKanbanColumn
                  key={col.title}
                  title={col.title}
                  count={alerts.length}
                  color={col.color}
                  variant="compact"
                >
                  {alerts.map((alert) => (
                    <AlertKanbanCard
                      key={alert.id}
                      alert={alert}
                      variant="compact"
                    />
                  ))}
                </AlertKanbanColumn>
              );
            })}
          </div>
        </div>

        {/* Right Panel */}
        <div className="col-span-2 space-y-4">
          {/* Bar Chart */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Operaciones por día
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={mockDailyOperations.slice(-14)}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(214, 20%, 90%)"
                />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: "hsl(215, 14%, 46%)" }}
                />
                <YAxis tick={{ fontSize: 10, fill: "hsl(215, 14%, 46%)" }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid hsl(214,20%,90%)",
                    fontSize: "12px",
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="hsl(155, 100%, 33%)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Distribución por nivel de riesgo
            </h3>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie
                    data={mockRiskDistribution}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={55}
                    strokeWidth={2}
                  >
                    {mockRiskDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {mockRiskDistribution.map((r) => (
                  <div key={r.name} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: r.fill }}
                    />
                    <span className="text-sm text-foreground">
                      {r.name}: <strong>{r.value}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Actividad reciente
            </h3>
            <div className="space-y-3">
              {recentActivity.map((a, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-xs text-muted-foreground w-12 shrink-0 pt-0.5">
                    {a.time}
                  </span>
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
