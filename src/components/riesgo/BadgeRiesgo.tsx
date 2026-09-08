import { cn } from "@/lib/utils";
import type { ClasificacionRiesgo } from "@/types/domain";

/**
 * Clasificación de riesgo de un compareciente.
 *
 * El texto lleva el significado, no el color. Un badge ámbar y uno verde se
 * parecen bastante para quien no distingue esos dos tonos —y aquí la diferencia
 * es entre un cliente que se revisa cada año y uno que se revisa cada trimestre.
 */
const ESTILO: Record<ClasificacionRiesgo, { clase: string; label: string }> = {
  bajo: { clase: "bg-success/10 text-success", label: "Bajo" },
  medio: { clase: "bg-muted text-foreground", label: "Medio" },
  alto: { clase: "bg-warning/15 text-warning-ink", label: "Alto" },
  alto_oficio: { clase: "bg-destructive/10 text-destructive", label: "Alto de oficio" },
};

export function BadgeRiesgo({
  clasificacion,
  score,
  className,
}: {
  clasificacion: ClasificacionRiesgo | null | undefined;
  score?: number | null;
  className?: string;
}) {
  if (!clasificacion)
    return (
      <span className={cn("status-badge bg-muted/60 text-muted-foreground", className)}>
        Sin evaluar
      </span>
    );

  const e = ESTILO[clasificacion];
  return (
    <span className={cn("status-badge", e.clase, className)}>
      {e.label}
      {score != null && <span className="ml-1.5 opacity-70">· {score}</span>}
    </span>
  );
}
