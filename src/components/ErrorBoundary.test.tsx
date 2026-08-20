import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function ThrowingChild() {
  throw new Error("Error de prueba");
}

describe("ErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("muestra el fallback cuando un hijo lanza un error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    expect(
      screen.getByText("Ocurrió un error inesperado. Recarga la página e inténtalo de nuevo."),
    ).toBeInTheDocument();
  });
});
