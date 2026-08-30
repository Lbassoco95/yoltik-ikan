import { describe, it, expect } from "vitest";
import { ramaDelActo, type NodoRama } from "@/lib/aviso/ramas-acto";
import {
  claveDato,
  claveConteo,
  claveVariante,
  partirClave,
  leerValor,
  escribirValor,
  leerVariante,
  escribirVariante,
  numeroRepeticiones,
  agregarRepeticion,
  quitarRepeticion,
  type DatosActo,
} from "@/lib/aviso/valores-acto";

const RFC_APODERADO = "3.6.1.3.1.2.2.1.5";
const NOMBRE_APODERADO = "3.6.1.3.1.2.2.1.1";
const TIPO_PERSONA_APODERADO = "3.6.1.3.1.2.2";
const DATOS_APODERADO = "3.6.1.3.1.2";

function nodo(no: string): NodoRama {
  let encontrado: NodoRama | null = null;
  const buscar = (n: NodoRama) => {
    if (n.no === no) encontrado = n;
    n.hijos.forEach(buscar);
  };
  buscar(ramaDelActo("otorgamiento_poder")!);
  return encontrado!;
}

describe("claves", () => {
  it("sin repeticiones la clave es el número del instructivo", () => {
    expect(claveDato(RFC_APODERADO)).toBe(RFC_APODERADO);
  });

  it("la ruta de repeticiones va después de la arroba", () => {
    expect(claveDato(RFC_APODERADO, [1])).toBe(`${RFC_APODERADO}@1`);
    expect(claveDato("3.6.1.3.6.2.7.2.1.5", [0, 2])).toBe("3.6.1.3.6.2.7.2.1.5@0.2");
  });

  it("los sufijos no chocan con un número del instructivo", () => {
    expect(claveConteo(DATOS_APODERADO)).toBe(`${DATOS_APODERADO}#n`);
    expect(claveVariante(TIPO_PERSONA_APODERADO, [2])).toBe(`${TIPO_PERSONA_APODERADO}@2#tipo`);
  });

  it("partirClave devuelve las tres partes", () => {
    expect(partirClave("3.6.1.3.6.2.7.2.1.5@0.2")).toEqual({
      no: "3.6.1.3.6.2.7.2.1.5",
      ruta: [0, 2],
      sufijo: null,
    });
    expect(partirClave("3.6.1.3.1.2@1#n")).toEqual({
      no: "3.6.1.3.1.2",
      ruta: [1],
      sufijo: "n",
    });
    expect(partirClave(RFC_APODERADO)).toEqual({ no: RFC_APODERADO, ruta: [], sufijo: null });
  });

  it("una clave que no tiene forma de clave no se inventa", () => {
    expect(partirClave("rfc")).toBeNull();
    expect(partirClave("")).toBeNull();
  });
});

describe("leer y escribir un valor", () => {
  it("guarda y recupera por número y ruta", () => {
    let d: DatosActo = {};
    d = escribirValor(d, RFC_APODERADO, [0], "PEMA800101AB1");
    d = escribirValor(d, RFC_APODERADO, [1], "GOLU750315XY2");
    expect(leerValor(d, RFC_APODERADO, [0])).toBe("PEMA800101AB1");
    expect(leerValor(d, RFC_APODERADO, [1])).toBe("GOLU750315XY2");
  });

  it("un campo sin capturar se lee como cadena vacía, no como undefined", () => {
    expect(leerValor({}, RFC_APODERADO)).toBe("");
    expect(leerValor({ [RFC_APODERADO]: null }, RFC_APODERADO)).toBe("");
  });

  it("vaciar un campo borra la clave en vez de guardar cadena vacía", () => {
    let d = escribirValor({}, RFC_APODERADO, [], "PEMA800101AB1");
    d = escribirValor(d, RFC_APODERADO, [], "   ");
    expect(Object.keys(d)).toEqual([]);
  });

  it("no muta el objeto original", () => {
    const original: DatosActo = {};
    escribirValor(original, RFC_APODERADO, [], "X");
    expect(original).toEqual({});
  });
});

describe("variante de tipo_persona", () => {
  const tipoPersona = nodo(TIPO_PERSONA_APODERADO);

  it("empieza sin elegir", () => {
    expect(leerVariante({}, TIPO_PERSONA_APODERADO)).toBeNull();
  });

  it("guarda la elección", () => {
    const d = escribirVariante({}, tipoPersona, [], "persona_moral");
    expect(leerVariante(d, TIPO_PERSONA_APODERADO)).toBe("persona_moral");
  });

  it("cambiar de variante borra lo capturado en la anterior", () => {
    // Un apoderado capturado como persona física que resulta ser moral: el
    // nombre y el CURP no pueden quedarse escondidos en el XML.
    let d = escribirVariante({}, tipoPersona, [], "persona_fisica");
    d = escribirValor(d, NOMBRE_APODERADO, [], "JUAN");
    d = escribirValor(d, RFC_APODERADO, [], "PEMA800101AB1");
    expect(leerValor(d, NOMBRE_APODERADO)).toBe("JUAN");

    d = escribirVariante(d, tipoPersona, [], "persona_moral");
    expect(leerValor(d, NOMBRE_APODERADO)).toBe("");
    expect(leerValor(d, RFC_APODERADO)).toBe("");
    expect(leerVariante(d, TIPO_PERSONA_APODERADO)).toBe("persona_moral");
  });

  it("no toca lo capturado fuera de esa persona", () => {
    const TIPO_PODER = "3.6.1.3.1.2.1";
    let d = escribirValor({}, TIPO_PODER, [], "1");
    d = escribirVariante(d, tipoPersona, [], "persona_fisica");
    d = escribirValor(d, NOMBRE_APODERADO, [], "JUAN");
    d = escribirVariante(d, tipoPersona, [], "fideicomiso");
    expect(leerValor(d, TIPO_PODER)).toBe("1");
  });
});

