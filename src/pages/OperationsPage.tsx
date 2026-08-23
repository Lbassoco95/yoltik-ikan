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
import { listarOperaciones, crearOperacion, invocarMotor } from "@/lib/api/operaciones";
import type { NuevaOperacionInput, TipoOperacion } from "@/types/domain";
import { UMA_MXN, UMBRAL_IDENTIFICACION_UMA, formatMxn, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { LABELS, TIPOS_ACTO_NOTARIA, UMBRALES_XII_REFERENCIA, labelTipoActo } from "@/lib/perfil-actividad";

const threshold645 = UMBRAL_IDENTIFICACION_UMA * UMA_MXN;
const threshold3210 = 3210 * UMA_MXN;

const TIPOS: { value: TipoOperacion; label: string }[] = [
  { value: "compra_fiat_cripto", label: "Compra fiat → cripto" },
  { value: "venta_cripto_fiat", label: "Venta cripto → fiat" },
  { value: "retiro_cripto", label: "Retiro cripto" },
  { value: "deposito_fiat", label: "Depósito fiat" },
  { value: "otro", label: "Otro" },
];

const FORM_INICIAL = {
  client_id: "",
  tipo: "compra_fiat_cripto" as TipoOperacion,
  monto_mxn: "",
  activo_virtual: "",
  pais_iso2: "",
  tipo_acto: "",
};

export default function OperationsPage() {
  const [search, setSearch] = useState("");
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const queryClient = useQueryClient();
  const { perfilActividad } = useAuth();
  const L = LABELS[perfilActividad];
  const esNotarias = perfilActividad === "notarias";

  const { data: operaciones = [], isLoading, isError, error } = useQuery({
    queryKey: ["operaciones"],
    queryFn: listarOperaciones,
  });
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: listarClientes });

  const nombrePorCliente = new Map(clientes.map((c) => [c.id, c.nombre_razon_social]));

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
      toast.error(esNotarias ? "Selecciona un compareciente" : "Selecciona un cliente");
      return;
    }
    const monto = Number(form.monto_mxn);
    if (!Number.isFinite(monto) || monto < 0) {
      toast.error("Monto inválido");
      return;
    }
    if (esNotarias && !form.tipo_acto) {
      toast.error("Selecciona el tipo de acto");
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
    });
  }

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
            <span className="status-badge bg-warning/20 text-warning text-[10px]">REFERENCIA</span>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {UMBRALES_XII_REFERENCIA.items.map((u) => (
              <div key={u.concepto} className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">{u.concepto}</p>
                <p className="text-lg font-bold text-foreground">{u.umbral}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{u.detalle}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-warning">{UMBRALES_XII_REFERENCIA.nota}</p>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground flex gap-6">
          <span>
            Umbral identificación (645 UMA): <strong>{formatMxn(threshold645)}</strong>
          </span>
          <span>
            Umbral restricción (3,210 UMA): <strong>{formatMxn(threshold3210)}</strong>
          </span>
        </div>
      )}

      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando operaciones…
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-destructive text-sm">
            No se pudieron cargar las operaciones: {(error as Error)?.message}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {[
                  "Fecha",
                  esNotarias ? "Compareciente" : "Cliente",
                  "Monto",
                  esNotarias ? "Tipo de acto" : "Tipo",
                  esNotarias ? "Valor (UMA)" : "Activo",
                  "Requiere aviso",
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
                    op.monto_mxn >= threshold3210
                      ? "bg-destructive/5"
                      : op.monto_mxn >= threshold645
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
                  <td className="px-4 py-3 text-sm font-semibold">{formatMxn(op.monto_mxn)}</td>
                  <td className="px-4 py-3 text-sm">
                    {esNotarias ? labelTipoActo((op.contraparte as Record<string, unknown>)?.tipo_acto) : op.tipo}
                  </td>
                  <td className="px-4 py-3">
                    {esNotarias ? (
                      <span className="text-sm text-muted-foreground">
                        {Math.round(op.monto_mxn / UMA_MXN).toLocaleString("es-MX")} UMA
                      </span>
                    ) : (
                      <span className="status-badge bg-vulnerable/10 text-vulnerable">
                        {op.activo_virtual ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {op.requiere_aviso ? (
                      <span className="status-badge bg-warning/10 text-warning">Sí</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">No</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    {L.operacionesVacio}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={dialogAbierto} onOpenChange={setDialogAbierto}>
        <DialogContent>
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
                    placeholder={esNotarias ? "Selecciona un compareciente…" : "Selecciona un cliente…"}
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

            <div className="grid grid-cols-2 gap-4">
              {esNotarias ? (
                <div className="col-span-2">
                  <Label>Tipo de acto</Label>
                  <Select
                    value={form.tipo_acto}
                    onValueChange={(v) => setForm({ ...form, tipo_acto: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona el tipo de acto…" />
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
    </div>
  );
}
