import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { RolUsuario, SectorAV, UserProfile } from "@/types/domain";
import { type PerfilActividad, resolverPerfil } from "./perfil-actividad";
import { situacionMfa, type EstadoMfa } from "./api/mfa";

const ACTIVE_ROLE_STORAGE_KEY = "ikan.activeRole";

interface AuthContextValue {
  session: Session | null;
  profile: UserProfile | null;
  roles: RolUsuario[];
  activeRole: RolUsuario | null;
  setActiveRole: (rol: RolUsuario) => void;
  perfilActividad: PerfilActividad;
  /**
   * Si el usuario tiene segundo factor. `no_disponible` NO es lo mismo que
   * `sin_inscribir`: lo primero es que no se pudo preguntar, y tratarlos igual
   * dejaría al OC fuera de su propio sistema por una falla de plataforma.
   */
  estadoMfa: EstadoMfa | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /** Relee perfil y segundo factor. Se llama al terminar el alta de 2FA. */
  refrescarPerfil: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<RolUsuario[]>([]);
  const [activeRole, setActiveRoleInternal] = useState<RolUsuario | null>(null);
  const [perfilActividad, setPerfilActividad] =
    useState<PerfilActividad>("generico");
  const [estadoMfa, setEstadoMfa] = useState<EstadoMfa | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) =>
      setSession(s),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // Definida fuera del efecto para poder volver a llamarla al terminar el alta
  // del segundo factor, sin recargar la página.
  const loadProfile = useCallback(async () => {
    if (!session?.user) {
      setProfile(null);
      setRoles([]);
      setPerfilActividad("generico");
      setEstadoMfa(null);
      return;
    }
    const user = session.user;

    // El segundo factor se pregunta a Auth, no se supone. Antes esto era un
    // `mfa_habilitado: true` fijo: el perfil afirmaba que el usuario tenía
    // 2FA cuando no había ni forma de darlo de alta.
    const mfa = await situacionMfa();
    setEstadoMfa(mfa.estado);

    // Fallback: si no hay BD vinculada o el perfil aún no existe, se infiere
    // el rol del prefijo del email para poder testear el routing.
    const inferredRol: RolUsuario = user.email?.startsWith("admin@")
      ? "admin"
      : user.email?.startsWith("oc@")
        ? "oc"
        : "operador";

    // Query real contra user_profile + user_roles (RCG0.B0b).
    try {
      const [{ data: prof }, { data: rolesData }] = await Promise.all([
        supabase
          .from("user_profile")
          .select("organization_id, nombre, email, activo")
          .eq("id", user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("rol").eq("user_id", user.id),
      ]);

      if (prof) {
        const p = prof as {
          organization_id: string;
          nombre: string;
          email: string;
          activo: boolean;
        };
        const dbRoles = ((rolesData ?? []) as { rol: RolUsuario }[]).map(
          (r) => r.rol,
        );
        const rolesFinal = dbRoles.length ? dbRoles : [inferredRol];

        // Organización: razón social + perfil de actividad (para "vestir" la UI).
        let orgNombre = "Ixim Pay";
        let perfil: PerfilActividad = "generico";
        let sectores: SectorAV[] = [];
        try {
          const { data: org } = await supabase
            .from("organizations")
            .select("razon_social, perfil_actividad, sectores")
            .eq("id", p.organization_id)
            .maybeSingle();
          if (org) {
            const o = org as {
              razon_social: string | null;
              perfil_actividad: string | null;
              sectores: SectorAV[] | null;
            };
            orgNombre = o.razon_social ?? orgNombre;
            perfil = resolverPerfil(o.perfil_actividad);
            sectores = o.sectores ?? [];
          }
        } catch {
          // La columna perfil_actividad puede no existir en un remoto sin migrar.
        }
        setPerfilActividad(perfil);

        setProfile({
          id: user.id,
          organization_id: p.organization_id,
          organization_name: orgNombre,
          organization_sectores: sectores,
          email: p.email ?? user.email ?? "",
          nombre: p.nombre ?? user.email?.split("@")[0] ?? "Usuario",
          roles: rolesFinal,
          activo: p.activo,
          mfa_habilitado: mfa.estado === "inscrito",
        });
        setRoles(rolesFinal);
        return;
      }
    } catch {
      // Sin BD disponible: se usa el fallback de abajo.
    }

    setPerfilActividad("generico");
    setProfile({
      id: user.id,
      organization_id: "pending",
      organization_name: "Ixim Pay",
      email: user.email ?? "",
      nombre:
        user.user_metadata?.nombre ?? user.email?.split("@")[0] ?? "Usuario",
      roles: [inferredRol],
      activo: true,
      mfa_habilitado: mfa.estado === "inscrito",
    });
    setRoles([inferredRol]);
  }, [session]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const refrescarPerfil = useCallback(async () => {
    await loadProfile();
  }, [loadProfile]);

  // Sincronizar activeRole con localStorage cuando cambian los roles disponibles.
  useEffect(() => {
    if (!roles.length) {
      setActiveRoleInternal(null);
      return;
    }
    const stored =
      typeof window !== "undefined"
        ? (window.localStorage.getItem(
            ACTIVE_ROLE_STORAGE_KEY,
          ) as RolUsuario | null)
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
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, rol);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        roles,
        activeRole,
        setActiveRole,
        perfilActividad,
        estadoMfa,
        loading,
        signOut,
        refrescarPerfil,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
