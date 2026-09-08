import { Cartucho } from "@/components/estela/Cartucho";
import { fundamentoDe, valorDe } from "@/lib/fundamento";
import { formatMxn } from "@/lib/utils";
import type { ParametroVigente } from "@/lib/parametros";

interface CartuchoParametroProps {
  parametro: ParametroVigente;
  /** Rótulo propio; por omisión el `nombre` del parámetro. */
  titulo?: string;
  /** Equivalencia ya calculada. Ej. el importe en pesos de un umbral en UMA. */
  equivalencia?: string;
  acento?: "jade" | "ambar";
  compacto?: boolean;
  className?: string;
}

/**
 * Un parámetro regulatorio presentado como cartucho: la cifra con su fuente.
 *
 * Éste es el sitio donde ESTELA y el modelo de datos se encuentran. El
 * concepto —ninguna cifra sin fundamento— no es un adorno gráfico: la base ya
 * exigía guardar de dónde sale cada parámetro, y hasta ahora la interfaz
 * pintaba el número y se guardaba la procedencia.
 */
export function CartuchoParametro({
  parametro,
  titulo,
  equivalencia,
  acento = "jade",
  compacto = false,
  className,
}: CartuchoParametroProps) {
  return (
    <Cartucho
      titulo={titulo ?? parametro.nombre}
      acento={acento}
      compacto={compacto}
      fundamento={fundamentoDe(parametro)}
      className={className}
    >
      {valorDe(parametro, formatMxn)}
      {equivalencia && (
        <span className="font-normal text-muted-foreground">
          {" "}
          · {equivalencia}
        </span>
      )}
    </Cartucho>
  );
}
