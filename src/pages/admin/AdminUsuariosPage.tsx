import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import {
  ETIQUETA_ROL,
  MINIMO_MOTIVO,
  listarUsuarios,
  reponerSegundoFactor,
  type UsuarioPlataforma,
} from "@/lib/api/usuarios";
import { cn } from "@/lib/utils";

/**
 * Usuarios y segundo factor.
 *
 * El 2FA es obligatorio y eso está bien. Lo que no estaba bien es lo que
 * pasaba cuando alguien perdía el teléfono: la única forma de reponerle el
 * factor era abrir el SQL Editor de Supabase y borrar a mano de
 * `auth.mfa_factors`. Para desbloquear a un Oficial de Cumplimiento un viernes
 * había que darle a alguien una llave que abre la base entera, y la operación
 * más sensible del sistema no quedaba en ninguna bitácora.
 *
 * Esta pantalla hace exactamente eso y nada más. No da de alta usuarios, no
 * cambia contraseñas y no toca roles: cada una de esas cosas necesita su
 * propia conversación sobre quién puede hacerla.
 */
function fecha(v: string | null): string {
  return v ? new Date(v).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "nunca";
}

export default function AdminUsuariosPage() {
  const { session } = useAuth();
  const [busqueda, setBusqueda] = useState("");
  const [soloSinFactor, setSoloSinFactor] = useState(false);
  const [abierto, setAbierto] = useState<UsuarioPlataforma | null>(null);
  const [motivo, setMotivo] = useState("");
  const queryClient = useQueryClient();

  const { data: usuarios = [], isLoading, isError, error } = useQuery({
    queryKey: ["usuarios-plataforma"],
    queryFn: listarUsuarios,
  });

  const reponer = useMutation({
    mutationFn: () => reponerSegundoFactor(abierto!.user_id, motivo),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["usuarios-plataforma"] });
      toast.success(
        `Segundo factor repuesto para ${r.email}` +
          (r.sesiones_cerradas > 0
            ? `. Se cerraron ${r.sesiones_cerradas} sesión(es) abiertas.`
            : "."),
      );
      setAbierto(null);
      setMotivo("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendientesDeAlta = usuarios.filter((u) => u.factores_verificados === 0).length;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (soloSinFactor && u.factores_verificados > 0) return false;
      if (!q) return true;
      return (
        u.nombre.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.organizacion ?? "").toLowerCase().includes(q)
      );
    });
  }, [usuarios, busqueda, soloSinFactor]);

  const motivoCorto = motivo.trim().length < MINIMO_MOTIVO;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="estela-titulo text-2xl font-extrabold tracking-tight text-foreground">Usuarios y segundo factor</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quién puede entrar a Ikán y con qué segundo factor. Desde aquí se repone el TOTP de
          quien perdió el teléfono, sin abrir la base de datos y dejando constancia en la
          bitácora de su organización.
        </p>
        {/* Sin esta aclaración, «pendiente de alta» se lee como «bloqueado» y
            empuja a reponer factores, que es justo lo que no hay que hacer:
            reponerle el factor a quien nunca lo dio de alta no arregla nada. */}
        <p className="text-sm text-muted-foreground mt-2">
          Quien está pendiente de alta no está bloqueado: entra con su contraseña e Ikán lo
          lleva a inscribir su autenticador antes de dejarlo ver nada. Reponer es sólo para
          quien ya lo tenía y hoy no puede usarlo.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre, correo u organización"
            className="pl-9"
          />
        </div>
        <Button
          variant={soloSinFactor ? "default" : "outline"}
          onClick={() => setSoloSinFactor((v) => !v)}
          className="gap-2 shrink-0"
        >
          <ShieldAlert className="w-4 h-4" />
          Pendientes de alta ({pendientesDeAlta})
        </Button>
      </div>

      <div className="estela-placa overflow-x-auto">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando usuarios…
          </div>
        ) : isError ? (
          <p className="p-6 text-sm text-destructive">
            No se pudieron leer los usuarios: {(error as Error).message}
          </p>
        ) : visibles.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {usuarios.length === 0
              ? "No hay usuarios que mostrar."
              : "Ningún usuario coincide con el filtro."}
          </p>
        ) : (
          <table className="w-full min-w-[52rem]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Quién", "Organización", "Roles", "Segundo factor", "Último acceso", ""].map((h) => (
                  <th
                    key={h}
                    className="estela-antetitulo text-muted-foreground px-4 py-3 text-left"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((u) => {
                const conFactor = u.factores_verificados > 0;
                const esYo = u.user_id === session?.user?.id;
                return (
                  <tr key={u.user_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">
                        {u.nombre}
                        {esYo && (
                          <span className="ml-2 text-xs text-muted-foreground font-normal">(eres tú)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {u.organizacion ?? <span className="text-muted-foreground">sin organización</span>}
                      {u.es_kawiil && (
                        <span className="block text-xs text-accent">Administrador de plataforma</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.roles.length > 0
                        ? u.roles.map((r) => ETIQUETA_ROL[r] ?? r).join(", ")
                        : "—"}
                      {!u.activo && <span className="block text-destructive">Perfil desactivado</span>}
                    </td>
                    {/* Ámbar es «lo que le toca atender», no «lo que está roto»:
                        un alta pendiente se resuelve sola en cuanto la persona
                        entra. El color refuerza; el texto lleva el significado. */}
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "status-badge text-xs gap-1",
                          conFactor ? "bg-success/10 text-success" : "bg-warning/15 text-warning-ink",
                        )}
                      >
                        {conFactor ? (
                          <ShieldCheck className="w-3 h-3" />
                        ) : (
                          <ShieldAlert className="w-3 h-3" />
                        )}
                        {conFactor ? "Activo" : "Pendiente de alta"}
                      </span>
                      {u.factores_pendientes > 0 && (
                        <span className="block text-xs text-muted-foreground mt-1">
                          {u.factores_pendientes} alta(s) sin confirmar
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fecha(u.ultimo_acceso)}</td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={u.factores_verificados + u.factores_pendientes === 0}
                        onClick={() => {
                          setAbierto(u);
                          setMotivo("");
                        }}
                        className="gap-2"
                      >
                        <KeyRound className="w-4 h-4" /> Reponer
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={abierto !== null} onOpenChange={(v) => !v && setAbierto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reponer el segundo factor</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-left">
                <p>
                  Se le quitará el TOTP a <strong>{abierto?.nombre}</strong> ({abierto?.email}) y se
                  cerrarán todas sus sesiones abiertas.
                </p>
                {/* Decirlo antes, no después: entre que se repone y que la
                    persona vuelve a darse de alta, su cuenta se abre con sólo
                    la contraseña. */}
                <p className="rounded-md border border-warning/40 bg-warning/15 p-3 text-warning-ink">
                  Hasta que vuelva a dar de alta su autenticador, esa cuenta se abre con sólo la
                  contraseña. Confirma por un canal aparte que quien lo pide es la persona.
                </p>
                <p>
                  Queda registrado en la bitácora encadenada de{" "}
                  {abierto?.organizacion ?? "la plataforma"}, con tu nombre y el motivo.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo</Label>
            <Textarea
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Perdió el teléfono; lo confirmó por videollamada el 30/08."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Al menos {MINIMO_MOTIVO} caracteres. Es lo que va a leer quien audite esto dentro de
              dos años.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => reponer.mutate()}
              disabled={motivoCorto || reponer.isPending}
              className="gap-2"
            >
              {reponer.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Reponer el segundo factor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
