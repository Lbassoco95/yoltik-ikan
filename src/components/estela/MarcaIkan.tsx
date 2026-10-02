import { cn } from "@/lib/utils";
import { EndosoYoltik } from "@/components/estela/EndosoYoltik";

/** Sobre qué activo usar en cada sitio:
 *
 * El icono a color se aguanta sobre blanco y sobre el vidrio claro. Sobre
 * navy, a tamaño pequeño, la hoja del escudo se pierde: ahí va dentro de un
 * chip blanco redondeado. El blanco a una tinta existe para las piezas en las
 * que la marca tiene que quedar en una sola tinta: un fondo de foto, un
 * membrete, un PDF a una tinta.
 *
 * El logotipo va compuesto: el icono más la palabra «Ikán» oficial
 * (`ikan-palabra.png` sobre fondo claro, `ikan-palabra-blanco.png` sobre navy
 * o en modo oscuro). Las imágenes son decorativas; el lector de pantalla lee
 * el texto «Ikán», no un `alt`.
 *
 * El producto es **Ikán**; **Yoltik** es el endoso —«Powered by Yoltik»—,
 * nunca al revés. La mascota Yoli no aparece aquí. */
const ICONO = "/marca/ikan-icono.png";
const ICONO_BLANCO = "/marca/ikan-icono-blanco.png";
const PALABRA = "/marca/ikan-palabra.png";
const PALABRA_BLANCO = "/marca/ikan-palabra-blanco.png";

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

/** El icono dentro del chip blanco (radio 12, aire de 5 px), para navy. */
function IconoEnChip({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[12px] bg-white p-[5px] shadow-[0_6px_14px_-6px_rgba(0,0,0,0.5)]"
      style={{ width: size, height: size }}
    >
      <IconoIkan size={size - 10} />
    </span>
  );
}

interface MarcaIkanProps {
  /** `claro` para fondos navy (barra lateral, login); `oscuro` para papel. */
  tono?: "claro" | "oscuro";
  /** Sin el endoso «Powered by Yoltik»: para espacios de una sola línea. */
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
  const claro = tono === "claro";
  const altoPalabra = Math.round(size * 0.55);

  if (soloIcono) {
    return claro ? (
      <span className={cn("inline-flex", className)}>
        <IconoEnChip size={size} />
        <span className="sr-only">Ikán</span>
      </span>
    ) : (
      <IconoIkan size={size} className={className} />
    );
  }

  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      {claro ? <IconoEnChip size={size} /> : <IconoIkan size={size} />}
      <span className="flex flex-col leading-none min-w-0">
        <span className="sr-only">Ikán</span>
        {claro ? (
          <img
            src={PALABRA_BLANCO}
            alt=""
            aria-hidden
            className="w-auto self-start object-contain"
            style={{ height: altoPalabra }}
          />
        ) : (
          <>
            <img
              src={PALABRA}
              alt=""
              aria-hidden
              className="w-auto self-start object-contain dark:hidden"
              style={{ height: altoPalabra }}
            />
            <img
              src={PALABRA_BLANCO}
              alt=""
              aria-hidden
              className="hidden w-auto self-start object-contain dark:block"
              style={{ height: altoPalabra }}
            />
          </>
        )}
        {!sinEndoso && (
          <EndosoYoltik
            tono={tono}
            alto={Math.max(12, Math.round(size * 0.34))}
            className="mt-1"
          />
        )}
      </span>
    </span>
  );
}
