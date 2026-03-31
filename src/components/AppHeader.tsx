import { Bell, Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AppHeaderProps {
  onToggleSidebar: () => void;
}

export function AppHeader({ onToggleSidebar: _onToggleSidebar }: AppHeaderProps) {
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
        <span className="text-sm font-medium text-muted-foreground">Crypto Exchange MX S.A.</span>

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            3
          </span>
        </Button>

        <button className="flex items-center gap-2 hover:bg-muted px-3 py-1.5 rounded-lg transition-colors">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            PV
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}
