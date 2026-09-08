import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parsear69B, leerCsv, fechaDeAviso, rfcValido, decodificarSat, esSuprimida,
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

describe('el historial por etapas, que es lo que resuelve un RFC repetido', () => {
  // Cada fila del 69-B trae 20 columnas, no cuatro: el oficio global y las dos
  // fechas de publicación —SAT y DOF— de CADA etapa por la que pasó ese
  // procedimiento. Es el dato que la migration 0065 usa para decidir, y el que
  // el lector tiraba antes de leerlo.
  const conHistorial =
    'Información actualizada al 31 de julio de 2026\n' +
    'Listado completo de contribuyentes (Artículo 69-B del CFF)\n' +
    'No,RFC,Nombre del Contribuyente,Situación del contribuyente,' +
    'Número y fecha de oficio global de presunción SAT,Publicación página SAT presuntos,' +
    'Número y fecha de oficio global de presunción DOF,Publicación DOF presuntos,' +
    'Número y fecha de oficio global de contribuyentes que desvirtuaron SAT,Publicación página SAT desvirtuados,' +
    'Número y fecha de oficio global de contribuyentes que desvirtuaron DOF,Publicación DOF desvirtuados,' +
    'Número y fecha de oficio global de definitivos SAT,Publicación página SAT definitivos,' +
    'Número y fecha de oficio global de definitivos DOF,Publicación DOF definitivos,' +
    'Número y fecha de oficio global de sentencia favorable SAT,Publicación página SAT sentencia favorable,' +
    'Número y fecha de oficio global de sentencia favorable DOF,Publicación DOF sentencia favorable\n' +
    // El caso real: la fila POSTERIOR trae una sentencia ANTERIOR en el tiempo.
    '164,AAS110331G59,ABIRA & SAFFI,Definitivo,' +
    'of-2020-7866,10/03/2020,of-2020-7866,31/03/2020,,,,,' +
    'of-2020-13691,19/06/2020,of-2020-13691,07/07/2020,,,,\n' +
    '165,AAS110331G59,ABIRA & SAFFI // sentencia,Sentencia Favorable,' +
    'of-2017-16140,01/06/2017,of-2017-16140,12/06/2017,,,,,' +
    'of-2017-38731,27/11/2017,of-2017-38731,14/12/2017,' +
    'of-2019-40235,20/12/2019,of-2019-40235,27/01/2020\n';

  it('extrae la fecha de publicación de la situación vigente, prefiriendo el DOF', () => {
    const r = parsear69B(latin1(conHistorial));
    expect(r.registros[0].fechaSituacion).toBe('2020-07-07'); // DOF definitivos
    expect(r.registros[1].fechaSituacion).toBe('2020-01-27'); // DOF sentencia
  });

  it('la fila posterior del archivo puede traer la resolución MÁS VIEJA', () => {
    // Es el hecho que tumbó el criterio de «gana la última fila»: no son dos
    // versiones del mismo expediente, son procedimientos distintos.
    const r = parsear69B(latin1(conHistorial));
    expect(r.registros[1].fila).toBeGreaterThan(r.registros[0].fila);
    expect(r.registros[1].fechaSituacion! < r.registros[0].fechaSituacion!).toBe(true);
  });

  it('conserva el oficio que respalda la situación, para poder citarlo', () => {
    const r = parsear69B(latin1(conHistorial));
    expect(r.registros[0].oficioSituacion).toBe('of-2020-13691');
    expect(r.registros[1].oficioSituacion).toBe('of-2019-40235');
  });

  it('guarda todas las etapas por las que pasó, no sólo la vigente', () => {
    const r = parsear69B(latin1(conHistorial));
    expect(r.registros[1].etapas.map((e) => e.etapa)).toEqual([
      'presunto',
      'definitivo',
      'sentencia_favorable',
    ]);
    expect(r.registros[1].etapas[0].dof).toBe('2017-06-12');
  });

  it('sin fecha de publicación devuelve null, nunca un sustituto', () => {
    // Null obliga a escalar el caso. Cualquier relleno —la fecha del archivo,
    // la posición— sería inventar un hecho jurídico.
    const sinFecha =
      'Información actualizada al 31 de julio de 2026\n' +
      'Listado completo de contribuyentes (Artículo 69-B del CFF)\n' +
      'No,RFC,Nombre del Contribuyente,Situación del contribuyente,' +
      'Número y fecha de oficio global de definitivos SAT,Publicación página SAT definitivos,' +
      'Número y fecha de oficio global de definitivos DOF,Publicación DOF definitivos\n' +
      '1,AAA120730823,SIN FECHA,Definitivo,,,,\n';
    const r = parsear69B(latin1(sinFecha));
    expect(r.registros[0].fechaSituacion).toBeNull();
  });

  it('el 69-B Bis usa los encabezados en singular y también se lee', () => {
    const bis =
      'Información actualizada al 05 de junio de 2026\n' +
      'Listado completo de contribuyentes (Artículo 69-B Bis del CFF)\n' +
      'No.,RFC,Nombre del Contribuyente,Situación del contribuyente,' +
      'Número y fecha de oficio global definitivo SAT,Publicación página SAT definitivo,' +
      'Número y fecha de oficio global definitivo DOF,Publicación DOF definitivo,' +
      'Número y fecha de oficio global de sentencia favorable SAT,Publicación página SAT sentencia favorable,' +
      'Número y fecha de oficio global de sentencia favorable DOF,Publicación DOF sentencia favorable\n' +
      '1,OAN151230HWA,OPERADORA,Sentencia Favorable,' +
      'of-2024-80,25/01/2024,of-2024-80,05/07/2024,' +
      'of-2026-254,12/03/2026,of-2026-254,05/06/2026\n';
    const r = parsear69B(latin1(bis));
    expect(r.articulo).toBe('69-B Bis');
    expect(r.registros[0].fechaSituacion).toBe('2026-06-05');
  });
});

