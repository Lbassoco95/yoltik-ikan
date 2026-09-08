import type { ReactNode } from "react";
import { IconoIkan } from "@/components/estela/MarcaIkan";
import { EndosoYoltik } from "@/components/estela/EndosoYoltik";

interface PlacaAccesoProps {
  /** Qué se hace en esta pantalla. Ej. «Cumplimiento PLD», «Recuperar contraseña». */
  subtitulo: string;
  children: ReactNode;
}

/**
 * La placa de acceso: el marco de todo lo que ocurre antes de tener sesión.
 *
 * El acceso pasa sobre el navy —la estela vista de frente— y la tarjeta blanca
 * es la placa encima. Lo que la distingue es contraste en tres capas: la barra
 * jade del canto superior, el halo jade que la despega del fondo y el aire
 * alrededor del contenido.
 *
 * Es un componente y no tres copias porque son tres pantallas del mismo
 * momento —entrar, pedir contraseña nueva, ponerla— y quien pasa por las tres
 * seguidas tiene que ver la misma pieza, no tres parecidas. Login la tenía en
 * ESTELA y las dos de contraseña se habían quedado con el marco del andamiaje:
 * un «Ikán» en texto sobre fondo gris, sin marca y sin endoso.
 */
export function PlacaAcceso({ subtitulo, children }: PlacaAccesoProps) {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-ikan-navy-claro to-[#081A30] p-6">
      <div className="w-full max-w-[380px] overflow-hidden rounded-md bg-card shadow-[0_0_0_1px_rgba(0,145,124,0.35),0_18px_50px_-12px_rgba(0,0,0,0.55)]">
        {/* Barra jade maciza, no la cenefa de greca. La greca funciona a lo
            ancho de la pantalla, donde se lee como una regla; en 380 px de
            tarjeta sus escalones se apelotonan y el canto parece un borde
            perforado. Aquí el trabajo es marcar el canto con contraste, y para
            eso una barra maciza es mejor que un motivo. */}
        <div
          className="h-1.5 bg-gradient-to-r from-ikan-jade-oscuro via-ikan-jade to-ikan-mint"
          aria-hidden
        />

        <div className="p-8 sm:p-10">
          <div className="mb-7 flex flex-col items-center gap-3 text-center">
            {/* El hexágono a 72 px: es la marca, y en las únicas pantallas
                donde no compite con nada tiene que poder verse. */}
            <IconoIkan size={72} />
            <div>
              <div className="text-[26px] font-extrabold leading-none tracking-tight text-ikan-navy dark:text-foreground">
                Ikán
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">
                {subtitulo}
              </div>
            </div>
          </div>

          {children}

          {/* El endoso. Yoltik deja de ser una palabra en gris al final de una
              frase y pasa a ser su logotipo: un endoso se ve, no se lee. */}
          <div className="mt-7 flex justify-center border-t border-border pt-5">
            <EndosoYoltik alto={20} />
          </div>
        </div>
      </div>
    </div>
  );
}