describe("repeticiones", () => {
  it("un grupo empieza con una repetición, no con cero", () => {
    expect(numeroRepeticiones({}, DATOS_APODERADO)).toBe(1);
  });

  it("un conteo corrupto no rompe la captura", () => {
    expect(numeroRepeticiones({ [claveConteo(DATOS_APODERADO)]: "no" }, DATOS_APODERADO)).toBe(1);
    expect(numeroRepeticiones({ [claveConteo(DATOS_APODERADO)]: 0 }, DATOS_APODERADO)).toBe(1);
    expect(numeroRepeticiones({ [claveConteo(DATOS_APODERADO)]: -3 }, DATOS_APODERADO)).toBe(1);
  });

  it("agregar sube el conteo", () => {
    let d = agregarRepeticion({}, DATOS_APODERADO);
    d = agregarRepeticion(d, DATOS_APODERADO);
    expect(numeroRepeticiones(d, DATOS_APODERADO)).toBe(3);
  });

  it("quitar renumera las siguientes para no dejar huecos", () => {
    let d: DatosActo = {};
    d = agregarRepeticion(d, DATOS_APODERADO);
    d = agregarRepeticion(d, DATOS_APODERADO); // tres apoderados
    d = escribirValor(d, NOMBRE_APODERADO, [0], "ANA");
    d = escribirValor(d, NOMBRE_APODERADO, [1], "BETO");
    d = escribirValor(d, NOMBRE_APODERADO, [2], "CARLA");

    d = quitarRepeticion(d, DATOS_APODERADO, [], 1);

    expect(numeroRepeticiones(d, DATOS_APODERADO)).toBe(2);
    expect(leerValor(d, NOMBRE_APODERADO, [0])).toBe("ANA");
    expect(leerValor(d, NOMBRE_APODERADO, [1])).toBe("CARLA");
    expect(leerValor(d, NOMBRE_APODERADO, [2])).toBe("");
  });

  it("quitar el último no deja huecos ni mueve a los anteriores", () => {
    let d = agregarRepeticion({}, DATOS_APODERADO);
    d = escribirValor(d, NOMBRE_APODERADO, [0], "ANA");
    d = escribirValor(d, NOMBRE_APODERADO, [1], "BETO");
    d = quitarRepeticion(d, DATOS_APODERADO, [], 1);
    expect(leerValor(d, NOMBRE_APODERADO, [0])).toBe("ANA");
    expect(numeroRepeticiones(d, DATOS_APODERADO)).toBe(1);
  });

  it("nunca se queda sin repeticiones", () => {
    const d = escribirValor({}, NOMBRE_APODERADO, [0], "ANA");
    const despues = quitarRepeticion(d, DATOS_APODERADO, [], 0);
    expect(despues).toBe(d);
    expect(numeroRepeticiones(despues, DATOS_APODERADO)).toBe(1);
  });

  it("quitar un apoderado no toca a los poderdantes", () => {
    const NOMBRE_PODERDANTE = "3.6.1.3.1.1.1.1.1";
    const DATOS_PODERDANTE = "3.6.1.3.1.1";
    let d = agregarRepeticion({}, DATOS_APODERADO);
    d = escribirValor(d, NOMBRE_PODERDANTE, [0], "SOCIEDAD X");
    d = escribirValor(d, NOMBRE_APODERADO, [0], "ANA");
    d = escribirValor(d, NOMBRE_APODERADO, [1], "BETO");
    d = quitarRepeticion(d, DATOS_APODERADO, [], 0);
    expect(leerValor(d, NOMBRE_PODERDANTE, [0])).toBe("SOCIEDAD X");
    expect(numeroRepeticiones(d, DATOS_PODERDANTE)).toBe(1);
    expect(leerValor(d, NOMBRE_APODERADO, [0])).toBe("BETO");
  });

  it("se arrastra la variante y el conteo anidado al renumerar", () => {
    // Compraventa: varias personas morales, cada una con sus vendedores.
    const PERSONA_MORAL = "3.6.1.3.6.2";
    const VENDEDOR = "3.6.1.3.6.2.7";
    const TIPO_PERSONA_VENDEDOR = "3.6.1.3.6.2.7.2";
    const NOMBRE_VENDEDOR = "3.6.1.3.6.2.7.2.1.1";

    let d: DatosActo = {};
    d = agregarRepeticion(d, PERSONA_MORAL); // dos personas morales
    d = agregarRepeticion(d, VENDEDOR, [1]); // la segunda con dos vendedores
    d = { ...d, [claveVariante(TIPO_PERSONA_VENDEDOR, [1, 1])]: "persona_fisica" };
    d = escribirValor(d, NOMBRE_VENDEDOR, [1, 1], "CARLA");

    d = quitarRepeticion(d, PERSONA_MORAL, [], 0);

    expect(numeroRepeticiones(d, PERSONA_MORAL)).toBe(1);
    expect(numeroRepeticiones(d, VENDEDOR, [0])).toBe(2);
    expect(leerValor(d, NOMBRE_VENDEDOR, [0, 1])).toBe("CARLA");
    expect(leerVariante(d, TIPO_PERSONA_VENDEDOR, [0, 1])).toBe("persona_fisica");
  });
});
