import { NavLink, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { contarHallazgosAbiertos } from "@/lib/api/hallazgos";
import { useActiveRole } from "@/hooks/useActiveRole";
import { useAuth } from "@/lib/auth-context";
import { navEntriesForRole } from "@/lib/role-routes";
import { NAV_LABEL_OVERRIDES } from "@/lib/perfil-actividad";

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const location = useLocation();
  const { activeRole } = useActiveRole();
  const { perfilActividad } = useAuth();
  const navOverrides = NAV_LABEL_OVERRIDES[perfilActividad] ?? {};

  // Si todavía no hay rol activo (cargando), no renderizamos nada en el nav.
  const mainNav = activeRole ? navEntriesForRole(activeRole, 'main') : [];
  const secondaryNav = activeRole ? navEntriesForRole(activeRole, 'secondary') : [];

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
        "flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out shrink-0 relative",
        collapsed ? "w-[68px]" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center gap-3 px-5 h-16 border-b border-sidebar-border", collapsed && "justify-center px-0")}>
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
          <Heart className="w-4 h-4 text-accent-foreground" />
        </div>
        {!collapsed && <span className="text-lg font-bold tracking-tight text-sidebar-accent-foreground">Yoltik</span>}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {mainNav.map((item) => {
          const isActive = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
          const badge = item.badgeKey === 'alertas_nuevas' ? alertasCount : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative group",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent rounded-r-full" />
              )}
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{navOverrides[item.to] ?? item.label}</span>}
              {badge > 0 && (
                <span className={cn(
                  "ml-auto bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center",
                  collapsed ? "absolute -top-1 -right-1 w-4 h-4 text-xs" : "w-5 h-5"
                )}>
                  {badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Secondary Nav */}
      {secondaryNav.length > 0 && (
        <div className="border-t border-sidebar-border py-4 px-3 space-y-1">
          {secondaryNav.map((item) => {
            const isActive = location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span>{navOverrides[item.to] ?? item.label}</span>}
              </NavLink>
            );
          })}
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center shadow-sm hover:bg-muted transition-colors z-10"
      >
        {collapsed ? <ChevronRight className="w-3 h-3 text-foreground" /> : <ChevronLeft className="w-3 h-3 text-foreground" />}
      </button>
    </aside>
  );
}
