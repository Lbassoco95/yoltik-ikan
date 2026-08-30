import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { IntegridadBitacora } from "@/components/bitacora/IntegridadBitacora";
import { facetasEventos, listarEventos, type EventoListado } from "@/lib/api/bitacora";

const TODOS = "all";

/** El actor, en palabras. `persona` sin id es un evento del sistema sin sesión
 *  (un job, una migración): decirlo es mejor que enseñar un UUID vacío. */
function actorLegible(e: EventoListado): string {
  switch (e.actor_tipo) {
    case "motor":
      return "Motor PLD";
    case "job":
      return "Proceso programado";
    case "sistema":
      return "Sistema";
    default:
      return e.actor_id ? e.actor_id.slice(0, 8) : "Sin sesión";
  }
}

/** `operation.insert` → "Alta de operación". Lo que no esté en el mapa se
 *  muestra tal cual: inventarle un nombre a un evento nuevo sería peor. */
const OPERACION: Record<string, string> = {
  insert: "Alta",
  update: "Cambio",
  delete: "Baja",
};

/**
 * Nombre de la tabla → nombre en español.
 *
 * El filtro y la columna enseñaban el identificador crudo de la base
 * (`operation`, `catalogo_valor`), que sólo significa algo para quien conoce el
 * esquema. Lo que no esté aquí se muestra tal cual: es preferible un
 * identificador feo a un nombre inventado.
 */
const ENTIDAD: Record<string, string> = {
  client: "Compareciente",
  operation: "Acto u operación",
  hallazgo: "Hallazgo",
  hallazgo_bitacora: "Movimiento de hallazgo",
  aviso: "Aviso",
  catalogo_valor: "Valor de catálogo",
  lista_movimiento: "Movimiento de lista",
  parametro_regulatorio: "Parámetro regulatorio",
};

function entidadLegible(entidad: string): string {
  return ENTIDAD[entidad] ?? entidad;
}

function accionLegible(tipo: string): string {
  const [, op] = tipo.split(".");
  return OPERACION[op] ?? tipo;
}

/** `operation.insert` → "Alta · Acto u operación", para el desplegable. */
function tipoLegible(tipo: string): string {
  const [entidad, op] = tipo.split(".");
  if (!op) return tipo;
  return `${OPERACION[op] ?? op} · ${entidadLegible(entidad)}`;
}

