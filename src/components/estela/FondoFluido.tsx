import { cn } from "@/lib/utils";

interface FondoFluidoProps {
  /** Más movimiento, burbujas y destello. Sólo para la pantalla de acceso. */
  vivo?: boolean;
  className?: string;
}

/**
 * El fondo de las pantallas: manchas difusas que se deforman y derivan despacio
 * sobre una ola. Decorativo (aria-hidden), nunca lleva texto.
 *
 * El contenedor padre debe tener `position: relative`; el contenido va encima
 * con `relative z-10`. Los estilos viven en src/estela-fluido.css.
 */
export function FondoFluido({ vivo = false, className }: FondoFluidoProps) {
  return (
    <div aria-hidden="true" className={cn("fondo-fluido", vivo && "vivo", className)}>
      <i className="m1" />
      <i className="m2" />
      <i className="m3" />
      <i className="m4" />
      <svg viewBox="0 0 1200 100" preserveAspectRatio="none">
        <path d="M0 50 Q150 0 300 50 T600 50 T900 50 T1200 50 V100 H0Z" />
      </svg>
      {vivo && (
        <>
          <span className="destello" />
          {[
            [8, 26, 16, 2], [20, 14, 12, 7], [33, 34, 20, 11], [48, 18, 14, 4],
            [62, 28, 18, 9], [76, 12, 11, 1], [88, 22, 15, 6],
          ].map(([izq, d, dur, ret]) => (
            <span
              key={izq}
              className="burbuja"
              style={{ left: `${izq}%`, width: d, height: d, animationDuration: `${dur}s`, animationDelay: `-${ret}s` }}
            />
          ))}
        </>
      )}
    </div>
  );
}
