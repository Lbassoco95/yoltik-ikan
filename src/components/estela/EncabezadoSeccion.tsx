import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EncabezadoSeccionProps {
  titulo: ReactNode;
  /** Una línea. Qué hay aquí o qué toca hacer, no un eslogan. */
  descripcion?: ReactNode;
  /** Acciones a la derecha: botones, sello de vigencia, filtros. */
  acciones?: ReactNode;
  className?: string;
}

/**
 * La cabecera de toda pantalla: una placa de vidrio con el H1, la ola debajo
 * y el subtítulo.
 *
 * La ola bajo el H1 es uno de sus dos usos permitidos. Es lo que hace que dos
 * pantallas distintas se lean como la misma aplicación sin tener que repetir
 * el logotipo en cada una.
 */
export function EncabezadoSeccion({
  titulo,
  descripcion,
  acciones,
  className,
}: EncabezadoSeccionProps) {
  return (
    <div
      className={cn(
        "estela-vidrio mb-4 flex flex-wrap items-start justify-between gap-4 px-6 py-[18px]",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="estela-titulo m-0 text-2xl font-extrabold tracking-tight text-ikan-navy dark:text-foreground">
          {titulo}
        </h1>
        {descripcion && (
          <p className="m-0 mt-1.5 text-[13.5px] text-muted-foreground">
            {descripcion}
          </p>
        )}
      </div>
      {acciones && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {acciones}
        </div>
      )}
    </div>
  );
}