export default function AuditPage() {
  const [search, setSearch] = useState("");
  const [entidad, setEntidad] = useState(TODOS);
  const [tipo, setTipo] = useState(TODOS);
  const [detalle, setDetalle] = useState<EventoListado | null>(null);

  const { data: facetas } = useQuery({ queryKey: ["bitacora-facetas"], queryFn: facetasEventos });

  const {
    data: eventos = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["bitacora-eventos", entidad, tipo],
    queryFn: () =>
      listarEventos({
        entidad: entidad === TODOS ? undefined : entidad,
        tipo: tipo === TODOS ? undefined : tipo,
        limite: 200,
      }),
  });

  // La búsqueda filtra lo ya traído, no vuelve a la base: la bitácora se lee de
  // la más reciente hacia atrás y traer 200 eventos es una consulta, no cien.
  const q = search.trim().toLowerCase();
  const filtrados = q
    ? eventos.filter((e) =>
        [e.tipo, e.entidad, e.entidad_id ?? "", actorLegible(e), JSON.stringify(e.payload)]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : eventos;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">Auditoría</h1>

      <IntegridadBitacora />

      {/* El texto anterior afirmaba diez años de conservación, cifra que no
          sale de la LFPIORPI —su artículo 18 habla de cinco—. Se corrige y se
          marca como referencia, igual que el resto de cifras regulatorias del
          repo, hasta que Kawiil-Cumplimiento la confirme. */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 flex items-start gap-3">
        <Shield className="w-4 h-4 mt-0.5 text-primary shrink-0" />
        {/* Decía «es inmutable», que afirma más de lo que el sistema sostiene:
            quien tenga acceso de administrador a la base sí puede escribir. Lo
            que sí se sostiene —y es lo que importa— es que se detecta. Misma
            redacción que el panel de integridad, que ya lo decía bien. */}
        <p className="text-sm text-foreground">
          Los registros de la bitácora no se modifican ni se borran desde Ikán, y una corrección
          entra como registro nuevo. Cualquier alteración posterior rompe el encadenamiento de
          hashes y se detecta al verificar.{" "}
          <span className="text-warning">
            El plazo de conservación de cinco años (LFPIORPI artículo 18) está pendiente de
            confirmar con Kawiil-Cumplimiento.
          </span>
        </p>
      </div>

      <div className="glass-card p-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar en la bitácora…"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={entidad} onValueChange={setEntidad}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Entidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas las entidades</SelectItem>
            {(facetas?.entidades ?? []).map((x) => (
              <SelectItem key={x} value={x}>
                {entidadLegible(x)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tipo de evento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los eventos</SelectItem>
            {(facetas?.tipos ?? []).map((x) => (
              <SelectItem key={x} value={x}>
                {tipoLegible(x)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* overflow-x-auto y no -hidden: recortar el desbordamiento hace que
          en un teléfono se pierdan columnas sin manera de llegar a ellas. */}
      <div className="glass-card overflow-x-auto">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando bitácora…
          </div>
        ) : isError ? (
          <p className="p-6 text-sm text-destructive">
            No se pudo leer la bitácora: {(error as Error).message}
          </p>
        ) : (
          <table className="w-full min-w-[52rem]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["#", "Momento", "Acción", "Entidad", "Objeto", "Actor", "Encadenamiento"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-3"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setDetalle(e)}
                >
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                    {e.secuencia}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                    {new Date(e.registrado_en).toLocaleString("es-MX")}
                  </td>
                  <td className="px-4 py-3">
                    <span className="status-badge bg-primary/10 text-primary">
                      {accionLegible(e.tipo)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{entidadLegible(e.entidad)}</td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                    {e.entidad_id ? e.entidad_id.slice(0, 8) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">{actorLegible(e)}</td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                    {e.cadena_hash.slice(0, 12)}…
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    {eventos.length === 0
                      ? "La bitácora de esta organización todavía no registra eventos."
                      : "Ningún evento coincide con el filtro."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {eventos.length >= 200 && (
        <p className="text-[13px] text-muted-foreground">
          Se muestran los 200 eventos más recientes. Para la bitácora completa, descarga el paquete
          de verificación de arriba: lleva todos los eventos y sus hashes.
        </p>
      )}

      <Dialog open={!!detalle} onOpenChange={(v) => !v && setDetalle(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Evento {detalle?.secuencia} · {detalle ? tipoLegible(detalle.tipo) : ""}
            </DialogTitle>
            <DialogDescription>
              {detalle ? new Date(detalle.registrado_en).toLocaleString("es-MX") : ""}
            </DialogDescription>
          </DialogHeader>

          {detalle && (
            <div className="space-y-4">
              <Campo etiqueta="Actor">
                {actorLegible(detalle)}
                {detalle.actor_id && (
                  <span className="font-mono text-xs text-muted-foreground ml-2">
                    {detalle.actor_id}
                  </span>
                )}
              </Campo>

              <Campo etiqueta="Objeto">
                {detalle.entidad}
                {detalle.entidad_id && (
                  <span className="font-mono text-xs text-muted-foreground ml-2">
                    {detalle.entidad_id}
                  </span>
                )}
              </Campo>

              {/* Las versiones vigentes al momento son lo que permite juzgar un
                  acto de 2025 con las reglas de 2025. */}
              {Object.keys(detalle.versiones ?? {}).length > 0 && (
                <Campo etiqueta="Versiones vigentes">
                  <pre className="text-[13px] font-mono bg-muted/40 rounded p-2 overflow-x-auto">
                    {JSON.stringify(detalle.versiones, null, 2)}
                  </pre>
                </Campo>
              )}

              <Campo etiqueta="Contenido registrado">
                <pre className="text-[13px] font-mono bg-muted/40 rounded p-2 overflow-x-auto">
                  {JSON.stringify(detalle.payload, null, 2)}
                </pre>
              </Campo>

              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">Encadenamiento</p>
                <p className="text-[13px] text-muted-foreground">
                  El hash de la cadena se calcula sobre el hash del evento anterior. Cambiar
                  cualquier evento pasado rompe todos los que le siguen, y eso se detecta con el
                  botón de verificar de arriba.
                </p>
                <Hash etiqueta="Hash anterior" valor={detalle.hash_anterior} />
                <Hash etiqueta="Hash del evento" valor={detalle.evento_hash} />
                <Hash etiqueta="Hash de la cadena" valor={detalle.cadena_hash} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{etiqueta}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function Hash({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
      <span className="text-[13px] text-muted-foreground w-32 shrink-0">{etiqueta}</span>
      <code className="text-[13px] font-mono break-all">{valor}</code>
    </div>
  );
}
