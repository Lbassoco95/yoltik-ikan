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
  valor: number;
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
      return n * 30 * 86_400_000; // aproximación; suficiente para volúmenes mensuales del demo
    default:
      throw new Error(`unidad de ventana no soportada: "${m[2]}"`);
  }
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
function condicionesCumplen(
  condicion: Record<string, Condicion>,
  metricas: Record<string, number>,
): boolean {
  const claves = Object.keys(condicion);
  if (claves.length === 0) return false;
  for (const clave of claves) {
    const metrica = metricas[clave];
    if (metrica === undefined || Number.isNaN(metrica)) return false; // fail-closed
    if (!comparar(condicion[clave].op, metrica, condicion[clave].valor)) return false;
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
    clasificacion_urgencia: clasificacionUrgencia(tip.regla_dsl),
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
): HallazgoCandidato[] {
  const win = ventanaAMs(regla.ventana);

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
    // Ventana deslizante: cada operación cierra una ventana hacia atrás.
    for (let i = 0; i < sorted.length; i++) {
      const fin = sorted[i];
      const inicio = ms(fin.fecha) - win;
      const enVentana = sorted.filter((o) => ms(o.fecha) > inicio && ms(o.fecha) <= ms(fin.fecha));
      const met = metricasVentana(enVentana, ctx);
      if (condicionesCumplen(regla.condicion, met)) {
        out.push(
          candidato(fin, tip, fin.client_id, {
            ventana: regla.ventana,
            agrupar_por: regla.agrupar_por,
            grupo: clave,
            metricas: met,
            operaciones: enVentana.map((o) => o.id),
          }, ctx),
        );
        break; // un hallazgo por grupo (primera ventana que dispara)
      }
    }
  }
  return out;
}

function evalSecuencia(
  tip: Tipologia,
  regla: Extract<ReglaDsl, { tipo: 'secuencia' }>,
  ops: OperacionEval[],
  ctx: MotorContext,
): HallazgoCandidato[] {
  const win = ventanaAMs(regla.ventana);
  const grupos = agrupar(ops, (o) => o.client_id);
  const out: HallazgoCandidato[] = [];
  const secuencia = regla.secuencia;
  if (secuencia.length < 2) return out;

  for (const [, lista] of grupos) {
    const sorted = [...lista].sort((a, b) => ms(a.fecha) - ms(b.fecha));
    // Busca la secuencia ordenada de `tipo` dentro de la ventana, arrancando en cada índice.
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].tipo !== secuencia[0]) continue;
      const t0 = ms(sorted[i].fecha);
      let paso = 1;
      let ultimo = sorted[i];
      for (let j = i + 1; j < sorted.length && paso < secuencia.length; j++) {
        if (ms(sorted[j].fecha) - t0 > win) break;
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
    if (condExp) dispara = dispara && !Number.isNaN(exposicion) && comparar(condExp.op, exposicion, condExp.valor);
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
): HallazgoCandidato[] {
  const regla = tip.regla_dsl;
  switch (regla.tipo) {
    case 'agregado':
      return evalAgregado(tip, regla, ops, ctx);
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
  const soportados = new Set(['agregado', 'secuencia', 'score', 'lookup', 'duplicado', 'desviacion']);

  for (const tip of tipologias) {
    if (!tip.activa) continue;
    const tipo = tip.regla_dsl?.tipo;
    if (!tipo || !soportados.has(tipo)) {
      tiposNoSoportados.push(`${tip.codigo}:${tipo ?? 'sin_tipo'}`);
      continue;
    }
    const disparos = evaluarTipologia(tip, ops, ctx);
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

  return { candidatos: dedup, porTipologia, tiposNoSoportados };
}
