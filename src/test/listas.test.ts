import { describe, it, expect } from 'vitest';
import {
  validarMovimiento,
  esRfcPlausible,
  normalizarRfc,
  movimientoVacio,
  admiteCapturaManual,
  type ListaFuente,
  type MovimientoCaptura,
} from '@/lib/listas';

function mov(over: Partial<MovimientoCaptura> = {}): MovimientoCaptura {
  return {
    ...movimientoVacio(),
    nombre: 'Juan Ramírez Peña',
    oficio_numero: '110-05/2026-0341',
    oficio_fecha: '2026-03-10',
    ...over,
  };
}

function fuente(over: Partial<ListaFuente> = {}): ListaFuente {
  return {
    id: 'f1', codigo: 'uif_bloqueadas', nombre: 'Personas Bloqueadas',
    autoridad: 'UIF', naturaleza: 'sancion_aml', modo_actualizacion: 'movimientos',
    url_oficial: null, frecuencia_objetivo: null,
    obligatoria: true, activa: true, notas: null,
    ...over,
  };
}

describe('validación de movimientos de lista', () => {
  it('acepta un movimiento completo', () => {
    expect(validarMovimiento(mov())).toEqual([]);
  });

  it('exige el nombre', () => {
    expect(validarMovimiento(mov({ nombre: '   ' }))).toContainEqual(
      expect.stringContaining('nombre'),
    );
  });

  it('exige el número de oficio aunque el esquema lo permita nulo', () => {
    // Es lo que respalda el movimiento: una baja sin oficio no es defendible.
    expect(validarMovimiento(mov({ oficio_numero: '' }))).toContainEqual(
      expect.stringContaining('oficio'),
    );
  });

  it('acepta que no venga RFC (hay personas listadas sin él)', () => {
    expect(validarMovimiento(mov({ rfc: '' }))).toEqual([]);
  });

  it('rechaza un RFC con forma inválida', () => {
    expect(validarMovimiento(mov({ rfc: '123' }))).toContainEqual(
      expect.stringContaining('RFC'),
    );
  });

  it('rechaza una fecha de oficio en el futuro', () => {
    const futuro = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    expect(validarMovimiento(mov({ oficio_fecha: futuro }))).toContainEqual(
      expect.stringContaining('futuro'),
    );
  });
});

describe('RFC', () => {
  it('acepta forma de persona física (13) y moral (12)', () => {
    expect(esRfcPlausible('RAPJ800101AB1')).toBe(true);
    expect(esRfcPlausible('IDB240101XX2')).toBe(true);
  });

  it('acepta minúsculas y espacios alrededor', () => {
    expect(esRfcPlausible('  rapj800101ab1  ')).toBe(true);
  });

  it('rechaza lo que no tiene forma de RFC', () => {
    expect(esRfcPlausible('ABC')).toBe(false);
    expect(esRfcPlausible('12345678901234')).toBe(false);
  });

  it('normaliza igual que la base: mayúsculas, y vacío es null', () => {
    expect(normalizarRfc('  rapj800101ab1 ')).toBe('RAPJ800101AB1');
    expect(normalizarRfc('   ')).toBeNull();
  });
});

describe('qué fuentes admiten captura manual', () => {
  it('sólo las que se actualizan por movimientos', () => {
    expect(admiteCapturaManual(fuente())).toBe(true);
    expect(admiteCapturaManual(fuente({ modo_actualizacion: 'snapshot' }))).toBe(false);
  });

  it('una fuente inactiva no admite captura', () => {
    expect(admiteCapturaManual(fuente({ activa: false }))).toBe(false);
  });
});
