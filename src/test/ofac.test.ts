import { describe, expect, it } from 'vitest';
import { entidades, leerEntidad, leerOfac } from '../lib/ofac';

/**
 * Recortes del archivo REAL de OFAC del 4 de septiembre de 2026. Los nombres
 * de elemento son los que publica el Tesoro; se quitó lo que no se ingiere.
 */
const CABECERA =
  '<?xml version="1.0" encoding="utf-8"?>\n' +
  '<sanctionsData xmlns="https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ENHANCED_XML">\n' +
  '  <publicationInfo>\n' +
  '    <dataAsOf>2026-07-27T00:00:00</dataAsOf>\n' +
  '    <filters><sanctionsLists>' +
  '<sanctionsList refId="91512">Consolidated List</sanctionsList>' +
  '</sanctionsLists></filters>\n' +
  '  </publicationInfo>\n' +
  '  <entities>\n';

/** El caso real 9640: un individuo con dos a.k.a. y fecha de nacimiento por año. */
const ABU_TEIR =
  '    <entity id="9640">\n' +
  '      <generalInfo><identityId>1979</identityId><entityType refId="600">Individual</entityType></generalInfo>\n' +
  '      <sanctionsLists>' +
  '<sanctionsList refId="91243" id="11849" datePublished="2006-04-12">Non-SDN Palestinian Legislative Council List</sanctionsList>' +
  '<sanctionsList refId="91512" id="14433" datePublished="2014-10-10">Consolidated List</sanctionsList>' +
  '</sanctionsLists>\n' +
  '      <sanctionsPrograms><sanctionsProgram refId="91055" id="6215">NS-PLC</sanctionsProgram></sanctionsPrograms>\n' +
  '      <names>\n' +
  '        <name id="17178"><isPrimary>true</isPrimary><isLowQuality>false</isLowQuality>\n' +
  '          <translations><translation id="1979"><isPrimary>true</isPrimary><script refId="20122">Latin</script>\n' +
  '            <formattedFullName>ABU TEIR, Mohammed</formattedFullName>\n' +
  '          </translation></translations>\n' +
  '        </name>\n' +
  '        <name id="9152"><isPrimary>false</isPrimary><aliasType refId="1400">A.K.A.</aliasType>\n' +
  '          <translations><translation id="10144"><isPrimary>true</isPrimary><script refId="20122">Latin</script>\n' +
  '            <formattedFullName>ABU TAIR, Mohammed Mahmud</formattedFullName>\n' +
  '          </translation></translations>\n' +
  '        </name>\n' +
  '      </names>\n' +
  '      <addresses><address id="12128"><country refId="91021">Palestinian</country></address></addresses>\n' +
  '      <features><feature id="4700"><type featureTypeId="8">Birthdate</type><value>1951</value>\n' +
  '        <valueDate id="758"><fromDateBegin>1951-01-01</fromDateBegin></valueDate>\n' +
  '      </feature></features>\n' +
  '    </entity>\n';

const CIERRE = '  </entities>\n</sanctionsData>\n';

describe('el identificador de OFAC', () => {
  it('es el id de la entidad, nunca la posición ni el nombre', () => {
    // Lo exige la Adenda 3 y lo reiteró Cumplimiento: un nombre traducido
    // cambia entre publicaciones y la posición no es un hecho.
    const r = leerOfac(CABECERA + ABU_TEIR + CIERRE);
    expect(r.registros[0].identificadorFuente).toBe('9640');
  });

  it('una entidad sin id se descarta y se dice por qué', () => {
    const sinId = '    <entity refId="x"><generalInfo><entityType>Individual</entityType></generalInfo></entity>\n';
    const r = leerOfac(CABECERA + sinId + CIERRE);
    expect(r.registros).toHaveLength(0);
    expect(r.descartadas[0].motivo).toMatch(/identificador estable/);
  });
});

describe('los cuatro tipos de OFAC', () => {
  it('calzan con los que el modelo ya preveía', () => {
    const uno = (tipo: string, id: string) =>
      `    <entity id="${id}"><generalInfo><entityType>${tipo}</entityType></generalInfo>` +
      `<names><name id="1"><isPrimary>true</isPrimary><translations><translation>` +
      `<isPrimary>true</isPrimary><formattedFullName>X ${id}</formattedFullName>` +
      `</translation></translations></name></names></entity>\n`;
    const r = leerOfac(
      CABECERA + uno('Individual', '1') + uno('Entity', '2') + uno('Vessel', '3') + uno('Aircraft', '4') + CIERRE,
    );
    expect(r.registros.map((x) => x.tipoEntidad)).toEqual([
      'persona',
      'empresa',
      'embarcacion',
      'aeronave',
    ]);
  });

  it('un tipo nuevo se descarta con aviso, no se adivina', () => {
    const raro =
      '    <entity id="77"><generalInfo><entityType>Cryptocurrency Wallet</entityType></generalInfo></entity>\n';
    const r = leerOfac(CABECERA + raro + CIERRE);
    expect(r.registros).toHaveLength(0);
    expect(r.descartadas[0].motivo).toMatch(/Tipo de entidad desconocido/);
  });
});

