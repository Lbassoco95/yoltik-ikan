import { describe, it, expect } from "vitest";
import { CAMPOS_FEP } from "@/lib/aviso/campos-fep.generated";
import {
  ramaDelActo,
  camposObligatorios,
  camposPlanos,
  controlDe,
  type NodoRama,
} from "@/lib/aviso/ramas-acto";

/** Los diez actos del layout de fe pública, en el orden del instructivo. */
const ACTOS = [
  "otorgamiento_poder",
  "constitucion_personas_morales",
  "modificacion_patrimonial",
  "fusion",
  "escision",
  "compra_venta_acciones",
  "constitucion_modificacion_fideicomiso",
  "cesion_derechos_fideicomitente_fideicomisario",
  "contrato_mutuo_credito",
  "avaluo",
];

function recorrer(nodo: NodoRama, visita: (n: NodoRama) => void) {
  visita(nodo);
  nodo.hijos.forEach((h) => recorrer(h, visita));
}

describe("ramaDelActo", () => {
  it("arma una rama para cada uno de los diez actos del layout", () => {
    for (const acto of ACTOS) {
      const rama = ramaDelActo(acto);
      expect(rama, acto).not.toBeNull();
      expect(camposPlanos(rama!).length, acto).toBeGreaterThan(0);
    }
  });

  it("devuelve null para un acto que no está en este layout", () => {
    // La transmisión de inmuebles se presenta por DeclaraNOT, no por el
    // layout de fe pública: no debe inventarse una rama para ella.
    expect(ramaDelActo("transmision_inmueble")).toBeNull();
    expect(ramaDelActo("")).toBeNull();
  });

  it("no pierde ningún campo del diccionario al armar el árbol", () => {
    for (const acto of ACTOS) {
      const rama = ramaDelActo(acto)!;
      // Todo lo que cuelga del número de la rama y no es contenedor
      // tiene que aparecer aplanado, ni de más ni de menos.
      const enDiccionario = CAMPOS_FEP.filter(
        (c) => c.no.startsWith(rama.no + ".") && c.tipo !== "Etiqueta",
      );
      const enArbol = camposPlanos(rama);
      expect(enArbol.map((c) => c.no).sort(), acto).toEqual(
        enDiccionario.map((c) => c.no).sort(),
      );
    }
  });

  it("no cuelga un campo de la rama equivocada", () => {
    for (const acto of ACTOS) {
      const rama = ramaDelActo(acto)!;
      recorrer(rama, (nodo) => {
        for (const campo of nodo.campos) {
          expect(campo.no.startsWith(nodo.no + "."), `${campo.no} bajo ${nodo.no}`).toBe(true);
        }
        for (const hijo of nodo.hijos) {
          expect(hijo.no.startsWith(nodo.no + "."), `${hijo.no} bajo ${nodo.no}`).toBe(true);
        }
      });
    }
  });
});

describe("estructura del otorgamiento de poder", () => {
  const rama = ramaDelActo("otorgamiento_poder")!;

  it("tiene poderdantes y apoderados, ambos repetibles", () => {
    expect(rama.hijos.map((h) => h.etiqueta)).toEqual(["datos_poderdante", "datos_apoderado"]);
    expect(rama.hijos.every((h) => h.repetible)).toBe(true);
  });

  it("el apoderado trae tipo_poder como campo propio, además del tipo de persona", () => {
    const apoderado = rama.hijos.find((h) => h.etiqueta === "datos_apoderado")!;
    expect(apoderado.campos.map((c) => c.etiqueta)).toEqual(["tipo_poder"]);
    expect(apoderado.hijos.map((h) => h.etiqueta)).toEqual(["tipo_persona"]);
  });

  it("marca los nodos tipo_persona y no los demás", () => {
    const marcados: string[] = [];
    recorrer(rama, (n) => {
      if (n.esTipoPersona) marcados.push(n.no);
    });
    expect(marcados).toEqual(["3.6.1.3.1.1.1", "3.6.1.3.1.2.2"]);
  });

  it("cada tipo_persona tiene exactamente las tres variantes", () => {
    recorrer(rama, (n) => {
      if (!n.esTipoPersona) return;
      expect(n.hijos.map((h) => h.etiqueta)).toEqual([
        "persona_fisica",
        "persona_moral",
        "fideicomiso",
      ]);
    });
  });

  it("los campos de persona física cambian según el interviniente", () => {
    // El poderdante declara actividad económica; el apoderado no. Por eso la
    // captura se arma desde el diccionario y no desde una lista fija.
    const variante = (noTipoPersona: string) => {
      let encontrada: NodoRama | null = null;
      recorrer(rama, (n) => {
        if (n.no === noTipoPersona) {
          encontrada = n.hijos.find((h) => h.etiqueta === "persona_fisica")!;
        }
      });
      return encontrada!;
    };
    const poderdante = variante("3.6.1.3.1.1.1");
    const apoderado = variante("3.6.1.3.1.2.2");
    expect(poderdante.campos.map((c) => c.etiqueta)).toContain("actividad_economica");
    expect(apoderado.campos.map((c) => c.etiqueta)).not.toContain("actividad_economica");
  });
});

