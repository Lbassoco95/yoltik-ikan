import { describe, it, expect } from 'vitest';
import { escribirValor, escribirVariante, type DatosActo } from '@/lib/aviso/valores-acto';
import { ramaDelActo, type NodoRama } from '@/lib/aviso/ramas-acto';
import {
  fechaLayout,
  generarAvisoXml,
  mesLayout,
  referenciaDelActo,
  textoLayout,
  type EntradaAviso,
} from '@/lib/aviso/generador-xml';

const SUJETO = {
  clave_sujeto_obligado: 'NOTA900101AB1',
  clave_actividad: 'FEP',
};

const PERSONA = {
  nombre: 'Juan Carlos',
  apellido_paterno: 'Pérez',
  apellido_materno: 'López',
  fecha_nacimiento: '1980-05-02',
  rfc: 'PELJ800502AB1',
  curp: 'PELJ800502HDFRPN09',
};

/** Un nodo de la rama del poder, por su número del instructivo. */
function nodo(no: string): NodoRama {
  let encontrado: NodoRama | null = null;
  const buscar = (n: NodoRama) => {
    if (n.no === no) encontrado = n;
    n.hijos.forEach(buscar);
  };
  buscar(ramaDelActo('otorgamiento_poder')!);
  return encontrado!;
}

const TIPO_PERSONA_PODERDANTE = '3.6.1.3.1.1.1';
const TIPO_PERSONA_APODERADO = '3.6.1.3.1.2.2';

/**
 * Un poder completo: una poderdante persona física y un apoderado persona
 * física. Es lo mínimo que el layout acepta para esta rama.
 */
function poderCompleto(): DatosActo {
  let d: DatosActo = {};
  d = escribirVariante(d, nodo(TIPO_PERSONA_PODERDANTE), [0], 'persona_fisica');
  d = escribirValor(d, '3.6.1.3.1.1.1.1.1', [0], 'MARIA');
  d = escribirValor(d, '3.6.1.3.1.1.1.1.2', [0], 'Muñoz');
  d = escribirValor(d, '3.6.1.3.1.1.1.1.3', [0], 'Ramírez');
  d = escribirValor(d, '3.6.1.3.1.1.1.1.4', [0], '1975-03-11');
  d = escribirValor(d, '3.6.1.3.1.1.1.1.5', [0], 'MURM750311AB1');
  d = escribirValor(d, '3.6.1.3.1.1.1.1.6', [0], 'MURM750311MDFXXX01');
  d = escribirValor(d, '3.6.1.3.1.1.1.1.7', [0], 'MX');
  d = escribirValor(d, '3.6.1.3.1.1.1.1.8', [0], '1234567');

  d = escribirValor(d, '3.6.1.3.1.2.1', [0], '1'); // tipo de poder
  d = escribirVariante(d, nodo(TIPO_PERSONA_APODERADO), [0], 'persona_fisica');
  d = escribirValor(d, '3.6.1.3.1.2.2.1.1', [0], 'JUAN');
  d = escribirValor(d, '3.6.1.3.1.2.2.1.2', [0], 'Pérez');
  d = escribirValor(d, '3.6.1.3.1.2.2.1.3', [0], 'López');
  d = escribirValor(d, '3.6.1.3.1.2.2.1.4', [0], '1980-05-02');
  d = escribirValor(d, '3.6.1.3.1.2.2.1.5', [0], 'PELJ800502AB1');
  d = escribirValor(d, '3.6.1.3.1.2.2.1.6', [0], 'PELJ800502HDFRPN09');
  d = escribirValor(d, '3.6.1.3.1.2.2.1.7', [0], 'MX');
  return d;
}

const ACTO = {
  referencia_aviso: 'IKAN2608001',
  prioridad: '1' as const,
  alerta: { tipo: '100', descripcion: 'Sin alerta' },
  persona: PERSONA,
  instrumento_publico: '45321',
  fecha_operacion: '2026-08-14',
  tipo_acto: 'otorgamiento_poder',
  datos_acto: poderCompleto(),
};

const BASE: EntradaAviso = { mes_reportado: '2026-08', sujeto: SUJETO, actos: [ACTO] };

/** El contenido de una etiqueta del XML, para comprobar dentro de una rama y
 *  no en todo el archivo: el layout repite etiquetas por todas partes. */
function bloque(xml: string, etiqueta: string): string {
  const i = xml.indexOf(`<${etiqueta}>`);
  const f = xml.indexOf(`</${etiqueta}>`, i);
  return i < 0 ? '' : xml.slice(i, f);
}

