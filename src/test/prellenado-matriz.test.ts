import { describe, it, expect } from 'vitest';
import { prellenarMatriz, faltanPorResponder } from '@/lib/riesgo/prellenado';
import { variablesAplicables } from '@/lib/riesgo/matriz';
import type { MatrizConfig } from '@/types/domain';

/**
 * La matriz XII tal como está sembrada, recortada a lo que estas pruebas
 * necesitan. Las opciones se copian LITERALES —incluidos los tramos derogados
 * de 645 y 3,210 UMA— porque parte de lo que hay que demostrar es que el
 * pre-llenado NO las toca.
 */
const CONFIG: MatrizConfig = {
  elementos: [
    {
      codigo: 'E1_ACTO',
      nombre: 'Tipo de acto y operación',
      variables: [
        {
          codigo: 'XII-ACT-01',
          pregunta: 'Tipo de acto que se instrumenta',
          opciones: [
            { label: 'Compraventa de inmueble', valor: 1 },
            { label: 'Constitución de sociedad', valor: 2 },
            { label: 'Fideicomiso', valor: 3 },
            { label: 'Poder irrevocable', valor: 4 },
          ],
        },
        {
          codigo: 'XII-ACT-02',
          pregunta: 'Valor de la operación (en UMA)',
          opciones: [
            { label: 'Menor a 645 UMA', valor: 1 },
            { label: 'De 645 a 3,210 UMA', valor: 2 },
            { label: 'Mayor a 3,210 UMA', valor: 3 },
          ],
        },
        {
          codigo: 'XII-ACT-03',
          pregunta: 'Forma de pago',
          opciones: [
            { label: 'Bancarizado (transferencia o cheque nominativo)', valor: 1 },
            { label: 'Mixto (parte en efectivo)', valor: 2 },
            { label: 'Efectivo', valor: 3 },
          ],
        },
      ],
    },
    {
      codigo: 'E2_COMPARECIENTE_PF',
      nombre: 'Compareciente persona física',
      aplica_si: "tipo_persona == 'fisica'",
      variables: [
        {
          codigo: 'XII-PF-01',
          pregunta: 'Residencia del compareciente',
          opciones: [
            { label: 'Nacional', valor: 1 },
            { label: 'Extranjero, jurisdicción sin observaciones GAFI', valor: 2 },
            { label: 'Extranjero, jurisdicción de riesgo', valor: 3 },
          ],
        },
        {
          codigo: 'XII-PF-02',
          pregunta: 'Condición de PEP',
          opciones: [
            { label: 'No es PEP', valor: 1 },
            { label: 'PEP nacional (estatal o municipal)', valor: 2 },
            { label: 'PEP federal o PEP extranjero', valor: 3 },
          ],
        },
        {
          codigo: 'XII-PF-03',
          pregunta: 'Actividad o profesión',
          opciones: [
            { label: 'Actividad de riesgo bajo', valor: 1 },
            { label: 'Actividad de riesgo medio', valor: 2 },
            { label: 'Actividad de riesgo alto (intensiva en efectivo)', valor: 3 },
          ],
        },
      ],
    },
    {
      codigo: 'E3_COMPARECIENTE_PM',
      nombre: 'Compareciente persona moral',
      aplica_si: "tipo_persona == 'moral'",
      variables: [
        {
          codigo: 'XII-PM-01',
          pregunta: 'Jurisdicción de constitución',
          opciones: [
            { label: 'Nacional', valor: 1 },
            { label: 'Extranjera, sin observaciones GAFI', valor: 2 },
            { label: 'Jurisdicción en lista gris GAFI', valor: 3 },
            { label: 'Jurisdicción en lista negra GAFI', valor: 4 },
          ],
        },
      ],
    },
    {
      codigo: 'E4_ORIGEN_RECURSOS',
      nombre: 'Origen de recursos',
      variables: [
        {
          codigo: 'XII-REC-01',
          pregunta: 'País de origen de los fondos',
          opciones: [
            { label: 'México u otra jurisdicción de riesgo bajo', valor: 1 },
            { label: 'Jurisdicción de riesgo medio', valor: 2 },
            { label: 'Jurisdicción de riesgo alto (lista gris o negra GAFI)', valor: 3 },
          ],
        },
        {
          codigo: 'XII-REC-02',
          pregunta: '¿Involucra moneda extranjera o activos virtuales?',
          opciones: [
            { label: 'No, solo moneda nacional', valor: 1 },
            { label: 'Moneda extranjera', valor: 2 },
            { label: 'Activos virtuales', valor: 3 },
          ],
        },
      ],
    },
  ],
  escala_cliente: {
    bajo: { min: 8, max: 13, acciones: '' },
    medio: { min: 14, max: 19, acciones: '' },
    alto: { min: 20, max: 26, acciones: '' },
  },
  triggers_alto_de_oficio: [],
};

