import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";
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
  listarCatalogos,
  reemplazarValoresCatalogo,
} from "@/lib/api/catalogos";
import {
  clavesFueraDePatron,
  parsearCatalogo,
  type EstadoCatalogo,
  type ValorCatalogo,
} from "@/lib/catalogos";
import { cn } from "@/lib/utils";

/**
 * Carga de los catálogos del layout.
 *
 * Estos catálogos son los que ponen la CLAVE en el aviso. Los mantiene Kawiil y
 * los consumen todas las organizaciones: una clave mal cargada aquí rechaza los
 * avisos de todos los clientes a la vez, así que la carga muestra un previo
 * —cuántos valores, cuáles se descartaron y por qué— antes de tocar nada.
 */
export default function AdminCatalogosPage() {
  const queryClient = useQueryClient();
  const [enCarga, setEnCarga] = useState<EstadoCatalogo | null>(null);

  const {
    data: catalogos = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["catalogos"],
    queryFn: listarCatalogos,
  });

  const sinCargar = catalogos.filter((c) => c.valores_vigentes === 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="estela-titulo text-2xl font-extrabold tracking-tight text-foreground">
          Catálogos del formato del aviso
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Las claves con las que se manda el informe. Donde el aviso pide una
          clave —estado, país, tipo de poder, giro mercantil— la pantalla del
          cliente ofrece una lista tomada de aquí y guarda la clave, no el
          texto. Los sujetos obligados los leen; sólo Kawiil los carga.
        </p>
      </div>

      {sinCargar.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning-ink" />
          <span>
            <strong>
              {sinCargar.length} de {catalogos.length} catálogos sin cargar.
            </strong>{" "}
            El instructivo del SAT los referencia pero no incluye sus valores:
            son archivos aparte de la UIF. Mientras no se carguen, la captura
            del cliente cae a clave manual con aviso visible — nunca a una lista
            vacía sin explicación.
          </span>
        </div>
      )}

      <div className="estela-placa overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-destructive text-sm">
            No se pudieron leer los catálogos: {(error as Error)?.message}
          </div>
        ) : (
          // La única tabla de la consola sin contenedor de desplazamiento: en
          // angosto perdía columnas sin manera de llegar a ellas.
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {[
                    "Catálogo",
                    "Campos del formato",
                    "Formato de clave",
                    "Valores",
                    "Actualizado",
                    "",
                  ].map((h) => (
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
                {catalogos.map((c) => (
                  <tr
                    key={c.codigo}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">
                        {c.nombre}
                      </p>
                      <p className="estela-dato text-[13px] text-muted-foreground">
                        {c.codigo}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.etiquetas_layout.map((e) => `<${e}>`).join(", ")}
                    </td>
                    <td className="px-4 py-3 estela-dato text-xs text-muted-foreground">
                      {c.clave_patron ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.valores_vigentes > 0 ? (
                        <span className="status-badge bg-success/10 text-success">
                          {c.valores_vigentes.toLocaleString("es-MX")}
                        </span>
                      ) : (
                        <span className="status-badge bg-warning/10 text-warning-ink">
                          Sin cargar
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.actualizado_en
                        ? `v${c.version} · ${new Date(c.actualizado_en).toLocaleDateString("es-MX")}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => setEnCarga(c)}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {c.valores_vigentes > 0 ? "Reemplazar" : "Cargar"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {enCarga && (
        <DialogCarga
          catalogo={enCarga}
          onCerrar={() => setEnCarga(null)}
          onCargado={() => {
            queryClient.invalidateQueries({ queryKey: ["catalogos"] });
            queryClient.invalidateQueries({ queryKey: ["catalogo"] });
            setEnCarga(null);
          }}
        />
      )}
    </div>
  );
}

function DialogCarga({
  catalogo,
  onCerrar,
  onCargado,
}: {
  catalogo: EstadoCatalogo;
  onCerrar: () => void;
  onCargado: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [previo, setPrevio] = useState<{
    valores: ValorCatalogo[];
    descartadas: { fila: number; motivo: string }[];
    fueraDePatron: ValorCatalogo[];
  } | null>(null);

  const carga = useMutation({
    mutationFn: () =>
      reemplazarValoresCatalogo(
        catalogo.codigo,
        previo!.valores,
        motivo || undefined,
      ),
    onSuccess: (n) => {
      toast.success(`${catalogo.nombre}: ${n} valores vigentes`);
      onCargado();
    },
    onError: (e: Error) => toast.error(`No se pudo cargar: ${e.message}`),
  });

  async function leerArchivo(file: File) {
    setNombreArchivo(file.name);
    const texto = await file.text();
    const r = parsearCatalogo(texto);
    setPrevio({
      valores: r.valores,
      descartadas: r.descartadas,
      fueraDePatron: clavesFueraDePatron(r.valores, catalogo.clave_patron),
    });
  }

  const bloqueado =
    !previo ||
    previo.valores.length === 0 ||
    previo.fueraDePatron.length > 0 ||
    carga.isPending;

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{catalogo.nombre}</DialogTitle>
          <DialogDescription>
            Archivo de dos columnas: clave y descripción. Acepta encabezado. El
            orden del archivo se conserva: así es como lo publica la UIF y es
            como lo verá quien captura.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Archivo (.csv o .txt)</Label>
            <Input
              ref={inputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void leerArchivo(f);
              }}
            />
          </div>

          {previo && (
            <div className="space-y-3">
              <div
                className={cn(
                  "rounded-md p-3",
                  previo.fueraDePatron.length > 0
                    ? "bg-warning/10"
                    : "bg-success/10",
                )}
              >
                <div className="flex items-center gap-2">
                  {previo.fueraDePatron.length > 0 ? (
                    <AlertTriangle className="w-4 h-4 text-warning-ink shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  )}
                  <p className="text-sm font-semibold text-foreground">
                    {previo.valores.length.toLocaleString("es-MX")} valores en{" "}
                    {nombreArchivo}
                  </p>
                </div>
                {previo.fueraDePatron.length > 0 && (
                  <p className="text-[13px] text-warning-ink mt-1 ml-6">
                    {previo.fueraDePatron.length} clave(s) no cumplen{" "}
                    <code>{catalogo.clave_patron}</code> — por ejemplo{" "}
                    <code>{previo.fueraDePatron[0].clave}</code>. La carga no
                    procede: una clave con la forma equivocada rechaza el aviso
                    en el portal.
                  </p>
                )}
              </div>

              {previo.descartadas.length > 0 && (
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs font-semibold text-foreground">
                    {previo.descartadas.length} fila(s) descartadas
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {previo.descartadas.slice(0, 8).map((d) => (
                      <li
                        key={d.fila}
                        className="text-[13px] text-muted-foreground"
                      >
                        Fila {d.fila}: {d.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs font-semibold text-foreground mb-2">
                  Previo
                </p>
                <ul className="space-y-0.5">
                  {previo.valores.slice(0, 8).map((v) => (
                    <li key={v.clave} className="text-xs">
                      <span className="estela-dato text-muted-foreground mr-2">
                        {v.clave}
                      </span>
                      {v.descripcion}
                    </li>
                  ))}
                </ul>
                {previo.valores.length > 8 && (
                  <p className="text-[13px] text-muted-foreground mt-1">
                    … y {previo.valores.length - 8} más
                  </p>
                )}
              </div>

              {catalogo.valores_vigentes > 0 && (
                <p className="text-[13px] text-warning-ink">
                  Este catálogo ya tiene {catalogo.valores_vigentes} valores.
                  Los actuales no se borran: se cierra su vigencia con la fecha
                  de hoy, para que un aviso presentado antes se pueda auditar
                  contra el catálogo que estaba entonces.
                </p>
              )}

              <div>
                <Label>Motivo o fuente de la carga</Label>
                <Input
                  placeholder="Catálogo publicado por la UIF, versión…"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            className="gap-2"
            disabled={bloqueado}
            onClick={() => carga.mutate()}
          >
            {carga.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Cargar catálogo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
