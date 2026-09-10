// =====================================================================
// Motor PLD · Evaluadores de regla_dsl (núcleo puro, sin dependencias)
// =====================================================================
// Este módulo NO importa Deno ni Supabase a propósito: es lógica pura y
// determinista para que pueda testearse con vitest (ver
// src/test/motor-evaluadores.test.ts) y a la vez ejecutarse dentro de la
// Edge Function `index.ts`.
//
// Implementa RCG0.B0 (deuda de Sprint D-3): los 6 tipos de regla_dsl
// documentados en docs/MOTOR_PLD.md más las dos variantes realmente
// sembradas (lookup por `valores`, agregado con `count_ip_anonima`).
//
// NO inventa umbrales: cada valor viene de la tipología (regla_dsl), de la
// operación, o del contexto que recibe. Este módulo no declara ninguna cifra
// regulatoria propia.
// =====================================================================

// La UMA ya NO se declara aquí. Este módulo es puro: recibe el valor vigente
// en `MotorContext.umaMxn`, y quien lo invoca (index.ts) lo lee de
// `parametro_regulatorio` (migration 0011). Así el motor y el front no pueden
// volver a desincronizarse, que es exactamente lo que pasaba antes.

// ---------------------------------------------------------------------
// Tipos de dominio
// ---------------------------------------------------------------------

export type Comparador = '>' | '>=' | '<' | '<=' | '==' | '!=';

export interface Condicion {
  op: Comparador;
  /** El umbral escrito a mano. Vale cuando NO cambia con la fecha del acto. */
  valor?: number;
  /**
   * El umbral tomado de `parametro_regulatorio` por su código, resuelto con la
   * FECHA DEL ACTO.
   *
   * Existe porque los umbrales de la reforma cambiaron el 17 de julio de 2025 y
   * un número escrito en la regla no puede saber eso. Con el literal, un acto
   * de 2024 se evaluaba contra el umbral de 2026 —16,000 UMA en inmuebles pasó
   * a 8,000— y ahí no se falla por un peso: se falla en el sentido de la
   * obligación, produciendo un Aviso de más o de menos que nadie nota.
   *
   * Instrucciones 312, 313, 322 y 323 de la Célula de Cumplimiento.
   */
  parametro?: string;
}

/** Una vigencia de un umbral: desde cuándo rige y cuánto vale. */
export interface VigenciaUmbral {
  desde: string;
  hasta: string | null;
  valor: number;
}

/**
 * Por qué una tipología NO se pudo evaluar sobre una operación.
 *
 * Instrucción 324: cuando falta el parámetro con el que medir un acto, el motor
 * debe NEGARSE a evaluar y decirlo, en lugar de aplicar el umbral vigente hoy.
 * Aplicar el umbral nuevo a un acto viejo no produce un error visible: produce
 * un Aviso de más o de menos que nadie va a notar.
 */
export interface NoEvaluado {
  tipologia_codigo: string;
  tipologia_version: number;
  operation_id: string | null;
  client_id: string | null;
  fecha: string;
  motivo: string;
}

export type ReglaDsl =
  | {
      tipo: 'agregado';
      ventana: string;
      agrupar_por: string;
      /**
       * Acota la regla a ciertas operaciones ANTES de agrupar y sumar.
       *
       * Sin esto, una regla llamada «transmisión de inmueble ≥ 8,000 UMA» suma
       * también los poderes, los fideicomisos y las constituciones del mismo
       * cliente, y levanta un hallazgo de transmisión de inmueble por actos que
       * no lo son. Se cazó el 31/08/2026: una constitución de sociedad de
       * $1,000,000 estaba disparando XII-01.
       *
       * Además es lo que pide la ley. El penúltimo párrafo del art. 17 de la
       * LFPIORPI acumula los actos de un mismo cliente POR TIPO DE ACTO U
       * OPERACIÓN, no todos juntos: sumar tipos distintos produce avisos que no
       * proceden.
       *
       * Opcional a propósito: las reglas de estructuración del sector XVI sí
       * suman todo lo del cliente, y ahí el comportamiento sin filtro es el
       * correcto.
       */
      filtro?: { campo: string; valores: string[] };
      condicion: Record<string, Condicion>;
    }
  | {
      tipo: 'secuencia';
      ventana: string;
      secuencia: string[];
      condicion: Record<string, Condicion>;
    }
  | {
      tipo: 'score';
      fuente: string;
      condicion: { exposicion_pct?: Condicion; categorias?: string[] };
    }
  | {
      tipo: 'lookup';
      campo: string;
      fuentes?: string[];
      valores?: string[];
    }
  | {
      tipo: 'duplicado';
      campos: string[];
      umbral_cuentas: number;
    }
  | {
      tipo: 'desviacion';
      factor: number;
      /** Contra qué se compara:
       *    'perfil_declarado'            el que el cliente declaró al alta.
       *    'promedio_historico_mensual'  el suyo propio, calculado.
       *  Cualquier otro valor cae al perfil declarado, que es el
       *  comportamiento conservador. */
      comparar: string;
      /** Madurez exigida antes de que la regla signifique algo. Sin esto, una
       *  regla de comportamiento dispara en la primera operación de cualquier
       *  cliente, cuando todavía no hay patrón del cual desviarse.
       *
       *  `min_dias_historial` es la unidad preferida: un patrón puede formarse
       *  en días y exigir meses lo vuelve invisible. */
      min_operaciones?: number;
      min_dias_historial?: number;
      min_meses_historial?: number;
    };

/** SLA operativo interno de la bandeja del OC (columna
 *  `hallazgo.clasificacion_urgencia`). NO es un plazo regulatorio. */
export type ClasificacionUrgencia = '24_horas' | 'por_umbral';

/** Métricas de `condicion` que representan un umbral de MONTO (no de conteo). */
const METRICAS_MONTO = [
  'suma_monto_uma', 'suma_monto_mxn', 'monto_uma', 'monto_mxn',
  // La contraprestación es un umbral de monto igual que los demás: lo que la
  // distingue es sobre qué se mide, no cómo se clasifica.
  'contraprestacion_uma', 'contraprestacion_mxn',
];

