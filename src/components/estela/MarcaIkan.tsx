import { cn } from "@/lib/utils";

/** Sobre qué activo usar en cada sitio:
 *
 * El icono a color se aguanta sobre navy y sobre blanco —el hexágono es jade
 * oscuro con anillo mint, y los dos contrastan contra los dos fondos—, así que
 * es el que va casi siempre. El blanco existe para las piezas en las que la
 * marca tiene que quedar en una sola tinta: un fondo de foto, un membrete, un
 * PDF a una tinta. En la aplicación no aparece hoy, pero se queda empaquetado
 * porque en cuanto salga el primer documento generado hará falta.
 *
 * El logotipo va compuesto (icono + «Ikán» en Sora 800) y no como imagen: así
 * hereda la tipografía y el color del sistema, escala sin pixelarse y el
 * lector de pantalla lee un texto, no un `alt`.
 *
 * El producto es **Ikán**; **Yoltik** es el endoso —«Por Yoltik»—, nunca al
 * revés. La mascota Yoli no aparece aquí. */
const ICONO = "/marca/ikan-icono.png";
const ICONO_BLANCO = "/marca/ikan-icono-blanco.png";

interface IconoIkanProps {
  /** Lado del icono en píxeles. */
  size?: number;
  /** Versión a una tinta, para fondos donde el color no se sostiene. */
  monocromo?: boolean;
  className?: string;
}

export function IconoIkan({
  size = 32,
  monocromo = false,
  className,
}: IconoIkanProps) {
  return (
    <img
      src={monocromo ? ICONO_BLANCO : ICONO}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("object-contain shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}

interface MarcaIkanProps {
  /** `claro` para fondos navy (barra lateral, login); `oscuro` para papel. */
  tono?: "claro" | "oscuro";
  /** Sin el endoso «Por Yoltik»: para espacios de una sola línea. */
  sinEndoso?: boolean;
  /** Sólo el icono, sin logotipo: la barra lateral plegada. */
  soloIcono?: boolean;
  size?: number;
  className?: string;
}

export function MarcaIkan({
  tono = "oscuro",
  sinEndoso = false,
  soloIcono = false,
  size = 34,
  className,
}: MarcaIkanProps) {
  if (soloIcono) {
    return <IconoIkan size={size} className={className} />;
  }

  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <IconoIkan size={size} />
      <span className="flex flex-col leading-none min-w-0">
        <span
          className={cn(
            "font-extrabold tracking-tight",
            tono === "claro"
              ? "text-white"
              : "text-ikan-navy dark:text-foreground",
          )}
          style={{ fontSize: Math.round(size * 0.53) }}
        >
          Ikán
        </span>
        {!sinEndoso && (
          <span
            className={cn(
              "mt-0.5 font-medium",
              tono === "claro" ? "text-[#8FA9A5]" : "text-muted-foreground",
            )}
            style={{ fontSize: Math.round(size * 0.32) }}
          >
            Por Yoltik
          </span>
        )}
      </span>
    </span>
  );
}
