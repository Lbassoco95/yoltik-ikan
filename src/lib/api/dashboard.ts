import { supabase } from '@/lib/supabase';
import type { ClasificacionRiesgo, EstadoHallazgo } from '@/types/domain';

/**
 * Métricas del tablero, todas contra la base.
 *
 * Antes esta pantalla era `mockData` completo: clientes, alertas, operaciones
 * por día y distribución de riesgo, todo inventado. Es la primera pantalla que
 * ve un notario, así que era el peor lugar para tener datos falsos.
 *
 * Lo que no se puede calcular NO se muestra. No hay variaciones porcentuales
 * («+12%») porque no hay histórico contra el cual compararlas: inventar una
 * tendencia es peor que no mostrarla.
 */

export interface OperacionPorDia {
  fecha: string;
  total: number;
}

export interface MetricasTablero {
  clientesActivos: number;
  operacionesDelMes: number;
  hallazgosAbiertos: number;
  /** Hallazgos abiertos cuyo SLA interno es de 24 horas. */
  hallazgosUrgentes: number;
  hallazgosPorEstado: Record<EstadoHallazgo, number>;
  riesgoPorNivel: { nivel: ClasificacionRiesgo; total: number }[];
  operacionesPorDia: OperacionPorDia[];
  /** Cuántos clientes todavía no tienen matriz evaluada. Se muestra porque es
   *  un pendiente real de cumplimiento, no un hueco de la interfaz. */
  clientesSinEvaluar: number;
}

const ESTADOS_ABIERTOS: EstadoHallazgo[] = ['abierto', 'en_revision'];

function isoHaceDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function metricasTablero(): Promise<MetricasTablero> {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [clientes, operacionesMes, operaciones14d, hallazgos, evaluaciones] = await Promise.all([
    supabase.from('client').select('id', { count: 'exact', head: true }).eq('activo', true),
    supabase
      .from('operation')
      .select('id', { count: 'exact', head: true })
      .gte('fecha', inicioMes.toISOString()),
    supabase.from('operation').select('fecha').gte('fecha', isoHaceDias(13)),
    supabase.from('hallazgo').select('estado, clasificacion_urgencia'),
    // La matriz vigente de cada cliente es su evaluación más reciente. Se
    // resuelve en el cliente porque el volumen del demo lo permite.
    // TODO[Sprint D-3]: vista `v_riesgo_vigente` cuando crezca el volumen.
    supabase
      .from('client_risk_assessment')
      .select('client_id, clasificacion, evaluado_en')
      .order('evaluado_en', { ascending: false }),
  ]);

  const primerError = [clientes, operacionesMes, operaciones14d, hallazgos, evaluaciones].find(
    (r) => r.error,
  );
  if (primerError?.error) {
    throw new Error(`No se pudieron leer las métricas: ${primerError.error.message}`);
  }

  // --- Hallazgos por estado ---
  const filasHallazgo = (hallazgos.data ?? []) as {
    estado: EstadoHallazgo;
    clasificacion_urgencia: string | null;
  }[];
  const hallazgosPorEstado = filasHallazgo.reduce(
    (acc, h) => {
      acc[h.estado] = (acc[h.estado] ?? 0) + 1;
      return acc;
    },
    {} as Record<EstadoHallazgo, number>,
  );
  const abiertos = filasHallazgo.filter((h) => ESTADOS_ABIERTOS.includes(h.estado));

  // --- Riesgo por nivel, tomando la evaluación más reciente de cada cliente ---
  const vistos = new Set<string>();
  const conteoRiesgo: Record<string, number> = {};
  for (const e of (evaluaciones.data ?? []) as {
    client_id: string;
    clasificacion: ClasificacionRiesgo;
  }[]) {
    if (vistos.has(e.client_id)) continue;
    vistos.add(e.client_id);
    conteoRiesgo[e.clasificacion] = (conteoRiesgo[e.clasificacion] ?? 0) + 1;
  }
  const ORDEN: ClasificacionRiesgo[] = ['bajo', 'medio', 'alto', 'alto_oficio'];
  const riesgoPorNivel = ORDEN.filter((n) => conteoRiesgo[n] > 0).map((nivel) => ({
    nivel,
    total: conteoRiesgo[nivel],
  }));

  // --- Operaciones por día, con los días vacíos incluidos ---
  // Sin los ceros la gráfica comprime el tiempo y sugiere una actividad
  // constante que no existe.
  const porDia = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    porDia.set(d.toISOString().slice(0, 10), 0);
  }
  for (const o of (operaciones14d.data ?? []) as { fecha: string }[]) {
    const clave = o.fecha.slice(0, 10);
    if (porDia.has(clave)) porDia.set(clave, (porDia.get(clave) ?? 0) + 1);
  }

  return {
    clientesActivos: clientes.count ?? 0,
    operacionesDelMes: operacionesMes.count ?? 0,
    hallazgosAbiertos: abiertos.length,
    hallazgosUrgentes: abiertos.filter((h) => h.clasificacion_urgencia === '24_horas').length,
    hallazgosPorEstado,
    riesgoPorNivel,
    operacionesPorDia: Array.from(porDia, ([fecha, total]) => ({ fecha, total })),
    clientesSinEvaluar: Math.max((clientes.count ?? 0) - vistos.size, 0),
  };
}
