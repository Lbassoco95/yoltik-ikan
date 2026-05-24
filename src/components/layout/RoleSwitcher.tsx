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
      <span className="text-sm text-muted-foreground">
        Rol: <strong className="text-foreground">{ROLE_LABEL[activeRole]}</strong>
      </span>
    );
  }
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>Operando como</span>
      <span className="relative">
        <select
          value={activeRole}
          onChange={(e) => onChange(e.target.value as RolUsuario)}
          className="appearance-none border border-border rounded-md pl-3 pr-8 py-1 bg-card text-foreground font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
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
