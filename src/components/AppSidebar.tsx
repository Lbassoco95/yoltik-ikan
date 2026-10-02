import { NavLink, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { contarHallazgosAbiertos } from "@/lib/api/hallazgos";
import { useActiveRole } from "@/hooks/useActiveRole";
import { useAuth } from "@/lib/auth-context";
import { navEntriesForRole } from "@/lib/role-routes";
import { NAV_LABEL_OVERRIDES } from "@/lib/perfil-actividad";
import { MarcaIkan } from "@/components/estela/MarcaIkan";
import { FirmaCelula } from "@/components/estela/FirmaCelula";
import { EndosoYoltik } from "@/components/estela/EndosoYoltik";

interface AppSidebarProps {
  /** Para que el marco decida si va fija o superpuesta en un teléfono. */
  className?: string;
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({
  collapsed,
  onToggle,
  className,
}: AppSidebarProps) {
  const location = useLocation();
  const { activeRole } = useActiveRole();
  const { perfilActividad } = useAuth();
  const navOverrides = NAV_LABEL_OVERRIDES[perfilActividad] ?? {};

  // Si todavía no hay rol activo (cargando), no renderizamos nada en el nav.
  const mainNav = activeRole ? navEntriesForRole(activeRole, "main") : [];
  const secondaryNav = activeRole
    ? navEntriesForRole(activeRole, "secondary")
    : [];

  // Counter de hallazgos abiertos (badge). RLS solo devuelve datos para oc/admin;
  // para operador el conteo es 0 y la entrada "Alertas" ni siquiera se muestra.
  const { data: alertasCount = 0 } = useQuery({
    queryKey: ["hallazgos", "abiertos", "count"],
    queryFn: contarHallazgosAbiertos,
    enabled: Boolean(activeRole && activeRole !== "operador"),
  });

  return (
    <aside
      className={cn(
        // ESTELA: la barra es la estructura de la estela. Vidrio navy casi
        // opaco —el fondo fluido no puede aclarar el texto— y, en escritorio,
        // una placa flotante que se queda a la vista al desplazar la página.
        // Se queda navy en los dos modos: la estructura no se invierte.
        "estela-vidrio-navy relative flex shrink-0 flex-col text-ikan-hielo transition-all duration-300 ease-in-out md:sticky md:top-4 md:h-[calc(100vh-2rem)] md:self-start md:rounded-lg",
        collapsed ? "w-[68px]" : "w-[260px]",
        className,
      )}
    >
      {/* La marca no se decidía: el login decía Ikán, la barra decía Yoltik
          y la pestaña decía Yoltik RegTech. El producto es Ikán; Yoltik es
          el endoso. Ahora el hexágono real de marca, no un icono de relleno. */}
      <div
        className={cn(
          "flex items-center border-b border-white/[0.12] px-5 py-4",
          collapsed && "justify-center px-0",
        )}
      >
        <MarcaIkan tono="claro" soloIcono={collapsed} size={40} sinEndoso />
      </div>

      {/* Main Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3.5">
        {mainNav.map((item) => {
          const isActive =
            location.pathname === item.to ||
            (item.to !== "/" && location.pathname.startsWith(item.to));
          const badge = item.badgeKey === "alertas_nuevas" ? alertasCount : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-ikan-jade-oscuro font-bold text-white shadow-[0_8px_20px_-10px_rgba(0,107,91,0.9)]"
                  : "text-[#D4E3E0] hover:bg-white/[0.08] hover:text-white",
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && (
                <span className="truncate">
                  {navOverrides[item.to] ?? item.label}
                </span>
              )}
              {badge > 0 && (
                // Ámbar con texto navy: lo que le toca atender. El blanco
                // sobre #F0A500 no llega a contraste AA.
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full bg-ikan-ambar text-[11px] font-bold text-ikan-navy",
                    collapsed
                      ? "absolute -right-1 -top-1 h-4 w-4"
                      : "ml-auto h-5 min-w-5 px-1.5",
                  )}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Secondary Nav */}
      {secondaryNav.length > 0 && (
        <div className="space-y-0.5 border-t border-white/[0.12] px-3 py-3.5">
          {secondaryNav.map((item) => {
            const isActive = location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-ikan-jade-oscuro font-bold text-white shadow-[0_8px_20px_-10px_rgba(0,107,91,0.9)]"
                    : "text-[#D4E3E0] hover:bg-white/[0.08] hover:text-white",
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && (
                  <span className="truncate">
                    {navOverrides[item.to] ?? item.label}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      )}

      {/* Quién responde por lo que la aplicación afirma. No se dibuja mientras
          no haya una célula configurada de verdad —ver src/lib/celula.ts—. */}
      {!collapsed && <FirmaCelula variante="barra" />}

      {/* El endoso al pie: Yoltik en blanco, debajo de todo lo demás. */}
      {!collapsed && (
        <div className="border-t border-white/[0.12] px-5 py-3.5">
          <EndosoYoltik tono="claro" alto={14} />
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        onClick={onToggle}
        aria-label={collapsed ? "Desplegar el menú" : "Plegar el menú"}
        className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-foreground" />
        ) : (
          <ChevronLeft className="h-3 w-3 text-foreground" />
        )}
      </button>
    </aside>
  );
}
