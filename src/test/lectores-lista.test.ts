import { describe, expect, it } from 'vitest';
import {
  analizarBytes,
  avisoDeControl,
  FORMATO_ESPERADO,
  FUENTES_CON_LECTOR,
  revisarTamano,
} from '../lib/lectores-lista';

/** Los bytes UTF-8 de un texto: lo que publican OFAC y la ONU. */
function bytes(contenido: string): ArrayBuffer {
  return new TextEncoder().encode(contenido).buffer as ArrayBuffer;
}

/**
 * Los bytes latin-1: lo que publica el SAT. Importa para la prueba porque el
 * encabezado dice «Situación», y con acento mal codificado el lector no
 * reconoce la columna — que es exactamente el fallo que se ve si alguien abre
 * el archivo en Excel y lo vuelve a guardar.
 */
function bytesLatin1(contenido: string): ArrayBuffer {
  const b = new Uint8Array(contenido.length);
  for (let i = 0; i < contenido.length; i++) b[i] = contenido.charCodeAt(i) & 0xff;
  return b.buffer;
}

const ONU_MINIMO =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<CONSOLIDATED_LIST dateGenerated="2026-09-07T23:00:04.871Z">\n' +
  '  <INDIVIDUALS><INDIVIDUAL>\n' +
  '    <REFERENCE_NUMBER>CDi.001</REFERENCE_NUMBER><DATAID>6907993</DATAID>\n' +
  '    <FIRST_NAME>ERIC</FIRST_NAME><SECOND_NAME>BADEGE</SECOND_NAME>\n' +
  '    <UN_LIST_TYPE>DRC</UN_LIST_TYPE><LISTED_ON>2012-12-31</LISTED_ON>\n' +
  '    <INDIVIDUAL_ALIAS><QUALITY>Good</QUALITY><ALIAS_NAME>Eric Badege Mumbere</ALIAS_NAME></INDIVIDUAL_ALIAS>\n' +
  '    <INDIVIDUAL_ALIAS><QUALITY>Low</QUALITY><ALIAS_NAME>Erik Badeje</ALIAS_NAME></INDIVIDUAL_ALIAS>\n' +
  '  </INDIVIDUAL></INDIVIDUALS>\n' +
  '  <ENTITIES><ENTITY>\n' +
  '    <REFERENCE_NUMBER>CDe.001</REFERENCE_NUMBER><FIRST_NAME>ADF</FIRST_NAME>\n' +
  '    <UN_LIST_TYPE>DRC</UN_LIST_TYPE>\n' +
  '  </ENTITY></ENTITIES>\n' +
  '</CONSOLIDATED_LIST>\n';

const OFAC_MINIMO =
  '<?xml version="1.0" encoding="utf-8"?>\n' +
  '<sanctionsData xmlns="https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ENHANCED_XML">\n' +
  '  <publicationInfo><dataAsOf>2026-07-27T00:00:00</dataAsOf>\n' +
  '    <filters><sanctionsLists><sanctionsList refId="91512">Consolidated List</sanctionsList></sanctionsLists></filters>\n' +
  '  </publicationInfo>\n' +
  '  <entities><entity id="9640">\n' +
  '    <generalInfo><entityType>Individual</entityType></generalInfo>\n' +
  '    <sanctionsLists><sanctionsList refId="1" id="2" datePublished="2014-10-10">Consolidated List</sanctionsList></sanctionsLists>\n' +
  '    <sanctionsPrograms><sanctionsProgram refId="1" id="2">NS-PLC</sanctionsProgram></sanctionsPrograms>\n' +
  '    <sanctionsTypes><sanctionsType refId="1" id="2">Block</sanctionsType></sanctionsTypes>\n' +
  '    <names><name id="1"><isPrimary>true</isPrimary><translations><translation>' +
  '<isPrimary>true</isPrimary><formattedFullName>ABU TEIR, Mohammed</formattedFullName>' +
  '</translation></translations></name></names>\n' +
  '  </entity></entities>\n' +
  '</sanctionsData>\n';

describe('qué fuentes tienen lector', () => {
  it('las dos del SAT, OFAC y la ONU', () => {
    expect([...FUENTES_CON_LECTOR].sort()).toEqual([
      'ofac_sdn',
      'onu_consolidada',
      'sat_69b',
      'sat_69b_bis',
    ]);
  });

  it('una fuente sin lector falla diciéndolo, no devuelve vacío', () => {
    expect(() => analizarBytes('ue_sanciones', bytes('<a/>'))).toThrow(/no hay lector/i);
  });

  it('cada fuente dice qué archivo espera', () => {
    for (const f of FUENTES_CON_LECTOR) {
      expect(FORMATO_ESPERADO[f]).toBeTruthy();
    }
    // Y el aviso de no confundirse, que es el error que de verdad pasa.
    expect(FORMATO_ESPERADO.ofac_sdn).toMatch(/No el ADVANCED/);
    expect(FORMATO_ESPERADO.onu_consolidada).toMatch(/No el alfabético/);
  });
});

describe('el tope del navegador', () => {
  it('un archivo enorme se rechaza por el TAMAÑO, sin leer el contenido', () => {
    // El SDN de OFAC pesa 104 MB. La comprobación va aparte del análisis justo
    // para no tener que cargar los 109 MB en memoria antes de poder medirlos.
    expect(() => revisarTamano(109 * 1024 * 1024)).toThrow(/109 MB/);
    expect(() => revisarTamano(109 * 1024 * 1024)).toThrow(/NO se cargó/);
  });

  it('los archivos reales de 2 a 5 MB pasan', () => {
    expect(() => revisarTamano(5 * 1024 * 1024)).not.toThrow();
    expect(analizarBytes('onu_consolidada', bytes(ONU_MINIMO)).registros).toHaveLength(2);
  });
});