describe('normalización a lo que el layout admite', () => {
  it('quita acentos y sube a mayúsculas', () => {
    expect(textoLayout('Pérez Ñuñez')).toBe('PEREZ ÑUÑEZ');
    expect(textoLayout('José María')).toBe('JOSE MARIA');
  });

  it('conserva la Ñ, que no es una N con acento', () => {
    expect(textoLayout('Muñoz')).toBe('MUÑOZ');
  });

  it('sustituye por espacio lo que el layout no admite, sin pegar palabras', () => {
    expect(textoLayout('S.A. de C.V.')).toBe('S A DE C V');
    expect(textoLayout('  doble   espacio  ')).toBe('DOBLE ESPACIO');
  });

  it('convierte fechas a AAAAMMDD y periodos a AAAAMM', () => {
    expect(fechaLayout('2026-08-14')).toBe('20260814');
    expect(fechaLayout('2026-08-14T12:00:00.000Z')).toBe('20260814');
    expect(fechaLayout('')).toBeNull();
    expect(mesLayout('2026-08')).toBe('202608');
    expect(mesLayout('nada')).toBeNull();
  });
});

describe('aviso con operaciones', () => {
  it('genera un XML con la estructura del layout', () => {
    const r = generarAvisoXml(BASE);
    expect(r.errores).toEqual([]);
    expect(r.xml).toContain('<archivo>');
    expect(r.xml).toContain('<mes_reportado>202608</mes_reportado>');
    expect(r.xml).toContain('<clave_actividad>FEP</clave_actividad>');
    expect(r.xml).toContain('<instrumento_publico>45321</instrumento_publico>');
    expect(r.xml).toContain('<fecha_operacion>20260814</fecha_operacion>');
    expect(r.xml).toContain('<otorgamiento_poder>');
    expect(r.xml).toContain('<tipo_poder>1</tipo_poder>');
  });

  it('respeta el orden de las etiquetas que exige el XSD', () => {
    const xml = generarAvisoXml(BASE).xml!;
    const orden = [
      'mes_reportado', 'sujeto_obligado', 'clave_sujeto_obligado', 'clave_actividad',
      'aviso', 'referencia_aviso', 'prioridad', 'alerta', 'persona_aviso',
      'detalle_operaciones', 'datos_operacion', 'instrumento_publico', 'fecha_operacion',
      'tipo_actividad',
    ];
    const posiciones = orden.map((t) => xml.indexOf(`<${t}`));
    expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
  });

  it('normaliza los nombres dentro del XML', () => {
    const xml = generarAvisoXml(BASE).xml!;
    expect(xml).toContain('<apellido_paterno>PEREZ</apellido_paterno>');
    expect(xml).not.toContain('Pérez');
  });

  it('escapa el & del RFC en vez de romper el XML', () => {
    const r = generarAvisoXml({
      ...BASE,
      actos: [{ ...ACTO, persona: { ...PERSONA, rfc: 'PE&J800502AB1' } }],
    });
    expect(r.xml).toContain('PE&amp;J800502AB1');
    expect(r.xml).not.toMatch(/<rfc>[^<]*&[^a]/);
  });

  it('emite un <aviso> por acto', () => {
    const r = generarAvisoXml({
      ...BASE,
      actos: [ACTO, { ...ACTO, referencia_aviso: 'IKAN2608002', instrumento_publico: '45322' }],
    });
    expect(r.xml!.match(/<aviso>/g)).toHaveLength(2);
  });
});

describe('informe en ceros', () => {
  it('lleva <exento>1</exento> y ninguna etiqueta <aviso>', () => {
    const r = generarAvisoXml({ mes_reportado: '2026-08', sujeto: SUJETO, actos: [], en_ceros: true });
    expect(r.errores).toEqual([]);
    expect(r.xml).toContain('<exento>1</exento>');
    expect(r.xml).not.toContain('<aviso>');
  });

  it('un informe en ceros CON avisos se rechaza: el layout lo prohíbe', () => {
    const r = generarAvisoXml({ ...BASE, en_ceros: true });
    expect(r.xml).toBeNull();
    expect(r.errores.join(' ')).toContain('VC3R1');
  });

  it('un aviso sin actos y sin marca de ceros también se rechaza', () => {
    const r = generarAvisoXml({ mes_reportado: '2026-08', sujeto: SUJETO, actos: [] });
    expect(r.xml).toBeNull();
    expect(r.errores.join(' ')).toContain('informe en ceros');
  });
});

