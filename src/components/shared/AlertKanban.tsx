import type { ReactNode } from "react";
import type { Alert } from "@/data/_legacy_mock";
import { cn, formatMxnWithUnit } from "@/lib/utils";
import { alertPriorityColors } from "@/lib/status-colors";
import { StatusBadge } from "./StatusBadge";

type AlertKanbanVariant = "board" | "compact";

interface AlertCardProps {
  alert: Alert;
  variant?: AlertKanbanVariant;
  showAmount?: boolean;
  queueSuffix?: string;
}

export function AlertKanbanCard({
  alert,
  variant = "compact",
  showAmount = false,
  queueSuffix = "d",
}: AlertCardProps) {
  const isBoard = variant === "board";

  return (
    <div
      className={cn(
        isBoard ? "bg-muted/40" : "bg-muted/50",
        "rounded-lg",
        isBoard ? "p-4" : "p-3",
        "cursor-pointer hover:bg-muted transition-colors",
      )}
    >
      <p
        className={cn(
          "text-sm",
          isBoard ? "font-semibold" : "font-medium",
          "text-foreground",
          !isBoard && "truncate",
        )}
      >
        {alert.clientName}
      </p>
      <p
        className={cn(
          "text-xs text-muted-foreground mt-1",
          !isBoard && "truncate",
        )}
      >
        {alert.rule}
      </p>
      {showAmount && (
        <p className="text-sm font-bold text-foreground mt-2">
          {formatMxnWithUnit(alert.amount)}
        </p>
      )}
      <div
        className={cn(
          "flex items-center justify-between",
          showAmount ? "mt-3" : "mt-2",
        )}
      >
        <StatusBadge
          className={cn("text-[10px]", alertPriorityColors[alert.priority])}
        >
          {alert.priority}
        </StatusBadge>
        <span className="text-[10px] text-muted-foreground">
          {alert.daysInQueue}
          {queueSuffix}
        </span>
      </div>
    </div>
  );
}

interface AlertKanbanColumnProps {
  title: string;
  count: number;
  color: string;
  children: ReactNode;
  variant?: AlertKanbanVariant;
}

export function AlertKanbanColumn({
  title,
  count,
  color,
  children,
  variant = "compact",
}: AlertKanbanColumnProps) {
  const isBoard = variant === "board";

  return (
    <div
      className={cn(
        "glass-card border-t-4",
        isBoard ? "p-4 flex flex-col" : "p-3",
        color,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between",
          isBoard ? "mb-4" : "mb-3",
        )}
      >
        {isBoard ? (
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        ) : (
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">
            {title}
          </h3>
        )}
        <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <div
        className={cn(
          isBoard ? "flex-1 space-y-3 overflow-y-auto" : "space-y-2",
        )}
      >
        {children}
      </div>
    </div>
  );
}