/** Deriva el SLA operativo del hallazgo a partir de la forma de la regla que
 *  lo generó. Espejo exacto de `public.urgencia_de_regla(jsonb)` en la
 *  migration 0007 — si cambia una, cambia la otra.
 *
 *  · `desviacion` compara contra una referencia monetaria (perfil declarado
 *    o promedio histórico del propio cliente): umbral
 *    monetario → `por_umbral`.
 *  · Una `condicion` sobre una métrica de monto es un umbral monetario
 *    → `por_umbral` (caso XII-01, transmisión de inmueble ≥ 16,000 UMA).
 *  · El resto (`lookup`, `score`, `duplicado`, `secuencia`, y `agregado` que
 *    solo cuenta operaciones) es una regla de "aviso siempre", sin umbral de
 *    monto → `24_horas` (caso XII-02, poder irrevocable).
 *
 *  Fail-safe: regla nula o desconocida cae en `24_horas`, la atención más
 *  inmediata. */
export function clasificacionUrgencia(regla: ReglaDsl | null | undefined): ClasificacionUrgencia {
  if (!regla) return '24_horas';
  if (regla.tipo === 'desviacion') return 'por_umbral';
  const condicion = (regla as { condicion?: Record<string, unknown> }).condicion;
  if (condicion && typeof condicion === 'object') {
    if (METRICAS_MONTO.some((m) => m in condicion)) return 'por_umbral';
  }
  return '24_horas';
}

/** Subconjunto de `operation` (+ contexto) que el motor necesita. */
export interface OperacionEval {
  id: string;
  organization_id: string;
  client_id: string;
  tipo: string; // enum tipo_operacion
  monto_mxn: number;
  /**
   * Comisión o contraprestación cobrada por el servicio, cualquiera que sea su
   * denominación. Es la base del inciso b) de la fracción XVI, cuyo umbral son
   * 4 UMA: se mide sobre lo que cobra el sujeto obligado, no sobre lo que mueve
   * el cliente, así que no se puede derivar de `monto_mxn`.
   */
  contraprestacion_mxn?: number | null;
  activo_virtual?: string | null;
  contraparte?: Record<string, unknown> | null;
  fecha: string; // ISO 8601
  [key: string]: unknown; // permite resolver campos por ruta (lookup.campo)
}

export interface Tipologia {
  id: string;
  codigo: string;
  nombre: string;
  version: number;
  severidad: string;
  activa: boolean;
  /** La tipología corresponde a un supuesto de Aviso del art. 17 LFPIORPI
   *  (migration 0035). No lo usa el evaluador —dispararse es dispararse—; lo
   *  usa el motor al decidir qué operaciones marca como reportables. */
  genera_aviso?: boolean;
  regla_dsl: ReglaDsl;
}

export interface MotorContext {
  /** Valor de la UMA en MXN. */
  /** UMA vigente hoy. Se conserva como respaldo y para las reglas que no
   *  dependen de la fecha de un acto concreto. */
  umaMxn: number;
  /**
   * Histórico de la UMA, de la más nueva a la más vieja.
   *
   * Hace falta porque la UMA cambia cada 1 de febrero y la ley mide cada acto
   * con la vigente EN SU FECHA, no con la del día en que se revisa. Sin esto,
   * un acto de enero de 2026 se juzgaba con la UMA que entró en febrero: el
   * mismo acto cruzaba o no el umbral según cuándo corriera el motor.
   *
   * Opcional: sin ella se usa `umaMxn` para todo, que es el comportamiento
   * anterior y sigue siendo correcto cuando todos los actos son del año en
   * curso.
   */
  umaVigencias?: { desde: string; valor: number }[];
  /**
   * Histórico de cada umbral, por código de parámetro.
   *
   * Es el hermano de `umaVigencias` y hace falta por lo mismo, sólo que peor:
   * la UMA cambia de valor y el umbral cambia de NÚMERO DE UMA. La reforma del
   * 16/07/2025 movió los umbrales de la fracción XII —16,000 UMA en inmuebles a
   * 8,000, 8,025 en sociedades— y su transitorio Primero fija la entrada en
   * vigor el 17 de julio de 2025 para toda la reforma.
   *
   * Sin esto, la regla lleva el número escrito a mano y no hay forma de que un
   * acto anterior se mida con el régimen que le tocaba.
   */
  umbralVigencias?: Record<string, VigenciaUmbral[]>;
  /** Momento de referencia para ventanas relativas (`desviacion`). */
  ahora: Date;
  /** Membresía país→lista: fuente (gafi_negra, ofac_sancionado, ...) → set de iso2. */
  paisPorFuente: Record<string, Set<string>>;
  /** Perfil transaccional mensual declarado por cliente, en UMA (para `desviacion`). */
  perfilMensualUmaPorCliente: Record<string, number>;
  /** Trayectoria de cada cliente ANTES de las operaciones que se evalúan.
   *  Sin esto el motor no puede distinguir un patrón anómalo de una primera
   *  operación, que es la diferencia entre un hallazgo y un falso positivo. */
  historialPorCliente: Record<string, HistorialCliente>;
}

/**
 * Lo que el motor sabe del cliente antes de juzgar sus operaciones.
 *
 * Existe porque una regla de comportamiento no significa nada sin una línea
 * base: si un cliente lleva tres operaciones en su vida, «se desvió de su
 * patrón» es una afirmación sin sustento. Con esto, una regla puede exigir
 * madurez antes de disparar, y todo hallazgo lleva el contexto para que el OC
 * sepa si nació de una trayectoria o de un primer día.
 */
export interface HistorialCliente {
  /** Operaciones registradas antes de la ventana que se evalúa. */
  operacionesPrevias: number;
  /** Días desde la primera operación. 0 si es cliente nuevo. */
  diasDeHistorial: number;
  /** Meses con al menos una operación. Sigue siendo útil para reglas de
   *  volumen mensual, pero NO es la unidad por omisión: un patrón puede
   *  formarse en días. Alguien que otorga varios poderes en una semana para
   *  tomar el control de una sociedad, o que compra joyas cada tres días,
   *  arma un patrón que esperar al mes vuelve invisible. */
  mesesConActividad: number;
  /** Días distintos con actividad. Es la medida fina, y la que permite exigir
   *  trayectoria sin obligar a esperar un mes. */
  diasConActividad: number;
  /** Si declaró un perfil transaccional al darse de alta. */
  tienePerfilDeclarado: boolean;
  /** Si tiene la matriz de riesgo evaluada. Un hallazgo sobre un cliente sin
   *  clasificar le dice al OC que la debida diligencia va incompleta. */
  tieneMatrizEvaluada: boolean;
  /** Promedio mensual en UMA de los meses ANTERIORES al actual. Excluye el mes
   *  en curso a propósito: incluirlo haría que la operación bajo examen
   *  inflara su propia referencia y la regla nunca dispararía. */
  promedioMensualUmaHistorico: number;
  /** Clasificación de la matriz de riesgo del cliente.
   *
   *  Es la LÍNEA BASE QUE SÍ EXISTE DESDE EL DÍA UNO. El historial
   *  transaccional tarda en formarse, pero la calificación del onboarding
   *  está desde que se integra el expediente, y es lo que permite juzgar una
   *  primera operación sin inventar un patrón: la misma operación no significa
   *  lo mismo en un cliente de riesgo bajo que en uno de riesgo alto. */
  clasificacionRiesgo: 'bajo' | 'medio' | 'alto' | 'alto_oficio' | null;
}

