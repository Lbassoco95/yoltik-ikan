import { describe, expect, it } from 'vitest';
import { leerEntidadOnu, leerOnu, partirAlias, registros } from '../lib/onu';

/** Recortes del archivo REAL del 7 de septiembre de 2026. */
const ABRE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<CONSOLIDATED_LIST dateGenerated="2026-09-07T23:00:04.871Z">\n';

const CDI_001 =
  '  <INDIVIDUALS>\n' +
  '    <INDIVIDUAL>\n' +
  '      <DATAID>6907993</DATAID>\n' +
  '      <FIRST_NAME>ERIC</FIRST_NAME>\n' +
  '      <SECOND_NAME>BADEGE</SECOND_NAME>\n' +
  '      <UN_LIST_TYPE>DRC</UN_LIST_TYPE>\n' +
  '      <REFERENCE_NUMBER>CDi.001</REFERENCE_NUMBER>\n' +
  '      <LISTED_ON>2012-12-31</LISTED_ON>\n' +
  '      <NATIONALITY><VALUE>Democratic Republic of the Congo</VALUE></NATIONALITY>\n' +
  '      <LAST_DAY_UPDATED><VALUE>2016-10-13</VALUE></LAST_DAY_UPDATED>\n' +
  '      <INDIVIDUAL_ALIAS><QUALITY/><ALIAS_NAME/></INDIVIDUAL_ALIAS>\n' +
  '      <INDIVIDUAL_ADDRESS><COUNTRY>Rwanda</COUNTRY></INDIVIDUAL_ADDRESS>\n' +
  '      <INDIVIDUAL_DATE_OF_BIRTH><TYPE_OF_DATE>EXACT</TYPE_OF_DATE><YEAR>1971</YEAR></INDIVIDUAL_DATE_OF_BIRTH>\n' +
  '    </INDIVIDUAL>\n' +
  '  </INDIVIDUALS>\n';

const CIERRA = '</CONSOLIDATED_LIST>\n';

describe('el identificador es el número de referencia permanente', () => {
  it('toma REFERENCE_NUMBER, no DATAID', () => {
    // Lo exige la Adenda 3 y Cumplimiento lo reiteró al corregir la URL: el
    // orden alfabético cambia con cada alta y no sirve como clave.
    const r = leerOnu(ABRE + CDI_001 + CIERRA);
    expect(r.registros[0].identificadorFuente).toBe('CDi.001');
    expect(r.registros[0].dataId).toBe('6907993');
  });

  it('sin REFERENCE_NUMBER se descarta y se sugiere la causa probable', () => {
    const sinPrn =
      '  <INDIVIDUALS><INDIVIDUAL><DATAID>1</DATAID><FIRST_NAME>X</FIRST_NAME></INDIVIDUAL></INDIVIDUALS>\n';
    const r = leerOnu(ABRE + sinPrn + CIERRA);
    expect(r.registros).toHaveLength(0);
    expect(r.descartadas[0].motivo).toMatch(/alfabéticamente/);
  });

  it('rechaza un archivo que no es la Lista Consolidada', () => {
    expect(() => leerOnu('<?xml version="1.0"?>\n<Sanctions/>')).toThrow(/CONSOLIDATED_LIST/);
  });
});

describe('los nombres empacados en un solo campo', () => {
  it('parte un alias con varios nombres separados por punto y coma', () => {
    // En el archivo real son 22 alias y 51 nombres recuperados, varios del
    // programa nuclear iraní. Sin partir no cotejarían nunca.
    const iri =
      '  <INDIVIDUALS><INDIVIDUAL>\n' +
      '    <REFERENCE_NUMBER>IRi.003</REFERENCE_NUMBER>\n' +
      '    <FIRST_NAME>AZIM</FIRST_NAME><SECOND_NAME>AGHAJANI</SECOND_NAME>\n' +
      '    <INDIVIDUAL_ALIAS><QUALITY>Good</QUALITY>' +
      '<ALIAS_NAME>Azim Adhajani; Azim Agha-Jani</ALIAS_NAME></INDIVIDUAL_ALIAS>\n' +
      '  </INDIVIDUAL></INDIVIDUALS>\n';
    const r = leerOnu(ABRE + iri + CIERRA);
    expect(r.registros[0].nombresAlternos).toEqual(['Azim Adhajani', 'Azim Agha-Jani']);
  });

  it('parte también el NOMBRE PRIMARIO cuando trae dos razones sociales', () => {
    // Es el caso CDe.003 del archivo real. Pasa en el nombre principal, no sólo
    // en los alias, y guardarlo entero haría que ninguna de las dos cotejara.
    const cde =
      '  <ENTITIES><ENTITY>\n' +
      '    <REFERENCE_NUMBER>CDe.003</REFERENCE_NUMBER>\n' +
      '    <FIRST_NAME>COMPAGNIE AERIENNE DES GRANDS LACS (CAGL) ; GREAT LAKES BUSINESS COMPANY (GLBC)</FIRST_NAME>\n' +
      '  </ENTITY></ENTITIES>\n';
    const r = leerOnu(ABRE + cde + CIERRA);
    expect(r.registros[0].nombre).toBe('COMPAGNIE AERIENNE DES GRANDS LACS (CAGL)');
    expect(r.registros[0].nombresAlternos).toContain('GREAT LAKES BUSINESS COMPANY (GLBC)');
  });

  it('un individuo con varios campos de nombre se compone sin partirse', () => {
    const r = leerOnu(ABRE + CDI_001 + CIERRA);
    expect(r.registros[0].nombre).toBe('ERIC BADEGE');
  });
});

