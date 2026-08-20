import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  action?: ReactNode;
  subtitle?: ReactNode;
  subtitleClassName?: string;
}

export function PageHeader({
  title,
  action,
  subtitle,
  subtitleClassName,
}: PageHeaderProps) {
  const hasSubtitle = subtitle !== undefined && subtitle !== null;
  const content = (
    <>
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      {hasSubtitle && (
        <p className={cn("text-sm text-muted-foreground", subtitleClassName)}>
          {subtitle}
        </p>
      )}
    </>
  );

  if (action) {
    return (
      <div className="flex items-center justify-between">
        {content}
        {action}
      </div>
    );
  }

  return hasSubtitle ? <div>{content}</div> : <>{content}</>;
}
