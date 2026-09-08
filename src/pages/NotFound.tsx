import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { EstadoVacio } from "@/components/estela/EstadoVacio";

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
    <div className="flex min-h-screen flex-col bg-background">
      <div className="estela-cenefa" aria-hidden />
      <div className="grid flex-1 place-items-center p-6">
        <EstadoVacio
          className="max-w-md border-solid bg-card"
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
              className="inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-bold text-accent-foreground transition-colors hover:bg-ikan-jade-oscuro"
            >
              Ir al tablero
            </Link>
          }
        />
      </div>
    </div>
  );
}
