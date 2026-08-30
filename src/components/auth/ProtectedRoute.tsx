import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useAdminPlataforma } from '@/hooks/useAdminPlataforma';
import type { RolUsuario } from '@/types/domain';

interface Props {
  children: ReactNode;
  requireRole?: RolUsuario;
  requireAnyRole?: RolUsuario[];
  /** Privilegio de plataforma (Kawiil), ortogonal a los roles de organización. */
  requirePlatformAdmin?: boolean;
}

export function ProtectedRoute({
  children,
  requireRole,
  requireAnyRole,
  requirePlatformAdmin,
}: Props) {
  const { session, roles, loading, estadoMfa } = useAuth();
  const { esAdmin, cargando: cargandoAdmin } = useAdminPlataforma();
  const location = useLocation();

  if (loading || (requirePlatformAdmin && cargandoAdmin)) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // El 2FA es obligatorio: quien no lo tenga va al alta antes que a cualquier
  // otra pantalla. Se espera a saberlo (`null`) en vez de dejar pasar mientras
  // se pregunta, que sería un parpadeo por el que se cuela la sesión entera.
  //
  // `no_disponible` NO bloquea, a propósito. Significa que no se pudo
  // preguntarle a Auth —un problema de la plataforma, no del usuario— y dejar
  // al Oficial de Cumplimiento fuera de su propio sistema el día 17 por eso
  // sería peor que un día sin segundo factor. La cabecera lo enseña en rojo
  // para que no pase inadvertido.
  if (estadoMfa === null) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    );
  }
  if (estadoMfa === 'sin_inscribir' && location.pathname !== '/seguridad/2fa') {
    return <Navigate to="/seguridad/2fa" replace />;
  }

  if (requireRole && !roles.includes(requireRole)) {
    return <Navigate to="/" replace />;
  }

  if (requireAnyRole && !requireAnyRole.some((r) => roles.includes(r))) {
    return <Navigate to="/" replace />;
  }

  if (requirePlatformAdmin && !esAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
