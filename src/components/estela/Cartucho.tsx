import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CartuchoProps {
  /** Antetítulo en versalitas: qué cifra es. Ej. «UMA vigente», «Umbral». */
  titulo: string;
  /** La cifra. Va en ancho fijo para poder cotejarla contra el documento. */
  children: ReactNode;
  /**
   * De dónde sale. Artículo, fracción, publicación en el DOF, quién la validó
   * y cuándo. Sin esto el cartucho no es un cartucho: es un número suelto.
   */
  fundamento?: ReactNode;
  /**
   * Ámbar cuando la cifra es la que le toca atender en esta pantalla. Uno por
   * pantalla como máximo: si todo urge, nada urge.
   */
  acento?: "jade" | "ambar";
  /** Cifra en dos líneas en vez de una: para cartuchos dentro de una tarjeta. */
  compacto?: boolean;
  className?: string;
}

/**
 * El componente estrella de ESTELA.
 *
 * Un cartucho es toda cifra regulatoria que la aplicación muestra: un umbral,
 * el valor de la UMA, un importe que dispara aviso, una aprobación. La regla
 * que impone es la que hace falta en cumplimiento y casi ningún producto
 * cumple: **ninguna cifra aparece sin su fuente al lado**. Quien la lee tiene
 * que poder ir al DOF y comprobarla sin preguntarle a nadie.
 *
 * Visualmente: vidrio con radio de 20 px, la ola en jade como canto
 * izquierdo —no un borde plano—, cifra en JetBrains Mono, cita legal en gris
 * técnico debajo. El antetítulo sólo va en ámbar cuando `acento="ambar"`: en
 * claro un ámbar oscuro que sí se lee sobre vidrio (#7A4F00), en oscuro el de
 * marca.
 */
export function Cartucho({
  titulo,
  children,
  fundamento,
  acento = "jade",
  compacto = false,
  className,
}: CartuchoProps) {
  return (
    <div
      className={cn(
        "estela-vidrio estela-canto rounded-md shadow-suave",
        compacto ? "py-2.5 pl-[34px] pr-3.5" : "py-4 pl-[38px] pr-[18px]",
        className,
      )}
    >
      <p
        className={cn(
          "estela-antetitulo m-0",
          acento === "ambar"
            ? "text-[#7A4F00] dark:text-ikan-ambar"
            : "text-muted-foreground",
        )}
      >
        {titulo}
      </p>
      <p
        className={cn(
          "estela-dato m-0 mt-2 font-bold text-ikan-navy dark:text-foreground",
          compacto ? "text-sm" : "text-[17px]",
        )}
      >
        {children}
      </p>
      {fundamento && (
        <p className="m-0 mt-2 text-xs leading-relaxed text-muted-foreground">
          {fundamento}
        </p>
      )}
    </div>
  );
}
