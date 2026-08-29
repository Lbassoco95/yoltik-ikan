/**
 * Verificador de la bitácora encadenada. Módulo puro.
 *
 * Existe para que verificar NO dependa de Ikán. Si para comprobar la
 * integridad hubiera que preguntarle a nuestra API, se estaría pidiendo
 * confiar justo en quien se quiere auditar. Este código recalcula todo desde
 * el paquete exportado: mismos hashes, mismas reglas que la base.
 *
 * Usa Web Crypto (`crypto.subtle`), que existe igual en el navegador y en
 * Node, para que el mismo archivo sirva en la pantalla de verificación y en un
 * script de un auditor.
 */

/** Hash de la cadena vacía: 64 ceros. */
export const HASH_GENESIS = '0'.repeat(64);

/** Un evento tal como sale del paquete de verificación. */
export interface EventoBitacora {
  secuencia: number;
  /** Texto exacto que se hashea. NO se vuelve a canonicalizar. */
  payload_canonico: string;
  nonce: string;
  evento_hash: string;
  cadena_hash: string;
  hash_anterior: string;
  /** Informativos: no entran en el hash. */
  tipo?: string;
  entidad?: string;
  registrado_en?: string;
}

export interface PaqueteVerificacion {
  organization_id: string;
  generado_en: string;
  /** Cabeza de la cadena al momento de exportar. */
  ultima_secuencia: number;
  ultimo_hash: string;
  eventos: EventoBitacora[];
}

export interface Rotura {
  secuencia: number;
  motivo: string;
}

export interface ResultadoVerificacion {
  integra: boolean;
  eventosVerificados: number;
  roturas: Rotura[];
  /** Último eslabón calculado. Es lo que se compara contra el ancla externa. */
  hashFinal: string;
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  return hex(await crypto.subtle.digest('SHA-256', datos));
}

/** Hash del contenido de un evento. Mismo orden y separador que la base. */
export async function hashDeEvento(e: Pick<EventoBitacora, 'payload_canonico' | 'nonce'>) {
  return sha256Hex(`${e.payload_canonico}|${e.nonce}`);
}

/** Hash del eslabón. Encadena con el anterior y con la posición. */
export async function hashDeEslabon(anterior: string, eventoHash: string, secuencia: number) {
  return sha256Hex(`${anterior}|${eventoHash}|${secuencia}`);
}

/**
 * Recalcula la cadena completa.
 *
 * Reporta TODAS las roturas, no sólo la primera: quien audita quiere saber el
 * alcance de lo alterado, no dónde empezó.
 */
export async function verificarPaquete(
  paquete: PaqueteVerificacion,
): Promise<ResultadoVerificacion> {
  const roturas: Rotura[] = [];
  const eventos = [...paquete.eventos].sort((a, b) => a.secuencia - b.secuencia);

  let anterior = HASH_GENESIS;
  let esperada = 1;

  for (const e of eventos) {
    if (e.secuencia !== esperada) {
      roturas.push({
        secuencia: esperada,
        motivo: `falta la secuencia ${esperada}: hay un hueco en la cadena`,
      });
      // Se sigue desde donde está el paquete: interesa el alcance completo.
      esperada = e.secuencia;
      anterior = e.hash_anterior;
    }

    const eventoHash = await hashDeEvento(e);
    if (eventoHash !== e.evento_hash) {
      roturas.push({
        secuencia: e.secuencia,
        motivo: 'el contenido del evento no corresponde a su hash: se alteró el payload',
      });
    }

    if (e.hash_anterior !== anterior) {
      roturas.push({
        secuencia: e.secuencia,
        motivo: 'el eslabón no apunta al evento previo: se borró o se insertó un evento',
      });
    }

    const cadenaHash = await hashDeEslabon(e.hash_anterior, e.evento_hash, e.secuencia);
    if (cadenaHash !== e.cadena_hash) {
      roturas.push({
        secuencia: e.secuencia,
        motivo: 'el eslabón no corresponde a sus partes: se alteró el encadenamiento',
      });
    }

    anterior = e.cadena_hash;
    esperada = e.secuencia + 1;
  }

  // Truncar por el final es la manipulación que no rompe ningún eslabón: los
  // que quedan siguen encajando entre sí. Sólo se ve comparando con la cabeza.
  if (eventos.length > 0 && paquete.ultima_secuencia !== eventos[eventos.length - 1].secuencia) {
    roturas.push({
      secuencia: paquete.ultima_secuencia,
      motivo: 'la cabeza de la cadena no coincide con el último evento: se truncó por el final',
    });
  }
  if (eventos.length > 0 && paquete.ultimo_hash !== anterior) {
    roturas.push({
      secuencia: paquete.ultima_secuencia,
      motivo: 'el hash de la cabeza no corresponde al último eslabón',
    });
  }

  return {
    integra: roturas.length === 0,
    eventosVerificados: eventos.length,
    roturas,
    hashFinal: anterior,
  };
}

/**
 * Advertencia que la pantalla DEBE mostrar junto a cualquier verificación
 * exitosa mientras no haya anclaje externo.
 *
 * Una cadena dentro de la base que administra Ikán prueba que nadie alteró un
 * evento suelto. No prueba que Ikán no la reescribiera entera. Decir
 * "verificado" a secas, sin ancla, sería exagerar lo que el resultado
 * significa.
 */
export const ADVERTENCIA_SIN_ANCLA =
  'Verificación interna: comprueba que ningún evento fue alterado ni borrado dentro de la ' +
  'bitácora. Todavía NO hay anclaje externo, así que no prueba por sí sola que la cadena ' +
  'completa no haya sido reescrita. El anclaje en Bitcoin (OpenTimestamps) entra en el ' +
  'siguiente bloque.';
