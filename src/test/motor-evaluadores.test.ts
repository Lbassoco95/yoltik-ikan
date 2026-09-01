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
  ventanaDesde,
  ventanaHasta,
  valorEnCampo,
  type Tipologia,
  type OperacionEval,
  type MotorContext,
  umaEnFecha,
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

// ---------------------------------------------------------------------
// Fracción XII · fe pública, umbrales del régimen vigente (migration 0030)
// ---------------------------------------------------------------------
// Estas pruebas existen por un error que estuvo en producción: el seed sembró
// los umbrales ANTERIORES a la reforma DOF 16/07/2025 —16,000 UMA para
// inmuebles y 8,025 para personas morales— y el motor los aplicó tal cual.
//
// Lo que se demuestra aquí no es que la regla nueva funcione, sino DÓNDE
// estaba el hueco: una transmisión que la regla vieja dejaba pasar y la nueva
// atrapa. Sin la primera prueba, la segunda no dice nada.
describe("fracción XII · umbrales de fe pública", () => {
  // 8,000 UMA es el umbral vigente; 16,000 el del régimen anterior. Una
  // operación de 10,000 UMA cae justo entre los dos: es el rango donde está la
  // mayor parte de la vivienda media del país.
  const EN_EL_HUECO = 10_000 * UMA_PRUEBA;

  const inmueble = (umbral: number): Tipologia["regla_dsl"] => ({
    tipo: "agregado",
    ventana: "6M",
    agrupar_por: "client_id",
    condicion: {
      count: { op: ">=", valor: 1 },
      suma_monto_uma: { op: ">=", valor: umbral },
    },
  });

  const acto = (id: string, tipo_acto: string, monto_mxn: number) =>
    op({ id, fecha: "2026-08-18T10:00:00Z", tipo: "otro", monto_mxn,
         contraparte: { tipo_acto, pais_iso2: "MX" } });

  it("el umbral viejo de 16,000 UMA DEJABA PASAR una transmisión de 10,000 UMA", () => {
    const r = evaluarTipologia(
      tip("XII-01", inmueble(16_000)),
      [acto("a", "transmision_inmueble", EN_EL_HUECO)],
      ctx(),
    );
    expect(r).toHaveLength(0);
  });

  it("con el umbral vigente de 8,000 UMA, esa misma transmisión sí dispara", () => {
    const r = evaluarTipologia(
      tip("XII-01", inmueble(8_000), { version: 2 }),
      [acto("a", "transmision_inmueble", EN_EL_HUECO)],
      ctx(),
    );
    expect(r).toHaveLength(1);
    expect(r[0].tipologia_codigo).toBe("XII-01");
  });

  it("por debajo de 8,000 UMA sigue sin disparar: el umbral bajó, no desapareció", () => {
    const r = evaluarTipologia(
      tip("XII-01", inmueble(8_000), { version: 2 }),
      [acto("a", "transmision_inmueble", 7_999 * UMA_PRUEBA)],
      ctx(),
    );
    expect(r).toHaveLength(0);
  });

  it("acumula seis meses por cliente: dos actos que solos no llegan, juntos sí", () => {
    // Es el penúltimo párrafo del art. 17 y el art. 7 del Reglamento: el Aviso
    // se presenta al realizarse la operación que cruza el umbral, no al cierre
    // del semestre.
    const r = evaluarTipologia(
      tip("XII-01", inmueble(8_000), { version: 2 }),
      [
        op({ id: "a", fecha: "2026-05-02T10:00:00Z", tipo: "otro", monto_mxn: 5_000 * UMA_PRUEBA,
             contraparte: { tipo_acto: "transmision_inmueble", pais_iso2: "MX" } }),
        op({ id: "b", fecha: "2026-08-18T10:00:00Z", tipo: "otro", monto_mxn: 4_000 * UMA_PRUEBA,
             contraparte: { tipo_acto: "transmision_inmueble", pais_iso2: "MX" } }),
      ],
      ctx(),
    );
    expect(r).toHaveLength(1);
    expect(r[0].operation_id).toBe("b"); // la que cruza el umbral
  });

  it("XII-04: la constitución de persona moral avisa SIEMPRE, sin importar el monto", () => {
    // Tras la reforma dejó de tener umbral. Se prueba con un monto ridículo a
    // propósito: si alguien reintroduce una condición de monto, esto falla.
    const r = evaluarTipologia(
      tip("XII-04", { tipo: "lookup", campo: "contraparte.tipo_acto",
                      valores: ["constitucion_personas_morales"] }),
      [acto("a", "constitucion_personas_morales", 1)],
      ctx(),
    );
    expect(r).toHaveLength(1);
  });

  it("XII-05: el fideicomiso dispara desde 4,000 UMA y ya no sólo sobre inmuebles", () => {
    const regla: Tipologia["regla_dsl"] = {
      tipo: "agregado", ventana: "6M", agrupar_por: "client_id",
      condicion: { count: { op: ">=", valor: 1 },
                   suma_monto_uma: { op: ">=", valor: 4_000 } },
    };
    const acto_fid = (monto: number) =>
      acto("a", "constitucion_modificacion_fideicomiso", monto);

    expect(evaluarTipologia(tip("XII-05", regla), [acto_fid(4_000 * UMA_PRUEBA)], ctx())).toHaveLength(1);
    expect(evaluarTipologia(tip("XII-05", regla), [acto_fid(3_999 * UMA_PRUEBA)], ctx())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// Filtro por tipo de acto en las reglas agregadas
// ---------------------------------------------------------------------
// Se cazó el 31/08/2026 con el ensayo en seco del demo de notaría: una
// constitución de sociedad de $1,000,000 estaba disparando XII-01, que se
// llama «Transmisión de inmueble ≥ 8,000 UMA». La regla agregada sumaba TODO
// lo del cliente en la ventana sin mirar de qué acto se trataba.
//
// No es sólo un nombre engañoso: el penúltimo párrafo del art. 17 de la
// LFPIORPI acumula POR TIPO DE ACTO U OPERACIÓN. Sumar tipos distintos produce
// avisos que no proceden.
describe("agregado con filtro por tipo de acto", () => {
  const regla = (filtro?: { campo: string; valores: string[] }): Tipologia["regla_dsl"] => ({
    tipo: "agregado",
    ventana: "6M",
    agrupar_por: "client_id",
    ...(filtro ? { filtro } : {}),
    condicion: {
      count: { op: ">=", valor: 1 },
      suma_monto_uma: { op: ">=", valor: 8_000 },
    },
  });

  const soloInmuebles = { campo: "contraparte.tipo_acto", valores: ["transmision_inmueble"] };

  const actos = [
    op({ id: "soc", fecha: "2026-08-19T10:00:00Z", tipo: "otro", monto_mxn: 8_524 * UMA_PRUEBA,
         contraparte: { tipo_acto: "constitucion_personas_morales", pais_iso2: "MX" } }),
  ];

  it("SIN filtro, una constitución de sociedad dispara una regla de inmuebles", () => {
    // El comportamiento que había. Se deja escrito para que se vea el bug.
    expect(evaluarTipologia(tip("XII-01", regla()), actos, ctx())).toHaveLength(1);
  });

  it("CON filtro, esa misma constitución ya no la dispara", () => {
    expect(evaluarTipologia(tip("XII-01", regla(soloInmuebles)), actos, ctx())).toHaveLength(0);
  });

  it("y la transmisión de inmueble sí sigue disparando", () => {
    const inmueble = [
      op({ id: "inm", fecha: "2026-08-19T10:00:00Z", tipo: "otro", monto_mxn: 8_524 * UMA_PRUEBA,
           contraparte: { tipo_acto: "transmision_inmueble", pais_iso2: "MX" } }),
    ];
    expect(evaluarTipologia(tip("XII-01", regla(soloInmuebles)), inmueble, ctx())).toHaveLength(1);
  });

  it("lo filtrado no suma: dos actos de tipos distintos no se acumulan entre sí", () => {
    // Es la parte legal del asunto. 5,000 + 4,000 UMA cruzan el umbral sólo si
    // se suman, y la ley no permite sumarlos porque son actos de tipo distinto.
    const mezcla = [
      op({ id: "a", fecha: "2026-05-02T10:00:00Z", tipo: "otro", monto_mxn: 5_000 * UMA_PRUEBA,
           contraparte: { tipo_acto: "transmision_inmueble", pais_iso2: "MX" } }),
      op({ id: "b", fecha: "2026-08-18T10:00:00Z", tipo: "otro", monto_mxn: 4_000 * UMA_PRUEBA,
           contraparte: { tipo_acto: "constitucion_modificacion_fideicomiso", pais_iso2: "MX" } }),
    ];
    expect(evaluarTipologia(tip("XII-01", regla(soloInmuebles)), mezcla, ctx())).toHaveLength(0);
  });

  it("pero dos del MISMO tipo sí se acumulan, que es lo que la ley pide", () => {
    const dosInmuebles = [
      op({ id: "a", fecha: "2026-05-02T10:00:00Z", tipo: "otro", monto_mxn: 5_000 * UMA_PRUEBA,
           contraparte: { tipo_acto: "transmision_inmueble", pais_iso2: "MX" } }),
      op({ id: "b", fecha: "2026-08-18T10:00:00Z", tipo: "otro", monto_mxn: 4_000 * UMA_PRUEBA,
           contraparte: { tipo_acto: "transmision_inmueble", pais_iso2: "MX" } }),
    ];
    const r = evaluarTipologia(tip("XII-01", regla(soloInmuebles)), dosInmuebles, ctx());
    expect(r).toHaveLength(1);
    expect(r[0].operation_id).toBe("b");
  });

  it("sin filtro sigue sumando todo: el sector XVI lo necesita así", () => {
    // XVI-01 (estructuración) suma las operaciones del cliente sin distinguir
    // tipo, y ahí ese comportamiento es el correcto. El filtro es opcional
    // justamente para no romperlo.
    const cripto = [
      op({ id: "a", fecha: "2026-08-18T10:00:00Z", monto_mxn: 4_000 * UMA_PRUEBA }),
      op({ id: "b", fecha: "2026-08-18T15:00:00Z", monto_mxn: 4_000 * UMA_PRUEBA }),
    ];
    expect(evaluarTipologia(tip("XVI-01", regla()), cripto, ctx())).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------
// La UMA de la fecha del acto, no la de hoy
// ---------------------------------------------------------------------
// El criterio de cumplimiento del 31/08/2026 lo pide en su punto 1.2: «Valor
// diario de la UMA vigente en la fecha del acto, no en la fecha del Aviso. La
// UMA cambia cada 1 de febrero, de modo que el sistema necesita una tabla
// histórica de valores, no un solo número.»
//
// El motor dividía la suma de la ventana por UN solo valor. Con ventanas de
// seis meses, la mitad del año cruza un 1 de febrero.
describe("UMA por fecha del acto", () => {
  const VIGENCIAS = [
    { desde: "2026-02-01", valor: 117.31 },
    { desde: "2025-02-01", valor: 113.14 },
  ];
  const conHistorico = () => ctx({ umaMxn: 117.31, umaVigencias: VIGENCIAS });

  it("un acto de 2025 se mide con la UMA de 2025", () => {
    expect(umaEnFecha(conHistorico(), "2025-06-15T00:00:00Z")).toBe(113.14);
  });

  it("un acto de 2026 se mide con la UMA de 2026", () => {
    expect(umaEnFecha(conHistorico(), "2026-06-15T00:00:00Z")).toBe(117.31);
  });

  it("el 1 de febrero ya cuenta con la nueva: la vigencia abre ese día", () => {
    expect(umaEnFecha(conHistorico(), "2026-02-01T00:00:00Z")).toBe(117.31);
    expect(umaEnFecha(conHistorico(), "2026-01-31T23:59:59Z")).toBe(113.14);
  });

  it("un acto anterior a todo lo que conocemos usa la más antigua", () => {
    // Mejor eso que dividir por la de hoy, que es la más lejana de la verdad.
    expect(umaEnFecha(conHistorico(), "2019-01-01T00:00:00Z")).toBe(113.14);
  });

  it("sin histórico se comporta como antes", () => {
    expect(umaEnFecha(ctx({ umaMxn: 100 }), "2019-01-01T00:00:00Z")).toBe(100);
  });

  it("una ventana que cruza el 1 de febrero suma cada acto con SU UMA", () => {
    // 1,000,000 en enero de 2026 son 8,838 UMA con la de 2025 (113.14).
    // 1,000,000 en marzo de 2026 son 8,524 UMA con la de 2026 (117.31).
    // Juntos, 17,362 UMA. Dividiendo la suma por la de hoy salían 17,049:
    // 313 UMA de diferencia, y el umbral no se mueve para acomodarse.
    const regla: Tipologia["regla_dsl"] = {
      tipo: "agregado", ventana: "6M", agrupar_por: "client_id",
      condicion: { suma_monto_uma: { op: ">=", valor: 17_200 } },
    };
    const ops = [
      op({ id: "a", fecha: "2026-01-15T10:00:00Z", monto_mxn: 1_000_000 }),
      op({ id: "b", fecha: "2026-03-15T10:00:00Z", monto_mxn: 1_000_000 }),
    ];
    // Con el histórico cruza el umbral…
    expect(evaluarTipologia(tip("X", regla), ops, conHistorico())).toHaveLength(1);
    // …y sin él, con la UMA de hoy para todo, no lo cruza.
    expect(evaluarTipologia(tip("X", regla), ops, ctx({ umaMxn: 117.31 }))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// Fracción XVI · contraprestación cobrada (inciso b)
// ---------------------------------------------------------------------
describe("umbral sobre la contraprestación", () => {
  const regla: Tipologia["regla_dsl"] = {
    tipo: "agregado", ventana: "6M", agrupar_por: "client_id",
    condicion: { contraprestacion_uma: { op: ">=", valor: 4 } },
  };

  it("se mide sobre la comisión, no sobre el monto de la operación", () => {
    // Un millón de pesos movidos con comisión de $100: la operación es enorme
    // y la comisión no llega a 4 UMA. El inciso b) mira la comisión.
    const chica = [op({ id: "a", fecha: "2026-08-18T10:00:00Z", monto_mxn: 1_000_000, contraprestacion_mxn: 100 })];
    expect(evaluarTipologia(tip("XVI-09", regla), chica, ctx({ umaMxn: 117.31 }))).toHaveLength(0);

    // 4 UMA con la de 2026 son $469.24.
    const justa = [op({ id: "b", fecha: "2026-08-18T10:00:00Z", monto_mxn: 5_000, contraprestacion_mxn: 470 })];
    expect(evaluarTipologia(tip("XVI-09", regla), justa, ctx({ umaMxn: 117.31 }))).toHaveLength(1);
  });

  it("una operación sin comisión capturada no dispara", () => {
    // Null no es cero pesos de comisión: es que no se capturó. Tratarlo como
    // cero es lo conservador aquí, porque lo contrario inventaría avisos.
    const ops = [op({ id: "a", fecha: "2026-08-18T10:00:00Z", monto_mxn: 1_000_000 })];
    expect(evaluarTipologia(tip("XVI-09", regla), ops, ctx({ umaMxn: 117.31 }))).toHaveLength(0);
  });

  it("la contraprestación se acumula entre operaciones del cliente", () => {
    const ops = [
      op({ id: "a", fecha: "2026-07-01T10:00:00Z", monto_mxn: 1_000, contraprestacion_mxn: 250 }),
      op({ id: "b", fecha: "2026-08-01T10:00:00Z", monto_mxn: 1_000, contraprestacion_mxn: 250 }),
    ];
    const r = evaluarTipologia(tip("XVI-09", regla), ops, ctx({ umaMxn: 117.31 }));
    expect(r).toHaveLength(1);
    expect(r[0].operation_id).toBe("b");
  });
});

describe('una regla agregada nombra TODAS las operaciones de su ventana', () => {
  // El motor marca `requiere_aviso` desde los candidatos, y un recorrido
  // completo además DESMARCA lo que no salga marcado. Si el candidato sólo
  // nombrara la operación que cierra la ventana, las demás del mismo hecho
  // quedarían fuera del aviso —y activamente desmarcadas—, aunque la
  // obligación haya nacido de la suma de todas.
  const UMBRAL = tip('XII-05', {
    tipo: 'agregado',
    ventana: '6M',
    agrupar_por: 'client_id',
    condicion: { count: { op: '>=', valor: 1 }, suma_monto_uma: { op: '>=', valor: 4000 } },
  });

  it('el payload trae las operaciones que suman, no sólo la última', () => {
    // Dos actos que por separado no alcanzan y juntos sí.
    const ops = [
      op({ id: 'a', fecha: '2026-08-10T12:00:00Z', monto_mxn: 3000 * UMA_PRUEBA }),
      op({ id: 'b', fecha: '2026-08-15T12:00:00Z', monto_mxn: 3000 * UMA_PRUEBA }),
    ];
    const c = evaluarTipologia(UMBRAL, ops, ctx());
    expect(c).toHaveLength(1);

    const dentro = (c[0].regla_payload as { operaciones?: string[] }).operaciones;
    expect(dentro).toEqual(['a', 'b']);
    // Y la que ancla el hallazgo es una de ellas, no una tercera.
    expect(dentro).toContain(c[0].operation_id);
  });

  it('el conjunto que hay que marcar sale del ancla más el payload', () => {
    // Es exactamente lo que hace el motor al construir `opsAviso`. Se prueba
    // aquí porque index.ts depende de Deno y no se puede importar.
    const ops = [
      op({ id: 'a', fecha: '2026-08-10T12:00:00Z', monto_mxn: 3000 * UMA_PRUEBA }),
      op({ id: 'b', fecha: '2026-08-15T12:00:00Z', monto_mxn: 3000 * UMA_PRUEBA }),
    ];
    const candidatos = evaluarTipologia(UMBRAL, ops, ctx());

    const marcar = new Set<string>();
    for (const c of candidatos) {
      if (c.operation_id) marcar.add(c.operation_id);
      const dentro = (c.regla_payload as { operaciones?: unknown }).operaciones;
      if (Array.isArray(dentro)) for (const id of dentro) if (typeof id === 'string') marcar.add(id);
    }
    expect([...marcar].sort()).toEqual(['a', 'b']);
  });

  it('no arrastra operaciones de otro cliente', () => {
    const ops = [
      op({ id: 'a', fecha: '2026-08-10T12:00:00Z', monto_mxn: 5000 * UMA_PRUEBA }),
      op({ id: 'z', client_id: CLIENTE_B, fecha: '2026-08-11T12:00:00Z', monto_mxn: 100 }),
    ];
    const c = evaluarTipologia(UMBRAL, ops, ctx());
    expect(c).toHaveLength(1);
    expect((c[0].regla_payload as { operaciones?: string[] }).operaciones).toEqual(['a']);
  });
});

describe('las ventanas de meses se cuentan con el calendario', () => {
  // La ventana móvil de seis meses del artículo 7 del Reglamento gobierna el
  // Aviso por acumulación, y el artículo 18 fracción X obliga a detectar las
  // operaciones que deban acumularse. Aproximar el mes a 30 días deja fuera los
  // actos del día 181 al 184: un falso negativo silencioso y a favor de no
  // reportar.
  it('seis meses son seis meses, no 180 días', () => {
    const fin = new Date('2026-08-31T12:00:00Z');
    const inicio = ventanaDesde(fin, '6M');
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-02-28');

    const dias = (fin.getTime() - inicio.getTime()) / 86_400_000;
    expect(dias).toBeGreaterThan(180); // la aproximación se quedaba corta
  });

  it('el día 31 se ajusta como en un almanaque', () => {
    // Seis meses antes del 31 de agosto es el 28 o 29 de febrero, no el 3 de
    // marzo. Sin el ajuste, el mes se desborda solo y la ventana se corre.
    expect(ventanaDesde(new Date('2026-08-31T00:00:00Z'), '6M').toISOString().slice(0, 10))
      .toBe('2026-02-28');
    expect(ventanaDesde(new Date('2024-08-31T00:00:00Z'), '6M').toISOString().slice(0, 10))
      .toBe('2024-02-29'); // bisiesto
    expect(ventanaDesde(new Date('2026-03-31T00:00:00Z'), '1M').toISOString().slice(0, 10))
      .toBe('2026-02-28');
  });

  it('cruza el fin de año sin perderse', () => {
    expect(ventanaDesde(new Date('2026-01-15T00:00:00Z'), '6M').toISOString().slice(0, 10))
      .toBe('2025-07-15');
  });

  it('horas y días siguen siendo milisegundos', () => {
    expect(ventanaDesde(new Date('2026-08-20T12:00:00Z'), '24h').toISOString())
      .toBe('2026-08-19T12:00:00.000Z');
    expect(ventanaDesde(new Date('2026-08-20T12:00:00Z'), '72h').toISOString())
      .toBe('2026-08-17T12:00:00.000Z');
  });

  it('hacia adelante es simétrico', () => {
    const inicio = new Date('2026-02-28T00:00:00Z');
    expect(ventanaHasta(inicio, '6M').toISOString().slice(0, 10)).toBe('2026-08-28');
    expect(ventanaHasta(new Date('2026-08-20T12:00:00Z'), '24h').toISOString())
      .toBe('2026-08-21T12:00:00.000Z');
  });

  it('todas las ventanas que las tipologías usan se resuelven', () => {
    // Las cuatro que hay sembradas hoy. Si mañana entra una nueva unidad, esta
    // prueba la caza antes que el motor.
    for (const v of ['24h', '72h', '1M', '6M']) {
      expect(() => ventanaDesde(new Date(), v)).not.toThrow();
      expect(() => ventanaHasta(new Date(), v)).not.toThrow();
    }
  });

  it('una ventana inválida truena en vez de calcular cualquier cosa', () => {
    for (const v of ['6 meses', '6s', '', 'M6']) {
      expect(() => ventanaDesde(new Date(), v)).toThrow(/ventana inválida/);
    }
  });
});

describe('un acto en el día 182 SÍ acumula', () => {
  it('el caso concreto que la aproximación perdía', () => {
    // Dos transmisiones que juntas cruzan el umbral, separadas por más de 180
    // días pero menos de seis meses. Con la ventana de 30 días por mes, la
    // primera caía fuera y no había Aviso por acumulación.
    const UMBRAL = tip('XII-01', {
      tipo: 'agregado',
      ventana: '6M',
      agrupar_por: 'client_id',
      condicion: { suma_monto_uma: { op: '>=', valor: 8000 } },
    });
    const ops = [
      op({ id: 'vieja', fecha: '2026-03-01T12:00:00Z', monto_mxn: 5000 * UMA_PRUEBA }),
      op({ id: 'nueva', fecha: '2026-09-01T12:00:00Z', monto_mxn: 4000 * UMA_PRUEBA }),
    ];
    const dias =
      (new Date('2026-09-01').getTime() - new Date('2026-03-01').getTime()) / 86_400_000;
    // 184 días: dentro de los seis meses del calendario, FUERA de los 180 que
    // daba la aproximación de 30 días por mes.
    expect(dias).toBe(184);

    const c = evaluarTipologia(UMBRAL, ops, ctx({ ahora: new Date('2026-09-02T00:00:00Z') }));
    expect(c).toHaveLength(1);
    expect((c[0].regla_payload as { operaciones?: string[] }).operaciones).toEqual([
      'vieja', 'nueva',
    ]);
  });
});

describe('el borde de la ventana se incluye', () => {
  it('un acto exactamente en el límite entra en la acumulación', () => {
    // Seis meses hacia atrás desde el 1 de septiembre alcanzan al 1 de marzo,
    // no empiezan el 2. Con un `>` estricto quedaba fuera un acto que la ley
    // incluye: un milisegundo de diferencia y una operación menos en el Aviso.
    const UMBRAL = tip('XII-01', {
      tipo: 'agregado',
      ventana: '6M',
      agrupar_por: 'client_id',
      condicion: { suma_monto_uma: { op: '>=', valor: 8000 } },
    });
    const c = evaluarTipologia(
      UMBRAL,
      [
        op({ id: 'borde', fecha: '2026-03-01T12:00:00Z', monto_mxn: 5000 * UMA_PRUEBA }),
        op({ id: 'hoy', fecha: '2026-09-01T12:00:00Z', monto_mxn: 4000 * UMA_PRUEBA }),
      ],
      ctx({ ahora: new Date('2026-09-02T00:00:00Z') }),
    );
    expect((c[0]?.regla_payload as { operaciones?: string[] })?.operaciones).toContain('borde');
  });

  it('un acto FUERA de la ventana no entra', () => {
    // El día anterior al límite sí queda fuera, que es lo correcto.
    const UMBRAL = tip('XII-01', {
      tipo: 'agregado',
      ventana: '6M',
      agrupar_por: 'client_id',
      condicion: { suma_monto_uma: { op: '>=', valor: 8000 } },
    });
    const c = evaluarTipologia(
      UMBRAL,
      [
        op({ id: 'vieja', fecha: '2026-02-28T12:00:00Z', monto_mxn: 5000 * UMA_PRUEBA }),
        op({ id: 'hoy', fecha: '2026-09-01T12:00:00Z', monto_mxn: 4000 * UMA_PRUEBA }),
      ],
      ctx({ ahora: new Date('2026-09-02T00:00:00Z') }),
    );
    expect(c).toHaveLength(0);
  });
});