const GAFI = {
  gafi_gris: new Set(['PA', 'PH']),
  gafi_negra: new Set(['IR', 'KP', 'MM']),
};

function respuestasDe(sug: ReturnType<typeof prellenarMatriz>) {
  return Object.fromEntries(sug.map((s) => [s.variable_codigo, s.valor]));
}

describe('el pre-llenado responde lo que se deriva', () => {
  it('el tipo de acto sale del acto que se está instrumentando', () => {
    const s = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica',
      tipo_acto: 'otorgamiento_poder',
      ...GAFI,
    });
    const acto = s.find((x) => x.variable_codigo === 'XII-ACT-01');
    expect(acto?.etiqueta).toBe('Poder irrevocable');
    expect(acto?.fuente).toMatch(/tipo de acto/i);
  });

  it('traduce el nombre oficial del layout al de la matriz', () => {
    // La matriz se escribió antes de la migration 0031 y usa los nombres
    // viejos. La correspondencia es la misma que la 0031 aplicó a las
    // operaciones: el mismo acto con su nombre oficial, no un criterio nuevo.
    const s = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica',
      tipo_acto: 'transmision_inmueble',
      ...GAFI,
    });
    expect(s.find((x) => x.variable_codigo === 'XII-ACT-01')?.etiqueta).toBe(
      'Compraventa de inmueble',
    );
  });

  it('un acto que la matriz no contempla no se responde', () => {
    // El layout tiene once tipos y la matriz nombra cuatro. Asignarle un valor
    // de riesgo a una fusión sería decidir metodología.
    const s = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica',
      tipo_acto: 'fusion',
      ...GAFI,
    });
    expect(s.find((x) => x.variable_codigo === 'XII-ACT-01')).toBeUndefined();
  });

  it('la residencia sale del país y del snapshot GAFI', () => {
    const mx = prellenarMatriz(CONFIG, { tipo_persona: 'fisica', pais_iso2: 'MX', ...GAFI });
    expect(mx.find((x) => x.variable_codigo === 'XII-PF-01')?.etiqueta).toBe('Nacional');

    const es = prellenarMatriz(CONFIG, { tipo_persona: 'fisica', pais_iso2: 'ES', ...GAFI });
    expect(es.find((x) => x.variable_codigo === 'XII-PF-01')?.valor).toBe(2);

    const ir = prellenarMatriz(CONFIG, { tipo_persona: 'fisica', pais_iso2: 'IR', ...GAFI });
    expect(ir.find((x) => x.variable_codigo === 'XII-PF-01')?.valor).toBe(3);
  });

  it('con tres opciones, lista gris y lista negra caen las dos en «de riesgo»', () => {
    // Agrupar hacia ARRIBA. Lo contrario le bajaría el riesgo a un país en
    // lista negra por una limitación del formulario.
    const gris = prellenarMatriz(CONFIG, { tipo_persona: 'fisica', pais_iso2: 'PA', ...GAFI });
    expect(gris.find((x) => x.variable_codigo === 'XII-PF-01')?.valor).toBe(3);
  });

  it('la persona moral sí distingue gris de negra, porque su escala lo permite', () => {
    const gris = prellenarMatriz(CONFIG, { tipo_persona: 'moral', pais_iso2: 'PA', ...GAFI });
    expect(gris.find((x) => x.variable_codigo === 'XII-PM-01')?.valor).toBe(3);

    const negra = prellenarMatriz(CONFIG, { tipo_persona: 'moral', pais_iso2: 'KP', ...GAFI });
    expect(negra.find((x) => x.variable_codigo === 'XII-PM-01')?.valor).toBe(4);
  });

  it('la moneda sale de la operación', () => {
    const pesos = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica', tipo_acto: 'otorgamiento_poder', moneda_origen: 'MXN', ...GAFI,
    });
    expect(pesos.find((x) => x.variable_codigo === 'XII-REC-02')?.valor).toBe(1);

    const usd = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica', tipo_acto: 'otorgamiento_poder', moneda_origen: 'USD', ...GAFI,
    });
    expect(usd.find((x) => x.variable_codigo === 'XII-REC-02')?.valor).toBe(2);

    const av = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica', tipo_acto: 'otorgamiento_poder', activo_virtual: 'BTC', ...GAFI,
    });
    expect(av.find((x) => x.variable_codigo === 'XII-REC-02')?.valor).toBe(3);
  });

  it('cada respuesta dice de dónde salió', () => {
    // Sin fuente, una sugerencia es indistinguible de una respuesta del OC, y
    // la matriz deja de ser revisable.
    const s = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica', pais_iso2: 'IR', tipo_acto: 'otorgamiento_poder', ...GAFI,
    });
    expect(s.length).toBeGreaterThan(0);
    for (const r of s) expect(r.fuente.trim().length).toBeGreaterThan(10);
  });
});

