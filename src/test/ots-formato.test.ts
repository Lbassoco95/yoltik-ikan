// Lectura y actualización del archivo .ots (RCG0.B8.2).
//
// El armado ya se validó en producción con la herramienta oficial el 30 de
// agosto de 2026. Estas pruebas cubren la otra mitad: LEER el archivo para
// saber qué pedirle al calendario, y sustituir la promesa por la prueba
// completa sin romper nada.
//
// La prueba que más vale es "estructura real de producción": reconstruye byte
// a byte las cuatro ramas que `ots info` imprimió del primer anclaje real, y
// comprueba que el lector las recupera.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  armarOts,
  leerOts,
  sustituirPendientes,
  _internos,
  type Actualizador,
} from "../../supabase/functions/_shared/opentimestamps";
import { actualizarPrueba } from "../../supabase/functions/anclar-bitacora/anclaje";

// ---------------------------------------------------------------------
// Constructores del formato, para armar archivos de prueba a mano
// ---------------------------------------------------------------------

const bytes = (...xs: (number[] | Uint8Array)[]) =>
  _internos.concatenar(...xs.map((x) => (x instanceof Uint8Array ? x : new Uint8Array(x))));

const deHex = (h: string) => new Uint8Array(Buffer.from(h, "hex"));
const varbytes = (b: Uint8Array) => bytes(_internos.varint(b.length), b);

const append = (hex: string) => bytes([0xf0], varbytes(deHex(hex)));
const prepend = (hex: string) => bytes([0xf1], varbytes(deHex(hex)));
const SHA256 = new Uint8Array([0x08]);
const RIPEMD160 = new Uint8Array([0x67]);

const pendiente = (uri: string) =>
  bytes(
    [_internos.ATESTIGUACION],
    _internos.TAG_PENDIENTE,
    varbytes(varbytes(new TextEncoder().encode(uri))),
  );

const enBitcoin = (altura: number) =>
  bytes([_internos.ATESTIGUACION], _internos.TAG_BITCOIN, varbytes(_internos.varint(altura)));

const DIGEST = deHex("61ab5aec00735d8719fb655417a3c8c8e234effd08fb927736aea77367cbf110");

/** El commitment esperado: aplicar las operaciones a mano, con node:crypto. */
function commitmentEsperado(digest: Uint8Array, pasos: (string | "sha256")[]): string {
  let m = Buffer.from(digest);
  for (const paso of pasos) {
    if (paso === "sha256") m = createHash("sha256").update(m).digest();
    else if (paso.startsWith("+")) m = Buffer.concat([m, Buffer.from(paso.slice(1), "hex")]);
    else m = Buffer.concat([Buffer.from(paso.slice(1), "hex"), m]);
  }
  return m.toString("hex");
}

// ---------------------------------------------------------------------

