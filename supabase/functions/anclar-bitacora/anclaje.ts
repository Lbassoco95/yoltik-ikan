/**
 * La lógica del anclaje, sin Deno ni Supabase. Módulo puro, probado con vitest.
 *
 * Aquí vive TODO lo que puede salir mal calculando —qué tramo se ancla, con
 * qué eventos, en qué orden, qué se hace cuando un calendario no contesta— y
 * nada de lo que depende de que la red o la base respondan. Es lo que permite
 * probar el anclaje sin un calendario delante, que en esta sesión no hay.
 */

import { raizMerkle } from '../_shared/merkle.ts';
import {
  armarOts,
  type RespuestaCalendario,
  type Sellador,
} from '../_shared/opentimestamps.ts';

export type MotivoAnclaje = 'diario' | 'cierre_periodo' | 'manual';

/** Un eslabón de la bitácora, en el orden en que la cadena los encadenó. */
export interface EslabonBitacora {
  secuencia: number;
  cadena_hash: string;
}

export interface PlanAnclaje {
  desde: number;
  hasta: number;
  raiz_merkle: string;
  cadena_hash_final: string;
}

/** Por qué no hay nada que anclar, cuando no lo hay. */
export type RazonSinAnclar = 'sin_eventos_nuevos';

/**
 * Decide qué se ancla y calcula la raíz.
 *
 * Devuelve `null` cuando no hay eventos nuevos: un anclaje vacío gastaría un
 * estampado y, peor, dejaría un tramo sin sentido en una tabla cuyos rangos no
 * se pueden solapar ni corregir después.
 *
 * Exige que los eslabones lleguen COMPLETOS y en orden. Un hueco en la
 * secuencia significa que la consulta paginó mal o que falta un evento, y
 * anclar sobre eso certificaría una historia que no es la que ocurrió: es
 * mejor fallar aquí, en voz alta, que publicar una raíz de algo distinto.
 */
export async function planearAnclaje(
  eslabones: EslabonBitacora[],
  desdeEsperado: number,
): Promise<PlanAnclaje | null> {
  if (eslabones.length === 0) return null;

  const ordenados = [...eslabones].sort((a, b) => a.secuencia - b.secuencia);

  if (ordenados[0].secuencia !== desdeEsperado)
    throw new Error(
      `El tramo tenía que empezar en ${desdeEsperado} y empieza en ${ordenados[0].secuencia}: ` +
        'faltan eventos o la consulta trajo otro tramo.',
    );

  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].secuencia !== ordenados[i - 1].secuencia + 1)
      throw new Error(
        `Hueco en la bitácora entre ${ordenados[i - 1].secuencia} y ${ordenados[i].secuencia}: ` +
          'no se ancla una historia incompleta.',
      );
  }

  const ultimo = ordenados[ordenados.length - 1];
  return {
    desde: ordenados[0].secuencia,
    hasta: ultimo.secuencia,
    raiz_merkle: await raizMerkle(ordenados.map((e) => e.cadena_hash)),
    cadena_hash_final: ultimo.cadena_hash.trim().toLowerCase(),
  };
}

export interface ResultadoSellado {
  estado: 'pendiente' | 'fallido';
  /** El archivo .ots, cuando al menos un calendario respondió. */
  ots: Uint8Array | null;
  /** Los que sí sellaron. Se guardan para saber a quién pedirle la prueba
   *  completa cuando Bitcoin confirme. */
  calendarios: string[];
  detalle: string | null;
}

const hexABytes = (h: string): Uint8Array => {
  const limpio = h.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(limpio)) throw new Error(`La raíz no es un SHA-256: "${h}"`);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(limpio.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/**
 * Manda la raíz a los calendarios y arma la prueba.
 *
 * Basta con que UNO conteste. Se manda a varios porque un calendario que
 * desaparezca dentro de cinco años no debe llevarse la prueba con él, no
 * porque haga falta consenso entre ellos.
 *
 * Que fallen todos NO es una excepción: es un resultado. El anclaje queda
 * 'fallido' con el motivo escrito, y el siguiente intento vuelve a cubrir el
 * mismo tramo. Lanzar aquí dejaría la corrida sin rastro de por qué.
 */
export async function sellarRaiz(
  raiz: string,
  sellador: Sellador,
): Promise<ResultadoSellado> {
  const digest = hexABytes(raiz);

  let respuestas: RespuestaCalendario[];
  try {
    respuestas = await sellador.sellar(digest);
  } catch (e) {
    return {
      estado: 'fallido',
      ots: null,
      calendarios: [],
      detalle: `No se pudo llamar a ningún calendario: ${(e as Error).message}`,
    };
  }

  const sellaron = respuestas.filter((r) => r.ok && r.bytes?.length);
  if (sellaron.length === 0)
    return {
      estado: 'fallido',
      ots: null,
      calendarios: [],
      detalle:
        'Ningún calendario respondió. ' +
        respuestas.map((r) => `${r.calendario}: ${r.error ?? 'sin datos'}`).join('; '),
    };

  const fallaron = respuestas.filter((r) => !r.ok);
  return {
    estado: 'pendiente',
    ots: armarOts(digest, sellaron),
    calendarios: sellaron.map((r) => r.calendario),
    // Los que fallaron se anotan aunque el anclaje salga bien: si uno falla
    // siempre, es una señal, no un accidente.
    detalle: fallaron.length
      ? `Sin respuesta de ${fallaron.map((r) => r.calendario).join(', ')}.`
      : null,
  };
}
