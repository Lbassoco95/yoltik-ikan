import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const variantClasses = {
  warning: "bg-warning/10 border border-warning/30 rounded-lg px-4 py-3",
  primary: "bg-primary/10 border border-primary/30 rounded-lg px-4 py-3",
  audit: "bg-primary/5 border border-primary/20 rounded-lg px-4 py-3",
  vulnerable: "bg-vulnerable/10 border border-vulnerable/30 rounded-lg px-4 py-3",
  accent: "bg-accent/10 border border-accent/30 rounded-lg px-4 py-3",
} as const;

interface BannerProps {
  variant: keyof typeof variantClasses;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  inline?: boolean;
}

export function Banner({ variant, icon, children, className, inline = false }: BannerProps) {
  return (
    <div className={cn(variantClasses[variant], !inline && "flex items-center gap-3", className)}>
      {icon}
      {children}
    </div>
  );
}
