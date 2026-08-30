/**
 * Cliente mínimo de OpenTimestamps.
 *
 * OpenTimestamps publica un hash en Bitcoin sin llave, sin saldo y sin token:
 * se le entrega el digest a uno o más "calendarios" públicos, ellos lo meten
 * en su propio árbol y estampan la raíz en una transacción. Unas horas después
 * se pide la prueba completa, que ya incluye la ruta hasta el bloque.
 *
 * Lo que se manda es un digest de 32 bytes. Ni un dato personal, ni un
 * identificador, ni cuántos eventos hay detrás.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PENDIENTE DE COMPROBAR EN VIVO
 * ═══════════════════════════════════════════════════════════════════════
 * El envío al calendario es una petición HTTP simple y no tiene misterio. El
 * ARMADO DEL ARCHIVO .ots sigue la especificación del formato, pero en esta
 * sesión no se pudo comprobar contra un calendario real: el proxy del entorno
 * bloquea *.opentimestamps.org. Antes del demo hay que verificar un `.ots`
 * generado por esto con la herramienta oficial (`ots verify`), y hasta
 * entonces la UI dice que el anclaje está sin comprobar en lugar de afirmar
 * que está certificado.
 *
 * Por eso `respuesta_cruda` se guarda TAL CUAL: si el armado resultara mal,
 * la prueba del calendario no se pierde y el archivo se rehace después. Lo
 * que no se puede rehacer es el estampado, y ese ya habría ocurrido.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** Calendarios públicos. Se manda a varios a propósito: si uno desaparece
 *  dentro de cinco años, la prueba de los otros sigue sirviendo. */
export const CALENDARIOS_POR_DEFECTO = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
  'https://finney.calendar.eternitywall.com',
];

export interface RespuestaCalendario {
  calendario: string;
  ok: boolean;
  /** Lo que devolvió el calendario, sin interpretar. */
  bytes?: Uint8Array;
  error?: string;
}

/**
 * Lo que la Edge Function necesita del mundo exterior, y nada más.
 *
 * Está aislado para poder probar toda la lógica del anclaje —elegir el tramo,
 * armar el árbol, guardar el resultado— sin depender de que un calendario
 * público responda, y para poder sustituirlo el día que se añada un ancla
 * espejo en L2.
 */
export interface Sellador {
  sellar(digest: Uint8Array): Promise<RespuestaCalendario[]>;
}

/**
 * El de verdad. `POST <calendario>/digest` con los 32 bytes en el cuerpo;
 * la respuesta es la parte de la prueba que el calendario ya puede dar.
 *
 * Falla suave por calendario: que uno no conteste no debe impedir que los
 * otros sellen. Sólo si fallan todos hay un anclaje fallido.
 */
export class SelladorHttp implements Sellador {
  constructor(
    private readonly calendarios: string[] = CALENDARIOS_POR_DEFECTO,
    private readonly tiempoLimiteMs = 15_000,
  ) {}

  async sellar(digest: Uint8Array): Promise<RespuestaCalendario[]> {
    if (digest.length !== 32) throw new Error('El digest de SHA-256 son 32 bytes.');

    return await Promise.all(
      this.calendarios.map(async (calendario): Promise<RespuestaCalendario> => {
        const corte = AbortSignal.timeout(this.tiempoLimiteMs);
        try {
          const r = await fetch(`${calendario}/digest`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/vnd.opentimestamps.v1',
              'User-Agent': 'ikan-anclaje/1.0',
            },
            body: digest as unknown as BodyInit,
            signal: corte,
          });
          if (!r.ok) return { calendario, ok: false, error: `HTTP ${r.status}` };
          return { calendario, ok: true, bytes: new Uint8Array(await r.arrayBuffer()) };
        } catch (e) {
          return { calendario, ok: false, error: (e as Error).message };
        }
      }),
    );
  }
}

/** Un sellador que no toca la red, para probar la lógica del anclaje. */
export class SelladorFalso implements Sellador {
  constructor(private readonly respuestas: RespuestaCalendario[]) {}
  sellar(): Promise<RespuestaCalendario[]> {
    return Promise.resolve(this.respuestas);
  }
}

// =====================================================================
// Formato del archivo .ots
// =====================================================================

/** Cabecera de un archivo de prueba separado, según la especificación. */
const MAGIC = new Uint8Array([
  0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73, 0x00,
  0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94,
]);

const VERSION = 1;
/** Etiqueta de la operación SHA-256 en la especificación. */
const OP_SHA256 = 0x08;
/** Separa varias ramas que salen del mismo punto. */
const BIFURCACION = 0xff;

/** Entero de longitud variable, como lo serializa el formato. */
function varint(n: number): Uint8Array {
  const out: number[] = [];
  let v = n;
  do {
    const b = v & 0x7f;
    v >>>= 7;
    out.push(v > 0 ? b | 0x80 : b);
  } while (v > 0);
  return new Uint8Array(out);
}

function concatenar(...partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

/**
 * Arma el `.ots` de un digest con lo que devolvieron los calendarios.
 *
 * Cada respuesta de calendario es ya una porción serializada de la prueba, así
 * que el archivo es: cabecera + versión + operación de hash + digest + las
 * porciones, separadas por el byte de bifurcación cuando hay más de una.
 *
 * NO verificado contra la herramienta oficial todavía: ver el aviso de arriba.
 */
export function armarOts(digest: Uint8Array, respuestas: RespuestaCalendario[]): Uint8Array {
  if (digest.length !== 32) throw new Error('El digest de SHA-256 son 32 bytes.');
  const porciones = respuestas.filter((r) => r.ok && r.bytes?.length).map((r) => r.bytes!);
  if (porciones.length === 0)
    throw new Error('Ningún calendario devolvió prueba: no hay archivo que armar.');

  const cuerpo: Uint8Array[] = [];
  // Una bifurcación por cada rama menos la última: el formato marca "sigue
  // otra rama desde aquí", y la última no lleva marca.
  porciones.forEach((p, i) => {
    if (i < porciones.length - 1) cuerpo.push(new Uint8Array([BIFURCACION]));
    cuerpo.push(p);
  });

  return concatenar(
    MAGIC,
    varint(VERSION),
    new Uint8Array([OP_SHA256]),
    digest,
    ...cuerpo,
  );
}

/** Sólo para pruebas y para el guardado: el varint del formato, expuesto. */
export const _internos = { varint, concatenar, MAGIC, OP_SHA256, BIFURCACION };
