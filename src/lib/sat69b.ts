/**
 * Parser de los listados del artículo 69-B del CFF — núcleo puro.
 *
 * Sin red ni base: recibe los bytes del archivo y devuelve registros
 * normalizados. Se prueba contra los archivos reales del SAT, que es lo único
 * que da confianza cuando el entorno de desarrollo no puede alcanzar la fuente.
 *
 * ---------------------------------------------------------------------
 * Lo que el SAT publica de verdad (verificado contra los 8 archivos)
 * ---------------------------------------------------------------------
 * · Se llaman `.xls` pero NO son Excel: son CSV en ISO-8859-1 (latin-1) con
 *   saltos CRLF. Leerlos como UTF-8 destroza los acentos, y los nombres de
 *   contribuyente están llenos de ellos.
 *
 * · Las tres primeras líneas no son datos: aviso legal, título con el
 *   artículo, y encabezado. El encabezado se localiza buscando la fila cuya
 *   primera celda es "No." o "No" — los listados por situación usan una y el
 *   listado completo la otra.
 *
 * · Los nombres traen comas dentro de comillas ("ASESORES Y ADMINISTRADORES
 *   AGRICOLAS, S. DE R.L. DE C.V."), así que partir por comas produce basura.
 *
 * · Son dos artículos DISTINTOS y no deben mezclarse:
 *     69-B      operaciones inexistentes (EFOS). Cuatro situaciones.
 *     69-B Bis  transmisión indebida de pérdidas fiscales. Sólo definitivo
 *               y sentencia favorable.
 *
 * · Las situaciones vienen con espacios sobrantes ("Desvirtuado ") y con
 *   acentos y mayúsculas variables.
 *
 * · Y lo que más cuesta ver: cada fila trae MUCHO más que RFC, nombre y
 *   situación. Trae el número y la fecha del oficio global de CADA etapa por
 *   la que pasó el contribuyente, y la fecha en que cada una se publicó, en la
 *   página del SAT y en el DOF. Son 20 columnas en el 69-B y 12 en el Bis.
 *
 *   Eso es lo que resuelve el caso de un RFC que aparece dos veces: no son dos
 *   versiones de lo mismo, son DOS PROCEDIMIENTOS distintos contra el mismo
 *   contribuyente, cada uno con su historia. El archivo no los ordena por
 *   fecha, así que quedarse con «el último renglón» da la respuesta equivocada
 *   —comprobado: en 37 de 77 casos, y 35 de ellos dejando fuera a un EFOS
 *   definitivo—. La posición de una fila en un archivo no es un hecho
 *   jurídico; la fecha de publicación sí.
 */

export type Situacion69B = 'presunto' | 'definitivo' | 'desvirtuado' | 'sentencia_favorable';
export type Articulo69B = '69-B' | '69-B Bis';

/** Qué tan avanzada está una etapa. Desempata a igualdad de fecha. */
export const ORDEN_ETAPA: Record<Situacion69B, number> = {
  presunto: 1,
  desvirtuado: 2,
  definitivo: 3,
  sentencia_favorable: 4,
};

export type EtapaOficio = {
  etapa: Situacion69B;
  /** Número y fecha del oficio global, tal como lo escribe el SAT. */
  oficio: string | null;
  /** Publicación en el DOF, en ISO. Es la que surte efectos. */
  dof: string | null;
  /** Publicación en la página del SAT, en ISO. Respaldo. */
  sat: string | null;
};

export interface Registro69B {
  rfc: string;
  nombre: string;
  situacion: Situacion69B;
  /** Fila del archivo. Se conserva como dato de procedencia, NO para decidir. */
  fila: number;
  /** El historial completo que trae esta fila, etapa por etapa. */
  etapas: EtapaOficio[];
  /**
   * La fecha que resuelve esta fila: la publicación de SU situación vigente.
   * DOF primero porque es la que surte efectos; la del SAT como respaldo.
   * Null cuando el archivo no la trae — y entonces NO se inventa un orden:
   * el caso se escala.
   */
  fechaSituacion: string | null;
  /** El oficio de esa misma etapa, para poder citarlo en el expediente. */
  oficioSituacion: string | null;
}

