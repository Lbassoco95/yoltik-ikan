import { describe, it, expect } from "vitest";
import {
  PESO_POR_DEFECTO,
  clasificarPorBanda,
  evaluarMatriz,
  triggersActivados,
} from "@/lib/riesgo/matriz";
import type { MatrizConfig } from "@/types/domain";

/** Plantilla mínima: un elemento común (peso 2) y uno solo de persona física. */
const config: MatrizConfig = {
  elementos: [
    {
      codigo: "E1",
      nombre: "Producto",
      variables: [
        { codigo: "P-01", pregunta: "?", peso: 2, opciones: [{ valor: 1, label: "a" }, { valor: 3, label: "b" }] },
        { codigo: "P-02", pregunta: "?", opciones: [{ valor: 1, label: "a" }, { valor: 3, label: "b" }] },
      ],
    },
    {
      codigo: "E2",
      nombre: "Persona Física",
      aplica_si: "tipo_persona == 'fisica'",
      variables: [
        { codigo: "PF-01", pregunta: "PEP?", opciones: [{ valor: 1, label: "no" }, { valor: 3, label: "PEP extranjero" }] },
      ],
    },
  ],
  escala_cliente: {
    bajo: { min: 3, max: 5, acciones: "DDS" },
    medio: { min: 6, max: 8, acciones: "DDE" },
    alto: { min: 9, max: 12, acciones: "DDR" },
  },
  triggers_alto_de_oficio: [
    { codigo: "PEP_EXT", descripcion: "PEP extranjero", variable_codigo: "PF-01", valor_minimo: 3 },
    { codigo: "SOLO_DOC", descripcion: "Documental, sin variable ligada" },
  ],
};

describe("evaluarMatriz · score ponderado", () => {
  it("suma peso × valor sobre las variables aplicables", () => {
    // E1: 2×1 + 1×1 = 3 ; E2: 1×1 = 1 → 4
    const r = evaluarMatriz(config, "fisica", { "P-01": 1, "P-02": 1, "PF-01": 1 });
    expect(r.score_total).toBe(4);
    expect(r.subtotales).toEqual({ E1: 3, E2: 1 });
    expect(r.clasificacion).toBe("bajo");
  });

  it("usa peso 1 cuando la variable no declara peso", () => {
    expect(PESO_POR_DEFECTO).toBe(1);
    const r = evaluarMatriz(config, "fisica", { "P-01": 0, "P-02": 3, "PF-01": 0 });
    expect(r.subtotales.E1).toBe(3); // 2×0 + 1×3
  });

  it("excluye los elementos que no aplican al tipo de persona", () => {
    const r = evaluarMatriz(config, "moral", { "P-01": 3, "P-02": 3, "PF-01": 3 });
    // E2 no aplica: no suma aunque venga respondida.
    expect(r.score_total).toBe(9);
    expect(r.subtotales).not.toHaveProperty("E2");
  });

  it("una variable sin responder aporta 0", () => {
    const r = evaluarMatriz(config, "fisica", { "P-01": 1 });
    expect(r.score_total).toBe(2);
  });
});

describe("evaluarMatriz · triggers de alto de oficio", () => {
  it("un trigger activado fuerza 'alto' aunque el score sea bajo", () => {
    const r = evaluarMatriz(config, "fisica", { "P-01": 1, "P-02": 1, "PF-01": 3 });
    expect(r.score_total).toBe(6); // caería en 'medio' por banda
    expect(r.clasificacion).toBe("alto");
    expect(r.triggers_activados).toEqual(["PEP_EXT"]);
    expect(r.motivo_alto_de_oficio).toContain("PEP_EXT");
  });

  it("no dispara por debajo de valor_minimo", () => {
    const r = evaluarMatriz(config, "fisica", { "P-01": 1, "P-02": 1, "PF-01": 1 });
    expect(r.triggers_activados).toEqual([]);
    expect(r.motivo_alto_de_oficio).toBeNull();
  });

  it("un trigger sin variable_codigo/valor_minimo nunca dispara", () => {
    expect(triggersActivados(config, "fisica", { "PF-01": 3 }).map((t) => t.codigo)).toEqual([
      "PEP_EXT",
    ]);
  });

  it("no dispara si la variable del trigger no aplica a ese tipo de persona", () => {
    const r = evaluarMatriz(config, "moral", { "P-01": 3, "P-02": 3, "PF-01": 3 });
    expect(r.triggers_activados).toEqual([]);
  });
});

describe("clasificarPorBanda · bordes", () => {
  it("los límites de banda son inclusivos", () => {
    expect(clasificarPorBanda(config, 3).clasificacion).toBe("bajo");
    expect(clasificarPorBanda(config, 5).clasificacion).toBe("bajo");
    expect(clasificarPorBanda(config, 6).clasificacion).toBe("medio");
    expect(clasificarPorBanda(config, 12).clasificacion).toBe("alto");
  });

  it("por debajo del mínimo cae en 'bajo' y avisa", () => {
    const r = clasificarPorBanda(config, 0);
    expect(r.clasificacion).toBe("bajo");
    expect(r.warning).toContain("fuera de todas las bandas");
  });

  it("por encima del máximo cae en 'alto' y avisa", () => {
    const r = clasificarPorBanda(config, 99);
    expect(r.clasificacion).toBe("alto");
    expect(r.warning).not.toBeNull();
  });

  it("un hueco entre bandas usa la más cercana", () => {
    const conHueco: MatrizConfig = {
      ...config,
      escala_cliente: {
        bajo: { min: 1, max: 3, acciones: "a" },
        medio: { min: 10, max: 12, acciones: "b" },
        alto: { min: 20, max: 30, acciones: "c" },
      },
    };
    expect(clasificarPorBanda(conHueco, 4).clasificacion).toBe("bajo");
    expect(clasificarPorBanda(conHueco, 9).clasificacion).toBe("medio");
  });

  it("el warning viaja en el resultado de evaluarMatriz", () => {
    const fuera: MatrizConfig = {
      ...config,
      escala_cliente: {
        bajo: { min: 100, max: 110, acciones: "a" },
        medio: { min: 111, max: 120, acciones: "b" },
        alto: { min: 121, max: 130, acciones: "c" },
      },
    };
    const r = evaluarMatriz(fuera, "fisica", { "P-01": 1, "P-02": 1, "PF-01": 1 });
    expect(r.warnings).toHaveLength(1);
    expect(r.clasificacion).toBe("bajo");
  });
});
