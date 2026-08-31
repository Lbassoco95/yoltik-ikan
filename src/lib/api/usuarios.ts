import { supabase } from '@/lib/supabase';

/**
 * Usuarios de todas las organizaciones, para la consola de Kawiil.
 *
 * Todo pasa por funciones de la base y no por `select` a las tablas: los datos
 * viven en `auth.users`, donde `authenticated` no tiene ningún privilegio, y
 * la comprobación de quién pregunta la hace la migration 0028 del lado del
 * servidor. Si llama alguien que no es de Kawiil recibe una lista vacía, no un
 * error — igual que con los prospectos, y por la misma razón: ni siquiera debe
 * saber cuántos usuarios hay.
 */

export interface UsuarioPlataforma {
  user_id: string;
  nombre: string;
  email: string;
  organization_id: string | null;
  organizacion: string | null;
  roles: string[];
  activo: boolean;
  es_kawiil: boolean;
  /**
   * Factores TOTP dados de alta y confirmados.
   *
   * Con 0 esa persona NO está bloqueada: inicia sesión con su contraseña y
   * `ProtectedRoute` la manda a inscribirse antes de dejarla ver nada. Lo que
   * falta es el alta, no el acceso — y por eso reponerle el factor a alguien
   * así no arregla nada; la función de la 0028 lo rechaza a propósito.
   */
  factores_verificados: number;
  /** Empezados y no confirmados: quedan de un alta que no se terminó. Tampoco
   *  encierran a nadie; `iniciarInscripcion` los limpia al volver a empezar. */
  factores_pendientes: number;
  ultimo_acceso: string | null;
  creado_en: string;
}

export const ETIQUETA_ROL: Record<string, string> = {
  operador: 'Operador',
  oc: 'Oficial de Cumplimiento',
  admin: 'Administrador',
};

export async function listarUsuarios(): Promise<UsuarioPlataforma[]> {
  const { data, error } = await supabase.rpc('usuarios_de_plataforma');
  if (error) throw error;
  return (data ?? []) as unknown as UsuarioPlataforma[];
}

/** Lo que la función devuelve al reponer: sirve para decir qué pasó de verdad. */
export interface ResultadoReposicion {
  evento_id: string;
  email: string;
  factores_eliminados: number;
  sesiones_cerradas: number;
}

/** Mínimo que la base exige en el motivo. Se valida aquí sólo para avisar
 *  antes de mandar; quien manda de verdad es la migration 0028. */
export const MINIMO_MOTIVO = 10;

/**
 * Le quita a alguien su segundo factor y cierra sus sesiones.
 *
 * Es la acción más delicada de la consola: entre que se ejecuta y que la
 * persona vuelve a darse de alta el TOTP, su cuenta se abre con sólo la
 * contraseña. Por eso el motivo es obligatorio y queda firmado en la cadena de
 * auditoría de SU organización, no en una bitácora interna de Kawiil.
 */
export async function reponerSegundoFactor(
  userId: string,
  motivo: string,
): Promise<ResultadoReposicion> {
  const { data, error } = await supabase.rpc('reponer_segundo_factor', {
    p_user_id: userId,
    p_motivo: motivo.trim(),
  });
  if (error) throw error;
  return data as unknown as ResultadoReposicion;
}