describe("leer un .ots recién armado", () => {
  const rama = bytes(append("aabb"), SHA256, pendiente("https://a.calendario.test"));

  it("recupera el digest anclado", async () => {
    const ots = armarOts(DIGEST, [{ calendario: "a", ok: true, bytes: rama }]);
    const l = await leerOts(ots);
    expect(l.digest).toBe(Buffer.from(DIGEST).toString("hex"));
  });

  it("encuentra la promesa del calendario y calcula qué pedirle", async () => {
    const ots = armarOts(DIGEST, [{ calendario: "a", ok: true, bytes: rama }]);
    const l = await leerOts(ots);
    expect(l.pendientes).toHaveLength(1);
    expect(l.pendientes[0].uri).toBe("https://a.calendario.test");
    expect(l.pendientes[0].commitment).toBe(commitmentEsperado(DIGEST, ["+aabb", "sha256"]));
  });

  it("mientras sea una promesa no hay ningún bloque", async () => {
    const ots = armarOts(DIGEST, [{ calendario: "a", ok: true, bytes: rama }]);
    expect((await leerOts(ots)).bloques).toEqual([]);
  });

  it("lee varias ramas separadas por el byte de bifurcación", async () => {
    const ots = armarOts(DIGEST, [
      { calendario: "a", ok: true, bytes: bytes(append("11"), SHA256, pendiente("https://a.test")) },
      { calendario: "b", ok: true, bytes: bytes(append("22"), SHA256, pendiente("https://b.test")) },
      { calendario: "c", ok: true, bytes: bytes(append("33"), SHA256, pendiente("https://c.test")) },
    ]);
    const l = await leerOts(ots);
    expect(l.pendientes.map((p) => p.uri)).toEqual([
      "https://a.test",
      "https://b.test",
      "https://c.test",
    ]);
  });

  it("cada rama calcula su propio commitment", async () => {
    const ots = armarOts(DIGEST, [
      { calendario: "a", ok: true, bytes: bytes(append("11"), SHA256, pendiente("https://a.test")) },
      { calendario: "b", ok: true, bytes: bytes(append("22"), SHA256, pendiente("https://b.test")) },
    ]);
    const l = await leerOts(ots);
    expect(l.pendientes[0].commitment).toBe(commitmentEsperado(DIGEST, ["+11", "sha256"]));
    expect(l.pendientes[1].commitment).toBe(commitmentEsperado(DIGEST, ["+22", "sha256"]));
    expect(l.pendientes[0].commitment).not.toBe(l.pendientes[1].commitment);
  });
});

describe("estructura real del primer anclaje de producción", () => {
  // Las cuatro ramas exactamente como las imprimió `ots info` el 30/ago/2026
  // sobre el .ots del anclaje de la cadena de plataforma (eventos 1–32354).
  const RAMAS: [string, Uint8Array][] = [
    [
      "https://bob.btc.calendar.opentimestamps.org",
      bytes(
        append("062762a4946c2fd0"), SHA256,
        append("ad084f8d2aa4d64d1118b85a2f5bc9c7"), SHA256,
        append("dd5e792e56d7992519fccd3ad75dc8761d591f06cdc7f04b43615314d72d8411"), SHA256,
        append("cdd09fcc85767ae0b71993d64906442d26c688482d75244a3594c4073f7afb58"), SHA256,
        prepend("6a945150"),
        append("c6948af69d7aca4a"),
      ),
    ],
    [
      "https://finney.calendar.eternitywall.com",
      bytes(
        append("9fedb9307beba7ff4882d94e46f58fb9"), SHA256,
        append("72a4685aa1edae74ff146bb977eeafd2606cf862a52b1a60d9fe2e2099983fe9"), SHA256,
        prepend("e5007ffc1d524070771b6f21cc0177c70b43d259f85e1481302c58c999f4be2a"), SHA256,
        prepend("6a945150"),
        append("4a2edb24a17a4d6b"),
      ),
    ],
    [
      "https://finney.calendar.eternitywall.com",
      bytes(
        append("b83100176a4a1d21ef3dbe4adb1713bf"), SHA256,
        append("e593a2b06187f2b0c0723def9f1fcbcd112b27d334347ce6c4cdb2d091dc8247"), SHA256,
        append("bf5eea1c9170e95181393de77315d7ef9f2f3d4c1087acc891c59f5a90e3b5ff"), SHA256,
        prepend("6a945150"),
        append("4a2edb24a17a4d6b"),
      ),
    ],
    [
      "https://alice.btc.calendar.opentimestamps.org",
      bytes(
        append("e17da83005f7942a"), SHA256,
        append("1b526ea77c84cd583a053292ee2bb4f2"), SHA256,
        prepend("f45117ea1cde0b1d2dac852b578344dabde30d90f2af31cb64fc43b38a8e9d2b"), SHA256,
        prepend("6a945150"),
        append("bb34d5930caafb48"),
      ),
    ],
  ];

  const archivo = armarOts(
    DIGEST,
    RAMAS.map(([uri, ops], i) => ({
      calendario: `c${i}`,
      ok: true,
      bytes: bytes(ops, pendiente(uri)),
    })),
  );

  it("recupera las cuatro ramas con su calendario", async () => {
    const l = await leerOts(archivo);
    expect(l.pendientes.map((p) => p.uri)).toEqual(RAMAS.map(([uri]) => uri));
  });

  it("el digest es la raíz Merkle que se ancló", async () => {
    expect((await leerOts(archivo)).digest).toBe(
      "61ab5aec00735d8719fb655417a3c8c8e234effd08fb927736aea77367cbf110",
    );
  });

  it("calcula un commitment distinto para cada rama, ninguno nulo", async () => {
    const l = await leerOts(archivo);
    const cs = l.pendientes.map((p) => p.commitment);
    // Ojo: el commitment NO es un hash de 32 bytes. Estas cuatro ramas
    // terminan en `prepend`/`append`, así que lo que el calendario conoce es
    // el mensaje concatenado, no su digest. Dar por hecho que son 64
    // caracteres haría fallar la petición contra el calendario real.
    expect(cs.every((c) => typeof c === "string" && /^([0-9a-f]{2})+$/.test(c!))).toBe(true);
    // Tres distintos, no cuatro: las dos ramas de Eternity Wall convergen en
    // el mismo nodo porque `a.pool.eternitywall` y `finney.calendar` son el
    // MISMO calendario. Por eso el actualizador agrupa por (calendario,
    // commitment) antes de pedir nada.
    expect(new Set(cs).size).toBe(3);
    expect(cs[1]).toBe(cs[2]);
  });

  it("el commitment es el mensaje de la rama, no su hash", async () => {
    const l = await leerOts(archivo);
    // 4 bytes del prepend + 32 del sha256 + 8 del append = 44 bytes.
    expect(l.pendientes[0].commitment!.length / 2).toBe(44);
  });

  it("el commitment de la primera rama es el de aplicar sus operaciones", async () => {
    const l = await leerOts(archivo);
    expect(l.pendientes[0].commitment).toBe(
      commitmentEsperado(DIGEST, [
        "+062762a4946c2fd0", "sha256",
        "+ad084f8d2aa4d64d1118b85a2f5bc9c7", "sha256",
        "+dd5e792e56d7992519fccd3ad75dc8761d591f06cdc7f04b43615314d72d8411", "sha256",
        "+cdd09fcc85767ae0b71993d64906442d26c688482d75244a3594c4073f7afb58", "sha256",
        "-6a945150",
        "+c6948af69d7aca4a",
      ]),
    );
  });
});

