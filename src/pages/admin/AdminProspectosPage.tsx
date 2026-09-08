import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ESTADOS_PROSPECTO,
  listarProspectos,
  marcarProspecto,
  resumenProspectos,
  type EstadoProspecto,
  type Prospecto,
} from "@/lib/api/prospectos";
import { cn } from "@/lib/utils";

/**
 * Prospectos del formulario público.
 *
 * Existía el formulario, existía la Edge Function que lo guarda, y no existía
 * nadie que lo leyera: quien se registraba en el sitio entraba a la base y ahí
 * se quedaba. Un embudo que no se consulta es lo mismo que no tenerlo.
 *
 * Lo que se enseña de cada uno es lo que dijo de su cumplimiento —si tiene
 * Oficial designado, si está en el SPPLD, si tiene manual—, porque es lo que
 * decide si la conversación empieza por vender o por explicar.
 */
const TODOS = "todos";

const ETIQUETA: Record<string, string> = Object.fromEntries(
  ESTADOS_PROSPECTO.map((e) => [e.valor, e.etiqueta]),
);

/** El color refuerza; el texto es el que lleva el significado. */
const CLASE_ESTADO: Record<string, string> = {
  nuevo: "bg-warning/10 text-warning-ink",
  contactado: "bg-accent/10 text-accent",
  en_diagnostico: "bg-accent/10 text-accent",
  cliente: "bg-success/10 text-success",
  descartado: "bg-muted text-muted-foreground",
};

/** Null no es «no»: es que no contestó, y son cosas distintas al llamarle. */
function siNoOSinDato(v: boolean | null): string {
  return v === null ? "sin dato" : v ? "sí" : "no";
}

export default function AdminProspectosPage() {
  const [filtro, setFiltro] = useState<string>(TODOS);
  const [abierto, setAbierto] = useState<Prospecto | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState<EstadoProspecto>("contactado");
  const [nota, setNota] = useState("");
  const queryClient = useQueryClient();

  const { data: resumen = [] } = useQuery({
    queryKey: ["prospectos-resumen"],
    queryFn: resumenProspectos,
  });

  const { data: prospectos = [], isLoading, isError, error } = useQuery({
    queryKey: ["prospectos", filtro],
    queryFn: () => listarProspectos(filtro === TODOS ? undefined : (filtro as EstadoProspecto)),
  });

  const mover = useMutation({
    mutationFn: () => marcarProspecto(abierto!.id, nuevoEstado, nota),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospectos"] });
      queryClient.invalidateQueries({ queryKey: ["prospectos-resumen"] });
      toast.success("Prospecto actualizado");
      setAbierto(null);
      setNota("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = resumen.reduce((n, r) => n + Number(r.cuantos), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="estela-titulo text-2xl font-extrabold tracking-tight text-foreground">Prospectos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quien llena el formulario del sitio llega aquí. Sólo lo ve Kawiil; ninguna organización
          cliente tiene acceso a estos datos.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Tarjeta etiqueta="Total" valor={total} activo={filtro === TODOS} onClick={() => setFiltro(TODOS)} />
        {ESTADOS_PROSPECTO.map((e) => (
          <Tarjeta
            key={e.valor}
            etiqueta={e.etiqueta}
            valor={Number(resumen.find((r) => r.status === e.valor)?.cuantos ?? 0)}
            activo={filtro === e.valor}
            onClick={() => setFiltro(e.valor)}
          />
        ))}
      </div>

      <div className="estela-placa overflow-x-auto">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando prospectos…
          </div>
        ) : isError ? (
          <p className="p-6 text-sm text-destructive">
            No se pudieron leer los prospectos: {(error as Error).message}
          </p>
        ) : (
          <table className="w-full min-w-[52rem]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Quién", "Contacto", "Actividad", "Cumplimiento", "Llegó", "Estado", ""].map((h) => (
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
              {prospectos.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{p.razon_social}</p>
                    <p className="text-xs text-muted-foreground estela-dato">{p.rfc}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-foreground">{p.contacto_nombre}</p>
                    <a
                      href={`mailto:${p.contacto_email}`}
                      className="text-xs text-accent hover:underline inline-flex items-center gap-1"
                    >
                      <Mail className="w-3 h-3" /> {p.contacto_email}
                    </a>
                    {p.contacto_telefono && (
                      <span className="block text-xs text-muted-foreground inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {p.contacto_telefono}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {p.actividad_vulnerable.join(", ") || "—"}
                    {p.estado_republica && (
                      <span className="block text-muted-foreground">{p.estado_republica}</span>
                    )}
                  </td>
                  {/* Es lo que decide si la conversación empieza por vender o
                      por explicar. */}
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <span className="block">OC designado: {siNoOSinDato(p.tiene_oc_designado)}</span>
                    <span className="block">En el SPPLD: {siNoOSinDato(p.registrado_sppld)}</span>
                    <span className="block">Manual PLD: {siNoOSinDato(p.tiene_manual_pld)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString("es-MX")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "status-badge text-xs",
                        CLASE_ESTADO[p.status ?? "nuevo"] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {ETIQUETA[p.status ?? "nuevo"] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAbierto(p);
                        setNuevoEstado((p.status as EstadoProspecto) ?? "nuevo");
                        setNota("");
                      }}
                    >
                      Atender
                    </Button>
                  </td>
                </tr>
              ))}
              {prospectos.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    {filtro === TODOS
                      ? "Todavía no ha llegado ningún prospecto por el formulario."
                      : "Ninguno en este estado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!abierto} onOpenChange={(v) => !v && setAbierto(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{abierto?.razon_social}</DialogTitle>
            <DialogDescription>
              {abierto?.contacto_nombre}
              {abierto?.contacto_cargo ? ` · ${abierto.contacto_cargo}` : ""} ·{" "}
              {abierto?.contacto_email}
            </DialogDescription>
          </DialogHeader>

          {abierto?.notas && (
            <div>
              <Label>Lo que ya se habló</Label>
              {/* Se muestran todas: las notas se acumulan, y el historial es
                  el motivo por el que el prospecto está donde está. */}
              <pre className="mt-1 text-xs whitespace-pre-wrap bg-muted/40 rounded p-3 max-h-48 overflow-y-auto">
                {abierto.notas}
              </pre>
            </div>
          )}

          <div>
            <Label htmlFor="estado">Nuevo estado</Label>
            <Select value={nuevoEstado} onValueChange={(v) => setNuevoEstado(v as EstadoProspecto)}>
              <SelectTrigger id="estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS_PROSPECTO.map((e) => (
                  <SelectItem key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="nota">Nota</Label>
            <Textarea
              id="nota"
              rows={3}
              placeholder="Qué se habló, qué quedó pendiente…"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Se añade a las anteriores; no las sustituye.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(null)}>
              Cancelar
            </Button>
            <Button
              className="gap-2"
              onClick={() => mover.mutate()}
              disabled={mover.isPending}
            >
              {mover.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  activo,
  onClick,
}: {
  etiqueta: string;
  valor: number;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border p-3 text-left transition-colors",
        activo ? "border-accent bg-accent/5" : "hover:bg-muted/40",
      )}
    >
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="text-2xl font-bold text-foreground">{valor}</p>
    </button>
  );
}
