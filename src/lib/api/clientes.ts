import { supabase } from '@/lib/supabase';
import { contextoSesion } from './contexto';
import type { Client, ClientRiskTemplate, NuevoClienteInput, SectorAV } from '@/types/domain';
import { evaluarMatriz, respuestasCompletas, type ResultadoEvaluacion } from '@/lib/riesgo/matriz';

/** Lista los clientes visibles para el usuario (RLS filtra por rol/organización). */
export async function listarClientes(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('client')
    .select('*')
    .order('capturado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Client[];
}

export async function getCliente(id: string): Promise<Client | null> {
  const { data, error } = await supabase.from('client').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as unknown as Client) ?? null;
}

/** Alta de cliente final por el Operador. organization_id y capturado_por
 *  se resuelven desde la sesión (no viajan en el formulario). */
export async function crearCliente(input: NuevoClienteInput): Promise<Client> {
  const { uid, organizationId } = await contextoSesion();
  const fila = {
    organization_id: organizationId,
    tipo_persona: input.tipo_persona,
    nombre_razon_social: input.nombre_razon_social,
    // Campos que el aviso pide por separado (layout fep 3.5.x, migration 0019).
    // Se mandan siempre, incluso en null, para que un alta corregida borre lo
    // que ya no aplica en vez de arrastrarlo.
    nombre: input.nombre ?? null,
    apellido_paterno: input.apellido_paterno ?? null,
    apellido_materno: input.apellido_materno ?? null,
    fecha_nacimiento: input.fecha_nacimiento ?? null,
    fecha_constitucion: input.fecha_constitucion ?? null,
    pais_nacionalidad_clave: input.pais_nacionalidad_clave ?? null,
    actividad_economica_clave: input.actividad_economica_clave ?? null,
    entidad_federativa_clave: input.entidad_federativa_clave ?? null,
    rfc: input.rfc ?? null,
    curp: input.curp ?? null,
    nacionalidad: input.nacionalidad ?? null,
    entidad_federativa: input.entidad_federativa ?? null,
    pais_residencia_iso2: input.pais_residencia_iso2 ?? null,
    datos_kyc: input.datos_kyc ?? {},
    capturado_por: uid,
  };
  const { data, error } = await supabase.from('client').insert(fila).select('*').single();
  if (error) throw error;
  return data as unknown as Client;
}

/** Plantilla de matriz de riesgo vigente de la organización.
 *
 *  No filtra por sector a propósito: RLS ya acota a la organización y la
 *  migration 0010 garantiza una sola versión activa por organización y sector.
 *  Así sirve igual a Ixim Pay (XVI) que a la notaría (XII) sin condicionales
 *  por perfil.
 *  TODO[Sprint D-3]: recibir el sector cuando una organización opere más de uno. */
/**
 * Plantilla vigente para un sector.
 *
 * El sector es OBLIGATORIO. Antes esta función tomaba cualquier plantilla
 * activa de la organización, pero el índice único de la 0010 es
 * `(organization_id, sector) where activa`: una organización puede tener una
 * matriz activa POR SECTOR. Sin filtrar, una notaría con una plantilla XVI
 * espuria podía evaluar a un compareciente con la matriz de un exchange.
 */
export async function getPlantillaRiesgoActiva(
  sector: SectorAV,
): Promise<ClientRiskTemplate | null> {
  const { data, error } = await supabase
    .from('client_risk_template')
    .select('*')
    .eq('activa', true)
    .eq('sector', sector)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ClientRiskTemplate) ?? null;
}

export interface EvaluacionGuardada extends ResultadoEvaluacion {
  id: string;
}

/**
 * Calcula y guarda la evaluación de riesgo de un cliente.
 *
 * Rechaza la captura incompleta antes de tocar la BD: `client_risk_assessment`
 * exige `score_total` y `clasificacion` no nulos, y un score parcial sería un
 * dato falso, no uno provisional.
 */
export async function evaluarRiesgoCliente(
  plantilla: ClientRiskTemplate,
  cliente: Pick<Client, 'id' | 'tipo_persona'>,
  respuestas: Record<string, number>,
): Promise<EvaluacionGuardada> {
  const cfg = plantilla.configuracion;
  if (!respuestasCompletas(cfg, cliente.tipo_persona, respuestas)) {
    throw new Error('La captura está incompleta: responde todas las variables aplicables.');
  }

  const resultado = evaluarMatriz(cfg, cliente.tipo_persona, respuestas);
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;

  const { data, error } = await supabase
    .from('client_risk_assessment')
    .insert({
      client_id: cliente.id,
      template_id: plantilla.id,
      respuestas,
      subtotales: resultado.subtotales,
      score_total: resultado.score_total,
      clasificacion: resultado.clasificacion,
      motivo_alto_de_oficio: resultado.motivo_alto_de_oficio,
      evaluado_por: uid,
    })
    .select('id')
    .single();
  if (error) throw error;

  return { ...resultado, id: (data as { id: string }).id };
}
