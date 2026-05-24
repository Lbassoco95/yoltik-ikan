import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { RolUsuario } from '@/types/domain';

interface Props {
  children: ReactNode;
  requireRole?: RolUsuario;
  requireAnyRole?: RolUsuario[];
}

export function ProtectedRoute({ children, requireRole, requireAnyRole }: Props) {
  const { session, roles, loading } = useAuth();
  const location = useLocation();

  if (loading) {
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

  return <>{children}</>;
}
