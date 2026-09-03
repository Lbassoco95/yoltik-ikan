import { describe, expect, it } from 'vitest';
import {
  faltaSubdivision,
  nivelTerritorial,
  paisDelDomicilio,
  type Subdivision,
} from '@/lib/riesgo/subdivision';

const CRIMEA: Subdivision = {
  clave: 'UA-43',
  pais_iso2: 'UA',
  nombre: 'República Autónoma de Crimea',
  nivel_territorial: 'prohibicion',
  derivacion: 'OE 13685 y 31 CFR § 589.306.',
  pendiente_confirmacion: false,
};
const JERSON: Subdivision = { ...CRIMEA, clave: 'UA-65', nombre: 'Óblast de Jersón', pendiente_confirmacion: true };
const TRANQUILA: Subdivision = { ...CRIMEA, clave: 'IR-07', pais_iso2: 'IR', nombre: 'Provincia', nivel_territorial: 'riesgo_alto', pendiente_confirmacion: false };

describe('la subdivisión gana cuando es más severa', () => {
  it('Crimea sale en prohibición aunque Ucrania sea riesgo alto', () => {
    // Sin esto, la operación con la región ocupada pasaba como riesgo alto y
    // seguía adelante.
    const r = nivelTerritorial('riesgo_alto', CRIMEA);
    expect(r?.nivel).toBe('prohibicion');
    expect(r?.origen).toBe('subdivision');
  });

  it('sin subdivisión, Ucrania es riesgo alto y no prohibición', () => {
    // La otra mitad: poner el país entero en prohibición sobrebloquearía a un
    // compareciente de Leópolis.
    const r = nivelTerritorial('riesgo_alto', null);
    expect(r?.nivel).toBe('riesgo_alto');
    expect(r?.origen).toBe('pais');
  });

  it('NUNCA rebaja el país', () => {
    // Dejar que rebajara convertiría el campo en una vía para sacar
    // expedientes del radar.
    const r = nivelTerritorial('prohibicion', TRANQUILA);
    expect(r?.nivel).toBe('prohibicion');
    expect(r?.origen).toBe('pais');
  });

  it('una subdivisión sin país también cuenta', () => {
    const r = nivelTerritorial(null, CRIMEA);
    expect(r?.nivel).toBe('prohibicion');
    expect(r?.origen).toBe('subdivision');
  });

  it('sin país ni subdivisión devuelve null, no riesgo bajo', () => {
    expect(nivelTerritorial(null, null)).toBeNull();
  });

  it('marca las que están pendientes de confirmación', () => {
    expect(nivelTerritorial('riesgo_alto', JERSON)?.detalle).toContain('pendiente de confirmación');
    expect(nivelTerritorial('riesgo_alto', CRIMEA)?.detalle).not.toContain('pendiente');
  });
});

describe('cuándo falta capturarla', () => {
  const EXIGEN = new Set(['UA', 'RU']);

  it('sólo en los países que la exigen', () => {
    expect(faltaSubdivision('UA', null, EXIGEN)).toBe(true);
    expect(faltaSubdivision('ES', null, EXIGEN)).toBe(false);
  });

  it('con la subdivisión puesta, deja de faltar', () => {
    expect(faltaSubdivision('UA', 'UA-43', EXIGEN)).toBe(false);
  });

  it('una subdivisión en blanco no cuenta como puesta', () => {
    expect(faltaSubdivision('UA', '   ', EXIGEN)).toBe(true);
  });

  it('sin país capturado no se pide nada', () => {
    expect(faltaSubdivision(null, null, EXIGEN)).toBe(false);
  });
});

describe('de qué país se pide', () => {
  it('del domicilio y NO de la nacionalidad', () => {
    // Una persona ucraniana que vive en México no tiene domicilio en una región
    // ocupada. Pedírsela por su pasaporte sería marcar por nacionalidad, que es
    // justo lo que la Adenda 3 dice que no se hace.
    expect(
      paisDelDomicilio({ tipo_persona: 'fisica', pais_residencia_iso2: 'MX' }),
    ).toBe('MX');
  });

  it('en persona moral, de la jurisdicción de constitución', () => {
    expect(
      paisDelDomicilio({
        tipo_persona: 'moral',
        pais_constitucion_clave: 'UA',
        pais_residencia_iso2: 'MX',
      }),
    ).toBe('UA');
  });

  it('null cuando no hay ninguno', () => {
    expect(paisDelDomicilio({ tipo_persona: 'fisica' })).toBeNull();
  });

  it('sin cliente devuelve null en vez de reventar', () => {
    // El caso real: los hooks de React corren TODOS antes de cualquier return,
    // así que esto se llama en el primer render, cuando la consulta del
    // expediente todavía no respondió. Exigir el objeto dejaba la pantalla del
    // compareciente en blanco en cada visita.
    expect(paisDelDomicilio(undefined)).toBeNull();
    expect(paisDelDomicilio(null)).toBeNull();
  });
});

describe('«ninguna de las listadas» es una respuesta', () => {
  const EXIGEN = new Set(['UA', 'RU']);

  it('contestar que está fuera de la lista quita el pendiente', () => {
    // Sin esta distinción el aviso no se puede quitar contestando, y un aviso
    // que no se puede quitar enseña a ignorarlo.
    expect(faltaSubdivision('UA', null, EXIGEN, true)).toBe(false);
  });

  it('y no contestarlo lo mantiene', () => {
    expect(faltaSubdivision('UA', null, EXIGEN, false)).toBe(true);
  });
});
