import { supabase } from '@/lib/supabase';
import type { EstadoCatalogo, ValorCatalogo } from '@/lib/catalogos';

/** Estado de todos los catálogos: cuáles están cargados y desde cuándo.
 *  Lo lee cualquier usuario autenticado; escribirlos es sólo de Kawiil. */
export async function listarCatalogos(): Promise<EstadoCatalogo[]> {
  const { data, error } = await supabase
    .from('v_catalogos_estado')
    .select('*')
    .order('codigo');
  if (error) throw error;
  return (data ?? []) as unknown as EstadoCatalogo[];
}

/**
 * Valores vigentes de un catálogo, en el orden en que se cargaron.
 *
 * Devuelve arreglo vacío si el catálogo no existe o no está cargado. Quien
 * llama distingue los dos casos con `listarCatalogos()`; para pintar un select,
 * ambos significan lo mismo: no hay lista que ofrecer.
 */
export async function valoresDeCatalogo(codigo: string): Promise<ValorCatalogo[]> {
  const { data, error } = await supabase
    .from('v_catalogo_vigente')
    .select('clave, descripcion, orden')
    .eq('catalogo', codigo)
    .order('orden', { nullsFirst: false });
  if (error) return [];
  return (data ?? []) as unknown as ValorCatalogo[];
}

/**
 * Reemplaza los valores de un catálogo. Sólo un admin de plataforma: la base
 * lo vuelve a comprobar, así que un cliente que llame esto directo recibe un
 * error, no una carga.
 *
 * Devuelve cuántos valores quedaron vigentes.
 */
export async function reemplazarValoresCatalogo(
  codigo: string,
  valores: ValorCatalogo[],
  motivo?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('reemplazar_valores_catalogo', {
    p_codigo: codigo,
    p_valores: valores,
    p_motivo: motivo ?? null,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}