describe("repetibles", () => {
  it("los grupos de intervinientes que se repiten están marcados", () => {
    const repetibles = new Set<string>();
    for (const acto of ACTOS) {
      recorrer(ramaDelActo(acto)!, (n) => {
        if (n.repetible) repetibles.add(n.etiqueta);
      });
    }
    // Un poder puede tener varios apoderados; una constitución, varios socios;
    // una compraventa, varios vendedores y compradores.
    for (const etiqueta of [
      "datos_poderdante",
      "datos_apoderado",
      "datos_accionista",
      "datos_vendedor",
      "datos_comprador",
    ]) {
      expect(repetibles.has(etiqueta), etiqueta).toBe(true);
    }
  });

  it("la raíz de un acto nunca es repetible", () => {
    for (const acto of ACTOS) {
      expect(ramaDelActo(acto)!.repetible, acto).toBe(false);
    }
  });
});

describe("camposObligatorios", () => {
  it("cuenta los obligatorios de toda la rama, no sólo los del nodo", () => {
    const rama = ramaDelActo("otorgamiento_poder")!;
    const planos = camposPlanos(rama).filter((c) => c.obligatorio).length;
    expect(camposObligatorios(rama)).toBe(planos);
    expect(camposObligatorios(rama)).toBeGreaterThan(rama.campos.length);
  });
});

describe("controlDe", () => {
  const campo = (no: string) => CAMPOS_FEP.find((c) => c.no === no)!;

  it("un campo con catálogo se captura como lista", () => {
    // pais_nacionalidad del poderdante persona física.
    expect(controlDe(campo("3.6.1.3.1.1.1.1.7"))).toBe("catalogo");
  });

  it("un campo con patrón AAAAMMDD es una fecha", () => {
    expect(controlDe(campo("3.6.1.3.1.1.1.1.4"))).toBe("fecha");
  });

  it("un importe con decimales obligatorios es un monto", () => {
    // Número total de acciones de la constitución.
    expect(controlDe(campo("3.6.1.3.2.6"))).toBe("monto");
  });

  it("SI/NO se captura como sí o no", () => {
    expect(controlDe(campo("3.6.1.3.2.8"))).toBe("si_no");
  });

  it("alfanumérico libre es texto", () => {
    expect(controlDe(campo("3.6.1.3.1.1.1.1.1"))).toBe("texto");
    expect(controlDe(campo("3.6.1.3.2.5"))).toBe("texto");
  });

  it("un catálogo gana sobre el tipo de dato", () => {
    // actividad_economica es numérica y además de catálogo: es una lista, no
    // una caja donde el notario teclee siete dígitos de memoria.
    const actividad = campo("3.6.1.3.1.1.1.1.8");
    expect(actividad.tipo).toMatch(/Numérico/);
    expect(controlDe(actividad)).toBe("catalogo");
  });

  it("ningún campo del layout se queda sin control", () => {
    const validos = ["catalogo", "fecha", "monto", "numero", "si_no", "texto"];
    for (const c of CAMPOS_FEP.filter((c) => c.tipo !== "Etiqueta")) {
      expect(validos, c.no).toContain(controlDe(c));
    }
  });
});
