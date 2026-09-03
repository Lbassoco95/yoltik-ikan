import { IconoIkan } from "@/components/estela/MarcaIkan";
import { EndosoYoltik } from "@/components/estela/EndosoYoltik";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

type LoginStep = "credentials" | "otp";

export function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitCredentials = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr) throw signInErr;

      const { data: factors, error: factorsErr } =
        await supabase.auth.mfa.listFactors();
      if (factorsErr) throw factorsErr;
      const totp = factors?.totp?.[0];
      if (totp) {
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
          factorId: totp.id,
        });
        if (chErr) throw chErr;
        setFactorId(totp.id);
        setChallengeId(ch.id);
        setStep("otp");
      } else {
        navigate("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
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
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código inválido");
    } finally {
      setBusy(false);
    }
  };

  return (
    // ESTELA: el acceso ocurre sobre el navy —la estela vista de frente— y la
    // tarjeta blanca es la placa encima.
    //
    // Lo que distingue la placa NO es la muesca de la esquina: a tamaño real
    // se leía como un recorte mal hecho y no como una talla, y es lo primero
    // que alguien ve del producto. Lo hace el contraste, en tres capas: la
    // cenefa de greca cruzando el canto superior —el motivo de marca, en una
    // franja limpia que no se puede confundir con un fallo—, el halo jade que
    // despega la placa del navy, y el aire alrededor del contenido.
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-ikan-navy-claro to-[#081A30] p-6">
      <div className="w-full max-w-[380px] overflow-hidden rounded-md bg-card shadow-[0_0_0_1px_rgba(0,145,124,0.35),0_18px_50px_-12px_rgba(0,0,0,0.55)]">
        {/* Barra jade maciza, no la cenefa de greca. La greca funciona a lo
            ancho de la pantalla, donde se lee como una regla; en 380 px de
            tarjeta sus escalones se apelotonan y el canto parece un borde
            perforado —el mismo problema que la muesca—. Aquí el trabajo es
            marcar el canto con contraste, y para eso una barra maciza es
            mejor que un motivo. */}
        <div className="h-1.5 bg-gradient-to-r from-ikan-jade-oscuro via-ikan-jade to-ikan-mint" aria-hidden />

        <div className="p-8 sm:p-10">
          <div className="mb-7 flex flex-col items-center gap-3 text-center">
            {/* El hexágono a 72 px. A 44 se leía como un favicon al lado del
                texto; es la marca, y en la única pantalla donde no compite
                con nada tiene que poder verse. */}
            <IconoIkan size={72} />
            <div>
              <div className="text-[26px] font-extrabold leading-none tracking-tight text-ikan-navy dark:text-foreground">
                Ikán
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">
                Cumplimiento PLD
              </div>
            </div>
          </div>

          {step === "credentials" && (
            <form onSubmit={submitCredentials} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Correo
                </label>
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
                <label className="block text-sm font-medium text-foreground mb-1">
                  Contraseña
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="ikan-btn-primary w-full disabled:opacity-50"
              >
                {busy ? "Validando…" : "Continuar"}
              </button>
              <Link
                to="/recuperar"
                className="block text-sm text-muted-foreground hover:text-foreground text-center"
              >
                ¿Olvidó su contraseña?
              </Link>
            </form>
          )}

          {step === "otp" && (
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
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  className="estela-dato w-full rounded-md border border-border bg-card px-3 py-2 text-center text-lg tracking-[0.2em] focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="000000"
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="ikan-btn-primary w-full disabled:opacity-50"
              >
                {busy ? "Verificando…" : "Verificar"}
              </button>
              <button
                type="button"
                onClick={() => setStep("credentials")}
                className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
              >
                Volver
              </button>
            </form>
          )}

          {/* El endoso. Yoltik deja de ser una palabra en gris al final de una
              frase y pasa a ser su logotipo: un endoso se ve, no se lee. */}
          <div className="mt-7 flex justify-center border-t border-border pt-5">
            <EndosoYoltik alto={20} />
          </div>
        </div>
      </div>
    </div>
  );
}
