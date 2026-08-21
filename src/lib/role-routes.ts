import type { RolUsuario } from '@/types/domain';
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  Bell,
  FileText,
  Shield,
  SlidersHorizontal,
  ClipboardCheck,
  Settings,
  type LucideIcon,
} from 'lucide-react';

/**
 * Mapa centralizado de qué rol ve qué entrada del sidebar.
 * Lo consume `AppSidebar`. Las rutas siguen el naming del scaffold Lovable
 * (NO se renombran a las del brief original para no romper navegación).
 *
 * Mapeo de roles según docs/ROLES.md.
 */
export interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: RolUsuario[];
  section: 'main' | 'secondary';
  /** Clave para counters dinámicos en Sprint D-3 (alertas pendientes, etc.). */
  badgeKey?: string;
}

export const NAV_ENTRIES: NavEntry[] = [
  { to: '/',             label: 'Dashboard',       icon: LayoutDashboard,    roles: ['operador', 'oc', 'admin'], section: 'main' },
  { to: '/clientes',     label: 'Clientes',        icon: Users,              roles: ['operador', 'oc', 'admin'], section: 'main' },
  { to: '/operaciones',  label: 'Operaciones',     icon: ArrowLeftRight,     roles: ['operador', 'oc', 'admin'], section: 'main' },
  { to: '/alertas',      label: 'Alertas',         icon: Bell,               roles: ['oc', 'admin'],             section: 'main', badgeKey: 'alertas_nuevas' },
  { to: '/reportes',     label: 'Reportes',        icon: FileText,           roles: ['oc', 'admin'],             section: 'main' },
  { to: '/listas',       label: 'Listas',          icon: Shield,             roles: ['admin'],                   section: 'main' },
  { to: '/reglas',       label: 'Motor de Reglas', icon: SlidersHorizontal,  roles: ['admin'],                   section: 'main' },
  // "ID No Presencial" (/verificacion) es maqueta del scaffold Lovable, sin
  // integración (Moffin/KYC es mock hasta post-demo). Se oculta del menú para no
  // confundir en pruebas; la ruta sigue existiendo en App.tsx. Reactivar cuando
  // se integre la verificación de identidad real.
  // { to: '/verificacion', label: 'ID No Presencial', icon: ScanLine,          roles: ['operador', 'oc'],          section: 'main' },
  { to: '/auditoria',    label: 'Auditoría',       icon: ClipboardCheck,     roles: ['oc', 'admin'],             section: 'secondary' },
  { to: '/configuracion',label: 'Configuración',   icon: Settings,           roles: ['admin'],                   section: 'secondary' },
];

export function navEntriesForRole(rol: RolUsuario, section?: 'main' | 'secondary'): NavEntry[] {
  return NAV_ENTRIES.filter(
    (e) => e.roles.includes(rol) && (section === undefined || e.section === section),
  );
}
