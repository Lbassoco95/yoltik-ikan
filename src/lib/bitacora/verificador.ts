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

import { raizMerkle } from '../../../supabase/functions/_shared/merkle';

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

/** Un anclaje tal como viaja en el paquete. El `.ots` no va aquí: son bytes y
 *  se descargan aparte, uno por anclaje. */
export interface AnclajeDelPaquete {
  id: string;
  desde_secuencia: number;
  hasta_secuencia: number;
  raiz_merkle: string;
  cadena_hash_final: string;
  estado: 'pendiente' | 'confirmado' | 'fallido';
  motivo: string;
  calendarios: string[];
  bloque_btc: number | null;
  fecha_bloque: string | null;
  creado_en: string;
}

export interface PaqueteVerificacion {
  organization_id: string;
  generado_en: string;
  /** Cabeza de la cadena al momento de exportar. */
  ultima_secuencia: number;
  ultimo_hash: string;
  eventos: EventoBitacora[];
  /** Raíces publicadas en Bitcoin. Sin ellas, verificar sólo comprueba que la
   *  cadena es consistente consigo misma —que es exactamente lo que no basta. */
  anclajes?: AnclajeDelPaquete[];
}

/** Qué pasó al contrastar un anclaje contra los eventos del paquete. */
export interface RevisionAnclaje {
  id: string;
  desde_secuencia: number;
  hasta_secuencia: number;
  estado: AnclajeDelPaquete['estado'];
  bloque_btc: number | null;
  /** La raíz recalculada desde los eventos coincide con la publicada. */
  coincide: boolean;
  motivo?: string;
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
  /** Una por anclaje del paquete. Vacío si el paquete no trae anclajes. */
  anclajes: RevisionAnclaje[];
  /** Hasta qué secuencia hay una raíz publicada en Bitcoin que la respalde.
   *  Los eventos por encima de esta línea son la ventana sin cobertura. */
  cubiertoHasta: number;
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

  const anclajes = await revisarAnclajes(paquete, eventos);

  return {
    integra: roturas.length === 0,
    eventosVerificados: eventos.length,
    roturas,
    hashFinal: anterior,
    anclajes,
    cubiertoHasta: anclajes
      .filter((a) => a.coincide && a.estado === 'confirmado')
      .reduce((n, a) => Math.max(n, a.hasta_secuencia), 0),
  };
}

/**
 * Contrasta cada anclaje contra los eventos del paquete.
 *
 * Es la parte que convierte "la cadena es consistente" en "esta historia
 * existía antes de este bloque de Bitcoin". Se recalcula la raíz Merkle del
 * tramo desde los eventos que están aquí: si coincide con la que se publicó,
 * esos eventos son los que se anclaron y ninguno cambió desde entonces.
 *
 * Un anclaje que no coincide es la señal más grave de todo el verificador: la
 * cadena puede estar perfectamente encadenada y aun así no ser la que se
 * publicó, que es exactamente la manipulación que el ancla existe para
 * detectar.
 */
async function revisarAnclajes(
  paquete: PaqueteVerificacion,
  eventos: EventoBitacora[],
): Promise<RevisionAnclaje[]> {
  const porSecuencia = new Map(eventos.map((e) => [e.secuencia, e]));

  return await Promise.all(
    (paquete.anclajes ?? []).map(async (a): Promise<RevisionAnclaje> => {
      const base = {
        id: a.id,
        desde_secuencia: a.desde_secuencia,
        hasta_secuencia: a.hasta_secuencia,
        estado: a.estado,
        bloque_btc: a.bloque_btc,
      };

      if (a.estado === 'fallido')
        return { ...base, coincide: false, motivo: 'el anclaje no llegó a publicarse' };

      const hojas: string[] = [];
      for (let s = a.desde_secuencia; s <= a.hasta_secuencia; s++) {
        const e = porSecuencia.get(s);
        if (!e)
          return {
            ...base,
            coincide: false,
            motivo: `el paquete no trae el evento ${s}, que este anclaje certifica`,
          };
        hojas.push(e.cadena_hash);
      }

      const raiz = await raizMerkle(hojas);
      if (raiz !== a.raiz_merkle.trim().toLowerCase())
        return {
          ...base,
          coincide: false,
          motivo:
            'la raíz recalculada no es la que se publicó: estos eventos NO son los que se ' +
            'anclaron',
        };

      const ultimo = porSecuencia.get(a.hasta_secuencia)!;
      if (ultimo.cadena_hash.toLowerCase() !== a.cadena_hash_final.trim().toLowerCase())
        return { ...base, coincide: false, motivo: 'el eslabón final no es el que se ancló' };

      return { ...base, coincide: true };
    }),
  );
}

/**
 * Lo que la pantalla DEBE decir junto a una verificación exitosa, según hasta
 * dónde llegue el respaldo externo.
 *
 * Nunca se dice "verificado" a secas. Una cadena dentro de la base que
 * administra Ikán prueba que nadie alteró un evento suelto; no prueba que Ikán
 * no la reescribiera entera. Sólo el ancla en Bitcoin cierra esa puerta, y
 * sólo hasta donde llega.
 */
export const ADVERTENCIA_SIN_ANCLA =
  'Verificación interna: comprueba que ningún evento fue alterado ni borrado dentro de la ' +
  'bitácora. Todavía NO hay una raíz publicada en Bitcoin, así que no prueba por sí sola que ' +
  'la cadena completa no haya sido reescrita.';

export function advertenciaDeAlcance(r: Pick<ResultadoVerificacion, 'cubiertoHasta' | 'eventosVerificados'>): string {
  if (r.cubiertoHasta === 0) return ADVERTENCIA_SIN_ANCLA;
  if (r.cubiertoHasta >= r.eventosVerificados)
    return (
      'Los eventos verificados están respaldados por una raíz publicada en Bitcoin: cualquier ' +
      'alteración, incluso reescribir la cadena entera, es detectable por un tercero sin ' +
      'depender de Ikán.'
    );
  return (
    `Los primeros ${r.cubiertoHasta.toLocaleString('es-MX')} eventos están respaldados por una ` +
    'raíz publicada en Bitcoin. Los posteriores sólo tienen la verificación interna hasta el ' +
    'siguiente anclaje.'
  );
}
