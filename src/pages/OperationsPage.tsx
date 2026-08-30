import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listarClientes } from "@/lib/api/clientes";
import {
  listarOperaciones,
  crearOperacion,
  invocarMotor,
  actualizarDatosActo,
} from "@/lib/api/operaciones";
import type { NuevaOperacionInput, TipoOperacion } from "@/types/domain";
import { formatMxn, cn } from "@/lib/utils";
import { useParametros } from "@/hooks/useParametros";
import { PARAM } from "@/lib/parametros";
import { useAuth } from "@/lib/auth-context";
import {
  LABELS,
  NOTA_CANALES,
  TIPOS_ACTO_NOTARIA,
  UMBRALES_XII_REFERENCIA,
  canalDeActo,
  labelTipoActo,
} from "@/lib/perfil-actividad";
import { getClavesPadron } from "@/lib/api/organizacion";
import { PendientesAviso } from "@/components/aviso/PendientesAviso";
import { CapturaActo } from "@/components/aviso/CapturaActo";
import type { DatosActo } from "@/lib/aviso/valores-acto";
import { useActiveRole } from "@/hooks/useActiveRole";
import type { Operation } from "@/types/domain";
import {
  catalogosPendientes,
  pendientesActo,
  pendientesCompareciente,
  pendientesSujetoObligado,
} from "@/lib/aviso/completitud";


const TIPOS: { value: TipoOperacion; label: string }[] = [
  { value: "compra_fiat_cripto", label: "Compra fiat → cripto" },
  { value: "venta_cripto_fiat", label: "Venta cripto → fiat" },
  { value: "retiro_cripto", label: "Retiro cripto" },
  { value: "deposito_fiat", label: "Depósito fiat" },
  { value: "otro", label: "Otro" },
];

/** Hoy, en AAAA-MM-DD local. El acto se firma hoy en la inmensa mayoría de los
 *  casos; que venga precargada evita que el notario lo deje en la fecha de
 *  captura sin darse cuenta cuando sí difiere. */
function hoyISO() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

const FORM_INICIAL = {
  client_id: "",
  tipo: "compra_fiat_cripto" as TipoOperacion,
  monto_mxn: "",
  activo_virtual: "",
  pais_iso2: "",
  tipo_acto: "",
  fecha: hoyISO(),
  instrumento_publico: "",
  datos_acto: {} as DatosActo,
};

