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
 * `yoltik.png` va sobre fondo claro y `yoltik-blanco.png` sobre navy o sobre
 * el papel del modo oscuro. Si el archivo no carga, no se rompe nada ni queda
 * un hueco: se cae con elegancia al logotipo tipográfico en Sora.
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
          claro ? "text-[#A9BFBB]" : "text-muted-foreground",
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
      ) : claro ? (
        <img
          src={LOGO_BLANCO}
          alt=""
          aria-hidden
          className="w-auto object-contain"
          style={{ height: alto }}
          onError={() => setSinImagen(true)}
        />
      ) : (
        <>
          {/* Sobre papel claro, el logotipo navy; en modo oscuro el papel
              también es navy y entra el blanco. */}
          <img
            src={LOGO}
            alt=""
            aria-hidden
            className="w-auto object-contain dark:hidden"
            style={{ height: alto }}
            onError={() => setSinImagen(true)}
          />
          <img
            src={LOGO_BLANCO}
            alt=""
            aria-hidden
            className="hidden w-auto object-contain dark:block"
            style={{ height: alto }}
            onError={() => setSinImagen(true)}
          />
        </>
      )}
    </span>
  );
}
