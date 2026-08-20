import { Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useActiveRole } from "@/hooks/useActiveRole";
import { RoleSwitcher } from "@/components/layout/RoleSwitcher";
import { SearchInput } from "@/components/shared/SearchInput";

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

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <SearchInput
          placeholder="Buscar clientes, operaciones…"
          className="w-80 bg-muted/50 border-0 focus-visible:ring-1"
        />
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-muted-foreground">
          {profile?.organization_name ?? '—'}
        </span>

        {activeRole && (
          <RoleSwitcher roles={roles} activeRole={activeRole} onChange={setActiveRole} />
        )}

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {/* TODO[Sprint D-3]: contador real desde hallazgos.estado='abierto'. */}
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            3
          </span>
        </Button>

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
