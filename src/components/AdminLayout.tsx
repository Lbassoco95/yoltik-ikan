import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LogOut,
  Database,
  SlidersHorizontal,
  ListOrdered,
  Link2,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconoIkan } from "@/components/estela/MarcaIkan";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FondoFluido } from "@/components/estela/FondoFluido";

/**
 * Marco de la consola de plataforma. Deliberadamente distinto del de la app de
 * clientes: quien entra aquí debe saber, de un vistazo, que está tocando
 * configuración que afecta a TODAS las organizaciones.
 */
const SECCIONES = [
  { to: "/prospectos", label: "Prospectos", icon: UserPlus },
  { to: "/listas", label: "Listas restrictivas", icon: Database },
  {
    to: "/parametros",
    label: "Parámetros regulatorios",
    icon: SlidersHorizontal,
  },
  { to: "/catalogos", label: "Catálogos del layout", icon: ListOrdered },
  { to: "/usuarios", label: "Usuarios y 2FA", icon: Users },
  { to: "/bitacora", label: "Bitácora", icon: Link2 },
];

export function AdminLayout() {
  const { profile, session, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* La consola lleva el mismo fondo fluido que la aplicación de clientes:
          es el mismo producto. Lo que la distingue es que aquí el navy ocupa
          la cabecera entera en vez de una barra lateral —quien entra tiene que
          notar en el primer vistazo que está tocando configuración que afecta
          a todas las organizaciones—. */}
      <FondoFluido className="fixed fondo-fluido--quieto" />
      <div className="relative z-10 flex flex-1 flex-col md:gap-4 md:p-4">
        <header className="estela-vidrio-navy text-sidebar-foreground md:rounded-lg">
          {/* La navegación no colapsaba ni se desplazaba: cuatro secciones con
            nombres largos daban 759 px de documento en una pantalla de 390.
            Ahora la fila entera se desplaza en horizontal y el rótulo cede
            sitio en vez de empujar. */}
          <div className="flex items-center gap-4 px-4 sm:px-6 h-16 min-w-0">
            <div className="flex items-center gap-3">
              {/* Sobre navy el icono va en chip blanco: sin él la hoja del
                escudo no se lee. */}
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white p-[5px]">
                <IconoIkan size={30} />
              </span>
              <div className="leading-tight hidden shrink-0 whitespace-nowrap sm:block">
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
                      "flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
                      activo
                        ? "bg-ikan-jade-oscuro text-white"
                        : "text-[#D4E3E0] hover:bg-white/[0.08] hover:text-white",
                    )}
                  >
                    <s.icon className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">{s.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            <div className="ml-auto flex items-center gap-4">
              <span className="text-xs text-sidebar-foreground/70 hidden whitespace-nowrap sm:block">
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
        <div className="estela-vidrio rounded-none border-x-0 border-t-0 border-warning/40 bg-gradient-to-r from-warning/20 to-warning/10 px-6 py-2 md:rounded-full md:border">
          <p className="text-xs text-warning-foreground dark:text-foreground">
            Lo que se configure aquí aplica a{" "}
            <strong>todas las organizaciones</strong> de la plataforma, sin
            importar su actividad.
          </p>
        </div>

        <main className="estela-vidrio mx-auto w-full max-w-[1400px] flex-1 rounded-none border-x-0 p-6 md:rounded-lg md:border-x">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
