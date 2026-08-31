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
  leerOts,
  sustituirPendientes,
  type Actualizador,
  type RespuestaCalendario,
  type Sellador,
} from '../_shared/opentimestamps.ts';

export type MotivoAnclaje = 'diario' | 'cierre_periodo' | 'manual';

const MOTIVOS: MotivoAnclaje[] = ['diario', 'cierre_periodo', 'manual'];

/**
 * El motivo que la base acepta, salga de donde salga la llamada.
 *
 * La tabla sólo admite esos tres, y un motivo desconocido hace fallar el
 * insert entero: el anclaje no ocurre y la respuesta sigue siendo 200. Eso ya
 * pasó —el cron se programó mandando 'cron'— y es la peor forma de fallar,
 * porque nadie se entera hasta que alguien mira la tabla semanas después.
 *
 * Anclar importa más que la etiqueta, así que lo desconocido cae en 'diario',
 * que es lo que en la práctica es una corrida automática. Lo que mandó quien
 * llamó queda escrito en `detalle`, para que sea visible y no silencioso.
 */
export function motivoValido(motivo: unknown): {
  motivo: MotivoAnclaje;
  aviso: string | null;
} {
  const m = String(motivo ?? '').trim();
  if ((MOTIVOS as string[]).includes(m)) return { motivo: m as MotivoAnclaje, aviso: null };
  return {
    motivo: 'diario',
    aviso: m
      ? `Quien llamó mandó motivo "${m}", que la tabla no admite; se ancló como 'diario'.`
      : null,
  };
}

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

// =====================================================================
// De pendiente a confirmado
// =====================================================================

export interface ResultadoActualizacion {
  /** El archivo con las promesas ya sustituidas por la prueba completa.
   *  Null si no cambió nada. */
  ots: Uint8Array | null;
  /** Altura del bloque de Bitcoin, cuando la prueba ya llega hasta él. */
  bloque: number | null;
  confirmado: boolean;
  detalle: string | null;
}

/**
 * Pide a los calendarios la prueba completa y, si ya la tienen, la incorpora.
 *
 * Que un calendario conteste 404 es lo NORMAL las primeras horas: Bitcoin no
 * ha confirmado. No es un fallo y el anclaje se queda pendiente hasta mañana.
 *
 * Sólo se declara confirmado cuando la prueba llega de verdad hasta un bloque.
 * Un archivo con más operaciones pero sin atestiguación de Bitcoin sigue siendo
 * una promesa más larga, no una certificación, y decir lo contrario sería
 * exactamente la exageración que este bloque existe para no cometer.
 */
export async function actualizarPrueba(
  archivo: Uint8Array,
  actualizador: Actualizador,
): Promise<ResultadoActualizacion> {
  const lectura = await leerOts(archivo);

  if (lectura.bloques.length > 0)
    return {
      ots: null,
      bloque: Math.min(...lectura.bloques),
      confirmado: true,
      detalle: 'La prueba ya llegaba a un bloque: no hizo falta pedir nada.',
    };

  const sinCalcular = lectura.pendientes.filter((p) => p.commitment === null);
  const reemplazos: { desde: number; hasta: number; prueba: Uint8Array }[] = [];
  const fallos: string[] = [];

  // Dos ramas distintas pueden converger en el mismo par (calendario,
  // commitment): pasó en el primer anclaje real, donde `a.pool.eternitywall`
  // y `finney.calendar.eternitywall` son el mismo calendario y sus dos pruebas
  // se encuentran en el mismo nodo. Sin agrupar, se le pediría dos veces lo
  // mismo —y con cuatro calendarios eso es tráfico y riesgo de tope de
  // peticiones a cambio de nada.
  const porPeticion = new Map<string, typeof lectura.pendientes>();
  for (const rama of lectura.pendientes) {
    if (rama.commitment === null) continue;
    const llave = `${rama.uri}|${rama.commitment}`;
    const grupo = porPeticion.get(llave);
    if (grupo) grupo.push(rama);
    else porPeticion.set(llave, [rama]);
  }

  for (const grupo of porPeticion.values()) {
    const { uri, commitment } = grupo[0];
    try {
      const prueba = await actualizador.actualizar(uri, commitment!);
      if (prueba)
        for (const rama of grupo)
          reemplazos.push({ desde: rama.desde, hasta: rama.hasta, prueba });
    } catch (e) {
      // Que un calendario falle no debe impedir aprovechar a los otros.
      fallos.push(`${uri}: ${(e as Error).message}`);
    }
  }

  const notas = [
    sinCalcular.length
      ? `${sinCalcular.length} rama(s) usan una operación que no se sabe calcular aquí y no se ` +
        'actualizaron.'
      : null,
    fallos.length ? `Sin respuesta de ${fallos.join('; ')}.` : null,
  ].filter(Boolean);

  if (reemplazos.length === 0)
    return {
      ots: null,
      bloque: null,
      confirmado: false,
      detalle:
        [
          'Ningún calendario tiene todavía la prueba completa: Bitcoin no ha confirmado.',
          ...notas,
        ].join(' ') || null,
    };

  const nuevo = sustituirPendientes(archivo, reemplazos);

  // Se vuelve a leer lo que quedó, en vez de confiar en que lo mandado por el
  // calendario es lo que decimos que es. Si el archivo nuevo no se puede leer,
  // NO se guarda: es preferible seguir pendiente con una prueba válida que
  // confirmado con una rota.
  let releido;
  try {
    releido = await leerOts(nuevo);
  } catch (e) {
    return {
      ots: null,
      bloque: null,
      confirmado: false,
      detalle: `El calendario devolvió algo que no se puede leer, no se guardó: ${(e as Error).message}`,
    };
  }

  if (releido.digest !== lectura.digest)
    return {
      ots: null,
      bloque: null,
      confirmado: false,
      detalle: 'La actualización cambiaría el digest anclado: se descarta.',
    };

  return {
    ots: nuevo,
    bloque: releido.bloques.length ? Math.min(...releido.bloques) : null,
    confirmado: releido.bloques.length > 0,
    detalle:
      [
        releido.bloques.length
          ? null
          : 'La prueba creció pero todavía no llega a un bloque: sigue pendiente.',
        ...notas,
      ]
        .filter(Boolean)
        .join(' ') || null,
  };
}

// =====================================================================
// Conversión con la columna `bytea`
// =====================================================================
// Vive aquí y no en el archivo de la función porque aquí SÍ se prueba: el
// archivo de la función se desplegó una vez con `deBytea` usada y nunca
// definida, y no lo cazó nadie hasta producción.

/** Postgres recibe bytea como cadena hexadecimal con prefijo \x. */
export function bytea(bytes: Uint8Array): string {
  return '\\x' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Y lo devuelve igual. Se valida antes de convertir: un `parseInt` sobre
 *  basura devuelve NaN en silencio, y un NaN dentro de un Uint8Array se
 *  guarda como cero — un .ots corrompido sin una sola señal de error. */
export function deBytea(hex: string): Uint8Array {
  const limpio = String(hex ?? '').startsWith('\\x') ? hex.slice(2) : String(hex ?? '');
  if (limpio.length === 0 || !/^([0-9a-fA-F]{2})+$/.test(limpio))
    throw new Error('La columna ots no trae bytea en hexadecimal.');
  const out = new Uint8Array(limpio.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(limpio.slice(i * 2, i * 2 + 2), 16);
  return out;
}
