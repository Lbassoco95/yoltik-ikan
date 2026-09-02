import type { NivelSancion } from './sanciones';

/**
 * La subdivisión territorial (ISO 3166-2).
 *
 * Fuente: Adenda 4 de Kawiil-Cumplimiento (01/09/2026), apartado 2.
 * Instrucciones 35, 36 y 46.
 *
 * ---------------------------------------------------------------------
 * Por qué hace falta una dimensión y no basta el país
 * ---------------------------------------------------------------------
 * La Orden Ejecutiva 13685 cubre Crimea; la 14065 cubre Donetsk y Lugansk. Son
 * prohibiciones SUBNACIONALES, y un código de país no las puede expresar.
 * Forzarlo falla en las dos direcciones:
 *
 *   · Ucrania entera en prohibición sobrebloquea a un país completo. Un
 *     compareciente de Leópolis no tiene nada que ver con Crimea.
 *   · Ucrania sólo en riesgo alto pierde el supuesto que la norma prohíbe: la
 *     operación con la región ocupada pasa y sigue adelante.
 *
 * ---------------------------------------------------------------------
 * Gana cuando es más severa, nunca rebaja
 * ---------------------------------------------------------------------
 * Ucrania es riesgo alto y Crimea es prohibición: quedarse con el país perdería
 * la prohibición. Pero al revés no: un óblast tranquilo dentro de un país
 * sancionado sigue estando en un país sancionado, y dejar que la subdivisión
 * rebajara convertiría el campo en una vía para sacar expedientes del radar.
 *
 * Módulo puro: sin red, sin React.
 */

export interface Subdivision {
  /** ISO 3166-2 completo, con el país delante: «UA-43». */
  clave: string;
  pais_iso2: string;
  nombre: string;
  nivel_territorial: NivelSancion;
  /** Por qué está en ese nivel. Obligatoria en la base. */
  derivacion: string;
  /**
   * La cobertura NO se pudo confirmar contra fuente primaria.
   *
   * Jersón y Zaporiyia: la orientación pública de OFAC las trata como regiones
   * ocupadas, pero no se localizó la determinación del Secretario del Tesoro
   * que las incorpore formalmente. Se marca en vez de omitirse —omitirlas
   * dejaría pasar operaciones con regiones ocupadas— y en vez de afirmarlas sin
   * matiz, que las presentaría como confirmadas.
   */
  pendiente_confirmacion: boolean;
}

/** De menor a mayor severidad. El orden del arreglo ES la jerarquía. */
const SEVERIDAD: NivelSancion[] = ['atencion', 'riesgo_alto', 'prohibicion'];

function rango(nivel: NivelSancion | null | undefined): number {
  return nivel == null ? -1 : SEVERIDAD.indexOf(nivel);
}

export interface NivelTerritorial {
  nivel: NivelSancion;
  /** Qué lo produjo: el país o la subdivisión. Sin esto, quien lo vea no sabe
   *  si puede resolverlo capturando la subdivisión o no. */
  origen: 'pais' | 'subdivision';
  detalle: string;
}

/**
 * El nivel del expediente mirando país y subdivisión.
 *
 * Devuelve null cuando ninguno de los dos tiene nivel. No es «riesgo bajo»: es
 * que no hay nada que decir, y quien llama tiene que poder distinguirlo.
 */
export function nivelTerritorial(
  nivelPais: NivelSancion | null | undefined,
  subdivision: Subdivision | null | undefined,
): NivelTerritorial | null {
  const sub = subdivision?.nivel_territorial ?? null;

  if (sub != null && rango(sub) > rango(nivelPais)) {
    return {
      nivel: sub,
      origen: 'subdivision',
      detalle:
        subdivision!.nombre +
        (subdivision!.pendiente_confirmacion
          ? ' (cobertura pendiente de confirmación documental)'
          : ''),
    };
  }

  if (nivelPais == null) return null;
  return { nivel: nivelPais, origen: 'pais', detalle: 'nivel del país capturado' };
}

/**
 * ¿Falta capturar la subdivisión?
 *
 * Sólo en los países que la exigen. Pedirla siempre encarece la captura sin
 * ganancia: en la inmensa mayoría de los actos no cambia nada, y un campo
 * obligatorio que casi nunca importa enseña a rellenarlo de cualquier manera.
 *
 * Y no bloquea la captura del expediente: en una notaría el compareciente está
 * delante y el expediente se completa en pasos. Bloquea el acto.
 */
export function faltaSubdivision(
  paisDelDomicilio: string | null | undefined,
  subdivision: string | null | undefined,
  paisesQueLaExigen: Set<string>,
  /**
   * Se preguntó y el domicilio está fuera de las regiones alcanzadas.
   *
   * Es una RESPUESTA, no una omisión. Sin distinguirla, quien contesta «ninguna
   * de las listadas» deja el campo vacío, el aviso sigue pidiéndolo para
   * siempre, y un aviso que no se puede quitar contestando enseña a ignorarlo
   * —que es peor que no tenerlo—.
   */
  fueraDeLista = false,
): boolean {
  const pais = paisDelDomicilio?.trim().toUpperCase();
  if (!pais || !paisesQueLaExigen.has(pais)) return false;
  if (fueraDeLista) return false;
  return (subdivision ?? '').trim() === '';
}

/**
 * El país del domicilio, que es sobre el que se pide la subdivisión.
 *
 * En persona moral es la jurisdicción de constitución; en física, la
 * residencia. La nacionalidad NO sirve para esto: una persona ucraniana que
 * vive en México no tiene domicilio en una región ocupada, y pedirle la
 * subdivisión por su pasaporte sería marcar por nacionalidad, que es
 * exactamente lo que la Adenda 3 dice que no se hace.
 */
export function paisDelDomicilio(cliente: {
  tipo_persona: 'fisica' | 'moral';
  pais_residencia_iso2?: string | null;
  pais_constitucion_clave?: string | null;
}): string | null {
  const v =
    cliente.tipo_persona === 'moral'
      ? cliente.pais_constitucion_clave
      : cliente.pais_residencia_iso2;
  return v?.trim().toUpperCase() || null;
}
