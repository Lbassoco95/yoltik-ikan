import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "./ProtectedRoute";
import { useAuth } from "@/lib/auth-context";

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function renderRoute(
  auth: { loading: boolean; session: unknown; roles: string[] },
  props: {
    requireRole?: "operador" | "oc" | "admin";
    requireAnyRole?: ("operador" | "oc" | "admin")[];
  } = {},
) {
  mockedUseAuth.mockReturnValue({
    ...auth,
    activeRole: null,
    profile: null,
    setActiveRole: vi.fn(),
    signOut: vi.fn(),
  } as ReturnType<typeof useAuth>);
  return render(
    <MemoryRouter
      initialEntries={["/privado"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route
          path="/privado"
          element={
            <ProtectedRoute {...props}>
              <div>Contenido protegido</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Pantalla de login</div>} />
        <Route path="/" element={<div>Inicio</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("muestra un placeholder mientras carga", () => {
    renderRoute({ loading: true, session: null, roles: [] });

    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });

  it("redirige a login cuando no hay sesión", () => {
    renderRoute({ loading: false, session: null, roles: [] });

    expect(screen.getByText("Pantalla de login")).toBeInTheDocument();
  });

  it("redirige al inicio cuando no coincide el rol requerido", () => {
    renderRoute(
      { loading: false, session: {}, roles: ["operador"] },
      { requireRole: "admin" },
    );

    expect(screen.getByText("Inicio")).toBeInTheDocument();
  });

  it("redirige al inicio cuando ningún rol requerido coincide", () => {
    renderRoute(
      { loading: false, session: {}, roles: ["operador"] },
      { requireAnyRole: ["oc", "admin"] },
    );

    expect(screen.getByText("Inicio")).toBeInTheDocument();
  });

  it.each([
    {},
    { requireRole: "oc" as const },
    { requireAnyRole: ["oc", "admin"] as const },
  ])("renderiza hijos cuando la autorización pasa", (props) => {
    renderRoute({ loading: false, session: {}, roles: ["oc"] }, props);

    expect(screen.getByText("Contenido protegido")).toBeInTheDocument();
  });
});
