import type { MatrizConfig, MatrizVariable, TipoPersona } from '@/types/domain';
import { variablesAplicables, PESO_POR_DEFECTO, type CatalogosDisponibles } from './matriz';

/**
 * El índice normalizado de 0 a 100, y los pisos que ganan sobre la suma.
 *
 * Fuente: Adenda 1 de Kawiil-Cumplimiento (31/08/2026), apartados 5.1 y 5.2.
 *
 * ---------------------------------------------------------------------
 * Por qué normalizar en vez de separar escalas
 * ---------------------------------------------------------------------
 * Con máximos de 25 puntos para persona física y 26 para moral, y una banda
 * alta común de 20 a 26, la moral alcanzaba «alto» con el 76.9 % de su puntaje
 * posible y la física necesitaba el 80 %. Parece menor y no lo es: dos clientes
 * con el mismo perfil de riesgo RELATIVO recibían clasificaciones distintas por
 * su forma jurídica, sin que ninguna decisión de política lo dispusiera.
 *
 * Separar las escalas lo taparía hoy y lo reabriría mañana, porque el problema
 * reaparece cada vez que se agrega o quita una opción a cualquier bloque —y van
 * a agregarse tres bloques nuevos—. Normalizar lo cierra de raíz.
 *
 * ---------------------------------------------------------------------
 * Por qué los pisos, y por qué ganan siempre
 * ---------------------------------------------------------------------
 * Una suma permite que varias señales menores dominen a una decisiva: un
 * cliente sin ninguna alerta relevante puede acumular puntos por variables
 * secundarias y superar a otro con una única señal grave. El piso fuerza la
 * banda alta con independencia del puntaje.
 *
 * Y hay un techo simétrico: ninguna combinación de variables favorables puede
 * bajar de banda a un expediente con un piso activo. Sin esa regla, el piso
 * sería una sugerencia.
 *
 * ---------------------------------------------------------------------
 * Los cortes son un punto de partida, no una conclusión
 * ---------------------------------------------------------------------
 * 40 y 70 se calibran contra una muestra real antes de darlos por buenos: si
 * más de una cuarta parte cae en alto, la banda no discrimina y la diligencia
 * reforzada se degrada en trámite; si casi nada cae en alto, la matriz no está
 * detectando. Las RCG piden doce meses de datos para sostener la metodología.
 *
 * Mientras esa calibración no exista, `provisional` viene en true y la pantalla
 * tiene que decirlo. Una clasificación que se presenta como definitiva antes de
 * calibrarse es justo lo que la Adenda pide no hacer.
 */

export type Banda = 'bajo' | 'medio' | 'alto';

/** Cortes del índice. Punto de partida del apartado 5.1, sin calibrar. */
export const CORTES_INDICE = { medio: 40, alto: 70 } as const;

export interface PisoActivo {
  clave: string;
  detalle: string;
}

export interface ResultadoIndice {
  /** Suma cruda, para poder auditar el cálculo. */
  puntaje: number;
  /** Máximo posible de la configuración que aplica a este tipo de persona. */
  maximo: number;
  /** 0 a 100. Es lo que clasifica. */
  indice: number;
  banda: Banda;
  /** La banda que habría salido del índice, antes de aplicar pisos. */
  banda_por_indice: Banda;
  pisos: PisoActivo[];
  /**
   * Los cortes todavía no se han calibrado contra datos reales. Mientras sea
   * true, la clasificación no debe presentarse como definitiva.
   */
  provisional: boolean;
}

/** El máximo que puede sumar una variable: su peso por su opción más alta. */
function maximoDeVariable(v: MatrizVariable): number {
  const mayor = v.opciones.reduce((m, o) => Math.max(m, o.valor), 0);
  return (v.peso ?? PESO_POR_DEFECTO) * mayor;
}

/** El máximo posible de la configuración que aplica a este tipo de persona. */
export function maximoPosible(
  config: MatrizConfig,
  tipoPersona: TipoPersona,
  catalogos?: CatalogosDisponibles,
): number {
  return variablesAplicables(config, tipoPersona, catalogos).reduce(
    (s, v) => s + maximoDeVariable(v),
    0,
  );
}

/** El mínimo posible: todas las variables en su opción más baja. */
export function minimoPosible(
  config: MatrizConfig,
  tipoPersona: TipoPersona,
  catalogos?: CatalogosDisponibles,
): number {
  return variablesAplicables(config, tipoPersona, catalogos).reduce((s, v) => {
    const menor = v.opciones.reduce((m, o) => Math.min(m, o.valor), Infinity);
    return s + (v.peso ?? PESO_POR_DEFECTO) * (Number.isFinite(menor) ? menor : 0);
  }, 0);
}

export function bandaDeIndice(indice: number): Banda {
  if (indice >= CORTES_INDICE.alto) return 'alto';
  if (indice >= CORTES_INDICE.medio) return 'medio';
  return 'bajo';
}

/**
 * El índice y la banda, con los pisos aplicados.
 *
 * `puntajeExtra` son los puntos de las banderas que viven fuera de la matriz
 * —banda de umbral, posible fraccionamiento— y que suman al puntaje sin formar
 * parte del máximo: son excepcionales por definición y meterlas en el
 * denominador diluiría todo lo demás.
 */
export function calcularIndice(
  config: MatrizConfig,
  tipoPersona: TipoPersona,
  puntaje: number,
  opciones: {
    pisos?: PisoActivo[];
    puntajeExtra?: number;
    calibrada?: boolean;
    /**
     * Catálogos cargados. Una variable cuyo catálogo falta queda fuera del
     * máximo Y del mínimo: si sólo saliera del numerador, el recorrido seguiría
     * contando puntos que ningún expediente puede sumar y el índice de todos
     * bajaría por una razón ajena a su riesgo.
     */
    catalogos?: CatalogosDisponibles;
  } = {},
): ResultadoIndice {
  const maximo = maximoPosible(config, tipoPersona, opciones.catalogos);
  const minimo = minimoPosible(config, tipoPersona, opciones.catalogos);
  const total = puntaje + (opciones.puntajeExtra ?? 0);

  // Se normaliza sobre el RECORRIDO (máximo menos mínimo), no sobre el máximo a
  // secas. Con ocho variables cuyo valor más bajo es 1, un expediente
  // impecable sacaría 8 de 26 —un 31 %— y parecería tener un riesgo que no
  // tiene. El expediente más limpio posible debe dar 0.
  const recorrido = maximo - minimo;
  const indice =
    recorrido > 0
      ? Math.max(0, Math.min(100, Math.round(((total - minimo) / recorrido) * 100)))
      : 0;

  const banda_por_indice = bandaDeIndice(indice);
  const pisos = opciones.pisos ?? [];
  // El piso gana siempre sobre la suma. Nunca al revés: una combinación de
  // variables favorables no puede bajar de banda un expediente con piso.
  const banda: Banda = pisos.length > 0 ? 'alto' : banda_por_indice;

  return {
    puntaje: total,
    maximo,
    indice,
    banda,
    banda_por_indice,
    pisos,
    provisional: opciones.calibrada !== true,
  };
}
