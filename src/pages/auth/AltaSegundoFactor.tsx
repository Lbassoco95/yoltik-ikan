import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  confirmarInscripcion,
  iniciarInscripcion,
  situacionMfa,
  type InscripcionMfa,
} from "@/lib/api/mfa";
import { useAuth } from "@/lib/auth-context";

/**
 * Alta del segundo factor.
 *
 * En Ikán el 2FA es obligatorio: una sesión da acceso a expedientes con CURP,
 * RFC y hallazgos de PLD, y a la firma de avisos. Hasta ahora no había forma
 * de darlo de alta —el login sabía verificarlo, nadie sabía inscribirlo— así
 * que en la práctica nadie lo tenía y el perfil decía que sí.
 *
 * El factor NO queda activo hasta que se verifica un código. Si quedara activo
 * al enseñar el QR, cerrar la pestaña sin escanearlo dejaría al usuario fuera
 * de su propia cuenta.
 */
export default function AltaSegundoFactorPage() {
  const navegar = useNavigate();
  const { refrescarPerfil, signOut } = useAuth();

  async function cerrarSesion() {
    await signOut();
    navegar("/login", { replace: true });
  }
  const [inscripcion, setInscripcion] = useState<InscripcionMfa | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  /**
   * Una sola alta por visita, pase lo que pase.
   *
   * React en modo estricto ejecuta los efectos DOS veces en desarrollo. Sin
   * guardia eso son dos `enroll` a la vez, y como el alta limpia primero los
   * factores a medio inscribir, la segunda corrida borra el factor que la
   * primera acaba de crear: el QR quedaría apuntando a uno inexistente.
   *
   * SIN una bandera `vivo` que descarte el resultado. Tenerlas las dos era
   * peor que el problema original: la limpieza del primer pase ponía
   * `vivo = false`, el segundo pase salía por el guardia sin hacer nada, y el
   * `enroll` en vuelo terminaba descartándose. La pantalla se quedaba en
   * «Preparando el código…» para siempre — en la única de la que no se puede
   * salir. En modo estricto React REMONTA la misma instancia, así que los
   * hooks sobreviven y actualizar el estado después funciona; en un desmontaje
   * de verdad, actualizarlo es una operación sin efecto.
   */
  const yaEmpezo = useRef(false);

  useEffect(() => {
    if (yaEmpezo.current) return;
    yaEmpezo.current = true;

    (async () => {
      const s = await situacionMfa();

      if (s.estado === "inscrito") {
        navegar("/", { replace: true });
        return;
      }
      if (s.estado === "no_disponible") {
        setError(
          `No se pudo preguntar por el segundo factor: ${s.motivo ?? "sin detalle"}. ` +
            "Es un problema de la plataforma, no de su cuenta.",
        );
        setCargando(false);
        return;
      }

      try {
        setInscripcion(await iniciarInscripcion());
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setCargando(false);
      }
    })();
  }, [navegar]);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!inscripcion) return;
    setEnviando(true);
    setError(null);
    try {
      await confirmarInscripcion(inscripcion.factorId, codigo);
      await refrescarPerfil();
      navegar("/", { replace: true });
    } catch (err) {
      setError(
        (err as Error).message.includes("Invalid")
          ? "El código no coincide. Revise que sea el que muestra la app en este momento: cambia cada 30 segundos."
          : (err as Error).message,
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="ikan-card w-full max-w-md space-y-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 mt-0.5 text-primary shrink-0" />
          <div>
            <h1 className="text-lg font-bold text-foreground">Active su segundo factor</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Su sesión da acceso a expedientes con datos personales y a la firma de avisos. Una
              contraseña sola no basta para eso, así que en Ikán el segundo factor es obligatorio.
            </p>
          </div>
        </div>

        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Preparando el código…
          </div>
        ) : inscripcion ? (
          <>
            <ol className="text-sm text-foreground space-y-1 list-decimal ml-4">
              <li>Abra su app de autenticación (Google Authenticator, 1Password, Authy…).</li>
              <li>Escanee este código.</li>
              <li>Escriba abajo los seis dígitos que aparezcan.</li>
            </ol>

            {/* `qr_code` de Supabase es un DATA URI, no SVG suelto. Inyectarlo
                como HTML dejaba «data:image/svg+xml;utf-8,» impreso como texto
                encima del código. Va en un <img>, sin recomponer la cadena.
                Fondo blanco siempre: en tema oscuro, un QR con los colores
                invertidos no lo lee la mitad de las cámaras. */}
            <div className="rounded-md bg-white p-4 grid place-items-center">
              <img
                src={inscripcion.qr}
                alt="Código QR para dar de alta el segundo factor"
                className="w-44 h-44"
              />
            </div>

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">No puedo escanear el código</summary>
              <p className="mt-2">Escriba esta clave a mano en su app:</p>
              <code className="block mt-1 estela-dato text-[13px] break-all bg-muted/50 rounded p-2">
                {inscripcion.secreto}
              </code>
            </details>

            <form onSubmit={confirmar} className="space-y-3">
              <div>
                <Label htmlFor="codigo">Código de seis dígitos</Label>
                <p className="text-xs text-muted-foreground mb-1">
                  Cambia cada 30 segundos. Si expira mientras lo escribe, tome el siguiente.
                </p>
                <Input
                  id="codigo"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="estela-dato tracking-[0.4em] text-center text-lg"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              {/* Se dice ANTES de pulsar, no después: activarlo es de una sola
                  vía y quien lo hace sin tener el teléfono a mano se queda
                  fuera hasta que alguien se lo reponga. */}
              <p className="text-xs text-muted-foreground">
                Una vez activado, el segundo factor no se desactiva desde Ikán. Si necesita
                reponerlo, escriba a Kawiil: la reposición se hace desde la administración de la
                plataforma.
              </p>

              <Button type="submit" className="w-full gap-2" disabled={enviando || codigo.length < 6}>
                {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
                Activar
              </Button>
            </form>

            <div className="flex items-center justify-between gap-4 pt-1">
              <p className="text-xs text-muted-foreground">
                El secreto queda guardado cifrado; Ikán no lo conserva en claro.
              </p>
              {/* Sin esto, quien llega sin su teléfono no tiene ninguna salida:
                  la pantalla no deja avanzar y no había forma de retroceder. */}
              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => void cerrarSesion()}>
                Cerrar sesión
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
            <div className="text-sm text-foreground">
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => window.location.reload()}
              >
                Reintentar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
