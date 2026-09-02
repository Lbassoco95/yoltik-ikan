import type { ClasificacionRiesgo, NivelKyc } from '@/types/domain';

/**
 * Los niveles de diligencia N1, N2 y N3.
 *
 * Fuente: Adenda 4 de Kawiil-Cumplimiento (01/09/2026), apartado 7.
 * Instrucciones 42 y 43.
 *
 * ---------------------------------------------------------------------
 * El diagnóstico, antes del diseño
 * ---------------------------------------------------------------------
 * Hasta hoy TODOS los expedientes decían N1 desde siempre, y no era sólo que
 * faltara el criterio de promoción: es que el valor por defecto era el nivel
 * MENOS exigente. El estado por defecto de un control de cumplimiento nunca
 * puede ser el más laxo.
 *
 * N1 no es «apenas empezamos con este cliente». Es diligencia SIMPLIFICADA, y
 * las Reglas la permiten en supuestos contados: entes públicos mexicanos,
 * entidades de los Anexos 7-A y 7 Bis-A, y emisoras con valores inscritos,
 * siempre que ADEMÁS estén clasificadas de riesgo bajo. Nacer ahí es afirmar
 * que un cliente del que no se sabe nada cumple esos supuestos.
 *
 * ---------------------------------------------------------------------
 * La asimetría, que es lo que de verdad hay que sostener
 * ---------------------------------------------------------------------
 * SE SUBE SOLO, SE BAJA A MANO.
 *
 * La promoción es automática e inmediata. La degradación no existe como
 * automatismo: exige que hayan cambiado los hechos, que la reevaluación
 * semestral del Capítulo III Bis lo constate, y una decisión firmada con su
 * motivación.
 *
 * Si la degradación fuera automática bastaría con que el cliente dejara de
 * operar unos meses para que el sistema le limpiara el historial solo. El
 * riesgo no baja porque nadie lo mire.
 *
 * ---------------------------------------------------------------------
 * Dos ejes que no son el mismo
 * ---------------------------------------------------------------------
 * El nivel de diligencia y el estado del expediente son cosas distintas. La
 * instrucción 19 pide bloquear el ESTADO 3 del expediente mientras el
 * beneficiario controlador no esté resuelto; eso opera sobre la máquina de
 * estados del expediente, no sobre esto. Un expediente puede estar en N3 y en
 * estado 2 a la vez, y no es una contradicción.
 *
 * Módulo puro: sin red, sin React.
 */

export type NivelDiligencia = NivelKyc;

/** De menor a mayor exigencia. El orden del arreglo ES la jerarquía. */
export const ORDEN_NIVEL: NivelDiligencia[] = ['N1', 'N2', 'N3'];

/**
 * El nivel con el que nace un expediente.
 *
 * N2, no N1. Es el cambio central de la instrucción 42.
 */
export const NIVEL_POR_DEFECTO: NivelDiligencia = 'N2';

export const ETIQUETA_NIVEL: Record<NivelDiligencia, string> = {
  N1: 'Diligencia simplificada',
  N2: 'Diligencia estándar',
  N3: 'Diligencia reforzada',
};

export const DETALLE_NIVEL: Record<NivelDiligencia, string> = {
  N1:
    'Sólo en los supuestos que las Reglas permiten simplificar —entes públicos mexicanos, ' +
    'entidades de los Anexos 7-A y 7 Bis-A, emisoras con valores inscritos— y además ' +
    'clasificados de riesgo bajo. Nunca por defecto.',
  N2: 'El nivel de todo cliente. Expediente único completo conforme al Capítulo III.',
  N3: 'Requiere aprobación de un directivo antes de operar.',
};

/**
 * Los hechos del expediente que deciden el nivel.
 *
 * Todos opcionales y ninguno con valor por defecto que empuje hacia abajo: un
 * hecho que no se conoce no es un hecho favorable.
 */
