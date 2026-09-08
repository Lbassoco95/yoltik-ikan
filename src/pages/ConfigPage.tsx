import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { getClavesPadron, getOrganizacion, listarUsuariosOrganizacion } from "@/lib/api/organizacion";
import { ACTIVIDADES_VULNERABLES } from "@/lib/actividades-vulnerables";
import { cn } from "@/lib/utils";

/**
 * Configuración del sujeto obligado.
 *
 * Antes mostraba datos inventados de otra empresa —razón social, RFC,
 * representante y registro SPPLD—, cuatro usuarios ficticios, y un catálogo de
 * actividades vulnerables con las FRACCIONES MAL NUMERADAS: decía que la XII
 * era vehículos y la XIII fe pública. En una plataforma de cumplimiento eso no
 * es una errata, es una afirmación falsa sobre la ley.
 *
 * Ahora todo sale de la base. Es de sólo lectura: cambiar la razón social o el
 * registro de un sujeto obligado no es una preferencia de la aplicación, y
 * habilitar una fracción tiene consecuencias regulatorias. Eso se administra
 * desde la consola de Kawiil.
 */
export default function ConfigPage() {
  const org = useQuery({ queryKey: ["organizacion"], queryFn: getOrganizacion });
  const usuarios = useQuery({ queryKey: ["organizacion", "usuarios"], queryFn: listarUsuariosOrganizacion });
  // Claves del padrón: sin ellas el aviso mensual no se puede generar, así que
  // aquí se ven aunque no se editen. Se cargan desde la consola de Kawiil.
  const claves = useQuery({ queryKey: ["claves-padron"], queryFn: getClavesPadron });

  const sectores = org.data?.sectores ?? [];

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="estela-titulo text-2xl font-extrabold tracking-tight text-foreground">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Los datos de su organización y quién tiene acceso. Para cambiarlos, contacte a Kawiil.
        </p>
      </div>

      {org.isLoading ? (
        <div className="estela-placa p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
        </div>
      ) : org.isError ? (
        <p className="estela-placa p-6 text-sm text-destructive">{(org.error as Error).message}</p>
      ) : !org.data ? (
        <p className="estela-placa p-6 text-sm text-warning-ink">
          No se encontró la organización de su perfil.
        </p>
      ) : (
        <>
          {/* Datos del sujeto obligado */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-4">Datos del sujeto obligado</h2>
            <div className="estela-placa p-6 grid gap-6 sm:grid-cols-2">
              {[
                { label: "Razón social", value: org.data.razon_social },
                { label: "RFC", value: org.data.rfc, mono: true },
                { label: "Representante legal", value: org.data.representante_legal },
                { label: "Oficio de alta ante el SAT", value: org.data.oficio_alta_sat, mono: true },
                {
                  label: "Fecha de alta",
                  value: org.data.fecha_alta_sat
                    ? new Date(org.data.fecha_alta_sat + "T12:00:00").toLocaleDateString("es-MX")
                    : null,
                },
                { label: "Domicilio fiscal", value: org.data.domicilio_fiscal, ancho: true },
                {
                  label: "Clave del sujeto obligado (padrón SAT)",
                  value: claves.data?.clave_sujeto_obligado,
                  mono: true,
                },
                {
                  label: "Clave de actividad vulnerable",
                  value: claves.data?.clave_actividad,
                  mono: true,
                },
                {
                  label: "Clave de entidad colegiada",
                  value: claves.data?.clave_entidad_colegiada,
                  mono: true,
                },
              ].map((f) => (
                <div key={f.label} className={cn(f.ancho && "sm:col-span-2")}>
                  <p className="estela-antetitulo text-muted-foreground">
                    {f.label}
                  </p>
                  <p className={cn("mt-1 text-sm", f.mono && "font-mono", !f.value && "text-muted-foreground italic")}>
                    {f.value ?? "Sin registrar"}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Actividades vulnerables */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-1">Actividades vulnerables</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Artículo 17 de la LFPIORPI. Las marcadas son las que opera su organización.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {ACTIVIDADES_VULNERABLES.map((a) => {
                const habilitada = a.sector != null && sectores.includes(a.sector);
                return (
                  <div
                    key={a.fraccion}
                    className={cn(
                      "estela-placa p-4 border-l-4",
                      habilitada ? "border-l-accent" : "border-l-transparent opacity-60",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn("text-sm font-medium", habilitada ? "text-foreground" : "text-muted-foreground")}>
                        <span className="font-mono text-xs mr-1.5">{a.fraccion}</span>
                        {a.nombre}
                      </p>
                      {habilitada && (
                        <span className="status-badge bg-accent/10 text-accent text-xs shrink-0">
                          Activa
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{a.descripcion}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* Usuarios */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">Usuarios con acceso</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Altas y bajas de usuarios se gestionan con Kawiil.
        </p>
        <div className="estela-placa overflow-hidden">
          {usuarios.isLoading ? (
            <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          ) : usuarios.isError ? (
            <p className="p-6 text-sm text-destructive">{(usuarios.error as Error).message}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {["Nombre", "Correo", "Roles", "Estado"].map((h) => (
                      <th key={h} className="estela-antetitulo text-muted-foreground px-4 py-3 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(usuarios.data ?? []).map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{u.nombre}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0 ? (
                            <span className="text-xs text-muted-foreground italic">Sin rol asignado</span>
                          ) : (
                            u.roles.map((r) => (
                              <span key={r} className="status-badge bg-muted text-muted-foreground text-xs">
                                {r === "oc" ? "Oficial de Cumplimiento" : r === "admin" ? "Administrador" : "Operador"}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "status-badge",
                          u.activo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
                        )}>
                          {u.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(usuarios.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Sin usuarios registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">
          <strong className="text-foreground">Pantalla de sólo lectura.</strong> Cambiar la razón
          social, el registro ante el SAT o las fracciones que opera un sujeto obligado tiene
          consecuencias regulatorias, así que no se edita desde aquí.
        </span>
      </div>
    </div>
  );
}
