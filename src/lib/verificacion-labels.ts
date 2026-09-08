import type { EstadoVerificacion } from "@/lib/api/verificacion";

/**
 * El tono de cada estado de verificación.
 *
 * Vive aquí y no junto a `ETIQUETA_ESTADO` —que está en `lib/api/verificacion`—
 * porque una tabla de clases de Tailwind no es asunto de la capa que habla con
 * la base. Y no vive dentro de `Identificacion.tsx`, que es donde estaba,
 * porque el estado de la identidad dejó de verse sólo en esa pestaña: también
 * lo enseña la cabecera del expediente, y dos sitios pintando el mismo estado
 * con colores distintos es peor que no pintarlo.
 *
 * El significado va en el texto. El color refuerza, no informa.
 */
export const TONO_ESTADO: Record<EstadoVerificacion, string> = {
  aprobada: "bg-success/10 text-success",
  rechazada: "bg-destructive/10 text-destructive",
  error: "bg-destructive/10 text-destructive",
  expirada: "bg-warning/15 text-warning-ink",
  abandonada: "bg-warning/15 text-warning-ink",
  reenviada: "bg-warning/15 text-warning-ink",
  en_revision: "bg-muted text-foreground",
  en_progreso: "bg-muted text-foreground",
  no_iniciada: "bg-muted/60 text-muted-foreground",
};
