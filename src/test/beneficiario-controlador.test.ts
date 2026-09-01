import { describe, it, expect } from 'vitest';
import {
  UMBRAL_BC,
  alcanzaUmbral,
  motivoDeUmbral,
  practicarPasoI,
  sePuedePracticar,
  siguientePaso,
  cascadaResuelta,
  estructuraNoDeterminable,
  revisarMinimoDeSocios,
  CASCADA_VACIA,
  type SocioParaCascada,
  type TipoSocial,
} from '@/lib/riesgo/beneficiario-controlador';

/** Adenda 2 de Cumplimiento (31/08/2026), art. 23 Quinquies de las RCG. */

const socio = (o: Partial<SocioParaCascada>): SocioParaCascada => ({
  id: 'x',
  nombre_razon_social: 'Socio',
  tipo_persona: 'fisica',
  ...o,
});

describe('el umbral es 25 % O MÁS', () => {
  /**
   * La discrepancia que la adenda resuelve: la LFPIORPI dice «más del 25 %» y
   * las RCG «25 % o más». El caso que decide es el 25.00 % exacto.
   */
  it('el 25.00 % exacto SÍ es beneficiario controlador', () => {
    expect(alcanzaUmbral(socio({ porcentaje_titularidad: 25 }))).toBe(true);
    expect(UMBRAL_BC).toBe(25);
  });

  it('por debajo no', () => {
    expect(alcanzaUmbral(socio({ porcentaje_titularidad: 24.99 }))).toBe(false);
  });

  /**
   * La segunda diferencia, menos visible: la Ley mide DERECHOS DE VOTO y la
   * regla mide TITULARIDAD. No siempre coinciden —hay acciones sin voto y voto
   * por convenio sin titularidad—, así que dispara CUALQUIERA de los dos.
   */
  it('dispara por voto aunque la titularidad no llegue', () => {
    const s = socio({ porcentaje_titularidad: 10, porcentaje_voto: 30 });
    expect(alcanzaUmbral(s)).toBe(true);
    expect(motivoDeUmbral(s)).toContain('voto');
    expect(motivoDeUmbral(s)).toContain('aunque su titularidad no llegue');
  });

  it('dispara por titularidad aunque no tenga voto', () => {
    expect(alcanzaUmbral(socio({ porcentaje_titularidad: 40, porcentaje_voto: 0 }))).toBe(true);
  });

  it('sin ninguno de los dos porcentajes no dispara: no es un cero, es un dato que falta', () => {
    expect(alcanzaUmbral(socio({}))).toBe(false);
    expect(motivoDeUmbral(socio({}))).toBeNull();
  });
});

describe('paso I · titularidad', () => {
  it('separa a las personas físicas de las morales que hay que ascender', () => {
    const r = practicarPasoI([
      socio({ id: 'a', tipo_persona: 'fisica', porcentaje_titularidad: 30 }),
      socio({ id: 'b', tipo_persona: 'moral', porcentaje_titularidad: 40, socio_client_id: 'c1' }),
      socio({ id: 'c', tipo_persona: 'fisica', porcentaje_titularidad: 5 }),
    ]);
    expect(r.fisicas.map((s) => s.id)).toEqual(['a']);
    expect(r.morales_por_ascender.map((s) => s.id)).toEqual(['b']);
    expect(r.sin_resultado).toBe(false);
  });

  /**
   * Una persona moral con 25 % o más NO es el beneficiario: es un eslabón. Hay
   * que volver a aplicarle el art. 23 Quinquies, ascendiendo en la cadena hasta
   * la persona física que en última instancia ejerce el control.
   */
  it('una moral que alcanza el umbral no queda como beneficiario', () => {
    const r = practicarPasoI([
      socio({ id: 'b', tipo_persona: 'moral', porcentaje_titularidad: 100 }),
    ]);
    expect(r.fisicas).toHaveLength(0);
    expect(r.morales_por_ascender).toHaveLength(1);
    expect(r.sin_resultado).toBe(false);
  });

  it('sin nadie que alcance, el paso se practicó SIN RESULTADO', () => {
    const r = practicarPasoI([socio({ porcentaje_titularidad: 10 })]);
    expect(r.sin_resultado).toBe(true);
  });

  /** El caso más simple de toda la cascada: S.A.S. de un accionista. */
  it('el accionista único de una S.A.S. sale por el paso I de inmediato', () => {
    const r = practicarPasoI([
      socio({ id: 'unico', tipo_persona: 'fisica', porcentaje_titularidad: 100 }),
    ]);
    expect(r.fisicas.map((s) => s.id)).toEqual(['unico']);
  });
});

