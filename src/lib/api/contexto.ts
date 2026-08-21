import { supabase } from '@/lib/supabase';

/**
 * Resuelve el contexto de la sesión activa: uid y organización.
 * Las inserciones en `client`/`operation` exigen (por RLS) `organization_id =
 * current_org_id()` y `capturado_por = auth.uid()`, así que la capa de API
 * necesita ambos valores desde el perfil real, no desde el front.
 */
export interface ContextoSesion {
  uid: string;
  organizationId: string;
}

export async function contextoSesion(): Promise<ContextoSesion> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (userErr || !uid) throw new Error('No hay sesión activa.');

  const { data, error } = await supabase
    .from('user_profile')
    .select('organization_id')
    .eq('id', uid)
    .single();

  if (error || !data) {
    throw new Error(
      'No se encontró el perfil del usuario (user_profile). ¿Falta correr bootstrap:users?',
    );
  }

  return { uid, organizationId: (data as { organization_id: string }).organization_id };
}
