import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectarCatalogo,
  esObligatorioDeclarado,
  longitudMaxima,
  validarCampo,
  validarFormato,
  type CampoFormato,
} from '@/lib/formatos-uif/validacion';
import {
  formatoVigenteParaAnexo,
  resolverRegimen,
  VIGENCIAS_FORMATO_UIF,
} from '@/lib/formatos-uif/vigencia';
import { iniciarReloj24h, puedeAbrirAviso24h } from '@/lib/formatos-uif/reloj-24h';
import {
  acuseCierraAviso,
  decidirPresentacion,
  decisionMensualSinOperaciones,
  estadoTrasAcuse,
  puedeCrearModificatorio,
  transicionPermitida,
} from '@/lib/formatos-uif/presentacion';

const DIR = join(process.cwd(), 'docs/formatos-uif');

describe('carga de formatos UIF (fuente JSON)', () => {
  it('suma 4008 campos en 19 anexos y 250 fracciones del Anexo A', () => {
    const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));
    expect(index.total_campos).toBe(4008);
    expect(index.anexos).toHaveLength(19);

    let total = 0;
    for (const meta of index.anexos) {
      const raw = JSON.parse(readFileSync(join(DIR, meta.archivo), 'utf8'));
      expect(raw.campos).toHaveLength(meta.total_campos);
      total += raw.campos.length;
    }
    expect(total).toBe(4008);

    const cat = JSON.parse(
      readFileSync(join(DIR, 'catalogo-anexo-A-fracciones-arancelarias.json'), 'utf8'),
    );
    expect(cat.total).toBe(250);
    expect(cat.valores).toHaveLength(250);

    const anexosDisk = readdirSync(DIR).filter((f) => /^anexo-.*\.json$/.test(f));
    expect(anexosDisk).toHaveLength(19);
  });

  it('marca anexos 4, 10 y 14 como faltantes sin inventarlos', () => {
    const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));
    expect(index.faltantes.join(' ')).toMatch(/anexo-4/);
    expect(index.faltantes.join(' ')).toMatch(/anexo-10/);
    expect(index.faltantes.join(' ')).toMatch(/anexo-14/);
    const codigos = index.anexos.map((a: { anexo: string }) => a.anexo);
    expect(codigos).not.toContain('4');
    expect(codigos).not.toContain('10');
    expect(codigos).not.toContain('14');
  });
});

describe('validación campo a campo', () => {
  const rfc: CampoFormato = {
    orden: 1,
    numero: '3.5.1.1.5',
    padre: '3.5.1.1',
    nombre: 'RFC',
    etiqueta_xml: '<rfc>',
    obligatoriedad: 'Obligatorio',
    tipo_dato: 'Alfanumérico',
    longitud: '13',
    formato: 'N/A',
  };

  it('rechaza obligatorio vacío y longitud excedida', () => {
    expect(validarCampo(rfc, { valores: {}, catalogos: {} }).estado).toBe('error');
    expect(
      validarCampo(rfc, { valores: { rfc: 'ABCD790101XXXEXTRA' }, catalogos: {} }).estado,
    ).toBe('error');
    expect(longitudMaxima('1-40')).toBe(40);
    expect(esObligatorioDeclarado('Obligatiorio')).toBe(true); // errata DOF, no se “corrige”
  });

  it('catálogo ausente → no_validado (no admite valor libre como válido)', () => {
    const fraccion: CampoFormato = {
      orden: 2,
      numero: '3.9',
      padre: null,
      nombre: 'Fracción arancelaria',
      etiqueta_xml: '<fraccion_arancelaria>',
      obligatoriedad: 'Obligatorio',
      tipo_dato: 'Alfanumérico',
      longitud: '10',
      formato: 'Clave del catálogo de fracciones arancelarias',
      catalogo_codigo: 'anexo_a_fracciones_arancelarias',
    };
    const sinCat = validarCampo(fraccion, {
      valores: { fraccion_arancelaria: '4911.99.99' },
      catalogos: {},
    });
    expect(sinCat.estado).toBe('no_validado');

    const conCat = validarCampo(fraccion, {
      valores: { fraccion_arancelaria: '4911.99.99' },
      catalogos: { anexo_a_fracciones_arancelarias: new Set(['4911.99.99']) },
    });
    expect(conCat.estado).toBe('ok');

    const resumen = validarFormato([fraccion], {
      valores: { fraccion_arancelaria: '4911.99.99' },
      catalogos: {},
    });
    expect(resumen.ok).toBe(true);
    expect(resumen.verificado).toBe(false);
    expect(detectarCatalogo(fraccion)).toBe('anexo_a_fracciones_arancelarias');
  });
});

