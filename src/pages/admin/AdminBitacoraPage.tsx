import { IntegridadBitacora } from "@/components/bitacora/IntegridadBitacora";
import { CADENA_PLATAFORMA } from "@/lib/api/bitacora";

/**
 * Bitácora de plataforma: lo que hace Kawiil y afecta a todas las
 * organizaciones a la vez —cargar un catálogo, mover una lista restrictiva,
 * cambiar un parámetro regulatorio—.
 *
 * Va en cadena aparte de las de los clientes por dos razones: para que una
 * organización pueda verificar la suya sin ver las demás, y para que el
 * paquete de verificación de un cliente no filtre el volumen de operación de
 * otro.
 */
export default function AdminBitacoraPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bitácora de plataforma</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Cada carga de catálogo, cada movimiento de lista y cada cambio de parámetro queda aquí,
          encadenado por hashes. Es lo que permite responderle a un cliente con qué versión del
          catálogo se armó su aviso de hace ocho meses.
        </p>
      </div>

      <IntegridadBitacora
        organizationId={CADENA_PLATAFORMA}
        titulo="Integridad de la bitácora de plataforma"
      />

      <div className="glass-card p-5">
        <p className="text-sm font-semibold text-foreground">Qué prueba y qué no</p>
        <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
          <li>
            <strong className="text-foreground">Sí prueba:</strong> que ningún evento fue alterado
            ni borrado dentro de la bitácora. Cualquier cambio a un registro pasado rompe la cadena
            y aparece al recalcularla, aquí y en la máquina de quien audite.
          </li>
          <li>
            <strong className="text-foreground">No prueba:</strong> que el dato capturado sea
            verdadero. Una cadena certifica lo que le entregaron; si alguien capturó un monto
            falso, queda un monto falso certificado.
          </li>
          <li>
            <strong className="text-foreground">Todavía no prueba:</strong> que la cadena completa
            no haya sido reescrita. Vive en la base que administramos nosotros. Eso lo cierra el
            anclaje de raíces Merkle en Bitcoin con OpenTimestamps, que entra en el siguiente
            bloque: una raíz publicada fuera ya no se puede recalcular.
          </li>
        </ul>
      </div>
    </div>
  );
}
