import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  evaluarMatriz,
  respuestasCompletas,
  variablesAplicables,
  variablePuntua,
} from '@/lib/riesgo/matriz';
import { maximoPosible } from '@/lib/riesgo/indice';
import { prellenarMatriz, indicadoresDerivados } from '@/lib/riesgo/prellenado';
import type { MatrizConfig, TipoPersona } from '@/types/domain';

/**
 * Matriz XII v3 (migration 0042): instrucciones 6, 7 y 10 de la Adenda 1.
 *
 * La v3 se construye con `jsonb_set` sobre la v2, así que no hay un literal
 * JSON que se pueda leer entero del archivo como en el seed. Lo que sí se puede
 * —y es lo que importa— es leer los ARREGLOS DE OPCIONES que la migration
 * embebe: si alguien cambia una clave o un valor allá, estas pruebas lo ven.
 * El resto se arma aquí como fixture, con las mismas claves.
 */
const SQL = readFileSync(
  resolve(__dirname, '../../supabase/migrations/0042_matriz_xii_v3.sql'),
  'utf8',
);

/** Todos los arreglos JSON que la migration embebe como `'[...]'::jsonb`. */
function arreglosDeLaMigration(): unknown[][] {
  const out: unknown[][] = [];
  const re = /'(\[[\s\S]*?\])'::jsonb/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SQL)) !== null) {
    out.push(JSON.parse(m[1].replace(/''/g, "'")));
  }
  return out;
}

type Opcion = { clave?: string; valor: number; label: string };

function arregloConClave(clave: string): Opcion[] | undefined {
  return arreglosDeLaMigration().find(
    (a) => Array.isArray(a) && a.some((o) => (o as Opcion)?.clave === clave),
  ) as Opcion[] | undefined;
}

// =====================================================================
// Lo que la migration realmente escribe
// =====================================================================
describe('migration 0042 · lo que quedó escrito', () => {
  it('la variable de riesgo país tiene TRES opciones, no cuatro', () => {
    // Apartado 4.3: el puntaje agrupa gris y negra; el flujo las separa con el
    // indicador. Una cuarta opción devolvería la separación al puntaje.
    const opciones = arregloConClave('nacional');
    expect(opciones).toBeDefined();
    expect(opciones!.map((o) => o.clave)).toEqual(['nacional', 'sin_observaciones', 'riesgo']);
    expect(opciones!.map((o) => o.valor)).toEqual([1, 2, 3]);
  });

  it('el canal remoto suma más que el presencial', () => {
    const opciones = arregloConClave('presencial')!;
    const valor = (c: string) => opciones.find((o) => o.clave === c)!.valor;
    expect(valor('presencial')).toBe(1);
    expect(valor('remoto_verificacion_reforzada')).toBe(2);
    expect(valor('remoto_estandar')).toBe(3);
  });

  it('la frecuencia sin declarar es la intermedia, nunca la mínima', () => {
    const opciones = arregloConClave('sin_declaracion')!;
    const valor = (c: string) => opciones.find((o) => o.clave === c)!.valor;
    expect(valor('dentro')).toBeLessThan(valor('sin_declaracion'));
    expect(valor('sin_declaracion')).toBeLessThan(valor('excede'));
  });

  it('la variable de zona declara su catálogo', () => {
    expect(SQL).toContain("'requiere_catalogo', 'zona_atencion'");
  });

  it('el indicador de llamado a la acción existe y es piso', () => {
    const indicadores = arreglosDeLaMigration().find(
      (a) => Array.isArray(a) && (a[0] as { codigo?: string })?.codigo === 'GAFI_LLAMADO_ACCION',
    ) as { codigo: string; efecto: string }[] | undefined;
    expect(indicadores).toBeDefined();
    expect(indicadores![0].efecto).toBe('piso');
  });

  /**
   * El disparador de la v2 apuntaba a `XII-PM-01 >= 4`, y al colapsar esa
   * variable a tres opciones el 4 dejó de existir. Un disparador que no puede
   * dispararse nunca se lee en la plantilla como si el control existiera, que
   * es peor que no tenerlo.
   */
  it('el disparador GAFI_NEGRA por valor_minimo 4 ya no está', () => {
    const triggers = arreglosDeLaMigration().find(
      (a) => Array.isArray(a) && (a as { codigo?: string }[]).some((t) => t?.codigo === 'PODER_IRREVOCABLE'),
    ) as { codigo: string; indicador_codigo?: string; valor_minimo?: number }[];
    expect(triggers.some((t) => t.codigo === 'GAFI_NEGRA')).toBe(false);
    const porIndicador = triggers.find((t) => t.codigo === 'GAFI_LLAMADO_ACCION');
    expect(porIndicador?.indicador_codigo).toBe('GAFI_LLAMADO_ACCION');
  });

  it('el piso de beneficiario controlador no determinable quedó implementado', () => {
    const triggers = arreglosDeLaMigration().find(
      (a) => Array.isArray(a) && (a as { codigo?: string }[]).some((t) => t?.codigo === 'PODER_IRREVOCABLE'),
    ) as { codigo: string }[];
    expect(triggers.some((t) => t.codigo === 'BENEFICIARIO_NO_DETERMINABLE')).toBe(true);
  });

  it('la v2 se retira ANTES de insertar la v3', () => {
    // Hay un índice único parcial de una plantilla activa por organización y
    // sector: al revés, el insert lo viola.
    const iRetiro = SQL.indexOf('set activa = false');
    const iAlta = SQL.indexOf('insert into public.client_risk_template');
    expect(iRetiro).toBeGreaterThan(0);
    expect(iRetiro).toBeLessThan(iAlta);
  });

  it('la v2 no se borra: sus evaluaciones tienen que poder explicarse', () => {
    expect(/delete\s+from\s+public\.client_risk_template/i.test(SQL)).toBe(false);
  });

  it('sigue declarándose SIN CALIBRAR', () => {
    expect(SQL).toContain("'calibrada', false");
  });
});

