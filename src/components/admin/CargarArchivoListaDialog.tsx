import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { registrarCargaArchivo } from "@/lib/api/listas";
import { labelSituacion, type ListaFuente } from "@/lib/listas";
import {
  analizarArchivo,
  avisoDeControl,
  FORMATO_ESPERADO,
  FUENTES_CON_LECTOR,
  type AnalisisLista,
} from "@/lib/lectores-lista";

interface Props {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  fuentes: ListaFuente[];
}

/** Las situaciones tienen etiqueta propia; los tipos de entidad y los alias no. */
function etiquetaCifra(clave: string): string {
  const situaciones = ["presunto", "definitivo", "desvirtuado", "sentencia_favorable"];
  if (situaciones.includes(clave)) return labelSituacion(clave);
  const otras: Record<string, string> = {
    persona: "personas",
    empresa: "empresas",
    embarcacion: "embarcaciones",
    aeronave: "aeronaves",
  };
  return otras[clave] ?? clave;
}

export function CargarArchivoListaDialog({ abierto, onOpenChange, fuentes }: Props) {
  const queryClient = useQueryClient();
  const [fuenteId, setFuenteId] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [alcance, setAlcance] = useState<"completa" | "parcial">("parcial");
  const [analisis, setAnalisis] = useState<AnalisisLista | null>(null);
  const [errorAnalisis, setErrorAnalisis] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);

  const fuente = fuentes.find((f) => f.id === fuenteId);
  const soportada = fuente ? FUENTES_CON_LECTOR.has(fuente.codigo) : false;

  function limpiar() {
    setFuenteId(""); setArchivo(null); setAlcance("parcial");
    setAnalisis(null); setErrorAnalisis(null); setProgreso(null); setLeyendo(false);
  }

  async function analizar(f: File) {
    if (!fuente) return;
    setArchivo(f); setAnalisis(null); setErrorAnalisis(null); setLeyendo(true);
    try {
      const r = await analizarArchivo(fuente.codigo, f);
      setAnalisis(r);
      // Lo que el lector propone; quien carga confirma.
      setAlcance(r.alcanceSugerido);
    } catch (e) {
      setErrorAnalisis((e as Error).message);
    } finally {
      setLeyendo(false);
    }
  }

  const cargar = useMutation({
    mutationFn: () =>
      registrarCargaArchivo({
        fuente_id: fuenteId,
        archivo: archivo!,
        alcance,
        fecha_publicacion_fuente: analisis?.fechaActualizacion ?? null,
        notas: `${archivo!.name} · ${analisis!.etiqueta}`,
        registros: analisis!.registros,
        onProgreso: (hechos, total) => setProgreso({ hechos, total }),
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["listas"] });
      toast.success(
        `Carga aplicada: ${r.insertados.toLocaleString("es-MX")} registros` +
          (r.desactivados > 0
            ? `, ${r.desactivados.toLocaleString("es-MX")} dados de baja por ausencia.`
            : "."),
      );
      onOpenChange(false); limpiar();
    },
    onError: (e: Error) => { setProgreso(null); toast.error(e.message, { duration: 15000 }); },
  });

  const control = analisis && fuente ? avisoDeControl(fuente.codigo, analisis.registros.length) : null;

  return (
    <Dialog open={abierto} onOpenChange={(o) => { onOpenChange(o); if (!o) limpiar(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar archivo de lista</DialogTitle>
          <DialogDescription>
            El archivo se analiza antes de tocar la base. Nada se aplica hasta que confirmes
            lo que muestra la vista previa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Fuente</Label>
            <Select
              value={fuenteId}
              onValueChange={(v) => {
                setFuenteId(v); setAnalisis(null); setArchivo(null); setErrorAnalisis(null);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Seleccione…" /></SelectTrigger>
              <SelectContent>
                {fuentes.filter((f) => f.modo_actualizacion === "snapshot").map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {fuente && !soportada && (
            <div className="flex items-start gap-3 rounded-md border border-warning/40 estela-aviso bg-gradient-to-r from-warning/15 to-warning/5 px-4 py-3 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-ikan-ambar" />
              <span>
                <strong>Todavía no hay lector para «{fuente.nombre}».</strong> Hay lector para los
                dos listados del SAT, para OFAC y para la ONU.
              </span>
            </div>
          )}

          {soportada && fuente && (
            <div>
              <Label>Archivo</Label>
              <Input
                type="file"
                accept=".csv,.xls,.txt,.xml"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void analizar(f); }}
              />
              <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                {FORMATO_ESPERADO[fuente.codigo]}
              </p>
              <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                Súbelo tal cual lo descargaste, <strong>sin abrirlo ni reguardarlo</strong>: al
                hacerlo cambia la codificación y se pierden los acentos y los caracteres no
                latinos.
              </p>
            </div>
          )}

          {leyendo && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Leyendo el archivo…
            </div>
          )}

          {errorAnalisis && (
            <div className="rounded-md border border-destructive/40 estela-aviso bg-gradient-to-r from-destructive/10 to-destructive/5 px-4 py-3 text-sm text-destructive">
              <strong>No se pudo leer el archivo.</strong> {errorAnalisis}
            </div>
          )}

          {analisis && (
            <div className="space-y-3 rounded-md border border-border estela-aviso p-4">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                <span className="font-semibold">{analisis.etiqueta}</span>
                <span className="text-muted-foreground">
                  publicado el{" "}
                  {analisis.fechaActualizacion
                    ? new Date(analisis.fechaActualizacion + "T12:00:00").toLocaleDateString("es-MX")
                    : "— sin fecha en el archivo"}
                </span>
                <span className="font-semibold tabular-nums ml-auto">
                  {analisis.registros.length.toLocaleString("es-MX")} registros
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {analisis.cifras.map((c) => (
                  <span
                    key={c.etiqueta}
                    className="status-badge bg-card text-foreground border border-border"
                  >
                    {etiquetaCifra(c.etiqueta)}: {c.valor.toLocaleString("es-MX")}
                  </span>
                ))}
              </div>

              {control && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <strong>Cifra de control.</strong> {control}
                </div>
              )}

              {analisis.avisos.map((a) => (
                <p key={a} className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-2">
                  {a}
                </p>
              ))}

              {analisis.descartadas.length > 0 && (
                <div className="text-xs space-y-1 border-t border-border pt-2">
                  {/* «registros» y no «filas»: con OFAC y la ONU lo que se
                      descarta es una entidad, no un renglón de CSV. */}
                  <p className="text-warning-ink font-medium">
                    {analisis.descartadas.length.toLocaleString("es-MX")} registros no se pudieron
                    interpretar y no se cargarán:
                  </p>
                  <ul className="text-muted-foreground space-y-0.5 max-h-28 overflow-y-auto">
                    {analisis.descartadas.slice(0, 8).map((d) => (
                      <li key={`${d.referencia}-${d.motivo}`}>· {d.referencia}: {d.motivo}</li>
                    ))}
                    {analisis.descartadas.length > 8 && (
                      <li>· y {(analisis.descartadas.length - 8).toLocaleString("es-MX")} más</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="border-t border-border pt-3">
                <Label className="text-xs">Alcance del archivo</Label>
                <Select value={alcance} onValueChange={(v) => setAlcance(v as "completa" | "parcial")}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completa">
                      Listado completo · da de baja lo que ya no aparece
                    </SelectItem>
                    <SelectItem value="parcial">
                      Listado parcial · sólo agrega y actualiza
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
                  {alcance === "completa" ? (
                    <>
                      Se dará de baja a quien esté activo en esta fuente y no venga en el
                      archivo. Úsalo <strong>sólo con el listado completo</strong> de la fuente.
                    </>
                  ) : (
                    <>Nadie se da de baja. Es la opción segura cuando no estés seguro.</>
                  )}
                </p>
              </div>
            </div>
          )}

          {progreso && (
            <div className="text-sm text-muted-foreground">
              Cargando {progreso.hechos.toLocaleString("es-MX")} de{" "}
              {progreso.total.toLocaleString("es-MX")}…
              <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${(progreso.hechos / progreso.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="gap-2"
            onClick={() => cargar.mutate()}
            disabled={!analisis || analisis.registros.length === 0 || cargar.isPending}
          >
            {cargar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            Aplicar carga
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
