import { mockAlerts } from "@/data/mockData";
import { cn } from "@/lib/utils";

const columns = [
  { title: "Nuevas", status: "Nueva" as const, color: "border-t-destructive" },
  { title: "En análisis", status: "En análisis" as const, color: "border-t-warning" },
  { title: "Escaladas", status: "Escalada" as const, color: "border-t-vulnerable" },
  { title: "Reportadas", status: "Reportada" as const, color: "border-t-success" },
  { title: "Descartadas", status: "Descartada" as const, color: "border-t-muted-foreground" },
];

export default function AlertsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">Alertas</h1>

      <div className="grid grid-cols-5 gap-4 h-[calc(100vh-200px)]">
        {columns.map(col => {
          const alerts = mockAlerts.filter(a => a.status === col.status);
          return (
            <div key={col.title} className={cn("glass-card border-t-4 p-4 flex flex-col", col.color)}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground">{col.title}</h2>
                <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full">{alerts.length}</span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto">
                {alerts.map(alert => (
                  <div key={alert.id} className="bg-muted/40 rounded-lg p-4 cursor-pointer hover:bg-muted transition-colors">
                    <p className="text-sm font-semibold text-foreground">{alert.clientName}</p>
                    <p className="text-xs text-muted-foreground mt-1">{alert.rule}</p>
                    <p className="text-sm font-bold text-foreground mt-2">${alert.amount.toLocaleString()} MXN</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className={cn("status-badge text-[10px]",
                        alert.priority === "Alta" ? "bg-destructive/10 text-destructive" :
                        alert.priority === "Media" ? "bg-warning/10 text-warning" :
                        "bg-muted text-muted-foreground"
                      )}>{alert.priority}</span>
                      <span className="text-[10px] text-muted-foreground">{alert.daysInQueue}d en cola</span>
                    </div>
                  </div>
                ))}
                {alerts.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Sin alertas</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
