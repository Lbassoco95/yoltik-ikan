// Pruebas del árbol Merkle que sostiene el anclaje (RCG0.B8.2).
// Importa el módulo compartido con la Edge Function: una sola aritmética, para
// que la raíz que se publica y la que verifica el navegador no puedan diferir.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  raizMerkle,
  rutaMerkle,
  raizDesdeRuta,
  type PasoMerkle,
} from "../../supabase/functions/_shared/merkle";

const h = (n: number) => createHash("sha256").update(`evento-${n}`).digest("hex");
const hojas = (n: number) => Array.from({ length: n }, (_, i) => h(i));

/** La misma operación, hecha aparte con node:crypto: si las dos coinciden, la
 *  del módulo es la de Bitcoin y no una invención propia. */
const parEsperado = (a: string, b: string) =>
  createHash("sha256")
    .update(Buffer.concat([Buffer.from(a, "hex"), Buffer.from(b, "hex")]))
    .digest("hex");

describe("raizMerkle", () => {
  it("una sola hoja es su propia raíz", async () => {
    expect(await raizMerkle([h(0)])).toBe(h(0));
  });

  it("dos hojas se hashean por sus BYTES, no por su texto", async () => {
    // Hashear el texto hexadecimal daría otra raíz, y ninguna herramienta de
    // fuera podría reproducirla.
    expect(await raizMerkle([h(0), h(1)])).toBe(parEsperado(h(0), h(1)));
  });

  it("cuatro hojas arman dos niveles", async () => {
    const esperada = parEsperado(parEsperado(h(0), h(1)), parEsperado(h(2), h(3)));
    expect(await raizMerkle(hojas(4))).toBe(esperada);
  });

  it("el impar sube tal cual, NO se duplica", async () => {
    // Duplicarlo es CVE-2012-2459: permite dos conjuntos distintos con la
    // misma raíz, y aquí sería poder cambiar qué se certificó.
    const esperada = parEsperado(parEsperado(h(0), h(1)), h(2));
    expect(await raizMerkle(hojas(3))).toBe(esperada);
  });

  it("no acepta un árbol vacío", async () => {
    await expect(raizMerkle([])).rejects.toThrow(/nada que anclar/i);
  });

  it("no acepta algo que no sea hexadecimal", async () => {
    await expect(raizMerkle(["no-es-un-hash", h(1)])).rejects.toThrow(/hexadecimal/i);
  });

  it("no se deja engañar con mayúsculas ni espacios", async () => {
    const conRuido = [` ${h(0).toUpperCase()} `, h(1)];
    expect(await raizMerkle(conRuido)).toBe(await raizMerkle([h(0), h(1)]));
  });

  it("el orden importa: dos historias distintas, dos raíces distintas", async () => {
    const a = await raizMerkle([h(0), h(1), h(2)]);
    const b = await raizMerkle([h(2), h(1), h(0)]);
    expect(a).not.toBe(b);
  });

  it("cambiar una sola hoja cambia la raíz", async () => {
    const antes = await raizMerkle(hojas(8));
    const alteradas = hojas(8);
    alteradas[5] = h(99);
    expect(await raizMerkle(alteradas)).not.toBe(antes);
  });

  it("la raíz es 64 caracteres hexadecimales, sea cual sea el tamaño", async () => {
    for (const n of [1, 2, 3, 5, 8, 13, 100, 257]) {
      expect(await raizMerkle(hojas(n)), `${n} hojas`).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("ruta de prueba", () => {
  it("cada hoja puede demostrar que está en la raíz", async () => {
    // Se prueban tamaños pares, impares y potencias de dos: el nodo que sube
    // solo es justo donde se rompen las implementaciones ingenuas.
    for (const n of [1, 2, 3, 4, 5, 7, 8, 9, 16, 31]) {
      const hs = hojas(n);
      const raiz = await raizMerkle(hs);
      for (let i = 0; i < n; i++) {
        const ruta = await rutaMerkle(hs, i);
        expect(await raizDesdeRuta(hs[i], ruta), `hoja ${i} de ${n}`).toBe(raiz);
      }
    }
  });

  it("una hoja que no estaba no reconstruye la raíz", async () => {
    const hs = hojas(8);
    const raiz = await raizMerkle(hs);
    const ruta = await rutaMerkle(hs, 3);
    expect(await raizDesdeRuta(h(999), ruta)).not.toBe(raiz);
  });

  it("una ruta manipulada no reconstruye la raíz", async () => {
    const hs = hojas(8);
    const raiz = await raizMerkle(hs);
    const ruta = await rutaMerkle(hs, 3);
    const torcida: PasoMerkle[] = ruta.map((p, i) =>
      i === 0 ? { ...p, hermano: h(999) } : p,
    );
    expect(await raizDesdeRuta(hs[3], torcida)).not.toBe(raiz);
  });

  it("invertir el lado de un paso tampoco cuela", async () => {
    const hs = hojas(4);
    const raiz = await raizMerkle(hs);
    const ruta = await rutaMerkle(hs, 1);
    const volteada: PasoMerkle[] = ruta.map((p) => ({
      ...p,
      lado: p.lado === "derecha" ? "izquierda" : "derecha",
    }));
    expect(await raizDesdeRuta(hs[1], volteada)).not.toBe(raiz);
  });

  it("una hoja sola no necesita ruta", async () => {
    expect(await rutaMerkle([h(0)], 0)).toEqual([]);
    expect(await raizDesdeRuta(h(0), [])).toBe(h(0));
  });

  it("pedir una hoja que no existe es un error, no una ruta vacía", async () => {
    await expect(rutaMerkle(hojas(4), 4)).rejects.toThrow(/no existe/i);
    await expect(rutaMerkle(hojas(4), -1)).rejects.toThrow(/no existe/i);
  });

  it("la ruta crece como el logaritmo, no como el número de eventos", async () => {
    // Es la razón de ser del árbol: probar un evento entre mil no cuesta mil.
    const ruta = await rutaMerkle(hojas(1024), 500);
    expect(ruta.length).toBeLessThanOrEqual(10);
  });
});
