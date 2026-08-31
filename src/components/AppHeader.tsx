import { useState } from "react";
import { Bell, Search, LogOut, Menu } from "lucide-react";
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

export function AppHeader({ onToggleSidebar }: AppHeaderProps) {
  const { profile, roles, signOut } = useAuth();
  const { activeRole, setActiveRole } = useActiveRole();
  const navegar = useNavigate();
  const [busqueda, setBusqueda] = useState("");

  /**
   * Llevaba desde el andamiaje sin conectar: un `<Input>` sin `value` ni
   * `onChange` que prometía «Buscar clientes, operaciones…» y no buscaba nada.
   *
   * En un producto de cumplimiento eso no es un botón muerto cualquiera. Quien
   * teclea el nombre de un cliente, no ve nada y sigue adelante, se lleva la
   * idea de que ese cliente no está dado de alta. Un buscador que calla se lee
   * como una respuesta.
   *
   * No duplica lógica: Clientes y Operaciones ya saben filtrar, así que esto
   * los lleva allí con el término puesto. Un buscador propio aquí sería una
   * segunda implementación que se desincroniza con la primera.
   */
  const buscar = () => {
    const q = busqueda.trim();
    if (!q) return;
    const destino = activeRole === "operador" ? "/operaciones" : "/clientes";
    navegar(`${destino}?q=${encodeURIComponent(q)}`);
  };

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
    <header className="h-16 border-b border-border bg-card flex items-center justify-between gap-2 px-3 sm:px-6 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {/* Este botón existía en las props desde el andamiaje y nadie lo había
            conectado. Sin él, en un teléfono no había manera de recuperar los
            260 px que se comía la barra lateral. */}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Abrir o cerrar el menú"
          onClick={onToggleSidebar}
        >
          <Menu className="w-5 h-5" />
        </Button>

        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar clientes, operaciones…"
            aria-label="Buscar clientes u operaciones"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            className="pl-10 w-64 lg:w-80 bg-muted/50 border-0 focus-visible:ring-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <span className="hidden md:inline text-sm font-medium text-muted-foreground truncate max-w-[14rem]">
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
            className="relative shrink-0"
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

        <div className="flex items-center gap-2 sm:px-3 py-1.5 rounded-lg shrink-0">
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
          className="shrink-0"
          onClick={() => void signOut()}
          aria-label="Cerrar sesión"
        >
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}
