import { TIPOS_ACTO_NOTARIA } from '@/lib/perfil-actividad';

/**
 * Los supuestos del artículo 17 fracción XII, con su riesgo base.
 *
 * Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 1 del 31/08/2026,
 * apartado 2.2. La asignación de riesgo por tipo de acto es METODOLOGÍA PROPIA
 * de Kawiil, no clasificación oficial: es defendible mientras esté documentada,
 * fundada y versionada conforme al Capítulo II Quáter de las RCG, y deja de
 * serlo si se aplica sin ese respaldo escrito. La reserva es de ellos y se
 * copia aquí para que no se pierda al leer sólo el código.
 *
 * ---------------------------------------------------------------------
 * Por qué una clave de texto y no una posición
 * ---------------------------------------------------------------------
 * La matriz guardaba el valor de riesgo como POSICIÓN en un arreglo de cuatro
 * opciones. Al pasar el catálogo a once, el poder irrevocable ocupó la posición
 * que antes tenía el fideicomiso, y el disparador de fideicomiso empezó a
 * saltar sobre poderes. No falla: responde mal, que en una matriz de riesgo es
 * peor.
 *
 * La clave reproduce la estructura legal —fracción, apartado, inciso— para que
 * un auditor la lea sin diccionario, y no cambia aunque el catálogo se
 * reordene, crezca o se traduzca.
 *
 * ---------------------------------------------------------------------
 * La correspondencia NO es uno a uno, y eso importa
 * ---------------------------------------------------------------------
 * El catálogo del layout del SAT tiene once TIPOS DE ACTO; el artículo tiene
 * once SUPUESTOS. No son la misma lista. El inciso XII.A.c agrupa cinco tipos
 * de acto —constitución, modificación patrimonial, fusión, escisión y
 * compraventa de acciones— bajo un solo supuesto y un solo riesgo base.
 *
 * Por eso el riesgo se asigna al SUPUESTO y cada tipo de acto apunta al suyo.
 * Asignarlo directamente al tipo de acto obligaría a repetir el mismo valor en
 * cinco sitios y a que se desincronizaran a la primera corrección.
 */

/** Riesgo base del supuesto, en la escala de la matriz. */
export type NivelRiesgoActo = 1 | 2 | 3 | 4;

export interface SupuestoXII {
  /** Clave estable. Fracción, apartado e inciso del artículo 17. */
  clave: string;
  /** El supuesto, con las palabras del artículo. */
  descripcion: string;
  riesgo_base: NivelRiesgoActo;
  /**
   * Entra con un piso en la banda alta, con independencia del resto de las
   * variables (Adenda 1, apartado 2.4).
   *
   * NO significa que el cliente quede clasificado como de alto riesgo de forma
   * indefinida: el riesgo de la OPERACIÓN y el del CLIENTE son cosas distintas,
   * y el segundo se reevalúa cada semestre por el Capítulo III Bis.
   */
  alto_de_oficio: boolean;
  /**
   * Código del umbral de Aviso en `parametro_regulatorio`, o null cuando el
   * Aviso procede siempre. Null no es un hueco: es la respuesta.
   *
   * Se guarda el CÓDIGO, no la cifra. Una cifra aquí sería el mismo error que
   * la 0030 vino a matar en otro sitio.
   */
  umbral_codigo: string | null;
}

/**
 * Los once supuestos. Tabla del apartado 2.2 de la Adenda 1, literal.
 *
 * PENDIENTES DE CONFIRMACIÓN, y no se resuelven aquí porque serían criterio
 * inventado. Están marcados en `SUPUESTOS_POR_CONFIRMAR` más abajo.
 */
export const SUPUESTOS_XII: SupuestoXII[] = [
  { clave: 'XII.A.a', riesgo_base: 3, alto_de_oficio: false,
    umbral_codigo: 'umbral_xii_inmueble_uma',
    descripcion: 'Transmisión o constitución de derechos reales sobre inmuebles ante notario' },

  { clave: 'XII.A.b', riesgo_base: 4, alto_de_oficio: true, umbral_codigo: null,
    descripcion: 'Otorgamiento de poderes para actos de administración o dominio con carácter irrevocable' },

  { clave: 'XII.A.c', riesgo_base: 3, alto_de_oficio: false, umbral_codigo: null,
    descripcion: 'Constitución de personas morales, aumento o disminución de capital, fusión, escisión y compraventa de acciones y partes sociales' },

  { clave: 'XII.A.d', riesgo_base: 4, alto_de_oficio: true,
    umbral_codigo: 'umbral_xii_fideicomiso_uma',
    descripcion: 'Constitución o modificación de fideicomisos traslativos de dominio o de garantía' },

  { clave: 'XII.A.e', riesgo_base: 4, alto_de_oficio: true, umbral_codigo: null,
    descripcion: 'Mutuo o crédito en el que el acreedor no forma parte del sistema financiero' },

  { clave: 'XII.B.a', riesgo_base: 2, alto_de_oficio: false,
    // La Adenda dice 8,025 UMA. Esa cifra es hoy el umbral de EFECTIVO de
    // inmuebles del artículo 32, no un umbral de Aviso, y no existe como
    // parámetro de Aviso en el catálogo. Ver SUPUESTOS_POR_CONFIRMAR.
    umbral_codigo: null,
    descripcion: 'Realización de avalúos por corredor público' },

  { clave: 'XII.B.b', riesgo_base: 3, alto_de_oficio: false, umbral_codigo: null,
    descripcion: 'Constitución de personas morales mercantiles y modificación patrimonial' },

  { clave: 'XII.B.c', riesgo_base: 4, alto_de_oficio: true, umbral_codigo: null,
    descripcion: 'Constitución, modificación o cesión de derechos de fideicomiso ante corredor' },

  { clave: 'XII.B.d', riesgo_base: 4, alto_de_oficio: true, umbral_codigo: null,
    descripcion: 'Mutuo mercantil o crédito mercantil con acreedor fuera del sistema financiero' },

  { clave: 'XII.C', riesgo_base: 2, alto_de_oficio: false, umbral_codigo: null,
    descripcion: 'Actos de servidores públicos con facultad de dar fe pública' },

  { clave: 'XII.D', riesgo_base: 4, alto_de_oficio: true, umbral_codigo: null,
    descripcion: 'Actos de personas facilitadoras de mecanismos alternativos de solución de controversias' },
];

