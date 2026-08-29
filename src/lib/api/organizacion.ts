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

// =====================================================================
// Claves del padrón SAT — rama 2 del layout de fe pública
// =====================================================================

/** Las tres claves que el aviso exige y que no se derivan de nada: el SAT las
 *  asigna al inscribirse en el padrón de actividades vulnerables. */
export interface ClavesPadron {
  clave_sujeto_obligado: string | null;
  clave_entidad_colegiada: string | null;
  clave_actividad: string | null;
}

const CLAVES_VACIAS: ClavesPadron = {
  clave_sujeto_obligado: null,
  clave_entidad_colegiada: null,
  clave_actividad: null,
};

/**
 * Claves del padrón de la organización de la sesión.
 *
 * Devuelve las tres en null si el remoto todavía no tiene la migration 0019:
 * la pantalla de pendientes debe poder decir "falta capturarlas" en vez de
 * romperse.
 */
export async function getClavesPadron(): Promise<ClavesPadron> {
  const { data, error } = await supabase
    .from('organizations')
    .select('clave_sujeto_obligado, clave_entidad_colegiada, clave_actividad')
    .maybeSingle();
  if (error) return CLAVES_VACIAS;
  return { ...CLAVES_VACIAS, ...((data ?? {}) as Partial<ClavesPadron>) };
}
