// Pruebas de la lógica del anclaje (RCG0.B8.2).
// Importa el módulo puro de la Edge Function: sin Deno, sin Supabase y sin
// calendario, que es justamente lo que no hay en esta sesión.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  motivoValido,
  planearAnclaje,
  sellarRaiz,
} from "../../supabase/functions/anclar-bitacora/anclaje";
import {
  SelladorFalso,
  armarOts,
  _internos,
  type RespuestaCalendario,
} from "../../supabase/functions/_shared/opentimestamps";
import { raizMerkle } from "../../supabase/functions/_shared/merkle";

const h = (n: number) => createHash("sha256").update(`eslabon-${n}`).digest("hex");

const tramo = (desde: number, hasta: number) =>
  Array.from({ length: hasta - desde + 1 }, (_, i) => ({
    secuencia: desde + i,
    cadena_hash: h(desde + i),
  }));

describe("planearAnclaje", () => {
  it("cubre el tramo completo y calcula su raíz", async () => {
    const plan = await planearAnclaje(tramo(1, 10), 1);
    expect(plan).not.toBeNull();
    expect(plan!.desde).toBe(1);
    expect(plan!.hasta).toBe(10);
    expect(plan!.raiz_merkle).toBe(await raizMerkle(tramo(1, 10).map((e) => e.cadena_hash)));
    expect(plan!.cadena_hash_final).toBe(h(10));
  });

  it("sin eventos nuevos no hay anclaje", async () => {
    // Un anclaje vacío gastaría un estampado y dejaría un tramo sin sentido en
    // una tabla cuyos rangos no se corrigen después.
    expect(await planearAnclaje([], 11)).toBeNull();
  });

  it("ordena por secuencia aunque lleguen desordenados", async () => {
    const desordenado = [...tramo(1, 5)].reverse();
    const plan = await planearAnclaje(desordenado, 1);
    expect(plan!.raiz_merkle).toBe(await raizMerkle(tramo(1, 5).map((e) => e.cadena_hash)));
  });

  it("un hueco en la bitácora frena el anclaje en vez de certificar otra historia", async () => {
    const conHueco = [...tramo(1, 3), ...tramo(5, 7)];
    await expect(planearAnclaje(conHueco, 1)).rejects.toThrow(/hueco/i);
  });

  it("un tramo que no empieza donde debía frena el anclaje", async () => {
    // Significa que la consulta paginó mal o que falta un evento: anclarlo
    // dejaría un agujero permanente, porque los rangos no se pueden corregir.
    await expect(planearAnclaje(tramo(5, 10), 1)).rejects.toThrow(/tenía que empezar en 1/i);
  });

  it("un solo evento se ancla igual", async () => {
    const plan = await planearAnclaje(tramo(42, 42), 42);
    expect(plan!.desde).toBe(42);
    expect(plan!.hasta).toBe(42);
    expect(plan!.raiz_merkle).toBe(h(42));
  });

  it("la raíz cambia si cambia un solo eslabón del tramo", async () => {
    const original = await planearAnclaje(tramo(1, 20), 1);
    const alterado = tramo(1, 20);
    alterado[7] = { secuencia: 8, cadena_hash: h(999) };
    const otro = await planearAnclaje(alterado, 1);
    expect(otro!.raiz_merkle).not.toBe(original!.raiz_merkle);
  });
});

describe("sellarRaiz", () => {
  const RAIZ = h(1);
  const respuesta = (calendario: string, ok: boolean): RespuestaCalendario =>
    ok
      ? { calendario, ok: true, bytes: new Uint8Array([0x01, 0x02, 0x03]) }
      : { calendario, ok: false, error: "HTTP 503" };

  it("basta con que un calendario conteste", async () => {
    const r = await sellarRaiz(
      RAIZ,
      new SelladorFalso([respuesta("a", true), respuesta("b", false)]),
    );
    expect(r.estado).toBe("pendiente");
    expect(r.calendarios).toEqual(["a"]);
    expect(r.ots).not.toBeNull();
  });

  it("anota los que fallaron aunque el anclaje salga bien", async () => {
    // Un calendario que falla siempre es una señal, no un accidente.
    const r = await sellarRaiz(
      RAIZ,
      new SelladorFalso([respuesta("a", true), respuesta("b", false)]),
    );
    expect(r.detalle).toContain("b");
  });

  it("que fallen todos es un resultado, no una excepción", async () => {
    // Lanzar dejaría la corrida sin rastro de por qué no se ancló.
    const r = await sellarRaiz(
      RAIZ,
      new SelladorFalso([respuesta("a", false), respuesta("b", false)]),
    );
    expect(r.estado).toBe("fallido");
    expect(r.ots).toBeNull();
    expect(r.detalle).toContain("Ningún calendario respondió");
    expect(r.detalle).toContain("HTTP 503");
  });

  it("un sellador que revienta tampoco tumba la corrida", async () => {
    const roto = {
      sellar: () => Promise.reject(new Error("DNS caído")),
    };
    const r = await sellarRaiz(RAIZ, roto);
    expect(r.estado).toBe("fallido");
    expect(r.detalle).toContain("DNS caído");
  });

  it("una raíz que no es SHA-256 no se manda a ningún lado", async () => {
    await expect(
      sellarRaiz("no-es-un-hash", new SelladorFalso([respuesta("a", true)])),
    ).rejects.toThrow(/SHA-256/);
  });

  it("un calendario que contesta vacío no cuenta como sellado", async () => {
    const vacio: RespuestaCalendario = { calendario: "a", ok: true, bytes: new Uint8Array() };
    const r = await sellarRaiz(RAIZ, new SelladorFalso([vacio]));
    expect(r.estado).toBe("fallido");
  });
});

