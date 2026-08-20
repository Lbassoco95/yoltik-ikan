import { mockAlerts } from "@/data/mockData";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  AlertKanbanCard,
  AlertKanbanColumn,
} from "@/components/shared/AlertKanban";

const columns = [
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
    title: "Reportadas",
    status: "Reportada" as const,
    color: "border-t-success",
  },
  {
    title: "Descartadas",
    status: "Descartada" as const,
    color: "border-t-muted-foreground",
  },
];

export default function AlertsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Alertas" />

      <div className="grid grid-cols-5 gap-4 h-[calc(100vh-200px)]">
        {columns.map((col) => {
          const alerts = mockAlerts.filter((a) => a.status === col.status);
          return (
            <AlertKanbanColumn
              key={col.title}
              title={col.title}
              count={alerts.length}
              color={col.color}
              variant="board"
            >
              {alerts.map((alert) => (
                <AlertKanbanCard
                  key={alert.id}
                  alert={alert}
                  variant="board"
                  showAmount
                  queueSuffix="d en cola"
                />
              ))}
              {alerts.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Sin alertas
                </p>
              )}
            </AlertKanbanColumn>
          );
        })}
      </div>
    </div>
  );
}
