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
      className="bg-warning/15 border-b border-warning/40 px-4 sm:px-6 py-2 flex items-start gap-2.5 text-sm"
    >
      <FlaskConical className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
      <p className="text-foreground min-w-0">
        <strong className="font-semibold">Entorno de demostración.</strong>{" "}
        <span className="text-muted-foreground">
          Todo funciona igual que en producción, pero los datos son de prueba y los avisos que
          se generen aquí <strong className="text-foreground font-medium">no pueden firmarse
          ni presentarse al SAT</strong>. Al contratar, esta información se retira y la
          bitácora se conserva.
        </span>
      </p>
    </div>
  );
}
