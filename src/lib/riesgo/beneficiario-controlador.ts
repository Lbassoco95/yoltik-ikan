/**
 * La cascada del Beneficiario Controlador.
 *
 * Fuente: Adenda 2 de Kawiil-Cumplimiento (31/08/2026), que transcribe el
 * artículo 23 Quinquies de las RCG. Instrucciones 13 a 16 y 21 a 22.
 *
 * ---------------------------------------------------------------------
 * Tres pasos, en orden, y no se salta ninguno
 * ---------------------------------------------------------------------
 *   I   · quien posea el 25 % O MÁS de la composición accionaria o parte social
 *   II  · quien tenga el control por OTROS MEDIOS, con funciones de estrategia,
 *         decisión y dirección de las principales políticas
 *   III · quien ocupe la posición de funcionario administrativo de mayor grado
 *
 * «Por lo menos el siguiente orden de prelación» dice el texto, y eso tiene dos
 * consecuencias: el orden es obligatorio —no se practica el II sin el I— y es
 * un PISO, no un techo: se pueden añadir pasos, nunca omitir uno.
 *
 * ---------------------------------------------------------------------
 * Por qué tres estados por paso y no un booleano
 * ---------------------------------------------------------------------
 * «Practicado sin resultado» y «no practicado» son cosas distintas ante una
 * verificación. Con un booleano, un paso que se intentó y no arrojó a nadie se
 * ve igual que uno que nadie intentó, y el artículo 23 Quinquies obliga a
 * documentar EL PROCEDIMIENTO SEGUIDO, no sólo su resultado.
 *
 * ---------------------------------------------------------------------
 * El paso III es una señal, no un trámite resuelto
 * ---------------------------------------------------------------------
 * Llegar al funcionario de mayor grado significa que la estructura de control
 * NO fue determinable. La Adenda 1 puso eso entre los pisos que fuerzan banda
 * alta, y el disparador de ese piso es exactamente haber recurrido al paso III.
 * Presentarlo como un beneficiario identificado por titularidad sería perder la
 * señal.
 *
 * Módulo puro: sin red, sin React.
 */

/** El umbral, en por ciento. Ver `UMBRAL_BC` para por qué es «o más». */
export const UMBRAL_BC = 25;

/**
 * La discrepancia entre los dos textos vigentes, resuelta y escrita.
 *
 *   LFPIORPI art. 3 fr. III b) ii)  · «más del veinticinco por ciento»
 *   RCG art. 23 Quinquies fr. I     · «el 25% o más»
 *
 * Se implementa «mayor o igual», que es el texto de la regla que desarrolla el
 * procedimiento —que es lo que este código ejecuta— y la lectura que identifica
 * a MÁS personas: ante dos textos vigentes, el criterio conservador es el que
 * no deja fuera a nadie. Un accionista con exactamente 25.00 % SÍ es
 * beneficiario controlador.
 *
 * La decisión tiene que estar también en el Manual de Políticas Internas. Un
 * verificador que note la diferencia debe encontrar que se advirtió y se
 * decidió, no que se pasó por alto.
 */
export const CRITERIO_UMBRAL =
  'Mayor o igual a 25.00 %. La LFPIORPI dice «más del 25 %» y las RCG «25 % o más»; se ' +
  'toma el texto de la regla que desarrolla el procedimiento de identificación, que además ' +
  'es la lectura que identifica a más personas.';

export type Paso = 'I' | 'II' | 'III';
export type EstadoPaso = 'no_practicado' | 'practicado_sin_resultado' | 'practicado_con_resultado';

export const ORDEN_PASOS: Paso[] = ['I', 'II', 'III'];

export interface SocioParaCascada {
  id: string;
  nombre_razon_social: string;
  tipo_persona: 'fisica' | 'moral';
  /** Titularidad de la composición accionaria o parte social, en por ciento. */
  porcentaje_titularidad?: number | null;
  /** Derechos de voto, en por ciento. Se mide APARTE. */
  porcentaje_voto?: number | null;
  /** Cuando el socio es a su vez persona moral: por aquí sigue la cadena. */
  socio_client_id?: string | null;
}

