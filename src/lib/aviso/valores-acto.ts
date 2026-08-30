/**
 * Cómo se guardan en `operation.datos_acto` los valores del subárbol del acto.
 *
 * El problema que resuelve: el layout repite la misma etiqueta por todas
 * partes. Hay un <rfc> del poderdante, otro del apoderado, otro del accionista;
 * y de apoderados puede haber tres. Guardar por etiqueta los pisa entre sí —y
 * el aviso saldría con el RFC del poderdante en el lugar del apoderado, que es
 * peor que no salir.
 *
 * Así que la clave es el NÚMERO del instructivo más la ruta de repeticiones:
 *
 *     "3.6.1.3.1.2.2.1.5"        RFC del apoderado, cuando hay uno solo
 *     "3.6.1.3.1.2.2.1.5@1"      RFC del segundo apoderado
 *     "3.6.1.3.6.2.7.2.1.5@0.2"  RFC del tercer vendedor de la primera
 *                                persona moral: hay repetibles anidados
 *
 * La ruta lleva un índice por cada nodo repetible que está por encima del
 * campo, en orden. Dos sufijos más, con almohadilla para que nunca choquen con
 * un número del instructivo:
 *
 *     "<clave>#n"      cuántas repeticiones tiene ese grupo
 *     "<clave>#tipo"   cuál de las tres variantes de <tipo_persona> se eligió
 *
 * Módulo puro.
 */

import type { NodoRama } from './ramas-acto';

export type DatosActo = Record<string, unknown>;

/** Clave de un valor. `ruta` lleva un índice por repetible ancestro. */
export function claveDato(no: string, ruta: number[] = []): string {
  return ruta.length ? `${no}@${ruta.join('.')}` : no;
}

/** Clave donde vive el número de repeticiones de un grupo. */
export function claveConteo(no: string, ruta: number[] = []): string {
  return `${claveDato(no, ruta)}#n`;
}

/** Clave donde vive la variante elegida de un <tipo_persona>. */
export function claveVariante(no: string, ruta: number[] = []): string {
  return `${claveDato(no, ruta)}#tipo`;
}

interface ClavePartida {
  no: string;
  ruta: number[];
  sufijo: string | null;
}

/** Descompone una clave en sus tres partes. Null si no tiene forma de clave. */
export function partirClave(clave: string): ClavePartida | null {
  const m = clave.match(/^([0-9.A-Z]+)(?:@([\d.]+))?(?:#(\w+))?$/);
  if (!m) return null;
  return {
    no: m[1],
    ruta: m[2] ? m[2].split('.').map(Number) : [],
    sufijo: m[3] ?? null,
  };
}

// =====================================================================
// Lectura y escritura de un valor
// =====================================================================

export function leerValor(datos: DatosActo, no: string, ruta: number[] = []): string {
  const v = datos?.[claveDato(no, ruta)];
  return v == null ? '' : String(v);
}

/** Devuelve una copia. Un valor vacío borra la clave en lugar de guardar "":
 *  así `datos_acto` no acumula basura y "no capturado" es una sola cosa. */
export function escribirValor(
  datos: DatosActo,
  no: string,
  ruta: number[],
  valor: string,
): DatosActo {
  const out = { ...datos };
  const clave = claveDato(no, ruta);
  if (String(valor ?? '').trim() === '') delete out[clave];
  else out[clave] = valor;
  return out;
}

// =====================================================================
// Variante de <tipo_persona>
// =====================================================================

/** Física, moral o fideicomiso. Null mientras no se elija. */
export function leerVariante(datos: DatosActo, no: string, ruta: number[] = []): string | null {
  const v = datos?.[claveVariante(no, ruta)];
  return v == null || v === '' ? null : String(v);
}

/**
 * Cambiar de variante borra lo capturado en la anterior. Si no, el XML llevaría
 * una persona física a medias escondida bajo una moral, y el portal la
 * rechazaría sin decir por qué.
 *
 * El borrado va acotado a ESTA repetición: el primer apoderado y el segundo
 * comparten la numeración del instructivo y sólo los distingue la ruta, así
 * que borrar por número a secas se llevaría por delante al otro apoderado.
 */
export function escribirVariante(
  datos: DatosActo,
  nodo: NodoRama,
  ruta: number[],
  variante: string,
): DatosActo {
  const out: DatosActo = {};
  const descartadas = nodo.hijos.filter((h) => h.etiqueta !== variante).map((h) => h.no);
  for (const [k, v] of Object.entries(datos)) {
    const p = partirClave(k);
    const deLaVariante =
      p &&
      descartadas.some((d) => p.no === d || p.no.startsWith(d + '.')) &&
      ruta.every((r, i) => p.ruta[i] === r);
    if (!deLaVariante) out[k] = v;
  }
  out[claveVariante(nodo.no, ruta)] = variante;
  return out;
}

// =====================================================================
// Repeticiones
// =====================================================================

/** Cuántas veces aparece el grupo. Siempre al menos una: un poder sin ningún
 *  apoderado no es un poder, y una lista vacía no se puede llenar. */
export function numeroRepeticiones(datos: DatosActo, no: string, ruta: number[] = []): number {
  const v = Number(datos?.[claveConteo(no, ruta)]);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1;
}

export function agregarRepeticion(datos: DatosActo, no: string, ruta: number[] = []): DatosActo {
  return { ...datos, [claveConteo(no, ruta)]: numeroRepeticiones(datos, no, ruta) + 1 };
}

/**
 * Quita la repetición `indice` del grupo y RENUMERA las siguientes.
 *
 * Renumerar no es cosmético: si se borra el apoderado 1 de 3 y el 2 se queda en
 * el índice 2, la captura muestra dos apoderados y el XML lleva un hueco. Se
 * borra lo del índice, se baja un escalón todo lo que estaba por encima, y se
 * decrementa el conteo. Nunca baja de una repetición.
 */
export function quitarRepeticion(
  datos: DatosActo,
  no: string,
  ruta: number[],
  indice: number,
): DatosActo {
  const total = numeroRepeticiones(datos, no, ruta);
  if (total <= 1) return datos;

  const nivel = ruta.length;
  const prefijo = no + '.';
  const out: DatosActo = {};

  for (const [k, v] of Object.entries(datos)) {
    const p = partirClave(k);
    // Lo que no cuelga de este grupo se queda intacto.
    if (!p || !(p.no === no || p.no.startsWith(prefijo)) || p.ruta.length <= nivel) {
      out[k] = v;
      continue;
    }
    // Tampoco toca a otra rama hermana con la misma numeración.
    if (ruta.some((r, i) => p.ruta[i] !== r)) {
      out[k] = v;
      continue;
    }
    const propio = p.ruta[nivel];
    if (propio === indice) continue; // se va con la repetición borrada
    const nuevaRuta = [...p.ruta];
    if (propio > indice) nuevaRuta[nivel] = propio - 1;
    out[claveDato(p.no, nuevaRuta) + (p.sufijo ? `#${p.sufijo}` : '')] = v;
  }

  out[claveConteo(no, ruta)] = total - 1;
  return out;
}