describe('el pre-llenado NO responde lo que no puede saber', () => {
  const COMPLETO = {
    tipo_persona: 'fisica' as const,
    pais_iso2: 'MX',
    tipo_acto: 'otorgamiento_poder',
    moneda_origen: 'MXN',
    ...GAFI,
  };

  it('no toca el valor en UMA, cuyos tramos están derogados', () => {
    // 645 y 3,210 UMA son umbrales de activos virtuales del régimen anterior a
    // la reforma DOF 16/07/2025, en una matriz de fe pública. Responderla sería
    // clasificar contra cifras derogadas de otra fracción.
    const s = prellenarMatriz(CONFIG, COMPLETO);
    expect(s.find((x) => x.variable_codigo === 'XII-ACT-02')).toBeUndefined();
  });

  it('no inventa el PEP: no hay dónde capturarlo', () => {
    const s = prellenarMatriz(CONFIG, COMPLETO);
    expect(s.find((x) => x.variable_codigo === 'XII-PF-02')).toBeUndefined();
  });

  it('sin forma de pago capturada, no la supone', () => {
    const s = prellenarMatriz(CONFIG, COMPLETO);
    expect(s.find((x) => x.variable_codigo === 'XII-ACT-03')).toBeUndefined();
  });

  it('la actividad SIEMPRE se responde, incluso sin clave', () => {
    // Es lo contrario de las demás y a propósito: dejarla en blanco sumaría
    // cero, y cero en una escala aditiva es más bajo que la actividad más
    // inocua de la lista. La clave desconocida acabaría puntuando mejor que un
    // notario, y el expediente saldría limpio por un hueco.
    const s = prellenarMatriz(CONFIG, COMPLETO);
    const act = s.find((x) => x.variable_codigo === 'XII-PF-03');
    expect(act?.valor).toBe(2); // medio por omisión
    expect(act?.por_defecto).toBe(true);
  });

  it('la respuesta por omisión se distingue de la derivada', () => {
    // Sin la marca, una respuesta que nadie determinó se ve igual que una que
    // sale del expediente, y nadie va a ir a revisar la que hace falta revisar.
    const porDefecto = prellenarMatriz(CONFIG, COMPLETO)
      .find((x) => x.variable_codigo === 'XII-PF-03');
    const derivada = prellenarMatriz(CONFIG, { ...COMPLETO, actividad_clave: '5721100' })
      .find((x) => x.variable_codigo === 'XII-PF-03');
    expect(porDefecto?.por_defecto).toBe(true);
    expect(derivada?.por_defecto).toBeFalsy();
    expect(derivada?.valor).toBe(3); // joyeros: Actividad Vulnerable
  });

  it('no deriva el origen de los fondos de la residencia', () => {
    // Dónde vive alguien y de dónde salió el dinero son cosas distintas, y
    // confundirlas es justo lo que la variable existe para detectar. Aunque el
    // compareciente resida en un país de lista negra, sin origen capturado la
    // variable se queda sin responder.
    const s = prellenarMatriz(CONFIG, { ...COMPLETO, pais_iso2: 'IR' });
    expect(s.find((x) => x.variable_codigo === 'XII-REC-01')).toBeUndefined();
  });

  it('sin acto no afirma que la operación sea en pesos', () => {
    // «No involucra moneda extranjera» sin operación no es una respuesta: es
    // una ausencia de pregunta.
    const s = prellenarMatriz(CONFIG, { tipo_persona: 'fisica', pais_iso2: 'MX', ...GAFI });
    expect(s.find((x) => x.variable_codigo === 'XII-REC-02')).toBeUndefined();
  });

  it('nunca responde una variable dos veces', () => {
    const s = prellenarMatriz(CONFIG, COMPLETO);
    expect(new Set(s.map((x) => x.variable_codigo)).size).toBe(s.length);
  });

  it('sólo responde variables que aplican a ese tipo de persona', () => {
    const s = prellenarMatriz(CONFIG, { ...COMPLETO, tipo_persona: 'moral', pais_iso2: 'MX' });
    const aplicables = new Set(variablesAplicables(CONFIG, 'moral').map((v) => v.codigo));
    for (const r of s) expect(aplicables.has(r.variable_codigo)).toBe(true);
  });
});