describe('la calidad del alias se respeta', () => {
  it('los Low van aparte de los Good', () => {
    // Un alias «Low» es una variante ortográfica débil: sirve para levantar un
    // candidato, no para afirmar una coincidencia. Mezclarlos convertiría el
    // barrido en una fuente de falsos positivos que nadie revisaría.
    const mixto =
      '  <INDIVIDUALS><INDIVIDUAL>\n' +
      '    <REFERENCE_NUMBER>QDi.999</REFERENCE_NUMBER><FIRST_NAME>ALPHA</FIRST_NAME>\n' +
      '    <INDIVIDUAL_ALIAS><QUALITY>Good</QUALITY><ALIAS_NAME>Alfa Bueno</ALIAS_NAME></INDIVIDUAL_ALIAS>\n' +
      '    <INDIVIDUAL_ALIAS><QUALITY>Low</QUALITY><ALIAS_NAME>Alfaa Debil</ALIAS_NAME></INDIVIDUAL_ALIAS>\n' +
      '  </INDIVIDUAL></INDIVIDUALS>\n';
    const r = leerOnu(ABRE + mixto + CIERRA);
    expect(r.registros[0].nombresAlternos).toEqual(['Alfa Bueno']);
    expect(r.registros[0].nombresAlternosDebiles).toEqual(['Alfaa Debil']);
  });

  it('los nodos de alias vacíos se ignoran', () => {
    // El archivo trae 294 así: <QUALITY/><ALIAS_NAME/>. No significan nada.
    const r = leerOnu(ABRE + CDI_001 + CIERRA);
    expect(r.registros[0].nombresAlternos).toEqual([]);
    expect(r.registros[0].nombresAlternosDebiles).toEqual([]);
  });

  it('el nombre en escritura original es alias bueno, no variante débil', () => {
    // Lo traen 338 de las 736 personas. Es el MISMO nombre en árabe, no una
    // grafía dudosa.
    const arabe =
      '  <INDIVIDUALS><INDIVIDUAL>\n' +
      '    <REFERENCE_NUMBER>IQi.001</REFERENCE_NUMBER><FIRST_NAME>SADDAM</FIRST_NAME>\n' +
      '    <NAME_ORIGINAL_SCRIPT>صدام حسين التكريتي</NAME_ORIGINAL_SCRIPT>\n' +
      '  </INDIVIDUAL></INDIVIDUALS>\n';
    const r = leerOnu(ABRE + arabe + CIERRA);
    expect(r.registros[0].nombresAlternos).toEqual(['صدام حسين التكريتي']);
  });
});

