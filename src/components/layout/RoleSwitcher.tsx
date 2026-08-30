import { ChevronDown } from 'lucide-react';
import type { RolUsuario } from '@/types/domain';

const ROLE_LABEL: Record<RolUsuario, string> = {
  operador: 'Operador',
  oc: 'Oficial de Cumplimiento',
  admin: 'Administrador',
};

interface Props {
  roles: RolUsuario[];
  activeRole: RolUsuario;
  onChange: (rol: RolUsuario) => void;
}

export function RoleSwitcher({ roles, activeRole, onChange }: Props) {
  if (roles.length <= 1) {
    return (
      <span className="text-sm text-muted-foreground truncate">
        <span className="hidden lg:inline">Rol: </span>
        <strong className="text-foreground">{ROLE_LABEL[activeRole]}</strong>
      </span>
    );
  }
  // «Operando como» sólo cuando hay sitio: con el rótulo y «Oficial de
  // Cumplimiento» dentro, este control medía por sí solo más de la mitad de
  // una pantalla de teléfono y empujaba el encabezado —hasta el punto de
  // taparle el clic al botón de menú—. El select solo ya dice el rol.
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
      <span className="hidden lg:inline shrink-0">Operando como</span>
      <span className="relative min-w-0">
        <select
          value={activeRole}
          onChange={(e) => onChange(e.target.value as RolUsuario)}
          className="w-full max-w-[10rem] sm:max-w-none appearance-none truncate border border-border rounded-md pl-3 pr-8 py-1 bg-card text-foreground font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1.5 h-4 w-4 text-muted-foreground pointer-events-none" />
      </span>
    </label>
  );
}
