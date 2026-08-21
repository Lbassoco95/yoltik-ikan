import { supabase } from '@/lib/supabase';
import { contextoSesion } from './contexto';
import type { Client, ClientRiskTemplate, NuevoClienteInput } from '@/types/domain';

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

/** Plantilla de matriz de riesgo vigente del sector XVI. */
export async function getPlantillaRiesgoXVI(): Promise<ClientRiskTemplate | null> {
  const { data, error } = await supabase
    .from('client_risk_template')
    .select('*')
    .eq('sector', 'XVI')
    .eq('activa', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ClientRiskTemplate) ?? null;
}
