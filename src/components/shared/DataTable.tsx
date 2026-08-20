import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DataTableProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function DataTable({ className, children, ...props }: DataTableProps) {
  return (
    <div className={cn("glass-card overflow-hidden", className)} {...props}>
      {children}
    </div>
  );
}

interface DataTableHeaderProps {
  headers: ReactNode[];
  cellPadding?: "px-3" | "px-4";
  trackingWider?: boolean;
  rowClassName?: string;
}

export function DataTableHeader({
  headers,
  cellPadding = "px-4",
  trackingWider = false,
  rowClassName,
}: DataTableHeaderProps) {
  const cellClassName = trackingWider
    ? cellPadding === "px-3"
      ? "text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-3"
      : "text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3"
    : cellPadding === "px-3"
      ? "text-left text-xs font-semibold text-muted-foreground uppercase px-3 py-3"
      : "text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-3";

  return (
    <thead>
      <tr className={cn("border-b border-border bg-muted/30", rowClassName)}>
        {headers.map((header, index) => (
          <th key={index} className={cellClassName}>
            {header}
          </th>
        ))}
      </tr>
    </thead>
  );
}

interface DataTableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
  hover?: boolean;
}

export function DataTableRow({
  className,
  children,
  hover = true,
  ...props
}: DataTableRowProps) {
  return (
    <tr
      className={cn(
        "border-b border-border last:border-0",
        hover && "hover:bg-muted/30",
        className,
        "transition-colors",
      )}
      {...props}
    >
      {children}
    </tr>
  );
}
