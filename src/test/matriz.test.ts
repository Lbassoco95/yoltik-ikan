import { describe, it, expect } from "vitest";
import {
  aplicaElemento,
  elementosAplicables,
  variablesAplicables,
  respuestasCompletas,
} from "@/lib/riesgo/matriz";
import type { MatrizConfig, MatrizElemento } from "@/types/domain";

const elPF: MatrizElemento = {
  codigo: "E2_CLIENTE_PF",
  nombre: "Persona Física",
  aplica_si: "tipo_persona == 'fisica'",
  variables: [{ codigo: "CLI-PF-01", pregunta: "?", opciones: [{ valor: 1, label: "a" }] }],
};
const elPM: MatrizElemento = {
  codigo: "E2_CLIENTE_PM",
  nombre: "Persona Moral",
  aplica_si: "tipo_persona == 'moral'",
  variables: [{ codigo: "CLI-PM-01", pregunta: "?", opciones: [{ valor: 1, label: "a" }] }],
};
const elComun: MatrizElemento = {
  codigo: "E1_PRODUCTOS",
  nombre: "Productos",
  variables: [{ codigo: "PROD-01", pregunta: "?", opciones: [{ valor: 1, label: "a" }] }],
};

const config: MatrizConfig = {
  elementos: [elComun, elPF, elPM],
  escala_cliente: {
    bajo: { min: 15, max: 22, acciones: "" },
    medio: { min: 23, max: 30, acciones: "" },
    alto: { min: 31, max: 39, acciones: "" },
  },
  triggers_alto_de_oficio: [],
};

describe("matriz · aplicaElemento", () => {
  it("elemento sin predicado aplica siempre", () => {
    expect(aplicaElemento(elComun, "fisica")).toBe(true);
    expect(aplicaElemento(elComun, "moral")).toBe(true);
  });
  it("respeta tipo_persona == 'fisica' / 'moral'", () => {
    expect(aplicaElemento(elPF, "fisica")).toBe(true);
    expect(aplicaElemento(elPF, "moral")).toBe(false);
    expect(aplicaElemento(elPM, "moral")).toBe(true);
    expect(aplicaElemento(elPM, "fisica")).toBe(false);
  });
});

describe("matriz · elementos/variables aplicables", () => {
  it("PF ve común + PF, no PM", () => {
    const els = elementosAplicables(config, "fisica").map((e) => e.codigo);
    expect(els).toEqual(["E1_PRODUCTOS", "E2_CLIENTE_PF"]);
    expect(variablesAplicables(config, "fisica").map((v) => v.codigo)).toEqual([
      "PROD-01",
      "CLI-PF-01",
    ]);
  });
  it("PM ve común + PM, no PF", () => {
    expect(elementosAplicables(config, "moral").map((e) => e.codigo)).toEqual([
      "E1_PRODUCTOS",
      "E2_CLIENTE_PM",
    ]);
  });
});

describe("matriz · respuestasCompletas", () => {
  it("detecta captura incompleta y completa", () => {
    expect(respuestasCompletas(config, "fisica", { "PROD-01": 1 })).toBe(false);
    expect(respuestasCompletas(config, "fisica", { "PROD-01": 1, "CLI-PF-01": 2 })).toBe(true);
  });
});
