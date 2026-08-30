import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

/**
 * Paso 2 del flujo de recuperación: Supabase redirige aquí desde el correo con
 * el token de recovery en la URL. `detectSessionInUrl` (ver `lib/supabase.ts`)
 * lo canjea por una sesión temporal que permite `updateUser({ password })`.
 *
 * Como Ikán exige TOTP, la sesión de recuperación puede quedar en aal1 cuando
 * el usuario ya tiene factor inscrito: en ese caso se pide el código antes de
 * permitir el cambio de contraseña.
 */
type Estado = 'verificando' | 'mfa' | 'formulario' | 'invalido' | 'exito';

// TODO[Sprint D-2]: alinear con la política de contraseñas del proyecto
// Supabase (Authentication → Policies). Supabase es quien la aplica de verdad;
// esto solo evita un viaje al servidor.
const LARGO_MINIMO = 8;

function leerErrorDeUrl(): string | null {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  const query = new URLSearchParams(window.location.search);
  const descripcion = params.get('error_description') ?? query.get('error_description');
  const codigo = params.get('error') ?? query.get('error');
  if (descripcion) return descripcion;
  return codigo;
}

export function RestablecerPasswordPage() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado>('verificando');
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelado = false;

    /** Decide si con la sesión actual ya se puede cambiar la contraseña. */
    const evaluarSesion = async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelado) return;
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        setEstado('mfa');
      } else {
        setEstado('formulario');
      }
    };

    const errorUrl = leerErrorDeUrl();
    if (errorUrl) {
      setError(errorUrl);
      setEstado('invalido');
      return;
    }

    // El SDK canjea el token del hash de forma asíncrona; se escucha el evento
    // y además se consulta la sesión por si el canje ya ocurrió antes de montar.
    const { data: sub } = supabase.auth.onAuthStateChange((event, sesion) => {
      if (cancelado) return;
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && sesion) {
        void evaluarSesion();
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelado) return;
      if (data.session) {
        void evaluarSesion();
      } else {
        // Sin sesión y sin token válido en la URL: enlace caducado o abierto directo.
        window.setTimeout(() => {
          if (cancelado) return;
          void supabase.auth.getSession().then(({ data: reintento }) => {
            if (cancelado) return;
            if (reintento.session) void evaluarSesion();
            else setEstado('invalido');
          });
        }, 1200);
      }
    });

    return () => {
      cancelado = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submitOtp = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors();
      if (factorsErr) throw factorsErr;
      const totp = factors?.totp?.[0];
      if (!totp) {
        setEstado('formulario');
        return;
      }
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (chErr) throw chErr;
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: ch.id,
        code: otp,
      });
      if (verifyErr) throw verifyErr;
      setEstado('formulario');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido');
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < LARGO_MINIMO) {
      setError(`La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.`);
      return;
    }
    if (password !== confirmacion) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      setEstado('exito');
      // Se cierra la sesión de recuperación: el reingreso debe pasar por
      // credenciales + TOTP como cualquier otro acceso a Ikán.
      await supabase.auth.signOut();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo actualizar la contraseña. Intenta de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="ikan-card w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl font-bold text-foreground">Ikán</div>
          <div className="text-sm text-muted-foreground">Nueva contraseña</div>
        </div>

        {estado === 'verificando' && (
          <p className="text-sm text-muted-foreground text-center">Validando el enlace…</p>
        )}

        {estado === 'invalido' && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              El enlace no es válido o ya caducó. Solicita uno nuevo para continuar.
            </p>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Link to="/recuperar" className="ikan-btn-primary w-full block text-center">
              Solicitar enlace nuevo
            </Link>
            <Link
              to="/login"
              className="block text-sm text-muted-foreground hover:text-foreground text-center"
            >
              Volver a iniciar sesión
            </Link>
          </div>
        )}

        {estado === 'mfa' && (
          <form onSubmit={submitOtp} className="space-y-4">
            <div>
              <label htmlFor="otp-restablecer" className="block text-sm font-medium text-foreground mb-1">
                Código de su app de autenticación (TOTP)
              </label>
              <input
                id="otp-restablecer"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2 border border-border rounded-md bg-card text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="000000"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Confirme su segundo factor antes de definir la contraseña nueva.
            </p>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <button type="submit" disabled={busy} className="ikan-btn-primary w-full disabled:opacity-50">
              {busy ? 'Verificando…' : 'Verificar'}
            </button>
          </form>
        )}

        {estado === 'formulario' && (
          <form onSubmit={submitPassword} className="space-y-4">
            <div>
              <label htmlFor="password-nueva" className="block text-sm font-medium text-foreground mb-1">
                Contraseña nueva
              </label>
              <input
                id="password-nueva"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Mínimo {LARGO_MINIMO} caracteres.
              </p>
            </div>
            <div>
              <label htmlFor="password-confirmacion" className="block text-sm font-medium text-foreground mb-1">
                Confirmar contraseña
              </label>
              <input
                id="password-confirmacion"
                type="password"
                required
                autoComplete="new-password"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <button type="submit" disabled={busy} className="ikan-btn-primary w-full disabled:opacity-50">
              {busy ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        )}

        {estado === 'exito' && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Su contraseña se actualizó. Inicie sesión con la contraseña nueva y su código TOTP.
            </p>
            <button type="button" onClick={() => navigate('/login')} className="ikan-btn-primary w-full">
              Ir a iniciar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
