import { describe, it, expect } from 'vitest';
import {
  NIVEL_POR_DEFECTO,
  clavesNoMapeadas,
  riesgoDeActividad,
  tamanoTabla,
} from '@/lib/riesgo/actividad';

describe('una clave desconocida nunca puntúa mejor que una conocida', () => {
  it('el valor por defecto es medio, jamás nulo ni cero', () => {
    // Es el peor modo de falla del diseño: un campo sin respuesta en una escala
    // aditiva suma cero, y cero es más bajo que la actividad más inocua de la
    // lista. La clave desconocida acabaría puntuando mejor que un notario, y el
    // expediente saldría limpio por un hueco sin que nadie se entere.
    const desconocida = riesgoDeActividad('9999999');
    expect(desconocida.nivel).toBe('medio');
    expect(desconocida.valor).toBe(2);
    expect(NIVEL_POR_DEFECTO).toBe('medio');
  });

  it('una clave desconocida puntúa igual o peor que la más baja conocida', () => {
    const bajaConocida = riesgoDeActividad('5220013'); // banca múltiple
    const desconocida = riesgoDeActividad('9999999');
    expect(desconocida.valor).toBeGreaterThan(bajaConocida.valor);
  });

  it('sin clave capturada tampoco se queda en blanco', () => {
    for (const vacia of [null, undefined, '', '   ']) {
      const r = riesgoDeActividad(vacia);
      expect(r.nivel).toBe('medio');
      expect(r.mapeada).toBe(false);
    }
  });

  it('siempre responde: no hay entrada que devuelva nada', () => {
    for (const clave of ['5721100', '5220013', '9999999', '', 'no-numérico']) {
      expect(riesgoDeActividad(clave).valor).toBeGreaterThan(0);
    }
  });
});

describe('la bandera de no mapeada distingue derivar de suponer', () => {
  it('lo que sale de la tabla va marcado como mapeado', () => {
    expect(riesgoDeActividad('5721100').mapeada).toBe(true); // joyeros
    expect(riesgoDeActividad('5220013').mapeada).toBe(true); // banca múltiple
  });

  it('lo que sale del defecto va marcado como NO mapeado', () => {
    // Sin esto, una respuesta por omisión se ve igual que una derivada y nadie
    // va a ir a revisarla.
    expect(riesgoDeActividad('9999999').mapeada).toBe(false);
  });

  it('el texto dice por qué, no sólo qué', () => {
    expect(riesgoDeActividad('5721100').fuente).toMatch(/Actividad Vulnerable/i);
    expect(riesgoDeActividad('9999999').fuente).toMatch(/no está en la tabla/i);
    expect(riesgoDeActividad('').fuente).toMatch(/no se capturó/i);
  });

  it('el reporte de claves no mapeadas junta y ordena sin repetir', () => {
    // Si crece mes a mes, la tabla está desactualizada y la metodología deja de
    // ser defendible. Es el indicador de que hay que revisarla.
    const r = clavesNoMapeadas(['9999999', '5721100', '8888888', '9999999', null, '']);
    expect(r).toEqual(['8888888', '9999999']);
  });
});

describe('la tabla de la Adenda 1, apartado 3.1', () => {
  it('las Actividades Vulnerables del artículo 17 son de riesgo alto', () => {
    for (const clave of [
      '5721100', // joyeros y orfebres
      '3430005', // orfebrería de metales y piedras preciosos
      '4680006', // antigüedades y obras de arte
      '7140019', // casinos
      '4840007', // traslado y custodia de valores
      '5320013', // casas de empeño
      '1135070', // agente aduanal
      '5520014', // inmobiliarias
      '5370013', // transmisores de dinero
    ]) {
      expect(riesgoDeActividad(clave).nivel, `${clave} debería ser alto`).toBe('alto');
    }
  });

  it('la lista de riesgo bajo es corta y cerrada', () => {
    // Cada entrada es una excepción que BAJA el riesgo, y una lista de
    // excepciones que crece es una lista que dejó de ser excepción.
    const { alto, bajo } = tamanoTabla();
    expect(bajo).toBeLessThan(10);
    expect(bajo).toBeLessThan(alto);
  });

  it('sólo entidades con supervisor propio bajan de nivel', () => {
    expect(riesgoDeActividad('5220013').nivel).toBe('bajo'); // banca múltiple
    expect(riesgoDeActividad('5350013').nivel).toBe('bajo'); // casas de bolsa
    // Una SOFOM no está en la lista: no baja por parecerse a un banco.
    expect(riesgoDeActividad('5330013').nivel).toBe('medio');
  });

  it('la fe pública queda en medio, que es donde la ENR 2023 la coloca', () => {
    expect(riesgoDeActividad('5620015').nivel).toBe('medio'); // notaría y correduría
  });
});
