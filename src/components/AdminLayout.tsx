import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LogOut, ShieldCheck, Database, SlidersHorizontal, ListOrdered, Link2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

/**
 * Marco de la consola de plataforma. Deliberadamente distinto del de la app de
 * clientes: quien entra aquí debe saber, de un vistazo, que está tocando
 * configuración que afecta a TODAS las organizaciones.
 */
const SECCIONES = [
  { to: "/prospectos", label: "Prospectos", icon: UserPlus },
  { to: "/listas", label: "Listas restrictivas", icon: Database },
  { to: "/parametros", label: "Parámetros regulatorios", icon: SlidersHorizontal },
  { to: "/catalogos", label: "Catálogos del layout", icon: ListOrdered },
  { to: "/bitacora", label: "Bitácora", icon: Link2 },
];

export function AdminLayout() {
  const { profile, session, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        {/* La navegación no colapsaba ni se desplazaba: cuatro secciones con
            nombres largos daban 759 px de documento en una pantalla de 390.
            Ahora la fila entera se desplaza en horizontal y el rótulo cede
            sitio en vez de empujar. */}
        <div className="flex items-center gap-4 px-4 sm:px-6 h-16 min-w-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-accent-foreground" />
            </div>
            <div className="leading-tight hidden sm:block">
              <span className="block text-sm font-bold tracking-tight text-sidebar-accent-foreground">
                Ikán · Plataforma
              </span>
              <span className="block text-[13px] text-sidebar-foreground/60">
                Consola de Kawiil
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-1 ml-2 sm:ml-6 min-w-0 overflow-x-auto">
            {SECCIONES.map((s) => {
              const activo = location.pathname.startsWith(s.to);
              return (
                <NavLink
                  key={s.to}
                  to={s.to}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    activo
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <s.icon className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">{s.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <span className="text-xs text-sidebar-foreground/70 hidden sm:block">
              {profile?.nombre ?? session?.user?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="gap-2 text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50"
            >
              <LogOut className="w-4 h-4" /> Salir
            </Button>
          </div>
        </div>
      </header>

      {/* Recordatorio permanente del alcance: nada de lo que se toca aquí es
          de una sola organización. */}
      <div className="bg-warning/10 border-b border-warning/30 px-6 py-2">
        <p className="text-xs text-warning-foreground">
          Lo que se configure aquí aplica a <strong>todas las organizaciones</strong> de la
          plataforma, sin importar su actividad.
        </p>
      </div>

      <main className="flex-1 p-6 max-w-[1400px] w-full mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
