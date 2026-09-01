import { describe, it, expect } from 'vitest';
import { SUPUESTOS_ARTICULO_32, evaluarArticulo32 } from '@/lib/riesgo/articulo32';
import { PARAM } from '@/lib/parametros';

const UMA = 117.31;
const LIMITES: Record<string, number> = {
  [PARAM.EFECTIVO_INMUEBLE]: 8025,
  [PARAM.EFECTIVO_ACCIONES]: 3210,
};
const buscar = (c: string) => LIMITES[c];

function evaluar(tipo_acto: string, efectivo_mxn: number | null, uma = UMA) {
  return evaluarArticulo32({
    tipo_acto, efectivo_mxn, umaDelDiaDelPago: uma, limitesUma: buscar,
  });
}

describe('sólo los dos supuestos que el artículo nombra', () => {
  it('inmuebles y acciones caen en la prohibición', () => {
    expect(evaluar('transmision_inmueble', 0).aplica).toBe(true);
    expect(evaluar('compra_venta_acciones', 0).aplica).toBe(true);
  });

  it('los demás actos no, y NO se extiende por analogía', () => {
    // «Una constitución de sociedad también implica suscribir acciones» es un
    // razonamiento tentador y sería inventar un supuesto sancionable que la ley
    // no escribió.
    for (const acto of [
      'constitucion_personas_morales',
      'otorgamiento_poder',
      'constitucion_modificacion_fideicomiso',
      'fusion',
      'contrato_mutuo_credito',
    ]) {
      expect(evaluar(acto, 99_000_000).aplica, acto).toBe(false);
      expect(evaluar(acto, 99_000_000).prohibido, acto).toBe(false);
    }
  });

  it('los límites se guardan como código, nunca como cifra', () => {
    // Una cifra aquí sería el mismo error que la 0030 vino a matar.
    for (const s of SUPUESTOS_ARTICULO_32) {
      expect(Object.values(PARAM)).toContain(s.limite_codigo);
    }
  });
});

describe('el umbral de cada supuesto es el suyo', () => {
  it('inmuebles: 8,025 UMA', () => {
    const limite = 8025 * UMA;
    expect(evaluar('transmision_inmueble', limite - 1).prohibido).toBe(false);
    expect(evaluar('transmision_inmueble', limite).prohibido).toBe(true);
  });

  it('acciones: 3,210 UMA, que es más bajo', () => {
    const limite = 3210 * UMA;
    expect(evaluar('compra_venta_acciones', limite - 1).prohibido).toBe(false);
    expect(evaluar('compra_venta_acciones', limite).prohibido).toBe(true);
    // El mismo efectivo que en un inmueble no estaría prohibido.
    expect(evaluar('transmision_inmueble', limite).prohibido).toBe(false);
  });

  it('alcanzar el límite ya está prohibido, no sólo superarlo', () => {
    // El artículo dice «a partir de», no «por encima de».
    expect(evaluar('compra_venta_acciones', 3210 * UMA).prohibido).toBe(true);
  });
});

describe('la UMA es la del día del pago', () => {
  it('la misma cantidad cambia de veredicto con la UMA del año', () => {
    // La UMA cambia cada 1 de febrero, y el sentido importa: una UMA MÁS ALTA
    // sube el límite en pesos, así que el mismo efectivo puede dejar de estar
    // prohibido. Un pago de enero medido con la UMA de febrero se juzgaría con
    // un límite más generoso del que le tocaba.
    const efectivo = 8025 * 115; // entre las dos UMAs

    // Con la UMA de 2025 el límite en pesos es más bajo: el efectivo lo cruza.
    expect(evaluar('transmision_inmueble', efectivo, 113.14).prohibido).toBe(true);
    // Con la de 2026 el límite sube y el mismo efectivo queda debajo.
    expect(evaluar('transmision_inmueble', efectivo, 117.31).prohibido).toBe(false);
  });

  it('el límite en pesos se mueve con la UMA', () => {
    const conVieja = evaluar('transmision_inmueble', 1, 113.14).limite_mxn!;
    const conNueva = evaluar('transmision_inmueble', 1, 117.31).limite_mxn!;
    expect(conNueva).toBeGreaterThan(conVieja);
    expect(conNueva).toBeCloseTo(8025 * 117.31, 2);
  });
});

describe('sin efectivo y sin datos', () => {
  it('sin efectivo declarado no hay prohibición, pero se dice que el acto aplica', () => {
    const r = evaluar('transmision_inmueble', 0);
    expect(r.aplica).toBe(true);
    expect(r.prohibido).toBe(false);
    expect(r.detalle).toMatch(/no se declaró entrega de efectivo/i);
  });

  it('sin límite en el catálogo NO se da por lícito', () => {
    // Decir «no está prohibido» porque falta un parámetro sería dar por lícito
    // lo que nadie midió, sobre una prohibición cuya sanción es un porcentaje
    // del valor de la operación.
    const r = evaluarArticulo32({
      tipo_acto: 'transmision_inmueble', efectivo_mxn: 50_000_000,
      umaDelDiaDelPago: UMA, limitesUma: () => null,
    });
    expect(r.prohibido).toBe(false);
    expect(r.detalle).toMatch(/no se pudo verificar/i);
    expect(r.detalle).toMatch(/revísalo antes de instrumentar/i);
  });

  it('sin UMA tampoco concluye', () => {
    const r = evaluarArticulo32({
      tipo_acto: 'transmision_inmueble', efectivo_mxn: 50_000_000,
      umaDelDiaDelPago: null, limitesUma: buscar,
    });
    expect(r.detalle).toMatch(/no se pudo verificar/i);
  });

  it('un efectivo inválido no inventa una prohibición', () => {
    expect(evaluar('transmision_inmueble', NaN).prohibido).toBe(false);
    expect(evaluar('transmision_inmueble', -1).prohibido).toBe(false);
  });
});

describe('el mensaje sirve para actuar', () => {
  it('cuando prohíbe, dice el límite, lo declarado y que no procede', () => {
    const r = evaluar('transmision_inmueble', 2_000_000_000);
    expect(r.detalle).toMatch(/PROHÍBE/);
    expect(r.detalle).toMatch(/8,025 UMA/);
    expect(r.detalle).toMatch(/no procede/i);
  });

  it('cuando no prohíbe, dice cuál era el límite', () => {
    const r = evaluar('transmision_inmueble', 100_000);
    expect(r.detalle).toMatch(/por debajo del límite/i);
    expect(r.detalle).toMatch(/8,025 UMA/);
  });
});
