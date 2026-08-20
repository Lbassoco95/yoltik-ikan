import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function StatusBadge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("status-badge", className)} {...props} />;
}
