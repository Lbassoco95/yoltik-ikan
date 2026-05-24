import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { RolUsuario, UserProfile } from '@/types/domain';

const ACTIVE_ROLE_STORAGE_KEY = 'ikan.activeRole';

interface AuthContextValue {
  session: Session | null;
  profile: UserProfile | null;
  roles: RolUsuario[];
  activeRole: RolUsuario | null;
  setActiveRole: (rol: RolUsuario) => void;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<RolUsuario[]>([]);
  const [activeRole, setActiveRoleInternal] = useState<RolUsuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function loadProfile() {
      if (!session?.user) {
        setProfile(null);
        setRoles([]);
        return;
      }
      // TODO[Sprint D1.B2]: reemplazar este placeholder por query real
      // contra user_profile + user_roles. Por ahora se infiere el rol del
      // prefijo del email para permitir testear el routing antes de tener
      // la BD vinculada.
      const inferredRol: RolUsuario =
        session.user.email?.startsWith('admin@') ? 'admin' :
        session.user.email?.startsWith('oc@') ? 'oc' : 'operador';

      setProfile({
        id: session.user.id,
        organization_id: 'pending',
        organization_name: 'FIATCOIN RAMPLE',
        email: session.user.email ?? '',
        nombre: session.user.user_metadata?.nombre ?? session.user.email?.split('@')[0] ?? 'Usuario',
        roles: [inferredRol],
        activo: true,
        mfa_habilitado: true,
      });
      setRoles([inferredRol]);
    }
    void loadProfile();
  }, [session]);

  // Sincronizar activeRole con localStorage cuando cambian los roles disponibles.
  useEffect(() => {
    if (!roles.length) {
      setActiveRoleInternal(null);
      return;
    }
    const stored = typeof window !== 'undefined'
      ? (window.localStorage.getItem(ACTIVE_ROLE_STORAGE_KEY) as RolUsuario | null)
      : null;
    if (stored && roles.includes(stored)) {
      setActiveRoleInternal(stored);
    } else {
      setActiveRoleInternal(roles[0]);
    }
  }, [roles]);

  const setActiveRole = (rol: RolUsuario) => {
    if (!roles.includes(rol)) return;
    setActiveRoleInternal(rol);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, rol);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, profile, roles, activeRole, setActiveRole, loading, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
