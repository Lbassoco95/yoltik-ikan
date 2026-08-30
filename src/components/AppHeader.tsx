import { Bell, Search, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { useActiveRole } from "@/hooks/useActiveRole";
import { RoleSwitcher } from "@/components/layout/RoleSwitcher";
import { contarHallazgosAbiertos } from "@/lib/api/hallazgos";

interface AppHeaderProps {
  onToggleSidebar: () => void;
}

function getInitials(nombre: string | undefined): string {
  if (!nombre) return '—';
  const parts = nombre.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function AppHeader({ onToggleSidebar: _onToggleSidebar }: AppHeaderProps) {
  const { profile, roles, signOut } = useAuth();
  const { activeRole, setActiveRole } = useActiveRole();
  const navegar = useNavigate();

  // Los hallazgos son del OC y del Admin: el Operador no los ve, y pedirlos
  // con su sesión sólo produciría un cero con una consulta de más.
  const veHallazgos = activeRole === "oc" || activeRole === "admin";
  const { data: abiertos = 0 } = useQuery({
    queryKey: ["hallazgos-abiertos", activeRole],
    queryFn: contarHallazgosAbiertos,
    enabled: veHallazgos,
    // Llegan del motor, que corre en segundo plano.
    refetchInterval: 60_000,
  });

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar clientes, operaciones…"
            className="pl-10 w-80 bg-muted/50 border-0 focus-visible:ring-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-muted-foreground">
          {profile?.organization_name ?? '—'}
        </span>

        {activeRole && (
          <RoleSwitcher roles={roles} activeRole={activeRole} onChange={setActiveRole} />
        )}

        {/* El contador salía en 3 fijo. Un número inventado en un producto de
            cumplimiento es peor que ninguno: quien lo ve cuenta con él. Ahora
            son los hallazgos abiertos de verdad, y sin ninguno no hay marca. */}
        {veHallazgos && (
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={
              abiertos === 0
                ? "Sin hallazgos abiertos"
                : `${abiertos} hallazgo${abiertos === 1 ? "" : "s"} abierto${abiertos === 1 ? "" : "s"}`
            }
            onClick={() => navegar("/alertas")}
          >
            <Bell className="w-5 h-5" />
            {abiertos > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center">
                {abiertos > 99 ? "99+" : abiertos}
              </span>
            )}
          </Button>
        )}

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            {getInitials(profile?.nombre)}
          </div>
          <div className="hidden md:flex flex-col">
            <span className="text-sm font-semibold text-foreground leading-tight">
              {profile?.nombre ?? '—'}
            </span>
            <span className="text-xs text-muted-foreground leading-tight">
              {profile?.email ?? ''}
            </span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => void signOut()}
          aria-label="Cerrar sesión"
        >
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}
