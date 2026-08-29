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
  }));

const lit = (v) => (v === null ? 'null' : JSON.stringify(v));
const cuerpo = campos
  .map(
    (c) =>
      `  { no: ${lit(c.no)}, etiqueta: ${lit(c.etiqueta)}, nombre: ${lit(c.nombre)}, ` +
      `obligatorio: ${c.obligatorio}, tipo: ${lit(c.tipo)}, longitud: ${lit(c.longitud)}, ` +
      `formato: ${lit(c.formato)}, catalogo: ${lit(c.catalogo)} },`,
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
  /** Catálogo de la UIF al que remite la regla de negocio. Ikán todavía no los
   *  tiene cargados: ver src/lib/aviso/completitud.ts. */
  catalogo: string | null;
}

export const CAMPOS_FEP: CampoFep[] = [
${cuerpo}
];
`;

writeFileSync(DESTINO, salida);
console.log(`${DESTINO}: ${campos.length} campos`);