export const HISTORIAL_VACIO: HistorialCliente = {
  operacionesPrevias: 0,
  diasDeHistorial: 0,
  mesesConActividad: 0,
  tienePerfilDeclarado: false,
  tieneMatrizEvaluada: false,
  promedioMensualUmaHistorico: 0,
  diasConActividad: 0,
  clasificacionRiesgo: null,
};

/**
 * ¿El cliente tiene suficiente trayectoria para que una regla de
 * comportamiento signifique algo?
 *
 * Devuelve el motivo cuando NO la tiene, para poder decirlo en vez de callar.
 * Una regla que no exige línea base (los umbrales de ley, por ejemplo)
 * siempre pasa: 645 UMA son 645 UMA en la primera operación y en la mil.
 */
export function faltaLineaBase(
  regla: { min_operaciones?: number; min_dias_historial?: number; min_meses_historial?: number },
  h: HistorialCliente,
): string | null {
  const minOps = regla.min_operaciones ?? 0;
  const minDias = regla.min_dias_historial ?? 0;
  const minMeses = regla.min_meses_historial ?? 0;

  if (minOps > 0 && h.operacionesPrevias < minOps) {
    return `El cliente tiene ${h.operacionesPrevias} operaciones previas y la regla exige al menos ${minOps}.`;
  }
  if (minDias > 0 && h.diasConActividad < minDias) {
    return `El cliente tiene ${h.diasConActividad} días con actividad y la regla exige al menos ${minDias}.`;
  }
  if (minMeses > 0 && h.mesesConActividad < minMeses) {
    return `El cliente tiene ${h.mesesConActividad} meses con actividad y la regla exige al menos ${minMeses}.`;
  }
  return null;
}

export interface HallazgoCandidato {
  operation_id: string | null;
  client_id: string | null;
  tipologia_id: string;
  tipologia_codigo: string;
  tipologia_nombre: string;
  tipologia_version: number;
  severidad: string;
  regla_payload: Record<string, unknown>;
  /** SLA operativo derivado de la regla. El trigger de BD lo recalcula si
   *  llega nulo, pero el motor lo manda explícito. */
  clasificacion_urgencia: ClasificacionUrgencia;
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

const ms = (iso: string): number => new Date(iso).getTime();

/** Convierte una ventana tipo "72h", "24h", "1M" a milisegundos.
 *  h = horas, d = días, M = meses (aproximados a 30 días). */
export function ventanaAMs(ventana: string): number {
  const m = /^(\d+)\s*([hdM])$/.exec(ventana.trim());
  if (!m) throw new Error(`ventana inválida en regla_dsl: "${ventana}"`);
  const n = Number(m[1]);
  switch (m[2]) {
    case 'h':
      return n * 3_600_000;
    case 'd':
      return n * 86_400_000;
    case 'M':
      return n * 30 * 86_400_000;
    default:
      throw new Error(`unidad de ventana no soportada: "${m[2]}"`);
  }
}

/**
 * El inicio de la ventana, contado hacia atrás desde una fecha.
 *
 * Las horas y los días son milisegundos y no tienen misterio. Los MESES no:
 * `ventanaAMs` los aproxima a 30 días, y para seis meses eso son 180 cuando el
 * calendario da entre 181 y 184.
 *
 * La diferencia parece pequeña y no lo es. La ventana móvil de seis meses del
 * artículo 7 del Reglamento es la que gobierna el Aviso por acumulación, y el
 * artículo 18 fracción X obliga a que los mecanismos automatizados detecten
 * justamente las operaciones que deban acumularse. Un acto en el día 182 cae
 * FUERA de una ventana de 180 días y no acumula, cuando legalmente está dentro:
 * un falso negativo en el aviso, silencioso y a favor de no reportar.
 *
 * Por eso los meses se restan con aritmética de calendario. El comentario que
 * había —«aproximación; suficiente para volúmenes mensuales del demo»— era
 * honesto cuando se escribió y dejó de serlo.
 *
 * El día 31 se ajusta como hace el calendario: seis meses antes del 31 de agosto
 * es el 28 o 29 de febrero, no el 3 de marzo. Es lo que haría cualquiera al
 * contar meses con un almanaque delante.
 */
export function ventanaHasta(inicio: Date, ventana: string): Date {
  const m = /^(\d+)\s*([hdM])$/.exec(ventana.trim());
  if (!m) throw new Error(`ventana inválida en regla_dsl: "${ventana}"`);
  const n = Number(m[1]);
  if (m[2] !== 'M') return new Date(inicio.getTime() + ventanaAMs(ventana));

  const fin = new Date(inicio.getTime());
  const dia = fin.getUTCDate();
  fin.setUTCDate(1);
  fin.setUTCMonth(fin.getUTCMonth() + n);
  const ultimoDelMes = new Date(
    Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() + 1, 0),
  ).getUTCDate();
  fin.setUTCDate(Math.min(dia, ultimoDelMes));
  return fin;
}

