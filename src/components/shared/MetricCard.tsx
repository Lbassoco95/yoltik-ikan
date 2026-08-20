import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: ReactNode;
  value: ReactNode;
  accent?: string;
  trend?: {
    value: ReactNode;
    positive: boolean;
    icon: ComponentType<{ className?: string }>;
  };
  icon?: ComponentType<{ className?: string }>;
  iconColor?: string;
  className?: string;
}

export function MetricCard({
  label,
  value,
  accent = "bg-accent",
  trend,
  icon: Icon,
  iconColor,
  className,
}: MetricCardProps) {
  return (
    <div className={cn("metric-card", className)}>
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1 rounded-l-xl",
          accent,
        )}
      />
      {Icon ? (
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
            {trend && (
              <div className="flex items-center gap-1 mt-1">
                <trend.icon
                  className={cn(
                    "w-3 h-3",
                    trend.positive ? "text-success" : "text-warning",
                  )}
                />
                <span
                  className={cn(
                    "text-xs font-medium",
                    trend.positive ? "text-success" : "text-warning",
                  )}
                >
                  {trend.value}
                </span>
              </div>
            )}
          </div>
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              `${accent}/10`,
            )}
          >
            <Icon
              className={cn(
                "w-5 h-5",
                iconColor || accent.replace("bg-", "text-"),
              )}
            />
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs font-medium text-muted-foreground uppercase">
            {label}
          </p>
          <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
        </>
      )}
    </div>
  );
}
