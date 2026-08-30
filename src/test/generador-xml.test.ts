import { describe, it, expect } from 'vitest';
import {
  fechaLayout,
  generarAvisoXml,
  mesLayout,
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

const ACTO = {
  referencia_aviso: 'IKAN2608001',
  prioridad: '1' as const,
  alerta: { tipo: '100', descripcion: 'Sin alerta' },
  persona: PERSONA,
  instrumento_publico: '45321',
  fecha_operacion: '2026-08-14',
  tipo_acto: 'otorgamiento_poder',
  datos_acto: { tipo_poder: '1' },
};

const BASE: EntradaAviso = { mes_reportado: '2026-08', sujeto: SUJETO, actos: [ACTO] };

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
    expect(r.xml).not.toContain('<curp>');
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

describe('el detalle del acto todavía no se captura', () => {
  it('avisa que la rama va vacía en vez de fingir que está completa', () => {
    const r = generarAvisoXml({ ...BASE, actos: [{ ...ACTO, datos_acto: {} }] });
    expect(r.errores).toEqual([]);
    expect(r.advertencias.join(' ')).toContain('el portal va a rechazar');
    expect(r.xml).toContain('<otorgamiento_poder/>');
  });
});
