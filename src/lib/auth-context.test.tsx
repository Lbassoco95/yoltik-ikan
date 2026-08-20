import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = {
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
};
const unsubscribe = vi.fn();

vi.mock("./supabase", () => ({
  supabase: { auth: authMock },
}));

type AuthModule = typeof import("./auth-context");

function makeSession(
  email: string,
  userMetadata: Record<string, unknown> = {},
) {
  return {
    access_token: "token",
    refresh_token: "refresh",
    expires_in: 3600,
    expires_at: 9999999999,
    token_type: "bearer",
    user: {
      id: `id-${email}`,
      aud: "authenticated",
      email,
      user_metadata: userMetadata,
    },
  };
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    authMock.getSession.mockReset();
    authMock.onAuthStateChange.mockReset();
    authMock.signOut.mockReset();
    unsubscribe.mockReset();
    authMock.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    });
    authMock.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    localStorage.clear();
  });

  async function loadAuth(): Promise<AuthModule> {
    return import("./auth-context");
  }

  async function renderAuth(session: ReturnType<typeof makeSession> | null) {
    authMock.getSession.mockResolvedValue({ data: { session } });
    const { AuthProvider, useAuth } = await loadAuth();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );
    const hook = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
  }

  it("termina la carga después de obtener la sesión", async () => {
    const hook = await renderAuth(null);

    expect(hook.result.current.loading).toBe(false);
    expect(authMock.getSession).toHaveBeenCalledOnce();
  });

  it.each([
    ["admin@ikan.test", "admin"],
    ["oc@ikan.test", "oc"],
    ["operador@ikan.test", "operador"],
    ["persona@ikan.test", "operador"],
  ] as const)("infiere el rol %s como %s", async (email, expectedRole) => {
    const hook = await renderAuth(makeSession(email));

    expect(hook.result.current.roles).toEqual([expectedRole]);
    expect(hook.result.current.profile?.roles).toEqual([expectedRole]);
  });

  it("construye el perfil con metadatos y usa el correo como respaldo del nombre", async () => {
    const withMetadata = await renderAuth(
      makeSession("oc@ikan.test", { nombre: "Oficial Ejemplo" }),
    );
    expect(withMetadata.result.current.profile).toMatchObject({
      id: "id-oc@ikan.test",
      email: "oc@ikan.test",
      nombre: "Oficial Ejemplo",
      organization_id: "pending",
      organization_name: "FIATCOIN RAMPLE",
      activo: true,
      mfa_habilitado: true,
    });

    withMetadata.unmount();
    vi.resetModules();
    localStorage.clear();
    const withoutMetadata = await renderAuth(makeSession("admin@ikan.test"));
    expect(withoutMetadata.result.current.profile?.nombre).toBe("admin");
  });

  it("deja el perfil y los roles vacíos si no hay sesión", async () => {
    const hook = await renderAuth(null);

    expect(hook.result.current.profile).toBeNull();
    expect(hook.result.current.roles).toEqual([]);
    expect(hook.result.current.activeRole).toBeNull();
  });

  it("honra un rol válido guardado y usa el primero si es inválido", async () => {
    localStorage.setItem("ikan.activeRole", "admin");
    const valid = await renderAuth(makeSession("admin@ikan.test"));
    expect(valid.result.current.activeRole).toBe("admin");
    valid.unmount();

    vi.resetModules();
    localStorage.setItem("ikan.activeRole", "oc");
    const invalid = await renderAuth(makeSession("admin@ikan.test"));
    expect(invalid.result.current.activeRole).toBe("admin");
  });

  it("ignora roles no disponibles y persiste el rol válido", async () => {
    const hook = await renderAuth(makeSession("oc@ikan.test"));

    act(() => {
      hook.result.current.setActiveRole("admin");
    });
    expect(hook.result.current.activeRole).toBe("oc");
    expect(localStorage.getItem("ikan.activeRole")).toBeNull();

    act(() => {
      hook.result.current.setActiveRole("oc");
    });
    expect(hook.result.current.activeRole).toBe("oc");
    expect(localStorage.getItem("ikan.activeRole")).toBe("oc");
  });

  it("delega signOut a Supabase", async () => {
    const hook = await renderAuth(null);

    await act(async () => {
      await hook.result.current.signOut();
    });
    expect(authMock.signOut).toHaveBeenCalledOnce();
  });

  it("lanza un error si useAuth se usa fuera del proveedor", async () => {
    const { useAuth } = await loadAuth();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth debe usarse dentro de <AuthProvider>",
    );
    consoleError.mockRestore();
  });

  it("cancela la suscripción al desmontarse", async () => {
    const hook = await renderAuth(null);

    hook.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
