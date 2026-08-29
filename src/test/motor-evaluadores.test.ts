// Tests del núcleo de evaluadores del Motor PLD (RCG0.B0).
// Importa el módulo puro de la Edge Function (sin dependencias de Deno/Supabase).
import { describe, it, expect } from "vitest";
import {
  clasificacionUrgencia,
  HISTORIAL_VACIO,
  type HistorialCliente,
  correrMotor,
  evaluarTipologia,
  ventanaAMs,
  valorEnCampo,
  type Tipologia,
  type OperacionEval,
  type MotorContext,
} from "../../supabase/functions/motor-pld/evaluadores";

// ---------------------------------------------------------------------
// Helpers de fixtures
// ---------------------------------------------------------------------
const ORG = "11111111-1111-1111-1111-111111111111";
const CLIENTE = "55555555-0000-0000-0000-000000000001";
const CLIENTE_B = "55555555-0000-0000-0000-000000000002";

function op(over: Partial<OperacionEval> & { id: string; fecha: string }): OperacionEval {
  return {
    organization_id: ORG,
    client_id: CLIENTE,
    tipo: "compra_fiat_cripto",
    monto_mxn: 1000,
    activo_virtual: "BTC",
    contraparte: null,
    ...over,
  };
}

function ctx(over: Partial<MotorContext> = {}): MotorContext {
  return {
    umaMxn: UMA_PRUEBA,
    ahora: new Date("2026-08-20T12:00:00Z"),
    paisPorFuente: {
      gafi_negra: new Set(["IR", "KP", "MM"]),
      ofac_sancionado: new Set(["CU", "IR", "KP", "SY", "BY", "VE"]),
    },
    perfilMensualUmaPorCliente: {},
    historialPorCliente: {},
    ...over,
  };
}

function tip(codigo: string, regla: Tipologia["regla_dsl"], over: Partial<Tipologia> = {}): Tipologia {
  return {
    id: `tip-${codigo}`,
    codigo,
    nombre: codigo,
    version: 1,
    severidad: "alta",
    activa: true,
    regla_dsl: regla,
    ...over,
  };
}

