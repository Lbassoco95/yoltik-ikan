import { describe, expect, it } from 'vitest';
import {
  CASCADA_VACIA,
  motivoDelBloqueo,
  posteriorYaPracticado,
  type EstadoCascada,
} from '@/lib/riesgo/beneficiario-controlador';

/**
 * Las dos reglas de orden que la capa de API impone antes de escribir.
 *
 * Se prueban aquí y no en la pantalla porque son las que sostienen el
 * expediente ante una verificación: un paso II asentado sin haber agotado el I,
 * o un III que sobrevive a la corrección del I, son cascadas que no resisten
 * que las lean.
 */

const conEstado = (parcial: Partial<EstadoCascada>): EstadoCascada => ({
  ...CASCADA_VACIA,
  ...parcial,
});

describe('motivoDelBloqueo', () => {
  it('nombra los pasos que faltan, en plural cuando son dos', () => {
    expect(motivoDelBloqueo('III', CASCADA_VACIA)).toContain('los pasos I y II');
    expect(motivoDelBloqueo('II', CASCADA_VACIA)).toContain('el paso I');
  });

  it('distingue «falta practicarlo» de «la cascada ya terminó»', () => {
    // Son dos bloqueos con causas opuestas y la pantalla tiene que poder
    // decirlas distinto: en uno hay trabajo pendiente, en el otro no hay nada
    // que hacer.
    const resuelta = conEstado({ I: 'practicado_con_resultado' });
    expect(motivoDelBloqueo('II', resuelta)).toContain('ya arrojó beneficiarios');
    expect(motivoDelBloqueo('II', resuelta)).not.toContain('falta practicar');
  });
});

describe('posteriorYaPracticado', () => {
  it('no estorba cuando el paso se asienta sin resultado', () => {
    const conIII = conEstado({
      I: 'practicado_sin_resultado',
      II: 'practicado_sin_resultado',
      III: 'practicado_con_resultado',
    });
    expect(posteriorYaPracticado('I', 'practicado_sin_resultado', conIII)).toBeNull();
  });

  it('detecta el paso posterior que quedaría colgando', () => {
    const conIII = conEstado({
      I: 'practicado_sin_resultado',
      II: 'practicado_sin_resultado',
      III: 'practicado_con_resultado',
    });
    // Corregir el I a «con resultado» dejaría un II y un III practicados
    // después de que la búsqueda ya había terminado. Se avisa del primero.
    expect(posteriorYaPracticado('I', 'practicado_con_resultado', conIII)).toBe('II');
  });

  it('el paso III nunca tiene posteriores', () => {
    const todos = conEstado({
      I: 'practicado_sin_resultado',
      II: 'practicado_sin_resultado',
      III: 'practicado_con_resultado',
    });
    expect(posteriorYaPracticado('III', 'practicado_con_resultado', todos)).toBeNull();
  });

  it('no bloquea cuando no hay nada practicado después', () => {
    const soloI = conEstado({ I: 'practicado_sin_resultado' });
    expect(posteriorYaPracticado('I', 'practicado_con_resultado', soloI)).toBeNull();
  });
});
