import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-context";
import { SUPABASE_REQUEST_TIMEOUT_MS } from "./with-timeout";

const { getSession, onAuthStateChange } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession,
      onAuthStateChange,
      signOut: vi.fn(),
    },
  },
}));

function AuthStatus() {
  const { loading, authError } = useAuth();
  return (
    <div>
      {loading ? "cargando" : authError ? `error:${authError.message}` : "listo"}
    </div>
  );
}

describe("AuthProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    getSession.mockReset();
    onAuthStateChange.mockReset();
    onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("termina la carga y expone el error cuando getSession falla", async () => {
    getSession.mockRejectedValue(new Error("Supabase no disponible"));

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );

    expect(await screen.findByText("error:Supabase no disponible")).toBeInTheDocument();
  });

  it("termina la carga cuando getSession excede el tiempo límite", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getSession.mockReturnValue(new Promise(() => undefined));

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS);
    });

    expect(
      screen.getByText(
        "error:No se pudo resolver la sesión porque Supabase tardó demasiado. Intenta de nuevo.",
      ),
    ).toBeInTheDocument();
  });
});