describe('la ONU', () => {
  it('propone alcance completo: el archivo ES la lista y la fuente es una', () => {
    const r = analizarBytes('onu_consolidada', bytes(ONU_MINIMO));
    expect(r.alcanceSugerido).toBe('completa');
  });

  it('separa los alias por calidad y lo cuenta en la vista previa', () => {
    const r = analizarBytes('onu_consolidada', bytes(ONU_MINIMO));
    expect(r.registros[0].nombres_alternos).toEqual(['Eric Badege Mumbere']);
    expect(r.registros[0].nombres_alternos_debiles).toEqual(['Erik Badeje']);
    expect(r.cifras).toEqual(
      expect.arrayContaining([
        { etiqueta: 'alias', valor: 1 },
        { etiqueta: 'alias de baja calidad', valor: 1 },
      ]),
    );
  });

  it('avisa que esta lista IMPIDE, a diferencia de OFAC', () => {
    const r = analizarBytes('onu_consolidada', bytes(ONU_MINIMO));
    expect(r.avisos.join(' ')).toMatch(/IMPIDE operar/);
  });

  it('lleva el PRN como identificador de fuente', () => {
    const r = analizarBytes('onu_consolidada', bytes(ONU_MINIMO));
    expect(r.registros.map((x) => x.identificador_fuente)).toEqual(['CDi.001', 'CDe.001']);
  });
});

describe('OFAC', () => {
  it('propone PARCIAL aunque el archivo sea completo, y dice por qué', () => {
    // El catálogo tiene una sola fuente para OFAC y el Tesoro publica dos
    // listas. Con alcance completo, cada carga daría de baja a la otra.
    const r = analizarBytes('ofac_sdn', bytes(OFAC_MINIMO));
    expect(r.alcanceSugerido).toBe('parcial');
    expect(r.avisos.join(' ')).toMatch(/dos listas/);
    expect(r.avisos.join(' ')).toMatch(/dar[íi]a de baja a la otra/);
  });

  it('lee la lista que declara el archivo en su etiqueta', () => {
    const r = analizarBytes('ofac_sdn', bytes(OFAC_MINIMO));
    expect(r.etiqueta).toBe('OFAC · Consolidated List');
    expect(r.fechaActualizacion).toBe('2026-07-27');
  });

  it('no manda RFC: OFAC es un registro de sanciones, no fiscal', () => {
    const r = analizarBytes('ofac_sdn', bytes(OFAC_MINIMO));
    expect(r.registros[0].rfc).toBeNull();
    expect(r.registros[0].identificador_fuente).toBe('9640');
  });
});

describe('la cifra de control de la ONU', () => {
  it('no avisa cuando la carga aterriza donde debe', () => {
    expect(avisoDeControl('onu_consolidada', 1011)).toBeNull();
    // Holgura del 10%: la lista cambia con cada alta.
    expect(avisoDeControl('onu_consolidada', 1050)).toBeNull();
  });

  it('avisa cuando el orden de magnitud no cuadra', () => {
    // Es lo que pidió Cumplimiento: que el cargador falle ruidosamente en vez
    // de dejar que el barrido diga «sin coincidencias» con media lista.
    const a = avisoDeControl('onu_consolidada', 12);
    expect(a).toMatch(/cifra de control/);
    expect(a).toMatch(/1,011/);
  });

  it('las fuentes sin cifra de control no inventan una', () => {
    expect(avisoDeControl('sat_69b', 3)).toBeNull();
    expect(avisoDeControl('ofac_sdn', 3)).toBeNull();
  });
});

describe('el 69-B sigue funcionando igual', () => {
  const SAT =
    'Información actualizada al 31 de julio de 2026\n' +
    'Listado completo de contribuyentes (Artículo 69-B del CFF)\n' +
    'No,RFC,Nombre del Contribuyente,Situación del contribuyente,' +
    'Número y fecha de oficio global de definitivos SAT,Publicación página SAT definitivos,' +
    'Número y fecha de oficio global de definitivos DOF,Publicación DOF definitivos,' +
    'Número y fecha de oficio global de sentencia favorable SAT,Publicación página SAT sentencia favorable,' +
    'Número y fecha de oficio global de sentencia favorable DOF,Publicación DOF sentencia favorable\n' +
    '1,AAA120730823,UNA SA,Definitivo,of-1,01/06/2018,of-1,25/06/2018,,,,\n' +
    '2,BBB120730824,OTRA SA,Sentencia Favorable,of-2,01/06/2019,of-2,25/06/2019,of-3,01/09/2019,of-3,25/09/2019\n';

  it('lee situaciones, orden de origen y fecha de publicación', () => {
    const r = analizarBytes('sat_69b', bytesLatin1(SAT));
    expect(r.etiqueta).toBe('69-B');
    expect(r.alcanceSugerido).toBe('completa'); // dos situaciones distintas
    expect(r.registros[0]).toMatchObject({
      rfc: 'AAA120730823',
      situacion: 'definitivo',
      orden_origen: 4,
      fecha_situacion: '2018-06-25',
    });
  });

  it('no manda identificador de fuente: el 69-B no lo publica, usa el RFC', () => {
    const r = analizarBytes('sat_69b', bytesLatin1(SAT));
    expect(r.registros[0].identificador_fuente).toBeUndefined();
  });
});