export interface HechosDelExpediente {
  /** La clasificación de la última evaluación de riesgo. */
  clasificacion?: ClasificacionRiesgo | null;
  /**
   * El motivo del piso, cuando hay uno activo. Su presencia basta: los pisos
   * del apartado 5.2 de la Adenda 1 —PPE extranjera, país en nivel 1, acto
   * alto de oficio, efectivo sobre los límites del art. 32, beneficiario
   * controlador no determinable— son todos supuestos de diligencia reforzada.
   */
  motivo_alto_de_oficio?: string | null;
  /**
   * Si hubo que recurrir al paso III de la cascada del art. 23 Quinquies.
   *
   * Es la forma operativa de «beneficiario controlador no determinable», y se
   * mira aparte porque puede darse sin que se haya vuelto a evaluar la matriz:
   * esperar a la siguiente evaluación dejaría el expediente en N2 mientras su
   * estructura de control está sin determinar.
   */
  paso_iii_practicado?: boolean;
  /**
   * Si el cliente cae en un supuesto de simplificación de las Reglas Y está
   * clasificado de riesgo bajo. Las dos condiciones, no una.
   *
   * Por omisión NO se asume: un cliente del que no consta que sea ente público
   * ni emisora no es ninguna de las dos cosas.
   */
  simplificacion_admisible?: boolean;
}

export interface NivelExigido {
  nivel: NivelDiligencia;
  /** Por qué. Un nivel sin motivo no se puede explicar ni discutir. */
  motivos: string[];
}

/**
 * El nivel que los hechos EXIGEN.
 *
 * Ojo con lo que esta función no hace: no decide el nivel del expediente. Sólo
 * dice el mínimo que los hechos imponen. El nivel real es el mayor entre este y
 * el que ya tenía, y esa distinción es la que impide la degradación automática
 * —ver `nivelResultante`—.
 */
export function nivelQueLeToca(hechos: HechosDelExpediente): NivelExigido {
  const motivos: string[] = [];

  if (hechos.motivo_alto_de_oficio) {
    motivos.push(`piso activo: ${hechos.motivo_alto_de_oficio}`);
  }
  if (hechos.clasificacion === 'alto' || hechos.clasificacion === 'alto_oficio') {
    motivos.push('clasificación en banda alta');
  }
  if (hechos.paso_iii_practicado) {
    motivos.push(
      'se recurrió al paso III de la cascada del art. 23 Quinquies: la estructura de control no ' +
        'fue determinable',
    );
  }
  if (motivos.length > 0) return { nivel: 'N3', motivos };

  if (hechos.simplificacion_admisible === true) {
    return {
      nivel: 'N1',
      motivos: [
        'supuesto de simplificación de las Reglas y clasificación de riesgo bajo, las dos cosas',
      ],
    };
  }

  return { nivel: 'N2', motivos: ['el nivel de todo cliente'] };
}

/** El rango de un nivel en la jerarquía. */
export function rango(nivel: NivelDiligencia): number {
  return ORDEN_NIVEL.indexOf(nivel);
}

export function esPromocion(desde: NivelDiligencia, hacia: NivelDiligencia): boolean {
  return rango(hacia) > rango(desde);
}

export function esDegradacion(desde: NivelDiligencia, hacia: NivelDiligencia): boolean {
  return rango(hacia) < rango(desde);
}

export interface Resultado {
  nivel: NivelDiligencia;
  cambio: 'sube' | 'sin cambio' | 'baja pendiente de firma';
  motivos: string[];
}

/**
 * El nivel que debe quedar, dado el que tiene y los hechos.
 *
 * Es donde vive la asimetría. Sube solo; cuando los hechos exigirían menos, NO
 * baja: devuelve el que tenía y avisa de que la bajada está pendiente de una
 * decisión firmada. Devolver el nivel menor —aunque los hechos lo justifiquen—
 * convertiría la reevaluación semestral en un automatismo, y eso es
 * exactamente lo que la Adenda 4 prohíbe.
 */
export function nivelResultante(
  actual: NivelDiligencia,
  hechos: HechosDelExpediente,
): Resultado {
  const exigido = nivelQueLeToca(hechos);

  if (esPromocion(actual, exigido.nivel)) {
    return { nivel: exigido.nivel, cambio: 'sube', motivos: exigido.motivos };
  }
  if (esDegradacion(actual, exigido.nivel)) {
    return {
      nivel: actual,
      cambio: 'baja pendiente de firma',
      motivos: [
        `los hechos hoy exigirían ${exigido.nivel} (${exigido.motivos.join('; ')}), pero el nivel ` +
          'no baja solo: hace falta que la reevaluación semestral lo constate y una decisión ' +
          'firmada con su motivación',
      ],
    };
  }
  return { nivel: actual, cambio: 'sin cambio', motivos: exigido.motivos };
}