describe('las filas que el SAT suprimió por orden judicial', () => {
  const encabezado =
    'Información actualizada al 31 de julio de 2026\n' +
    'Listado completo de contribuyentes (Artículo 69-B del CFF)\n' +
    'No.,RFC,Nombre del Contribuyente,Situación del contribuyente,' +
    'Número y fecha de oficio global de presunción SAT,Publicación página SAT presuntos,' +
    'Número y fecha de oficio global de presunción DOF,Publicación DOF presuntos\n';

  /** La fila real: RFC en equis y la razón en el lugar del nombre. */
  const suprimida =
    '1,XXXXXXXXXXXX,Información suprimida en cumplimiento a la declaratoria de nulidad ' +
    'emitida por la Segunda Sala Regional Hidalgo México.,Presunto,' +
    'of-2014-3798,10/01/2014,of-2014-3997,23/01/2014\n';

  it('se descartan diciendo que fue el SAT, no que el archivo esté mal', () => {
    const r = parsear69B(latin1(encabezado + suprimida));
    expect(r.registros).toEqual([]);
    expect(r.descartadas).toHaveLength(1);
    expect(r.descartadas[0].motivo).toMatch(/declaratoria de nulidad/);
    expect(r.descartadas[0].motivo).not.toMatch(/forma inválida/);
  });

  it('pide las DOS señales: un RFC malo con nombre de verdad no es supresión', () => {
    expect(esSuprimida('XXXXXXXXXXXX', 'Información suprimida en cumplimiento…')).toBe(true);
    // Con nombre real, es un RFC inválido y tiene que verse como tal.
    expect(esSuprimida('XXXXXXXXXXXX', 'COMERCIALIZADORA DEL BAJÍO')).toBe(false);
    // Con RFC bueno, el dato sirve y no se puede enterrar aquí.
    expect(esSuprimida('AAA120730823', 'Información suprimida en cumplimiento…')).toBe(false);
  });

  it('un RFC inválido que no es supresión sigue cayendo por su motivo', () => {
    const mala =
      '2,NO-ES-RFC,COMERCIALIZADORA DEL BAJÍO,Presunto,' +
      'of-2014-3798,10/01/2014,of-2014-3997,23/01/2014\n';
    const r = parsear69B(latin1(encabezado + mala));
    expect(r.descartadas[0].motivo).toMatch(/forma inválida/);
  });

  it('no se lleva por delante las filas buenas del mismo archivo', () => {
    const buena =
      '2,OAN151230HWA,OPERADORA DEL NORTE,Presunto,' +
      'of-2014-3798,10/01/2014,of-2014-3997,23/01/2014\n';
    const r = parsear69B(latin1(encabezado + suprimida + buena));
    expect(r.registros).toHaveLength(1);
    expect(r.registros[0].rfc).toBe('OAN151230HWA');
    expect(r.descartadas).toHaveLength(1);
  });
});