describe('no entrega un archivo que el portal va a rechazar', () => {
  it('sin clave del padrón no hay XML', () => {
    const r = generarAvisoXml({ ...BASE, sujeto: { clave_sujeto_obligado: null, clave_actividad: null } });
    expect(r.xml).toBeNull();
    expect(r.errores).toHaveLength(2);
  });

  it('rechaza el número de instrumento con coma', () => {
    const r = generarAvisoXml({ ...BASE, actos: [{ ...ACTO, instrumento_publico: '45,321' }] });
    expect(r.xml).toBeNull();
    expect(r.errores.join(' ')).toContain('guion bajo');
  });

  it('rechaza un acto que se presenta por DeclaraNOT, no por el SPPLD', () => {
    const r = generarAvisoXml({ ...BASE, actos: [{ ...ACTO, tipo_acto: 'transmision_inmueble' }] });
    expect(r.xml).toBeNull();
    expect(r.errores.join(' ')).toContain('DeclaraNOT');
  });

  it('rechaza al compareciente sin fecha de nacimiento, RFC ni CURP', () => {
    const r = generarAvisoXml({
      ...BASE,
      actos: [{ ...ACTO, persona: { ...PERSONA, fecha_nacimiento: null, rfc: null, curp: null } }],
    });
    expect(r.xml).toBeNull();
    expect(r.errores.join(' ')).toContain('al menos uno de los tres');
  });

  it('acepta que falte uno de los tres, y lo avisa', () => {
    const r = generarAvisoXml({
      ...BASE,
      actos: [{ ...ACTO, persona: { ...PERSONA, curp: null } }],
    });
    expect(r.errores).toEqual([]);
    expect(r.advertencias.join(' ')).toContain('sin CURP');
    // El compareciente no lleva <curp>; los intervinientes del acto sí tienen
    // el suyo, así que la ausencia se comprueba dentro de <persona_aviso>.
    expect(bloque(r.xml!, 'persona_aviso')).not.toContain('<curp>');
  });

  it('rechaza los dos apellidos en XXXX', () => {
    const r = generarAvisoXml({
      ...BASE,
      actos: [{ ...ACTO, persona: { ...PERSONA, apellido_paterno: 'XXXX', apellido_materno: 'XXXX' } }],
    });
    expect(r.xml).toBeNull();
    expect(r.errores.join(' ')).toContain('XXXX');
  });

  it('rechaza una prioridad que no es 1 ni 2', () => {
    const r = generarAvisoXml({ ...BASE, actos: [{ ...ACTO, prioridad: '3' as '1' }] });
    expect(r.xml).toBeNull();
  });

  it('nombra el acto en el error, para saber cuál de veinte falla', () => {
    const r = generarAvisoXml({
      ...BASE,
      actos: [ACTO, { ...ACTO, referencia_aviso: 'IKAN2608002', instrumento_publico: '' }],
    });
    expect(r.errores[0]).toContain('IKAN2608002');
  });
});