describe('la fecha de nacimiento respeta la forma en que la ONU la da', () => {
  const conFecha = (dob: string) =>
    ABRE +
    '  <INDIVIDUALS><INDIVIDUAL><REFERENCE_NUMBER>X.1</REFERENCE_NUMBER>' +
    '<FIRST_NAME>N</FIRST_NAME>' +
    `<INDIVIDUAL_DATE_OF_BIRTH>${dob}</INDIVIDUAL_DATE_OF_BIRTH>` +
    '</INDIVIDUAL></INDIVIDUALS>\n' +
    CIERRA;

  it('un día exacto es el día', () => {
    const r = leerOnu(conFecha('<TYPE_OF_DATE>EXACT</TYPE_OF_DATE><DATE>1966-09-09</DATE>'));
    expect(r.registros[0].fechaNacimiento).toBe('1966-09-09');
  });

  it('un año aproximado lo dice, no se convierte en un 1 de enero', () => {
    const r = leerOnu(conFecha('<TYPE_OF_DATE>APPROXIMATELY</TYPE_OF_DATE><YEAR>1960</YEAR>'));
    expect(r.registros[0].fechaNacimiento).toBe('1960 (aproximada)');
    expect(r.registros[0].fechaNacimientoTipo).toBe('APPROXIMATELY');
  });

  it('un rango entre dos años se conserva como rango', () => {
    const r = leerOnu(
      conFecha('<TYPE_OF_DATE>BETWEEN</TYPE_OF_DATE><FROM_YEAR>1973</FROM_YEAR><TO_YEAR>1974</TO_YEAR>'),
    );
    expect(r.registros[0].fechaNacimiento).toBe('entre 1973 y 1974');
  });

  it('sin fecha queda null, y el tipo se conserva si venía', () => {
    const r = leerOnu(conFecha('<TYPE_OF_DATE>EXACT</TYPE_OF_DATE>'));
    expect(r.registros[0].fechaNacimiento).toBeNull();
    expect(r.registros[0].fechaNacimientoTipo).toBe('EXACT');
  });
});

describe('personas y entidades', () => {
  it('se distinguen por la envoltura del documento', () => {
    const doc =
      ABRE +
      CDI_001 +
      '  <ENTITIES><ENTITY><REFERENCE_NUMBER>CDe.001</REFERENCE_NUMBER>' +
      '<FIRST_NAME>ADF</FIRST_NAME><UN_LIST_TYPE>DRC</UN_LIST_TYPE>' +
      '<ENTITY_ALIAS><QUALITY>Good</QUALITY><ALIAS_NAME>Allied Democratic Forces</ALIAS_NAME></ENTITY_ALIAS>' +
      '</ENTITY></ENTITIES>\n' +
      CIERRA;
    const r = leerOnu(doc);
    expect(r.registros.map((x) => x.tipoEntidad)).toEqual(['persona', 'empresa']);
    expect(r.registros[1].nombresAlternos).toEqual(['Allied Democratic Forces']);
  });

  it('el recorrido entrega los trozos uno por vez', () => {
    const trozos = [...registros(ABRE + CDI_001 + CIERRA)];
    expect(trozos).toHaveLength(1);
    expect(leerEntidadOnu(trozos[0].trozo, trozos[0].tipo)).toMatchObject({
      identificadorFuente: 'CDi.001',
      regimen: 'DRC',
      listadoEn: '2012-12-31',
      revisadoEn: '2016-10-13',
      pais: 'Democratic Republic of the Congo',
    });
  });
});

describe('la fecha de la fuente', () => {
  it('sale de dateGenerated, no de cuándo se cargó', () => {
    const r = leerOnu(ABRE + CDI_001 + CIERRA);
    expect(r.fechaActualizacion).toBe('2026-09-07');
  });
});

describe('la traducción al camino de carga', () => {
  it('lleva el PRN como identificador y separa los alias por calidad', async () => {
    const { registrosParaCarga } = await import('../lib/onu');
    const mixto =
      ABRE +
      '  <INDIVIDUALS><INDIVIDUAL>\n' +
      '    <REFERENCE_NUMBER>QDi.999</REFERENCE_NUMBER><FIRST_NAME>ALPHA</FIRST_NAME>\n' +
      '    <UN_LIST_TYPE>Al-Qaida</UN_LIST_TYPE><LISTED_ON>2001-10-06</LISTED_ON>\n' +
      '    <INDIVIDUAL_ALIAS><QUALITY>Good</QUALITY><ALIAS_NAME>Alfa Bueno</ALIAS_NAME></INDIVIDUAL_ALIAS>\n' +
      '    <INDIVIDUAL_ALIAS><QUALITY>Low</QUALITY><ALIAS_NAME>Alfaa Debil</ALIAS_NAME></INDIVIDUAL_ALIAS>\n' +
      '  </INDIVIDUAL></INDIVIDUALS>\n' +
      CIERRA;
    const [fila] = registrosParaCarga(leerOnu(mixto).registros);
    expect(fila).toMatchObject({
      nombre: 'ALPHA',
      rfc: null,
      tipo_entidad: 'persona',
      identificador_fuente: 'QDi.999',
      nombres_alternos: ['Alfa Bueno'],
      nombres_alternos_debiles: ['Alfaa Debil'],
    });
    // El régimen y la fecha de listado no tienen columna: van como dato del
    // expediente, no se pierden.
    expect(fila.identificadores).toMatchObject({ regimen: 'Al-Qaida', listado_en: '2001-10-06' });
  });
});

