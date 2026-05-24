import { useAuth } from '@/lib/auth-context';

/**
 * Wrapper sobre AuthContext para acceder al rol activo sin tener que
 * desestructurar todo el contexto. El estado real vive en AuthContext
 * para que AppHeader y AppSidebar se sincronicen al cambiar de rol.
 */
export function useActiveRole() {
  const { activeRole, setActiveRole, roles } = useAuth();
  return {
    activeRole,
    setActiveRole,
    hasMultipleRoles: roles.length > 1,
  };
}