describe('el orden de la cascada es secuencial y obligatorio', () => {
  it('el I siempre se puede practicar', () => {
    expect(sePuedePracticar('I', CASCADA_VACIA)).toBe(true);
  });

  it('no se salta al II sin haber practicado el I', () => {
    expect(sePuedePracticar('II', CASCADA_VACIA)).toBe(false);
  });

  it('el II se abre sólo si el I se practicó y NO arrojó a nadie', () => {
    expect(sePuedePracticar('II', { ...CASCADA_VACIA, I: 'practicado_sin_resultado' })).toBe(true);
    expect(sePuedePracticar('II', { ...CASCADA_VACIA, I: 'practicado_con_resultado' })).toBe(false);
  });

  it('el III necesita que los dos anteriores se hayan practicado sin resultado', () => {
    expect(
      sePuedePracticar('III', { I: 'practicado_sin_resultado', II: 'no_practicado', III: 'no_practicado' }),
    ).toBe(false);
    expect(
      sePuedePracticar('III', {
        I: 'practicado_sin_resultado',
        II: 'practicado_sin_resultado',
        III: 'no_practicado',
      }),
    ).toBe(true);
  });

  it('si un paso arrojó beneficiarios, la cascada terminó ahí', () => {
    const e = { ...CASCADA_VACIA, I: 'practicado_con_resultado' as const };
    expect(cascadaResuelta(e)).toBe(true);
    expect(siguientePaso(e)).toBeNull();
  });

  it('el siguiente paso es el primero sin practicar', () => {
    expect(siguientePaso(CASCADA_VACIA)).toBe('I');
    expect(siguientePaso({ ...CASCADA_VACIA, I: 'practicado_sin_resultado' })).toBe('II');
  });
});

describe('el paso III es una señal, no un trámite resuelto', () => {
  /**
   * Llegar al funcionario administrativo de mayor grado significa que la
   * estructura de control NO fue determinable. Es el disparador del piso de
   * banda alta de la Adenda 1.
   */
  it('haber llegado al III marca la estructura como no determinable', () => {
    expect(
      estructuraNoDeterminable({
        I: 'practicado_sin_resultado',
        II: 'practicado_sin_resultado',
        III: 'practicado_con_resultado',
      }),
    ).toBe(true);
  });

  it('resolver por el paso I no la marca', () => {
    expect(estructuraNoDeterminable({ ...CASCADA_VACIA, I: 'practicado_con_resultado' })).toBe(false);
  });
});

describe('mínimo de socios por tipo social', () => {
  const sas: TipoSocial = {
    clave: 'sas',
    nombre: 'Sociedad por Acciones Simplificada (S.A.S.)',
    socios_minimo: 1,
    socios_maximo: null,
    fundamento: 'LGSM art. 260.',
    solo_personas_fisicas: true,
  };
  const sa: TipoSocial = {
    clave: 'sa',
    nombre: 'Sociedad Anónima (S.A.)',
    socios_minimo: 2,
    socios_maximo: null,
    fundamento: 'LGSM art. 89, fr. I.',
    solo_personas_fisicas: false,
  };
  const srl: TipoSocial = {
    clave: 'srl',
    nombre: 'Sociedad de Responsabilidad Limitada (S. de R.L.)',
    socios_minimo: 2,
    socios_maximo: 50,
    fundamento: 'LGSM art. 61 fija el máximo de 50.',
    solo_personas_fisicas: false,
  };

  /** El defecto que esto evita: una regla global de «al menos dos» rechazaría
   *  sociedades legalmente constituidas. */
  it('una S.A.S. de UN accionista es válida', () => {
    expect(revisarMinimoDeSocios(sas, 1, 'MX').cumple).toBe(true);
  });

  it('una S.A. de un accionista NO lo es', () => {
    const r = revisarMinimoDeSocios(sa, 1, 'MX');
    expect(r.cumple).toBe(false);
    expect(r.detalle).toContain('al menos 2');
  });

  it('la S. de R.L. tiene tope de 50', () => {
    expect(revisarMinimoDeSocios(srl, 50, 'MX').cumple).toBe(true);
    expect(revisarMinimoDeSocios(srl, 51, 'MX').cumple).toBe(false);
  });

  it('sin tipo social no se puede resolver, y se dice por qué', () => {
    const r = revisarMinimoDeSocios(null, 1, 'MX');
    expect(r.cumple).toBe(false);
    expect(r.detalle).toContain('anexo de identificación');
  });

  /** Para sociedades extranjeras el mínimo se rige por la ley del lugar de
   *  constitución, no por la LGSM. */
  it('una sociedad extranjera no se mide con la LGSM', () => {
    const r = revisarMinimoDeSocios(sa, 1, 'ES');
    expect(r.cumple).toBe(true);
    expect(r.detalle).toContain('lugar de constitución');
  });

  it('el mensaje no cita un artículo cuando el mínimo no lo tiene', () => {
    // El de dos socios de la S.A. sí lo tiene; el de la sociedad civil no, y
    // por eso su fundamento habla de naturaleza contractual y no de un número
    // de artículo inventado.
    const civil: TipoSocial = {
      clave: 'civil',
      nombre: 'Sociedad Civil o Asociación Civil',
      socios_minimo: 2,
      socios_maximo: null,
      fundamento: 'Códigos civiles. El mínimo deriva de la naturaleza contractual del tipo.',
      solo_personas_fisicas: false,
    };
    const r = revisarMinimoDeSocios(civil, 1, 'MX');
    expect(r.detalle).toContain('naturaleza contractual');
    expect(r.detalle).not.toMatch(/art\.\s*\d/);
  });
});