export function ventanaDesde(fin: Date, ventana: string): Date {
  const m = /^(\d+)\s*([hdM])$/.exec(ventana.trim());
  if (!m) throw new Error(`ventana inválida en regla_dsl: "${ventana}"`);
  const n = Number(m[1]);

  if (m[2] !== 'M') return new Date(fin.getTime() - ventanaAMs(ventana));

  const inicio = new Date(fin.getTime());
  const dia = inicio.getUTCDate();
  inicio.setUTCDate(1); // primero se fija el mes, si no el 31 se desborda solo
  inicio.setUTCMonth(inicio.getUTCMonth() - n);
  const ultimoDelMes = new Date(
    Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0),
  ).getUTCDate();
  inicio.setUTCDate(Math.min(dia, ultimoDelMes));

  // Y al PRINCIPIO de ese día, no a la hora del acto que cierra la ventana.
  //
  // Sin esto, seis meses hacia atrás desde el 1 de septiembre a las 12:00
  // empezaban el 1 de marzo a las 12:00, y una escritura de ese mismo 1 de
  // marzo a las 10:00 quedaba fuera. El defecto no es el milisegundo: es que
  // el resultado dependía de la HORA guardada en `fecha`. Los mismos dos actos
  // producían o no un Aviso por acumulación según a qué hora se hubiera
  // capturado el primero, que es una fuente de no determinismo inaceptable en
  // un cálculo que sostiene una obligación de reporte.
  //
  // Se trunca sólo en las ventanas de MESES. Las de horas —24h, 72h— miden
  // inmediatez y ahí la hora sí es el dato: truncarlas las convertiría en otra
  // regla.
  inicio.setUTCHours(0, 0, 0, 0);
  return inicio;
}

export function comparar(op: Comparador, a: number, b: number): boolean {
  switch (op) {
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    default:
      return false;
  }
}

function agrupar<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = out.get(k);
    if (arr) arr.push(it);
    else out.set(k, [it]);
  }
  return out;
}

