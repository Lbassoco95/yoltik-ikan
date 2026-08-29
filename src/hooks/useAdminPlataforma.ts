import { useQuery } from '@tanstack/react-query';
import { esAdminPlataforma } from '@/lib/api/listas';
import { useAuth } from '@/lib/auth-context';

/**
 * ¿La sesión activa tiene privilegio de plataforma (Kawiil)?
 *
 * Es un privilegio GLOBAL que cruza organizaciones, por eso no vive en
 * `user_roles` ni en `activeRole`: un admin de Kawiil no administra una
 * notaría, administra la plataforma. Se resuelve contra `platform_admin`
 * (migration 0008), cuya política sólo deja ver la propia fila.
 */
export function useAdminPlataforma() {
  const { session, loading: cargandoSesion } = useAuth();

  const query = useQuery({
    queryKey: ['platform-admin', session?.user?.id ?? 'anon'],
    queryFn: esAdminPlataforma,
    enabled: Boolean(session?.user),
    staleTime: 15 * 60 * 1000,
  });

  return {
    esAdmin: query.data === true,
    // Mientras no se sepa, no se decide: negar el acceso antes de tiempo
    // manda al usuario al dashboard y parece un error de permisos.
    cargando: cargandoSesion || (Boolean(session?.user) && query.isLoading),
  };
}
