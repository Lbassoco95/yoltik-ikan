import { describe, expect, it } from "vitest";
import { NAV_ENTRIES, navEntriesForRole } from "./role-routes";

describe("rutas por rol", () => {
  it.each([
    ["operador", ["/", "/clientes", "/operaciones", "/verificacion"]],
    [
      "oc",
      [
        "/",
        "/clientes",
        "/operaciones",
        "/alertas",
        "/reportes",
        "/verificacion",
        "/auditoria",
      ],
    ],
    [
      "admin",
      [
        "/",
        "/clientes",
        "/operaciones",
        "/alertas",
        "/reportes",
        "/listas",
        "/reglas",
        "/auditoria",
        "/configuracion",
      ],
    ],
  ] as const)("filtra las entradas para %s", (rol, expected) => {
    expect(navEntriesForRole(rol).map((entry) => entry.to)).toEqual(expected);
  });

  it.each([
    ["operador", "main", ["/", "/clientes", "/operaciones", "/verificacion"]],
    ["oc", "secondary", ["/auditoria"]],
    [
      "admin",
      "main",
      [
        "/",
        "/clientes",
        "/operaciones",
        "/alertas",
        "/reportes",
        "/listas",
        "/reglas",
      ],
    ],
  ] as const)(
    "filtra las entradas de %s por sección %s",
    (rol, section, expected) => {
      expect(navEntriesForRole(rol, section).map((entry) => entry.to)).toEqual(
        expected,
      );
    },
  );

  it("tiene rutas únicas y roles definidos en cada entrada", () => {
    const paths = NAV_ENTRIES.map((entry) => entry.to);

    expect(new Set(paths).size).toBe(paths.length);
    expect(NAV_ENTRIES.every((entry) => entry.roles.length >= 1)).toBe(true);
  });

  it("marca Alertas con el contador correspondiente", () => {
    expect(NAV_ENTRIES.find((entry) => entry.to === "/alertas")).toMatchObject({
      badgeKey: "alertas_nuevas",
    });
  });
});
