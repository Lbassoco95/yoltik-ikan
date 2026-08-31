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

/**
 * Escritura del catálogo de parámetros.
 *
 * Todo pasa por las funciones de la migration 0029 y no por `insert`/`update`
 * a la tabla, y eso no es estilo: desde la 0029 `authenticated` ya no tiene
 * insert, update ni delete sobre `parametro_regulatorio`. Con `update` abierto
 * se podía reescribir un valor histórico y cambiar con qué UMA se juzgó un
 * acto de un año pasado, que es justo lo que la 0011 compró guardando la
 * vigencia.
 */

/** Lo que la base admite en `unidad`; el check de la 0011 rechaza lo demás. */
export const UNIDADES = [
  { valor: 'mxn', etiqueta: 'Pesos (MXN)' },
  { valor: 'uma', etiqueta: 'Veces la UMA' },
  { valor: 'dia', etiqueta: 'Días' },
  { valor: 'anio', etiqueta: 'Años' },
  { valor: 'porcentaje', etiqueta: 'Porcentaje' },
] as const;

/** Alcances válidos. '*' gana o pierde contra el sector según `parametro_vigente`:
 *  el específico del sector gana sobre el global. */
export const SECTORES = [
  { valor: '*', etiqueta: 'Todas las actividades' },
  { valor: 'IV', etiqueta: 'Fracción IV' },
  { valor: 'V', etiqueta: 'Fracción V' },
  { valor: 'VII', etiqueta: 'Fracción VII' },
  { valor: 'VIII', etiqueta: 'Fracción VIII' },
  { valor: 'XII', etiqueta: 'Fracción XII' },
  { valor: 'XV', etiqueta: 'Fracción XV' },
  { valor: 'XVI', etiqueta: 'Fracción XVI' },
] as const;

export interface NuevoParametro {
  codigo: string;
  nombre: string;
  valor: number;
  unidad: string;
  sector: string;
  vigente_desde: string;
  fuente: string;
  publicacion_dof?: string | null;
  url_fuente?: string | null;
  notas?: string | null;
}

/**
 * Fija el valor a partir de una fecha y cierra el anterior, en una sola
 * transacción. Los dos pasos por separado dejarían un hueco en el que
 * `parametro_vigente` no devuelve nada, y el motor leyendo cero.
 */
export async function fijarParametro(p: NuevoParametro): Promise<string> {
  const { data, error } = await supabase.rpc('fijar_parametro', {
    p_codigo: p.codigo.trim(),
    p_nombre: p.nombre.trim(),
    p_valor: p.valor,
    p_unidad: p.unidad,
    p_vigente_desde: p.vigente_desde,
    p_fuente: p.fuente.trim(),
    p_sector: p.sector,
    p_publicacion_dof: p.publicacion_dof?.trim() || null,
    p_url_fuente: p.url_fuente?.trim() || null,
    p_notas: p.notas?.trim() || null,
  });
  if (error) throw error;
  return data as unknown as string;
}

/**
 * Arregla un valor que TODAVÍA no entró en vigor.
 *
 * La base rechaza corregir lo que ya rige, y con razón: durante ese tiempo el
 * motor pudo haber calculado con ese número. Lo que ya rigió se cierra y se
 * abre una vigencia nueva; no se repinta.
 */
export async function corregirParametro(
  id: string,
  valor: number,
  fuente: string,
  motivo: string,
): Promise<void> {
  const { error } = await supabase.rpc('corregir_parametro', {
    p_id: id,
    p_valor: valor,
    p_fuente: fuente.trim(),
    p_motivo: motivo.trim(),
  });
  if (error) throw error;
}

/** Marca que Kawiil-Cumplimiento cotejó la cifra contra el texto legal. */
export async function confirmarParametro(id: string, quien: string): Promise<void> {
  const { error } = await supabase.rpc('confirmar_parametro', {
    p_id: id,
    p_quien: quien.trim(),
  });
  if (error) throw error;
}