describe("archivos que no se pueden leer", () => {
  it("una cabecera que no es la del formato se rechaza", async () => {
    await expect(leerOts(new Uint8Array(64))).rejects.toThrow(/no es un archivo \.ots/i);
  });

  it("un archivo truncado se rechaza en vez de devolver medio resultado", async () => {
    const ots = armarOts(DIGEST, [
      { calendario: "a", ok: true, bytes: bytes(append("aabb"), SHA256, pendiente("https://a.test")) },
    ]);
    await expect(leerOts(ots.slice(0, ots.length - 5))).rejects.toThrow(/se corta/i);
  });

  it("una operación desconocida se reporta, no se ignora", async () => {
    const ots = armarOts(DIGEST, [
      { calendario: "a", ok: true, bytes: bytes([0x99], pendiente("https://a.test")) },
    ]);
    await expect(leerOts(ots)).rejects.toThrow(/desconocida/i);
  });

  it("RIPEMD-160 no revienta la lectura: la rama queda sin commitment", async () => {
    // Está en el formato y no está en Web Crypto. Se lee la estructura, pero no
    // se inventa el hash: esa rama simplemente no se actualiza.
    const ots = armarOts(DIGEST, [
      { calendario: "a", ok: true, bytes: bytes(RIPEMD160, pendiente("https://a.test")) },
      { calendario: "b", ok: true, bytes: bytes(append("11"), SHA256, pendiente("https://b.test")) },
    ]);
    const l = await leerOts(ots);
    expect(l.pendientes[0].commitment).toBeNull();
    expect(l.pendientes[1].commitment).not.toBeNull();
  });
});

