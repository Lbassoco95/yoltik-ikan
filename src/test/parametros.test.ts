import { describe, it, expect } from 'vitest';
import {
  resolverParametro,
  valorParametro,
  esReferenciaSinConfirmar,
  PARAM,
  type ParametroVigente,
} from '@/lib/parametros';

function p(over: Partial<ParametroVigente> = {}): ParametroVigente {
  return {
    codigo: PARAM.UMA_DIARIA,
    nombre: 'UMA · valor diario',
    valor_numerico: 117.31,
    unidad: 'mxn',
    sector: '*',
    vigente_desde: '2026-02-01',
    fuente: 'INEGI',
    publicacion_dof: 'DOF 09/01/2026',
    url_fuente: null,
    confirmado_por: 'Kawiil-Cumplimiento',
    confirmado_en: '2026-02-01',
    notas: null,
    ...over,
  };
}

describe('resolución de parámetros regulatorios', () => {
  it('devuelve el parámetro global cuando no hay uno del sector', () => {
    const params = [p({ codigo: PARAM.XII_INMUEBLE, valor_numerico: 645, sector: '*' })];
    expect(valorParametro(params, PARAM.XII_INMUEBLE, 'XII')).toBe(645);
  });

  it('el parámetro del sector gana sobre el global', () => {
    const params = [
      p({ codigo: PARAM.XII_INMUEBLE, valor_numerico: 645, sector: '*' }),
      p({ codigo: PARAM.XII_INMUEBLE, valor_numerico: 16000, sector: 'XII' }),
    ];
    expect(valorParametro(params, PARAM.XII_INMUEBLE, 'XII')).toBe(16000);
    // Otro sector sigue viendo el global.
    expect(valorParametro(params, PARAM.XII_INMUEBLE, 'XVI')).toBe(645);
  });

  it('no filtra el parámetro de otro sector hacia el sector consultado', () => {
    const params = [p({ codigo: PARAM.XII_INMUEBLE, valor_numerico: 16000, sector: 'XII' })];
    expect(valorParametro(params, PARAM.XII_INMUEBLE, 'XVI')).toBeUndefined();
  });

  it('devuelve undefined si el parámetro no existe, nunca un valor por omisión', () => {
    expect(valorParametro([], PARAM.UMA_DIARIA)).toBeUndefined();
    expect(resolverParametro([], PARAM.UMA_DIARIA)).toBeUndefined();
  });

  it('marca como referencia el parámetro sin confirmar', () => {
    expect(esReferenciaSinConfirmar(p({ confirmado_por: null }))).toBe(true);
    expect(esReferenciaSinConfirmar(p({ confirmado_por: 'Kawiil-Cumplimiento' }))).toBe(false);
    expect(esReferenciaSinConfirmar(undefined)).toBe(false);
  });
});

describe('ninguna cifra regulatoria queda en el código', () => {
  it('utils.ts ya no exporta constantes de UMA ni de umbral', async () => {
    const utils = await import('@/lib/utils');
    expect('UMA_MXN' in utils).toBe(false);
    expect('UMBRAL_IDENTIFICACION_UMA' in utils).toBe(false);
    expect('UMBRAL_IDENTIFICACION_MXN' in utils).toBe(false);
  });

  it('el núcleo del motor no declara la UMA: la recibe por contexto', async () => {
    const evaluadores = await import('../../supabase/functions/motor-pld/evaluadores');
    expect('UMA_MXN' in evaluadores).toBe(false);
  });
});
