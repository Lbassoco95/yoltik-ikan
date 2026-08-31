import { describe, it, expect } from 'vitest';
import {
  ACTIVIDADES_VULNERABLES,
  actividadPorSector,
  etiquetaFraccion,
} from '@/lib/actividades-vulnerables';

describe('catálogo de actividades vulnerables', () => {
  it('la fracción XII es fe pública, no vehículos', () => {
    // ConfigPage decía que XII era vehículos y XIII fe pública. En una
    // plataforma de cumplimiento eso es una afirmación falsa sobre la ley.
    expect(actividadPorSector('XII')?.nombre).toBe('Fe pública');
    expect(actividadPorSector('VIII')?.nombre).toBe('Vehículos');
  });

  it('la fracción XVI es activos virtuales', () => {
    expect(actividadPorSector('XVI')?.nombre).toBe('Activos virtuales');
  });

  it('V Bis es una fracción distinta de V', () => {
    const v = ACTIVIDADES_VULNERABLES.find((a) => a.fraccion === 'V');
    const vBis = ACTIVIDADES_VULNERABLES.find((a) => a.fraccion === 'V Bis');
    expect(v?.nombre).toBe('Inmuebles');
    expect(vBis?.nombre).toBe('Desarrollo inmobiliario');
    expect(v).not.toBe(vBis);
  });

  it('no hay fracciones repetidas', () => {
    const fracciones = ACTIVIDADES_VULNERABLES.map((a) => a.fraccion);
    expect(new Set(fracciones).size).toBe(fracciones.length);
  });

  it('cada sector del enum aparece una sola vez', () => {
    const sectores = ACTIVIDADES_VULNERABLES.map((a) => a.sector).filter(Boolean);
    expect(new Set(sectores).size).toBe(sectores.length);
  });

  it('cubre los sectores que el modelo de datos soporta', () => {
    // Son los valores del enum `sector_av` (migrations 0001 y 0006).
    for (const s of ['IV', 'V', 'VII', 'VIII', 'XII', 'XV', 'XVI']) {
      expect(actividadPorSector(s), `falta el sector ${s}`).toBeDefined();
    }
  });

  it('etiqueta la fracción de forma legible, y no truena con una desconocida', () => {
    expect(etiquetaFraccion('XII')).toBe('Fracción XII · Fe pública');
    expect(etiquetaFraccion('ZZ')).toBe('Fracción ZZ');
  });
});
