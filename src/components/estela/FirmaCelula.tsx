import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CELULA_CUMPLIMIENTO,
  COMPROMISO_CELULA,
  CORREO_CELULA,
  HAY_CELULA,
  inicialesDe,
} from "@/lib/celula";

interface FirmaCelulaProps {
  /**
   * `barra` es el pie de la barra lateral (fondo navy, texto claro).
   * `bloque` es la versión ancha sobre papel, para el aviso mensual.
   */
  variante?: "barra" | "bloque";
  /** Nota corta de contexto. Ej. «Última revisión de umbrales 31/08/2026». */
  nota?: string;
  className?: string;
}

/**
 * La firma de la célula: quién responde por lo que la aplicación afirma.
 *
 * Si todavía no hay una célula configurada (ver `src/lib/celula.ts`), no se
 * dibuja nada. Un bloque de contacto con nombres de relleno es peor que no
 * tener bloque.
 */
export function FirmaCelula({
  variante = "barra",
  nota,
  className,
}: FirmaCelulaProps) {
  if (!HAY_CELULA) return null;

  const claro = variante === "barra";

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5",
        claro
          ? "border-t border-white/[0.12] px-[18px] py-4"
          : "rounded-md border border-border bg-card p-4",
        className,
      )}
    >
      <span className={cn("estela-antetitulo", claro && "text-[#8FA9A5]")}>
        Tu célula de cumplimiento
      </span>

      {CELULA_CUMPLIMIENTO.map((persona) => (
        <div key={persona.nombre} className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-ikan-jade text-[11px] font-bold text-white"
          >
            {inicialesDe(persona.nombre)}
          </span>
          <span
            className={cn(
              "truncate text-xs font-medium",
              claro ? "text-ikan-hielo" : "text-foreground",
            )}
          >
            {persona.nombre} · {persona.ciudad}
          </span>
        </div>
      ))}

      {(COMPROMISO_CELULA || nota) && (
        <p
          className={cn(
            "m-0 text-[11px] leading-relaxed",
            claro ? "text-[#8FA9A5]" : "text-muted-foreground",
          )}
        >
          {[COMPROMISO_CELULA, nota].filter(Boolean).join(" · ")}
        </p>
      )}

      {CORREO_CELULA && (
        <a
          href={`mailto:${CORREO_CELULA}`}
          className="mt-0.5 flex items-center justify-center gap-1.5 rounded-md bg-ikan-jade px-2.5 py-2 text-xs font-bold text-white no-underline transition-colors hover:bg-ikan-jade-oscuro"
        >
          <Mail className="h-3.5 w-3.5" aria-hidden />
          Escribir a la célula
        </a>
      )}
    </div>
  );
}