describe("armado del archivo .ots", () => {
  const digest = Buffer.from(h(1), "hex");
  const porcion = (n: number) => new Uint8Array([n, n, n]);

  it("empieza con la cabecera del formato y la versión", () => {
    const ots = armarOts(digest, [{ calendario: "a", ok: true, bytes: porcion(1) }]);
    expect([...ots.slice(0, _internos.MAGIC.length)]).toEqual([..._internos.MAGIC]);
    expect(ots[_internos.MAGIC.length]).toBe(1); // versión
  });

  it("lleva la operación de hash y el digest completo", () => {
    const ots = armarOts(digest, [{ calendario: "a", ok: true, bytes: porcion(1) }]);
    const i = _internos.MAGIC.length + 1;
    expect(ots[i]).toBe(_internos.OP_SHA256);
    expect([...ots.slice(i + 1, i + 33)]).toEqual([...digest]);
  });

  it("separa varias ramas con el byte de bifurcación", () => {
    const ots = armarOts(digest, [
      { calendario: "a", ok: true, bytes: porcion(1) },
      { calendario: "b", ok: true, bytes: porcion(2) },
    ]);
    expect([...ots].filter((b) => b === _internos.BIFURCACION).length).toBe(1);
  });

  it("una sola rama no lleva bifurcación", () => {
    const ots = armarOts(digest, [{ calendario: "a", ok: true, bytes: porcion(1) }]);
    // El digest puede contener 0xff por casualidad, así que se mira sólo la
    // parte que sigue al digest.
    const cola = ots.slice(_internos.MAGIC.length + 34);
    expect([...cola]).toEqual([1, 1, 1]);
  });

  it("sin ninguna prueba no hay archivo que armar", () => {
    expect(() => armarOts(digest, [{ calendario: "a", ok: false, error: "x" }])).toThrow(
      /Ningún calendario/,
    );
  });

  it("rechaza un digest que no sea de 32 bytes", () => {
    expect(() => armarOts(new Uint8Array(16), [{ calendario: "a", ok: true, bytes: porcion(1) }]))
      .toThrow(/32 bytes/);
  });

  it("el varint sigue la codificación del formato", () => {
    expect([..._internos.varint(0)]).toEqual([0x00]);
    expect([..._internos.varint(1)]).toEqual([0x01]);
    expect([..._internos.varint(127)]).toEqual([0x7f]);
    expect([..._internos.varint(128)]).toEqual([0x80, 0x01]);
    expect([..._internos.varint(300)]).toEqual([0xac, 0x02]);
  });
});

describe("motivo del anclaje", () => {
  it("deja pasar los tres que la tabla admite", () => {
    for (const m of ["diario", "cierre_periodo", "manual"]) {
      expect(motivoValido(m)).toEqual({ motivo: m, aviso: null });
    }
  });

  it("un motivo que la tabla no admite NO tumba el anclaje", () => {
    // El cron se programó mandando 'cron'. Con el insert crudo, el anclaje
    // fallaba y la respuesta seguía siendo 200: nadie se enteraba hasta mirar
    // la tabla semanas después. Anclar importa más que la etiqueta.
    const r = motivoValido("cron");
    expect(r.motivo).toBe("diario");
    expect(r.aviso).toContain("cron");
  });

  it("sin motivo se ancla como diario, sin aviso", () => {
    expect(motivoValido(undefined)).toEqual({ motivo: "diario", aviso: null });
    expect(motivoValido("")).toEqual({ motivo: "diario", aviso: null });
  });

  it("lo que mandó quien llamó queda escrito, no se traga en silencio", () => {
    expect(motivoValido("MANUAL").aviso).toContain("MANUAL");
    expect(motivoValido(42).aviso).toContain("42");
  });
});
