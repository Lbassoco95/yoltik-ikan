import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, Loader2, Mail, MessageCircle, Monitor } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  abrirVerificacion,
  ligaWhatsApp,
  mensajeParaCompareciente,
  type CanalVerificacion,
} from "@/lib/api/verificacion";
import { cn } from "@/lib/utils";
import type { TipoPersona } from "@/types/domain";

/**
 * Enviar la verificación de identidad a un compareciente.
 *
 * Tres caminos porque en una notaría pasan las tres cosas: la persona está ahí
 * mismo y se verifica en la tablet, o dejó su correo, o se le manda por
 * WhatsApp. El más común en notaría es el primero, así que va primero.
 *
 * Una vez abierta, la liga es la MISMA en los tres casos: lo que cambia es cómo
 * llega. Por eso el paso dos enseña la liga siempre, aunque se haya mandado por
 * correo — si el correo no llega, quien opera puede seguir adelante sin abrir
 * otra verificación.
 */
interface Props {
  clienteId: string | null;
  clienteNombre: string;
  /**
   * Qué se está verificando.
   *
   * No es un detalle de presentación. Didit comprueba que una PERSONA es quien
   * dice ser: documento oficial, prueba de vida, face match. Una sociedad no
   * tiene cara ni INE. Sin esta distinción se podía abrir una verificación
   * contra una persona moral, y lo que salía de ahí era una sesión pidiéndole
   * a una empresa que se tomara una selfie —gastada, sin resultado posible y
   * con la apariencia de que el trámite iba en curso.
   */
  tipoPersona?: TipoPersona;
  correoSugerido?: string | null;
  telefonoSugerido?: string | null;
  nombreOrganizacion: string;
  onCerrar: () => void;
  onEnviada?: () => void;
}

const CANALES: { valor: CanalVerificacion; etiqueta: string; ayuda: string; icono: typeof Mail }[] = [
  {
    valor: "presencial",
    etiqueta: "Está aquí",
    ayuda: "Se abre en esta pantalla para que la haga en el momento.",
    icono: Monitor,
  },
  {
    valor: "correo",
    etiqueta: "Por correo",
    ayuda: "Didit le manda la liga a su correo, en español.",
    icono: Mail,
  },
  {
    valor: "liga",
    etiqueta: "Por WhatsApp o mensaje",
    ayuda: "Se copia la liga con un texto listo para pegar.",
    icono: MessageCircle,
  },
];

export function EnviarVerificacionDialog({
  clienteId,
  clienteNombre,
  tipoPersona,
  correoSugerido,
  telefonoSugerido,
  nombreOrganizacion,
  onCerrar,
  onEnviada,
}: Props) {
  const [canal, setCanal] = useState<CanalVerificacion>("presencial");
  const [correo, setCorreo] = useState(correoSugerido ?? "");
  const [url, setUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const abrir = useMutation({
    mutationFn: () => abrirVerificacion(clienteId!, canal, canal === "correo" ? correo : undefined),
    onSuccess: (r) => {
      setUrl(r.url);
      onEnviada?.();
      if (canal === "correo") toast.success(`Liga enviada a ${correo}`);
      if (canal === "presencial") window.open(r.url, "_blank", "noopener");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mensaje = url ? mensajeParaCompareciente(nombreOrganizacion, url) : "";

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // El portapapeles falla sin https o sin permiso. Decirlo es mejor que un
      // botón que parece funcionar y no hace nada.
      toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  }

  function cerrar() {
    setUrl(null);
    setCopiado(false);
    setCanal("presencial");
    onCerrar();
  }

  const correoInvalido = canal === "correo" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim());

  // Una persona moral no se verifica: se verifica a alguien de carne y hueso
  // detrás de ella. Decirlo y parar es más útil que abrir una sesión que no
  // puede terminar bien.
  if (tipoPersona === "moral") {
    return (
      <Dialog open={clienteId !== null} onOpenChange={(v) => !v && cerrar()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{clienteNombre} es una persona moral</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  La verificación de identidad comprueba que una persona es quien dice ser:
                  identificación oficial, prueba de vida y comparación con la foto del documento.
                  Una sociedad no tiene ninguna de las tres.
                </p>
                <p>
                  Lo que se verifica de una persona moral son las personas físicas detrás: quien
                  comparece en su representación, y quienes resulten sus beneficiarios
                  controladores.
                </p>
                <p className="text-xs text-warning">
                  Capturar esa estructura —socios, porcentajes y las personas morales
                  intermedias— todavía no está en Ikán. Por ahora, da de alta a cada persona
                  física por separado y verifícala desde su propio expediente.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={cerrar}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={clienteId !== null} onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Verificar la identidad de {clienteNombre}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-left">
              <p>
                Se le pedirá su identificación oficial y una prueba de vida. Tarda un par de
                minutos y se hace desde su propio teléfono o aquí mismo.
              </p>
              {/* Dicho antes, no después: lo contrario es prometer un estado
                  que todavía no existe. */}
              <p className="text-xs">
                El resultado no es inmediato: llega cuando la persona termina, y hasta entonces
                el compareciente queda «en proceso».
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {!url ? (
          <>
            <div className="space-y-2">
              <Label>¿Cómo se la hacemos llegar?</Label>
              <div className="grid gap-2">
                {CANALES.map((c) => {
                  const activo = canal === c.valor;
                  return (
                    <button
                      key={c.valor}
                      type="button"
                      onClick={() => setCanal(c.valor)}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        activo
                          ? "border-accent bg-accent/5"
                          : "border-border hover:border-accent/40",
                      )}
                    >
                      <c.icono
                        className={cn(
                          "w-4 h-4 mt-0.5 shrink-0",
                          activo ? "text-accent" : "text-muted-foreground",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          {c.etiqueta}
                        </span>
                        <span className="block text-xs text-muted-foreground">{c.ayuda}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {canal === "correo" && (
              <div className="space-y-1.5">
                <Label htmlFor="correo-verif">Correo del compareciente</Label>
                <Input
                  id="correo-verif"
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder="nombre@ejemplo.mx"
                />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={cerrar}>
                Cancelar
              </Button>
              <Button
                onClick={() => abrir.mutate()}
                disabled={abrir.isPending || correoInvalido}
                className="gap-2"
              >
                {abrir.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {canal === "presencial" ? "Abrir aquí" : "Enviar"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-3">
              {/* La liga se enseña SIEMPRE, también cuando se mandó por correo:
                  si el correo no llega, quien opera sigue adelante con esta
                  misma verificación en vez de abrir otra. */}
              <div className="space-y-1.5">
                <Label htmlFor="liga-verif">Liga de la verificación</Label>
                <div className="flex gap-2">
                  <Input id="liga-verif" readOnly value={url} className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    aria-label="Copiar la liga"
                    onClick={() => copiar(url)}
                  >
                    {copiado ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sirve una sola vez y para esta persona. No la reenvíes a nadie más.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => copiar(mensaje)}
                >
                  <Copy className="w-4 h-4" /> Copiar con el mensaje
                </Button>
                <Button variant="outline" className="gap-2" asChild>
                  <a
                    href={ligaWhatsApp(mensaje, telefonoSugerido)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="w-4 h-4" /> Abrir WhatsApp
                  </a>
                </Button>
                <Button variant="outline" className="gap-2" asChild>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <Monitor className="w-4 h-4" /> Abrir aquí
                  </a>
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={cerrar}>Listo</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
