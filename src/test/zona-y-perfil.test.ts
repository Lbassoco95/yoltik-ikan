import { describe, it, expect } from 'vitest';
import { riesgoDeZona, type ZonaAtencion } from '@/lib/riesgo/zona';
import {
  desviacionDeFrecuencia,
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

describe('perfil transaccional · la desviación, que no decide nada', () => {
  /**
   * Es la opción PREFERIDA de Cumplimiento (Adenda 1, 7.1): razón continua para
   * ordenar la cola de revisión, sin umbral y sin inventar ninguna cifra.
   */
  it('prorratea SIN redondear: la mitad de 1 al año es 0.5, no 1', () => {
    // El redondeo hacia arriba era la tolerancia del 50 % que había que retirar.
    const d = desviacionDeFrecuencia(1, 0);
    expect(d.esperadas_en_ventana).toBe(0.5);
  });

  it('la razón ordena la cola: quien más se desvía va primero', () => {
    const cola = [
      { id: 'a', d: desviacionDeFrecuencia(4, 3) },
      { id: 'b', d: desviacionDeFrecuencia(1, 4) },
      { id: 'c', d: desviacionDeFrecuencia(2, 1) },
    ].sort((x, y) => (y.d.razon ?? 0) - (x.d.razon ?? 0));
    expect(cola.map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('sin declaración no hay razón que calcular, y se dice', () => {
    const d = desviacionDeFrecuencia(null, 5);
    expect(d.razon).toBeNull();
    expect(d.exceso).toBeNull();
    expect(d.observadas_en_ventana).toBe(5);
  });

  it('con cero esperadas no divide entre cero: ordena por exceso', () => {
    const d = desviacionDeFrecuencia(0, 3);
    expect(d.razon).toBeNull();
    expect(d.exceso).toBe(3);
  });

  /** Direccionalidad: operar por debajo no es señal de riesgo. */
  it('marca la subutilización, que es nota de calidad del dato', () => {
    expect(desviacionDeFrecuencia(4, 1).subutilizacion).toBe(true);
    expect(desviacionDeFrecuencia(4, 2).subutilizacion).toBe(false);
    expect(desviacionDeFrecuencia(4, 3).subutilizacion).toBe(false);
  });
});

describe('perfil transaccional · el estado binario y su margen firmado', () => {
  // El valor real del parámetro `margen_perfil_transaccional_operaciones`
  // (migration 0044). Se pasa explícito porque el módulo no lo tiene.
  const MARGEN = 1;

  /**
   * El defecto que la instrucción 12 mandó retirar. Esta prueba existe para que
   * no vuelva: si alguien reintroduce un redondeo o un default, aquí se ve.
   */
  it('el margen NO tiene valor por defecto en el código', () => {
    expect(riesgoDeFrecuencia(2, 5, null)).toBeNull();
    expect(riesgoDeFrecuencia(2, 5, undefined)).toBeNull();
    // Sin parámetro no se responde: la variable se queda vacía y la pantalla lo
    // dice, en vez de inventar una tolerancia.
  });

  it('la tolerancia es la del parámetro, y viaja en el resultado', () => {
    const r = riesgoDeFrecuencia(2, 5, MARGEN)!;
    expect(r.margen_aplicado).toBe(MARGEN);
    expect(r.fuente).toContain('margen de 1');
    expect(r.fuente).toContain('parámetro firmado');
  });

  it('quien declaró 4 al año y lleva 2 en seis meses está en su ritmo', () => {
    const r = riesgoDeFrecuencia(4, 2, MARGEN)!;
    expect(r.clave).toBe('dentro');
    expect(r.desviacion.razon).toBe(1);
  });

  it('el margen absoluto tolera UNA operación por encima, ni más ni menos', () => {
    // Esperadas = 2. Con margen 1: 3 está dentro, 4 excede.
    expect(riesgoDeFrecuencia(4, 3, MARGEN)!.clave).toBe('dentro');
    expect(riesgoDeFrecuencia(4, 4, MARGEN)!.clave).toBe('excede');
  });

  /**
   * El agravante del diseño anterior: el redondeo hacía la tolerancia VARIABLE
   * —cincuenta por ciento sobre lo declarado— y más generosa donde los conteos
   * son más chicos, sin que nadie lo hubiera decidido. Ahora el margen es el
   * mismo número de operaciones para todos, y el corte es siempre
   * `esperadas + margen`.
   *
   * Queda un efecto de discretización, y conviene decir que es esperado y no un
   * resto del defecto anterior: los conteos son enteros y las expectativas
   * fraccionarias, así que un margen absoluto pesa proporcionalmente más sobre
   * una declaración chica. Cumplimiento eligió margen absoluto SABIENDO que los
   * conteos son enteros pequeños —es el argumento del apartado 7.1 contra el
   * porcentaje—, así que esto es la política, no un desvío de ella.
   */
  it('el margen es el mismo número de operaciones, declare 1 o declare 4', () => {
    for (const anual of [0, 1, 2, 4, 12]) {
      expect(riesgoDeFrecuencia(anual, 0, MARGEN)!.margen_aplicado).toBe(MARGEN);
    }
  });

  it('el corte es siempre esperadas + margen, sin redondeos de por medio', () => {
    for (const anual of [1, 2, 3, 4, 12]) {
      const esperadas = (anual * MESES_VENTANA) / 12;
      // El último conteo entero que cae dentro es floor(esperadas + margen).
      const ultimoDentro = Math.floor(esperadas + MARGEN);
      expect(riesgoDeFrecuencia(anual, ultimoDentro, MARGEN)!.clave, `anual=${anual}`).toBe(
        'dentro',
      );
      expect(riesgoDeFrecuencia(anual, ultimoDentro + 1, MARGEN)!.clave, `anual=${anual}`).toBe(
        'excede',
      );
    }
  });

  it('operar por debajo NO es señal de riesgo: puntúa como estar en ritmo', () => {
    const debajo = riesgoDeFrecuencia(4, 0, MARGEN)!;
    const enRitmo = riesgoDeFrecuencia(4, 2, MARGEN)!;
    expect(debajo.valor).toBe(enRitmo.valor);
    expect(debajo.clave).toBe('dentro');
    expect(debajo.desviacion.subutilizacion).toBe(true);
    expect(debajo.fuente).toContain('nota de calidad del dato');
  });

  /** Sin declaración es el valor INTERMEDIO, no el mínimo: el mismo criterio
   *  que la actividad económica del apartado 3. */
  it('sin declaración responde el valor intermedio y lo marca por defecto', () => {
    const r = riesgoDeFrecuencia(null, 9, MARGEN)!;
    expect(r.clave).toBe('sin_declaracion');
    expect(r.valor).toBe(2);
    expect(r.por_defecto).toBe(true);
  });

  it('sin declaración nunca puntúa mejor que quien declaró y está en orden', () => {
    expect(riesgoDeFrecuencia(null, 0, MARGEN)!.valor).toBeGreaterThan(
      riesgoDeFrecuencia(4, 0, MARGEN)!.valor,
    );
  });

  it('una declaración de cero es una declaración, no una ausencia', () => {
    expect(riesgoDeFrecuencia(0, 0, MARGEN)!.clave).toBe('dentro');
    expect(riesgoDeFrecuencia(0, 1, MARGEN)!.clave).toBe('dentro'); // dentro del margen
    expect(riesgoDeFrecuencia(0, 2, MARGEN)!.clave).toBe('excede');
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

  /**
   * El defecto que esto cierra: `ventanaDesde` conservaba la HORA del acto que
   * cierra la ventana, así que seis meses hacia atrás desde el 1 de septiembre
   * a las 12:00 empezaban el 1 de marzo a las 12:00 y dejaban fuera una
   * escritura de ese mismo día a las 10:00.
   *
   * Lo grave no era el milisegundo: era que el resultado dependía de la hora
   * guardada en `fecha`. Los mismos dos actos producían o no un Aviso por
   * acumulación según a qué hora se hubiera capturado el primero.
   */
  it('el día del límite cuenta ENTERO, sin importar la hora', () => {
    const fin = new Date('2026-09-01T12:00:00Z');
    // Mismo día del límite, dos horas ANTES de la hora de cierre.
    expect(operacionesEnVentana(['2026-03-01T10:00:00Z'], fin)).toBe(1);
    // Y después.
    expect(operacionesEnVentana(['2026-03-01T23:59:59Z'], fin)).toBe(1);
    // El día anterior sigue fuera: la ventana no se estiró de más.
    expect(operacionesEnVentana(['2026-02-28T23:59:59Z'], fin)).toBe(0);
  });

  it('la ventana ya no depende de la hora a la que se corre', () => {
    // El mismo par de actos, evaluado a distintas horas del día de cierre.
    const acto = '2026-03-01T10:00:00Z';
    for (const hora of ['00:00:00', '08:30:00', '12:00:00', '23:59:59']) {
      expect(
        operacionesEnVentana([acto], new Date(`2026-09-01T${hora}Z`)),
        `cerrando a las ${hora}`,
      ).toBe(1);
    }
  });

  it('las ventanas de HORAS siguen siendo exactas: ahí la hora es el dato', () => {
    // 24h y 72h miden inmediatez. Truncarlas al día las convertiría en otra
    // regla, así que `ventanaDesde` sólo trunca las de meses.
    const fin = new Date('2026-09-01T12:00:00Z');
    expect(ventanaDesde(fin, '24h').toISOString()).toBe('2026-08-31T12:00:00.000Z');
    expect(ventanaDesde(fin, '72h').toISOString()).toBe('2026-08-29T12:00:00.000Z');
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
