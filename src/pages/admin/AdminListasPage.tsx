import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, RotateCcw, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listarCargas, listarFuentes, listarVigentes, registrarCarga, revertirCarga,
} from "@/lib/api/listas";
import {
  admiteCapturaManual, ESTADO_CARGA_LABEL, labelSituacion, MODO_LABEL, movimientoVacio,
  NATURALEZA_LABEL, validarMovimiento,
  type AccionMovimiento, type MovimientoCaptura,
} from "@/lib/listas";
import { cn } from "@/lib/utils";
import { CargarArchivoListaDialog } from "@/components/admin/CargarArchivoListaDialog";
import { PendientesDelJob } from "@/components/admin/PendientesDelJob";

export default function AdminListasPage() {
  const queryClient = useQueryClient();
  const [dialogo, setDialogo] = useState(false);
  const [dialogoArchivo, setDialogoArchivo] = useState(false);
  const [fuenteFiltro, setFuenteFiltro] = useState<string>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [aRevertir, setARevertir] = useState<{ id: string; notas: string | null } | null>(null);
  const [motivoReversion, setMotivoReversion] = useState("");

  // --- Formulario de captura ---
  const [fuenteId, setFuenteId] = useState("");
  const [fechaPublicacion, setFechaPublicacion] = useState("");
  const [notasCarga, setNotasCarga] = useState("");
  const [lineas, setLineas] = useState<MovimientoCaptura[]>([movimientoVacio()]);

  const fuentes = useQuery({ queryKey: ["listas", "fuentes"], queryFn: listarFuentes });
  const cargas = useQuery({ queryKey: ["listas", "cargas"], queryFn: () => listarCargas() });
  const vigentes = useQuery({
    queryKey: ["listas", "vigentes", fuenteFiltro, busqueda],
    queryFn: () => listarVigentes(fuenteFiltro === "todas" ? undefined : fuenteFiltro, busqueda),
  });

  const capturables = useMemo(
    () => (fuentes.data ?? []).filter(admiteCapturaManual),
    [fuentes.data],
  );

  const fuenteSeleccionada = useMemo(
    () => (fuentes.data ?? []).find((f) => f.id === fuenteId),
    [fuentes.data, fuenteId],
  );

  const errores = useMemo(
    () => lineas.map((l) => validarMovimiento(l, fuenteSeleccionada)),
    [lineas, fuenteSeleccionada],
  );
  const hayErrores = errores.some((e) => e.length > 0);

  function actualizarLinea(i: number, campo: keyof MovimientoCaptura, valor: string) {
    setLineas((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)),
    );
  }

  function limpiarFormulario() {
    setFuenteId("");
    setFechaPublicacion("");
    setNotasCarga("");
    setLineas([movimientoVacio()]);
  }

  const guardar = useMutation({
    mutationFn: () =>
      registrarCarga({
        fuente_id: fuenteId,
        fecha_publicacion_fuente: fechaPublicacion || undefined,
        notas: notasCarga || undefined,
        movimientos: lineas,
      }),
    onSuccess: ({ aplicados }) => {
      queryClient.invalidateQueries({ queryKey: ["listas"] });
      toast.success(
        `Carga registrada: ${aplicados} ${aplicados === 1 ? "movimiento aplicado" : "movimientos aplicados"}.`,
      );
      setDialogo(false);
      limpiarFormulario();
    },
    // El mensaje viene de la base y explica qué movimiento falló y por qué
    // (por ejemplo, una baja de alguien que nunca fue dado de alta). Se
    // muestra completo: recortarlo dejaría al admin sin saber qué corregir.
    onError: (e: Error) => toast.error(e.message, { duration: 12000 }),
  });

  const revertir = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => revertirCarga(id, motivo),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["listas"] });
      toast.success(
        `Carga revertida: ${r.movimientos_borrados} movimientos borrados, ` +
          `${r.registros_recalculados} registros recalculados, ${r.registros_eliminados} eliminados.`,
      );
      setARevertir(null);
      setMotivoReversion("");
    },
    onError: (e: Error) => toast.error(e.message, { duration: 12000 }),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="estela-titulo text-2xl font-extrabold tracking-tight text-foreground">Listas restrictivas</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Catálogo de plataforma. Sólo Kawiil actualiza estas listas; las organizaciones
            cliente las consumen y no pueden escribirlas. Lo que se apruebe aquí queda vigente
            para todas al instante, sin importar su actividad.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setDialogoArchivo(true)}>
            <Upload className="w-4 h-4" /> Cargar archivo
          </Button>
          <Button className="gap-2" onClick={() => setDialogo(true)} disabled={capturables.length === 0}>
            <Plus className="w-4 h-4" /> Registrar movimientos
          </Button>
        </div>
      </div>

      {/* Lo que espera decisión va arriba de todo: una lista desactualizada
          no avisa por su cuenta. */}
      <PendientesDelJob />

      <Tabs defaultValue="vigentes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="vigentes">Personas y entidades listadas</TabsTrigger>
          <TabsTrigger value="cargas">Cargas</TabsTrigger>
          <TabsTrigger value="fuentes">Fuentes</TabsTrigger>
        </TabsList>

        {/* ---------------- Vigentes ---------------- */}
        <TabsContent value="vigentes" className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Buscar por nombre…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <Select value={fuenteFiltro} onValueChange={setFuenteFiltro}>
              <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las fuentes</SelectItem>
                {(fuentes.data ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.codigo}>{f.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="estela-placa overflow-hidden">
            {vigentes.isLoading ? (
              <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
              </div>
            ) : vigentes.isError ? (
              <p className="p-6 text-sm text-destructive">{(vigentes.error as Error).message}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {["Nombre", "RFC", "Fuente", "Situación", "Oficio de alta", "Desde"].map((h) => (
                        <th key={h} className="estela-antetitulo text-muted-foreground px-4 py-3 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(vigentes.data ?? []).map((r) => (
                      <tr key={r.registro_id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{r.nombre}</td>
                        <td className="px-4 py-3 estela-dato text-sm text-muted-foreground">{r.rfc ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "status-badge",
                            r.naturaleza === "fiscal"
                              ? "bg-muted text-muted-foreground"
                              : "bg-destructive/10 text-destructive",
                          )}>
                            {r.fuente_nombre}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {r.situacion ? (
                            <span className={cn(
                              "status-badge",
                              r.bloqueante
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground",
                            )}>
                              {labelSituacion(r.situacion)}
                              {!r.bloqueante && " · informativo"}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 estela-dato text-sm">{r.alta_oficio ?? "—"}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {r.alta_fecha ? new Date(r.alta_fecha).toLocaleDateString("es-MX") : "—"}
                        </td>
                      </tr>
                    ))}
                    {(vigentes.data ?? []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No hay personas ni entidades listadas todavía. Registra el primer oficio
                          con «Registrar movimientos».
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ---------------- Cargas ---------------- */}
        <TabsContent value="cargas">
          <div className="estela-placa overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {["Fecha", "Fuente", "Tipo", "Movimientos", "Estado", "Notas", ""].map((h) => (
                      <th key={h} className="estela-antetitulo text-muted-foreground px-4 py-3 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(cargas.data ?? []).map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-sm">
                        {new Date(c.cargada_en).toLocaleDateString("es-MX")}
                      </td>
                      <td className="px-4 py-3 estela-dato text-sm">{c.fuente_codigo ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {c.tipo === "captura_manual" ? "Captura manual" : c.tipo === "archivo" ? "Archivo" : "API"}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums">{c.num_movimientos}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "status-badge",
                          c.estado === "aplicada" ? "bg-success/10 text-success"
                            : c.estado === "revertida" ? "bg-muted text-muted-foreground"
                            : "bg-warning/15 text-warning-ink",
                        )}>
                          {ESTADO_CARGA_LABEL[c.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[280px]">{c.notas ?? "—"}</td>
                      <td className="px-4 py-3">
                        {c.estado === "aplicada" && (
                          <Button
                            variant="ghost" size="sm" className="gap-1.5 text-xs"
                            onClick={() => setARevertir({ id: c.id, notas: c.notas })}
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Revertir
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(cargas.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Sin cargas registradas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ---------------- Fuentes ---------------- */}
        <TabsContent value="fuentes" className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-ikan-ambar" />
            <span>
              <strong>Los listados del SAT ya se pueden cargar</strong> (69-B y 69-B Bis), con
              vista previa antes de aplicar. OFAC, ONU y UE todavía no: su formato es XML y su
              lector es un trabajo aparte.
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {(fuentes.data ?? []).map((f) => (
              <div key={f.id} className="estela-placa p-5 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{f.nombre}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{f.autoridad}</p>
                  </div>
                  {f.obligatoria && (
                    <span className="status-badge bg-accent/10 text-accent text-xs shrink-0">
                      Obligatoria
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className={cn(
                    "status-badge text-xs",
                    f.naturaleza === "fiscal" ? "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground",
                  )}>
                    {NATURALEZA_LABEL[f.naturaleza]}
                  </span>
                  <span className="status-badge bg-muted text-muted-foreground text-xs">
                    {f.modo_actualizacion === "movimientos" ? (
                      <>Altas y bajas por oficio</>
                    ) : (
                      <><Upload className="w-3 h-3 inline mr-1" />{MODO_LABEL[f.modo_actualizacion]}</>
                    )}
                  </span>
                </div>
                {f.notas && <p className="text-xs text-muted-foreground leading-relaxed pt-1">{f.notas}</p>}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* ---------------- Diálogo de captura ---------------- */}
      <Dialog open={dialogo} onOpenChange={(o) => { setDialogo(o); if (!o) limpiarFormulario(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar movimientos de lista</DialogTitle>
            <DialogDescription>
              Un oficio puede traer varias personas. Todas se registran juntas como una sola
              carga: si alguna falla, no se aplica ninguna.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-3 py-2">
            <div className="md:col-span-1">
              <Label>Fuente</Label>
              <Select value={fuenteId} onValueChange={setFuenteId}>
                <SelectTrigger><SelectValue placeholder="Seleccione…" /></SelectTrigger>
                <SelectContent>
                  {capturables.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha de publicación</Label>
              <Input type="date" value={fechaPublicacion} onChange={(e) => setFechaPublicacion(e.target.value)} />
              <p className="text-[13px] text-muted-foreground mt-1">
                Cuándo lo emitió la autoridad, no cuándo lo capturas.
              </p>
            </div>
            <div>
              <Label>Notas de la carga</Label>
              <Input value={notasCarga} onChange={(e) => setNotasCarga(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <div className="space-y-3">
            {lineas.map((l, i) => (
              <div key={i} className="rounded-md border border-border p-4 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="estela-antetitulo text-muted-foreground">
                    Persona {i + 1}
                  </span>
                  {lineas.length > 1 && (
                    <Button
                      variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive"
                      onClick={() => setLineas((p) => p.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Quitar
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div>
                    <Label className="text-xs">Movimiento</Label>
                    <Select
                      value={l.accion}
                      onValueChange={(v) => actualizarLinea(i, "accion", v as AccionMovimiento)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alta">Alta · bloquear</SelectItem>
                        <SelectItem value="baja">Baja · liberar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-xs">Nombre o razón social</Label>
                    <Input value={l.nombre} onChange={(e) => actualizarLinea(i, "nombre", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">RFC</Label>
                    <Input
                      value={l.rfc}
                      onChange={(e) => actualizarLinea(i, "rfc", e.target.value)}
                      placeholder="Opcional"
                      className="estela-dato"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Número de oficio</Label>
                    <Input
                      value={l.oficio_numero}
                      onChange={(e) => actualizarLinea(i, "oficio_numero", e.target.value)}
                      className="estela-dato"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Fecha del oficio</Label>
                    <Input type="date" value={l.oficio_fecha} onChange={(e) => actualizarLinea(i, "oficio_fecha", e.target.value)} />
                  </div>
                  {fuenteSeleccionada?.situaciones && (
                    <div>
                      <Label className="text-xs">Situación</Label>
                      <Select
                        value={l.situacion}
                        onValueChange={(v) => actualizarLinea(i, "situacion", v)}
                      >
                        <SelectTrigger><SelectValue placeholder="Seleccione…" /></SelectTrigger>
                        <SelectContent>
                          {fuenteSeleccionada.situaciones.map((sit) => (
                            <SelectItem key={sit} value={sit}>
                              {labelSituacion(sit)}
                              {fuenteSeleccionada.situaciones_bloqueantes?.includes(sit)
                                ? " · genera hallazgo"
                                : " · sólo informativo"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Motivo</Label>
                    <Input value={l.motivo} onChange={(e) => actualizarLinea(i, "motivo", e.target.value)} placeholder="Opcional" />
                  </div>
                </div>

                {errores[i].length > 0 && (
                  <ul className="text-xs text-destructive space-y-0.5 pt-1">
                    {errores[i].map((e) => <li key={e}>· {e}</li>)}
                  </ul>
                )}
              </div>
            ))}

            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={() => setLineas((p) => [...p, movimientoVacio()])}
            >
              <Plus className="w-3.5 h-3.5" /> Agregar otra persona
            </Button>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDialogo(false)}>Cancelar</Button>
            <Button
              onClick={() => guardar.mutate()}
              disabled={!fuenteId || hayErrores || guardar.isPending}
            >
              {guardar.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Registrar carga
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CargarArchivoListaDialog
        abierto={dialogoArchivo}
        onOpenChange={setDialogoArchivo}
        fuentes={fuentes.data ?? []}
      />

      {/* ---------------- Confirmar reversión ---------------- */}
      <AlertDialog open={aRevertir != null} onOpenChange={(o) => { if (!o) { setARevertir(null); setMotivoReversion(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revertir esta carga</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Revertir es para una carga que <strong>nunca debió existir</strong>: archivo
                  equivocado o captura errónea. Borra sus movimientos y recalcula el estado
                  vigente con los que queden.
                </p>
                <p>
                  Si en cambio el hecho fue real y cambió —la persona sí estaba bloqueada y la
                  autoridad la liberó— no reviertas: registra el movimiento contrario con su
                  oficio, para que la bitácora conserve las dos cosas.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-1">
            <Label className="text-xs">Motivo de la reversión</Label>
            <Textarea
              value={motivoReversion}
              onChange={(e) => setMotivoReversion(e.target.value)}
              placeholder="Por ejemplo: RFC capturado por error"
              rows={2}
            />
            <p className="text-[13px] text-muted-foreground mt-1">
              Queda como constancia permanente en la carga.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!motivoReversion.trim() || revertir.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (aRevertir) revertir.mutate({ id: aRevertir.id, motivo: motivoReversion.trim() });
              }}
            >
              Revertir carga
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