describe('los alias, que son la mitad del cotejo', () => {
  it('conserva los a.k.a. y no repite el primario', () => {
    // 19,365 entidades de la SDN traen 30,309 alias. Cotejar sólo el nombre
    // primario dejaría pasar a la mayoría: un designado opera bajo cualquiera.
    const r = leerOfac(CABECERA + ABU_TEIR + CIERRE);
    expect(r.registros[0].nombre).toBe('ABU TEIR, Mohammed');
    expect(r.registros[0].nombresAlternos).toEqual(['ABU TAIR, Mohammed Mahmud']);
  });

  it('las transliteraciones no latinas también son alias', () => {
    // 4,803 entidades traen una. Un nombre árabe o cirílico se translitera de
    // varias formas, y la del documento del compareciente puede no ser la del
    // listado.
    const conCirilico =
      '    <entity id="500"><generalInfo><entityType>Individual</entityType></generalInfo>\n' +
      '      <names><name id="1"><isPrimary>true</isPrimary>\n' +
      '        <translations>\n' +
      '          <translation id="a"><isPrimary>true</isPrimary><script>Latin</script>' +
      '<formattedFullName>IVANOV, Ivan</formattedFullName></translation>\n' +
      '          <translation id="b"><isPrimary>false</isPrimary><script>Cyrillic</script>' +
      '<formattedFullName>ИВАНОВ, Иван</formattedFullName></translation>\n' +
      '        </translations>\n' +
      '      </name></names></entity>\n';
    const r = leerOfac(CABECERA + conCirilico + CIERRE);
    expect(r.registros[0].nombre).toBe('IVANOV, Ivan');
    expect(r.registros[0].nombresAlternos).toEqual(['ИВАНОВ, Иван']);
  });

  it('un alias repetido no se cuenta dos veces', () => {
    const dup =
      '    <entity id="501"><generalInfo><entityType>Entity</entityType></generalInfo>\n' +
      '      <names>\n' +
      '        <name id="1"><isPrimary>true</isPrimary><translations><translation><isPrimary>true</isPrimary>' +
      '<formattedFullName>ACME SA</formattedFullName></translation></translations></name>\n' +
      '        <name id="2"><isPrimary>false</isPrimary><translations><translation><isPrimary>true</isPrimary>' +
      '<formattedFullName>ACME</formattedFullName></translation></translations></name>\n' +
      '        <name id="3"><isPrimary>false</isPrimary><translations><translation><isPrimary>true</isPrimary>' +
      '<formattedFullName>ACME</formattedFullName></translation></translations></name>\n' +
      '      </names></entity>\n';
    const r = leerOfac(CABECERA + dup + CIERRE);
    expect(r.registros[0].nombresAlternos).toEqual(['ACME']);
  });
});

describe('la fecha de nacimiento se guarda como la publica OFAC', () => {
  it('un año es un año, no un 1 de enero', () => {
    // `fromDateBegin` diría 1951-01-01. Guardar eso afirmaría un día que nadie
    // determinó, y al descartar homónimos esa precisión falsa descartaría a la
    // persona equivocada.
    const r = leerOfac(CABECERA + ABU_TEIR + CIERRE);
    expect(r.registros[0].fechaNacimiento).toBe('1951');
  });
});

describe('las listas y los programas', () => {
  it('toma la publicación más reciente entre sus listas', () => {
    const r = leerOfac(CABECERA + ABU_TEIR + CIERRE);
    expect(r.registros[0].publicadoEn).toBe('2014-10-10');
    expect(r.registros[0].listas).toHaveLength(2);
    expect(r.registros[0].programas).toEqual(['NS-PLC']);
  });

  it('lee la fecha de la fuente de la cabecera, no la de carga', () => {
    const r = leerOfac(CABECERA + ABU_TEIR + CIERRE);
    expect(r.fechaActualizacion).toBe('2026-07-27');
    expect(r.listasDelArchivo).toEqual(['Consolidated List']);
  });
});

describe('cuando el archivo no es el que se espera', () => {
  it('rechaza el ADVANCED con un mensaje que dice cuál es', () => {
    // Los dos vienen del mismo portal y se confunden fácil. Fallar con
    // «0 registros» sería peor que fallar diciéndolo.
    const advanced =
      '<?xml version="1.0"?>\n<Sanctions Version="3" xmlns="https://sanctionslistservice.ofac.treas.gov/x">\n' +
      '<DateOfIssue><Year>2026</Year></DateOfIssue></Sanctions>';
    expect(() => leerOfac(advanced)).toThrow(/ADVANCED/);
  });
});

describe('el recorrido por trozos', () => {
  it('entrega una entidad por vez, sin armar el documento entero', () => {
    // Es lo que hace que 109 MB quepan: el consumo no depende del tamaño del
    // archivo, sino del de una entidad.
    const dos = CABECERA + ABU_TEIR + ABU_TEIR.replace('id="9640"', 'id="9641"') + CIERRE;
    const trozos = [...entidades(dos)];
    expect(trozos).toHaveLength(2);
    expect(leerEntidad(trozos[1])).toMatchObject({ identificadorFuente: '9641' });
  });

  it('desescapa las entidades XML de los nombres', () => {
    const conAmp =
      '    <entity id="600"><generalInfo><entityType>Entity</entityType></generalInfo>\n' +
      '      <names><name id="1"><isPrimary>true</isPrimary><translations><translation>' +
      '<isPrimary>true</isPrimary><formattedFullName>SMITH &amp; SONS &quot;LTD&quot;</formattedFullName>' +
      '</translation></translations></name></names></entity>\n';
    const r = leerOfac(CABECERA + conAmp + CIERRE);
    expect(r.registros[0].nombre).toBe('SMITH & SONS "LTD"');
  });
});
