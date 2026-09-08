import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { formatMxn, cn } from "@/lib/utils";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SECTORES,
  UNIDADES,
  confirmarParametro,
  corregirParametro,
  fijarParametro,
} from "@/lib/api/parametros";
import { esReferenciaSinConfirmar, type ParametroVigente } from "@/lib/parametros";

type Fila = ParametroVigente & { id: string; vigente_hasta: string | null };

/** Histórico completo, no sólo lo vigente: un acto de 2025 se juzga con la UMA
 *  de 2025 aunque la revisión ocurra en 2029. */
async function listarHistorico(): Promise<Fila[]> {
  const { data, error } = await supabase
    .from("parametro_regulatorio")
    .select("*")
    .order("codigo")
    .order("vigente_desde", { ascending: false });
  if (error) throw new Error(`No se pudieron leer los parámetros: ${error.message}`);
  return (data ?? []) as unknown as Fila[];
}

const HOY = () => new Date().toISOString().slice(0, 10);

function vigenteHoy(p: { vigente_desde: string; vigente_hasta: string | null }): boolean {
  const hoy = HOY();
  return p.vigente_desde <= hoy && (p.vigente_hasta == null || p.vigente_hasta > hoy);
}

/** Sólo se corrige lo que todavía no rige. En cuanto rige, el motor pudo haber
 *  calculado con ese número y corregirlo reescribiría el pasado; la base lo
 *  rechaza, y la pantalla no debe ofrecer un botón que va a fallar. */
function todaviaNoRige(p: { vigente_desde: string }): boolean {
  return p.vigente_desde > HOY();
}

const FORM_VACIO = {
  codigo: "",
  nombre: "",
  valor: "",
  unidad: "mxn",
  sector: "*",
  vigente_desde: "",
  fuente: "",
  publicacion_dof: "",
  url_fuente: "",
};

