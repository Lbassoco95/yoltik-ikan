import { describe, expect, it } from "vitest";
import {
  cn,
  formatMxn,
  umaToMxn,
  UMA_MXN,
  UMBRAL_IDENTIFICACION_MXN,
  UMBRAL_IDENTIFICACION_UMA,
} from "./utils";

describe("utilidades", () => {
  it("combina clases y resuelve conflictos de Tailwind", () => {
    expect(cn("px-2 py-1", "px-4", false, null, undefined, "")).toBe(
      "py-1 px-4",
    );
    expect(cn(["text-sm", null], { "font-bold": true, italic: false })).toBe(
      "text-sm font-bold",
    );
  });

  it("convierte UMA a pesos mexicanos", () => {
    expect(umaToMxn(0)).toBe(0);
    expect(umaToMxn(645)).toBe(UMBRAL_IDENTIFICACION_MXN);
    expect(umaToMxn(1.5)).toBe(UMA_MXN * 1.5);
  });

  it("formatea pesos mexicanos sin decimales", () => {
    expect(formatMxn(0)).toBe("$0");
    expect(formatMxn(1234.56)).toBe("$1,235");
    expect(formatMxn(-1234.56)).toBe("-$1,235");
  });

  it("mantiene el umbral de identificación en 645 UMA", () => {
    expect(UMBRAL_IDENTIFICACION_UMA).toBe(645);
    expect(UMBRAL_IDENTIFICACION_MXN).toBe(UMA_MXN * 645);
  });
});
