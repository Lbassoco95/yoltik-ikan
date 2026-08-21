import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Filter, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { listarClientes, crearCliente } from "@/lib/api/clientes";
import type { NuevoClienteInput, TipoPersona } from "@/types/domain";
import { cn } from "@/lib/utils";

const tipoLabel: Record<TipoPersona, string> = { fisica: "Persona Física", moral: "Persona Moral" };

const FORM_INICIAL = {
  tipo_persona: "fisica" as TipoPersona,
  nombre_razon_social: "",
  rfc: "",
  curp: "",
  nacionalidad: "Mexicana",
  entidad_federativa: "",
  pais_residencia_iso2: "MX",
  email: "",
  telefono: "",
  ocupacion: "",
  origen_recursos: "",
};

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: clientes = [], isLoading, isError, error } = useQuery({
    queryKey: ["clientes"],
    queryFn: listarClientes,
  });

  const alta = useMutation({
    mutationFn: (input: NuevoClienteInput) => crearCliente(input),
    onSuccess: (cliente) => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      toast.success("Cliente registrado");
      setDialogAbierto(false);
      setForm(FORM_INICIAL);
      navigate(`/clientes/${cliente.id}`);
    },
    onError: (e: Error) => toast.error(`No se pudo registrar: ${e.message}`),
  });

  const filtered = clientes.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      c.nombre_razon_social.toLowerCase().includes(q) || (c.rfc ?? "").toLowerCase().includes(q);
    const matchType = typeFilter === "all" || c.tipo_persona === typeFilter;
    return matchSearch && matchType;
  });

  function enviar() {
    if (!form.nombre_razon_social.trim()) {
      toast.error("El nombre o razón social es obligatorio");
      return;
    }
    const datos_kyc: Record<string, unknown> = {};
    if (form.email) datos_kyc.email = form.email;
    if (form.telefono) datos_kyc.telefono = form.telefono;
    if (form.ocupacion) datos_kyc.ocupacion = form.ocupacion;
    if (form.origen_recursos) datos_kyc.origen_recursos = form.origen_recursos;

    alta.mutate({
      tipo_persona: form.tipo_persona,
      nombre_razon_social: form.nombre_razon_social.trim(),
      rfc: form.rfc.trim() || undefined,
      curp: form.tipo_persona === "fisica" ? form.curp.trim() || undefined : undefined,
      nacionalidad: form.nacionalidad.trim() || undefined,
      entidad_federativa: form.entidad_federativa.trim() || undefined,
      pais_residencia_iso2: form.pais_residencia_iso2.trim() || undefined,
      datos_kyc,
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
          onClick={() => setDialogAbierto(true)}
        >
          <Plus className="w-4 h-4" /> Nuevo Cliente
        </Button>
      </div>

      <div className="glass-card p-4 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o RFC…"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="fisica">Persona Física</SelectItem>
            <SelectItem value="moral">Persona Moral</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando clientes…
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-destructive text-sm">
            No se pudieron cargar los clientes: {(error as Error)?.message}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Nombre / Razón Social", "Tipo", "RFC", "Nivel KYC", "Alto de oficio", ""].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr
                  key={client.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/clientes/${client.id}`)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {client.nombre_razon_social}
                  </td>
                  <td className="px-4 py-3">
                    <span className="status-badge bg-muted text-muted-foreground">
                      {tipoLabel[client.tipo_persona]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                    {client.rfc ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">{client.nivel_kyc}</td>
                  <td className="px-4 py-3">
                    {client.alto_de_oficio ? (
                      <span className="status-badge bg-destructive/10 text-destructive">Sí</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-accent font-medium hover:underline">Ver</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    Sin clientes registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={dialogAbierto} onOpenChange={setDialogAbierto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Alta de cliente</DialogTitle>
            <DialogDescription>
              Captura del cliente final. La matriz de riesgo se evalúa como paso posterior desde
              el detalle del cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label>Tipo de persona</Label>
              <Select
                value={form.tipo_persona}
                onValueChange={(v) => setForm({ ...form, tipo_persona: v as TipoPersona })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fisica">Persona Física</SelectItem>
                  <SelectItem value="moral">Persona Moral</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label>{form.tipo_persona === "fisica" ? "Nombre completo" : "Razón social"}</Label>
              <Input
                value={form.nombre_razon_social}
                onChange={(e) => setForm({ ...form, nombre_razon_social: e.target.value })}
              />
            </div>

            <div>
              <Label>RFC</Label>
              <Input value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value })} />
            </div>
            {form.tipo_persona === "fisica" && (
              <div>
                <Label>CURP</Label>
                <Input
                  value={form.curp}
                  onChange={(e) => setForm({ ...form, curp: e.target.value })}
                />
              </div>
            )}

            <div>
              <Label>Nacionalidad</Label>
              <Input
                value={form.nacionalidad}
                onChange={(e) => setForm({ ...form, nacionalidad: e.target.value })}
              />
            </div>
            <div>
              <Label>Entidad federativa</Label>
              <Input
                value={form.entidad_federativa}
                onChange={(e) => setForm({ ...form, entidad_federativa: e.target.value })}
              />
            </div>
            <div>
              <Label>País de residencia (ISO2)</Label>
              <Input
                value={form.pais_residencia_iso2}
                maxLength={2}
                onChange={(e) =>
                  setForm({ ...form, pais_residencia_iso2: e.target.value.toUpperCase() })
                }
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </div>
            <div>
              <Label>Ocupación / giro</Label>
              <Input
                value={form.ocupacion}
                onChange={(e) => setForm({ ...form, ocupacion: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Origen de recursos</Label>
              <Textarea
                rows={2}
                value={form.origen_recursos}
                onChange={(e) => setForm({ ...form, origen_recursos: e.target.value })}
              />
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
              Registrar cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
