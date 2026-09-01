import { describe, it, expect } from 'vitest';
import { riesgoPaisMaximo, nivelDePais, claveDeNivel } from '@/lib/riesgo/pais';

/**
 * Instrucción 6 y 7 de la Adenda 1: el país deja de ser uno solo, y el llamado
 * a la acción sale del puntaje.
 */

const LISTAS = {
  gafi_gris: new Set(['PA', 'TR']),
  gafi_negra: new Set(['KP', 'IR', 'MM']),
  plenario: '2026-06',
};

describe('riesgo país · el más alto de los tres', () => {
  it('un mexicano con todo en México sale nacional', () => {
    const r = riesgoPaisMaximo(
      [
        { rol: 'nacionalidad', iso2: 'MX' },
        { rol: 'residencia', iso2: 'MX' },
        { rol: 'origen_recursos', iso2: 'MX' },
      ],
      LISTAS,
    );
    expect(r?.nivel).toBe('nacional');
    expect(r?.llamado_a_la_accion).toBe(false);
  });

  /**
   * El caso que la Adenda nombra: la matriz anterior no distinguía a este
   * cliente de uno que paga con recursos locales, porque sólo miraba la
   * residencia.
   */
  it('un mexicano residente en México que paga con recursos de lista gris NO sale nacional', () => {
    const r = riesgoPaisMaximo(
      [
        { rol: 'nacionalidad', iso2: 'MX' },
        { rol: 'residencia', iso2: 'MX' },
        { rol: 'origen_recursos', iso2: 'PA' },
      ],
      LISTAS,
    );
    expect(r?.nivel).toBe('monitoreo_intensificado');
    expect(r?.determinante.rol).toBe('origen_recursos');
    expect(r?.fuente).toContain('origen de los recursos');
  });

  it('toma el más alto, no el promedio ni el primero', () => {
    const r = riesgoPaisMaximo(
      [
        { rol: 'nacionalidad', iso2: 'ES' },
        { rol: 'residencia', iso2: 'MX' },
        { rol: 'origen_recursos', iso2: 'KP' },
      ],
      LISTAS,
    );
    expect(r?.nivel).toBe('llamado_a_la_accion');
    expect(r?.determinante.iso2).toBe('KP');
  });

  it('sin ningún país capturado devuelve null: eso no es «riesgo bajo»', () => {
    expect(riesgoPaisMaximo([], LISTAS)).toBeNull();
    expect(
      riesgoPaisMaximo([{ rol: 'residencia', iso2: null }], LISTAS),
    ).toBeNull();
  });

  it('ignora valores que no son ISO2', () => {
    const r = riesgoPaisMaximo(
      [
        { rol: 'residencia', iso2: 'México' },
        { rol: 'nacionalidad', iso2: 'MX' },
      ],
      LISTAS,
    );
    expect(r?.considerados).toHaveLength(1);
    expect(r?.considerados[0].rol).toBe('nacionalidad');
  });

  it('la explicación nombra el plenario contra el que se calificó', () => {
    const r = riesgoPaisMaximo([{ rol: 'residencia', iso2: 'TR' }], LISTAS);
    expect(r?.plenario).toBe('2026-06');
    expect(r?.fuente).toContain('2026-06');
  });

  it('sin plenario en el snapshot no lo inventa', () => {
    const r = riesgoPaisMaximo([{ rol: 'residencia', iso2: 'TR' }], {
      gafi_gris: LISTAS.gafi_gris,
      gafi_negra: LISTAS.gafi_negra,
    });
    expect(r?.plenario).toBeNull();
    expect(r?.fuente).not.toContain('plenario');
  });
});

describe('llamado a la acción · bandera de flujo, no de puntaje', () => {
  /**
   * Apartado 4.3: para puntuar, agrupar gris y negra es aceptable. Para el
   * flujo no lo es, porque el llamado a la acción conlleva contramedidas.
   */
  it('gris y negra dan la MISMA clave de puntaje', () => {
    expect(claveDeNivel('monitoreo_intensificado')).toBe('riesgo');
    expect(claveDeNivel('llamado_a_la_accion')).toBe('riesgo');
  });

  it('pero sólo la negra levanta la bandera', () => {
    const gris = riesgoPaisMaximo([{ rol: 'residencia', iso2: 'PA' }], LISTAS);
    const negra = riesgoPaisMaximo([{ rol: 'residencia', iso2: 'IR' }], LISTAS);
    expect(gris?.llamado_a_la_accion).toBe(false);
    expect(negra?.llamado_a_la_accion).toBe(true);
  });

  /** La bandera mira TODOS los países, no sólo el que mandó en el puntaje. */
  it('la levanta un país en lista negra aunque no sea el determinante único', () => {
    const r = riesgoPaisMaximo(
      [
        { rol: 'nacionalidad', iso2: 'KP' },
        { rol: 'origen_recursos', iso2: 'MM' },
      ],
      LISTAS,
    );
    expect(r?.llamado_a_la_accion).toBe(true);
  });
});

describe('nivelDePais', () => {
  it('México es nacional, no «sin observaciones»', () => {
    expect(nivelDePais('MX', LISTAS)).toBe('nacional');
    expect(nivelDePais('mx', LISTAS)).toBe('nacional');
  });
  it('un país que no está en ninguna lista es sin observaciones', () => {
    expect(nivelDePais('ES', LISTAS)).toBe('sin_observaciones');
  });
  it('sin snapshot cargado, ningún país es de riesgo: no inventa listas', () => {
    expect(nivelDePais('KP', {})).toBe('sin_observaciones');
  });
});
