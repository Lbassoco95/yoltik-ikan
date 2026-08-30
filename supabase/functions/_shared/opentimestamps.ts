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
 * El armado del archivo se comprobó en producción el 30 de agosto de 2026 con
 * la herramienta oficial: `ots info` lee el `.ots` que genera esto, su digest
 * es exactamente la raíz Merkle anclada y trae las atestiguaciones pendientes
 * de los cuatro calendarios.
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

// =====================================================================
// Lectura del .ots y actualización de la prueba
// =====================================================================
//
// Un anclaje nace `pendiente`: el calendario recibió la raíz en segundos, pero
// Bitcoin tarda horas en confirmarla. Pasar a `confirmado` es pedirle al
// calendario la prueba completa —la que ya incluye la ruta hasta un bloque— y
// sustituir con ella la promesa que había.
//
// Para eso hay que LEER el archivo: cada rama es una cadena de operaciones que
// transforman el digest, y lo que el calendario espera recibir es el resultado
// de aplicarlas todas. Ese valor no está escrito en ningún lado; se calcula.

/** Etiquetas de operación del formato. */
const OP_APPEND = 0xf0;
const OP_PREPEND = 0xf1;
const OP_REVERSE = 0x02;
const OP_HEXLIFY = 0x03;
const OP_RIPEMD160 = 0x67;
const OP_KECCAK256 = 0x63;
/** Sigue una atestiguación, no una operación. */
const ATESTIGUACION = 0x00;

const TAG_PENDIENTE = [0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e];
const TAG_BITCOIN = [0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01];

/** Una promesa de calendario dentro del archivo, con dónde vive en bytes. */
export interface RamaPendiente {
  /** A quién pedirle la prueba completa. */
  uri: string;
  /**
   * El valor que el calendario conoce: el digest después de aplicar todas las
   * operaciones de esta rama. Null si la rama usa una operación que no se sabe
   * calcular aquí —entonces esa rama no se actualiza, y se dice.
   */
  commitment: string | null;
  /** Desde el byte de la etiqueta 0x00 hasta el final de la atestiguación.
   *  Es exactamente lo que se sustituye por la respuesta del calendario. */
  desde: number;
  hasta: number;
}

export interface LecturaOts {
  /** El digest del archivo: tiene que ser la raíz Merkle anclada. */
  digest: string;
  pendientes: RamaPendiente[];
  /** Alturas de bloque de Bitcoin ya presentes. Vacío mientras esté pendiente. */
  bloques: number[];
}

class Lector {
  pos = 0;
  constructor(readonly b: Uint8Array) {}

  byte(): number {
    if (this.pos >= this.b.length) throw new Error('El archivo .ots se corta antes de tiempo.');
    return this.b[this.pos++];
  }