export interface Resultado69B {
  articulo: Articulo69B;
  /** Fecha declarada en la primera línea, en ISO. Es la de publicación de la
   *  FUENTE, no la de carga: es la que sirve de evidencia. */
  fechaActualizacion: string | null;
  registros: Registro69B[];
  /** Filas no interpretables, con su motivo. Nunca se descarta en silencio:
   *  si el SAT cambia el formato hay que enterarse. */
  descartadas: { fila: number; motivo: string; contenido: string }[];
}

const MESES: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

/** Quita acentos, pasa a minúsculas y colapsa separadores. */
function clave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const SITUACIONES: Record<string, Situacion69B> = {
  presunto: 'presunto',
  definitivo: 'definitivo',
  desvirtuado: 'desvirtuado',
  sentencia_favorable: 'sentencia_favorable',
};

/**
 * Lector de CSV mínimo pero correcto: respeta comillas, comillas escapadas
 * ("") y saltos dentro de campos. Sin librería porque esto corre también en
 * una Edge Function de Deno, donde cada dependencia es peso y superficie.
 */
export function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else enComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') enComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c === '\r') { /* CRLF: el \n cierra la fila */ }
    else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

/** Decodifica latin-1. El SAT no publica UTF-8; asumirlo rompe los acentos. */
export function decodificarSat(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new TextDecoder('iso-8859-1').decode(buf);
}

/** «Información actualizada al 31 de julio de 2026» → 2026-07-31 */
export function fechaDeAviso(linea: string): string | null {
  const m = linea.match(/actualizada al\s+(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})/i);
  if (!m) return null;
  const mes = MESES[clave(m[2])];
  if (!mes) return null;
  return `${m[3]}-${mes}-${m[1].padStart(2, '0')}`;
}

/** Forma de RFC moral (12) o física (13). No valida existencia ante el SAT. */
export function rfcValido(rfc: string): boolean {
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc.trim().toUpperCase());
}

