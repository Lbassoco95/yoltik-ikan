import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  canonico,
  categoriasDeCoincidencias,
  esFinal,
  estadoDeDidit,
  igualEnTiempoConstante,
  ordenarClaves,
  resumirDecision,
  verificarWebhook,
  VENTANA_SEGUNDOS,
} from "../../supabase/functions/_shared/didit";

const SECRETO = "secreto-de-prueba";
const AHORA = 1_774_970_000;

function firmar(cuerpo: string, secreto = SECRETO): string {
  return createHmac("sha256", secreto).update(canonico(cuerpo), "utf8").digest("hex");
}

const CUERPO = JSON.stringify({
  event_id: "e1",
  webhook_type: "status.updated",
  session_id: "s1",
  status: "Approved",
  vendor_data: "cliente-1",
});

describe("canónico de la firma", () => {
  it("ordena las claves en profundidad", () => {
    // toEqual no compara el ORDEN de las claves, así que la comprobación de
    // verdad es sobre el texto serializado: es lo que se firma.
    expect(JSON.stringify(ordenarClaves({ b: 1, a: 2 }))).toBe('{"a":2,"b":1}');
    expect(JSON.stringify(ordenarClaves({ b: 1, a: { d: 2, c: 3 } }))).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("respeta el orden de los arreglos: ahí la posición significa algo", () => {
    expect(ordenarClaves([{ b: 1 }, { a: 2 }])).toEqual([{ b: 1 }, { a: 2 }]);
  });

  it("dos cuerpos con las mismas claves en distinto orden firman igual", () => {
    const a = '{"z":1,"a":{"y":2,"b":3}}';
    const b = '{"a":{"b":3,"y":2},"z":1}';
    expect(canonico(a)).toBe(canonico(b));
  });
});

describe("verificación del webhook", () => {
  it("acepta una entrega auténtica y reciente", async () => {
    const r = await verificarWebhook(CUERPO, firmar(CUERPO), String(AHORA), SECRETO, AHORA);
    expect(r.ok).toBe(true);
  });

  it("acepta aunque el JSON llegue reordenado por un middleware", async () => {
    // Es la razón de ser de X-Signature-V2: la firma sobrevive a que algo
    // vuelva a serializar el cuerpo por el camino.
    const firma = firmar(CUERPO);
    const reordenado = JSON.stringify(JSON.parse(CUERPO), Object.keys(JSON.parse(CUERPO)).reverse());
    const r = await verificarWebhook(reordenado, firma, String(AHORA), SECRETO, AHORA);
    expect(r.ok).toBe(true);
  });

  it("RECHAZA una firma que no corresponde", async () => {
    const r = await verificarWebhook(CUERPO, firmar(CUERPO, "otro-secreto"), String(AHORA), SECRETO, AHORA);
    expect(r).toEqual({ ok: false, motivo: "firma_invalida" });
  });

  it("RECHAZA un cuerpo alterado aunque la firma sea de Didit", async () => {
    // El ataque que importa: alguien intercepta una entrega real y le cambia
    // el estado a Approved.
    const firma = firmar(CUERPO);
    const alterado = CUERPO.replace('"Approved"', '"Declined"');
    const r = await verificarWebhook(alterado, firma, String(AHORA), SECRETO, AHORA);
    expect(r).toEqual({ ok: false, motivo: "firma_invalida" });
  });

  it("RECHAZA una entrega vieja: es la protección contra reenvíos", async () => {
    const r = await verificarWebhook(
      CUERPO, firmar(CUERPO), String(AHORA - VENTANA_SEGUNDOS - 1), SECRETO, AHORA);
    expect(r).toEqual({ ok: false, motivo: "caducada" });
  });

  it("RECHAZA una entrega del futuro, no sólo del pasado", async () => {
    const r = await verificarWebhook(
      CUERPO, firmar(CUERPO), String(AHORA + VENTANA_SEGUNDOS + 1), SECRETO, AHORA);
    expect(r).toEqual({ ok: false, motivo: "caducada" });
  });

  it("RECHAZA sin firma y sin fecha, con motivos distintos", async () => {
    expect(await verificarWebhook(CUERPO, null, String(AHORA), SECRETO, AHORA))
      .toEqual({ ok: false, motivo: "sin_firma" });
    expect(await verificarWebhook(CUERPO, firmar(CUERPO), null, SECRETO, AHORA))
      .toEqual({ ok: false, motivo: "sin_fecha" });
    expect(await verificarWebhook(CUERPO, firmar(CUERPO), "no-es-un-numero", SECRETO, AHORA))
      .toEqual({ ok: false, motivo: "sin_fecha" });
  });

  it("no revienta con un cuerpo que no es JSON", async () => {
    const r = await verificarWebhook("{roto", "abc", String(AHORA), SECRETO, AHORA);
    expect(r).toEqual({ ok: false, motivo: "cuerpo_ilegible" });
  });

  it("la comparación no delata cuántos caracteres se acertaron", () => {
    expect(igualEnTiempoConstante("abc", "abc")).toBe(true);
    expect(igualEnTiempoConstante("abc", "abd")).toBe(false);
    expect(igualEnTiempoConstante("abc", "ab")).toBe(false);
  });
});

describe("estados", () => {
  it("traduce los que conocemos", () => {
    expect(estadoDeDidit("Approved")).toBe("aprobada");
    expect(estadoDeDidit("Declined")).toBe("rechazada");
    expect(estadoDeDidit("In Review")).toBe("en_revision");
    expect(estadoDeDidit("Kyc Expired")).toBe("expirada");
  });

  it("un estado desconocido NO se da por bueno", () => {
    // Si Didit añade un estado mañana, lo peor que puede pasar es que una
    // verificación se vea pendiente de más. Nunca aprobada de más.
    expect(estadoDeDidit("Algo Nuevo")).toBe("en_progreso");
    expect(estadoDeDidit("")).toBe("en_progreso");
  });

  it("distingue lo que ya no va a cambiar solo", () => {
    expect(esFinal("aprobada")).toBe(true);
    expect(esFinal("rechazada")).toBe(true);
    expect(esFinal("en_progreso")).toBe(false);
    expect(esFinal("en_revision")).toBe(false);
  });
});

describe("resumen de la decisión", () => {
  const decision = {
    id_verifications: [{
      document_type: "PASSPORT", issuing_state: "MEX",
      first_name: "Juan", last_name: "Pérez",
      document_number: "G12345678", date_of_birth: "1980-01-01",
      expiration_date: "2030-01-01", warnings: [{ risk: "x" }],
      front_image: "data:image/jpeg;base64,AAAA",
    }],
    liveness_checks: [{ status: "Approved", score: 92, reference_image: "https://…/foto.jpg", video_url: "https://…/v.mp4" }],
    face_matches: [{ status: "Approved", score: 88, source_image: "https://…/a.jpg" }],
    aml_screenings: [{ status: "Approved", total_hits: 0, hits: [{ nombre: "alguien" }] }],
  };

  it("guarda lo que hace falta para operar", () => {
    const r = resumirDecision(decision) as Record<string, Record<string, unknown>>;
    expect(r.documento.tipo).toBe("PASSPORT");
    expect(r.documento.nombre_leido).toBe("Juan Pérez");
    expect(r.prueba_de_vida.puntaje).toBe(92);
    expect(r.cotejo_facial.puntaje).toBe(88);
    expect(r.listas.coincidencias).toBe(0);
  });

  it("NO copia biometría ni imágenes: es la prueba que importa", () => {
    // Diez años de conservación. Lo que se guarde hoy, se guarda una década.
    const texto = JSON.stringify(resumirDecision(decision));
    for (const rastro of ["base64", "image", "video", "foto.jpg", "v.mp4", "front_image"]) {
      expect(texto).not.toContain(rastro);
    }
  });

  it("NO copia el número de documento ni la fecha de nacimiento", () => {
    const texto = JSON.stringify(resumirDecision(decision));
    expect(texto).not.toContain("G12345678");
    expect(texto).not.toContain("1980-01-01");
  });

  it("no revienta con una decisión vacía o ausente", () => {
    expect(resumirDecision(null)).toEqual({});
    expect(resumirDecision({})).toEqual({});
    expect(resumirDecision({ id_verifications: [] })).toEqual({});
  });
});

describe('el screening distingue qué tipo de coincidencia hubo', () => {
  // «Hubo una coincidencia de tipo PPE» dice algo sobre NUESTRO cliente y el
  // expediente lo necesita. «Coincidió con Fulano de Tal» es información de
  // otra persona y se queda en el proveedor. Ésa es la línea.
  it('sin coincidencias no hay categorías', () => {
    expect(categoriasDeCoincidencias({ total_hits: 0 })).toEqual([]);
  });

  it('reconoce PPE y sanción como cosas distintas', () => {
    // La primera puede impedir operar y la segunda pide diligencia reforzada.
    // Verlas iguales era el defecto.
    expect(
      categoriasDeCoincidencias({ total_hits: 1, hits: [{ category: 'PEP' }] }),
    ).toEqual(['pep']);
    expect(
      categoriasDeCoincidencias({ total_hits: 1, hits: [{ category: 'Sanctions' }] }),
    ).toEqual(['sancion']);
  });

  it('lee el campo de la coincidencia esté donde esté', () => {
    // La forma del payload de Didit puede cambiar y no está fijada por contrato
    // con nosotros; se lee a la defensiva.
    for (const clave of ['hits', 'matches', 'results', 'screening_results']) {
      const aml = { total_hits: 1, [clave]: [{ type: 'political exposure' }] };
      expect(categoriasDeCoincidencias(aml)).toEqual(['pep']);
    }
  });

  it('una coincidencia sin categoría reconocible NO se da por benigna', () => {
    // Suponer ahí convertiría un hallazgo sin revisar en un «no es PPE»
    // silencioso, que es lo que una verificación desarma primero.
    expect(categoriasDeCoincidencias({ total_hits: 3 })).toEqual(['sin_clasificar']);
    expect(
      categoriasDeCoincidencias({ total_hits: 1, hits: [{ nombre: 'x' }] }),
    ).toEqual(['sin_clasificar']);
    expect(
      categoriasDeCoincidencias({ total_hits: 1, hits: [{ category: 'algo raro' }] }),
    ).toEqual(['sin_clasificar']);
  });

  it('junta varias categorías sin repetir', () => {
    const r = categoriasDeCoincidencias({
      total_hits: 3,
      hits: [{ category: 'PEP' }, { category: 'Sanctions' }, { category: 'pep' }],
    });
    expect(r).toEqual(['pep', 'sancion']);
  });
});

describe('el resumen guarda el tipo de coincidencia, no con quién', () => {
  it('el resumen del screening trae categorías y conteo', () => {
    const r = resumirDecision({
      aml_screenings: [{ status: 'Approved', total_hits: 2, hits: [{ category: 'PEP' }] }],
    });
    const listas = r.listas as Record<string, unknown>;
    expect(listas.coincidencias).toBe(2);
    expect(listas.categorias).toEqual(['pep']);
  });

  it('no copia los datos de la persona con la que coincidió', () => {
    const r = resumirDecision({
      aml_screenings: [{
        status: 'Approved', total_hits: 1,
        hits: [{ category: 'PEP', full_name: 'Fulano de Tal', date_of_birth: '1970-01-01' }],
      }],
    });
    const texto = JSON.stringify(r);
    expect(texto).not.toContain('Fulano');
    expect(texto).not.toContain('1970-01-01');
  });
});

describe('señales de canal (módulo IP_ANALYSIS)', () => {
  // Recortado del payload REAL de una sesión de producción, con los valores
  // sensibles cambiados. Los nombres de campo son los que devuelve Didit.
  const conCanal = {
    ip_analyses: [
      {
        status: 'Approved',
        ip_country: 'Mexico',
        ip_country_code: 'MX',
        ip_state: 'Ciudad de Mexico',
        ip_city: 'Cuauhtémoc',
        latitude: 19.42,
        longitude: -99.166,
        ip_address: '203.0.113.7',
        isp: 'Proveedor de ejemplo',
        is_vpn_or_tor: false,
        is_data_center: false,
        time_zone: 'America/Mexico_City',
        device_fingerprint: 'huella-de-ejemplo',
        user_agent: 'Mozilla/5.0 (iPhone)',
        ip: {
          location: { latitude: 19.42, longitude: -99.166 },
          distance_from_id_document: { distance: 8.84, direction: 'SW' },
          distance_from_poa_document: null,
        },
        id_document: { location: { latitude: 19.366, longitude: -99.228 } },
      },
    ],
  };

  it('guarda el país y las banderas de red', () => {
    const r = resumirDecision(conCanal) as Record<string, Record<string, unknown>>;
    expect(r.canal.pais).toBe('Mexico');
    expect(r.canal.pais_iso2).toBe('MX');
    expect(r.canal.vpn_o_tor).toBe(false);
    expect(r.canal.centro_de_datos).toBe(false);
  });

  it('guarda la DIVERGENCIA contra el documento, que es donde está la señal', () => {
    // Que coincidan no dice gran cosa; que no coincidan es una señal barata y
    // limpia. Y es un escalar derivado, no un punto en el mapa.
    const r = resumirDecision(conCanal) as Record<string, Record<string, unknown>>;
    expect(r.canal.divergencia_documento_km).toBe(8.84);
    expect(r.canal.divergencia_documento_rumbo).toBe('SW');
  });

  it('NO guarda coordenadas, dirección de red ni huella de dispositivo', () => {
    // Adenda 5 y Adenda 6 §5: país y banderas de red sí; dirección completa y
    // coordenadas no. Es la prueba que impide que esto se relaje sin querer.
    const texto = JSON.stringify(resumirDecision(conCanal));
    expect(texto).not.toContain('19.42');
    expect(texto).not.toContain('-99.166');
    expect(texto).not.toContain('203.0.113.7');
    expect(texto).not.toContain('huella-de-ejemplo');
    expect(texto).not.toContain('Mozilla');
    expect(texto).not.toContain('Cuauhtémoc');
  });

  it('sin bandera devuelta, null y no false', () => {
    // «No se detectó VPN» y «no se miró» son afirmaciones distintas, y sólo una
    // se puede sostener. Es el mismo modo de falla que el nulo silencioso.
    const r = resumirDecision({
      ip_analyses: [{ ip_country: 'Mexico', ip_country_code: 'MX' }],
    }) as Record<string, Record<string, unknown>>;
    expect(r.canal.vpn_o_tor).toBeNull();
    expect(r.canal.centro_de_datos).toBeNull();
  });

  it('sin el módulo, no hay bloque de canal', () => {
    const r = resumirDecision({ ip_analyses: null }) as Record<string, unknown>;
    expect(r.canal).toBeUndefined();
  });

  it('aml_screenings en null no inventa un barrido', () => {
    // Es el caso REAL de la primera verificación de producción: el módulo AML
    // no estaba encendido en el workflow y la decisión trae null. Un «sin
    // coincidencias» aquí sería afirmar que se barrió cuando no se barrió.
    const r = resumirDecision({ aml_screenings: null }) as Record<string, unknown>;
    expect(r.listas).toBeUndefined();
  });
});
