import type { Client, Operation, Report } from "@/data/_legacy_mock";

export const clientRiskTintColors: Record<Client["riskLevel"], string> = {
  Bajo: "bg-success/10 text-success",
  Medio: "bg-warning/10 text-warning",
  Alto: "bg-destructive/10 text-destructive",
};

export const clientRiskSolidColors: Record<Client["riskLevel"], string> = {
  Bajo: "bg-success text-success-foreground",
  Medio: "bg-warning text-warning-foreground",
  Alto: "bg-destructive text-destructive-foreground",
};

export const clientStatusColors: Record<Client["status"], string> = {
  Activo: "bg-success/10 text-success",
  Pendiente: "bg-warning/10 text-warning",
  Suspendido: "bg-destructive/10 text-destructive",
  "En revisión": "bg-vulnerable/10 text-vulnerable",
};

export const operationStatusColors: Record<Operation["status"], string> = {
  Normal: "bg-success/10 text-success",
  Alertada: "bg-warning/10 text-warning",
  Reportada: "bg-destructive/10 text-destructive",
};

export const alertPriorityColors: Record<"Alta" | "Media" | "Baja", string> = {
  Alta: "bg-destructive/10 text-destructive",
  Media: "bg-warning/10 text-warning",
  Baja: "bg-muted text-muted-foreground",
};

export const reportTypeColors: Record<Report["type"], string> = {
  OR: "bg-primary/10 text-primary",
  OI: "bg-secondary/10 text-secondary",
  OP: "bg-vulnerable/10 text-vulnerable",
  Aviso: "bg-accent/10 text-accent",
};

export const reportStatusColors: Record<Report["status"], string> = {
  Borrador: "bg-muted text-muted-foreground",
  Enviado: "bg-success/10 text-success",
  Acusado: "bg-accent/10 text-accent",
};

export type VerificationResult = "Aprobado" | "Rechazado" | "Revisión manual";

export const verificationResultColors: Record<VerificationResult, string> = {
  Aprobado: "bg-success/10 text-success",
  Rechazado: "bg-destructive/10 text-destructive",
  "Revisión manual": "bg-warning/10 text-warning",
};
