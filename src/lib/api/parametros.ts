import { supabase } from '@/lib/supabase';
import type { ParametroVigente } from '@/lib/parametros';

/**
 * Lectura de parámetros regulatorios contra la base.
 * La lógica de resolución (qué parámetro gana, si está confirmado) es pura y
 * vive en `src/lib/parametros.ts`.
 */
export async function listarParametrosVigentes(): Promise<ParametroVigente[]> {
  const { data, error } = await supabase
    .from('v_parametros_vigentes')
    .select('*')
    .order('codigo');

  if (error) throw new Error(`No se pudieron leer los parámetros regulatorios: ${error.message}`);
  return (data ?? []) as unknown as ParametroVigente[];
}
