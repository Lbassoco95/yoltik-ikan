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
    capturado_por: uid,
  };
  const { data, error } = await supabase.from('operation').insert(fila).select('*').single();
  if (error) throw error;
  return data as unknown as Operation;
}

/** Invoca la Edge Function motor-pld. El acuse al Operador es neutro: el motor
 *  corre en segundo plano y sus hallazgos los consume el OC. Un fallo al invocar
 *  no rompe el alta de la operación (se registra en consola). */
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