export default function AdminParametrosPage() {
  const queryClient = useQueryClient();
  const [alta, setAlta] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [corrigiendo, setCorrigiendo] = useState<Fila | null>(null);
  const [correccion, setCorreccion] = useState({ valor: "", fuente: "", motivo: "" });
  const [confirmando, setConfirmando] = useState<Fila | null>(null);
  const [quienConfirma, setQuienConfirma] = useState("");

  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ["admin", "parametros"],
    queryFn: listarHistorico,
  });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ["admin", "parametros"] });

  const alGuardar = useMutation({
    mutationFn: () =>
      fijarParametro({
        codigo: form.codigo,
        nombre: form.nombre,
        valor: Number(form.valor),
        unidad: form.unidad,
        sector: form.sector,
        vigente_desde: form.vigente_desde,
        fuente: form.fuente,
        publicacion_dof: form.publicacion_dof,
        url_fuente: form.url_fuente,
      }),
    onSuccess: () => {
      refrescar();
      toast.success("Parámetro cargado. La vigencia anterior quedó cerrada en esa fecha.");
      setAlta(false);
      setForm(FORM_VACIO);
    },
    // El mensaje viene de la base y está escrito para leerse: dice qué choca y
    // con qué. Repetirlo tal cual es mejor que traducirlo a «error al guardar».
    onError: (e: Error) => toast.error(e.message),
  });

  const alCorregir = useMutation({
    mutationFn: () =>
      corregirParametro(
        corrigiendo!.id,
        Number(correccion.valor),
        correccion.fuente,
        correccion.motivo,
      ),
    onSuccess: () => {
      refrescar();
      toast.success("Corregido. Queda como sin confirmar: lo que se validó era el número viejo.");
      setCorrigiendo(null);
      setCorreccion({ valor: "", fuente: "", motivo: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alConfirmar = useMutation({
    mutationFn: () => confirmarParametro(confirmando!.id, quienConfirma),
    onSuccess: () => {
      refrescar();
      toast.success("Confirmado.");
      setConfirmando(null);
      setQuienConfirma("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sinConfirmar = data.filter(esReferenciaSinConfirmar).length;
  const faltaAlgo =
    !form.codigo.trim() ||
    !form.nombre.trim() ||
    !form.valor ||
    Number(form.valor) <= 0 ||
    !form.vigente_desde ||
    form.fuente.trim().length < 5;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="estela-titulo text-2xl font-extrabold tracking-tight text-foreground">Parámetros regulatorios</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Valores fijados por una autoridad, con su vigencia y su fuente. El motor y el front
            los leen de aquí; ninguno declara cifras propias.
          </p>
        </div>
        <Button onClick={() => setAlta(true)} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Cargar valor nuevo
        </Button>
      </div>

      {sinConfirmar > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning-ink" />
          <span>
            <strong>
              {sinConfirmar} {sinConfirmar === 1 ? "parámetro" : "parámetros"} sin validar por
              Kawiil-Cumplimiento.
            </strong>{" "}
            Están sembrados y el motor los usa, pero nadie ha cotejado la cifra contra el texto
            legal vigente. La UI los marca como referencia hasta que se confirmen.
          </span>
        </div>
      )}

      <div className="estela-placa overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </div>
        ) : isError ? (
          <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {["Parámetro", "Alcance", "Valor", "Vigencia", "Fuente", "Estado", ""].map((h) => (
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
                {data.map((p) => {
                  const activo = vigenteHoy(p);
                  const futuro = todaviaNoRige(p);
                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "border-b border-border last:border-0",
                        !activo && !futuro && "opacity-55",
                      )}
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-foreground">{p.nombre}</span>
                        <span className="block estela-dato text-[13px] text-muted-foreground mt-0.5">
                          {p.codigo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {p.sector === "*" ? "Todas" : `Fracción ${p.sector}`}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold tabular-nums">
                        {p.unidad === "mxn"
                          ? formatMxn(p.valor_numerico)
                          : `${p.valor_numerico.toLocaleString("es-MX")} ${p.unidad.toUpperCase()}`}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(p.vigente_desde).toLocaleDateString("es-MX")}
                        {p.vigente_hasta
                          ? ` — ${new Date(p.vigente_hasta).toLocaleDateString("es-MX")}`
                          : " — vigente"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[260px]">
                        {p.fuente}
                        {p.publicacion_dof && (
                          <span className="block text-[13px] mt-0.5">{p.publicacion_dof}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {futuro ? (
                          <span className="status-badge bg-accent/10 text-accent">
                            Entra en vigor el{" "}
                            {new Date(p.vigente_desde).toLocaleDateString("es-MX")}
                          </span>
                        ) : !activo ? (
                          <span className="status-badge bg-muted text-muted-foreground">
                            Histórico
                          </span>
                        ) : esReferenciaSinConfirmar(p) ? (
                          <span className="status-badge bg-warning/10 text-warning-ink">
                            Sin confirmar
                          </span>
                        ) : (
                          <span className="status-badge bg-success/10 text-success">Confirmado</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {/* Sólo se ofrece corregir lo que todavía no rige. Un
                            botón que la base va a rechazar es peor que ninguno. */}
                        {futuro && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setCorrigiendo(p);
                              setCorreccion({
                                valor: String(p.valor_numerico),
                                fuente: p.fuente,
                                motivo: "",
                              });
                            }}
                          >
                            Corregir
                          </Button>
                        )}
                        {!p.confirmado_por && (activo || futuro) && (
                          <Button size="sm" variant="ghost" onClick={() => setConfirmando(p)}>
                            Confirmar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      <Dialog open={alta} onOpenChange={(v) => !v && setAlta(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cargar valor nuevo</DialogTitle>
            <DialogDescription>
              Si ya hay un valor vigente para ese código y alcance, su vigencia se cierra el día
              en que empieza éste. Es una sola operación: no queda ningún día sin valor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="codigo">Código</Label>
                <Input
                  id="codigo"
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  placeholder="uma_diaria"
                  className="estela-dato"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vigente">Entra en vigor el</Label>
                <Input
                  id="vigente"
                  type="date"
                  value={form.vigente_desde}
                  onChange={(e) => setForm({ ...form, vigente_desde: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="UMA diaria"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="valor">Valor</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.0001"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unidad</Label>
                <Select value={form.unidad} onValueChange={(v) => setForm({ ...form, unidad: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map((u) => (
                      <SelectItem key={u.valor} value={u.valor}>
                        {u.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Alcance</Label>
                <Select value={form.sector} onValueChange={(v) => setForm({ ...form, sector: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTORES.map((s) => (
                      <SelectItem key={s.valor} value={s.valor}>
                        {s.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fuente">Fuente</Label>
              <Input
                id="fuente"
                value={form.fuente}
                onChange={(e) => setForm({ ...form, fuente: e.target.value })}
                placeholder="INEGI, valor de la UMA 2027"
              />
              {/* La base lo exige y aquí se explica por qué, en vez de dejar
                  que el usuario descubra el rechazo al guardar. */}
              <p className="text-xs text-muted-foreground">
                Obligatoria. Una cifra sin referencia publicada no se puede defender ante una
                revisión.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dof">Publicación en el DOF</Label>
                <Input
                  id="dof"
                  value={form.publicacion_dof}
                  onChange={(e) => setForm({ ...form, publicacion_dof: e.target.value })}
                  placeholder="DOF 09/01/2027"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="url">Liga</Label>
                <Input
                  id="url"
                  value={form.url_fuente}
                  onChange={(e) => setForm({ ...form, url_fuente: e.target.value })}
                  placeholder="https://…"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAlta(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => alGuardar.mutate()}
              disabled={faltaAlgo || alGuardar.isPending}
              className="gap-2"
            >
              {alGuardar.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Cargar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------------------- */}
      <Dialog open={corrigiendo !== null} onOpenChange={(v) => !v && setCorrigiendo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corregir antes de que entre en vigor</DialogTitle>
            <DialogDescription>
              {corrigiendo?.nombre} entra en vigor el{" "}
              {corrigiendo && new Date(corrigiendo.vigente_desde).toLocaleDateString("es-MX")}, así
              que el motor todavía no ha calculado nada con este número y corregirlo no reescribe
              nada. Vuelve a quedar sin confirmar: lo que se validó era el valor anterior.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cvalor">Valor correcto</Label>
              <Input
                id="cvalor"
                type="number"
                step="0.0001"
                value={correccion.valor}
                onChange={(e) => setCorreccion({ ...correccion, valor: e.target.value })}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfuente">Fuente</Label>
              <Input
                id="cfuente"
                value={correccion.fuente}
                onChange={(e) => setCorreccion({ ...correccion, fuente: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cmotivo">Motivo</Label>
              <Textarea
                id="cmotivo"
                rows={2}
                value={correccion.motivo}
                onChange={(e) => setCorreccion({ ...correccion, motivo: e.target.value })}
                placeholder="Se capturó 117.31 y el DOF dice 122.50."
              />
              <p className="text-xs text-muted-foreground">
                Al menos 10 caracteres. Se guarda en las notas del parámetro y en la bitácora.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrigiendo(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => alCorregir.mutate()}
              disabled={
                !correccion.valor ||
                Number(correccion.valor) <= 0 ||
                correccion.motivo.trim().length < 10 ||
                alCorregir.isPending
              }
              className="gap-2"
            >
              {alCorregir.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Corregir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------------------- */}
      <Dialog open={confirmando !== null} onOpenChange={(v) => !v && setConfirmando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar el parámetro</DialogTitle>
            <DialogDescription>
              Confirmar quiere decir que alguien cotejó {confirmando?.valor_numerico} contra el
              texto legal vigente, no que se ve razonable. Queda firmado con el nombre que
              escribas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="quien">Quién lo cotejó</Label>
            <Input
              id="quien"
              value={quienConfirma}
              onChange={(e) => setQuienConfirma(e.target.value)}
              placeholder="Kawiil-Cumplimiento"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => alConfirmar.mutate()}
              disabled={quienConfirma.trim().length < 3 || alConfirmar.isPending}
              className="gap-2"
            >
              {alConfirmar.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
