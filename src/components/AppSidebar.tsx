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
        // ESTELA: la barra es el canto de la estela. Degradado navy en
        // diagonal —no un plano— y una columna de greca a 0.06 de opacidad al
        // borde derecho: se intuye al mirarla de reojo y no compite con nada.
        // Se queda navy en los dos modos: la estructura no se invierte.
        "estela-canto-barra relative flex shrink-0 flex-col bg-ikan-navy text-ikan-hielo transition-all duration-300 ease-in-out",
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
        <MarcaIkan
          tono="claro"
          soloIcono={collapsed}
          size={collapsed ? 32 : 40}
        />
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
                "group relative flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
                isActive
                  ? "bg-white/[0.09] text-white"
                  : "text-ikan-hielo/70 hover:bg-white/[0.05] hover:text-white",
              )}
            >
              {/* El Mint es realce, nunca relleno: aquí es el único sitio de
                  la barra donde aparece, y sólo como la marca de 3 px de la
                  sección abierta. */}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-sm bg-ikan-mint"
                />
              )}
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
                  "relative flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-white/[0.09] text-white"
                    : "text-ikan-hielo/70 hover:bg-white/[0.05] hover:text-white",
                )}
              >
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-sm bg-ikan-mint"
                  />
                )}
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
