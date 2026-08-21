import { supabase } from '@/lib/supabase';
import type { Hallazgo } from '@/types/domain';

/** Lista los hallazgos del Motor PLD para la bandeja del OC.
 *  RLS filtra por organización y rol (solo oc/admin ven hallazgos). */
export async function listarHallazgos(): Promise<Hallazgo[]> {
  const { data, error } = await supabase
    .from('hallazgo')
    .select(
      '*, client:client_id(nombre_razon_social), operation:operation_id(monto_mxn, activo_virtual, fecha)',
    )
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Hallazgo[];
}

/** Conteo de hallazgos abiertos (badge del sidebar). */
export async function contarHallazgosAbiertos(): Promise<number> {
  const { count, error } = await supabase
    .from('hallazgo')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'abierto');
  if (error) throw error;
  return count ?? 0;
}