/**
 * ¿Este socio alcanza el umbral del paso I?
 *
 * Con CUALQUIERA de los dos porcentajes. La Ley mide derechos de voto y la
 * regla mide titularidad accionaria, y no siempre coinciden: hay acciones sin
 * voto, y hay voto por convenio sin titularidad. Un solo campo de
 * «participación» dejaría fuera casos que los dos textos quieren capturar.
 */
export function alcanzaUmbral(socio: SocioParaCascada): boolean {
  const t = socio.porcentaje_titularidad;
  const v = socio.porcentaje_voto;
  return (typeof t === 'number' && t >= UMBRAL_BC) || (typeof v === 'number' && v >= UMBRAL_BC);
}

/** Por qué alcanzó, para poder explicarlo en el expediente. */
export function motivoDeUmbral(socio: SocioParaCascada): string | null {
  const t = socio.porcentaje_titularidad;
  const v = socio.porcentaje_voto;
  const porT = typeof t === 'number' && t >= UMBRAL_BC;
  const porV = typeof v === 'number' && v >= UMBRAL_BC;
  if (porT && porV) return `titularidad ${t} % y voto ${v} %, ambos al 25 % o más`;
  if (porT) return `titularidad ${t} %, del 25 % o más`;
  if (porV) return `derechos de voto ${v} %, del 25 % o más, aunque su titularidad no llegue`;
  return null;
}

export interface ResultadoPasoI {
  /** Personas FÍSICAS que alcanzan el umbral: beneficiarios controladores directos. */
  fisicas: SocioParaCascada[];
  /**
   * Personas MORALES que alcanzan el umbral. No son beneficiarios: son un
   * eslabón. Hay que aplicarles el art. 23 Quinquies otra vez, ascendiendo en la
   * cadena hasta la persona física que en última instancia ejerce el control.
   */
  morales_por_ascender: SocioParaCascada[];
  /** El paso se practicó y no arrojó a nadie. Distinto de no haberlo practicado. */
  sin_resultado: boolean;
}

export function practicarPasoI(socios: SocioParaCascada[]): ResultadoPasoI {
  const alcanzan = socios.filter(alcanzaUmbral);
  return {
    fisicas: alcanzan.filter((s) => s.tipo_persona === 'fisica'),
    morales_por_ascender: alcanzan.filter((s) => s.tipo_persona === 'moral'),
    sin_resultado: alcanzan.length === 0,
  };
}

export interface EstadoCascada {
  I: EstadoPaso;
  II: EstadoPaso;
  III: EstadoPaso;
}

export const CASCADA_VACIA: EstadoCascada = {
  I: 'no_practicado',
  II: 'no_practicado',
  III: 'no_practicado',
};

/**
 * ¿Se puede practicar este paso ahora?
 *
 * El orden es secuencial: sólo se llega al II si el I se practicó y no arrojó
 * a nadie, y al III si además el II tampoco. Si un paso anterior SÍ arrojó
 * beneficiarios, los siguientes no hacen falta —la cascada terminó ahí—.
 */
export function sePuedePracticar(paso: Paso, estado: EstadoCascada): boolean {
  if (paso === 'I') return true;
  if (paso === 'II') return estado.I === 'practicado_sin_resultado';
  return estado.I === 'practicado_sin_resultado' && estado.II === 'practicado_sin_resultado';
}

/** El siguiente paso que toca practicar, o null si la cascada ya está resuelta. */
export function siguientePaso(estado: EstadoCascada): Paso | null {
  for (const p of ORDEN_PASOS) {
    if (estado[p] === 'practicado_con_resultado') return null; // terminó aquí
    if (estado[p] === 'no_practicado') return p;
  }
  return null;
}

/** ¿La cascada está resuelta? Algún paso arrojó beneficiarios. */
export function cascadaResuelta(estado: EstadoCascada): boolean {
  return ORDEN_PASOS.some((p) => estado[p] === 'practicado_con_resultado');
}

/**
 * ¿Se llegó al paso III?
 *
 * Es el disparador del piso «beneficiario controlador no determinable» de la
 * Adenda 1: significa que ni la titularidad ni el control por otros medios
 * arrojaron a nadie, y hubo que recurrir al funcionario de mayor grado.
 */
export function estructuraNoDeterminable(estado: EstadoCascada): boolean {
  return estado.III === 'practicado_con_resultado';
}

