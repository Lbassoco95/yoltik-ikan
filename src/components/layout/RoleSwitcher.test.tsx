import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoleSwitcher } from "./RoleSwitcher";

describe("RoleSwitcher", () => {
  it("muestra una etiqueta estática con un solo rol", () => {
    render(
      <RoleSwitcher
        roles={["operador"]}
        activeRole="operador"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Rol:")).toBeInTheDocument();
    expect(screen.getByText("Operador")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("muestra todos los roles y notifica el cambio con varios roles", () => {
    const onChange = vi.fn();
    render(
      <RoleSwitcher
        roles={["operador", "oc", "admin"]}
        activeRole="operador"
        onChange={onChange}
      />,
    );

    const select = screen.getByRole("combobox");
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(
      screen.getByRole("option", { name: "Oficial de Cumplimiento" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Administrador" }),
    ).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "admin" } });
    expect(onChange).toHaveBeenCalledWith("admin");
  });
});
