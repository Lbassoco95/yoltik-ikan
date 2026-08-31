import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

type LoginStep = 'credentials' | 'otp';

export function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitCredentials = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;

      const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors();
      if (factorsErr) throw factorsErr;
      const totp = factors?.totp?.[0];
      if (totp) {
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
        if (chErr) throw chErr;
        setFactorId(totp.id);
        setChallengeId(ch.id);
        setStep('otp');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!factorId || !challengeId) return;
    setBusy(true);
    setError(null);
    try {
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: otp,
      });
      if (verifyErr) throw verifyErr;
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="ikan-card w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl font-bold text-foreground">Ikán</div>
          <div className="text-sm text-muted-foreground">Cumplimiento PLD por Yoltik</div>
        </div>

        {step === 'credentials' && (
          <form onSubmit={submitCredentials} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Correo</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="oficial@empresa.mx"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <button type="submit" disabled={busy} className="ikan-btn-primary w-full disabled:opacity-50">
              {busy ? 'Validando…' : 'Continuar'}
            </button>
            <Link
              to="/recuperar"
              className="block text-sm text-muted-foreground hover:text-foreground text-center"
            >
              ¿Olvidó su contraseña?
            </Link>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={submitOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Código de su app de autenticación (TOTP)
              </label>
              <input
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
            {error && <p className="text-destructive text-sm">{error}</p>}
            <button type="submit" disabled={busy} className="ikan-btn-primary w-full disabled:opacity-50">
              {busy ? 'Verificando…' : 'Verificar'}
            </button>
            <button
              type="button"
              onClick={() => setStep('credentials')}
              className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
            >
              Volver
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