export default function OperationsPage() {
  const [search, setSearch] = useState("");
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  // Acto cuyo expediente se está completando desde la lista. El detalle del
  // acto rara vez está entero el día de la firma.
  const [actoEnCurso, setActoEnCurso] = useState<Operation | null>(null);
  const [datosEnCurso, setDatosEnCurso] = useState<DatosActo>({});
  const queryClient = useQueryClient();
  const { perfilActividad } = useAuth();
  const { activeRole } = useActiveRole();
  // Completar un acto ya registrado es de OC/Admin: la política
  // `operation_update_motor_or_oc` sólo se lo permite a ellos y el flujo del
  // Operador termina con el acuse (docs/ROLES.md).
  const puedeCompletar = activeRole === "oc" || activeRole === "admin";
  const L = LABELS[perfilActividad];
  const esNotarias = perfilActividad === "notarias";

  // Umbrales y UMA vienen de `parametro_regulatorio` (migration 0011), no de
  // constantes. Si un parámetro no está vigente, `valor()` devuelve undefined
  // y la UI muestra un guion en vez de inventar una cifra.
  const { valor: valorParam } = useParametros();
  const umaMxn = valorParam(PARAM.UMA_DIARIA);
  const umbral645Uma = valorParam(PARAM.UMBRAL_IDENTIFICACION);
  const umbral3210Uma = valorParam(PARAM.UMBRAL_RESTRICCION);
  const threshold645 =
    umaMxn != null && umbral645Uma != null ? umbral645Uma * umaMxn : undefined;
  const threshold3210 =
    umaMxn != null && umbral3210Uma != null ? umbral3210Uma * umaMxn : undefined;

  const { data: operaciones = [], isLoading, isError, error } = useQuery({
    queryKey: ["operaciones"],
    queryFn: listarOperaciones,
  });
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: listarClientes });
  // Las claves del padrón se revisan una vez, no acto por acto: si faltan,
  // ningún aviso de la organización se puede generar.
  const { data: clavesPadron } = useQuery({
    queryKey: ["claves-padron"],
    queryFn: getClavesPadron,
    enabled: esNotarias,
  });

  const nombrePorCliente = new Map(clientes.map((c) => [c.id, c.nombre_razon_social]));
  const clientePorId = new Map(clientes.map((c) => [c.id, c]));

  /**
   * Qué umbral rebasa el monto, dicho con palabras.
   *
   * La fila se tiñe según esto, pero el tinte no informa a nadie que no
   * distinga esos colores, ni sobrevive a imprimir la tabla en blanco y negro.
   * El color refuerza; el texto es el que lleva el significado.
   */
  function umbralRebasado(monto: number): { etiqueta: string; clase: string } | null {
    if (threshold3210 != null && monto >= threshold3210)
      return {
        etiqueta: "Rebasa el umbral de restricción (3 210 UMA)",
        clase: "bg-destructive/10 text-destructive",
      };
    if (threshold645 != null && monto >= threshold645)
      return {
        etiqueta: "Rebasa el umbral de identificación (645 UMA)",
        clase: "bg-warning/10 text-warning",
      };
    return null;
  }

  /** Cuántos datos le faltan a un acto ya registrado para entrar al aviso.
   *  Se calcula en la lista para que el rezago se vea sin abrir nada. */
  function bloqueosDelActo(op: (typeof operaciones)[number]): number {
    const cli = clientePorId.get(op.client_id);
    return [
      ...pendientesSujetoObligado(clavesPadron ?? {}),
      ...(cli ? pendientesCompareciente(cli) : []),
      ...pendientesActo({
        fecha: op.fecha,
        instrumento_publico: op.instrumento_publico,
        tipo_acto: (op.contraparte as Record<string, unknown> | null)?.tipo_acto as string,
        datos_acto: op.datos_acto,
      }),
    ].filter((p) => p.gravedad === "bloquea_aviso").length;
  }

  const alta = useMutation({
    mutationFn: async (input: NuevaOperacionInput) => {
      const op = await crearOperacion(input);
      await invocarMotor(op.id); // el motor corre en segundo plano; acuse neutro
      return op;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operaciones"] });
      toast.success("Operación registrada");
      setDialogAbierto(false);
      setForm(FORM_INICIAL);
    },
    onError: (e: Error) => toast.error(`No se pudo registrar: ${e.message}`),
  });

  const filtered = operaciones.filter((o) =>
    (nombrePorCliente.get(o.client_id) ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  function enviar() {
    if (!form.client_id) {
      toast.error(esNotarias ? "Seleccione un compareciente" : "Seleccione un cliente");
      return;
    }
    const monto = Number(form.monto_mxn);
    if (!Number.isFinite(monto) || monto < 0) {
      toast.error(esNotarias ? "Valor del acto inválido" : "Monto inválido");
      return;
    }
    if (esNotarias && !form.tipo_acto) {
      toast.error("Seleccione el tipo de acto");
      return;
    }
    if (!form.fecha) {
      toast.error(esNotarias ? "Capture la fecha del acto" : "Capture la fecha de la operación");
      return;
    }
    // El único rechazo de captura que se permite: un número de instrumento con
    // coma o punto hace que el portal tire el aviso completo el día 17, y
    // corregirlo entonces significa volver al protocolo. Se ataja aquí.
    const instrumento = form.instrumento_publico.trim().toUpperCase();
    if (instrumento && !/^[0-9A-Z_-]{1,20}$/.test(instrumento)) {
      toast.error(
        "El número de instrumento sólo admite letras, dígitos, guion medio y guion bajo",
      );
      return;
    }

    // Las señales (país, tipo de acto) viajan en contraparte (jsonb).
    const contraparte: Record<string, unknown> = {};
    if (form.pais_iso2.trim()) contraparte.pais_iso2 = form.pais_iso2.trim().toUpperCase();
    if (esNotarias && form.tipo_acto) contraparte.tipo_acto = form.tipo_acto;

    alta.mutate({
      client_id: form.client_id,
      // En notarías el acto no es una operación cripto; se usa 'otro' y el detalle
      // viaja en contraparte.tipo_acto.
      tipo: esNotarias ? "otro" : form.tipo,
      monto_mxn: monto,
      activo_virtual: esNotarias ? undefined : form.activo_virtual.trim() || undefined,
      contraparte: Object.keys(contraparte).length ? contraparte : undefined,
      datos_acto: esNotarias ? form.datos_acto : undefined,
      // Mediodía local: la fecha del acto es un día, no un instante, y guardarla
      // a las 00:00 la corre al día anterior en husos al oeste de UTC.
      fecha: new Date(`${form.fecha}T12:00:00`).toISOString(),
      instrumento_publico: instrumento || undefined,
    });
  }

  const guardarExpediente = useMutation({
    mutationFn: () => actualizarDatosActo(actoEnCurso!.id, datosEnCurso),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operaciones"] });
      toast.success("Expediente del acto actualizado");
      setActoEnCurso(null);
    },
    onError: (e: Error) => toast.error(`No se pudo guardar: ${e.message}`),
  });

  /**
   * Cambiar de tipo de acto cambia la rama entera del formato del aviso: lo
   * capturado para la anterior no tiene dónde ir, así que se descarta.
   *
   * Se pregunta antes, y sólo si hay algo que perder. Descartarlo en silencio
   * significa que quien tocó el selector por error se entera cuando ya vació
   * media captura.
   */
  function cambiarTipoActo(tipo_acto: string) {
    setForm((f) => {
      if (f.tipo_acto === tipo_acto) return f;
      const hayCaptura = Object.keys(f.datos_acto).length > 0;
      if (
        hayCaptura &&
        !window.confirm(
          "Cambiar el tipo de acto borra el expediente capturado para el anterior. ¿Continuar?",
        )
      )
        return f;
      return { ...f, tipo_acto, datos_acto: {} };
    });
  }

  // Lo que le faltaría a este acto para entrar al aviso, calculado mientras se
  // captura.
  const comparecienteSeleccionado = clientes.find((c) => c.id === form.client_id);
  const pendientesDelAlta = esNotarias
    ? [
        ...pendientesSujetoObligado(clavesPadron ?? {}),
        ...(comparecienteSeleccionado
          ? pendientesCompareciente(comparecienteSeleccionado)
          : []),
        ...pendientesActo({
          fecha: form.fecha,
          instrumento_publico: form.instrumento_publico,
          tipo_acto: form.tipo_acto,
          datos_acto: form.datos_acto,
        }),
      ]
    : [];
  const catalogosDelActo = form.tipo_acto ? catalogosPendientes(form.tipo_acto) : [];
  const canal = form.tipo_acto ? canalDeActo(form.tipo_acto) : undefined;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{L.operaciones}</h1>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
          onClick={() => setDialogAbierto(true)}
        >
          <Plus className="w-4 h-4" /> {L.operacionNuevaBtn}
        </Button>
      </div>

      <div className="glass-card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={esNotarias ? "Buscar por compareciente…" : "Buscar por cliente…"}
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {esNotarias ? (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              Umbrales de aviso — Fracción XII (fe pública)
            </p>
            <span className="status-badge bg-warning/20 text-warning text-xs">REFERENCIA</span>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {UMBRALES_XII_REFERENCIA.items.map((u) => (
              <div key={u.concepto} className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">{u.concepto}</p>
                <p className="text-lg font-bold text-foreground">{u.umbral}</p>
                <p className="text-[13px] text-muted-foreground mt-1">{u.detalle}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-warning">{UMBRALES_XII_REFERENCIA.nota}</p>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground flex gap-6">
          <span>
            Umbral identificación ({umbral645Uma?.toLocaleString("es-MX") ?? "—"} UMA):{" "}
            <strong>{threshold645 != null ? formatMxn(threshold645) : "—"}</strong>
          </span>
          <span>
            Umbral restricción ({umbral3210Uma?.toLocaleString("es-MX") ?? "—"} UMA):{" "}
            <strong>{threshold3210 != null ? formatMxn(threshold3210) : "—"}</strong>
          </span>
        </div>
      )}

      <div className="glass-card overflow-x-auto">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando operaciones…
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-destructive text-sm">
            No se pudieron cargar las operaciones: {(error as Error)?.message}
          </div>
        ) : (
          <table className="w-full min-w-[64rem]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {[
                  "Fecha",
                  esNotarias ? "Compareciente" : "Cliente",
                  ...(esNotarias ? ["Instrumento"] : []),
                  "Monto",
                  esNotarias ? "Tipo de acto" : "Tipo",
                  esNotarias ? "Valor (UMA)" : "Activo",
                  "Umbral",
                  "Requiere aviso",
                  ...(esNotarias ? ["Expediente"] : []),
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((op) => (
                <tr
                  key={op.id}
                  className={cn(
                    "border-b border-border last:border-0 transition-colors",
                    threshold3210 != null && op.monto_mxn >= threshold3210
                      ? "bg-destructive/5"
                      : threshold645 != null && op.monto_mxn >= threshold645
                        ? "bg-warning/5"
                        : "hover:bg-muted/30",
                  )}
                >
                  <td className="px-4 py-3 text-sm">
                    {new Date(op.fecha).toLocaleDateString("es-MX")}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {nombrePorCliente.get(op.client_id) ?? op.client_id}
                  </td>
                  {esNotarias && (
                    <td className="px-4 py-3 text-sm">
                      {op.instrumento_publico ?? (
                        <span className="text-muted-foreground">sin capturar</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm font-semibold">{formatMxn(op.monto_mxn)}</td>
                  <td className="px-4 py-3 text-sm">
                    {esNotarias ? labelTipoActo((op.contraparte as Record<string, unknown>)?.tipo_acto) : op.tipo}
                  </td>
                  <td className="px-4 py-3">
                    {esNotarias ? (
                      <span className="text-sm text-muted-foreground">
                        {umaMxn != null
                          ? `${Math.round(op.monto_mxn / umaMxn).toLocaleString("es-MX")} UMA`
                          : "—"}
                      </span>
                    ) : (
                      <span className="status-badge bg-muted text-muted-foreground">
                        {op.activo_virtual ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const u = umbralRebasado(op.monto_mxn);
                      return u ? (
                        <span className={cn("status-badge text-xs", u.clase)}>{u.etiqueta}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Por debajo</span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {op.requiere_aviso ? (
                      <span className="status-badge bg-warning/10 text-warning">Sí</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">No</span>
                    )}
                  </td>
                  {esNotarias &&
                    (() => {
                      const faltan = bloqueosDelActo(op);
                      const tipoActo = (op.contraparte as Record<string, unknown> | null)
                        ?.tipo_acto as string | undefined;
                      return (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {faltan === 0 ? (
                              <span className="status-badge bg-success/10 text-success">
                                Completo
                              </span>
                            ) : (
                              <span className="status-badge bg-warning/10 text-warning">
                                Faltan {faltan}
                              </span>
                            )}
                            {puedeCompletar && tipoActo && canalDeActo(tipoActo) === "sppld" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setActoEnCurso(op);
                                  setDatosEnCurso((op.datos_acto ?? {}) as DatosActo);
                                }}
                              >
                                Completar
                              </Button>
                            )}
                          </div>
                        </td>
                      );
                    })()}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={esNotarias ? 9 : 7}
                    className="px-4 py-8 text-center text-muted-foreground text-sm"
                  >
                    {L.operacionesVacio}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={dialogAbierto} onOpenChange={setDialogAbierto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{L.operacionAltaTitulo}</DialogTitle>
            <DialogDescription>{L.operacionAltaDesc}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>{esNotarias ? "Compareciente" : "Cliente"}</Label>
              <Select
                value={form.client_id}
                onValueChange={(v) => setForm({ ...form, client_id: v })}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={esNotarias ? "Seleccione un compareciente…" : "Seleccione un cliente…"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre_razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {esNotarias ? (
                <div className="col-span-2">
                  <Label>Tipo de acto</Label>
                  <Select
                    value={form.tipo_acto}
                    onValueChange={cambiarTipoActo}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione el tipo de acto…" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_ACTO_NOTARIA.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={form.tipo}
                    onValueChange={(v) => setForm({ ...form, tipo: v as TipoOperacion })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>{esNotarias ? "Valor del acto (MXN)" : "Monto (MXN)"}</Label>
                <Input
                  type="number"
                  value={form.monto_mxn}
                  onChange={(e) => setForm({ ...form, monto_mxn: e.target.value })}
                />
              </div>
              <div>
                <Label>{esNotarias ? "Fecha del acto" : "Fecha de la operación"}</Label>
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                />
                {esNotarias && (
                  <p className="text-[13px] text-muted-foreground mt-1">
                    La de la firma del instrumento, no la de captura.
                  </p>
                )}
              </div>
              {esNotarias && (
                <div>
                  <Label>Número de instrumento</Label>
                  <Input
                    placeholder="45321"
                    maxLength={20}
                    value={form.instrumento_publico}
                    onChange={(e) =>
                      setForm({ ...form, instrumento_publico: e.target.value.toUpperCase() })
                    }
                  />
                  <p className="text-[13px] text-muted-foreground mt-1">
                    Sin comas ni puntos. Acepta ceros a la izquierda y guiones.
                  </p>
                </div>
              )}
              {!esNotarias && (
                <div>
                  <Label>Activo virtual</Label>
                  <Input
                    placeholder="BTC, ETH, USDT, XMR…"
                    value={form.activo_virtual}
                    onChange={(e) => setForm({ ...form, activo_virtual: e.target.value })}
                  />
                </div>
              )}
              <div>
                <Label>
                  {esNotarias ? "País del socio / contraparte (ISO2)" : "País contraparte (ISO2)"}
                </Label>
                <Input
                  placeholder="MX, IR…"
                  maxLength={2}
                  value={form.pais_iso2}
                  onChange={(e) => setForm({ ...form, pais_iso2: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
          </div>

          {esNotarias && (
            <div className="space-y-3">
              {canal === "declaranot" && (
                <div className="rounded-lg bg-warning/10 p-3">
                  <p className="text-xs font-semibold text-foreground">
                    Este acto se presenta por DeclaraNOT, no por el SPPLD
                  </p>
                  <p className="text-[13px] text-warning mt-1">{NOTA_CANALES}</p>
                </div>
              )}

              {catalogosDelActo.length > 0 && (
                <div className="rounded-lg bg-warning/10 p-3">
                  <p className="text-[13px] text-warning">
                    DEMO — sin integración real: estos catálogos de la UIF todavía no están
                    cargados en Ikán ({catalogosDelActo.join(", ")}), así que sus claves se
                    capturan a mano. Los carga Kawiil desde la consola de plataforma.
                  </p>
                </div>
              )}

              {form.tipo_acto && canal === "sppld" && (
                <div className="rounded-lg border p-3 space-y-3">
                  <p className="text-sm font-semibold text-foreground">
                    Expediente del acto — {labelTipoActo(form.tipo_acto)}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Lo que pide el formato de fe pública para esta rama. Lo que no se sepa hoy se
                    completa antes del cierre del mes; el acto queda registrado igual.
                  </p>
                  <CapturaActo
                    tipoActo={form.tipo_acto}
                    datos={form.datos_acto}
                    onChange={(datos_acto) => setForm((f) => ({ ...f, datos_acto }))}
                  />
                </div>
              )}

              <PendientesAviso pendientes={pendientesDelAlta} compacto />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAbierto(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
              onClick={enviar}
              disabled={alta.isPending}
            >
              {alta.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completar el expediente de un acto ya registrado. El notario casi
          nunca tiene todo el día de la firma: el RFC de un socio llega
          después, y el aviso se cierra el 17. */}
      <Dialog open={!!actoEnCurso} onOpenChange={(v) => !v && setActoEnCurso(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-3xl">
          <DialogHeader>
            <DialogTitle>Expediente del acto</DialogTitle>
            <DialogDescription>
              {actoEnCurso
                ? `${labelTipoActo(
                    (actoEnCurso.contraparte as Record<string, unknown> | null)?.tipo_acto,
                  )} · instrumento ${actoEnCurso.instrumento_publico ?? "sin capturar"}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {actoEnCurso && (
            <CapturaActo
              tipoActo={
                (actoEnCurso.contraparte as Record<string, unknown> | null)?.tipo_acto as string
              }
              datos={datosEnCurso}
              onChange={setDatosEnCurso}
            />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setActoEnCurso(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
              onClick={() => guardarExpediente.mutate()}
              disabled={guardarExpediente.isPending}
            >
              {guardarExpediente.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
