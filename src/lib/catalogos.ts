/**
 * Catálogos del layout: parseo del archivo y tipos. Módulo puro.
 *
 * Lo que va en el informe es la CLAVE. La descripción es para quien captura.
 * Confundirlas produce un aviso que el portal rechaza, así que el parser exige
 * las dos y no adivina ninguna.
 */

export interface ValorCatalogo {
  clave: string;
  descripcion: string;
  orden?: number;
}

export interface EstadoCatalogo {
  codigo: string;
  nombre: string;
  layout: string;
  etiquetas_layout: string[];
  clave_patron: string | null;
  notas: string | null;
  version: number;
  actualizado_en: string | null;
  valores_vigentes: number;
}

/** Un catálogo registrado pero sin cargar. La UI tiene que decirlo, no mostrar
 *  una lista vacía sin explicación. */
export function estaCargado(c: Pick<EstadoCatalogo, 'valores_vigentes'>): boolean {
  return c.valores_vigentes > 0;
}

// =====================================================================
// Lectura del archivo
// =====================================================================

/** CSV con comillas, comillas escapadas y CRLF. Mismo criterio que el lector
 *  del 69-B: los archivos oficiales traen de todo. */
function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else enComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') {
      enComillas = true;
      continue;
    }
    if (c === ',' || c === ';' || c === '\t') {
      fila.push(campo);
      campo = '';
      continue;
    }
    if (c === '\r') continue;
    if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
      continue;
    }
    campo += c;
  }
  if (campo !== '' || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: string) => sinAcentos(s).trim().toLowerCase();

const ENCABEZADOS_CLAVE = ['clave', 'codigo', 'valor', 'id', 'c_clave'];
const ENCABEZADOS_DESCRIPCION = ['descripcion', 'nombre', 'texto', 'etiqueta', 'concepto'];

export interface ResultadoParseo {
  valores: ValorCatalogo[];
  /** Filas que se dejaron fuera y por qué. Se reportan: descartar en silencio
   *  es cómo se pierde media entidad federativa sin que nadie se entere. */
  descartadas: { fila: number; motivo: string }[];
  /** true si la primera fila se interpretó como encabezado. */
  conEncabezado: boolean;
}

/**
 * Lee un archivo de catálogo a pares clave/descripción.
 *
 * Acepta encabezado (`clave,descripcion` y sinónimos) o dos columnas a secas.
 * No reordena: el orden del archivo se conserva, porque el catálogo oficial
 * viene en el orden en que la UIF lo publica y alfabetizarlo por nuestra cuenta
 * cambiaría lo que ve quien captura.
 */
export function parsearCatalogo(texto: string): ResultadoParseo {
  const filas = leerCsv(texto).filter((f) => f.some((c) => c.trim() !== ''));
  const descartadas: { fila: number; motivo: string }[] = [];
  if (filas.length === 0) return { valores: [], descartadas, conEncabezado: false };

  let iClave = 0;
  let iDesc = 1;
  let conEncabezado = false;

  const primera = filas[0].map(norm);
  const posClave = primera.findIndex((c) => ENCABEZADOS_CLAVE.includes(c));
  const posDesc = primera.findIndex((c) => ENCABEZADOS_DESCRIPCION.includes(c));
  if (posClave >= 0 && posDesc >= 0) {
    iClave = posClave;
    iDesc = posDesc;
    conEncabezado = true;
  }

  const valores: ValorCatalogo[] = [];
  const vistas = new Set<string>();
  for (let i = conEncabezado ? 1 : 0; i < filas.length; i++) {
    const f = filas[i];
    const clave = (f[iClave] ?? '').trim();
    const descripcion = (f[iDesc] ?? '').trim();
    const numeroFila = i + 1;
    if (!clave) {
      descartadas.push({ fila: numeroFila, motivo: 'sin clave' });
      continue;
    }
    if (!descripcion) {
      descartadas.push({ fila: numeroFila, motivo: `la clave ${clave} viene sin descripción` });
      continue;
    }
    if (vistas.has(clave)) {
      descartadas.push({ fila: numeroFila, motivo: `la clave ${clave} está repetida` });
      continue;
    }
    vistas.add(clave);
    valores.push({ clave, descripcion, orden: valores.length + 1 });
  }
  return { valores, descartadas, conEncabezado };
}

/** Claves que no cumplen el patrón del catálogo. Se revisa antes de mandar la
 *  carga: el error de la base es correcto pero llega sin contexto de fila. */
export function clavesFueraDePatron(
  valores: ValorCatalogo[],
  patron: string | null,
): ValorCatalogo[] {
  if (!patron) return [];
  let re: RegExp;
  try {
    re = new RegExp(patron);
  } catch {
    return [];
  }
  return valores.filter((v) => !re.test(v.clave));
}