/** Resuelve un campo por ruta con puntos: "contraparte.pais_iso2", "activo_virtual". */
export function valorEnCampo(op: OperacionEval, campo: string): unknown {
  const partes = campo.split('.');
  let cur: unknown = op;
  for (const p of partes) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Evalúa un mapa de condiciones (AND) contra métricas calculadas. */
/**
 * Resuelve los umbrales que vienen por código de parámetro, con la fecha de
 * los actos que se están midiendo.
 *
 * Devuelve un motivo en vez de un resultado en dos casos, y los dos son
 * negativas a propósito (instrucción 324):
 *
 *   · No hay vigencia que cubra la fecha del acto. Típicamente un acto
 *     anterior al 17 de julio de 2025 cuyo régimen viejo todavía no se ha
 *     cargado. Aplicar el umbral de hoy sería medir con la regla equivocada.
 *
 *   · La ventana CRUZA un cambio de umbral, así que los actos de un mismo
 *     grupo se medirían con números distintos. Cumplimiento no ha resuelto qué
 *     umbral gobierna una acumulación a caballo del cambio, y elegir uno por
 *     mi cuenta sería inventar el criterio que la 313 vino a corregir.
 */
function resolverCondicion(
  condicion: Record<string, Condicion>,
  ops: OperacionEval[],
  ctx: MotorContext,
): { condicion: Record<string, Condicion> } | { motivo: string } {
  const salida: Record<string, Condicion> = {};
  for (const [clave, c] of Object.entries(condicion)) {
    if (c.parametro === undefined) {
      salida[clave] = c;
      continue;
    }
    const valores = new Set<number>();
    for (const o of ops) {
      const v = umbralEnFecha(ctx, c.parametro, o.fecha);
      if (v === null) {
        return {
          motivo:
            `No hay un valor vigente de «${c.parametro}» para el acto del ` +
            `${o.fecha.slice(0, 10)}. El umbral cambió con la reforma que entró en vigor el ` +
            '17 de julio de 2025 y el régimen anterior no está cargado, así que este acto no ' +
            'se puede medir. Aplicarle el umbral vigente hoy produciría un Aviso de más o de ' +
            'menos sin que nada lo señale.',
        };
      }
      valores.add(v);
    }
    if (valores.size > 1) {
      return {
        motivo:
          `La ventana de esta regla contiene actos que se miden con umbrales distintos de ` +
          `«${c.parametro}» (${[...valores].sort((a, b) => a - b).join(' y ')} UMA): cruza el ` +
          'cambio de umbral del 17 de julio de 2025. Qué umbral gobierna una acumulación a ' +
          'caballo del cambio no está determinado, y elegir uno aquí sería inventar el ' +
          'criterio.',
      };
    }
    const [unico] = [...valores];
    if (unico === undefined) {
      return { motivo: `No hay actos con los que resolver «${c.parametro}».` };
    }
    salida[clave] = { op: c.op, valor: unico };
  }
  return { condicion: salida };
}

function condicionesCumplen(
  condicion: Record<string, Condicion>,
  metricas: Record<string, number>,
): boolean {
  const claves = Object.keys(condicion);
  if (claves.length === 0) return false;
  for (const clave of claves) {
    const metrica = metricas[clave];
    if (metrica === undefined || Number.isNaN(metrica)) return false; // fail-closed
    // El umbral ya viene resuelto por `resolverCondicion`. Si llegara sin
    // valor, no se compara contra nada: fail-closed igual que arriba, porque
    // adivinar un umbral es peor que no disparar.
    const umbral = condicion[clave].valor;
    if (umbral === undefined) return false;
    if (!comparar(condicion[clave].op, metrica, umbral)) return false;
  }
  return true;
}

function candidato(
  op: OperacionEval | null,
  tip: Tipologia,
  clientId: string | null,
  payload: Record<string, unknown>,
  ctx?: MotorContext,
): HallazgoCandidato {
  // El contexto del cliente viaja DENTRO del hallazgo, no se consulta después:
  // es el estado al momento de evaluar, y es lo que permite al OC distinguir
  // «cambió su patrón» de «es su primera operación».
  const h = clientId ? ctx?.historialPorCliente[clientId] : undefined;
  const contexto = h
    ? {
        contexto_cliente: {
          operaciones_previas: h.operacionesPrevias,
          dias_de_historial: h.diasDeHistorial,
          dias_con_actividad: h.diasConActividad,
          meses_con_actividad: h.mesesConActividad,
          // La calificación del onboarding es la línea base que sí existe
          // desde el día uno: la misma operación no significa lo mismo en un
          // cliente de riesgo bajo que en uno de riesgo alto.
          clasificacion_riesgo: h.clasificacionRiesgo,
          perfil_declarado: h.tienePerfilDeclarado,
          matriz_evaluada: h.tieneMatrizEvaluada,
          sin_linea_base: h.operacionesPrevias === 0,
        },
      }
    : {};

  return {
    operation_id: op?.id ?? null,
    client_id: clientId,
    tipologia_id: tip.id,
    tipologia_codigo: tip.codigo,
    tipologia_nombre: tip.nombre,
    tipologia_version: tip.version,
    severidad: tip.severidad,
    regla_payload: { evaluado_en: 'motor-pld', ...contexto, ...payload },
    // El fraccionamiento sube la urgencia de la bandeja. La regla que lo
    // produjo es de umbral —y por su forma le tocaría `por_umbral`— pero un
    // umbral cruzado por acumulación de operaciones que ninguna lo alcanzaba
    // no es un acto grande: es un patrón, y el patrón se investiga antes de
    // que se enfríe. La forma de la regla no lo puede saber; el resultado sí.
    clasificacion_urgencia:
      (payload as { posible_fraccionamiento?: boolean })?.posible_fraccionamiento
        ? '24_horas'
        : clasificacionUrgencia(tip.regla_dsl),
  };
}

// ---------------------------------------------------------------------
// Evaluadores por tipo
// ---------------------------------------------------------------------

/**
 * La UMA que aplica a un acto, según su fecha.
 *
 * Recorre el histórico de la más nueva a la más vieja y se queda con la primera
 * cuya vigencia empezó en o antes del acto. Si el acto es anterior a todo lo que
 * conocemos, se usa la más antigua que hay: es lo más cercano a la verdad que
 * podemos decir, y mejor que dividir por la de hoy.
 */
/**
 * El valor de un umbral EN LA FECHA de un acto.
 *
 * Devuelve `null` cuando no hay vigencia que cubra esa fecha, y ese null es la
 * mitad del control: quien llama tiene que negarse a evaluar, no caer al valor
 * de hoy. La instrucción 324 lo dice sin rodeos — «negarse ruidosamente es la
 * conducta correcta cuando falta un parámetro».
 */
export function umbralEnFecha(
  ctx: MotorContext,
  codigo: string,
  fechaIso: string,
): number | null {
  const vig = ctx.umbralVigencias?.[codigo];
  if (!vig || vig.length === 0) return null;
  const dia = fechaIso.slice(0, 10);
  for (const v of vig) {
    // `hasta` es el día en que ENTRA la siguiente vigencia, así que se excluye:
    // el acto del 17 de julio de 2025 se mide con el régimen nuevo, que es lo
    // que dice el transitorio Sexto fracción IV del Reglamento —«a partir de
    // los actos u operaciones realizados el 17 de julio de 2025»—.
    if (v.desde <= dia && (v.hasta === null || dia < v.hasta)) return v.valor;
  }
  return null;
}

export function umaEnFecha(ctx: MotorContext, fechaIso: string): number {
  const vig = ctx.umaVigencias;
  if (!vig || vig.length === 0) return ctx.umaMxn;
  const dia = fechaIso.slice(0, 10);
  for (const v of vig) if (v.desde <= dia) return v.valor;
  return vig[vig.length - 1].valor;
}

function metricasVentana(ops: OperacionEval[], ctx: MotorContext): Record<string, number> {
  const suma_monto_mxn = ops.reduce((s, o) => s + o.monto_mxn, 0);

  // Cada operación se convierte a UMA con la SUYA y después se suman. Dividir
  // la suma por un solo valor daría otro número cuando la ventana cruza un 1 de
  // febrero, que es justo lo que la ventana de seis meses hace la mitad del año.
  const suma_monto_uma = ops.reduce((s, o) => s + o.monto_mxn / umaEnFecha(ctx, o.fecha), 0);

  const contraprestacion_mxn = ops.reduce((s, o) => s + (o.contraprestacion_mxn ?? 0), 0);
  const contraprestacion_uma = ops.reduce(
    (s, o) => s + (o.contraprestacion_mxn ?? 0) / umaEnFecha(ctx, o.fecha), 0);

  return {
    count: ops.length,
    suma_monto_mxn,
    suma_monto_uma,
    contraprestacion_mxn,
    contraprestacion_uma,
    count_ip_anonima: ops.filter((o) => o.contraparte?.ip_anonima === true).length,
  };
}

function evalAgregado(
  tip: Tipologia,
  regla: Extract<ReglaDsl, { tipo: 'agregado' }>,
  ops: OperacionEval[],
  ctx: MotorContext,
  noEvaluados?: NoEvaluado[],
): HallazgoCandidato[] {
  // La ventana ya NO se calcula en milisegundos: `ventanaDesde` la resuelve por
  // acto, con aritmética de calendario en los meses.

  // El filtro se aplica ANTES de agrupar: lo que queda fuera no cuenta para la
  // suma ni puede cerrar una ventana.
  const filtro = regla.filtro;
  const aplicables = filtro
    ? ops.filter((o) => filtro.valores.includes(String(valorEnCampo(o, filtro.campo) ?? '')))
    : ops;

  const grupos = agrupar(aplicables, (o) => String(valorEnCampo(o, regla.agrupar_por) ?? o.client_id));
  const out: HallazgoCandidato[] = [];

  for (const [clave, lista] of grupos) {
    const sorted = [...lista].sort((a, b) => ms(a.fecha) - ms(b.fecha));
    // Ventana deslizante: cada operación cierra una ventana hacia atrás. Con
    // aritmética de calendario en los meses, no restando 30 días por mes.
    for (let i = 0; i < sorted.length; i++) {
      const fin = sorted[i];
      const inicio = ventanaDesde(new Date(fin.fecha), regla.ventana).getTime();
      // El borde de inicio se INCLUYE. Una ventana de seis meses hacia atrás
      // desde el 1 de septiembre alcanza al 1 de marzo, no empieza el 2: con
      // `>` estricto, un acto que cae exactamente en el límite quedaba fuera de
      // la acumulación aunque la ley lo incluya. Es un milisegundo de
      // diferencia y una operación menos en el Aviso.
      const enVentana = sorted.filter(
        (o) => ms(o.fecha) >= inicio && ms(o.fecha) <= ms(fin.fecha),
      );
      const met = metricasVentana(enVentana, ctx);
      // El umbral se resuelve con la fecha de los actos, no con la de hoy.
      const resuelta = resolverCondicion(regla.condicion, enVentana, ctx);
      if ('motivo' in resuelta) {
        noEvaluados?.push({
          tipologia_codigo: tip.codigo,
          tipologia_version: tip.version,
          operation_id: fin.id,
          client_id: fin.client_id,
          fecha: fin.fecha,
          motivo: resuelta.motivo,
        });
        // Se abandona el grupo: si no se puede medir la ventana que cierra en
        // este acto, tampoco tiene sentido probar las siguientes con el mismo
        // parámetro sin resolver, y acumular una negativa por ventana llenaría
        // la constancia de ruido.
        break;
      }
      if (condicionesCumplen(resuelta.condicion, met)) {
        out.push(
          candidato(fin, tip, fin.client_id, {
            ventana: regla.ventana,
            agrupar_por: regla.agrupar_por,
            grupo: clave,
            metricas: met,
            operaciones: enVentana.map((o) => o.id),
            // Se le pasa la condición YA RESUELTA, no la de la regla. Desde que
            // el umbral puede venir como `parametro`, la de la regla no trae
            // número: leerla ahí dejaría el umbral en undefined y la bandera no
            // se levantaría nunca, justo en XII-01 y XVI-01, que son las reglas
            // acumulativas donde el fraccionamiento importa.
            ...banderaDeFraccionamiento(enVentana, regla.ventana, resuelta.condicion, met, ctx),
          }, ctx),
        );
        break; // un hallazgo por grupo (primera ventana que dispara)
      }
    }
  }
  return out;
}

/**
 * ¿La ventana cruzó el umbral porque se fraccionó?
 *
 * La distinción no es cosmética y el hallazgo no es el mismo. Que la suma de
 * seis meses alcance el umbral puede querer decir dos cosas muy distintas:
 *
 *   Una operación grande, más otras pequeñas alrededor. Es un acto reportable
 *   con acompañamiento. Nada más que decir.
 *
 *   VARIAS operaciones, ninguna de las cuales alcanzaba el umbral por sí sola,
 *   que juntas lo cruzan. Eso es la forma que tiene el fraccionamiento, y el
 *   penúltimo párrafo del artículo 17 lo contempla expresamente: los actos de
 *   un mismo cliente se acumulan. El artículo 18 fracción X obliga a que los
 *   mecanismos automatizados lo DETECTEN, no sólo a que sumen.
 *
 * Para el OC son dos bandejas distintas: la primera se revisa, la segunda se
 * investiga. Verlas iguales es perder la señal dentro del ruido.
 *
 * Devuelve un objeto para esparcir en el payload: vacío cuando no aplica, para
 * no ensuciar los hallazgos ordinarios con una bandera en false que después
 * alguien tendría que aprender a ignorar.
 */
function banderaDeFraccionamiento(
  enVentana: OperacionEval[],
  ventana: string,
  /** La condición RESUELTA: sus umbrales ya son números, vinieran escritos en
   *  la regla o de un parámetro por vigencia. */
  condicion: Record<string, Condicion>,
  met: Record<string, number>,
  ctx: MotorContext,
): Record<string, unknown> {
  if (enVentana.length < 2) return {};

  // Sólo tiene sentido sobre umbrales de MONTO. Una regla que cuenta
  // operaciones —«cinco accesos desde IP anónima»— no se fracciona: se repite.
  const claveMonto = Object.keys(condicion).find((k) => METRICAS_MONTO.includes(k));
  if (!claveMonto) return {};

  const umbral = condicion[claveMonto]?.valor;
  if (typeof umbral !== 'number' || umbral <= 0) return {};

  // ¿Alguna alcanzaba el umbral por su cuenta? Si sí, no hubo fraccionamiento:
  // hubo una operación reportable.
  const enUma = claveMonto.endsWith('_uma');
  const solaAlcanza = enVentana.some((o) => {
    const valor = claveMonto.startsWith('contraprestacion')
      ? (o.contraprestacion_mxn ?? 0)
      : o.monto_mxn;
    return (enUma ? valor / umaEnFecha(ctx, o.fecha) : valor) >= umbral;
  });
  if (solaAlcanza) return {};

  return {
    posible_fraccionamiento: true,
    fraccionamiento: {
      operaciones: enVentana.length,
      ventana,
      metrica: claveMonto,
      umbral,
      suma: met[claveMonto],
      nota:
        `${enVentana.length} operaciones en ${ventana}, ninguna de las cuales alcanzaba ` +
        `el umbral de ${umbral} por sí sola, que acumuladas lo cruzan. Procede el Aviso por ` +
        'acumulación (art. 17, penúltimo párrafo, LFPIORPI).',
    },
  };
}

function evalSecuencia(
  tip: Tipologia,
  regla: Extract<ReglaDsl, { tipo: 'secuencia' }>,
  ops: OperacionEval[],
  ctx: MotorContext,
): HallazgoCandidato[] {
  const grupos = agrupar(ops, (o) => o.client_id);
  const out: HallazgoCandidato[] = [];
  const secuencia = regla.secuencia;
  if (secuencia.length < 2) return out;

  for (const [, lista] of grupos) {
    const sorted = [...lista].sort((a, b) => ms(a.fecha) - ms(b.fecha));
    // Busca la secuencia ordenada de `tipo` dentro de la ventana, arrancando en cada índice.
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].tipo !== secuencia[0]) continue;
      // La secuencia mira hacia ADELANTE desde la primera operación, así que
      // aquí la ventana se calcula hacia adelante. Con la misma aritmética de
      // calendario: hoy todas las secuencias sembradas usan horas, donde da
      // igual, pero la primera que use meses no debe heredar la aproximación.
      const t0 = ms(sorted[i].fecha);
      const limite = ventanaHasta(new Date(sorted[i].fecha), regla.ventana).getTime();
      let paso = 1;
      let ultimo = sorted[i];
      for (let j = i + 1; j < sorted.length && paso < secuencia.length; j++) {
        if (ms(sorted[j].fecha) > limite) break;
        if (sorted[j].tipo === secuencia[paso]) {
          ultimo = sorted[j];
          paso++;
        }
      }
      if (paso === secuencia.length) {
        // Condiciones sobre señales numéricas de la última operación (ej. razon_retiro_saldo).
        const cp = ultimo.contraparte ?? {};
        const metricas: Record<string, number> = {};
        for (const clave of Object.keys(regla.condicion)) metricas[clave] = num(cp[clave]);
        if (condicionesCumplen(regla.condicion, metricas)) {
          out.push(
            candidato(ultimo, tip, ultimo.client_id, {
              ventana: regla.ventana,
              secuencia,
              metricas,
              operacion_inicial: sorted[i].id,
            }, ctx),
          );
          break; // un hallazgo por grupo
        }
      }
    }
  }
  return out;
}