describe('vigencia por fecha del acto', () => {
  it('resuelve regímenes nov-2026 / dic-2026 / jun-2027 / jul-2027', () => {
    expect(resolverRegimen('2026-11-15').regimen).toBe('nov_2026');
    expect(resolverRegimen('2026-12-01').regimen).toBe('dic_2026');
    expect(resolverRegimen('2027-06-01').formatosNuevosAplican).toBe(true);
    expect(resolverRegimen('2027-06-15').admiteModificatorioFormatoAnterior).toBe(true);
    expect(resolverRegimen('2027-07-01').formatosAnterioresRetirados).toBe(true);
    expect(VIGENCIAS_FORMATO_UIF.dic_2026).toBe('2026-12-01');
  });

  it('anexo 14-A entra en dic-2026; anexo 16 en jun-2027; pendientes nunca', () => {
    expect(formatoVigenteParaAnexo('14-A', '2026-12-01').vigente).toBe(true);
    expect(formatoVigenteParaAnexo('14-A', '2026-11-30').vigente).toBe(false);
    expect(formatoVigenteParaAnexo('16', '2027-05-31').vigente).toBe(false);
    expect(formatoVigenteParaAnexo('16', '2027-06-01').vigente).toBe(true);
    expect(formatoVigenteParaAnexo('14', '2027-08-01', 'pendiente').vigente).toBe(false);
  });
});

describe('proceso 24 horas', () => {
  it('el reloj corre desde el conocimiento y no exige operación celebrada', () => {
    const apertura = puedeAbrirAviso24h({
      fechaConocimiento: '2026-10-01T10:00:00Z',
      operacionCelebrada: false,
    });
    expect(apertura.ok).toBe(true);
    expect(apertura.motivo).toMatch(/sin operación celebrada/i);

    const reloj = iniciarReloj24h(
      '2026-10-01T10:00:00.000Z',
      new Date('2026-10-01T22:00:00.000Z'),
    );
    expect(reloj.vencido).toBe(false);
    expect(reloj.restanteMs).toBe(12 * 60 * 60 * 1000);
    expect(reloj.etiqueta).toMatch(/Quedan/);

    const vencido = iniciarReloj24h(
      '2026-10-01T10:00:00.000Z',
      new Date('2026-10-02T11:00:00.000Z'),
    );
    expect(vencido.vencido).toBe(true);
  });
});

describe('acuse de rechazo, modificatorio y mensual no-en-ceros', () => {
  it('acuse de rechazo no cierra; aceptado sí', () => {
    expect(estadoTrasAcuse('rechazo')).toBe('acuse_rechazo');
    expect(acuseCierraAviso('rechazo')).toBe(false);
    expect(transicionPermitida('presentado', 'acuse_rechazo')).toBe(true);
    expect(transicionPermitida('acuse_rechazo', 'generado')).toBe(true);
    expect(transicionPermitida('acuse_rechazo', 'cerrado')).toBe(false);
    expect(acuseCierraAviso('aceptado')).toBe(true);
  });

  it('modificatorio: 1 vez / 30 días', () => {
    const ok = puedeCrearModificatorio({
      presentadoEn: '2026-09-01T12:00:00Z',
      modificatoriosPreviosNoBorrador: 0,
      ahora: new Date('2026-09-20T12:00:00Z'),
    });
    expect(ok.ok).toBe(true);

    const dup = puedeCrearModificatorio({
      presentadoEn: '2026-09-01T12:00:00Z',
      modificatoriosPreviosNoBorrador: 1,
      ahora: new Date('2026-09-20T12:00:00Z'),
    });
    expect(dup.ok).toBe(false);

    const fuera = puedeCrearModificatorio({
      presentadoEn: '2026-08-01T12:00:00Z',
      modificatoriosPreviosNoBorrador: 0,
      ahora: new Date('2026-09-15T12:00:00Z'),
    });
    expect(fuera.ok).toBe(false);
  });

  it('mensual sin operaciones no inventa Anexo 14 pendiente', () => {
    const bloqueado = decisionMensualSinOperaciones({
      hayOperacionesReportables: false,
      anexo14Pendiente: true,
    });
    expect(bloqueado.tipo).toBeNull();
    expect(bloqueado.bloqueo).toMatch(/Anexo 14/);

    const conOps = decisionMensualSinOperaciones({
      hayOperacionesReportables: true,
      anexo14Pendiente: true,
    });
    expect(conOps.tipo).toBe('mensual');

    const decision = decidirPresentacion({
      estado: 'generado',
      tipo: 'informe_sin_operaciones',
      tieneXml: true,
      validacion: { ok: true, verificado: true, errores: [], noValidados: [] },
      anexoInformeSinOpsPendiente: true,
    });
    expect(decision.puedePresentar).toBe(false);
  });
});
