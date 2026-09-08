import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parsear69B, leerCsv, fechaDeAviso, rfcValido, decodificarSat,
} from '@/lib/sat69b';

/** Fixtures recortadas de los archivos REALES del SAT, conservando su
 *  codificación latin-1 y sus saltos CRLF. Si se reguardaran como UTF-8, la
 *  prueba dejaría de cubrir el error más probable. */
function fixture(nombre: string): Buffer {
  return readFileSync(resolve(__dirname, 'fixtures/sat', nombre));
}

/** Codifica en latin-1, como publica el SAT. Usar TextEncoder aquí daría
 *  UTF-8 y el parser —con razón— leería basura: la prueba estaría midiendo
 *  el error de la prueba, no el del parser. */
function latin1(texto: string): Uint8Array {
  const b = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) b[i] = texto.charCodeAt(i) & 0xff;
  return b;
}

describe('lector de CSV', () => {
  it('respeta las comas dentro de comillas', () => {
    const filas = leerCsv('1,"ASESORES, S.A. DE C.V.",Definitivo\n');
    expect(filas[0]).toEqual(['1', 'ASESORES, S.A. DE C.V.', 'Definitivo']);
  });

  it('entiende comillas escapadas', () => {
    expect(leerCsv('a,"di ""hola""",c\n')[0]).toEqual(['a', 'di "hola"', 'c']);
  });

  it('trata CRLF como un solo salto', () => {
    expect(leerCsv('a,b\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('decodificación latin-1', () => {
  it('recupera los acentos que UTF-8 rompería', () => {
    // 0xC9 es É en latin-1; en UTF-8 sería un byte inválido.
    const texto = decodificarSat(new Uint8Array([0x41, 0x4d, 0xc9, 0x52, 0x49, 0x43, 0x41]));
    expect(texto).toBe('AMÉRICA');
  });
});

describe('fecha del aviso', () => {
  it('extrae la fecha declarada por el SAT', () => {
    expect(fechaDeAviso('Información actualizada al 31 de julio de 2026; los listados…'))
      .toBe('2026-07-31');
    expect(fechaDeAviso('Información actualizada al 05 de junio de 2026')).toBe('2026-06-05');
  });

  it('devuelve null si no hay fecha, en vez de inventar una', () => {
    expect(fechaDeAviso('cualquier otra cosa')).toBeNull();
  });
});

describe('RFC', () => {
  it('acepta moral (12) y física (13)', () => {
    expect(rfcValido('AAA120730823')).toBe(true);
    expect(rfcValido('AAA080808HL8')).toBe(true);
  });
  it('rechaza lo que no tiene forma de RFC', () => {
    expect(rfcValido('123')).toBe(false);
  });
});

describe('archivos reales del SAT · 69-B', () => {
  it('lee el listado de Definitivos', () => {
    const r = parsear69B(fixture('69b_definitivos.csv'));
    expect(r.articulo).toBe('69-B');
    expect(r.fechaActualizacion).toBe('2026-07-31');
    expect(r.descartadas).toEqual([]);
    expect(r.registros.length).toBeGreaterThan(0);
    expect(r.registros.every((x) => x.situacion === 'definitivo')).toBe(true);
  });

  it('conserva los acentos del nombre del contribuyente', () => {
    const r = parsear69B(fixture('69b_definitivos.csv'));
    const conAcento = r.registros.find((x) => x.nombre.includes('AMÉRICA'));
    expect(conAcento).toBeDefined();
    expect(conAcento!.rfc).toBe('AAA121206EV5');
  });

  it('no parte los nombres que traen comas', () => {
    const r = parsear69B(fixture('69b_definitivos.csv'));
    const conComa = r.registros.find((x) => x.rfc === 'AAA120730823');
    expect(conComa!.nombre).toBe('ASESORES Y ADMINISTRADORES AGRICOLAS, S. DE R.L. DE C.V.');
  });

  it('lee el listado de Presuntos', () => {
    const r = parsear69B(fixture('69b_presuntos.csv'));
    expect(r.registros.every((x) => x.situacion === 'presunto')).toBe(true);
  });

  it('lee el listado completo, que usa "No" sin punto y sólo 4 columnas', () => {
    const r = parsear69B(fixture('69b_completo.csv'));
    expect(r.articulo).toBe('69-B');
    expect(r.registros.length).toBeGreaterThan(0);
    // El completo mezcla situaciones, y trae "Desvirtuado " con espacio final.
    expect(r.registros.map((x) => x.situacion)).toContain('desvirtuado');
    expect(r.descartadas).toEqual([]);
  });
});

describe('archivos reales del SAT · 69-B Bis', () => {
  it('lo distingue del 69-B: son artículos distintos', () => {
    const r = parsear69B(fixture('69b_bis_completo.csv'));
    expect(r.articulo).toBe('69-B Bis');
    expect(r.fechaActualizacion).toBe('2026-06-05');
  });

  it('sólo trae definitivo y sentencia favorable', () => {
    const r = parsear69B(fixture('69b_bis_completo.csv'));
    const sits = new Set(r.registros.map((x) => x.situacion));
    expect(sits).toEqual(new Set(['definitivo', 'sentencia_favorable']));
  });
});

describe('cuando el formato no es el esperado', () => {
  it('falla con un mensaje que dice qué buscar, en vez de devolver vacío', () => {
    const basura = latin1('esto,no,es,un,listado\n1,2,3,4,5\n');
    expect(() => parsear69B(basura)).toThrow(/encabezado/i);
  });

  it('reporta las filas descartadas en vez de tragárselas', () => {
    const malo =
      'Información actualizada al 31 de julio de 2026\n' +
      'Listado completo de contribuyentes (Artículo 69-B del CFF)\n' +
      'No.,RFC,Nombre del Contribuyente,Situación del contribuyente\n' +
      '1,RFC-INVALIDO,Alguien,Definitivo\n' +
      '2,AAA120730823,Otro,Situacion Que No Existe\n';
    const r = parsear69B(latin1(malo));
    expect(r.registros).toHaveLength(0);
    expect(r.descartadas).toHaveLength(2);
    expect(r.descartadas[0].motivo).toMatch(/RFC/);
    expect(r.descartadas[1].motivo).toMatch(/Situación desconocida/);
  });
});

describe('la fila es el orden de origen que usa la migration 0064', () => {
  // El listado completo trae 77 RFC repetidos, 50 de ellos con situaciones
  // distintas: el SAT concatena sus listados por situación, así que quien fue
  // declarado definitivo y después ganó un juicio aparece dos veces, y la
  // segunda fila es la que vale. `orden_origen` en la base sale de aquí; si el
  // parser dejara de numerar en orden, el desempate se rompería en silencio y
  // volvería a decidirlo el tamaño de lote.
  const repetido =
    'Información actualizada al 31 de julio de 2026\n' +
    'Listado completo de contribuyentes (Artículo 69-B del CFF)\n' +
    'No.,RFC,Nombre del Contribuyente,Situación del contribuyente\n' +
    '1,AAA120730823,PRIMERO S.A. DE C.V.,Definitivo\n' +
    '2,BBB120730824,ABIRA S. DE R.L.,Definitivo\n' +
    '3,BBB120730824,ABIRA S. DE R.L. // En cumplimiento a la sentencia,Sentencia Favorable\n';

  it('numera estrictamente creciente y en el orden del archivo', () => {
    const r = parsear69B(latin1(repetido));
    const filas = r.registros.map((x) => x.fila);
    expect(filas).toEqual([...filas].sort((a, b) => a - b));
    expect(new Set(filas).size).toBe(filas.length);
  });

  it('conserva las dos filas del RFC repetido, en orden', () => {
    // El parser NO resuelve el conflicto: entrega las dos y deja que la base
    // decida por orden_origen. Colapsarlas aquí escondería el dato.
    const r = parsear69B(latin1(repetido));
    const bbb = r.registros.filter((x) => x.rfc === 'BBB120730824');
    expect(bbb).toHaveLength(2);
    expect(bbb[0].situacion).toBe('definitivo');
    expect(bbb[1].situacion).toBe('sentencia_favorable');
    expect(bbb[1].fila).toBeGreaterThan(bbb[0].fila);
  });
});
