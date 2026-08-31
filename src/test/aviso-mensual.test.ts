import { describe, it, expect } from 'vitest';
import {
  evaluarAvisoMensual, tipoAvisoSugerido,
  type HallazgoDelPeriodo, type OperacionDelPeriodo,
} from '@/lib/aviso-mensual';

const HOY = new Date('2026-09-05T12:00:00Z');

function op(over: Partial<OperacionDelPeriodo> = {}): OperacionDelPeriodo {
  return {
    id: 'op-1', tipo_acto: 'constitucion_personas_morales',
    monto_mxn: 1_000_000, fecha: '2026-08-15', rebasa_umbral: false,
    // Evaluada por defecto: cada prueba de umbral o de hallazgo quiere aislar
    // ESO. La falta de evaluación tiene sus propias pruebas más abajo.
    evaluada: true, canal: 'sppld', ...over,
  };
}
function hal(over: Partial<HallazgoDelPeriodo> = {}): HallazgoDelPeriodo {
  return {
    id: 'h-1', folio: 'XII-2026-1', tipologia_codigo: 'XII-02',
    estado: 'abierto', fecha_compromiso: '2026-10-31', ...over,
  };
}

describe('el umbral bloquea el informe en ceros', () => {
  it('no deja presentar en ceros si una operación rebasó el umbral', () => {
    // La obligación ya nació: la disparó el monto, no el criterio de nadie.
    const ev = evaluarAvisoMensual([op({ rebasa_umbral: true })], [], HOY);
    expect(ev.puedeEnCeros).toBe(false);
    expect(ev.bloqueos).toHaveLength(1);
    expect(ev.bloqueos[0].motivo).toMatch(/umbral/i);
    expect(ev.bloqueos[0].operaciones).toEqual(['op-1']);
  });

  it('sí deja presentar en ceros si ninguna lo rebasó', () => {
    const ev = evaluarAvisoMensual([op({ rebasa_umbral: false })], [], HOY);
    expect(ev.puedeEnCeros).toBe(true);
    expect(ev.bloqueos).toEqual([]);
  });

  it('sin operaciones, en ceros es lo que corresponde', () => {
    const ev = evaluarAvisoMensual([], [], HOY);
    expect(ev.puedeEnCeros).toBe(true);
    expect(tipoAvisoSugerido(ev)).toBe('en_ceros');
  });

  it('con operaciones sobre umbral, sugiere el aviso con operaciones', () => {
    const ev = evaluarAvisoMensual([op({ rebasa_umbral: true })], [], HOY);
    expect(tipoAvisoSugerido(ev)).toBe('con_operaciones');
  });
});

describe('los hallazgos abiertos recuerdan, nunca bloquean', () => {
  it('un hallazgo abierto dentro de su plazo no impide presentar', () => {
    // El OC se comprometió a resolverlo después; el aviso del periodo no espera.
    const ev = evaluarAvisoMensual([], [hal({ fecha_compromiso: '2026-10-31' })], HOY);
    expect(ev.puedeEnCeros).toBe(true);
    expect(ev.bloqueos).toEqual([]);
    expect(ev.recordatorios.some((r) => /en curso/i.test(r.motivo))).toBe(true);
  });

  it('un compromiso vencido tampoco bloquea, sólo avisa', () => {
    const ev = evaluarAvisoMensual([], [hal({ fecha_compromiso: '2026-08-31' })], HOY);
    expect(ev.puedeEnCeros).toBe(true);
    expect(ev.recordatorios.some((r) => /vencido/i.test(r.motivo))).toBe(true);
  });

  it('marca los que nadie planeó, que son los que se quedan olvidados', () => {
    const ev = evaluarAvisoMensual([], [hal({ fecha_compromiso: null })], HOY);
    expect(ev.recordatorios.some((r) => /sin fecha/i.test(r.motivo))).toBe(true);
  });

  it('un hallazgo ya resuelto no genera recordatorio', () => {
    const ev = evaluarAvisoMensual([], [hal({ estado: 'descartado' })], HOY);
    expect(ev.recordatorios).toEqual([]);
  });

  it('muchos hallazgos abiertos siguen sin bloquear: sólo el umbral bloquea', () => {
    const muchos = Array.from({ length: 20 }, (_, i) =>
      hal({ id: `h-${i}`, fecha_compromiso: null }));
    const ev = evaluarAvisoMensual([], muchos, HOY);
    expect(ev.puedeEnCeros).toBe(true);
  });
});

