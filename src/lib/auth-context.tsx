import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeout } from './with-timeout';
import type { RolUsuario, UserProfile } from '@/types/domain';

const ACTIVE_ROLE_STORAGE_KEY = 'ikan.activeRole';

interface AuthContextValue {
  session: Session | null;
  profile: UserProfile | null;
  roles: RolUsuario[];
  activeRole: RolUsuario | null;
  setActiveRole: (rol: RolUsuario) => void;
  loading: boolean;
  authError: Error | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<RolUsuario[]>([]);
  const [activeRole, setActiveRoleInternal] = useState<RolUsuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<Error | null>(null);

  useEffect(() => {
    let disposed = false;

    async function resolveSession() {
      try {
        const { data, error } = await withTimeout(
          () => supabase.auth.getSession(),
          SUPABASE_REQUEST_TIMEOUT_MS,
          'No se pudo resolver la sesión porque Supabase tardó demasiado. Intenta de nuevo.',
        );
        if (error) throw error;
        if (disposed) return;
        setSession(data.session);
        setAuthError(null);
      } catch (error: unknown) {
        const resolvedError = asError(error);
        console.error('[Ikán] No se pudo resolver la sesión:', resolvedError);
        if (!disposed) {
          setSession(null);
          setAuthError(resolvedError);
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void resolveSession();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (disposed) return;
      setSession(s);
      if (s) setAuthError(null);
    });
    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function loadProfile() {
      if (!session?.user) {
        setProfile(null);
        setRoles([]);
        return;
      }

      try {
        // TODO[Sprint D1.B2]: reemplazar este placeholder por query real
        // contra user_profile + user_roles. Por ahora se infiere el rol del
        // prefijo del email para permitir testear el routing antes de tener
        // la BD vinculada.
        const inferredRol: RolUsuario =
          session.user.email?.startsWith('admin@') ? 'admin' :
          session.user.email?.startsWith('oc@') ? 'oc' : 'operador';

        if (disposed) return;
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
      } catch (error: unknown) {
        const resolvedError = asError(error);
        console.error('[Ikán] No se pudo cargar el perfil:', resolvedError);
        if (!disposed) {
          setProfile(null);
          setRoles([]);
          setAuthError(resolvedError);
        }
      }
    }

    void loadProfile();
    return () => {
      disposed = true;
    };
  }, [session]);

  // Sincronizar activeRole con localStorage cuando cambian los roles disponibles.
  useEffect(() => {
    if (!roles.length) {
      setActiveRoleInternal(null);
      return;
    }
    let stored: string | null = null;
    if (typeof window !== 'undefined') {
      try {
        stored = window.localStorage.getItem(ACTIVE_ROLE_STORAGE_KEY);
      } catch (error: unknown) {
        console.error('[Ikán] No se pudo leer el rol activo:', asError(error));
      }
    }
    if (stored && roles.includes(stored as RolUsuario)) {
      setActiveRoleInternal(stored as RolUsuario);
    } else {
      setActiveRoleInternal(roles[0]);
    }
  }, [roles]);

  const setActiveRole = (rol: RolUsuario) => {
    if (!roles.includes(rol)) return;
    setActiveRoleInternal(rol);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, rol);
      } catch (error: unknown) {
        console.error('[Ikán] No se pudo guardar el rol activo:', asError(error));
      }
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{ session, profile, roles, activeRole, setActiveRole, loading, authError, signOut }}
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
