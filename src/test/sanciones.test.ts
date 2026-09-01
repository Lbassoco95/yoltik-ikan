import { describe, expect, it } from 'vitest';
import {
  estaBloqueado,
  indicadorDeSanciones,
  riesgoDeSanciones,
  sancionesDePais,
  type ListasSanciones,
} from '@/lib/riesgo/sanciones';

/**
 * Adenda 3, instrucción 28. Lo que estas pruebas cuidan es que las dos fuentes
 * no se confundan entre sí ni con el GAFI: pesan distinto y significan cosas
 * distintas, y un booleano «sancionado» perdería justo eso.
 */

const LISTAS: ListasSanciones = {
  onu: new Map([
    ['IR', 'riesgo_alto'],
    ['KP', 'riesgo_alto'],
    ['SO', 'riesgo_alto'],
  ]),
  ofac: new Map([
    ['IR', 'prohibicion'],
    ['KP', 'prohibicion'],
    ['CU', 'prohibicion'],
    ['VE', 'riesgo_alto'],
    ['RU', 'riesgo_alto'],
  ]),
  lectura: '01/09/2026',
};

describe('sancionesDePais', () => {
  it('dice QUÉ autoridades alcanzan al país, no si sí o no', () => {
    // Irán está bajo la resolución 1737 y bajo el programa de OFAC. «Sancionado»
    // y «sancionado por dos autoridades independientes» no son lo mismo.
    const s = sancionesDePais('IR', LISTAS);
    expect(s.map((x) => x.autoridad).sort()).toEqual(['ofac', 'onu']);
  });

  it('un país sólo en una fuente devuelve sólo esa', () => {
    expect(sancionesDePais('CU', LISTAS)).toEqual([
      { autoridad: 'ofac', nivel: 'prohibicion' },
    ]);
    expect(sancionesDePais('SO', LISTAS)).toEqual([{ autoridad: 'onu', nivel: 'riesgo_alto' }]);
  });

  it('no distingue mayúsculas ni espacios', () => {
    expect(sancionesDePais(' ir ', LISTAS)).toHaveLength(2);
  });

  it('un país limpio no devuelve nada', () => {
    expect(sancionesDePais('ES', LISTAS)).toEqual([]);
  });
});

describe('riesgoDeSanciones', () => {
  it('sin países capturados devuelve null, no riesgo bajo', () => {
    // Un país sin capturar no es un país limpio. Devolver un objeto con nivel
    // bajo sería afirmar algo que nadie comprobó.
    expect(riesgoDeSanciones([], LISTAS)).toBeNull();
    expect(riesgoDeSanciones([{ rol: 'nacionalidad', iso2: null }], LISTAS)).toBeNull();
  });

  it('ningún país alcanzado devuelve null', () => {
    expect(riesgoDeSanciones([{ rol: 'nacionalidad', iso2: 'MX' }], LISTAS)).toBeNull();
  });

  it('toma el más severo de todos los capturados, no el primero', () => {
    const r = riesgoDeSanciones(
      [
        { rol: 'nacionalidad', iso2: 'VE' }, // riesgo alto
        { rol: 'origen_recursos', iso2: 'CU' }, // prohibición
      ],
      LISTAS,
    );
    expect(r?.nivel).toBe('prohibicion');
    expect(r?.determinante.iso2).toBe('CU');
    expect(r?.determinante.rol).toBe('origen_recursos');
  });

  it('reporta todos los alcanzados, para poder auditar la comparación', () => {
    const r = riesgoDeSanciones(
      [
        { rol: 'nacionalidad', iso2: 'VE' },
        { rol: 'residencia', iso2: 'MX' },
        { rol: 'origen_recursos', iso2: 'RU' },
      ],
      LISTAS,
    );
    expect(r?.alcanzados.map((a) => a.iso2).sort()).toEqual(['RU', 'VE']);
  });

  it('la presencia de la ONU se reporta aparte del nivel', () => {
    // Cambia el TIPO de argumento, no su intensidad: una resolución vincula a
    // México; una designación de OFAC se pondera.
    const soloOfac = riesgoDeSanciones([{ rol: 'nacionalidad', iso2: 'VE' }], LISTAS);
    expect(soloOfac?.hay_onu).toBe(false);

    const conOnu = riesgoDeSanciones([{ rol: 'nacionalidad', iso2: 'SO' }], LISTAS);
    expect(conOnu?.hay_onu).toBe(true);
    // Y sin ser prohibición: son dos ejes distintos.
    expect(conOnu?.nivel).toBe('riesgo_alto');
  });

  it('el motivo nombra el rol, el país, las autoridades y la lectura', () => {
    const r = riesgoDeSanciones([{ rol: 'residencia', iso2: 'IR' }], LISTAS);
    expect(r?.motivo).toContain('el país de residencia');
    expect(r?.motivo).toContain('IR');
    expect(r?.motivo).toContain('Consejo de Seguridad');
    expect(r?.motivo).toContain('OFAC');
    expect(r?.motivo).toContain('01/09/2026');
  });

  it('sin fecha de lectura el motivo no la inventa', () => {
    const r = riesgoDeSanciones([{ rol: 'nacionalidad', iso2: 'CU' }], {
      ofac: LISTAS.ofac,
    });
    expect(r?.lectura).toBeNull();
    expect(r?.motivo).not.toContain('según la lectura');
  });
});

