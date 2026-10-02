import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { EstadoVacio } from "@/components/estela/EstadoVacio";
import { FondoFluido } from "@/components/estela/FondoFluido";

/**
 * La página que no existe.
 *
 * Venía del andamiaje y estaba en inglés —«Oops! Page not found», «Return to
 * Home»— en un producto cuya interfaz entera está en español de México. Una
 * pantalla en otro idioma no es un detalle de estilo: es la señal de que
 * alguien se salió del producto y aterrizó en el armazón.
 */
export default function NotFound() {
  const { pathname } = useLocation();

  useEffect(() => {
    console.error("404: ruta inexistente:", pathname);
  }, [pathname]);

  return (
    <div className="relative flex min-h-screen flex-col">
      <FondoFluido className="fixed" />
      <div className="relative z-10 grid flex-1 place-items-center p-6">
        <EstadoVacio
          className="max-w-md"
          titulo="Esta página no existe"
          descripcion={
            <>
              No hay nada en{" "}
              <span className="estela-dato break-all">{pathname}</span>. Puede
              que el enlace esté mal escrito o que la sección haya cambiado de
              sitio.
            </>
          }
          accion={
            <Link
              to="/"
              className="inline-flex items-center rounded-full bg-ikan-jade-oscuro px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#005A4C]"
            >
              Ir al tablero
            </Link>
          }
        />
      </div>
    </div>
  );
}
