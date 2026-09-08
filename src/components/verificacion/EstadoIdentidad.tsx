import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ETIQUETA_ESTADO, type EstadoVerificacion } from "@/lib/api/verificacion";
import { TONO_ESTADO } from "@/lib/verificacion-labels";

interface EstadoIdentidadProps {
  /** A quién pertenece: la insignia enlaza a SU apartado de identificación. */
  clientId: string;
  estado: EstadoVerificacion | undefined;
  onVerificar: () => void;
}

/**
 * Estado de identidad de un compareciente.
 *
 * Sin verificación no se dice «no verificado», que suena a que falló: se
 * ofrece hacerla. Y cuando está aprobada se dice «identidad verificada», nunca
 * «identificado» a secas — identificar en el sentido del artículo 18 es
 * integrar el expediente, y eso es más que verificar quién es alguien.
 *
 * Estaba copiado en `ClientsPage` y en `VerificationPage`, con su propia tabla
 * de colores cada uno. Dos copias del mismo estado son dos oportunidades de
 * que digan cosas distintas del mismo compareciente, que es justo lo que un
 * producto de cumplimiento no se puede permitir: quien ve «verificada» en una
 * pantalla y otra cosa en la otra deja de creerle a las dos.
 *
 * La insignia es un enlace, no una etiqueta muerta. Antes decía «Identidad
 * verificada» y ahí se acababa: para ver QUÉ verificó Didit —qué documento,
 * qué prueba de vida, qué cotejo facial, qué listas— había que entrar al
 * expediente y buscar la pestaña a mano. El estado y su respaldo tienen que
 * estar a un clic uno del otro.
 */
export function EstadoIdentidad({
  clientId,
  estado,
  onVerificar,
}: EstadoIdentidadProps) {
  if (!estado) {
    return (
      <Button size="sm" variant="ghost" className="gap-2" onClick={onVerificar}>
        <ShieldCheck className="h-4 w-4" aria-hidden /> Verificar
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        to={`/clientes/${clientId}?apartado=identificacion`}
        // La fila entera navega al expediente en la lista de comparecientes;
        // sin esto el clic haría las dos cosas y ganaría la de fuera.
        onClick={(e) => e.stopPropagation()}
        title="Ver qué se verificó"
        className={cn(
          "status-badge whitespace-nowrap text-xs transition-opacity hover:opacity-80",
          TONO_ESTADO[estado],
        )}
      >
        {ETIQUETA_ESTADO[estado]}
      </Link>
      {/* Se puede reintentar salvo cuando ya está aprobada: volver a pedirla
          ahí sólo gasta una verificación y confunde a la persona. */}
      {estado !== "aprobada" && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onVerificar}
          className="h-7 px-2 text-xs"
        >
          Reenviar
        </Button>
      )}
    </div>
  );
}
