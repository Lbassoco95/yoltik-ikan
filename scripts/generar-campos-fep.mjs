/**
 * Genera `src/lib/aviso/campos-fep.generated.ts` a partir del instructivo del
 * layout de fe pública que publica el SAT.
 *
 * Existe para que el diccionario de campos NO se transcriba a mano: 518 campos
 * copiados a ojo garantizan erratas, y una errata aquí es un aviso rechazado en
 * el portal. La fuente es `docs/layouts-sat/instructivo_fep_campos.csv`, que a
 * su vez salió del instructivo oficial.
 *
 * Uso:  node scripts/generar-campos-fep.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ORIGEN = 'docs/layouts-sat/instructivo_fep_campos.csv';
const DESTINO = 'src/lib/aviso/campos-fep.generated.ts';

/** Lector de CSV con comillas y comas dentro del campo. */
function leerCsv(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else { enComillas = false; }
      } else campo += c;
      continue;
    }
    if (c === '"') { enComillas = true; continue; }
    if (c === ',') { fila.push(campo); campo = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; continue; }
    campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

/**
 * El CSV trae el número de campo como texto, pero algunos llegaron desde una
 * hoja de cálculo convertidos a flotante: «2.2000000000000002» es el campo 2.2.
 * Se normaliza redondeando a un decimal cuando el número tiene un solo punto.
 */
function normalizarNo(raw) {
  const s = String(raw).trim();
  if (!/^\d+\.\d{6,}$/.test(s)) return s;
  return String(Math.round(Number(s) * 10) / 10);
}

/**
 * Nombre del catálogo de la UIF al que remite la regla de negocio, si remite.
 *
 * Algunas reglas citan «el catálogo provisto por la UIF» sin nombrarlo (p. ej.
 * <tipo_alerta>). Ahí el campo SÍ depende de un catálogo, sólo que el
 * instructivo no le pone nombre: se marca con el centinela para no perder esa
 * dependencia ni inventarle un nombre.
 */
export const CATALOGO_SIN_NOMBRE = 'catálogo de la UIF (sin nombre en el instructivo)';

function catalogoUif(reglas) {
  const m = reglas.match(/cat[áa]logo\s+(?:de\s+la\s+UIF\s+de\s+|de\s+la\s+UIF\s+|DE\s+)?([A-Za-zÁÉÍÓÚÑáéíóúñ\s]+?)(?:\s+provisto|\.|,)/i);
  if (!m) return /cat[áa]logo/i.test(reglas) ? CATALOGO_SIN_NOMBRE : null;
  const nombre = m[1].replace(/\s+/g, ' ').trim();
  if (nombre.length <= 2 || /^provisto/i.test(nombre)) return CATALOGO_SIN_NOMBRE;
  return nombre;
}

/**
 * ¿La etiqueta se repite? El instructivo lo dice en prosa —"Debe existir una
 * etiqueta <datos_apoderado> por cada apoderado"— y de ahí sale. Es lo que
 * separa un campo de una lista en la pantalla de captura.
 */
function esRepetible(reglas) {
  return /por cada|una o m[\u00e1a]s|tantas etiquetas/i.test(reglas ?? '');
}

/**
 * Cuándo es exigible un campo marcado "Obligatorio".
 *
 * El instructivo usa "Obligatorio" para tres cosas distintas y tratarlas igual
 * rompe el aviso por los dos lados: bloquear un campo que sólo aplica en un
 * caso hace imposible generar un XML válido; no bloquear ninguno deja pasar
 * archivos que el portal rechaza.
 *
 *   - `siempre`      — exigible en cuanto existe la etiqueta padre.
 *   - `condicional`  — "obligatorio si en <motivo_constitucion> se elige la
 *                      opción 1. Fusión". Depende de otro campo.
 *   - `si_aplica`    — "si se cuenta con la información" / "con los mismos".
 *                      El propio instructivo admite que puede no haberlo.
 *
 * Las dos últimas NO bloquean el aviso. La condición se guarda en prosa, tal
 * como está escrita: mapear "opción 1. Fusión" a una clave de catálogo sería
 * inventar, y quien decide si aplica es el fedatario, con la condición a la
 * vista.
 */
function obligatoriedadDe(obligatorio, reglas) {
  if (!obligatorio) return { grado: 'opcional', condicion: null };
  const r = reglas ?? '';
  if (/se cuenta con (la informaci[\u00f3o]n|los mismos)/i.test(r))
    return { grado: 'si_aplica', condicion: condicionEnProsa(r) };
  // "obligatorio si ... <campo> ..." con una referencia a otro campo: la
  // mención de la etiqueta padre no cuenta, esa es la regla normal.
  const m = r.match(/obligatori[oa][^.]*?\bsi\b([^.]*)/i);
  if (m) {
    const cond = m[1].replace(/existe la etiqueta <[^>]+>/gi, '');
    if (/<[^>]+>|se el[ii]j?[ge]|se escoje|el valor|la opci[\u00f3o]n|forma de pago/i.test(cond))
      return { grado: 'condicional', condicion: condicionEnProsa(r) };
  }
  if (/a excepci[\u00f3o]n de los casos/i.test(r))
    return { grado: 'condicional', condicion: condicionEnProsa(r) };
  return { grado: 'siempre', condicion: null };
}