describe('los inmuebles no se reportan por aquí', () => {
  it('los separa del aviso y avisa que van por DeclaraNOT', () => {
    const ev = evaluarAvisoMensual(
      [op({ id: 'inm', tipo_acto: 'transmision_inmueble', canal: 'declaranot', rebasa_umbral: true })],
      [], HOY,
    );
    expect(ev.reportables).toEqual([]);
    expect(ev.porDeclaraNot).toHaveLength(1);
    expect(ev.recordatorios.some((r) => /DeclaraNOT/.test(r.detalle))).toBe(true);
  });

  it('una operación de inmuebles sobre umbral NO bloquea el aviso del SPPLD', () => {
    // Su obligación existe, pero por otro canal y con otro plazo: bloquear
    // aquí impediría presentar un aviso que sí corresponde presentar.
    const ev = evaluarAvisoMensual(
      [op({ tipo_acto: 'transmision_inmueble', canal: 'declaranot', rebasa_umbral: true })],
      [], HOY,
    );
    expect(ev.puedeEnCeros).toBe(true);
  });

  it('el recordatorio dice el plazo correcto: 15 días, no el 17', () => {
    const ev = evaluarAvisoMensual(
      [op({ canal: 'declaranot', rebasa_umbral: false })], [], HOY,
    );
    const r = ev.recordatorios.find((x) => /DeclaraNOT/.test(x.detalle));
    expect(r!.detalle).toMatch(/15 días naturales/);
  });
});

describe('caso combinado', () => {
  it('bloquea por umbral y a la vez recuerda lo demás', () => {
    const ev = evaluarAvisoMensual(
      [
        op({ id: 'a', rebasa_umbral: true }),
        op({ id: 'b', rebasa_umbral: false }),
        op({ id: 'c', canal: 'declaranot', rebasa_umbral: true }),
      ],
      [hal({ fecha_compromiso: null }), hal({ id: 'h-2', fecha_compromiso: '2026-12-31' })],
      HOY,
    );
    expect(ev.puedeEnCeros).toBe(false);
    expect(ev.reportables.map((o) => o.id)).toEqual(['a']);
    expect(ev.porDeclaraNot.map((o) => o.id)).toEqual(['c']);
    expect(ev.recordatorios.length).toBeGreaterThanOrEqual(2);
  });
});

describe('un acto sin evaluar impide dar el mes por vacío', () => {
  it('bloquea el informe en ceros', () => {
    // No es que no sea reportable: es que nadie lo ha determinado. Presentar
    // en ceros afirmaría haber revisado algo que no se revisó.
    const ev = evaluarAvisoMensual([op({ evaluada: false })], [], HOY);
    expect(ev.puedeEnCeros).toBe(false);
    expect(ev.bloqueos).toHaveLength(1);
    expect(ev.bloqueos[0].motivo).toMatch(/no ha evaluado/i);
    expect(ev.bloqueos[0].operaciones).toEqual(['op-1']);
    expect(ev.sinEvaluar).toHaveLength(1);
  });

  it('un acto de DeclaraNOT sin evaluar no bloquea este aviso', () => {
    // La transmisión de inmuebles no entra en el aviso del SPPLD, así que su
    // evaluación no cambia si este mes va en ceros.
    const ev = evaluarAvisoMensual(
      [op({ id: 'op-inm', tipo_acto: 'transmision_inmueble', canal: 'declaranot', evaluada: false })],
      [], HOY,
    );
    expect(ev.puedeEnCeros).toBe(true);
    expect(ev.sinEvaluar).toEqual([]);
  });

  it('los dos bloqueos conviven y se cuentan por separado', () => {
    const ev = evaluarAvisoMensual(
      [op({ id: 'op-1', rebasa_umbral: true }), op({ id: 'op-2', evaluada: false })],
      [], HOY,
    );
    expect(ev.puedeEnCeros).toBe(false);
    expect(ev.bloqueos).toHaveLength(2);
    expect(ev.bloqueos.map((b) => b.operaciones)).toEqual([['op-1'], ['op-2']]);
  });

  it('no bloquea nada cuando todo está evaluado y nada rebasa', () => {
    const ev = evaluarAvisoMensual([op(), op({ id: 'op-2' })], [], HOY);
    expect(ev.puedeEnCeros).toBe(true);
    expect(ev.sinEvaluar).toEqual([]);
  });

  it('el acto sin evaluar NO se cuenta como reportable', () => {
    // Bloquear el informe en ceros no es lo mismo que declararlo reportable:
    // meterlo al aviso sería inventar una obligación que nadie determinó.
    const ev = evaluarAvisoMensual([op({ evaluada: false })], [], HOY);
    expect(ev.reportables).toEqual([]);
    expect(tipoAvisoSugerido(ev)).toBe('en_ceros');
  });
});
