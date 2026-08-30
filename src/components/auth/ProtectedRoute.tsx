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

  // Se dice, no se redirige.
  //
  // Redirigir a "/" era un bucle: en la consola de plataforma "/" es ESTA
  // MISMA ruta protegida, así que quien no tenía el privilegio rebotaba
  // indefinidamente sin ver nunca por qué. Y aunque no lo fuera, mandar a
  // alguien al inicio sin explicación no le dice si le falta un permiso, si se
  // equivocó de dirección o si la aplicación está rota.
  if (requirePlatformAdmin && !esAdmin) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="ikan-card max-w-sm text-center space-y-2">
          <h1 className="text-lg font-bold text-foreground">Consola de plataforma</h1>
          <p className="text-sm text-muted-foreground">
            Tu cuenta no tiene privilegio de administrador de plataforma. Esta consola es de
            Kawiil y desde aquí se configura lo que afecta a todas las organizaciones.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Si necesitas entrar, pídeselo a quien administre la plataforma.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