// =====================================================================
// Cómo se comporta la matriz v3
// =====================================================================
const opcionesPais: Opcion[] = arregloConClave('nacional')!;
const opcionesCanal: Opcion[] = arregloConClave('presencial')!;
const opcionesFrec: Opcion[] = arregloConClave('sin_declaracion')!;

const CFG: MatrizConfig = {
  elementos: [
    {
      codigo: 'E1_ACTO',
      nombre: 'Tipo de acto y operación',
      variables: [
        {
          codigo: 'XII-ACT-01',
          pregunta: 'Tipo de acto que se instrumenta',
          opciones: [
            { clave: 'transmision_inmueble', label: 'Transmisión de inmuebles', valor: 3 },
            { clave: 'otorgamiento_poder', label: 'Poder irrevocable', valor: 4 },
          ],
        },
        {
          codigo: 'XII-ACT-03',
          pregunta: 'Forma de pago',
          opciones: [
            { label: 'Bancarizado', valor: 1 },
            { label: 'Mixto', valor: 2 },
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
        { codigo: 'XII-PF-01', pregunta: 'Riesgo país del compareciente', opciones: opcionesPais },
        {
          codigo: 'XII-PF-02',
          pregunta: 'Condición de PEP',
          opciones: [
            { label: 'No es PEP', valor: 1 },
            { label: 'PEP nacional', valor: 2 },
            { label: 'PEP federal o PEP extranjero', valor: 3 },
          ],
        },
      ],
    },
    {
      codigo: 'E5_CANAL_ZONA_PERFIL',
      nombre: 'Canal, zona geográfica y perfil transaccional',
      variables: [
        { codigo: 'XII-CAN-01', pregunta: 'Canal de distribución', opciones: opcionesCanal },
        {
          codigo: 'XII-ZON-01',
          pregunta: 'Zona geográfica del inmueble y del domicilio del cliente',
          requiere_catalogo: 'zona_atencion',
          opciones: [
            { clave: 'sin_observaciones', label: 'Sin observaciones', valor: 1 },
            { clave: 'atencion', label: 'Zona de atención', valor: 2 },
            { clave: 'atencion_prioritaria', label: 'Zona de atención prioritaria', valor: 3 },
          ],
        },
        {
          codigo: 'XII-PTR-01',
          pregunta: 'Frecuencia de operación frente a la declarada',
          opciones: opcionesFrec,
        },
      ],
    },
  ],
  escala_cliente: {
    bajo: { min: 0, max: 39, acciones: '' },
    medio: { min: 40, max: 69, acciones: '' },
    alto: { min: 70, max: 100, acciones: '' },
  },
  triggers_alto_de_oficio: [
    {
      codigo: 'PODER_IRREVOCABLE',
      descripcion: 'Otorgamiento de poder irrevocable.',
      variable_codigo: 'XII-ACT-01',
      claves: ['otorgamiento_poder'],
    },
    {
      codigo: 'GAFI_LLAMADO_ACCION',
      descripcion: 'País bajo llamado a la acción del GAFI.',
      indicador_codigo: 'GAFI_LLAMADO_ACCION',
    },
  ],
  indicadores: [
    {
      codigo: 'GAFI_LLAMADO_ACCION',
      pregunta: '¿Algún país bajo llamado a la acción?',
      descripcion: 'Conlleva contramedidas.',
      efecto: 'piso',
    },
  ],
  escala_normalizada: true,
  calibrada: false,
};

const CON_ZONAS = new Set(['zona_atencion']);
const SIN_ZONAS = new Set<string>();

function respuestasExtremo(tipo: TipoPersona, extremo: 'min' | 'max', catalogos: Set<string>) {
  const out: Record<string, number> = {};
  for (const v of variablesAplicables(CFG, tipo, catalogos)) {
    const valores = v.opciones.map((o) => o.valor);
    out[v.codigo] = extremo === 'min' ? Math.min(...valores) : Math.max(...valores);
  }
  return out;
}

describe('escala normalizada · el índice, no el puntaje crudo', () => {
  /**
   * El defecto que esto cierra: la v2 declaró bandas de 0-39/40-69/70-100 y el
   * evaluador seguía comparando el PUNTAJE CRUDO contra ellas. Con un máximo
   * que ronda los treinta puntos, TODO caía en «bajo» —que empieza en 0— y la
   * matriz se veía como si clasificara.
   */
  it('el expediente más limpio posible da índice 0', () => {
    const r = evaluarMatriz(CFG, 'fisica', respuestasExtremo('fisica', 'min', SIN_ZONAS), {
      catalogos_disponibles: SIN_ZONAS,
    });
    expect(r.indice).toBe(0);
    expect(r.clasificacion).toBe('bajo');
    expect(r.score_total).toBeGreaterThan(0); // el crudo NO es cero
  });

  it('el peor posible da índice 100 y banda alta', () => {
    const r = evaluarMatriz(CFG, 'fisica', respuestasExtremo('fisica', 'max', SIN_ZONAS), {
      catalogos_disponibles: SIN_ZONAS,
    });
    expect(r.indice).toBe(100);
    expect(r.clasificacion).toBe('alto');
  });

  it('la clasificación se marca provisional mientras no se calibre', () => {
    const r = evaluarMatriz(CFG, 'fisica', respuestasExtremo('fisica', 'min', SIN_ZONAS), {
      catalogos_disponibles: SIN_ZONAS,
    });
    expect(r.provisional).toBe(true);
  });
});

describe('la zona geográfica sin lista cargada', () => {
  it('no se pide para dar la captura por completa', () => {
    const respuestas = respuestasExtremo('fisica', 'min', SIN_ZONAS);
    expect(respuestasCompletas(CFG, 'fisica', respuestas, SIN_ZONAS)).toBe(true);
    // Con la lista cargada sí hace falta.
    expect(respuestasCompletas(CFG, 'fisica', respuestas, CON_ZONAS)).toBe(false);
  });

  it('no puntúa, y tampoco cuenta en el máximo', () => {
    const sin = maximoPosible(CFG, 'fisica', SIN_ZONAS);
    const con = maximoPosible(CFG, 'fisica', CON_ZONAS);
    expect(con - sin).toBe(3);
  });

  /**
   * Lo que se está evitando: si la variable saliera del numerador pero se
   * quedara en el denominador, el índice de TODOS los expedientes bajaría por
   * una razón que no tiene que ver con su riesgo.
   */
  it('el índice del mismo expediente no cambia por que falte la lista', () => {
    const respuestas = respuestasExtremo('fisica', 'max', SIN_ZONAS);
    const sin = evaluarMatriz(CFG, 'fisica', respuestas, { catalogos_disponibles: SIN_ZONAS });
    const con = evaluarMatriz(CFG, 'fisica', { ...respuestas, 'XII-ZON-01': 3 }, {
      catalogos_disponibles: CON_ZONAS,
    });
    expect(sin.indice).toBe(con.indice);
  });

  it('se reporta cuál quedó fuera y por qué catálogo', () => {
    const r = evaluarMatriz(CFG, 'fisica', respuestasExtremo('fisica', 'min', SIN_ZONAS), {
      catalogos_disponibles: SIN_ZONAS,
    });
    expect(r.variables_sin_catalogo).toEqual([
      { variable_codigo: 'XII-ZON-01', catalogo: 'zona_atencion' },
    ]);
  });

  it('sin decir qué catálogos hay, todas las variables cuentan', () => {
    // El comportamiento de antes, para las plantillas que no usan el mecanismo.
    const v = CFG.elementos[2].variables[1];
    expect(variablePuntua(v, undefined)).toBe(true);
  });
});

describe('el indicador de llamado a la acción · piso sin puntaje', () => {
  const limpio = respuestasExtremo('fisica', 'min', SIN_ZONAS);

  it('sin la bandera, el expediente limpio queda bajo', () => {
    const r = evaluarMatriz(CFG, 'fisica', limpio, { catalogos_disponibles: SIN_ZONAS });
    expect(r.clasificacion).toBe('bajo');
  });

  /** El piso gana siempre sobre la suma: sin esa regla sería una sugerencia. */
  it('con la bandera, el mismo expediente queda ALTO sin sumar un punto', () => {
    const r = evaluarMatriz(CFG, 'fisica', limpio, {
      catalogos_disponibles: SIN_ZONAS,
      indicadores: { GAFI_LLAMADO_ACCION: true },
    });
    expect(r.clasificacion).toBe('alto');
    expect(r.indice).toBe(0); // el índice no se movió: no es puntaje
    expect(r.triggers_activados).toContain('GAFI_LLAMADO_ACCION');
    expect(r.indicadores_activos).toContain('GAFI_LLAMADO_ACCION');
    expect(r.motivo_alto_de_oficio).toContain('llamado a la acción');
  });

  it('la bandera se deriva de cualquiera de los tres países', () => {
    const gafi = { gafi_gris: new Set(['PA']), gafi_negra: new Set(['KP']) };
    expect(
      indicadoresDerivados({
        tipo_persona: 'fisica',
        pais_nacionalidad: 'MX',
        pais_iso2: 'MX',
        pais_origen_recursos: 'KP',
        ...gafi,
      }).GAFI_LLAMADO_ACCION,
    ).toBe(true);
    expect(
      indicadoresDerivados({
        tipo_persona: 'fisica',
        pais_nacionalidad: 'MX',
        pais_iso2: 'PA',
        pais_origen_recursos: 'MX',
        ...gafi,
      }).GAFI_LLAMADO_ACCION,
    ).toBe(false);
  });
});

describe('pre-llenado contra la v3', () => {
  const GAFI = { gafi_gris: new Set(['PA']), gafi_negra: new Set(['KP']), plenario_gafi: '2026-06' };

  it('el riesgo país lo manda el origen de los recursos cuando es el más alto', () => {
    const s = prellenarMatriz(CFG, {
      tipo_persona: 'fisica',
      pais_nacionalidad: 'MX',
      pais_iso2: 'MX',
      pais_origen_recursos: 'PA',
      ...GAFI,
    });
    const pais = s.find((r) => r.variable_codigo === 'XII-PF-01');
    expect(pais?.valor).toBe(3);
    expect(pais?.fuente).toContain('origen de los recursos');
    expect(pais?.fuente).toContain('2026-06');
  });

  it('con los tres en México responde la opción nacional', () => {
    const s = prellenarMatriz(CFG, {
      tipo_persona: 'fisica',
      pais_nacionalidad: 'MX',
      pais_iso2: 'MX',
      pais_origen_recursos: 'MX',
      ...GAFI,
    });
    expect(s.find((r) => r.variable_codigo === 'XII-PF-01')?.valor).toBe(1);
  });

  it('sin ningún país no responde la variable: no la da por nacional', () => {
    const s = prellenarMatriz(CFG, { tipo_persona: 'fisica', ...GAFI });
    expect(s.find((r) => r.variable_codigo === 'XII-PF-01')).toBeUndefined();
  });

  it('el canal se responde sólo si se capturó', () => {
    const con = prellenarMatriz(CFG, {
      tipo_persona: 'fisica',
      canal_distribucion: 'remoto_estandar',
    });
    expect(con.find((r) => r.variable_codigo === 'XII-CAN-01')?.valor).toBe(3);

    const sin = prellenarMatriz(CFG, { tipo_persona: 'fisica' });
    expect(sin.find((r) => r.variable_codigo === 'XII-CAN-01')).toBeUndefined();
  });

  it('la zona no se responde con la lista vacía', () => {
    const s = prellenarMatriz(CFG, {
      tipo_persona: 'fisica',
      entidad_inmueble: '14',
      municipio_inmueble: 'Zapopan',
      zonas_atencion: [],
    });
    expect(s.find((r) => r.variable_codigo === 'XII-ZON-01')).toBeUndefined();
  });

  it('la zona sí se responde cuando la lista tiene contenido', () => {
    const s = prellenarMatriz(CFG, {
      tipo_persona: 'fisica',
      entidad_inmueble: '14',
      municipio_inmueble: 'Tlajomulco',
      zonas_atencion: [
        { entidad_clave: '14', municipio: 'Tlajomulco', nivel: 2, motivo: 'zona de atención' },
      ],
    });
    expect(s.find((r) => r.variable_codigo === 'XII-ZON-01')?.valor).toBe(2);
  });

  it('sin declaración del cliente la frecuencia va marcada por defecto', () => {
    const sin = prellenarMatriz(CFG, {
      tipo_persona: 'fisica',
      operaciones_en_ventana: 3,
      margen_perfil: 1,
    });
    const r = sin.find((x) => x.variable_codigo === 'XII-PTR-01');
    expect(r?.valor).toBe(2);
    expect(r?.por_defecto).toBe(true);
  });

  it('con declaración y exceso responde «excede», sin marca de por defecto', () => {
    const excede = prellenarMatriz(CFG, {
      tipo_persona: 'fisica',
      frecuencia_esperada_anual: 2,
      operaciones_en_ventana: 5,
      margen_perfil: 1,
    });
    const e = excede.find((x) => x.variable_codigo === 'XII-PTR-01');
    expect(e?.valor).toBe(3);
    expect(e?.por_defecto).toBe(false);
  });

  /**
   * Instrucción 12 de la Adenda: el margen es un parámetro normativo firmado, no
   * una constante del código. Sin él la variable NO se responde — antes se
   * respondía con una tolerancia del 50 % que nadie había aprobado.
   */
  it('sin el parámetro del margen la frecuencia no se responde', () => {
    const s = prellenarMatriz(CFG, {
      tipo_persona: 'fisica',
      frecuencia_esperada_anual: 2,
      operaciones_en_ventana: 5,
    });
    expect(s.find((x) => x.variable_codigo === 'XII-PTR-01')).toBeUndefined();
  });
});
