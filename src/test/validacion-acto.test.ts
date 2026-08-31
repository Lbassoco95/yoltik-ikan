import { describe, it, expect } from "vitest";
import { CAMPOS_FEP, type CampoFep } from "@/lib/aviso/campos-fep.generated";
import { longitudesDe, validarCampo } from "@/lib/aviso/validacion-acto";

const campo = (no: string): CampoFep => CAMPOS_FEP.find((c) => c.no === no)!;

const RFC_PF = campo("3.6.1.3.1.1.1.1.5"); // poderdante persona física, 13
const RFC_PM = campo("3.6.1.3.1.1.1.2.3"); // poderdante persona moral, 12
const CURP = campo("3.6.1.3.1.1.1.1.6");
const FECHA = campo("3.6.1.3.1.1.1.1.4");
const NOMBRE = campo("3.6.1.3.1.1.1.1.1");
const PAIS = campo("3.6.1.3.1.1.1.1.7");
const ACCIONES = campo("3.6.1.3.2.6"); // 14 dígitos con 2 decimales
const CONSEJO = campo("3.6.1.3.2.8"); // SI/NO

describe("un campo vacío no es un error de formato", () => {
  it("lo que falta lo dice la lista de pendientes, que sabe si es exigible", () => {
    for (const c of [RFC_PF, CURP, FECHA, NOMBRE, PAIS, ACCIONES, CONSEJO]) {
      expect(validarCampo(c, ""), c.no).toBeNull();
      expect(validarCampo(c, "   "), c.no).toBeNull();
      expect(validarCampo(c, null), c.no).toBeNull();
    }
  });
});

describe("RFC", () => {
  it("acepta el de una persona física", () => {
    expect(validarCampo(RFC_PF, "PELJ800502AB1")).toBeNull();
  });

  it("acepta el ampersand y la Ñ, que son letras válidas en un RFC", () => {
    expect(validarCampo(RFC_PM, "BA&900101AB1")).toBeNull();
    expect(validarCampo(RFC_PM, "MUÑ900101AB1")).toBeNull();
  });

  it("rechaza el de doce caracteres en una persona física", () => {
    // Es el error que nadie ve hasta que el portal tira el aviso.
    expect(validarCampo(RFC_PF, "PELJ80050AB1")).toContain("RFC");
  });

  it("dice cuántos caracteres lleva, no recita el patrón", () => {
    // 11, 12 y 13 sobre `longitud: "13"`, que es el caso de la revisión.
    expect(validarCampo(RFC_PF, "PELJ80050AB")).toContain("lleva 11");
    expect(validarCampo(RFC_PF, "PELJ80050AB1")).toContain("lleva 12");
    expect(validarCampo(RFC_PF, "PELJ800502AB1")).toBeNull();
  });

  it("un RFC válido no da error falso aunque el instructivo cambie de forma", () => {
    // La longitud se compara EXACTA. Con la comprobación anterior —buscar un
    // "12" dentro de la cadena— una versión futura del instructivo que
    // declarara "121" o "12-13" habría tratado a este RFC de persona física
    // como si fuera de moral, y habría marcado un error donde no lo hay.
    for (const longitud of ["121", "12-13", "13"]) {
      expect(validarCampo({ ...RFC_PF, longitud }, "PELJ800502AB1"), longitud).toBeNull();
    }
  });

  it("distingue las tres letras de la persona moral de las cuatro de la física", () => {
    expect(validarCampo(RFC_PM, "ABC900101AB1")).toBeNull();
    expect(validarCampo(RFC_PF, "ABC900101AB1")).not.toBeNull();
  });

  it("no se queja por minúsculas ni espacios alrededor", () => {
    expect(validarCampo(RFC_PF, "  pelj800502ab1  ")).toBeNull();
  });
});

