import type { ReactNode } from "react";
import { IconoIkan } from "@/components/estela/MarcaIkan";
import { EndosoYoltik } from "@/components/estela/EndosoYoltik";
import { FondoFluido } from "@/components/estela/FondoFluido";

interface PlacaAccesoProps {
  /** Qué se hace en esta pantalla. Ej. «Cumplimiento PLD», «Recuperar contraseña». */
  subtitulo: string;
  children: ReactNode;
}

/**
 * La placa de acceso: el marco de todo lo que ocurre antes de tener sesión.
 *
 * Una placa de vidrio sobre el fondo fluido en su versión viva, que es el
 * único sitio donde el fondo se mueve de forma visible. El escenario es
 * oscuro en los dos modos —el acceso es la estela vista de frente—, así que
 * la placa entera va con los tokens del modo oscuro: texto claro sobre vidrio
 * oscuro, campos de vidrio y el botón en degradado de jade.
 *
 * Es un componente y no varias copias porque son pantallas del mismo
 * momento —entrar, pedir contraseña nueva, ponerla, activar el segundo
 * factor— y quien pasa por ellas seguidas tiene que ver la misma pieza, no
 * varias parecidas.
 */
export function PlacaAcceso({ subtitulo, children }: PlacaAccesoProps) {
  return (
    <div className="dark estela-acceso relative grid min-h-screen place-items-center overflow-hidden p-6 text-foreground">
      <FondoFluido vivo />

      <div className="estela-vidrio relative z-10 w-full max-w-[390px] rounded-xl border-white/30 bg-white/[0.14] px-7 pb-[26px] pt-[34px] shadow-placa-acceso sm:px-[34px]">
        <div className="mb-5 flex flex-col items-center text-center">
          {/* El icono en un chip blanco de 84 px: sobre el fondo oscuro la
              hoja del escudo sólo se lee con papel detrás. */}
          <span
            aria-hidden
            className="mb-2.5 flex h-[84px] w-[84px] items-center justify-center rounded-[26px] bg-white shadow-[0_14px_30px_-10px_rgba(0,0,0,0.5)]"
          >
            <IconoIkan size={62} />
          </span>
          <img
            src="/marca/ikan-palabra-blanco.png"
            alt="Ikán"
            className="h-[38px] w-auto object-contain"
          />
          <div className="mt-0.5 text-xs text-[#D4E3E0]">{subtitulo}</div>
        </div>

        {children}

        {/* El endoso: el logotipo de Yoltik en blanco, no una palabra gris. */}
        <div className="mt-5 flex justify-center border-t border-white/20 pt-3.5">
          <EndosoYoltik tono="claro" alto={18} />
        </div>
      </div>
    </div>
  );
}
