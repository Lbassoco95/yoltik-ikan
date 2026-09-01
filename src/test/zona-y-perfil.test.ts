import { describe, it, expect } from 'vitest';
import { riesgoDeZona, type ZonaAtencion } from '@/lib/riesgo/zona';
import {
  riesgoDeFrecuencia,
  riesgoDeCanal,
  inicioDeVentana,
  operacionesEnVentana,
  MESES_VENTANA,
} from '@/lib/riesgo/perfil-transaccional';
import { ventanaDesde } from '../../supabase/functions/motor-pld/evaluadores';

/** Instrucción 10 de la Adenda 1: canal, zona geográfica y perfil transaccional. */

const CATALOGO: ZonaAtencion[] = [
  { entidad_clave: '14', municipio: 'Tlajomulco', nivel: 2, motivo: 'zona de atención' },
  { entidad_clave: '25', municipio: null, nivel: 3, motivo: 'entidad de atención prioritaria' },
];

describe('zona geográfica · la lista vacía no responde', () => {
  /**
   * El punto de la migration 0041: una lista vacía que respondiera «sin
   * observaciones» a todo daría la calificación MÁS BAJA a cualquier ubicación
   * del país. Es el falso negativo silencioso, y encima se vería contestado.
   */
  it('con el catálogo vacío devuelve null, no «sin observaciones»', () => {
    const r = riesgoDeZona([{ rol: 'inmueble', entidad_clave: '14', municipio: 'Zapopan' }], []);
    expect(r).toBeNull();
  });

  it('sin ubicación capturada tampoco responde', () => {
    expect(riesgoDeZona([{ rol: 'inmueble', entidad_clave: null }], CATALOGO)).toBeNull();
  });

  it('una ubicación que el catálogo NO menciona sí es «sin observaciones»', () => {
    // Distinto del catálogo vacío: aquí la lista existe y no la nombra.
    const r = riesgoDeZona([{ rol: 'inmueble', entidad_clave: '14', municipio: 'Zapopan' }], CATALOGO);
    expect(r?.valor).toBe(1);
  });

  it('el municipio del catálogo se reconoce sin depender de acentos ni mayúsculas', () => {
    const r = riesgoDeZona(
      [{ rol: 'inmueble', entidad_clave: '14', municipio: 'TLAJOMULCO' }],
      CATALOGO,
    );
    expect(r?.valor).toBe(2);
  });

  it('una fila sin municipio cubre la entidad entera', () => {
    const r = riesgoDeZona(
      [{ rol: 'domicilio_cliente', entidad_clave: '25', municipio: 'Culiacán' }],
      CATALOGO,
    );
    expect(r?.valor).toBe(3);
  });

  /** Las dos ubicaciones cuentan, y manda la más alta. */
  it('toma la más alta entre inmueble y domicilio del cliente', () => {
    const r = riesgoDeZona(
      [
        { rol: 'inmueble', entidad_clave: '14', municipio: 'Tlajomulco' },
        { rol: 'domicilio_cliente', entidad_clave: '25', municipio: 'Culiacán' },
      ],
      CATALOGO,
    );
    expect(r?.valor).toBe(3);
    expect(r?.determinante.rol).toBe('domicilio_cliente');
  });

  it('la fila del municipio gana sobre la de la entidad entera', () => {
    const catalogo: ZonaAtencion[] = [
      { entidad_clave: '25', municipio: null, nivel: 3, motivo: 'entidad' },
      { entidad_clave: '25', municipio: 'Ahome', nivel: 2, motivo: 'municipio' },
    ];
    const r = riesgoDeZona([{ rol: 'inmueble', entidad_clave: '25', municipio: 'Ahome' }], catalogo);
    expect(r?.valor).toBe(2);
    expect(r?.motivo).toBe('municipio');
  });
});

describe('canal de distribución', () => {
  it('el remoto suma más que el presencial', () => {
    expect(riesgoDeCanal('presencial')?.valor).toBe(1);
    expect(riesgoDeCanal('remoto_verificacion_reforzada')?.valor).toBe(2);
    expect(riesgoDeCanal('remoto_estandar')?.valor).toBe(3);
  });

  /** No se deduce: se captura o no se responde. */
  it('sin canal capturado no responde', () => {
    expect(riesgoDeCanal(null)).toBeNull();
    expect(riesgoDeCanal('')).toBeNull();
    expect(riesgoDeCanal('por_correo')).toBeNull();
  });
});

