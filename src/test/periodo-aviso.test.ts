import { describe, expect, it } from 'vitest';
import {
  fechaLimite,
  mesActual,
  periodoCerrado,
  periodoDeApertura,
  periodosOfrecidos,
  situacionDelPeriodo,
  ultimoPeriodoCerrado,
} from '@/lib/aviso/periodo';

// El 2 de septiembre de 2026: el caso real que lo destapó. La pantalla ofrecía
// generar el aviso de septiembre —mes en curso— mientras el de agosto, que
// vence el 17 de septiembre, no aparecía.
const DOS_DE_SEPTIEMBRE = new Date(2026, 8, 2, 10, 0, 0);

describe('el periodo del aviso mensual', () => {
  it('el mes en curso NO se presenta', () => {
    const s = situacionDelPeriodo('2026-09', false, DOS_DE_SEPTIEMBRE);
    expect(s.estado).toBe('en_curso');
    expect(s.presentable).toBe(false);
  });

  it('y dice por qué, en vez de sólo deshabilitarse', () => {
    // Un control que se limita a bloquear enseña a pelearse con la pantalla.
    const s = situacionDelPeriodo('2026-09', false, DOS_DE_SEPTIEMBRE);
    expect(s.leyenda).toMatch(/todavía le pueden entrar actos/i);
    expect(s.leyenda).toMatch(/1 de octubre/i);
  });

  it('el mes cerrado sí, y es el que estaba escondido', () => {
    const s = situacionDelPeriodo('2026-08', false, DOS_DE_SEPTIEMBRE);
    expect(s.estado).toBe('por_presentar');
    expect(s.presentable).toBe(true);
  });

  it('con los días que faltan para el 17, contados', () => {
    const s = situacionDelPeriodo('2026-08', false, DOS_DE_SEPTIEMBRE);
    expect(s.diasParaElLimite).toBe(15);
    expect(s.leyenda).toMatch(/quedan 15 días/i);
  });

  it('el plazo vence al TERMINAR el día 17, no al empezarlo', () => {
    const limite = fechaLimite('2026-08');
    expect(limite.getMonth()).toBe(8); // septiembre
    expect(limite.getDate()).toBe(17);
    expect(limite.getHours()).toBe(23);

    // A las 09:00 del 17 todavía se está en plazo.
    const enLaManianaDel17 = new Date(2026, 8, 17, 9, 0, 0);
    expect(situacionDelPeriodo('2026-08', false, enLaManianaDel17).estado).toBe('por_presentar');
  });

  it('pasado el 17 queda fuera de plazo, y aun así se presenta', () => {
    const s = situacionDelPeriodo('2026-08', false, new Date(2026, 8, 20, 10, 0, 0));
    expect(s.estado).toBe('fuera_de_plazo');
    // Dejar de presentarlo no repara el retraso: lo agrava.
    expect(s.presentable).toBe(true);
    expect(s.leyenda).toMatch(/se presenta de todas formas/i);
  });

  it('un aviso ya presentado deja de pedirse, aunque fuera tarde', () => {
    const s = situacionDelPeriodo('2026-08', true, new Date(2026, 8, 20, 10, 0, 0));
    expect(s.estado).toBe('presentado');
  });

  it('diciembre cierra en enero del año siguiente', () => {
    expect(ultimoPeriodoCerrado(new Date(2027, 0, 5))).toBe('2026-12');
    const limite = fechaLimite('2026-12');
    expect(limite.getFullYear()).toBe(2027);
    expect(limite.getMonth()).toBe(0);
    expect(limite.getDate()).toBe(17);
  });

  it('periodoCerrado distingue el mes en curso del anterior', () => {
    expect(periodoCerrado('2026-09', DOS_DE_SEPTIEMBRE)).toBe(false);
    expect(periodoCerrado('2026-08', DOS_DE_SEPTIEMBRE)).toBe(true);
    expect(mesActual(DOS_DE_SEPTIEMBRE)).toBe('2026-09');
  });
});

describe('qué se ofrece y dónde se abre', () => {
  it('el último mes cerrado se ofrece SIEMPRE, tenga actos o no', () => {
    // Un periodo sin actos también se presenta, en ceros. Si no aparece en el
    // selector, nadie lo presenta.
    const ofrecidos = periodosOfrecidos([], DOS_DE_SEPTIEMBRE);
    expect(ofrecidos).toContain('2026-08');
  });

  it('el mes en curso se ofrece para que se VEA por qué no se presenta', () => {
    expect(periodosOfrecidos([], DOS_DE_SEPTIEMBRE)).toContain('2026-09');
  });

  it('y salen del más reciente al más antiguo, sin repetidos', () => {
    const ofrecidos = periodosOfrecidos(['2026-08', '2026-07', '2026-08'], DOS_DE_SEPTIEMBRE);
    expect(ofrecidos).toEqual(['2026-09', '2026-08', '2026-07']);
  });

  it('la pantalla NO abre en el mes en curso', () => {
    // Abrir en un periodo que no se puede presentar invita a presentarlo, que
    // es justo lo que pasaba.
    expect(periodoDeApertura(['2026-09', '2026-08'], DOS_DE_SEPTIEMBRE)).toBe('2026-08');
  });

  it('abre en el más reciente cerrado que tenga actos', () => {
    expect(periodoDeApertura(['2026-06', '2026-07'], DOS_DE_SEPTIEMBRE)).toBe('2026-07');
  });

  it('y si ninguno tiene actos, en el último mes cerrado', () => {
    expect(periodoDeApertura([], DOS_DE_SEPTIEMBRE)).toBe('2026-08');
    expect(periodoDeApertura(['2026-09'], DOS_DE_SEPTIEMBRE)).toBe('2026-08');
  });
});
