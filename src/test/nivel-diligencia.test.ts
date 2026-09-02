import { describe, expect, it } from 'vitest';
import {
  NIVEL_POR_DEFECTO,
  esDegradacion,
  esPromocion,
  nivelQueLeToca,
  nivelResultante,
} from '@/lib/riesgo/nivel-diligencia';

/**
 * Adenda 4, apartado 7. Lo que estas pruebas sostienen es la asimetría: se sube
 * solo, se baja a mano. Si la degradación se volviera automática, bastaría con
 * que un cliente dejara de operar unos meses para que el sistema le limpiara el
 * historial solo, y eso no se vería en ninguna pantalla.
 */

describe('el nivel por defecto', () => {
  it('es N2, no N1', () => {
    // El cambio central de la instrucción 42. N1 es diligencia SIMPLIFICADA, y
    // nacer ahí afirma que un cliente del que no se sabe nada cumple los
    // supuestos que las Reglas permiten simplificar.
    expect(NIVEL_POR_DEFECTO).toBe('N2');
  });

  it('un expediente sin hechos conocidos exige N2', () => {
    expect(nivelQueLeToca({}).nivel).toBe('N2');
  });

  it('no se llega a N1 por omisión, sólo afirmándolo', () => {
    // Un cliente del que no consta que sea ente público ni emisora no es
    // ninguna de las dos cosas.
    expect(nivelQueLeToca({ clasificacion: 'bajo' }).nivel).toBe('N2');
    expect(nivelQueLeToca({ simplificacion_admisible: false }).nivel).toBe('N2');
    expect(nivelQueLeToca({ simplificacion_admisible: true }).nivel).toBe('N1');
  });
});

describe('qué exige N3', () => {
  it('la banda alta', () => {
    expect(nivelQueLeToca({ clasificacion: 'alto' }).nivel).toBe('N3');
    expect(nivelQueLeToca({ clasificacion: 'alto_oficio' }).nivel).toBe('N3');
  });

  it('cualquier piso activo, aunque la banda no sea alta', () => {
    const r = nivelQueLeToca({
      clasificacion: 'medio',
      motivo_alto_de_oficio: 'País bajo llamado a la acción del GAFI',
    });
    expect(r.nivel).toBe('N3');
    expect(r.motivos.join(' ')).toContain('GAFI');
  });

  it('haber recurrido al paso III, aunque no se haya vuelto a evaluar', () => {
    // Esperar a la siguiente evaluación dejaría el expediente en N2 mientras su
    // estructura de control está sin determinar.
    const r = nivelQueLeToca({ clasificacion: 'bajo', paso_iii_practicado: true });
    expect(r.nivel).toBe('N3');
    expect(r.motivos.join(' ')).toContain('23 Quinquies');
  });

  it('la simplificación no gana a un piso', () => {
    // Ser ente público no exime de la diligencia reforzada si hay un piso: son
    // dos cosas distintas y la simplificación es la más débil.
    const r = nivelQueLeToca({
      simplificacion_admisible: true,
      motivo_alto_de_oficio: 'Compareciente PPE extranjero',
    });
    expect(r.nivel).toBe('N3');
  });

  it('siempre dice por qué', () => {
    // Un nivel sin motivo no se puede explicar ni discutir.
    expect(nivelQueLeToca({ clasificacion: 'alto' }).motivos.length).toBeGreaterThan(0);
    expect(nivelQueLeToca({}).motivos.length).toBeGreaterThan(0);
  });
});

describe('la asimetría: sube solo, baja a mano', () => {
  it('sube en cuanto los hechos lo exigen', () => {
    const r = nivelResultante('N2', { clasificacion: 'alto' });
    expect(r.nivel).toBe('N3');
    expect(r.cambio).toBe('sube');
  });

  it('sube desde N1 también', () => {
    expect(nivelResultante('N1', {}).nivel).toBe('N2');
    expect(nivelResultante('N1', { clasificacion: 'alto' }).nivel).toBe('N3');
  });

  it('NO baja, aunque los hechos hoy exigirían menos', () => {
    // La comprobación que sostiene todo lo demás. Un cliente que fue alto y
    // ahora sale medio se queda en N3 hasta que alguien firme la bajada.
    const r = nivelResultante('N3', { clasificacion: 'medio' });
    expect(r.nivel).toBe('N3');
    expect(r.cambio).toBe('baja pendiente de firma');
  });

  it('y avisa de que la bajada está pendiente, en vez de callarse', () => {
    const r = nivelResultante('N3', { clasificacion: 'bajo' });
    expect(r.motivos.join(' ')).toContain('decisión firmada');
    expect(r.motivos.join(' ')).toContain('N2');
  });

  it('tampoco baja de N2 a N1 sola', () => {
    // Aunque el cliente resulte ser ente público de riesgo bajo: la
    // simplificación se declara, no se cae en ella.
    const r = nivelResultante('N2', { simplificacion_admisible: true });
    expect(r.nivel).toBe('N2');
    expect(r.cambio).toBe('baja pendiente de firma');
  });

  it('sin cambio cuando los hechos coinciden con lo que ya tenía', () => {
    expect(nivelResultante('N2', {}).cambio).toBe('sin cambio');
    expect(nivelResultante('N3', { clasificacion: 'alto' }).cambio).toBe('sin cambio');
  });
});

describe('promoción y degradación', () => {
  it('se reconocen en los dos sentidos', () => {
    expect(esPromocion('N1', 'N3')).toBe(true);
    expect(esPromocion('N2', 'N2')).toBe(false);
    expect(esDegradacion('N3', 'N1')).toBe(true);
    expect(esDegradacion('N2', 'N3')).toBe(false);
  });
});
