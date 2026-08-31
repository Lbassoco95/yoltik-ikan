/**
 * El alta del segundo factor bajo doble montaje.
 *
 * Existe por un fallo concreto: el guardia que impide inscribir dos veces y la
 * bandera que descartaba el resultado se peleaban entre sí. En modo estricto
 * —que es como corre `npm run dev`— la limpieza del primer pase descartaba el
 * `enroll` en vuelo, el segundo pase salía por el guardia sin hacer nada, y la
 * pantalla se quedaba en «Preparando el código…» PARA SIEMPRE.
 *
 * Y es la única pantalla de la que el usuario no puede salir: sin segundo
 * factor no se llega a ninguna otra. Un cuelgue ahí deja a alguien fuera de su
 * propia cuenta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const situacionMfa = vi.fn();
const iniciarInscripcion = vi.fn();

vi.mock("@/lib/api/mfa", () => ({
  situacionMfa: () => situacionMfa(),
  iniciarInscripcion: () => iniciarInscripcion(),
  confirmarInscripcion: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ refrescarPerfil: vi.fn(), signOut: vi.fn() }),
}));

const navegar = vi.fn();
vi.mock("react-router-dom", async () => {
  const real = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...real, useNavigate: () => navegar };
});

import AltaSegundoFactorPage from "@/pages/auth/AltaSegundoFactor";

const QR = "data:image/svg+xml;utf-8,<svg/>";

function montarEnModoEstricto() {
  return render(
    <StrictMode>
      <MemoryRouter>
        <AltaSegundoFactorPage />
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  situacionMfa.mockReset();
  iniciarInscripcion.mockReset();
  navegar.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("alta del segundo factor en modo estricto", () => {
  it("llega al QR aunque el efecto se ejecute dos veces", async () => {
    situacionMfa.mockResolvedValue({ estado: "sin_inscribir", factorId: null });
    iniciarInscripcion.mockResolvedValue({ factorId: "f1", qr: QR, secreto: "ABC123" });

    montarEnModoEstricto();

    // Lo que fallaba: se quedaba aquí para siempre.
    await waitFor(() =>
      expect(screen.queryByText(/Preparando el código/i)).not.toBeInTheDocument(),
    );
    const img = await screen.findByAltText(/Código QR/i);
    expect(img).toHaveAttribute("src", QR);
  });

  it("inscribe UNA sola vez, no dos", async () => {
    // El guardia sigue haciendo su trabajo: dos `enroll` a la vez y el segundo
    // borra el factor del primero, dejando un QR que apunta a nada.
    situacionMfa.mockResolvedValue({ estado: "sin_inscribir", factorId: null });
    iniciarInscripcion.mockResolvedValue({ factorId: "f1", qr: QR, secreto: "ABC123" });

    montarEnModoEstricto();

    await screen.findByAltText(/Código QR/i);
    expect(iniciarInscripcion).toHaveBeenCalledTimes(1);
  });

  it("ofrece salida: el secreto en texto y cerrar sesión", async () => {
    // Quien llega sin su teléfono tiene que poder salir de aquí.
    situacionMfa.mockResolvedValue({ estado: "sin_inscribir", factorId: null });
    iniciarInscripcion.mockResolvedValue({ factorId: "f1", qr: QR, secreto: "ABC123" });

    montarEnModoEstricto();

    await screen.findByAltText(/Código QR/i);
    expect(screen.getByText("ABC123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cerrar sesión/i })).toBeInTheDocument();
  });

  it("avisa que activarlo es de una sola vía, antes de activarlo", async () => {
    situacionMfa.mockResolvedValue({ estado: "sin_inscribir", factorId: null });
    iniciarInscripcion.mockResolvedValue({ factorId: "f1", qr: QR, secreto: "ABC123" });

    montarEnModoEstricto();

    await screen.findByAltText(/Código QR/i);
    expect(screen.getByText(/no se desactiva desde Ikán/i)).toBeInTheDocument();
  });

  it("quien ya tiene factor no se queda cargando: se le manda al inicio", async () => {
    situacionMfa.mockResolvedValue({ estado: "inscrito", factorId: "f1" });

    montarEnModoEstricto();

    await waitFor(() => expect(navegar).toHaveBeenCalledWith("/", { replace: true }));
    expect(iniciarInscripcion).not.toHaveBeenCalled();
  });

  it("si el alta falla, se dice y se deja de cargar", async () => {
    // Sin esto la pantalla también se quedaba colgada, sin decir por qué.
    situacionMfa.mockResolvedValue({ estado: "sin_inscribir", factorId: null });
    iniciarInscripcion.mockRejectedValue(new Error("factor already exists"));

    montarEnModoEstricto();

    expect(await screen.findByText(/factor already exists/i)).toBeInTheDocument();
    expect(screen.queryByText(/Preparando el código/i)).not.toBeInTheDocument();
  });

  it("si no se pudo preguntar a Auth, tampoco se queda cargando", async () => {
    situacionMfa.mockResolvedValue({
      estado: "no_disponible",
      factorId: null,
      motivo: "Failed to fetch",
    });

    montarEnModoEstricto();

    expect(await screen.findByText(/No se pudo preguntar por el segundo factor/i)).toBeInTheDocument();
    expect(screen.queryByText(/Preparando el código/i)).not.toBeInTheDocument();
  });
});