describe('el bloqueo y el piso son cosas distintas', () => {
  it('sólo la prohibición bloquea', () => {
    // «No se resuelve con puntos», dice la adenda. Un piso deja el expediente
    // en banda alta y permite seguir; aquí lo que procede es detener y escalar.
    const prohibicion = riesgoDeSanciones([{ rol: 'nacionalidad', iso2: 'CU' }], LISTAS);
    const alto = riesgoDeSanciones([{ rol: 'nacionalidad', iso2: 'VE' }], LISTAS);
    expect(estaBloqueado(prohibicion)).toBe(true);
    expect(estaBloqueado(alto)).toBe(false);
    expect(estaBloqueado(null)).toBe(false);
  });

  it('pero el indicador de piso se levanta con cualquiera de los dos', () => {
    // El nivel 2 va a la matriz como piso; el nivel 1 también levanta el piso,
    // además de bloquear. Lo que no puede pasar es que un país bajo embargo
    // quede fuera de la matriz por estar bloqueado en otro sitio.
    const prohibicion = riesgoDeSanciones([{ rol: 'nacionalidad', iso2: 'CU' }], LISTAS);
    const alto = riesgoDeSanciones([{ rol: 'nacionalidad', iso2: 'VE' }], LISTAS);
    expect(indicadorDeSanciones(prohibicion)).toBe(true);
    expect(indicadorDeSanciones(alto)).toBe(true);
    expect(indicadorDeSanciones(null)).toBe(false);
  });
});

// =====================================================================
// De punta a punta: el indicador tiene que levantar el piso de verdad
// =====================================================================
// Que el indicador esté en la configuración no prueba nada: un indicador
// listado y sin disparador se lee en la plantilla como si el control existiera,
// que es peor que no tenerlo. Esto comprueba que el piso sale.
import { evaluarMatriz } from '@/lib/riesgo/matriz';
import { INDICADOR_PAIS_SANCIONADO } from '@/lib/riesgo/sanciones';
import type { MatrizConfig } from '@/types/domain';

const CONFIG_CON_PISO: MatrizConfig = {
  elementos: [
    {
      codigo: 'E1',
      nombre: 'Productos',
      variables: [{ codigo: 'PROD-01', pregunta: '?', opciones: [{ valor: 1, label: 'bajo' }] }],
    },
  ],
  escala_cliente: {
    bajo: { min: 0, max: 33, acciones: '' },
    medio: { min: 34, max: 66, acciones: '' },
    alto: { min: 67, max: 100, acciones: '' },
  },
  escala_normalizada: true,
  indicadores: [
    {
      codigo: INDICADOR_PAIS_SANCIONADO,
      pregunta: '¿País bajo sanciones?',
      descripcion: 'Piso de banda alta.',
      efecto: 'piso',
    },
  ],
  triggers_alto_de_oficio: [
    {
      codigo: INDICADOR_PAIS_SANCIONADO,
      descripcion: 'País bajo régimen de sanciones.',
      indicador_codigo: INDICADOR_PAIS_SANCIONADO,
    },
  ],
};

describe('el indicador levanta el piso en la evaluación', () => {
  it('sin la bandera, la respuesta más baja da banda baja', () => {
    const r = evaluarMatriz(CONFIG_CON_PISO, 'fisica', { 'PROD-01': 1 }, {
      indicadores: { [INDICADOR_PAIS_SANCIONADO]: false },
    });
    expect(r.clasificacion).toBe('bajo');
  });

  it('con la bandera, la MISMA respuesta da banda alta', () => {
    // Es el punto entero del piso: no suma puntos, cambia la banda. Si esto
    // fallara, un país sancionado quedaría compensado por respuestas buenas y
    // la matriz saldría en verde.
    const r = evaluarMatriz(CONFIG_CON_PISO, 'fisica', { 'PROD-01': 1 }, {
      indicadores: { [INDICADOR_PAIS_SANCIONADO]: true },
    });
    expect(r.clasificacion).toBe('alto');
  });

  it('y el disparador queda nombrado, para que el OC sepa cuál fue', () => {
    const r = evaluarMatriz(CONFIG_CON_PISO, 'fisica', { 'PROD-01': 1 }, {
      indicadores: { [INDICADOR_PAIS_SANCIONADO]: true },
    });
    expect(r.triggers_activados).toContain(INDICADOR_PAIS_SANCIONADO);
  });
});