function evalScore(
  tip: Tipologia,
  regla: Extract<ReglaDsl, { tipo: 'score' }>,
  ops: OperacionEval[],
  ctx: MotorContext,
): HallazgoCandidato[] {
  const out: HallazgoCandidato[] = [];
  const condExp = regla.condicion.exposicion_pct;
  const condCats = regla.condicion.categorias;
  if (!condExp && !condCats) return out;

  for (const o of ops) {
    const cp = o.contraparte ?? {};
    const exposicion = num(cp.exposicion_pct);
    const categorias = Array.isArray(cp.categorias) ? (cp.categorias as string[]) : [];

    let dispara = true;
    // La exposición on-chain no lleva umbral por vigencia: no es un monto de
    // la ley, es un porcentaje de una analítica. Si llegara sin valor no
    // dispara, que es el mismo fail-closed de siempre.
    if (condExp) {
      dispara =
        dispara &&
        condExp.valor !== undefined &&
        !Number.isNaN(exposicion) &&
        comparar(condExp.op, exposicion, condExp.valor);
    }
    if (condCats) dispara = dispara && categorias.some((c) => condCats.includes(c));

    if (dispara) {
      out.push(
        candidato(o, tip, o.client_id, {
          fuente: regla.fuente,
          fuente_mock: true, // DEMO — sin integración on-chain real
          nota: 'DEMO — analítica on-chain simulada, sin proveedor real',
          exposicion_pct: Number.isNaN(exposicion) ? null : exposicion,
          categorias,
        }, ctx),
      );
    }
  }
  return out;
}