  bytes(n: number): Uint8Array {
    if (this.pos + n > this.b.length) throw new Error('El archivo .ots se corta antes de tiempo.');
    const out = this.b.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  varuint(): number {
    let valor = 0;
    let corrimiento = 0;
    for (;;) {
      const b = this.byte();
      valor |= (b & 0x7f) << corrimiento;
      if ((b & 0x80) === 0) return valor;
      corrimiento += 7;
      if (corrimiento > 35) throw new Error('Entero variable fuera de rango en el .ots.');
    }
  }

  /** Longitud seguida de contenido. */
  varbytes(): Uint8Array {
    return this.bytes(this.varuint());
  }
}

const aHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

async function sha256(m: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', m as unknown as ArrayBuffer));
}

/**
 * Lee el archivo y devuelve qué ramas siguen pendientes y qué bloques hay.
 *
 * Recorre el árbol calculando el mensaje de cada rama sobre la marcha, que es
 * lo que el calendario necesita recibir para devolver la prueba completa.
 *
 * Las operaciones RIPEMD-160 y KECCAK-256 existen en el formato y no están en
 * Web Crypto. No se inventan: la rama se lee igual —la estructura sí se puede
 * recorrer— pero su `commitment` queda en null y esa rama no se actualiza. Es
 * preferible dejar una rama sin actualizar a mandarle al calendario un valor
 * calculado a ojo.
 */
export async function leerOts(archivo: Uint8Array): Promise<LecturaOts> {
  const r = new Lector(archivo);

  const magia = r.bytes(MAGIC.length);
  if (magia.some((b, i) => b !== MAGIC[i]))
    throw new Error('Esto no es un archivo .ots: la cabecera no corresponde.');

  const version = r.varuint();
  if (version !== VERSION)
    throw new Error(`El .ots es de la versión ${version} y aquí sólo se lee la ${VERSION}.`);

  const opHash = r.byte();
  if (opHash !== OP_SHA256)
    throw new Error(`El .ots usa la función de hash ${opHash}, no SHA-256.`);

  const digest = r.bytes(32);
  const pendientes: RamaPendiente[] = [];
  const bloques: number[] = [];

  await recorrer(r, digest, pendientes, bloques);

  return { digest: aHex(digest), pendientes, bloques };
}

/**
 * Un nivel del árbol. El byte 0xff dice "después de esta rama viene otra desde
 * el mismo punto"; la última no lo lleva.
 */
async function recorrer(
  r: Lector,
  mensaje: Uint8Array | null,
  pendientes: RamaPendiente[],
  bloques: number[],
): Promise<void> {
  let tag = r.byte();
  while (tag === BIFURCACION) {
    await unaRama(r, r.byte(), mensaje, pendientes, bloques);
    tag = r.byte();
  }
  await unaRama(r, tag, mensaje, pendientes, bloques);
}

async function unaRama(
  r: Lector,
  tag: number,
  mensaje: Uint8Array | null,
  pendientes: RamaPendiente[],
  bloques: number[],
): Promise<void> {
  if (tag === ATESTIGUACION) {
    // La etiqueta 0x00 empieza un byte antes de donde estamos.
    const desde = r.pos - 1;
    const tipo = r.bytes(8);
    const carga = r.varbytes();

    if (TAG_PENDIENTE.every((b, i) => b === tipo[i])) {
      const interno = new Lector(carga);
      pendientes.push({
        uri: new TextDecoder().decode(interno.varbytes()),
        commitment: mensaje ? aHex(mensaje) : null,
        desde,
        hasta: r.pos,
      });
    } else if (TAG_BITCOIN.every((b, i) => b === tipo[i])) {
      bloques.push(new Lector(carga).varuint());
    }
    // Cualquier otra atestiguación se lee y se ignora: el formato admite más
    // de las que aquí interesan, y no reconocerlas no es motivo para fallar.
    return;
  }

  const siguiente = mensaje === null ? null : await aplicar(r, tag, mensaje);
  await recorrer(r, siguiente, pendientes, bloques);
}

/** Aplica la operación al mensaje. Null cuando no se sabe calcularla. */
async function aplicar(r: Lector, tag: number, m: Uint8Array): Promise<Uint8Array | null> {
  switch (tag) {
    case OP_APPEND:
      return concatenar(m, r.varbytes());
    case OP_PREPEND:
      return concatenar(r.varbytes(), m);
    case OP_REVERSE:
      return m.slice().reverse();
    case OP_HEXLIFY:
      return new TextEncoder().encode(aHex(m));
    case OP_SHA256:
      return await sha256(m);
    case OP_RIPEMD160:
    case OP_KECCAK256:
      // Existen en el formato y no están en Web Crypto. Se sigue recorriendo
      // la estructura, pero sin poder calcular el mensaje de esta rama.
      return null;
    default:
      throw new Error(`Operación desconocida 0x${tag.toString(16)} en el .ots.`);
  }
}

/**
 * Sustituye la promesa de una rama por la prueba que devolvió el calendario.
 *
 * Se hace a nivel de bytes y no volviendo a serializar el árbol: lo que ocupa
 * la promesa —la etiqueta 0x00 y su atestiguación— es exactamente el sitio
 * donde encaja lo que el calendario manda, que ya es una prueba serializada
 * para ese mismo mensaje. Reescribir el archivo entero sería reintroducir el
 * riesgo del armado en algo que ya está validado.
 *
 * Los reemplazos se aplican de atrás hacia adelante para que los
 * desplazamientos de los anteriores sigan siendo válidos.
 */
export function sustituirPendientes(
  archivo: Uint8Array,
  reemplazos: { desde: number; hasta: number; prueba: Uint8Array }[],
): Uint8Array {
  if (reemplazos.length === 0) return archivo;

  const ordenados = [...reemplazos].sort((a, b) => b.desde - a.desde);
  for (const x of ordenados) {
    if (x.desde < 0 || x.hasta > archivo.length || x.desde >= x.hasta)
      throw new Error('El reemplazo cae fuera del archivo .ots.');
  }
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].hasta > ordenados[i - 1].desde)
      throw new Error('Dos reemplazos se pisan dentro del .ots.');
  }

  let out = archivo;
  for (const x of ordenados) {
    out = concatenar(out.slice(0, x.desde), x.prueba, out.slice(x.hasta));
  }
  return out;
}

/** Lo que hace falta del mundo exterior para actualizar una prueba. */
export interface Actualizador {
  actualizar(uri: string, commitment: string): Promise<Uint8Array | null>;
}

/**
 * El de verdad: `GET <calendario>/timestamp/<commitment>`.
 *
 * Devuelve null cuando el calendario todavía no tiene la prueba completa —lo
 * normal las primeras horas—, que NO es un error: el anclaje sigue pendiente y
 * se vuelve a intentar mañana.
 */
export class ActualizadorHttp implements Actualizador {
  constructor(private readonly tiempoLimiteMs = 15_000) {}

  async actualizar(uri: string, commitment: string): Promise<Uint8Array | null> {
    const r = await fetch(`${uri}/timestamp/${commitment}`, {
      headers: {
        Accept: 'application/vnd.opentimestamps.v1',
        'User-Agent': 'ikan-anclaje/1.0',
      },
      signal: AbortSignal.timeout(this.tiempoLimiteMs),
    });
    // 404 mientras Bitcoin no confirme: es el caso normal, no un fallo.
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status} al pedir la prueba a ${uri}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    return bytes.length ? bytes : null;
  }
}

/** Sólo para pruebas y para el guardado: el varint del formato, expuesto. */
export const _internos = {
  varint,
  concatenar,
  MAGIC,
  OP_SHA256,
  BIFURCACION,
  TAG_PENDIENTE,
  TAG_BITCOIN,
  ATESTIGUACION,
};