describe('rama del tipo de acto', () => {
  it('arma el subárbol completo del poder', () => {
    const xml = generarAvisoXml(BASE).xml!;
    expect(xml).toContain('<otorgamiento_poder>');
    expect(xml).toContain('<datos_poderdante>');
    expect(xml).toContain('<datos_apoderado>');
    expect(xml).toContain('<tipo_poder>1</tipo_poder>');
    // La variante elegida va; las otras dos no existen en el archivo.
    expect(xml).toContain('<persona_fisica>');
    expect(xml).not.toContain('<persona_moral>');
    expect(xml).not.toContain('<fideicomiso>');
  });

  it('normaliza los valores de la rama como el layout los pide', () => {
    const xml = generarAvisoXml(BASE).xml!;
    expect(xml).toContain('<apellido_paterno>MUÑOZ</apellido_paterno>');
    expect(xml).toContain('<apellido_materno>RAMIREZ</apellido_materno>');
    expect(xml).toContain('<fecha_nacimiento>19750311</fecha_nacimiento>');
  });

  it('respeta el orden del instructivo dentro de la rama', () => {
    const xml = generarAvisoXml(BASE).xml!;
    const orden = [
      '<otorgamiento_poder>',
      '<datos_poderdante>',
      '</datos_poderdante>',
      '<datos_apoderado>',
      '<tipo_poder>',
      '</datos_apoderado>',
      '</otorgamiento_poder>',
    ];
    let desde = 0;
    for (const etiqueta of orden) {
      const i = xml.indexOf(etiqueta, desde);
      expect(i, etiqueta).toBeGreaterThan(-1);
      desde = i;
    }
  });

  it('una rama vacía frena el aviso en vez de entregar un archivo que el portal rechaza', () => {
    const r = generarAvisoXml({ ...BASE, actos: [{ ...ACTO, datos_acto: {} }] });
    expect(r.xml).toBeNull();
    expect(r.errores.join(' ')).toContain('tipo de persona');
  });

  it('un apoderado sin RFC, CURP ni fecha de nacimiento frena el aviso', () => {
    let d = poderCompleto();
    d = escribirValor(d, '3.6.1.3.1.2.2.1.4', [0], '');
    d = escribirValor(d, '3.6.1.3.1.2.2.1.5', [0], '');
    d = escribirValor(d, '3.6.1.3.1.2.2.1.6', [0], '');
    const r = generarAvisoXml({ ...BASE, actos: [{ ...ACTO, datos_acto: d }] });
    expect(r.xml).toBeNull();
    expect(r.errores.join(' ')).toContain('al menos uno');
  });

  it('faltar sólo el CURP no frena, avisa', () => {
    const d = escribirValor(poderCompleto(), '3.6.1.3.1.2.2.1.6', [0], '');
    const r = generarAvisoXml({ ...BASE, actos: [{ ...ACTO, datos_acto: d }] });
    expect(r.errores).toEqual([]);
    expect(r.advertencias.join(' ')).toContain('curp');
  });

  it('un campo obligatorio de la rama frena el aviso y dice cuál', () => {
    const d = escribirValor(poderCompleto(), '3.6.1.3.1.2.2.1.1', [0], '');
    const r = generarAvisoXml({ ...BASE, actos: [{ ...ACTO, datos_acto: d }] });
    expect(r.xml).toBeNull();
    expect(r.errores.join(' ')).toContain('3.6.1.3.1.2.2.1.1');
  });

  it('emite una etiqueta por cada repetición del grupo', () => {
    let d = poderCompleto();
    d = { ...d, '3.6.1.3.1.2#n': 2 };
    d = escribirValor(d, '3.6.1.3.1.2.1', [1], '2');
    d = escribirVariante(d, nodo(TIPO_PERSONA_APODERADO), [1], 'persona_fisica');
    d = escribirValor(d, '3.6.1.3.1.2.2.1.1', [1], 'ANA');
    d = escribirValor(d, '3.6.1.3.1.2.2.1.2', [1], 'SOLIS');
    d = escribirValor(d, '3.6.1.3.1.2.2.1.3', [1], 'VEGA');
    d = escribirValor(d, '3.6.1.3.1.2.2.1.5', [1], 'SOVA850101AB1');
    d = escribirValor(d, '3.6.1.3.1.2.2.1.7', [1], 'MX');

    const r = generarAvisoXml({ ...BASE, actos: [{ ...ACTO, datos_acto: d }] });
    expect(r.errores).toEqual([]);
    expect(r.xml!.match(/<datos_apoderado>/g)).toHaveLength(2);
    expect(r.xml).toContain('<nombre>ANA</nombre>');
    expect(r.xml).toContain('<nombre>JUAN</nombre>');
  });

  it('un acto que no está en el layout no produce rama inventada', () => {
    const r = generarAvisoXml({
      ...BASE,
      actos: [{ ...ACTO, tipo_acto: 'transmision_inmueble' }],
    });
    expect(r.xml).toBeNull();
  });
});

describe('la referencia identifica un acto y sólo uno', () => {
  it('rechaza dos actos con la misma referencia', () => {
    // El portal puede aceptarlo —son catorce caracteres libres— y ahí está el
    // problema: la referencia es por donde un modificatorio dice a cuál acto
    // corrige, y con dos iguales no hay respuesta.
    const r = generarAvisoXml({
      ...BASE,
      actos: [ACTO, { ...ACTO, instrumento_publico: '45322' }],
    });
    expect(r.xml).toBeNull();
    expect(r.errores.join(' ')).toMatch(/repite la referencia/i);
  });

  it('no se queja cuando cada acto trae la suya', () => {
    const r = generarAvisoXml({
      ...BASE,
      actos: [ACTO, { ...ACTO, referencia_aviso: 'IKAN2608002', instrumento_publico: '45322' }],
    });
    expect(r.errores.join(' ')).not.toMatch(/repite la referencia/i);
  });
});

describe('referenciaDelActo', () => {
  it('distingue actos cuyos ids empiezan igual', () => {
    // Los ids del demo son deterministas y comparten los primeros ocho
    // caracteres. Una referencia sacada del principio del uuid daba la misma
    // para los cuatro actos del mes.
    const ids = [
      '88888888-0000-0000-0000-000000000001',
      '88888888-0000-0000-0000-000000000002',
      '88888888-0000-0000-0000-000000000003',
      '88888888-0000-0000-0000-000000000004',
    ];
    const refs = ids.map((id) => referenciaDelActo('2026-08', id));
    expect(new Set(refs).size).toBe(4);
  });

  it('cabe en los catorce caracteres del campo 3.1 y no cambia', () => {
    const id = '0f3c19ab-77d2-4e51-9c30-a1b2c3d4e5f6';
    const ref = referenciaDelActo('2026-08', id);
    expect(ref).toHaveLength(14);
    expect(ref).toMatch(/^[A-Z0-9]{14}$/);
    expect(ref.startsWith('202608')).toBe(true);
    // Estable: el mismo acto, la misma referencia, corra cuando corra.
    expect(referenciaDelActo('2026-08', id)).toBe(ref);
  });
});