function evalLookup(
  tip: Tipologia,
  regla: Extract<ReglaDsl, { tipo: 'lookup' }>,
  ops: OperacionEval[],
  ctx: MotorContext,
): HallazgoCandidato[] {
  const out: HallazgoCandidato[] = [];
  for (const o of ops) {
    const valor = valorEnCampo(o, regla.campo);
    if (valor == null || valor === '') continue;

    if (regla.valores && regla.valores.length) {
      // Variante por lista de valores (ej. XVI-08 privacy coins sobre activo_virtual).
      if (regla.valores.includes(String(valor))) {
        out.push(
          candidato(o, tip, o.client_id, { campo: regla.campo, valor: String(valor), match: 'valores' }, ctx),
        );
      }
    } else if (regla.fuentes && regla.fuentes.length) {
      // Variante por catálogo de países (ej. XVI-04 país de alto riesgo).
      const iso = String(valor).toUpperCase();
      const fuentesMatch = regla.fuentes.filter((f) => ctx.paisPorFuente[f]?.has(iso));
      if (fuentesMatch.length) {
        out.push(
          candidato(o, tip, o.client_id, {
            campo: regla.campo,
            valor: iso,
            fuentes: fuentesMatch,
            fuente_mock: true, // DEMO — listas como snapshot versionado en BD, no en tiempo real
            nota: 'DEMO — listas OFAC/GAFI como snapshot en BD, sin consulta en tiempo real',
          }, ctx),
        );
      }
    }
  }
  return out;
}

function evalDuplicado(
  tip: Tipologia,
  regla: Extract<ReglaDsl, { tipo: 'duplicado' }>,
  ops: OperacionEval[],
  ctx: MotorContext,
): HallazgoCandidato[] {
  const out: HallazgoCandidato[] = [];
  // campo → valor → { clientes, operaciones }
  const idx: Record<string, Record<string, { clientes: Set<string>; ops: OperacionEval[] }>> = {};

  for (const o of ops) {
    const cp = o.contraparte ?? {};
    for (const campo of regla.campos) {
      const v = cp[campo];
      if (v == null || v === '') continue;
      const key = String(v);
      const porCampo = (idx[campo] ??= {});
      const bucket = (porCampo[key] ??= { clientes: new Set(), ops: [] });
      bucket.clientes.add(o.client_id);
      bucket.ops.push(o);
    }
  }

  const marcadas = new Set<string>();
  for (const campo of regla.campos) {
    for (const [valor, bucket] of Object.entries(idx[campo] ?? {})) {
      if (bucket.clientes.size >= regla.umbral_cuentas) {
        for (const o of bucket.ops) {
          if (marcadas.has(o.id)) continue;
          marcadas.add(o.id);
          out.push(
            candidato(o, tip, o.client_id, {
              campo,
              valor,
              cuentas: [...bucket.clientes],
              umbral_cuentas: regla.umbral_cuentas,
            }, ctx),
          );
        }
      }
    }
  }
  return out;
}

