import { describe, it, expect } from 'vitest';
import {
  SUPUESTOS_XII,
  SUPUESTO_DE_ACTO,
  actosAltoDeOficio,
  actosSinSupuesto,
  supuestoDeActo,
  supuestoPorClave,
} from '@/lib/riesgo/supuestos-xii';
import { TIPOS_ACTO_NOTARIA } from '@/lib/perfil-actividad';
import { PARAM } from '@/lib/parametros';

describe('el riesgo del acto no depende de su posición', () => {
  it('cada tipo de acto del catálogo tiene supuesto', () => {
    // Un tipo sin supuesto entraría a la matriz sin riesgo base y sumaría cero,
    // que en una escala aditiva es la calificación MÁS BAJA posible: el acto
    // desconocido puntuaría mejor que el más inocuo. Es el peor modo de falla.
    expect(actosSinSupuesto()).toEqual([]);
  });

  it('el poder irrevocable NO arrastra el disparador del fideicomiso', () => {
    // El defecto que motivó todo esto: con el riesgo guardado como posición en
    // un arreglo de cuatro, al pasar el catálogo a once el poder ocupó el lugar
    // del fideicomiso y disparaba su alerta.
    expect(supuestoDeActo('otorgamiento_poder')?.clave).toBe('XII.A.b');
    expect(supuestoDeActo('constitucion_modificacion_fideicomiso')?.clave).toBe('XII.A.d');
  });

  it('reordenar el catálogo no cambia ningún riesgo', () => {
    // La prueba de que la clave es estable: se calcula el riesgo de cada acto,
    // se invierte el catálogo, y tiene que salir lo mismo.
    const antes = TIPOS_ACTO_NOTARIA.map((t) => [t.value, supuestoDeActo(t.value)?.riesgo_base]);
    const alReves = [...TIPOS_ACTO_NOTARIA].reverse();
    const despues = alReves.map((t) => [t.value, supuestoDeActo(t.value)?.riesgo_base]);
    expect(despues.sort()).toEqual(antes.sort());
  });

  it('un tipo de acto que no existe no devuelve nada', () => {
    expect(supuestoDeActo('compraventa_inmueble')).toBeUndefined(); // el nombre viejo
    expect(supuestoDeActo('')).toBeUndefined();
    expect(supuestoDeActo(null)).toBeUndefined();
  });
});

describe('la tabla de la Adenda 1, apartado 2.2', () => {
  it('los seis actos de alto de oficio son los que dice Cumplimiento', () => {
    // Poder irrevocable, fideicomiso ante notario, mutuo con acreedor fuera del
    // sistema financiero, fideicomiso ante corredor. Los otros dos supuestos
    // altos —mutuo mercantil y facilitadores MASC— no tienen tipo de acto
    // propio en el layout.
    expect(actosAltoDeOficio().sort()).toEqual([
      'cesion_derechos_fideicomitente_fideicomisario',
      'constitucion_modificacion_fideicomiso',
      'contrato_mutuo_credito',
      'otorgamiento_poder',
    ]);
  });

  it('la constitución de personas morales NO es alto de oficio, a propósito', () => {
    // Es el acto de mayor volumen ordinario. Marcarlo alto llevaría a que la
    // mayoría de los expedientes caiga en la banda alta, con lo que la banda
    // deja de discriminar y la diligencia reforzada se vuelve rutina
    // desatendida (Adenda 1, apartado 2.3).
    expect(supuestoDeActo('constitucion_personas_morales')?.alto_de_oficio).toBe(false);
    expect(supuestoDeActo('constitucion_personas_morales')?.riesgo_base).toBe(3);
  });

  it('cinco tipos de acto comparten el inciso c)', () => {
    // El layout tiene once TIPOS DE ACTO y el artículo once SUPUESTOS: no son
    // la misma lista, y el inciso c) agrupa cinco.
    const delIncisoC = Object.entries(SUPUESTO_DE_ACTO)
      .filter(([, clave]) => clave === 'XII.A.c')
      .map(([acto]) => acto);
    expect(delIncisoC.sort()).toEqual([
      'compra_venta_acciones',
      'constitucion_personas_morales',
      'escision',
      'fusion',
      'modificacion_patrimonial',
    ]);
  });

  it('el riesgo base sólo toma los cuatro valores de la escala', () => {
    for (const s of SUPUESTOS_XII) {
      expect([1, 2, 3, 4]).toContain(s.riesgo_base);
    }
  });
});

describe('los umbrales viven en el catálogo, no en esta tabla', () => {
  it('se guarda el código del parámetro, nunca la cifra', () => {
    // Una cifra aquí sería el mismo error que la 0030 vino a matar en el front:
    // un umbral regulatorio escrito a mano en un archivo de código.
    expect(supuestoPorClave('XII.A.a')?.umbral_codigo).toBe(PARAM.XII_INMUEBLE);
    expect(supuestoPorClave('XII.A.d')?.umbral_codigo).toBe(PARAM.XII_FIDEICOMISO);
  });

  it('los códigos que se citan existen en el catálogo de parámetros', () => {
    const conocidos = new Set(Object.values(PARAM) as string[]);
    for (const s of SUPUESTOS_XII) {
      if (s.umbral_codigo) expect(conocidos).toContain(s.umbral_codigo);
    }
  });

  it('umbral nulo significa que el Aviso procede siempre', () => {
    // No es un hueco: es la respuesta. Desde la reforma DOF 16/07/2025 el poder
    // irrevocable y la constitución de personas morales se avisan sin importar
    // el monto.
    expect(supuestoPorClave('XII.A.b')?.umbral_codigo).toBeNull();
    expect(supuestoPorClave('XII.A.c')?.umbral_codigo).toBeNull();
  });

  it('el avalúo queda sin umbral hasta que se aclare cuál es', () => {
    // La Adenda le asigna 8,025 UMA, que es hoy el límite de EFECTIVO de
    // inmuebles del artículo 32 y no un umbral de Aviso. Ponerlo sería
    // confundir dos cosas que llevamos toda la semana separando.
    expect(supuestoPorClave('XII.B.a')?.umbral_codigo).toBeNull();
  });
});
