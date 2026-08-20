import type { ReactNode } from "react";
import type { Alert } from "@/data/_legacy_mock";
import { cn } from "@/lib/utils";
import { formatMxn } from "@/lib/utils";
import { alertPriorityColors } from "@/lib/status-colors";
import { StatusBadge } from "./StatusBadge";

interface AlertCardProps {
  alert: Alert;
  dense?: boolean;
  amount?: boolean;
  queueSuffix?: string;
}

export function AlertKanbanCard({ alert, dense = false, amount = false, queueSuffix = "d" }: AlertCardProps) {
  return (
    <div className={cn("bg-muted/" + (dense ? "40" : "50"), "rounded-lg", dense ? "p-4" : "p-3", "cursor-pointer hover:bg-muted transition-colors")}>
      <p className={cn("text-sm", dense ? "font-semibold" : "font-medium", "text-foreground", !dense && "truncate")}>{alert.clientName}</p>
      <p className={cn("text-xs text-muted-foreground mt-1", !dense && "truncate")}>{alert.rule}</p>
      {amount && <p className="text-sm font-bold text-foreground mt-2">{formatMxn(alert.amount)}</p>}
      <div className={cn("flex items-center justify-between", amount ? "mt-3" : "mt-2")}>
        <StatusBadge className={cn("text-[10px]", alertPriorityColors[alert.priority])}>{alert.priority}</StatusBadge>
        <span className="text-[10px] text-muted-foreground">{alert.daysInQueue}{queueSuffix}</span>
      </div>
    </div>
  );
}

interface AlertKanbanColumnProps {
  title: string;
  count: number;
  color: string;
  children: ReactNode;
  dense?: boolean;
}

export function AlertKanbanColumn({ title, count, color, children, dense = false }: AlertKanbanColumnProps) {
  return (
    <div className={cn("glass-card border-t-4", dense ? "p-4 flex flex-col" : "p-3", color)}>
      <div className={cn("flex items-center justify-between", dense ? "mb-4" : "mb-3")}>
        {dense ? <h2 className="text-sm font-semibold text-foreground">{title}</h2> : <h3 className="text-xs font-semibold text-muted-foreground uppercase">{title}</h3>}
        <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full">{count}</span>
      </div>
      <div className={cn(dense ? "flex-1 space-y-3 overflow-y-auto" : "space-y-2")}>{children}</div>
    </div>
  );
}