function evalDesviacion(
  tip: Tipologia,
  regla: Extract<ReglaDsl, { tipo: 'desviacion' }>,
  ops: OperacionEval[],
  ctx: MotorContext,
): HallazgoCandidato[] {
  const out: HallazgoCandidato[] = [];
  const inicioMes = new Date(ctx.ahora.getFullYear(), ctx.ahora.getMonth(), 1).getTime();
  const finRef = ctx.ahora.getTime();
  const grupos = agrupar(ops, (o) => o.client_id);

  for (const [clientId, lista] of grupos) {
    const h = ctx.historialPorCliente[clientId] ?? HISTORIAL_VACIO;

    // Una regla de comportamiento sobre un cliente sin trayectoria no mide
    // nada: «se desvió de su patrón» exige que exista un patrón. Si la regla
    // pide madurez y el cliente no la tiene, no dispara.
    if (faltaLineaBase(regla, h)) continue;

    // Contra qué se compara. Antes el DSL decía `promedio_historico_mensual`
    // pero el código usaba el perfil DECLARADO: la regla decía una cosa y
    // hacía otra. Ahora cada modo hace lo que su nombre dice.
    let base: number | undefined;
    let origenBase: string;

    if (regla.comparar === 'promedio_historico_mensual') {
      // Promedio real del cliente, excluyendo el mes en curso: incluirlo haría
      // que la operación bajo examen inflara su propia referencia.
      if (h.mesesConActividad < 1) continue;
      base = h.promedioMensualUmaHistorico;
      origenBase = 'promedio histórico del cliente';
    } else {
      base = ctx.perfilMensualUmaPorCliente[clientId];
      origenBase = 'perfil transaccional declarado';
    }

    // Fail-closed: sin referencia no se inventa una. No disparar es correcto;
    // lo que no sería correcto es compararlo contra cero.
    if (base == null || base <= 0) continue;

    const delMes = lista.filter((o) => ms(o.fecha) >= inicioMes && ms(o.fecha) <= finRef);
    if (delMes.length === 0) continue;
    const sumaUma = delMes.reduce((s, o) => s + o.monto_mxn / umaEnFecha(ctx, o.fecha), 0);

    if (sumaUma > base * regla.factor) {
      const rep = [...delMes].sort((a, b) => ms(b.fecha) - ms(a.fecha))[0];
      out.push(
        candidato(rep, tip, clientId, {
          comparar: regla.comparar,
          origen_base: origenBase,
          factor: regla.factor,
          base_uma: base,
          suma_mes_uma: sumaUma,
          operaciones: delMes.map((o) => o.id),
        }, ctx),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------

/** Evalúa una tipología contra el conjunto de operaciones. */
export function evaluarTipologia(
  tip: Tipologia,
  ops: OperacionEval[],
  ctx: MotorContext,
  /** Dónde asentar las negativas a evaluar. Opcional: sin él se pierden, y por
   *  eso `correrMotor` siempre lo pasa (instrucción 324). */
  noEvaluados?: NoEvaluado[],
): HallazgoCandidato[] {
  const regla = tip.regla_dsl;

  // ---------------------------------------------------------------
  // Vigencia de la REGLA, antes de evaluar nada
  // ---------------------------------------------------------------
  // Una regla puede declarar desde cuándo rige, y los actos anteriores no se
  // evalúan con ella: se rechazan con su motivo.
  //
  // Hace falta para lo que un parámetro por vigencia no alcanza a cubrir. El
  // caso que lo obligó es XII-04: hoy la constitución o el cambio patrimonial
  // de una persona moral genera Aviso SIEMPRE, sin umbral, porque la reforma
  // se lo quitó. Antes del 17 de julio de 2025 exigía 8,025 UMA. Esa regla no
  // tiene condición monetaria, así que no hay parámetro que versionar: lo que
  // cambió es la obligación entera, y evaluar un acto de 2024 con ella
  // produciría un Aviso que ese día no procedía.
  //
  // Se rechaza en vez de aplicar el régimen viejo porque el régimen viejo no
  // está cargado. Negarse ruidosamente es la conducta correcta cuando falta el
  // parámetro (instrucción 324); adivinarlo no lo es.
  const desde = (regla as { vigente_desde?: string }).vigente_desde;
  if (desde) {
    const anteriores = ops.filter((o) => o.fecha.slice(0, 10) < desde);
    if (anteriores.length > 0) {
      for (const o of anteriores) {
        noEvaluados?.push({
          tipologia_codigo: tip.codigo,
          tipologia_version: tip.version,
          operation_id: o.id,
          client_id: o.client_id,
          fecha: o.fecha,
          motivo:
            `Esta regla rige desde el ${desde} y el acto es del ${o.fecha.slice(0, 10)}. La ` +
            'obligación cambió con la reforma que entró en vigor el 17 de julio de 2025, y el ' +
            'régimen anterior no está cargado: medir el acto con la regla de hoy produciría un ' +
            'Aviso de más o de menos sin que nada lo señale.',
        });
      }
      // Los actos anteriores se retiran, y los posteriores se siguen midiendo:
      // una corrida puede traer actos de los dos lados del corte y no hay razón
      // para dejar sin evaluar los que sí se pueden.
      const evaluables = ops.filter((o) => o.fecha.slice(0, 10) >= desde);
      if (evaluables.length === 0) return [];
      ops = evaluables;
    }
  }

  switch (regla.tipo) {
    case 'agregado':
      return evalAgregado(tip, regla, ops, ctx, noEvaluados);
    case 'secuencia':
      return evalSecuencia(tip, regla, ops, ctx);
    case 'score':
      return evalScore(tip, regla, ops, ctx);
    case 'lookup':
      return evalLookup(tip, regla, ops, ctx);
    case 'duplicado':
      return evalDuplicado(tip, regla, ops, ctx);
    case 'desviacion':
      return evalDesviacion(tip, regla, ops, ctx);
    default:
      // Tipo desconocido: no dispara. El caller puede registrarlo como no soportado.
      return [];
  }
}

export interface ResultadoMotor {
  candidatos: HallazgoCandidato[];
  porTipologia: Record<string, number>;
  tiposNoSoportados: string[];
  /**
   * Lo que el motor se NEGÓ a evaluar, con su motivo.
   *
   * No es una lista de errores: es la constancia de que el control corrió y
   * decidió no medir un acto con el parámetro equivocado. Un motor que aplica
   * el umbral de hoy a un acto de 2024 no deja rastro; éste sí.
   */
  noEvaluados: NoEvaluado[];
}

/** Corre todas las tipologías activas y devuelve candidatos deduplicados
 *  por (operation_id, tipologia_id, tipologia_version) — el constraint de BD. */
export function correrMotor(
  tipologias: Tipologia[],
  ops: OperacionEval[],
  ctx: MotorContext,
): ResultadoMotor {
  const candidatos: HallazgoCandidato[] = [];
  const porTipologia: Record<string, number> = {};
  const tiposNoSoportados: string[] = [];
  const noEvaluados: NoEvaluado[] = [];
  const soportados = new Set(['agregado', 'secuencia', 'score', 'lookup', 'duplicado', 'desviacion']);

  for (const tip of tipologias) {
    if (!tip.activa) continue;
    const tipo = tip.regla_dsl?.tipo;
    if (!tipo || !soportados.has(tipo)) {
      tiposNoSoportados.push(`${tip.codigo}:${tipo ?? 'sin_tipo'}`);
      continue;
    }
    const disparos = evaluarTipologia(tip, ops, ctx, noEvaluados);
    // Passthrough genérico: si la tipología trae una `nota` en su regla_dsl
    // (p. ej. "referencia sujeta a confirmación"), viaja al regla_payload del
    // hallazgo para que el OC la vea.
    const nota = (tip.regla_dsl as { nota?: string }).nota;
    if (nota) for (const d of disparos) d.regla_payload.nota_referencia = nota;
    porTipologia[tip.codigo] = disparos.length;
    candidatos.push(...disparos);
  }

  // Dedup por el constraint único de `hallazgo`.
  const vistos = new Set<string>();
  const dedup: HallazgoCandidato[] = [];
  for (const c of candidatos) {
    const k = `${c.operation_id}|${c.tipologia_id}|${c.tipologia_version}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    dedup.push(c);
  }

  return { candidatos: dedup, porTipologia, tiposNoSoportados, noEvaluados };
}