describe('lo que queda para el OC', () => {
  it('dice cuáles faltan después de pre-llenar', () => {
    const s = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica', pais_iso2: 'MX', tipo_acto: 'otorgamiento_poder',
      moneda_origen: 'MXN', ...GAFI,
    });
    const faltan = faltanPorResponder(CONFIG, 'fisica', respuestasDe(s));
    // Sin forma de pago ni origen capturados: cuatro respondidas —la actividad
    // entra siempre— y cuatro no.
    expect(s).toHaveLength(4);
    expect(faltan.map((v) => v.codigo).sort()).toEqual([
      'XII-ACT-02', 'XII-ACT-03', 'XII-PF-02', 'XII-REC-01',
    ]);
  });

  it('sobre la v1, con el acto completo sólo falta el PEP y los tramos derogados', () => {
    const s = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica', pais_iso2: 'MX', tipo_acto: 'otorgamiento_poder',
      moneda_origen: 'MXN', forma_pago: 'efectivo', pais_origen_recursos: 'MX',
      actividad_clave: '5620015', ...GAFI,
    });
    const faltan = faltanPorResponder(CONFIG, 'fisica', respuestasDe(s));
    expect(faltan.map((v) => v.codigo).sort()).toEqual(['XII-ACT-02', 'XII-PF-02']);
  });

  it('sin ningún dato, todas quedan para el OC', () => {
    const faltan = faltanPorResponder(CONFIG, 'fisica', {});
    expect(faltan).toHaveLength(8);
  });
});

describe('forma de pago y origen de los recursos', () => {
  it('la forma de pago sale del acto', () => {
    for (const [capturado, esperado] of [
      ['bancarizado', 1],
      ['mixto', 2],
      ['efectivo', 3],
    ] as const) {
      const s = prellenarMatriz(CONFIG, {
        tipo_persona: 'fisica', tipo_acto: 'otorgamiento_poder', forma_pago: capturado, ...GAFI,
      });
      expect(s.find((x) => x.variable_codigo === 'XII-ACT-03')?.valor).toBe(esperado);
    }
  });

  it('la opción se reconoce aunque lleve una explicación entre paréntesis', () => {
    // El seed dice «Bancarizado (transferencia o cheque nominativo)»: el
    // paréntesis es explicación, no parte del valor.
    const s = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica', tipo_acto: 'otorgamiento_poder', forma_pago: 'bancarizado', ...GAFI,
    });
    expect(s.find((x) => x.variable_codigo === 'XII-ACT-03')?.etiqueta).toMatch(/^Bancarizado/);
  });

  it('una forma de pago que la matriz no contempla no se responde', () => {
    const s = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica', tipo_acto: 'otorgamiento_poder', forma_pago: 'tarjeta', ...GAFI,
    });
    expect(s.find((x) => x.variable_codigo === 'XII-ACT-03')).toBeUndefined();
  });

  it('el origen de los fondos sale del país capturado como origen', () => {
    const mx = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica', pais_origen_recursos: 'MX', ...GAFI,
    });
    expect(mx.find((x) => x.variable_codigo === 'XII-REC-01')?.valor).toBe(1);

    const ir = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica', pais_origen_recursos: 'IR', ...GAFI,
    });
    expect(ir.find((x) => x.variable_codigo === 'XII-REC-01')?.valor).toBe(3);
  });

  it('no usa la opción intermedia de país, que ninguna lista respalda', () => {
    // «Jurisdicción de riesgo medio» no tiene criterio en el catálogo que
    // tenemos. Elegirla sería inventar un riesgo de país sin fuente.
    for (const pais of ['MX', 'ES', 'PA', 'KP']) {
      const s = prellenarMatriz(CONFIG, {
        tipo_persona: 'fisica', pais_origen_recursos: pais, ...GAFI,
      });
      expect(s.find((x) => x.variable_codigo === 'XII-REC-01')?.valor).not.toBe(2);
    }
  });

  it('el origen y la residencia son independientes', () => {
    // Alguien que vive en México con recursos de un país en lista negra: la
    // residencia baja y el origen alto. Si una arrastrara a la otra, la matriz
    // dejaría de ver justo el caso que le interesa.
    const s = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica', pais_iso2: 'MX', pais_origen_recursos: 'KP', ...GAFI,
    });
    expect(s.find((x) => x.variable_codigo === 'XII-PF-01')?.valor).toBe(1);
    expect(s.find((x) => x.variable_codigo === 'XII-REC-01')?.valor).toBe(3);
  });
});

