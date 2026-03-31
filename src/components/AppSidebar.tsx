import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, ArrowLeftRight, Bell, FileText,
  Shield, SlidersHorizontal, ScanLine, ClipboardCheck, Settings,
  ChevronLeft, ChevronRight, Heart
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mockAlerts } from "@/data/mockData";

const mainNav = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Clientes", icon: Users, path: "/clientes" },
  { label: "Operaciones", icon: ArrowLeftRight, path: "/operaciones" },
  { label: "Alertas", icon: Bell, path: "/alertas", badge: mockAlerts.filter(a => a.status === "Nueva").length },
  { label: "Reportes", icon: FileText, path: "/reportes" },
  { label: "Listas", icon: Shield, path: "/listas" },
  { label: "Motor de Reglas", icon: SlidersHorizontal, path: "/reglas" },
  { label: "ID No Presencial", icon: ScanLine, path: "/verificacion" },
];

const secondaryNav = [
  { label: "Auditoría", icon: ClipboardCheck, path: "/auditoria" },
  { label: "Configuración", icon: Settings, path: "/configuracion" },
];

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const location = useLocation();

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
          const isActive = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
          return (
            <NavLink
              key={item.path}
              to={item.path}
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
              {!collapsed && <span>{item.label}</span>}
              {item.badge && item.badge > 0 && (
                <span className={cn(
                  "ml-auto bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center",
                  collapsed ? "absolute -top-1 -right-1 w-4 h-4 text-[10px]" : "w-5 h-5"
                )}>
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Secondary Nav */}
      <div className="border-t border-sidebar-border py-4 px-3 space-y-1">
        {secondaryNav.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}

        {/* User */}
        {!collapsed && (
          <div className="mt-4 px-3 py-3 rounded-lg bg-sidebar-accent/30">
            <p className="text-sm font-semibold text-sidebar-accent-foreground">Lic. Patricia Vega</p>
            <p className="text-xs text-sidebar-foreground/60">Oficial de Cumplimiento</p>
          </div>
        )}
      </div>

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
