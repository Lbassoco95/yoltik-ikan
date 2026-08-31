// La fecha de un bloque de Bitcoin (RCG0.B8.2).
//
// Regla que gobierna todo este archivo: la fecha NUNCA decide si un anclaje
// está confirmado. Eso lo dice la atestiguación dentro del .ots. La fecha es
// comodidad de lectura y sale de un tercero, así que se trata como tal.
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { FechaDeBloqueHttp, FechaDeBloqueFija } from "../../supabase/functions/_shared/bitcoin";

// jsdom no trae `AbortSignal.timeout`, que Deno sí tiene. Sin esto, el corte
// por tiempo revienta dentro del try y todas las consultas devolverían null
// por el motivo equivocado —la prueba pasaría en verde por accidente en los
// casos que esperan null y fallaría en los que esperan fecha—.
beforeAll(() => {
  if (typeof AbortSignal.timeout !== "function") {
    // Se rellena un hueco del entorno de pruebas, no de la implementación.
    (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout = () =>
      new AbortController().signal;
  }
});

const HASH = "0000000000000000000036cb36bebd2c7a7ebde6a30936be86c645fb86a8fcc6";
/** El bloque real del primer anclaje de Ikán. */
const ALTURA = 964750;
const UNIX = 1788105640;

function fingirRespuestas(mapa: Record<string, { ok?: boolean; texto?: string; json?: unknown }>) {
  return vi.fn(async (url: string | URL) => {
    const clave = String(url);
    const r = mapa[clave];
    if (!r) return { ok: false, status: 404 } as Response;
    return {
      ok: r.ok ?? true,
      status: r.ok === false ? 500 : 200,
      text: async () => r.texto ?? "",
      json: async () => r.json,
    } as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

const M = "https://mempool.space/api";
const B = "https://blockstream.info/api";

describe("consulta al explorador", () => {
  it("devuelve la fecha del bloque en ISO", async () => {
    vi.stubGlobal(
      "fetch",
      fingirRespuestas({
        [`${M}/block-height/${ALTURA}`]: { texto: HASH },
        [`${M}/block/${HASH}`]: { json: { height: ALTURA, timestamp: UNIX } },
      }),
    );
    expect(await new FechaDeBloqueHttp().consultar(ALTURA)).toBe("2026-08-30T16:00:40.000Z");
  });

  it("si el primer explorador no contesta, prueba el segundo", async () => {
    // Dentro de un año cualquiera de los dos puede no existir, y perder la
    // fecha por eso sería tonto.
    vi.stubGlobal(
      "fetch",
      fingirRespuestas({
        [`${B}/block-height/${ALTURA}`]: { texto: HASH },
        [`${B}/block/${HASH}`]: { json: { height: ALTURA, timestamp: UNIX } },
      }),
    );
    expect(await new FechaDeBloqueHttp().consultar(ALTURA)).toBe("2026-08-30T16:00:40.000Z");
  });

  it("si ninguno contesta devuelve null, no lanza", async () => {
    // Que el explorador falle no es un problema del anclaje: la prueba está en
    // el archivo. Si esto lanzara, tumbaría la corrida entera del cron.
    vi.stubGlobal("fetch", fingirRespuestas({}));
    await expect(new FechaDeBloqueHttp().consultar(ALTURA)).resolves.toBeNull();
  });

  it("una red que revienta tampoco lanza", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("DNS caído"); }));
    await expect(new FechaDeBloqueHttp().consultar(ALTURA)).resolves.toBeNull();
  });
});

describe("respuestas que no son lo que dicen ser", () => {
  it("un HTML de error en lugar del hash se descarta", async () => {
    // Un explorador caído devuelve una página, y meterla en la URL siguiente
    // sería pedirle al segundo servicio un bloque llamado "<!DOCTYPE html>".
    vi.stubGlobal(
      "fetch",
      fingirRespuestas({ [`${M}/block-height/${ALTURA}`]: { texto: "<!DOCTYPE html><h1>502" } }),
    );
    expect(await new FechaDeBloqueHttp().consultar(ALTURA)).toBeNull();
  });

  it("un bloque de OTRA altura se descarta", async () => {
    // Si el explorador se equivoca de altura, la fecha sería de otro bloque y
    // nadie lo notaría jamás.
    vi.stubGlobal(
      "fetch",
      fingirRespuestas({
        [`${M}/block-height/${ALTURA}`]: { texto: HASH },
        [`${M}/block/${HASH}`]: { json: { height: ALTURA + 1, timestamp: UNIX } },
      }),
    );
    expect(await new FechaDeBloqueHttp().consultar(ALTURA)).toBeNull();
  });

  it("un timestamp que no es un número se descarta", async () => {
    vi.stubGlobal(
      "fetch",
      fingirRespuestas({
        [`${M}/block-height/${ALTURA}`]: { texto: HASH },
        [`${M}/block/${HASH}`]: { json: { height: ALTURA, timestamp: "ayer" } },
      }),
    );
    expect(await new FechaDeBloqueHttp().consultar(ALTURA)).toBeNull();
  });

  it("un timestamp cero o negativo se descarta", async () => {
    for (const timestamp of [0, -1]) {
      vi.stubGlobal(
        "fetch",
        fingirRespuestas({
          [`${M}/block-height/${ALTURA}`]: { texto: HASH },
          [`${M}/block/${HASH}`]: { json: { height: ALTURA, timestamp } },
        }),
      );
      expect(await new FechaDeBloqueHttp().consultar(ALTURA), String(timestamp)).toBeNull();
    }
  });
});

describe("alturas que no tienen sentido", () => {
  it("no se consulta nada por una altura inválida", async () => {
    const fetchFalso = fingirRespuestas({});
    vi.stubGlobal("fetch", fetchFalso);
    for (const altura of [-1, 1.5, NaN]) {
      expect(await new FechaDeBloqueHttp().consultar(altura)).toBeNull();
    }
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe("el doble para pruebas", () => {
  it("devuelve lo que se le dio, sin tocar la red", async () => {
    expect(await new FechaDeBloqueFija("2026-08-30T16:00:40.000Z").consultar()).toBe(
      "2026-08-30T16:00:40.000Z",
    );
    expect(await new FechaDeBloqueFija(null).consultar()).toBeNull();
  });
});