describe('perfil transaccional · frecuencia', () => {
  it('quien declaró 2 al año y lleva 1 en seis meses está dentro', () => {
    const r = riesgoDeFrecuencia(2, 1);
    expect(r.clave).toBe('dentro');
    expect(r.esperadas_en_ventana).toBe(1);
  });

  /**
   * El redondeo hacia arriba de la mitad: quien declaró UNA al año y lleva una
   * en seis meses no está excediendo nada. Con redondeo hacia abajo su
   * tolerancia sería cero y cualquier operación lo marcaría.
   */
  it('quien declaró 1 al año y lleva 1 en seis meses NO excede', () => {
    expect(riesgoDeFrecuencia(1, 1).clave).toBe('dentro');
  });

  it('quien declaró 1 al año y lleva 2 en seis meses sí excede', () => {
    const r = riesgoDeFrecuencia(1, 2);
    expect(r.clave).toBe('excede');
    expect(r.valor).toBe(3);
    expect(r.fuente).toContain('2 operación');
  });

  /** Sin declaración es el valor INTERMEDIO, no el mínimo: el mismo criterio
   *  que la actividad económica del apartado 3. */
  it('sin declaración responde el valor intermedio y lo marca por defecto', () => {
    const r = riesgoDeFrecuencia(null, 9);
    expect(r.clave).toBe('sin_declaracion');
    expect(r.valor).toBe(2);
    expect(r.por_defecto).toBe(true);
    expect(r.esperadas_en_ventana).toBeNull();
  });

  it('sin declaración nunca puntúa mejor que quien declaró y está en orden', () => {
    expect(riesgoDeFrecuencia(null, 0).valor).toBeGreaterThan(riesgoDeFrecuencia(4, 0).valor);
  });

  it('una declaración de cero es una declaración, no una ausencia', () => {
    expect(riesgoDeFrecuencia(0, 0).clave).toBe('dentro');
    expect(riesgoDeFrecuencia(0, 1).clave).toBe('excede');
  });
});

describe('la ventana móvil es la MISMA que la del motor', () => {
  /**
   * `inicioDeVentana` está duplicada respecto de `ventanaDesde` del Motor PLD
   * porque aquél corre en Deno. Esta prueba es la que sostiene la duplicación:
   * si una se mueve sin la otra, aquí se ve.
   */
  it('coincide con ventanaDesde del Motor PLD en fechas de borde', () => {
    const fechas = [
      '2026-08-31T12:00:00Z', // 31 → febrero, que no tiene 31
      '2026-03-31T00:00:00Z',
      '2026-01-15T23:59:59Z', // cruza el año
      '2026-02-28T00:00:00Z',
      '2024-08-29T00:00:00Z', // bisiesto: 29 de febrero existe
      '2026-07-01T00:00:00Z',
    ];
    for (const f of fechas) {
      const fin = new Date(f);
      expect(inicioDeVentana(fin, MESES_VENTANA).toISOString()).toBe(
        ventanaDesde(fin, `${MESES_VENTANA}M`).toISOString(),
      );
    }
  });

  it('seis meses son seis meses de calendario, no 180 días', () => {
    // Del 31 de agosto al 28 de febrero: 184 días, no 180.
    const inicio = inicioDeVentana(new Date('2026-08-31T00:00:00Z'));
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('el borde de inicio es inclusivo, igual que en el motor', () => {
    const fin = new Date('2026-09-01T00:00:00Z');
    const inicio = inicioDeVentana(fin);
    expect(operacionesEnVentana([inicio.toISOString()], fin)).toBe(1);
  });

  it('cuenta sólo lo que cae dentro y descarta fechas inválidas', () => {
    const fin = new Date('2026-09-01T00:00:00Z');
    const n = operacionesEnVentana(
      ['2026-08-01T00:00:00Z', '2026-05-01T00:00:00Z', '2025-12-01T00:00:00Z', null, 'ayer'],
      fin,
    );
    expect(n).toBe(2);
  });
});
