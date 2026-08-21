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
// NO inventa umbrales: cada valor viene de la tipología (regla_dsl) o de la
// operación. El valor de la UMA es la única constante y se toma de la misma
// referencia que el front (src/lib/utils.ts).
// =====================================================================

// UMA 2026 — referencia. Espejo de src/lib/utils.ts (UMA_MXN). Verificar al
// cierre de cada año con INEGI.
// TODO[RCG-0]: unificar esta constante con el front en una sola fuente de verdad
// cuando el motor y el front compartan un paquete común.
export const UMA_MXN = 113.07;

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
      comparar: string;
    };

/** Subconjunto de `operation` (+ contexto) que el motor necesita. */
export interface OperacionEval {
  id: string;
  organization_id: string;
  client_id: string;
  tipo: string; // enum tipo_operacion
  monto_mxn: number;
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
  umaMxn: number;
  /** Momento de referencia para ventanas relativas (`desviacion`). */
  ahora: Date;
  /** Membresía país→lista: fuente (gafi_negra, ofac_sancionado, ...) → set de iso2. */
  paisPorFuente: Record<string, Set<string>>;
  /** Perfil transaccional mensual declarado por cliente, en UMA (para `desviacion`). */
  perfilMensualUmaPorCliente: Record<string, number>;
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
): HallazgoCandidato {
  return {
    operation_id: op?.id ?? null,
    client_id: clientId,
    tipologia_id: tip.id,
    tipologia_codigo: tip.codigo,
    tipologia_nombre: tip.nombre,
    tipologia_version: tip.version,
    severidad: tip.severidad,
    regla_payload: { evaluado_en: 'motor-pld', ...payload },
  };
}

// ---------------------------------------------------------------------
// Evaluadores por tipo
// ---------------------------------------------------------------------

function metricasVentana(ops: OperacionEval[], ctx: MotorContext): Record<string, number> {
  const suma_monto_mxn = ops.reduce((s, o) => s + o.monto_mxn, 0);
  return {
    count: ops.length,
    suma_monto_mxn,
    suma_monto_uma: suma_monto_mxn / ctx.umaMxn,
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
  const grupos = agrupar(ops, (o) => String(valorEnCampo(o, regla.agrupar_por) ?? o.client_id));
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
          }),
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
            }),
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
        }),
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
          candidato(o, tip, o.client_id, { campo: regla.campo, valor: String(valor), match: 'valores' }),
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
          }),
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
            }),
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
    const base = ctx.perfilMensualUmaPorCliente[clientId];
    if (base == null || base <= 0) continue; // sin perfil declarado → no dispara (fail-closed)

    const delMes = lista.filter((o) => ms(o.fecha) >= inicioMes && ms(o.fecha) <= finRef);
    if (delMes.length === 0) continue;
    const sumaUma = delMes.reduce((s, o) => s + o.monto_mxn, 0) / ctx.umaMxn;

    if (sumaUma > base * regla.factor) {
      const rep = [...delMes].sort((a, b) => ms(b.fecha) - ms(a.fecha))[0];
      out.push(
        candidato(rep, tip, clientId, {
          comparar: regla.comparar,
          factor: regla.factor,
          base_uma: base,
          suma_mes_uma: sumaUma,
          operaciones: delMes.map((o) => o.id),
        }),
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
      return evalSecuencia(tip, regla, ops);
    case 'score':
      return evalScore(tip, regla, ops);
    case 'lookup':
      return evalLookup(tip, regla, ops, ctx);
    case 'duplicado':
      return evalDuplicado(tip, regla, ops);
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
