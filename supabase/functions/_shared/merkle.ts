/**
 * Árbol Merkle sobre los eslabones de la bitácora. Módulo puro.
 *
 * Sirve para que UN valor de 32 bytes certifique miles de eventos. Eso es lo
 * que se publica en Bitcoin: ni un dato personal, ni un identificador de
 * cliente, ni siquiera cuántos eventos tiene nadie. Sólo la raíz.
 *
 * Y para que después se pueda demostrar que UN evento concreto estaba dentro
 * de esa raíz, sin enseñar los demás: eso es la ruta Merkle. Un auditor que
 * pregunta por un aviso recibe ese aviso y su ruta, no la bitácora entera de
 * la notaría.
 *
 * Vive en `_shared` porque lo usan las dos puntas —la Edge Function que ancla
 * y el verificador del navegador— y tener dos copias de esta aritmética es
 * tener dos raíces distintas el día que una se toque.
 *
 * Usa Web Crypto, que existe igual en Deno y en el navegador.
 */

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function bytesDeHex(h: string): Uint8Array {
  const limpio = h.trim().toLowerCase();
  if (!/^([0-9a-f]{2})+$/.test(limpio)) throw new Error(`No es hexadecimal: "${h}"`);
  const out = new Uint8Array(limpio.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(limpio.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Concatena los BYTES de dos hashes y los vuelve a hashear.
 *
 * Sobre los bytes y no sobre el texto hexadecimal: es lo que hacen Bitcoin y
 * OpenTimestamps, y hashear el texto daría una raíz distinta que ninguna
 * herramienta de fuera podría reproducir.
 */
async function hashPar(a: string, b: string): Promise<string> {
  const x = bytesDeHex(a);
  const y = bytesDeHex(b);
  const junto = new Uint8Array(x.length + y.length);
  junto.set(x, 0);
  junto.set(y, x.length);
  return hex(await crypto.subtle.digest('SHA-256', junto as unknown as ArrayBuffer));
}

/**
 * Raíz del árbol sobre `hojas`, en el orden dado. El orden es el de la
 * secuencia de la bitácora y no se ordena de nuevo: dos conjuntos con los
 * mismos eventos en distinto orden son dos historias distintas.
 *
 * Cuando un nivel tiene un número impar de nodos, el último **se sube tal
 * cual** en lugar de duplicarse. Duplicarlo es la falla CVE-2012-2459 de
 * Bitcoin: permite construir dos conjuntos de hojas distintos con la misma
 * raíz, y aquí eso significaría poder cambiar qué se certificó.
 */
export async function raizMerkle(hojas: string[]): Promise<string> {
  if (hojas.length === 0) throw new Error('No hay nada que anclar: el árbol necesita una hoja.');
  let nivel = hojas.map((h) => h.trim().toLowerCase());
  while (nivel.length > 1) {
    const siguiente: string[] = [];
    for (let i = 0; i < nivel.length; i += 2) {
      siguiente.push(i + 1 < nivel.length ? await hashPar(nivel[i], nivel[i + 1]) : nivel[i]);
    }
    nivel = siguiente;
  }
  return nivel[0];
}

/** Un paso de la ruta: el hermano y de qué lado va. */
export interface PasoMerkle {
  hermano: string;
  lado: 'izquierda' | 'derecha';
}

/**
 * La ruta que demuestra que la hoja `indice` está dentro de la raíz.
 *
 * Un nodo que subió solo (nivel impar) no aporta paso: no tuvo hermano con
 * quien hashearse.
 */
export async function rutaMerkle(hojas: string[], indice: number): Promise<PasoMerkle[]> {
  if (indice < 0 || indice >= hojas.length)
    throw new Error(`La hoja ${indice} no existe en un árbol de ${hojas.length}.`);

  const ruta: PasoMerkle[] = [];
  let nivel = hojas.map((h) => h.trim().toLowerCase());
  let i = indice;

  while (nivel.length > 1) {
    const siguiente: string[] = [];
    for (let j = 0; j < nivel.length; j += 2) {
      if (j + 1 < nivel.length) {
        siguiente.push(await hashPar(nivel[j], nivel[j + 1]));
        if (j === i) ruta.push({ hermano: nivel[j + 1], lado: 'derecha' });
        else if (j + 1 === i) ruta.push({ hermano: nivel[j], lado: 'izquierda' });
      } else {
        siguiente.push(nivel[j]);
      }
    }
    i = Math.floor(i / 2);
    nivel = siguiente;
  }
  return ruta;
}

/**
 * Rehace la raíz desde una hoja y su ruta. Es lo que corre el auditor: si el
 * resultado coincide con la raíz anclada en Bitcoin, ese evento existía con
 * esa forma exacta antes de ese bloque, y para comprobarlo no hizo falta
 * preguntarle nada a Ikán.
 */
export async function raizDesdeRuta(hoja: string, ruta: PasoMerkle[]): Promise<string> {
  let actual = hoja.trim().toLowerCase();
  for (const paso of ruta) {
    actual =
      paso.lado === 'derecha'
        ? await hashPar(actual, paso.hermano)
        : await hashPar(paso.hermano, actual);
  }
  return actual;
}