/**
 * El primer paso POSTERIOR ya practicado, cuando el que se está asentando pasa
 * a «con resultado». Null si no hay conflicto.
 */
export function posteriorYaPracticado(
  paso: Paso,
  nuevoEstado: EstadoPaso,
  estado: EstadoCascada,
): Paso | null {
  if (nuevoEstado !== 'practicado_con_resultado') return null;
  const siguientes = ORDEN_PASOS.slice(ORDEN_PASOS.indexOf(paso) + 1);
  return siguientes.find((p) => estado[p] !== 'no_practicado') ?? null;
}

/** En español, para que la pantalla no tenga que redactarlo. */
export function motivoDelBloqueo(paso: Paso, estado: EstadoCascada): string {
  const anteriores = ORDEN_PASOS.slice(0, ORDEN_PASOS.indexOf(paso));
  const pendientes = anteriores.filter((p) => estado[p] === 'no_practicado');
  if (pendientes.length > 0) {
    return `falta practicar ${pendientes.length === 1 ? 'el paso' : 'los pasos'} ${pendientes.join(' y ')}.`;
  }
  const resuelto = anteriores.find((p) => estado[p] === 'practicado_con_resultado');
  if (resuelto) {
    return `el paso ${resuelto} ya arrojó beneficiarios controladores, así que la cascada terminó ahí.`;
  }
  return 'el orden de prelación del art. 23 Quinquies no lo permite.';
}

// =====================================================================
// Mínimo de socios por tipo social
// =====================================================================

export interface TipoSocial {
  clave: string;
  nombre: string;
  socios_minimo: number;
  socios_maximo: number | null;
  fundamento: string;
  solo_personas_fisicas: boolean;
}

export interface RevisionSocios {
  cumple: boolean;
  /** En español y sin citar artículos que no existen. Ver abajo. */
  detalle: string;
}

/**
 * ¿La sociedad tiene los socios que su tipo exige?
 *
 * NUNCA con una constante global. La S.A.S. se constituye válidamente con UN
 * accionista (LGSM art. 260) y una regla de «al menos dos» rechazaría
 * sociedades legalmente constituidas.
 *
 * Para sociedades constituidas FUERA de México el mínimo no aplica: se rige por
 * la ley del lugar de constitución.
 *
 * El mensaje no cita fundamento cuando no lo hay: salvo la S.A.S., la
 * cooperativa y la de ahorro y préstamo, el mínimo de dos no está enunciado como
 * cifra en ningún artículo, deriva de la naturaleza contractual del tipo. Citar
 * un artículo inexistente es peor que no citar ninguno.
 */
export function revisarMinimoDeSocios(
  tipo: TipoSocial | null | undefined,
  cuantosSocios: number,
  paisConstitucion?: string | null,
): RevisionSocios {
  const fuera = paisConstitucion != null && paisConstitucion.trim().toUpperCase() !== 'MX';
  if (fuera) {
    return {
      cumple: true,
      detalle:
        'Sociedad constituida fuera de México: el mínimo de socios se rige por la ley del ' +
        'lugar de constitución, no por la LGSM. En su lugar hay que exigir la documentación ' +
        'equivalente.',
    };
  }

  if (!tipo) {
    return {
      cumple: false,
      detalle:
        'Falta el tipo social. De él dependen tanto el mínimo de socios como el anexo de ' +
        'identificación aplicable, así que no se puede resolver sin él.',
    };
  }

  if (cuantosSocios < tipo.socios_minimo) {
    return {
      cumple: false,
      detalle:
        `${tipo.nombre} requiere al menos ${tipo.socios_minimo} ` +
        `${tipo.socios_minimo === 1 ? 'socio' : 'socios'} y se capturaron ${cuantosSocios}. ` +
        tipo.fundamento,
    };
  }

  if (tipo.socios_maximo != null && cuantosSocios > tipo.socios_maximo) {
    return {
      cumple: false,
      detalle:
        `${tipo.nombre} admite como máximo ${tipo.socios_maximo} socios y se capturaron ` +
        `${cuantosSocios}. ${tipo.fundamento}`,
    };
  }

  return {
    cumple: true,
    detalle: `${cuantosSocios} socios, dentro de lo que ${tipo.nombre} admite.`,
  };
}