/** La frase del instructivo que dice cuándo aplica, recortada a la oración. */
function condicionEnProsa(reglas) {
  const m = reglas.match(/(?:VXSD:\s*)?((?:El campo|La etiqueta)[^.]*?\bobligatori[oa]\b[^.]*(?:\.\d+)?[^.]*)\./i);
  const frase = (m ? m[1] : reglas.split('.')[0]).replace(/\s+/g, ' ').trim();

  // El instructivo prefija cada regla con su código de validación —VXSD,
  // VC22R1 y demás— y ese código acababa impreso en la pantalla del notario:
  // «VXSD: La longitud es de 13 caracteres». No le dice nada a nadie salvo a
  // quien tenga el instructivo delante.
  //
  // El regex de arriba ya lo quitaba, pero SÓLO cuando la frase empezaba por
  // «El campo» o «La etiqueta»; en cualquier otro caso caía al split y se
  // llevaba el prefijo entero. Se limpia aquí, sobre el resultado, que es
  // donde vale para todos los casos.
  return frase.replace(/^[A-Z]{2,}[0-9A-Z]*:\s*/, '').trim() || null;
}

const filas = leerCsv(readFileSync(ORIGEN, 'utf8'));
const encabezado = filas[0].map((h) => h.trim());
const idx = (nombre) => encabezado.indexOf(nombre);
const iNo = idx('NO.');
const iNombre = idx('NOMBRE DEL CAMPO');
const iEtiqueta = idx('ETIQUETA XML');
const iOblig = idx('OBLIGATORIEDAD');
const iTipo = idx('TIPO DE DATO');
const iLong = idx('LONGITUD');
const iFormato = idx('FORMATO');
const iReglas = idx('REGLAS DE NEGOCIO');

const campos = filas
  .slice(1)
  .filter((f) => f.length > iReglas && f[iNo].trim())
  .map((f) => ({
    no: normalizarNo(f[iNo]),
    nombre: f[iNombre].trim(),
    etiqueta: f[iEtiqueta].trim().replace(/^</, '').replace(/>$/, ''),
    obligatorio: /obligatorio/i.test(f[iOblig]),
    tipo: f[iTipo].trim(),
    longitud: f[iLong].trim(),
    formato: f[iFormato].trim(),
    catalogo: catalogoUif(f[iReglas] ?? ''),
    repetible: esRepetible(f[iReglas]),
    ...obligatoriedadDe(/obligatorio/i.test(f[iOblig]), f[iReglas] ?? ''),
  }));

const lit = (v) => (v === null ? 'null' : JSON.stringify(v));
const cuerpo = campos
  .map(
    (c) =>
      `  { no: ${lit(c.no)}, etiqueta: ${lit(c.etiqueta)}, nombre: ${lit(c.nombre)}, ` +
      `obligatorio: ${c.obligatorio}, tipo: ${lit(c.tipo)}, longitud: ${lit(c.longitud)}, ` +
      `formato: ${lit(c.formato)}, catalogo: ${lit(c.catalogo)}, repetible: ${c.repetible}, ` +
      `grado: ${lit(c.grado)}, condicion: ${lit(c.condicion)} },`,
  )
  .join('\n');

const salida = `/**
 * ARCHIVO GENERADO — no editar a mano.
 * Fuente: ${ORIGEN} (instructivo del layout de fe pública del SPPLD).
 * Regenerar con: node scripts/generar-campos-fep.mjs
 *
 * Es la transcripción fiel del instructivo: ${campos.length} campos. No añade,
 * quita ni reinterpreta ninguno. Las decisiones de producto (cuándo se captura
 * cada campo, cuáles ya guarda Ikán) viven en src/lib/aviso/completitud.ts.
 */

export interface CampoFep {
  /** Número del campo en el instructivo. Es la jerarquía: "3.6.1.3.2.11" cuelga de "3.6.1.3.2". */
  no: string;
  /** Etiqueta XML, sin los signos de mayor y menor. */
  etiqueta: string;
  nombre: string;
  obligatorio: boolean;
  /** "Etiqueta" = nodo contenedor; el resto son campos con valor. */
  tipo: string;
  longitud: string;
  formato: string;
  /** Catálogo de la UIF al que remite la regla de negocio. */
  catalogo: string | null;
  /** La etiqueta admite varias apariciones: "una <datos_apoderado> por cada
   *  apoderado". Es lo que separa un campo de una lista en la captura. */
  repetible: boolean;
  /**
   * Cuándo se exige. \`obligatorio\` dice qué columna trae el instructivo;
   * esto dice qué significa esa columna en cada caso:
   *   - \`siempre\`     — exigible en cuanto existe el padre. Bloquea el aviso.
   *   - \`condicional\` — depende de otro campo (ver \`condicion\`). No bloquea.
   *   - \`si_aplica\`   — "si se cuenta con la información". No bloquea.
   *   - \`opcional\`    — el instructivo no lo marca obligatorio.
   */
  grado: GradoObligatoriedad;
  /** La frase del instructivo que fija la condición, literal. Null si no hay. */
  condicion: string | null;
}

export type GradoObligatoriedad = 'siempre' | 'condicional' | 'si_aplica' | 'opcional';

export const CAMPOS_FEP: CampoFep[] = [
${cuerpo}
];
`;

writeFileSync(DESTINO, salida);
console.log(`${DESTINO}: ${campos.length} campos`);