// =====================================================================
// Matriz v2 (migration 0037): once actos con clave y magnitud relativa
// =====================================================================
const CONFIG_V2: MatrizConfig = {
  ...CONFIG,
  elementos: [
    {
      codigo: 'E1_ACTO',
      nombre: 'Tipo de acto y operación',
      variables: [
        {
          codigo: 'XII-ACT-01',
          pregunta: 'Tipo de acto que se instrumenta',
          opciones: [
            { clave: 'transmision_inmueble', label: 'Transmisión de inmueble', valor: 3 },
            { clave: 'otorgamiento_poder', label: 'Poder irrevocable', valor: 4 },
            { clave: 'constitucion_personas_morales', label: 'Constitución de PM', valor: 3 },
            { clave: 'fusion', label: 'Fusión', valor: 3 },
            { clave: 'avaluo', label: 'Avalúo', valor: 2 },
          ],
        },
        {
          codigo: 'XII-ACT-02',
          pregunta: 'Valor de la operación',
          opciones: [
            { clave: 'T1', label: 'Menor al 25 % del umbral del acto', valor: 1 },
            { clave: 'T2', label: 'Del 25 % al 75 % del umbral', valor: 2 },
            { clave: 'T3', label: 'Del 75 % al 150 % del umbral', valor: 3 },
            { clave: 'T4', label: 'Igual o mayor al 150 % del umbral', valor: 4 },
          ],
        },
        CONFIG.elementos[0].variables[2], // forma de pago, sin cambios
      ],
    },
    ...CONFIG.elementos.slice(1),
  ],
};

describe('la matriz v2 responde por clave, no por rótulo', () => {
  it('los once actos del layout entran sin traducir nada', () => {
    // La v1 sólo nombraba cuatro con los rótulos anteriores a la 0031 y había
    // que traducir. La v2 los trae con su clave del catálogo.
    for (const [acto, esperado] of [
      ['transmision_inmueble', 3],
      ['otorgamiento_poder', 4],
      ['fusion', 3],
      ['avaluo', 2],
    ] as const) {
      const s = prellenarMatriz(CONFIG_V2, { tipo_persona: 'fisica', tipo_acto: acto, ...GAFI });
      expect(s.find((x) => x.variable_codigo === 'XII-ACT-01')?.valor).toBe(esperado);
    }
  });

  it('un acto que la plantilla no lista sigue sin responderse', () => {
    const s = prellenarMatriz(CONFIG_V2, {
      tipo_persona: 'fisica', tipo_acto: 'escision', ...GAFI,
    });
    expect(s.find((x) => x.variable_codigo === 'XII-ACT-01')).toBeUndefined();
  });
});

describe('la magnitud sólo se responde en la v2', () => {
  it('la v1 no se toca: sus tramos son umbrales derogados de otra fracción', () => {
    const s = prellenarMatriz(CONFIG, {
      tipo_persona: 'fisica', tipo_acto: 'transmision_inmueble',
      monto_uma: 6000, umbral_uma: 8000, ...GAFI,
    });
    expect(s.find((x) => x.variable_codigo === 'XII-ACT-02')).toBeUndefined();
  });

  it('la v2 mide contra el umbral del acto', () => {
    const s = prellenarMatriz(CONFIG_V2, {
      tipo_persona: 'fisica', tipo_acto: 'transmision_inmueble',
      monto_uma: 6000, umbral_uma: 8000, ...GAFI, // 75 %
    });
    const m = s.find((x) => x.variable_codigo === 'XII-ACT-02');
    expect(m?.etiqueta).toMatch(/75 % al 150 %/);
    expect(m?.fuente).toMatch(/75 % del umbral/);
  });

  it('el mismo monto da tramos distintos según el acto', () => {
    const inmueble = prellenarMatriz(CONFIG_V2, {
      tipo_persona: 'fisica', tipo_acto: 'transmision_inmueble',
      monto_uma: 8000, umbral_uma: 8000, ...GAFI,
    });
    const fideicomiso = prellenarMatriz(CONFIG_V2, {
      tipo_persona: 'fisica', tipo_acto: 'transmision_inmueble',
      monto_uma: 8000, umbral_uma: 4000, ...GAFI,
    });
    expect(inmueble.find((x) => x.variable_codigo === 'XII-ACT-02')?.valor).toBe(3);
    expect(fideicomiso.find((x) => x.variable_codigo === 'XII-ACT-02')?.valor).toBe(4);
  });

  it('sin umbral usa los tramos absolutos y lo dice', () => {
    const s = prellenarMatriz(CONFIG_V2, {
      tipo_persona: 'fisica', tipo_acto: 'otorgamiento_poder',
      monto_uma: 5000, umbral_uma: null, ...GAFI,
    });
    expect(s.find((x) => x.variable_codigo === 'XII-ACT-02')?.fuente).toMatch(/se avisa siempre/i);
  });

  it('sin monto no inventa una magnitud', () => {
    const s = prellenarMatriz(CONFIG_V2, {
      tipo_persona: 'fisica', tipo_acto: 'otorgamiento_poder', ...GAFI,
    });
    expect(s.find((x) => x.variable_codigo === 'XII-ACT-02')).toBeUndefined();
  });
});

