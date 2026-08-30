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
import { listarClientes, crearCliente, ultimasEvaluaciones } from "@/lib/api/clientes";
import { BadgeRiesgo } from "@/components/riesgo/BadgeRiesgo";
import type { NuevoClienteInput, TipoPersona } from "@/types/domain";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { LABELS } from "@/lib/perfil-actividad";
import { PendientesAviso } from "@/components/aviso/PendientesAviso";
import { SIN_APELLIDO, pendientesCompareciente } from "@/lib/aviso/completitud";
import { SelectCatalogo } from "@/components/aviso/SelectCatalogo";
import { useCatalogo } from "@/hooks/useCatalogo";

const tipoLabel: Record<TipoPersona, string> = { fisica: "Persona Física", moral: "Persona Moral" };

/** Nombre de despliegue de una persona física: el mismo orden que arma la BD.
 *  Se calcula aquí sólo para mostrarlo y para no mandar la columna vacía. */
function nombreCompuesto(f: { nombre: string; apellido_paterno: string; apellido_materno: string }) {
  return [f.nombre, f.apellido_paterno, f.apellido_materno]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" ");
}

const FORM_INICIAL = {
  tipo_persona: "fisica" as TipoPersona,
  // Persona física: el aviso pide las partes por separado (layout fep 3.5.1-3.5.3).
  // `nombre_razon_social` deja de capturarse a mano en física: lo compone la BD.
  nombre: "",
  apellido_paterno: "",
  apellido_materno: "",
  fecha_nacimiento: "",
  // Persona moral
  razon_social: "",
  fecha_constitucion: "",
  rfc: "",
  curp: "",
  pais_nacionalidad_clave: "MX",
  actividad_economica_clave: "",
  nacionalidad: "Mexicana",
  entidad_federativa: "",
  entidad_federativa_clave: "",
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
  const { perfilActividad } = useAuth();
  const L = LABELS[perfilActividad];

  const { data: clientes = [], isLoading, isError, error } = useQuery({
    queryKey: ["clientes"],
    queryFn: listarClientes,
  });

  // La calificación vigente de cada compareciente. Se escribía y no se leía:
  // la lista mostraba a todos igual, evaluados o no.
  const { data: evaluaciones } = useQuery({
    queryKey: ["evaluaciones", clientes.map((c) => c.id).join(",")],
    queryFn: () => ultimasEvaluaciones(clientes.map((c) => c.id)),
    enabled: clientes.length > 0,
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

  const esFisica = form.tipo_persona === "fisica";
  // La etiqueta legible del estado se saca del catálogo, no se escribe a mano:
  // así `entidad_federativa` y `entidad_federativa_clave` no se contradicen.
  const catEntidades = useCatalogo("entidad_federativa");

  /** Lo que ya se capturó, en la forma que espera el evaluador del layout. */
  const comparecienteEnCurso = {
    tipo_persona: form.tipo_persona,
    nombre_razon_social: esFisica ? nombreCompuesto(form) : form.razon_social,
    nombre: form.nombre,
    apellido_paterno: form.apellido_paterno,
    apellido_materno: form.apellido_materno,
    fecha_nacimiento: form.fecha_nacimiento,
    fecha_constitucion: form.fecha_constitucion,
    rfc: form.rfc,
    curp: form.curp,
    pais_nacionalidad_clave: form.pais_nacionalidad_clave,
    actividad_economica_clave: form.actividad_economica_clave,
  };
  const pendientes = pendientesCompareciente(comparecienteEnCurso);

  function enviar() {
    const nombreFinal = esFisica ? nombreCompuesto(form) : form.razon_social.trim();
    if (!nombreFinal) {
      toast.error(
        esFisica ? "Capture al menos nombre y apellido paterno" : "La razón social es obligatoria",
      );
      return;
    }
    const datos_kyc: Record<string, unknown> = {};
    if (form.email) datos_kyc.email = form.email;
    if (form.telefono) datos_kyc.telefono = form.telefono;
    if (form.ocupacion) datos_kyc.ocupacion = form.ocupacion;
    if (form.origen_recursos) datos_kyc.origen_recursos = form.origen_recursos;

    alta.mutate({
      tipo_persona: form.tipo_persona,
      // La BD lo recompone desde las partes en persona física (migration 0019);
      // se manda igual para que el insert nunca vaya con la columna vacía.
      nombre_razon_social: nombreFinal,
      nombre: esFisica ? form.nombre.trim() || undefined : undefined,
      apellido_paterno: esFisica ? form.apellido_paterno.trim() || undefined : undefined,
      apellido_materno: esFisica ? form.apellido_materno.trim() || undefined : undefined,
      fecha_nacimiento: esFisica ? form.fecha_nacimiento || undefined : undefined,
      fecha_constitucion: esFisica ? undefined : form.fecha_constitucion || undefined,
      pais_nacionalidad_clave: form.pais_nacionalidad_clave.trim() || undefined,
      actividad_economica_clave: form.actividad_economica_clave.trim() || undefined,
      rfc: form.rfc.trim() || undefined,
      curp: esFisica ? form.curp.trim() || undefined : undefined,
      nacionalidad: form.nacionalidad.trim() || undefined,
      entidad_federativa:
        catEntidades.descripcionDe(form.entidad_federativa_clave) ??
        (form.entidad_federativa.trim() || undefined),
      entidad_federativa_clave: form.entidad_federativa_clave.trim() || undefined,
      pais_residencia_iso2: form.pais_residencia_iso2.trim() || undefined,
      datos_kyc,
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{L.clientes}</h1>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
          onClick={() => setDialogAbierto(true)}
        >
          <Plus className="w-4 h-4" /> {L.clienteNuevoBtn}
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
                {["Nombre / Razón Social", "Tipo", "RFC", "Riesgo", "Nivel KYC", "Alto de oficio", ""].map((h) => (
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
                  <td className="px-4 py-3">
                    <BadgeRiesgo
                      clasificacion={evaluaciones?.get(client.id)?.clasificacion}
                      score={evaluaciones?.get(client.id)?.score_total}
                    />
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
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    {L.clientesVacio}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={dialogAbierto} onOpenChange={setDialogAbierto}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{L.clienteAltaTitulo}</DialogTitle>
            <DialogDescription>
              Captura del registro. La matriz de riesgo se evalúa como paso posterior desde
              el detalle.
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

            {esFisica ? (
              <>
                <div className="col-span-2">
                  <Label>Nombre(s)</Label>
                  <Input
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Apellido paterno</Label>
                  <Input
                    value={form.apellido_paterno}
                    onChange={(e) => setForm({ ...form, apellido_paterno: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Si no tiene, captura {SIN_APELLIDO}.
                  </p>
                </div>
                <div>
                  <Label>Apellido materno</Label>
                  <Input
                    value={form.apellido_materno}
                    onChange={(e) => setForm({ ...form, apellido_materno: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Si no tiene, captura {SIN_APELLIDO}.
                  </p>
                </div>
                <div>
                  <Label>Fecha de nacimiento</Label>
                  <Input
                    type="date"
                    value={form.fecha_nacimiento}
                    onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
                  />
                </div>
                <div>
                  <Label>CURP</Label>
                  <Input
                    value={form.curp}
                    maxLength={18}
                    onChange={(e) => setForm({ ...form, curp: e.target.value.toUpperCase() })}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="col-span-2">
                  <Label>Razón social</Label>
                  <Input
                    value={form.razon_social}
                    onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Fecha de constitución</Label>
                  <Input
                    type="date"
                    value={form.fecha_constitucion}
                    onChange={(e) => setForm({ ...form, fecha_constitucion: e.target.value })}
                  />
                </div>
              </>
            )}

            <div>
              <Label>RFC</Label>
              <Input
                value={form.rfc}
                maxLength={13}
                onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
              />
            </div>

            <SelectCatalogo
              catalogo="pais"
              etiqueta="País de nacionalidad"
              valor={form.pais_nacionalidad_clave}
              onChange={(v) => setForm({ ...form, pais_nacionalidad_clave: v })}
            />
            <SelectCatalogo
              catalogo={esFisica ? "actividad_economica" : "giro_mercantil"}
              etiqueta={esFisica ? "Actividad económica" : "Giro mercantil"}
              valor={form.actividad_economica_clave}
              onChange={(v) => setForm({ ...form, actividad_economica_clave: v })}
            />

            <div>
              <Label>Nacionalidad</Label>
              <Input
                value={form.nacionalidad}
                onChange={(e) => setForm({ ...form, nacionalidad: e.target.value })}
              />
            </div>
            <SelectCatalogo
              catalogo="entidad_federativa"
              etiqueta="Entidad federativa"
              valor={form.entidad_federativa_clave}
              onChange={(v) => setForm({ ...form, entidad_federativa_clave: v })}
            />
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

          <PendientesAviso pendientes={pendientes} compacto />

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