describe("sustituir la promesa por la prueba", () => {
  const rama = (uri: string, op: string) => bytes(append(op), SHA256, pendiente(uri));

  it("deja el archivo legible y con el mismo digest", async () => {
    const ots = armarOts(DIGEST, [{ calendario: "a", ok: true, bytes: rama("https://a.test", "11") }]);
    const l = await leerOts(ots);
    const nuevo = sustituirPendientes(ots, [
      { desde: l.pendientes[0].desde, hasta: l.pendientes[0].hasta, prueba: enBitcoin(900123) },
    ]);
    const r = await leerOts(nuevo);
    expect(r.digest).toBe(l.digest);
    expect(r.bloques).toEqual([900123]);
    expect(r.pendientes).toEqual([]);
  });

  it("sustituye varias ramas sin descolocar las demás", async () => {
    // Los desplazamientos de las ramas posteriores cambian al tocar una previa:
    // por eso se aplica de atrás hacia adelante.
    const ots = armarOts(DIGEST, [
      { calendario: "a", ok: true, bytes: rama("https://a.test", "11") },
      { calendario: "b", ok: true, bytes: rama("https://b.test", "2222222222") },
      { calendario: "c", ok: true, bytes: rama("https://c.test", "33") },
    ]);
    const l = await leerOts(ots);
    const nuevo = sustituirPendientes(
      ots,
      l.pendientes.map((p, i) => ({
        desde: p.desde,
        hasta: p.hasta,
        prueba: enBitcoin(900000 + i),
      })),
    );
    const r = await leerOts(nuevo);
    expect(r.bloques.sort()).toEqual([900000, 900001, 900002]);
  });

  it("sin reemplazos devuelve el mismo archivo", () => {
    const ots = armarOts(DIGEST, [{ calendario: "a", ok: true, bytes: rama("https://a.test", "11") }]);
    expect(sustituirPendientes(ots, [])).toBe(ots);
  });

  it("un reemplazo fuera del archivo se rechaza", () => {
    const ots = armarOts(DIGEST, [{ calendario: "a", ok: true, bytes: rama("https://a.test", "11") }]);
    expect(() => sustituirPendientes(ots, [{ desde: 0, hasta: 99999, prueba: enBitcoin(1) }])).toThrow(
      /fuera del archivo/i,
    );
  });

  it("dos reemplazos que se pisan se rechazan", () => {
    const ots = armarOts(DIGEST, [{ calendario: "a", ok: true, bytes: rama("https://a.test", "11") }]);
    expect(() =>
      sustituirPendientes(ots, [
        { desde: 40, hasta: 60, prueba: enBitcoin(1) },
        { desde: 50, hasta: 70, prueba: enBitcoin(2) },
      ]),
    ).toThrow(/se pisan/i);
  });
});

