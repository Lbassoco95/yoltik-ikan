import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { evaluarMatriz, variablesAplicables } from "@/lib/riesgo/matriz";
import type { MatrizConfig, TipoPersona } from "@/types/domain";

/**
 * Verifica la plantilla XII (notarías) tal como está SEMBRADA, no una copia.
 * Si alguien edita el seed y descalibra las bandas o rompe un trigger, esto
 * falla aquí y no en el piloto.
 */
function cargarSeedXII(): MatrizConfig {
  const sql = readFileSync(
    resolve(__dirname, "../../supabase/seed/09_plantilla_matriz_cliente_xii.sql"),
    "utf8",
  );
  const inicio = sql.indexOf("'{");
  const fin = sql.lastIndexOf("}'");
  // En SQL las comillas simples internas van dobladas (''fisica'').
  return JSON.parse(sql.slice(inicio + 1, fin + 1).replace(/''/g, "'")) as MatrizConfig;
}

const cfg = cargarSeedXII();

/** Respuestas que llevan cada variable aplicable a su valor mínimo o máximo. */
function respuestasExtremo(tipo: TipoPersona, extremo: "min" | "max"): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of variablesAplicables(cfg, tipo)) {
    const valores = v.opciones.map((o) => o.valor);
    out[v.codigo] = extremo === "min" ? Math.min(...valores) : Math.max(...valores);
  }
  return out;
}

describe("plantilla XII sembrada · estructura", () => {
  it("tiene los 4 elementos acordados", () => {
    expect(cfg.elementos.map((e) => e.codigo)).toEqual([
      "E1_ACTO",
      "E2_COMPARECIENTE_PF",
      "E3_COMPARECIENTE_PM",
      "E4_ORIGEN_RECURSOS",
    ]);
  });

  it("cada variable tiene opciones con valores únicos", () => {
    // El <SelectItem key={o.valor}> de ClientDetailPage colisiona si se repiten.
    for (const el of cfg.elementos) {
      for (const v of el.variables) {
        const valores = v.opciones.map((o) => o.valor);
        expect(new Set(valores).size, `${v.codigo} repite valores`).toBe(valores.length);
      }
    }
  });

  it("cada trigger apunta a una variable que existe", () => {
    const codigos = new Set(cfg.elementos.flatMap((e) => e.variables.map((v) => v.codigo)));
    for (const t of cfg.triggers_alto_de_oficio) {
      expect(codigos.has(t.variable_codigo!), `${t.codigo} apunta a ${t.variable_codigo}`).toBe(true);
      expect(typeof t.valor_minimo).toBe("number");
    }
  });
});

describe("plantilla XII sembrada · calibración de bandas", () => {
  it("el rango real es 8–25 (PF) y 8–26 (PM)", () => {
    // Se calcula sobre respuestas que NO disparan triggers para medir el score.
    const rango = (tipo: TipoPersona) => ({
      min: evaluarMatriz(cfg, tipo, respuestasExtremo(tipo, "min")).score_total,
      max: evaluarMatriz(cfg, tipo, respuestasExtremo(tipo, "max")).score_total,
    });
    expect(rango("fisica")).toEqual({ min: 8, max: 25 });
    expect(rango("moral")).toEqual({ min: 8, max: 26 });
  });

  it("las bandas cubren todo el rango sin huecos", () => {
    const { bajo, medio, alto } = cfg.escala_cliente;
    expect(bajo.min).toBe(8);
    expect(alto.max).toBe(26);
    expect(medio.min).toBe(bajo.max + 1);
    expect(alto.min).toBe(medio.max + 1);
  });

  it("ningún score alcanzable queda fuera de las bandas", () => {
    for (const tipo of ["fisica", "moral"] as TipoPersona[]) {
      for (const extremo of ["min", "max"] as const) {
        const r = evaluarMatriz(cfg, tipo, respuestasExtremo(tipo, extremo));
        expect(r.warnings, `${tipo}/${extremo}: ${r.warnings.join()}`).toHaveLength(0);
      }
    }
  });
});

describe("plantilla XII sembrada · comportamiento de negocio", () => {
  const base = (): Record<string, number> => ({
    "XII-ACT-01": 1, "XII-ACT-02": 1, "XII-ACT-03": 1,
    "XII-PF-01": 1, "XII-PF-02": 1, "XII-PF-03": 1,
    "XII-REC-01": 1, "XII-REC-02": 1,
  });

  it("el caso más benigno da riesgo bajo", () => {
    const r = evaluarMatriz(cfg, "fisica", base());
    expect(r.score_total).toBe(8);
    expect(r.clasificacion).toBe("bajo");
  });

  it("un poder irrevocable es alto de oficio aunque todo lo demás sea benigno", () => {
    const r = evaluarMatriz(cfg, "fisica", { ...base(), "XII-ACT-01": 4 });
    expect(r.clasificacion).toBe("alto");
    expect(r.triggers_activados).toContain("PODER_IRREVOCABLE");
  });

  it("un PEP extranjero es alto de oficio", () => {
    const r = evaluarMatriz(cfg, "fisica", { ...base(), "XII-PF-02": 3 });
    expect(r.clasificacion).toBe("alto");
    expect(r.triggers_activados).toContain("PEP_EXTRANJERO");
  });

  it("una compraventa bancarizada de bajo monto NO dispara triggers", () => {
    const r = evaluarMatriz(cfg, "fisica", base());
    expect(r.triggers_activados).toEqual([]);
    expect(r.motivo_alto_de_oficio).toBeNull();
  });
});
