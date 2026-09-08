import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * El endoso: «Powered by Yoltik».
 *
 * El producto es **Ikán**; Yoltik es quien lo hace. Antes eso se decía con
 * texto —«Por Yoltik», en gris, debajo del nombre— y se leía como un pie de
 * página. Con el logotipo de Yoltik el endoso se ve en vez de leerse, que es
 * lo que hace un endoso: prestar reconocimiento visual, no explicar.
 *
 * El archivo puede no estar todavía. Si no está, no se rompe nada ni queda un
 * hueco: se cae con elegancia al logotipo tipográfico en Sora, que es lo que
 * había antes. En cuanto el PNG aparezca en `public/marca/`, la imagen entra
 * sola sin tocar código.
 *
 * TODO[Sprint D-2]: subir a `public/marca/` el logotipo de Yoltik que entregó
 * Dirección —`yoltik.png` para fondo claro y `yoltik-blanco.png` para navy—.
 * Mientras no estén, esto enseña la palabra.
 */
const LOGO = "/marca/yoltik.png";
const LOGO_BLANCO = "/marca/yoltik-blanco.png";

interface EndosoYoltikProps {
  /** `claro` para fondos navy; `oscuro` para papel. */
  tono?: "claro" | "oscuro";
  /** Alto del logotipo en píxeles. El ancho se ajusta solo. */
  alto?: number;
  className?: string;
}

export function EndosoYoltik({
  tono = "oscuro",
  alto = 18,
  className,
}: EndosoYoltikProps) {
  const [sinImagen, setSinImagen] = useState(false);
  const claro = tono === "claro";

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      // El lector de pantalla lee la frase entera de corrido; sin esto oiría
      // «powered by» y luego un logotipo suelto.
      aria-label="Powered by Yoltik"
    >
      <span
        aria-hidden
        className={cn(
          "font-medium",
          claro ? "text-[#8FA9A5]" : "text-muted-foreground",
        )}
        style={{ fontSize: Math.max(10, Math.round(alto * 0.6)) }}
      >
        Powered by
      </span>

      {sinImagen ? (
        <span
          aria-hidden
          className={cn(
            "font-extrabold tracking-tight",
            claro ? "text-white" : "text-ikan-navy dark:text-foreground",
          )}
          style={{ fontSize: Math.round(alto * 0.85) }}
        >
          Yoltik
        </span>
      ) : (
        <img
          src={claro ? LOGO_BLANCO : LOGO}
          alt=""
          aria-hidden
          className="w-auto object-contain"
          style={{ height: alto }}
          onError={() => setSinImagen(true)}
        />
      )}
    </span>
  );
}
