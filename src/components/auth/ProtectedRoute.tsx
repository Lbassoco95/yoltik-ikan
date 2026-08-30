import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
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

  // El 2FA es obligatorio, sin excepción. Se espera a SABERLO (`null`) en vez
  // de dejar pasar mientras se pregunta: ese parpadeo es por donde se cuela la
  // sesión entera.
  //
  // Antes `no_disponible` dejaba pasar, con el argumento de no encerrar al
  // Oficial de Cumplimiento el día 17 por una falla de plataforma. El
  // argumento estaba mal: si Auth no responde, tampoco se puede iniciar
  // sesión, así que la excepción no protegía de nada y sí abría un hueco —una
  // caída momentánea de red bastaba para entrar sin segundo factor, y con eso
  // la palabra «obligatorio» de la pantalla dejaba de ser cierta—. Ahora
  // bloquea, con reintento y salida, que no es lo mismo que encerrar a nadie.
  if (estadoMfa === null) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    );
  }
  if (estadoMfa === 'no_disponible') {
    return <SinPoderComprobar />;
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

/**
 * No se pudo comprobar el segundo factor.
 *
 * No se deja pasar —eso volvería mentira el «obligatorio» de la pantalla de
 * alta— pero tampoco se encierra a nadie sin explicación: hay reintento y hay
 * salida. Es una situación transitoria: si Auth no responde, tampoco se pudo
 * haber iniciado sesión.
 */
function SinPoderComprobar() {
  const { refrescarPerfil, signOut } = useAuth();
  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="ikan-card max-w-sm space-y-3 text-center">
        <h1 className="text-lg font-bold text-foreground">No se pudo comprobar su segundo factor</h1>
        <p className="text-sm text-muted-foreground">
          Ikán no pudo preguntarle al servicio de autenticación si su cuenta tiene segundo factor.
          Suele ser un corte momentáneo de red.
        </p>
        <p className="text-sm text-muted-foreground">
          No se entra sin comprobarlo: su sesión da acceso a expedientes con datos personales.
        </p>
        <div className="flex gap-2 justify-center pt-1">
          <Button size="sm" onClick={() => void refrescarPerfil()}>
            Reintentar
          </Button>
          <Button size="sm" variant="outline" onClick={() => void signOut()}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
