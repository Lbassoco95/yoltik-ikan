import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  action?: ReactNode;
  subtitle?: ReactNode;
}

export function PageHeader({ title, action, subtitle }: PageHeaderProps) {
  const content = (
    <>
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      {subtitle}
    </>
  );

  if (action) {
    return <div className="flex items-center justify-between">{content}{action}</div>;
  }

  return subtitle ? <div>{content}</div> : <>{content}</>;
}