describe("CURP", () => {
  it("acepta una bien formada", () => {
    expect(validarCampo(CURP, "PELJ800502HDFRPN09")).toBeNull();
  });

  it("rechaza la que no lleva H ni M en la posición del sexo", () => {
    expect(validarCampo(CURP, "PELJ800502XDFRPN09")).toContain("CURP");
  });

  it("rechaza la de diecisiete caracteres", () => {
    expect(validarCampo(CURP, "PELJ800502HDFRPN0")).not.toBeNull();
  });
});

describe("fechas", () => {
  it("acepta ISO, que es como las guarda la captura", () => {
    expect(validarCampo(FECHA, "1980-05-02")).toBeNull();
  });

  it("acepta AAAAMMDD, que es como las pide el layout", () => {
    expect(validarCampo(FECHA, "19800502")).toBeNull();
  });

  it("rechaza un día que no existe aunque cumpla el patrón", () => {
    expect(validarCampo(FECHA, "2026-02-31")).toContain("no existe");
    expect(validarCampo(FECHA, "2026-13-01")).toContain("no existe");
  });

  it("rechaza lo que no es una fecha", () => {
    expect(validarCampo(FECHA, "ayer")).toContain("AAAA-MM-DD");
  });
});

describe("importes", () => {
  it("acepta un número con o sin separadores de miles", () => {
    expect(validarCampo(ACCIONES, "1000.00")).toBeNull();
    expect(validarCampo(ACCIONES, "1,000,000.50")).toBeNull();
  });

  it("rechaza texto y negativos", () => {
    expect(validarCampo(ACCIONES, "mil")).toContain("importe");
    expect(validarCampo(ACCIONES, "-5")).toContain("negativo");
  });

  it("rechaza más de catorce dígitos enteros", () => {
    expect(validarCampo(ACCIONES, "123456789012345")).toContain("14");
  });
});

describe("SI/NO", () => {
  it("acepta las dos, en cualquier caja", () => {
    expect(validarCampo(CONSEJO, "SI")).toBeNull();
    expect(validarCampo(CONSEJO, "no")).toBeNull();
  });

  it("rechaza cualquier otra cosa", () => {
    expect(validarCampo(CONSEJO, "TAL VEZ")).toContain("SI o NO");
  });
});

describe("longitudes del instructivo", () => {
  it("lee los tres formatos de la columna", () => {
    expect(longitudesDe(RFC_PF)).toEqual({ min: 13, max: 13 });
    expect(longitudesDe(NOMBRE)).toEqual({ min: 1, max: 200 });
    // "1 -254" y "4 - 17" traen espacios sueltos en el original.
    expect(longitudesDe(campo("3.6.1.3.1.1.1.2.1"))).toEqual({ min: 1, max: 254 });
  });

  it("rechaza un texto más largo de lo que admite el layout", () => {
    expect(validarCampo(NOMBRE, "A".repeat(201))).toContain("200");
    expect(validarCampo(NOMBRE, "A".repeat(200))).toBeNull();
  });
});

describe("claves de catálogo", () => {
  it("acepta una clave de dos letras", () => {
    expect(validarCampo(PAIS, "MX")).toBeNull();
  });

  it("rechaza la que trae un espacio: el portal tira el archivo entero", () => {
    expect(validarCampo(PAIS, "M X")).toContain("letras y dígitos");
  });

  it("rechaza la que no cabe en la longitud del layout", () => {
    expect(validarCampo(PAIS, "MEX")).not.toBeNull();
  });
});

describe("ningún campo del layout revienta el validador", () => {
  it("todos devuelven string o null, con valor plausible y con basura", () => {
    for (const c of CAMPOS_FEP.filter((x) => x.tipo !== "Etiqueta")) {
      for (const v of ["", "1", "ABC", "2026-01-01", "!!!", "0".repeat(300)]) {
        const r = validarCampo(c, v);
        expect(r === null || typeof r === "string", `${c.no} con "${v.slice(0, 8)}"`).toBe(true);
      }
    }
  });
});