/**
 * De qué supuesto es cada tipo de acto del layout.
 *
 * Los once tipos del catálogo del SAT contra los once supuestos del artículo.
 * Cinco tipos comparten el inciso XII.A.c.
 */
export const SUPUESTO_DE_ACTO: Record<string, string> = {
  transmision_inmueble: 'XII.A.a',
  otorgamiento_poder: 'XII.A.b',

  // Los cinco del inciso c). El apartado B tiene su equivalente mercantil
  // (XII.B.b) para el corredor público, y el layout no distingue quién
  // instrumenta: el tipo de acto es el mismo. Se asigna el del apartado A
  // porque los dos comparten riesgo base 3 y ninguno es alto de oficio, así
  // que la elección no cambia ningún resultado. Si algún día divergen, hará
  // falta saber si instrumentó notario o corredor.
  constitucion_personas_morales: 'XII.A.c',
  modificacion_patrimonial: 'XII.A.c',
  fusion: 'XII.A.c',
  escision: 'XII.A.c',
  compra_venta_acciones: 'XII.A.c',

  constitucion_modificacion_fideicomiso: 'XII.A.d',
  cesion_derechos_fideicomitente_fideicomisario: 'XII.B.c',
  contrato_mutuo_credito: 'XII.A.e',
  avaluo: 'XII.B.a',
};

/**
 * Lo que la Adenda 1 dejó sin resolver del todo, dicho aquí para que no se
 * pierda entre el código.
 *
 * Ninguno se resuelve por cuenta propia: los cuatro son criterio, y elegir uno
 * «razonable» es exactamente lo que produce una matriz que nadie puede
 * defender ante una verificación.
 */
export const SUPUESTOS_POR_CONFIRMAR = [
  {
    clave: 'XII.B.a',
    duda: 'La Adenda asigna al avalúo un umbral de Aviso de 8,025 UMA. Esa cifra '
        + 'es hoy el límite de EFECTIVO para inmuebles del artículo 32, no un '
        + 'umbral de Aviso, y no existe como parámetro de Aviso en el catálogo. '
        + 'Queda sin umbral hasta que se aclare si son la misma cifra por '
        + 'coincidencia o si hay un umbral propio del avalúo.',
  },
  {
    clave: 'XII.A.c',
    duda: 'Un solo riesgo base para cinco actos muy distintos. La Adenda razona '
        + 'sobre la constitución de sociedades —el acto de mayor volumen '
        + 'ordinario— y de ahí saca el 3; falta confirmar que una fusión y una '
        + 'compraventa de acciones comparten ese valor.',
  },
  {
    clave: 'XII.C · XII.D',
    duda: 'Servidores públicos con fe pública y facilitadores de mecanismos '
        + 'alternativos no son tipos de acto del layout del SPPLD: son otros '
        + 'sujetos obligados. Quedan en la tabla porque el artículo los nombra, '
        + 'pero ningún acto capturable en Ikán apunta a ellos hoy.',
  },
  {
    clave: 'XII.A.c · XII.B.b',
    duda: 'El layout no distingue si instrumentó notario o corredor, y el '
        + 'artículo sí. Hoy no cambia nada porque los dos incisos comparten '
        + 'riesgo base y ninguno es alto de oficio; si divergen, hará falta '
        + 'capturar quién instrumentó.',
  },
];

const POR_CLAVE = new Map(SUPUESTOS_XII.map((s) => [s.clave, s]));

/** El supuesto de un tipo de acto del layout. Undefined si no está mapeado. */
export function supuestoDeActo(tipoActo: string | null | undefined): SupuestoXII | undefined {
  const clave = SUPUESTO_DE_ACTO[String(tipoActo ?? '')];
  return clave ? POR_CLAVE.get(clave) : undefined;
}

/** El supuesto por su clave estable. */
export function supuestoPorClave(clave: string): SupuestoXII | undefined {
  return POR_CLAVE.get(clave);
}

/** Los tipos de acto que entran con piso en la banda alta. */
export function actosAltoDeOficio(): string[] {
  return Object.entries(SUPUESTO_DE_ACTO)
    .filter(([, clave]) => POR_CLAVE.get(clave)?.alto_de_oficio)
    .map(([acto]) => acto);
}

/** Los tipos de acto del catálogo que ningún supuesto reclama. Debe ser vacío. */
export function actosSinSupuesto(): string[] {
  return TIPOS_ACTO_NOTARIA.filter((t) => !SUPUESTO_DE_ACTO[t.value]).map((t) => t.value);
}
