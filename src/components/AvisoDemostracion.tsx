import { FlaskConical } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/**
 * Barra que declara que esto es un entorno de demostración.
 *
 * No es decoración ni un descargo legal: es lo que impide que alguien mire un
 * expediente de comparecientes inventados y lo tome por real. Va arriba de
 * todo, en todas las pantallas, y no se puede cerrar — un aviso que se cierra
 * es un aviso que no está cuando hace falta.
 *
 * Ámbar y no rojo, siguiendo la regla de la marca: nada está roto. Es una
 * condición del entorno que quien opera tiene que tener presente.
 */
export function AvisoDemostracion() {
  const { profile } = useAuth();
  if (!profile?.organization_es_demostracion) return null;

  return (
    <div
      role="status"
      // ESTELA: la barra va sobre el navy de la cabecera con el ámbar como
      // filo inferior, no como fondo. Un ámbar a página completa compite con
      // el ámbar de «lo que le toca atender» que hay dentro de la pantalla, y
      // entonces ninguno de los dos señala nada. El distintivo DEMO concentra
      // el color en 40 px y la barra se lee sin gritar.
      className="flex items-start gap-2.5 border-b-2 border-ikan-ambar bg-gradient-to-r from-ikan-navy-claro to-ikan-navy px-4 py-2 text-sm sm:px-6"
    >
      <span className="mt-px shrink-0 rounded-sm bg-ikan-ambar px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-ikan-navy">
        Demo
      </span>
      <FlaskConical
        className="mt-0.5 h-4 w-4 shrink-0 text-ikan-ambar"
        aria-hidden
      />
      <p className="min-w-0 text-ikan-hielo">
        <strong className="font-semibold text-white">
          Entorno de demostración.
        </strong>{" "}
        <span className="text-ikan-hielo/75">
          Todo funciona igual que en producción, pero los datos son de prueba y
          los avisos que se generen aquí{" "}
          <strong className="font-semibold text-white">
            no pueden firmarse ni presentarse al SAT
          </strong>
          . Al contratar, esta información se retira y la bitácora se conserva.
        </span>
      </p>
    </div>
  );
}