describe('partir un alias que trae varios nombres', () => {
  it('parte por punto y coma cuando de verdad separa alias', () => {
    // IRi.039 (Soleimani): la ONU empaca tres alias en un elemento. Sin
    // partir, ninguno de los tres cotejaría nunca.
    expect(partirAlias('Haj Qasem; Haji Qassem; Sardar Soleimani')).toEqual([
      'Haj Qasem',
      'Haji Qassem',
      'Sardar Soleimani',
    ]);
  });

  it('NO parte por un punto y coma que va dentro de un paréntesis', () => {
    // QDi.299 (al-Baghdadi), el caso que rompía. Partido a ciegas producía
    // «…al-Husayni al-Quraishi» con el paréntesis abierto sin cerrar y
    // «Abu Bakr al-Baghdadi)» con el paréntesis pegado al final, que es
    // justo lo que un operador NO va a teclear. En la única lista que impide
    // operar, eso era una coincidencia perdida.
    const r = partirAlias(
      'أبو بكر البغدادي (Abu Bakr al-Baghdadi al-Husayni al-Quraishi; Abu Bakr al-Baghdadi)',
    );
    expect(r).toEqual([
      'أبو بكر البغدادي',
      'Abu Bakr al-Baghdadi al-Husayni al-Quraishi',
      'Abu Bakr al-Baghdadi',
    ]);
    // Y ninguno queda con el paréntesis descuadrado.
    for (const x of r) {
      expect(x).not.toMatch(/[()]/);
    }
  });

  it('deja en paz los paréntesis que no separan nada', () => {
    // CDe.003: dos razones sociales, cada una con sus siglas entre
    // paréntesis. El punto y coma sí separa, y las siglas se conservan
    // porque forman parte del nombre con el que la entidad opera.
    expect(
      partirAlias('COMPAGNIE AERIENNE DES GRANDS LACS (CAGL) ; GREAT LAKES BUSINESS COMPANY (GLBC)'),
    ).toEqual([
      'COMPAGNIE AERIENNE DES GRANDS LACS (CAGL)',
      'GREAT LAKES BUSINESS COMPANY (GLBC)',
    ]);
  });

  it('un nombre suelto se devuelve tal cual', () => {
    expect(partirAlias('Abu Ali')).toEqual(['Abu Ali']);
    expect(partirAlias('  ')).toEqual([]);
  });
});

describe('los alias sin nombre se cuentan, no se callan', () => {
  // Instrucción 295 de Cumplimiento: «se descarta y se reporta, nunca en
  // silencio», misma disciplina que las 238 filas suprimidas del 69-B. Son
  // 294 en el archivo real. Si un día esa cifra cayera a cero sin que la ONU
  // cambiara nada, el lector habría dejado de ver una parte del archivo — y
  // eso hay que notarlo aquí y no en un barrido que no encuentra a nadie.
  const CON_VACIO =
    ABRE +
    '  <INDIVIDUALS>\n' +
    '    <INDIVIDUAL>\n' +
    '      <DATAID>1</DATAID>\n' +
    '      <FIRST_NAME>PRUEBA</FIRST_NAME>\n' +
    '      <UN_LIST_TYPE>Test</UN_LIST_TYPE>\n' +
    '      <REFERENCE_NUMBER>TSi.001</REFERENCE_NUMBER>\n' +
    '      <INDIVIDUAL_ALIAS><QUALITY>Good</QUALITY><ALIAS_NAME>Buena</ALIAS_NAME></INDIVIDUAL_ALIAS>\n' +
    '      <INDIVIDUAL_ALIAS><QUALITY></QUALITY><ALIAS_NAME></ALIAS_NAME></INDIVIDUAL_ALIAS>\n' +
    '      <INDIVIDUAL_ALIAS><ALIAS_NAME></ALIAS_NAME></INDIVIDUAL_ALIAS>\n' +
    '    </INDIVIDUAL>\n' +
    '  </INDIVIDUALS>\n' +
    '</CONSOLIDATED_LIST>\n';

  it('se descartan del índice y se asienta la cuenta', () => {
    const r = leerOnu(CON_VACIO);
    expect(r.aliasVacios).toBe(2);
    expect(r.registros[0].aliasVacios).toBe(2);
    // Y no ensucian el índice con cadenas vacías.
    expect(r.registros[0].nombresAlternos).toEqual(['Buena']);
    expect(r.registros[0].nombresAlternosDebiles).toEqual([]);
  });
});