// 645 UMA en MXN (umbral de identificación).
// Valor de UMA propio de la prueba. A propósito NO se importa el de
// producción: un test que se mueve cuando cambia la UMA no prueba el motor,
// prueba la UMA. El motor recibe el valor por contexto, así que fijarlo aquí
// es lo correcto.
const UMA_PRUEBA = 100;
const UMBRAL_MXN = 645 * UMA_PRUEBA;

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
describe("utilidades", () => {
  it("parsea ventanas h/d/M", () => {
    expect(ventanaAMs("72h")).toBe(72 * 3600_000);
    expect(ventanaAMs("24h")).toBe(24 * 3600_000);
    expect(ventanaAMs("1M")).toBe(30 * 86400_000);
    expect(() => ventanaAMs("bogus")).toThrow();
  });

  it("resuelve campos por ruta con puntos", () => {
    const o = op({ id: "1", fecha: "2026-08-20T00:00:00Z", contraparte: { pais_iso2: "ir" } });
    expect(valorEnCampo(o, "contraparte.pais_iso2")).toBe("ir");
    expect(valorEnCampo(o, "activo_virtual")).toBe("BTC");
    expect(valorEnCampo(o, "contraparte.no_existe")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------
// XVI-01 agregado (structuring)
// ---------------------------------------------------------------------
describe("agregado (XVI-01 structuring)", () => {
  const regla: Tipologia["regla_dsl"] = {
    tipo: "agregado",
    ventana: "72h",
    agrupar_por: "client_id",
    condicion: {
      count: { op: ">=", valor: 3 },
      suma_monto_uma: { op: ">=", valor: 645 },
    },
  };
  const t = tip("XVI-01", regla);

  it("dispara con 3 ops en 72h que suman >= 645 UMA", () => {
    const ops = [
      op({ id: "a", fecha: "2026-08-18T10:00:00Z", monto_mxn: UMBRAL_MXN / 3 }),
      op({ id: "b", fecha: "2026-08-18T15:00:00Z", monto_mxn: UMBRAL_MXN / 3 }),
      op({ id: "c", fecha: "2026-08-19T09:00:00Z", monto_mxn: UMBRAL_MXN / 3 + 1 }),
    ];
    const r = evaluarTipologia(t, ops, ctx());
    expect(r).toHaveLength(1);
    expect(r[0].tipologia_codigo).toBe("XVI-01");
    expect(r[0].operation_id).toBe("c"); // cierra la ventana
  });

  it("no dispara si están fuera de la ventana de 72h", () => {
    const ops = [
      op({ id: "a", fecha: "2026-08-10T10:00:00Z", monto_mxn: UMBRAL_MXN / 3 }),
      op({ id: "b", fecha: "2026-08-15T15:00:00Z", monto_mxn: UMBRAL_MXN / 3 }),
      op({ id: "c", fecha: "2026-08-19T09:00:00Z", monto_mxn: UMBRAL_MXN / 3 }),
    ];
    expect(evaluarTipologia(t, ops, ctx())).toHaveLength(0);
  });

  it("no dispara si la suma no alcanza 645 UMA", () => {
    const ops = [
      op({ id: "a", fecha: "2026-08-18T10:00:00Z", monto_mxn: 1000 }),
      op({ id: "b", fecha: "2026-08-18T15:00:00Z", monto_mxn: 1000 }),
      op({ id: "c", fecha: "2026-08-19T09:00:00Z", monto_mxn: 1000 }),
    ];
    expect(evaluarTipologia(t, ops, ctx())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// XVI-02 secuencia (layering)
// ---------------------------------------------------------------------
describe("secuencia (XVI-02 layering)", () => {
  const regla: Tipologia["regla_dsl"] = {
    tipo: "secuencia",
    ventana: "24h",
    secuencia: ["deposito_fiat", "retiro_cripto"],
    condicion: { razon_retiro_saldo: { op: ">=", valor: 0.9 } },
  };
  const t = tip("XVI-02", regla);

  it("dispara: depósito fiat → retiro cripto >= 90% en 24h", () => {
    const ops = [
      op({ id: "d", tipo: "deposito_fiat", fecha: "2026-08-19T08:00:00Z" }),
      op({
        id: "r",
        tipo: "retiro_cripto",
        fecha: "2026-08-19T20:00:00Z",
        contraparte: { razon_retiro_saldo: 0.95 },
      }),
    ];
    const r = evaluarTipologia(t, ops, ctx());
    expect(r).toHaveLength(1);
    expect(r[0].operation_id).toBe("r");
  });

  it("no dispara si el retiro es < 90% del saldo", () => {
    const ops = [
      op({ id: "d", tipo: "deposito_fiat", fecha: "2026-08-19T08:00:00Z" }),
      op({
        id: "r",
        tipo: "retiro_cripto",
        fecha: "2026-08-19T20:00:00Z",
        contraparte: { razon_retiro_saldo: 0.5 },
      }),
    ];
    expect(evaluarTipologia(t, ops, ctx())).toHaveLength(0);
  });

  it("no dispara si el retiro cae fuera de la ventana de 24h", () => {
    const ops = [
      op({ id: "d", tipo: "deposito_fiat", fecha: "2026-08-18T08:00:00Z" }),
      op({
        id: "r",
        tipo: "retiro_cripto",
        fecha: "2026-08-20T09:00:00Z",
        contraparte: { razon_retiro_saldo: 0.95 },
      }),
    ];
    expect(evaluarTipologia(t, ops, ctx())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// XVI-03 score (exposición on-chain, mock)
// ---------------------------------------------------------------------
describe("score (XVI-03 exposición on-chain)", () => {
  const regla: Tipologia["regla_dsl"] = {
    tipo: "score",
    fuente: "blockchain_analytics_mock",
    condicion: {
      exposicion_pct: { op: ">", valor: 10 },
      categorias: ["mixer", "ofac_sdn", "ransomware", "darknet"],
    },
  };
  const t = tip("XVI-03", regla, { severidad: "critica" });

  it("dispara con exposición > 10% y categoría de riesgo, y marca el mock", () => {
    const ops = [
      op({ id: "x", fecha: "2026-08-19T10:00:00Z", contraparte: { exposicion_pct: 35, categorias: ["mixer"] } }),
    ];
    const r = evaluarTipologia(t, ops, ctx());
    expect(r).toHaveLength(1);
    expect(r[0].regla_payload.fuente_mock).toBe(true);
  });

  it("no dispara si la exposición es baja aunque haya categoría", () => {
    const ops = [
      op({ id: "x", fecha: "2026-08-19T10:00:00Z", contraparte: { exposicion_pct: 3, categorias: ["mixer"] } }),
    ];
    expect(evaluarTipologia(t, ops, ctx())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// XVI-04 / XVI-08 lookup
// ---------------------------------------------------------------------
describe("lookup", () => {
  it("XVI-04: dispara por país en lista (fuentes) e informa la fuente", () => {
    const t = tip("XVI-04", {
      tipo: "lookup",
      campo: "contraparte.pais_iso2",
      fuentes: ["gafi_negra", "gafi_gris", "ofac_sancionado", "onu"],
    });
    const ops = [op({ id: "x", fecha: "2026-08-19T10:00:00Z", contraparte: { pais_iso2: "IR" } })];
    const r = evaluarTipologia(t, ops, ctx());
    expect(r).toHaveLength(1);
    expect(r[0].regla_payload.fuentes).toContain("gafi_negra");
  });

  it("XVI-04: no dispara con país no listado (MX)", () => {
    const t = tip("XVI-04", {
      tipo: "lookup",
      campo: "contraparte.pais_iso2",
      fuentes: ["gafi_negra", "ofac_sancionado"],
    });
    const ops = [op({ id: "x", fecha: "2026-08-19T10:00:00Z", contraparte: { pais_iso2: "MX" } })];
    expect(evaluarTipologia(t, ops, ctx())).toHaveLength(0);
  });

  it("XVI-08: dispara por activo_virtual en lista de valores (privacy coins)", () => {
    const t = tip("XVI-08", { tipo: "lookup", campo: "activo_virtual", valores: ["XMR", "ZEC", "DASH"] }, {
      severidad: "media",
    });
    const ops = [op({ id: "x", fecha: "2026-08-19T10:00:00Z", activo_virtual: "XMR" })];
    expect(evaluarTipologia(t, ops, ctx())).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------
// XVI-05 duplicado (smurfing por dispositivo)
// ---------------------------------------------------------------------
describe("duplicado (XVI-05 smurfing)", () => {
  const t = tip("XVI-05", { tipo: "duplicado", campos: ["device_id", "ip", "biometric_hash"], umbral_cuentas: 2 });

  it("dispara cuando 2 clientes distintos comparten device_id", () => {
    const ops = [
      op({ id: "a", client_id: CLIENTE, fecha: "2026-08-19T10:00:00Z", contraparte: { device_id: "DEV-9" } }),
      op({ id: "b", client_id: CLIENTE_B, fecha: "2026-08-19T11:00:00Z", contraparte: { device_id: "DEV-9" } }),
    ];
    const r = evaluarTipologia(t, ops, ctx());
    expect(r).toHaveLength(2); // ambas operaciones quedan marcadas
    expect((r[0].regla_payload.cuentas as string[]).length).toBe(2);
  });

  it("no dispara si el device_id lo usa un solo cliente", () => {
    const ops = [
      op({ id: "a", client_id: CLIENTE, fecha: "2026-08-19T10:00:00Z", contraparte: { device_id: "DEV-1" } }),
      op({ id: "b", client_id: CLIENTE, fecha: "2026-08-19T11:00:00Z", contraparte: { device_id: "DEV-1" } }),
    ];
    expect(evaluarTipologia(t, ops, ctx())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// XVI-07 desviacion (fuera de perfil)
// ---------------------------------------------------------------------
describe("desviacion · contra el perfil declarado", () => {
  const t = tip("XVI-07", { tipo: "desviacion", factor: 3.0, comparar: "perfil_declarado" });

  it("dispara cuando el volumen del mes supera 3x el perfil declarado", () => {
    const ops = [
      op({ id: "a", fecha: "2026-08-05T10:00:00Z", monto_mxn: 200 * UMA_PRUEBA }),
      op({ id: "b", fecha: "2026-08-15T10:00:00Z", monto_mxn: 200 * UMA_PRUEBA }),
    ];
    const r = evaluarTipologia(t, ops, ctx({ perfilMensualUmaPorCliente: { [CLIENTE]: 100 } }));
    expect(r).toHaveLength(1); // 400 UMA > 3 * 100
    expect(r[0].regla_payload.origen_base).toBe("perfil transaccional declarado");
  });

  it("no dispara sin perfil declarado: sin referencia no se inventa una", () => {
    const ops = [op({ id: "a", fecha: "2026-08-05T10:00:00Z", monto_mxn: 999999 })];
    expect(evaluarTipologia(t, ops, ctx())).toHaveLength(0);
  });
});

describe("desviacion · contra el promedio histórico del propio cliente", () => {
  const t = tip("XVI-07b", {
    tipo: "desviacion", factor: 3.0, comparar: "promedio_historico_mensual",
  });

  it("usa el promedio del cliente, no el perfil declarado", () => {
    const ops = [op({ id: "a", fecha: "2026-08-05T10:00:00Z", monto_mxn: 400 * UMA_PRUEBA })];
    const r = evaluarTipologia(t, ops, ctx({
      // El perfil declarado es alto a propósito: si lo usara, no dispararía.
      perfilMensualUmaPorCliente: { [CLIENTE]: 10000 },
      historialPorCliente: {
        [CLIENTE]: {
          operacionesPrevias: 40, diasDeHistorial: 400, mesesConActividad: 12,
          diasConActividad: 35, clasificacionRiesgo: "bajo",
          tienePerfilDeclarado: true, tieneMatrizEvaluada: true,
          promedioMensualUmaHistorico: 100,
        },
      },
    }));
    expect(r).toHaveLength(1); // 400 UMA > 3 * 100
    expect(r[0].regla_payload.origen_base).toBe("promedio histórico del cliente");
  });

  it("no dispara si el cliente no tiene ningún mes de actividad previa", () => {
    // El caso de fondo: un cliente nuevo no tiene patrón del cual desviarse.
    const ops = [op({ id: "a", fecha: "2026-08-05T10:00:00Z", monto_mxn: 999999 })];
    expect(evaluarTipologia(t, ops, ctx({
      historialPorCliente: { [CLIENTE]: HISTORIAL_VACIO },
    }))).toHaveLength(0);
  });
});

describe("línea base: una regla de comportamiento sobre un cliente nuevo", () => {
  const conMadurez = tip("XVI-07c", {
    tipo: "desviacion", factor: 3.0, comparar: "perfil_declarado",
    min_operaciones: 10, min_meses_historial: 3,
  });

  const historial = (over: Partial<HistorialCliente> = {}): HistorialCliente => ({
    ...HISTORIAL_VACIO, tienePerfilDeclarado: true, ...over,
  });

  it("no dispara si el cliente no alcanza el mínimo de operaciones", () => {
    const ops = [op({ id: "a", fecha: "2026-08-05T10:00:00Z", monto_mxn: 999999 })];
    expect(evaluarTipologia(conMadurez, ops, ctx({
      perfilMensualUmaPorCliente: { [CLIENTE]: 1 },
      historialPorCliente: { [CLIENTE]: historial({ operacionesPrevias: 4, mesesConActividad: 6 }) },
    }))).toHaveLength(0);
  });

  it("no dispara si no alcanza el mínimo de meses, aunque tenga muchas operaciones", () => {
    // Cincuenta operaciones en una semana no son tres meses de patrón.
    const ops = [op({ id: "a", fecha: "2026-08-05T10:00:00Z", monto_mxn: 999999 })];
    expect(evaluarTipologia(conMadurez, ops, ctx({
      perfilMensualUmaPorCliente: { [CLIENTE]: 1 },
      historialPorCliente: { [CLIENTE]: historial({ operacionesPrevias: 50, mesesConActividad: 1 }) },
    }))).toHaveLength(0);
  });

  it("dispara cuando el cliente ya tiene trayectoria suficiente", () => {
    const ops = [op({ id: "a", fecha: "2026-08-05T10:00:00Z", monto_mxn: 999999 })];
    expect(evaluarTipologia(conMadurez, ops, ctx({
      perfilMensualUmaPorCliente: { [CLIENTE]: 1 },
      historialPorCliente: { [CLIENTE]: historial({ operacionesPrevias: 20, mesesConActividad: 6 }) },
    }))).toHaveLength(1);
  });

  it("una regla SIN exigencia de madurez sigue disparando en la primera operación", () => {
    // Los umbrales de ley no dependen de trayectoria: 645 UMA son 645 UMA en
    // la primera operación y en la mil.
    const umbral = tip("XVI-01", {
      tipo: "agregado", ventana: "72h", agrupar_por: "client_id",
      condicion: { suma_monto_uma: { op: ">=", valor: 645 } },
    });
    const ops = [op({ id: "a", fecha: "2026-08-05T10:00:00Z", monto_mxn: 700 * UMA_PRUEBA })];
    expect(evaluarTipologia(umbral, ops, ctx({
      historialPorCliente: { [CLIENTE]: HISTORIAL_VACIO },
    }))).toHaveLength(1);
  });
});

describe("línea base en días · el patrón que se forma en una semana", () => {
  // El caso que motivó el cambio: alguien que otorga varios poderes en días
  // para tomar el control de una sociedad, o que compra joyas cada tres días.
  // Exigir meses de historial vuelve invisible justo ese comportamiento.
  const porDias = tip("XII-PODERES", {
    tipo: "desviacion", factor: 2.0, comparar: "perfil_declarado",
    min_dias_historial: 3,
  });

  const h = (over: Partial<HistorialCliente> = {}): HistorialCliente => ({
    ...HISTORIAL_VACIO, tienePerfilDeclarado: true, ...over,
  });

  it("con tres días de actividad ya hay línea base, sin esperar un mes", () => {
    const ops = [op({ id: "a", fecha: "2026-08-05T10:00:00Z", monto_mxn: 999999 })];
    expect(evaluarTipologia(porDias, ops, ctx({
      perfilMensualUmaPorCliente: { [CLIENTE]: 1 },
      historialPorCliente: { [CLIENTE]: h({ diasConActividad: 3, mesesConActividad: 0 }) },
    }))).toHaveLength(1);
  });

  it("con un solo día todavía no dispara", () => {
    const ops = [op({ id: "a", fecha: "2026-08-05T10:00:00Z", monto_mxn: 999999 })];
    expect(evaluarTipologia(porDias, ops, ctx({
      perfilMensualUmaPorCliente: { [CLIENTE]: 1 },
      historialPorCliente: { [CLIENTE]: h({ diasConActividad: 1 }) },
    }))).toHaveLength(0);
  });
});

describe("contexto del cliente en el hallazgo", () => {
  it("todo hallazgo lleva la trayectoria del cliente al momento de evaluar", () => {
    const umbral = tip("XVI-01", {
      tipo: "agregado", ventana: "72h", agrupar_por: "client_id",
      condicion: { suma_monto_uma: { op: ">=", valor: 645 } },
    });
    const ops = [op({ id: "a", fecha: "2026-08-05T10:00:00Z", monto_mxn: 700 * UMA_PRUEBA })];
    const r = evaluarTipologia(umbral, ops, ctx({
      historialPorCliente: {
        [CLIENTE]: {
          operacionesPrevias: 0, diasDeHistorial: 0, mesesConActividad: 0,
          diasConActividad: 0, clasificacionRiesgo: null,
          tienePerfilDeclarado: false, tieneMatrizEvaluada: false,
          promedioMensualUmaHistorico: 0,
        },
      },
    }));
    const c = r[0].regla_payload.contexto_cliente as Record<string, unknown>;
    // Es lo que le dice al OC que esto nació de una primera operación, no de
    // un patrón que cambió.
    expect(c.sin_linea_base).toBe(true);
    expect(c.operaciones_previas).toBe(0);
    expect(c.matriz_evaluada).toBe(false);
    // La calificación del onboarding viaja en el hallazgo: es la línea base
    // que existe desde el día uno, aunque no haya historial transaccional.
    expect(c).toHaveProperty("clasificacion_riesgo");
  });
});

// ---------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------
describe("correrMotor", () => {
  it("dedup por (operation_id, tipologia_id, version), ignora inactivas y reporta tipos no soportados", () => {
    const activaLookup = tip("XVI-08", { tipo: "lookup", campo: "activo_virtual", valores: ["XMR"] });
    const inactiva = tip("XVI-09", { tipo: "lookup", campo: "activo_virtual", valores: ["XMR"] }, { activa: false });
    // Tipo no soportado (simula una regla futura).
    const rara = tip("XVI-99", { tipo: "raro" } as unknown as Tipologia["regla_dsl"]);
    const ops = [op({ id: "x", fecha: "2026-08-19T10:00:00Z", activo_virtual: "XMR" })];

    const res = correrMotor([activaLookup, inactiva, rara], ops, ctx());
    expect(res.candidatos).toHaveLength(1);
    expect(res.candidatos[0].tipologia_codigo).toBe("XVI-08");
    expect(res.tiposNoSoportados).toContain("XVI-99:raro");
  });

  it("copia regla_dsl.nota a regla_payload.nota_referencia", () => {
    const t = tip(
      "XII-01",
      { tipo: "lookup", campo: "activo_virtual", valores: ["XMR"], nota: "Referencia, sujeta a confirmación" } as unknown as Tipologia["regla_dsl"],
    );
    const ops = [op({ id: "x", fecha: "2026-08-19T10:00:00Z", activo_virtual: "XMR" })];
    const res = correrMotor([t], ops, ctx());
    expect(res.candidatos[0].regla_payload.nota_referencia).toBe("Referencia, sujeta a confirmación");
  });
});

// ---------------------------------------------------------------------
// Clasificación de urgencia (SLA operativo de la bandeja del OC, mig. 0007)
// ---------------------------------------------------------------------
describe("clasificacionUrgencia", () => {
  it("clasifica por_umbral una regla con umbral monetario (XII-01)", () => {
    // Copia literal de la regla sembrada en seed/08_notarias_demo.sql.
    expect(
      clasificacionUrgencia({
        tipo: "agregado",
        ventana: "1M",
        agrupar_por: "client_id",
        condicion: {
          count: { op: ">=", valor: 1 },
          suma_monto_uma: { op: ">=", valor: 16000 },
        },
      }),
    ).toBe("por_umbral");
  });

  it("clasifica 24_horas una regla de aviso siempre (XII-02, poder irrevocable)", () => {
    expect(
      clasificacionUrgencia({
        tipo: "lookup",
        campo: "contraparte.tipo_acto",
        valores: ["otorgamiento_poder"],
      }),
    ).toBe("24_horas");
  });

  it("clasifica 24_horas un lookup por catálogo de países (XII-03)", () => {
    expect(
      clasificacionUrgencia({
        tipo: "lookup",
        campo: "contraparte.pais_iso2",
        fuentes: ["gafi_negra", "ofac_sancionado"],
      }),
    ).toBe("24_horas");
  });

  it("clasifica por_umbral una regla de desviación sobre el perfil declarado", () => {
    expect(
      clasificacionUrgencia({ tipo: "desviacion", factor: 3, comparar: "perfil_mensual_uma" }),
    ).toBe("por_umbral");
  });

  it("clasifica 24_horas un agregado que solo cuenta operaciones (sin umbral de monto)", () => {
    expect(
      clasificacionUrgencia({
        tipo: "agregado",
        ventana: "72h",
        agrupar_por: "client_id",
        condicion: { count_ip_anonima: { op: ">=", valor: 3 } },
      }),
    ).toBe("24_horas");
  });

  it("fail-safe: regla nula o de tipo desconocido cae en 24_horas", () => {
    expect(clasificacionUrgencia(null)).toBe("24_horas");
    expect(
      clasificacionUrgencia({ tipo: "raro" } as unknown as Parameters<typeof clasificacionUrgencia>[0]),
    ).toBe("24_horas");
  });

  it("correrMotor propaga la clasificación al candidato", () => {
    const t = tip("XII-02", {
      tipo: "lookup",
      campo: "activo_virtual",
      valores: ["XMR"],
    });
    const ops = [op({ id: "x", fecha: "2026-08-19T10:00:00Z", activo_virtual: "XMR" })];
    const res = correrMotor([t], ops, ctx());
    expect(res.candidatos[0].clasificacion_urgencia).toBe("24_horas");
  });
});
