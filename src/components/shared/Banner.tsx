import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const baseClasses = "border rounded-lg px-4 py-3";

const variantClasses = {
  warning: "bg-warning/10 border-warning/30",
  primary: "bg-primary/10 border-primary/30",
  primarySubtle: "bg-primary/5 border-primary/20",
  vulnerable: "bg-vulnerable/10 border-vulnerable/30",
  accent: "bg-accent/10 border-accent/30",
} as const;

interface BannerProps {
  variant: keyof typeof variantClasses;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  layout?: "row" | "block";
}

export function Banner({ variant, icon, children, className, layout = "row" }: BannerProps) {
  return (
    <div className={cn(variantClasses[variant], baseClasses, layout === "row" && "flex items-center gap-3", className)}>
      {icon}
      {children}
    </div>
  );
}
