import { supabase } from '@/lib/supabase';
import type { RolUsuario } from '@/types/domain';

/**
 * Datos de la propia organización y su gente.
 *
 * La RLS ya acota todo a la organización de la sesión (`org_select_own`,
 * `user_profile_select_same_org`), así que estas consultas no llevan filtro
 * explícito: pedir todo devuelve sólo lo propio.
 */

export interface DatosOrganizacion {
  id: string;
  rfc: string;
  razon_social: string;
  sectores: string[];
  oficio_alta_sat: string | null;
  fecha_alta_sat: string | null;
  representante_legal: string | null;
  domicilio_fiscal: string | null;
  perfil_actividad: string | null;
}

export interface UsuarioOrganizacion {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  roles: RolUsuario[];
}

export async function getOrganizacion(): Promise<DatosOrganizacion | null> {
  const { data, error } = await supabase.from('organizations').select('*').maybeSingle();
  if (error) throw new Error(`No se pudieron leer los datos de la organización: ${error.message}`);
  return (data as unknown as DatosOrganizacion) ?? null;
}

export async function listarUsuariosOrganizacion(): Promise<UsuarioOrganizacion[]> {
  const [{ data: perfiles, error: errP }, { data: roles, error: errR }] = await Promise.all([
    supabase.from('user_profile').select('id, nombre, email, activo').order('nombre'),
    supabase.from('user_roles').select('user_id, rol'),
  ]);
  if (errP) throw new Error(`No se pudieron leer los usuarios: ${errP.message}`);
  if (errR) throw new Error(`No se pudieron leer los roles: ${errR.message}`);

  const porUsuario = new Map<string, RolUsuario[]>();
  for (const r of (roles ?? []) as { user_id: string; rol: RolUsuario }[]) {
    porUsuario.set(r.user_id, [...(porUsuario.get(r.user_id) ?? []), r.rol]);
  }

  return ((perfiles ?? []) as Omit<UsuarioOrganizacion, 'roles'>[]).map((p) => ({
    ...p,
    roles: porUsuario.get(p.id) ?? [],
  }));
}
