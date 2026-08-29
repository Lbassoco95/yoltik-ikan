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
  const { session, roles, loading } = useAuth();
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
