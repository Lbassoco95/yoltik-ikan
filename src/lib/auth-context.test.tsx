import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-context";

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
});
