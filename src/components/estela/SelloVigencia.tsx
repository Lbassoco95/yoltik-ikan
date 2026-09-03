import { cn } from "@/lib/utils";

interface SelloVigenciaProps {
  /** Número de versión vigente del artefacto (metodología, umbrales, matriz). */
  version: number | string;
  /** Estado. Por omisión «VIGENTE». */
  estado?: string;
  /**
   * Leyenda inferior. «INMUTABLE» cuando la versión quedó anclada en bitácora
   * y ya no se puede editar —sólo sucederla por otra.
   */
  leyenda?: string;
  /** Sello más pequeño, para cabeceras densas. */
  size?: number;
  className?: string;
}

/**
 * El sello de tinta: circular, jade Ikán, anillo mint discontinuo, girado −6°
 * como si lo hubieran estampado a mano.
 *
 * Dice una cosa concreta y no decorativa: esta versión es la que rige hoy, y
 * quedó cerrada. Va donde hay versionado real —motor de reglas, matriz de
 * riesgo—, nunca como adorno de cabecera.
 */
export function SelloVigencia({
  version,
  estado = "VIGENTE",
  leyenda = "INMUTABLE",
  size = 88,
  className,
}: SelloVigenciaProps) {
  return (
    <div
      role="img"
      aria-label={`Versión ${version}, ${estado.toLowerCase()}${leyenda ? `, ${leyenda.toLowerCase()}` : ""}`}
      className={cn(
        "flex shrink-0 -rotate-6 items-center justify-center rounded-full border-[3px] border-dashed border-ikan-mint bg-ikan-jade-oscuro p-2 shadow-[0_0_0_4px_rgba(0,107,91,0.12)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <div className="text-center leading-tight text-white">
        <p className="m-0 text-[9px] font-extrabold tracking-wider">
          VERSIÓN {version}
        </p>
        <p className="my-0.5 text-[11px] font-extrabold">{estado}</p>
        {leyenda && (
          <p className="m-0 text-[8px] tracking-wider text-ikan-mint">
            {leyenda}
          </p>
        )}
      </div>
    </div>
  );
}
