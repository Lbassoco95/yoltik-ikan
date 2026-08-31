import { supabase } from '@/lib/supabase';
import { contextoSesion } from './contexto';
import type { NuevaOperacionInput, Operation } from '@/types/domain';

export async function listarOperaciones(): Promise<Operation[]> {
  const { data, error } = await supabase
    .from('operation')
    .select('*')
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Operation[];
}

export async function listarOperacionesDeCliente(clientId: string): Promise<Operation[]> {
  const { data, error } = await supabase
    .from('operation')
    .select('*')
    .eq('client_id', clientId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Operation[];
}

/** Registra una operación capturada por el Operador. */
export async function crearOperacion(input: NuevaOperacionInput): Promise<Operation> {
  const { uid, organizationId } = await contextoSesion();
  const fila = {
    organization_id: organizationId,
    client_id: input.client_id,
    tipo: input.tipo,
    monto_mxn: input.monto_mxn,
    moneda_origen: input.moneda_origen ?? 'MXN',
    activo_virtual: input.activo_virtual ?? null,
    contraparte: input.contraparte ?? null,
    fecha: input.fecha ?? new Date().toISOString(),
    instrumento_publico: input.instrumento_publico ?? null,
    datos_acto: input.datos_acto ?? {},
    capturado_por: uid,
  };
  const { data, error } = await supabase.from('operation').insert(fila).select('*').single();
  if (error) throw error;
  return data as unknown as Operation;
}

/**
 * Completa el subárbol del acto de una operación ya registrada.
 *
 * Sólo OC y Admin: la política `operation_update_motor_or_oc` lo exige y el
 * modelo de roles dice que el flujo del Operador termina con el acuse. Un
 * Operador que llame esto recibe un error de la base, no una escritura
 * silenciosa.
 */
export async function actualizarDatosActo(
  operationId: string,
  datosActo: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('operation')
    .update({ datos_acto: datosActo })
    .eq('id', operationId);
  if (error) throw error;
}

/** Invoca la Edge Function motor-pld tras el alta de una operación. El acuse al
 *  Operador es neutro: el motor corre en segundo plano y sus hallazgos los
 *  consume el OC. Un fallo al invocar NO rompe el alta (se registra en consola).
 *  Para una corrida manual con feedback real, usar `recorrerMotor()`. */
export async function invocarMotor(operationId?: string): Promise<void> {
  try {
    const { organizationId } = await contextoSesion();
    const { error } = await supabase.functions.invoke('motor-pld', {
      body: { organization_id: organizationId, trigger_tipo: 'manual', operation_id: operationId },
    });
    if (error) console.warn('[motor-pld] no se pudo invocar:', error.message);
  } catch (e) {
    console.warn('[motor-pld] no se pudo invocar:', (e as Error).message);
  }
}

export interface MotorRunResultado {
  ok: boolean;
  operaciones_procesadas: number;
  hallazgos_creados: number;
  /** Hallazgos abiertos que pasaron a una versión más nueva de su tipología en
   *  vez de duplicarse al lado del anterior. */
  hallazgos_reversionados?: number;
  por_tipologia?: Record<string, number>;
  operaciones_marcadas_aviso?: number;
  /** Cuántas quedaron con constancia de evaluación. Sólo un recorrido completo
   *  la sella: la corrida del alta ve una sola operación y no puede firmar que
   *  el acto quedó juzgado contra las reglas agregadas. */
  operaciones_evaluadas?: number;
  duracion_ms?: number;
}

/** Corre el motor sobre TODAS las operaciones de la organización (botón
 *  "Recorrer motor" del OC). A diferencia de `invocarMotor`, NO traga errores:
 *  lanza si la sesión/organización no se resuelve o si la función devuelve
 *  error, para que la UI distinga un éxito real de uno falso. Devuelve el
 *  resumen de la corrida (2xx). */
export async function recorrerMotor(): Promise<MotorRunResultado> {
  const { organizationId } = await contextoSesion();
  const { data, error } = await supabase.functions.invoke('motor-pld', {
    body: { organization_id: organizationId, trigger_tipo: 'manual' },
  });
  if (error) {
    // supabase-js envuelve el cuerpo del error en error.context (Response).
    let detalle = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) detalle = body.error;
    } catch {
      /* sin cuerpo JSON; se queda con error.message */
    }
    throw new Error(detalle);
  }
  return data as MotorRunResultado;
}