/** «14/07/2021» → 2021-07-14. Devuelve null si no es una fecha del formato del SAT. */
export function fechaDePublicacion(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mes, a] = m;
  const dd = Number(d);
  const mm = Number(mes);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
  return `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Localiza, por etapa, sus cuatro columnas: oficio SAT, publicación SAT,
 * oficio DOF, publicación DOF.
 *
 * Se buscan POR NOMBRE y no por posición, porque los archivos no coinciden: el
 * completo del 69-B trae 20 columnas, el de presuntos 23 y el de sentencias 25
 * —con columnas vacías al final—, y el 69-B Bis 12 y en singular
 * («definitivo» en vez de «definitivos»). Amarrar índices rompería con el
 * siguiente archivo que el SAT publique con una columna de más.
 */
const PALABRA_ETAPA: Record<Situacion69B, RegExp> = {
  presunto: /presun/,
  desvirtuado: /desvirtu/,
  definitivo: /definitiv/,
  sentencia_favorable: /sentencia_favorable/,
};

interface ColumnasEtapa {
  oficioSat?: number;
  oficioDof?: number;
  pubSat?: number;
  pubDof?: number;
}

function ubicarEtapas(hdr: string[]): Partial<Record<Situacion69B, ColumnasEtapa>> {
  const salida: Partial<Record<Situacion69B, ColumnasEtapa>> = {};
  hdr.forEach((h, i) => {
    for (const etapa of Object.keys(PALABRA_ETAPA) as Situacion69B[]) {
      if (!PALABRA_ETAPA[etapa].test(h)) continue;
      // «desvirtuaron» aparece dentro del texto de la columna de definitivos
      // en ningún archivo, pero sí al revés: la de desvirtuados dice
      // «contribuyentes que desvirtuaron». La primera coincidencia manda.
      const c = (salida[etapa] ??= {});
      if (h.startsWith('publicacion')) {
        if (h.includes('dof')) c.pubDof ??= i;
        else c.pubSat ??= i;
      } else if (h.includes('oficio')) {
        if (h.includes('dof')) c.oficioDof ??= i;
        else c.oficioSat ??= i;
      }
      break;
    }
  });
  return salida;
}

export function parsear69B(bytes: ArrayBuffer | Uint8Array): Resultado69B {
  const filas = leerCsv(decodificarSat(bytes));

  // El artículo va en el título. Se busca "Bis" como palabra: "69-B Bis" y
  // "69-B" comparten prefijo, y confundirlos mezclaría dos artículos.
  const cabecera = filas.slice(0, 4).map((f) => f.join(' ')).join(' ');
  const articulo: Articulo69B = /69[-\s]?B\s+Bis/i.test(cabecera) ? '69-B Bis' : '69-B';

  const fechaActualizacion = fechaDeAviso(filas[0]?.[0] ?? '');

  const iHdr = filas.findIndex((f) => {
    const c = (f[0] ?? '').trim().toLowerCase();
    return c === 'no.' || c === 'no';
  });
  if (iHdr === -1) {
    throw new Error(
      'No se encontró la fila de encabezado (se busca una celda "No." o "No"). ' +
        '¿Cambió el formato del SAT, o el archivo no es un listado 69-B?',
    );
  }

  const hdr = filas[iHdr].map(clave);
  const iRfc = hdr.findIndex((h) => h === 'rfc');
  const iNombre = hdr.findIndex((h) => h.startsWith('nombre'));
  const iSit = hdr.findIndex((h) => h.startsWith('situacion'));
  if (iRfc === -1 || iNombre === -1 || iSit === -1) {
    throw new Error(
      `El encabezado no trae RFC, nombre y situación. Encontrado: ${filas[iHdr].join(' | ')}`,
    );
  }

  const columnas = ubicarEtapas(hdr);

  const registros: Registro69B[] = [];
  const descartadas: Resultado69B['descartadas'] = [];

  for (let i = iHdr + 1; i < filas.length; i++) {
    const f = filas[i];
    const numeroFila = i + 1;
    if (!f || f.every((c) => c.trim() === '')) continue;

    const rfc = (f[iRfc] ?? '').trim().toUpperCase();
    const nombre = (f[iNombre] ?? '').trim();
    const sitCruda = (f[iSit] ?? '').trim();
    if (!rfc && !nombre) continue;

    const resumen = f.slice(0, 4).join(', ');

    if (!rfcValido(rfc)) {
      descartadas.push({ fila: numeroFila, motivo: `RFC con forma inválida: "${rfc}"`, contenido: resumen });
      continue;
    }
    if (!nombre) {
      descartadas.push({ fila: numeroFila, motivo: 'Sin nombre de contribuyente', contenido: resumen });
      continue;
    }
    const situacion = SITUACIONES[clave(sitCruda)];
    if (!situacion) {
      descartadas.push({
        fila: numeroFila,
        motivo: `Situación desconocida: "${sitCruda}". Si el SAT agregó una, hay que darla de alta antes de ingerir.`,
        contenido: resumen,
      });
      continue;
    }

    // El historial que trae la fila. Cada etapa por la que pasó ESTE
    // procedimiento, con su oficio y sus dos fechas de publicación.
    const etapas: EtapaOficio[] = [];
    for (const etapa of Object.keys(ORDEN_ETAPA) as Situacion69B[]) {
      const c = columnas[etapa];
      if (!c) continue;
      const en = (j?: number) => (j === undefined ? '' : (f[j] ?? '').trim());
      const oficio = en(c.oficioDof) || en(c.oficioSat) || null;
      const dof = fechaDePublicacion(en(c.pubDof));
      const sat = fechaDePublicacion(en(c.pubSat));
      if (oficio || dof || sat) etapas.push({ etapa, oficio, dof, sat });
    }

    // La fecha que resuelve esta fila es la de SU situación vigente. El DOF
    // manda porque es la publicación que surte efectos; la del SAT es
    // respaldo. Si el archivo no trae ninguna, queda null y el caso se escala
    // más adelante: nunca se cae de vuelta a la posición en el archivo.
    const suya = etapas.find((e) => e.etapa === situacion);

    registros.push({
      rfc,
      nombre,
      situacion,
      fila: numeroFila,
      etapas,
      fechaSituacion: suya?.dof ?? suya?.sat ?? null,
      oficioSituacion: suya?.oficio ?? null,
    });
  }

  return { articulo, fechaActualizacion, registros, descartadas };
}
