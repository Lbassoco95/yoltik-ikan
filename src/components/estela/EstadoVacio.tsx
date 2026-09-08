import type { ReactNode } from "react";
import { IconoIkan } from "@/components/estela/MarcaIkan";
import { cn } from "@/lib/utils";

interface EstadoVacioProps {
  /** Qué no hay. En llano y sin dramatismo. */
  titulo: string;
  /** Qué se puede hacer al respecto, si algo. */
  descripcion?: ReactNode;
  /** El botón que resuelve el vacío, cuando lo hay. */
  accion?: ReactNode;
  className?: string;
}

/**
 * El vacío lleva el hexágono de Ikán y una línea en voz de marca —no un icono
 * genérico de carpeta y un «No data»—. Y sobre todo: no lleva a Yoli. La
 * mascota queda fuera de la aplicación formal.
 */
export function EstadoVacio({
  titulo,
  descripcion,
  accion,
  className,
}: EstadoVacioProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      <IconoIkan size={44} className="opacity-40" />
      <p className="m-0 text-sm font-bold text-foreground">{titulo}</p>
      {descripcion && (
        <p className="m-0 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          {descripcion}
        </p>
      )}
      {accion && <div className="mt-1">{accion}</div>}
    </div>
  );
}
