import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { passwordResetRedirectUrl } from '@/lib/app-url';

/**
 * Paso 1 del flujo de recuperación: el usuario pide el correo con el enlace.
 * Supabase envía el correo "Reset Password" y redirige a `/restablecer`.
 */
export function RecuperarPasswordPage() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: passwordResetRedirectUrl(),
      });
      // Solo se corta el flujo ante errores de transporte/configuración; que el
      // correo exista o no NO se revela (evita enumeración de usuarios).
      if (resetErr) throw resetErr;
      setEnviado(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo enviar el correo de recuperación. Intenta de nuevo.',
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
          <div className="text-sm text-muted-foreground">Recuperar contraseña</div>
        </div>

        {enviado ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Si <span className="font-semibold">{email.trim()}</span> corresponde a una cuenta
              activa, le enviamos un correo con el enlace para restablecer su contraseña.
            </p>
            <p className="text-sm text-muted-foreground">
              Revisa también la carpeta de no deseados. El enlace caduca por seguridad; si expira,
              solicita uno nuevo.
            </p>
            <button
              type="button"
              onClick={() => {
                setEnviado(false);
                setError(null);
              }}
              className="ikan-btn-secondary w-full"
            >
              Enviar a otro correo
            </button>
            <Link
              to="/login"
              className="block text-sm text-muted-foreground hover:text-foreground text-center"
            >
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Escribe el correo con el que accedes a Ikán y te enviaremos un enlace para definir una
              contraseña nueva.
            </p>
            <div>
              <label htmlFor="email-recuperacion" className="block text-sm font-medium text-foreground mb-1">
                Correo
              </label>
              <input
                id="email-recuperacion"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="oficial@empresa.mx"
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <button type="submit" disabled={busy} className="ikan-btn-primary w-full disabled:opacity-50">
              {busy ? 'Enviando…' : 'Enviar enlace'}
            </button>
            <Link
              to="/login"
              className="block text-sm text-muted-foreground hover:text-foreground text-center"
            >
              Volver a iniciar sesión
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