describe('sobre la matriz v2, lo único que queda es el PEP', () => {
  it('siete de ocho se responden con lo capturado', () => {
    // El objetivo de todo el bloque. Lo único sin responder es la condición de
    // PEP, y no porque no se derive: porque no hay dónde capturarla todavía.
    const s = prellenarMatriz(CONFIG_V2, {
      tipo_persona: 'fisica',
      pais_iso2: 'MX',
      tipo_acto: 'otorgamiento_poder',
      monto_uma: 5000,
      umbral_uma: null,
      moneda_origen: 'MXN',
      forma_pago: 'efectivo',
      pais_origen_recursos: 'MX',
      actividad_clave: '5620015', // notaría y correduría
      ...GAFI,
    });
    const faltan = faltanPorResponder(CONFIG_V2, 'fisica', respuestasDe(s));
    expect(faltan.map((v) => v.codigo)).toEqual(['XII-PF-02']);
  });
});

describe('la condición de PPE sólo se responde cuando alguien la resolvió', () => {
  const BASE = { tipo_persona: 'fisica' as const, ...GAFI };

  it('una coincidencia sin resolver NO se traduce a ninguna opción', () => {
    // Las RCG reservan al sujeto obligado la determinación del nivel. Responder
    // desde el screening del proveedor sería atribuirle una decisión que no es
    // suya, y además convertir un hallazgo sin revisar en una respuesta.
    const s = prellenarMatriz(CONFIG, {
      ...BASE, condicion_pep: 'coincidencia_sin_resolver',
    });
    expect(s.find((x) => x.variable_codigo === 'XII-PF-02')).toBeUndefined();
  });

  it('sin consultar tampoco se responde', () => {
    // Nulo es «no se ha consultado», que no es «no es PPE».
    expect(
      prellenarMatriz(CONFIG, BASE).find((x) => x.variable_codigo === 'XII-PF-02'),
    ).toBeUndefined();
  });

  it('no_pep SÍ se responde: es una determinación, no una ausencia', () => {
    const s = prellenarMatriz(CONFIG, { ...BASE, condicion_pep: 'no_pep' });
    const pep = s.find((x) => x.variable_codigo === 'XII-PF-02');
    expect(pep?.valor).toBe(1);
    expect(pep?.fuente).toMatch(/no encontró coincidencias/i);
  });

  it('los niveles resueltos por la célula se responden y dicen quién los resolvió', () => {
    const nacional = prellenarMatriz(CONFIG, { ...BASE, condicion_pep: 'pep_nacional' })
      .find((x) => x.variable_codigo === 'XII-PF-02');
    expect(nacional?.valor).toBe(2);
    expect(nacional?.fuente).toMatch(/célula de cumplimiento/i);

    const extranjera = prellenarMatriz(CONFIG, { ...BASE, condicion_pep: 'pep_extranjera' })
      .find((x) => x.variable_codigo === 'XII-PF-02');
    expect(extranjera?.valor).toBe(3);
  });

  it('el familiar o asociado cuenta como el nivel más alto', () => {
    // La Adenda los pone junto a la PPE extranjera entre los pisos de banda
    // alta del apartado 5.2.
    const s = prellenarMatriz(CONFIG, { ...BASE, condicion_pep: 'familiar_o_asociado' });
    expect(s.find((x) => x.variable_codigo === 'XII-PF-02')?.valor).toBe(3);
  });
});
