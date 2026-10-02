import { cn } from "@/lib/utils";

interface BitacoraLineaProps {
  /** Sello de tiempo, ya formateado. Va en ancho fijo. */
  sello: string;
  /** Hash corto del registro, si la línea está anclada. */
  hash?: string | null;
  /** Qué pasó, en lenguaje llano. */
  descripcion: string;
  /** Quién lo hizo, cuando se conoce. */
  actor?: string | null;
  className?: string;
}

/**
 * Una línea de bitácora: sello de tiempo y hash en ancho fijo —el hash en una
 * píldora jade oscuro—, descripción en texto corrido, separadas por una línea
 * de vidrio.
 *
 * El hash no está para que nadie lo lea entero: está para que se vea que
 * existe. Es la diferencia entre un registro de actividad y una bitácora que
 * se puede oponer a un tercero.
 */
export function BitacoraLinea({
  sello,
  hash,
  descripcion,
  actor,
  className,
}: BitacoraLineaProps) {
  return (
    <div
      className={cn(
        "estela-separador flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2.5 first:border-t-0",
        className,
      )}
    >
      <span className="estela-dato shrink-0 text-[11px] text-muted-foreground">
        {sello}
      </span>
      {hash && (
        <span
          className="estela-dato shrink-0 rounded-full bg-ikan-jade-oscuro px-2.5 py-0.5 text-[11px] text-white"
          title={hash}
        >
          {hash.slice(0, 10)}
        </span>
      )}
      <span className="min-w-0 flex-1 text-[13px] text-foreground">
        {descripcion}
      </span>
      {actor && (
        <span className="shrink-0 text-xs text-muted-foreground">{actor}</span>
      )}
    </div>
  );
}
