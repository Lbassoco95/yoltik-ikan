import { supabase } from '@/lib/supabase';
import type { ClientRiskTemplate, MatrizConfig, SectorAV } from '@/types/domain';


/** Versiones de la matriz de riesgo de la organización, más nueva primero.
 *  RLS filtra por organización (migration 0010). */
export async function listarVersionesMatriz(sector: SectorAV): Promise<ClientRiskTemplate[]> {
  const { data, error } = await supabase
    .from('client_risk_template')
    .select('*')
    .eq('sector', sector)
    .order('version', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ClientRiskTemplate[];
}

/** Crea (o recupera) el borrador abierto de la organización para ese sector.
 *  La función de BD clona la versión activa y es idempotente: si ya hay un
 *  borrador abierto lo devuelve en vez de crear un segundo. */
export async function crearBorradorMatriz(
  organizationId: string,
  sector: SectorAV,
  notas?: string,
): Promise<ClientRiskTemplate> {
  const { data, error } = await supabase.rpc('crear_borrador_matriz', {
    p_organization_id: organizationId,
    p_sector: sector,
    p_notas: notas ?? null,
  });
  if (error) throw error;
  return data as unknown as ClientRiskTemplate;
}

/** Guarda cambios sobre un borrador. Sobre una versión publicada la BD lo
 *  rechaza (RLS + trigger de inmutabilidad), no hace falta validarlo aquí. */
export async function guardarBorradorMatriz(
  templateId: string,
  configuracion: MatrizConfig,
  notas?: string,
): Promise<void> {
  const { error } = await supabase
    .from('client_risk_template')
    .update({ configuracion, ...(notas !== undefined ? { notas_version: notas } : {}) })
    .eq('id', templateId);
  if (error) throw error;
}

/** Publica el borrador: lo vuelve la versión activa, desactiva la anterior y
 *  deja registro en `audit_log`. Solo el OC. */
export async function publicarMatriz(templateId: string): Promise<ClientRiskTemplate> {
  const { data, error } = await supabase.rpc('publicar_matriz', { p_template_id: templateId });
  if (error) throw error;
  return data as unknown as ClientRiskTemplate;
}

/** Cuenta variables de una configuración, para los resúmenes de la UI. */
export function contarVariables(cfg: MatrizConfig): number {
  return cfg.elementos.reduce((n, e) => n + e.variables.length, 0);
}