describe("actualizarPrueba", () => {
  const rama = (uri: string, op: string) => bytes(append(op), SHA256, pendiente(uri));
  const archivo = () =>
    armarOts(DIGEST, [
      { calendario: "a", ok: true, bytes: rama("https://a.test", "11") },
      { calendario: "b", ok: true, bytes: rama("https://b.test", "22") },
    ]);

  const actualizador = (fn: Actualizador["actualizar"]): Actualizador => ({ actualizar: fn });

  it("un 404 de todos los calendarios deja el anclaje pendiente, sin tocar nada", async () => {
    // Es lo normal las primeras horas: Bitcoin no ha confirmado. No es fallo.
    const r = await actualizarPrueba(archivo(), actualizador(async () => null));
    expect(r.confirmado).toBe(false);
    expect(r.ots).toBeNull();
    expect(r.detalle).toContain("Bitcoin no ha confirmado");
  });

  it("cuando un calendario ya tiene la prueba, el anclaje se confirma con su bloque", async () => {
    const r = await actualizarPrueba(
      archivo(),
      actualizador(async (uri) => (uri === "https://b.test" ? enBitcoin(900123) : null)),
    );
    expect(r.confirmado).toBe(true);
    expect(r.bloque).toBe(900123);
    expect(r.ots).not.toBeNull();
    expect((await leerOts(r.ots!)).digest).toBe(Buffer.from(DIGEST).toString("hex"));
  });

  it("con dos bloques se queda con el más antiguo: es la fecha que se puede defender", async () => {
    const r = await actualizarPrueba(
      archivo(),
      actualizador(async (uri) => enBitcoin(uri === "https://a.test" ? 900500 : 900123)),
    );
    expect(r.bloque).toBe(900123);
  });

  it("una prueba que crece pero no llega a un bloque NO se declara confirmada", async () => {
    // Una promesa más larga sigue siendo una promesa. Decir lo contrario sería
    // justo la exageración que este bloque existe para no cometer.
    const r = await actualizarPrueba(
      archivo(),
      actualizador(async (uri) =>
        uri === "https://a.test" ? bytes(append("99"), SHA256, pendiente("https://a.test")) : null,
      ),
    );
    expect(r.confirmado).toBe(false);
    expect(r.ots).not.toBeNull();
    expect(r.detalle).toContain("todavía no llega a un bloque");
  });

  it("si el calendario devuelve basura, NO se guarda", async () => {
    // Mejor seguir pendiente con una prueba válida que confirmado con una rota.
    const r = await actualizarPrueba(
      archivo(),
      actualizador(async () => new Uint8Array([0x99, 0x99, 0x99])),
    );
    expect(r.ots).toBeNull();
    expect(r.confirmado).toBe(false);
    expect(r.detalle).toContain("no se puede leer");
  });

  it("un calendario que revienta no impide aprovechar al otro", async () => {
    const r = await actualizarPrueba(
      archivo(),
      actualizador(async (uri) => {
        if (uri === "https://a.test") throw new Error("DNS caído");
        return enBitcoin(900123);
      }),
    );
    expect(r.confirmado).toBe(true);
    expect(r.bloque).toBe(900123);
  });

  it("una prueba que ya llegaba a un bloque no vuelve a pedir nada", async () => {
    const yaConfirmado = armarOts(DIGEST, [
      { calendario: "a", ok: true, bytes: bytes(append("11"), SHA256, enBitcoin(880000)) },
    ]);
    let llamadas = 0;
    const r = await actualizarPrueba(
      yaConfirmado,
      actualizador(async () => {
        llamadas++;
        return null;
      }),
    );
    expect(llamadas).toBe(0);
    expect(r.confirmado).toBe(true);
    expect(r.bloque).toBe(880000);
    expect(r.ots).toBeNull();
  });
});

describe("no se le pide dos veces lo mismo al mismo calendario", () => {
  it("dos ramas que convergen se resuelven con una sola petición", async () => {
    // Es el caso real: los dos alias de Eternity Wall son el mismo calendario
    // y sus pruebas se encuentran en el mismo nodo.
    const comun = bytes(append("aa"), SHA256, pendiente("https://mismo.test"));
    const ots = armarOts(DIGEST, [
      { calendario: "a", ok: true, bytes: comun },
      { calendario: "b", ok: true, bytes: comun },
    ]);
    const l = await leerOts(ots);
    expect(l.pendientes).toHaveLength(2);
    expect(l.pendientes[0].commitment).toBe(l.pendientes[1].commitment);

    const pedidos: string[] = [];
    const r = await actualizarPrueba(ots, {
      actualizar: async (uri, commitment) => {
        pedidos.push(`${uri}|${commitment}`);
        return enBitcoin(900123);
      },
    });

    expect(pedidos).toHaveLength(1);
    // Pero LAS DOS ramas quedan sustituidas con esa prueba.
    const r2 = await leerOts(r.ots!);
    expect(r2.pendientes).toEqual([]);
    expect(r2.bloques).toEqual([900123, 900123]);
    expect(r.confirmado).toBe(true);
  });
});
