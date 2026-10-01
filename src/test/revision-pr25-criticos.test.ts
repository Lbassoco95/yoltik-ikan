/**
 * Pruebas de aceptación de la revisión PR #25 (críticos 1.1, 1.2, 1.3 y 3.3).
 * Cada caso cita el valor observado que la revisión exigió corregir.
 */
import { describe, expect, it } from 'vitest';
import { regimenDelActo } from '@/lib/formatos-uif/vigencia';
import {
  abrirPlazo24h,
  puedeMutarPlazo24h,
  relojDesdePlazoPersistido,
  puedeAbrirAviso24h,
} from '@/lib/formatos-uif/reloj-24h';
import {
  estadoTrasAcuseConFolio,
  plazosTrasAcuse,
  clasificarCumplimiento24h,
  xmlCompatibleConFormatoOficial,
  decidirPresentacion,
} from '@/lib/formatos-uif/presentacion';

describe('1.1 vigencia por fecha del acto (no captura)', () => {
  it('acto 15-nov-2026 capturado ene-2027 → régimen nov_2026', () => {
    const r = regimenDelActo('2026-11-15', '2027-01-10');
    expect(r.regimen).toBe('nov_2026');
    // La captura no puede cambiar el régimen
    expect(regimenDelActo('2026-11-15', '2027-01-10').regimen).toBe(
      regimenDelActo('2026-11-15').regimen,
    );
  });

  it('modificatorio 20-jun-2027 admite formato anterior; 2-jul-2027 ya no', () => {
    expect(regimenDelActo('2027-06-20').admiteModificatorioFormatoAnterior).toBe(true);
    expect(regimenDelActo('2027-07-02').admiteModificatorioFormatoAnterior).toBe(false);
    expect(regimenDelActo('2027-07-02').formatosAnterioresRetirados).toBe(true);
  });
});

describe('1.2 contador 24h desde conocimiento (inmutable tras generado)', () => {
  it('conocimiento ayer 18:00, evaluación hoy 10:00 → 8 h restantes', () => {
    const plazo = abrirPlazo24h('2026-09-30T18:00:00.000-06:00');
    const reloj = relojDesdePlazoPersistido(
      plazo.fechaConocimiento,
      plazo.plazoLimite,
      new Date('2026-10-01T10:00:00.000-06:00'),
    );
    expect(reloj.restanteMs).toBe(8 * 60 * 60 * 1000);
    expect(reloj.vencido).toBe(false);
    // El límite persistido es el ancla, no generado_en/created_at
    expect(plazo.plazoLimite.toISOString()).toBe(
      new Date(new Date('2026-09-30T18:00:00.000-06:00').getTime() + 24 * 3600_000).toISOString(),
    );
  });

  it('el plazo no se puede mutar tras generado', () => {
    expect(puedeMutarPlazo24h('borrador')).toBe(true);
    expect(puedeMutarPlazo24h('generado')).toBe(false);
    expect(puedeMutarPlazo24h('presentado')).toBe(false);
    expect(puedeMutarPlazo24h('acuse_rechazo')).toBe(false);
  });

  it('aviso 24h sin operación celebrada', () => {
    const r = puedeAbrirAviso24h({
      fechaConocimiento: '2026-09-30T18:00:00.000-06:00',
      operacionCelebrada: false,
    });
    expect(r.ok).toBe(true);
  });
});

describe('1.3 acuse rechazo/aceptación/incumplido', () => {
  const conocimiento = new Date('2026-09-30T18:00:00.000-06:00');
  const plazo = new Date(conocimiento.getTime() + 24 * 3600_000);

  it('rechazo deja abierto y conserva el plazo original', () => {
    const r = estadoTrasAcuseConFolio({
      resultado: 'rechazo',
      folio: null,
      plazoLimite: plazo,
      ahora: new Date('2026-10-01T10:00:00.000-06:00'),
    });
    expect(r.estado).toBe('acuse_rechazo');
    expect(r.cierra).toBe(false);
    const plazos = plazosTrasAcuse({
      resultado: 'rechazo',
      fechaConocimiento: conocimiento,
      plazoLimite: plazo,
    });
    expect(plazos.fechaConocimiento).toEqual(conocimiento);
    expect(plazos.plazoLimite).toEqual(plazo);
  });

  it('aceptación con folio cierra; sin folio no', () => {
    expect(() =>
      estadoTrasAcuseConFolio({
        resultado: 'aceptado',
        folio: null,
        plazoLimite: plazo,
        ahora: new Date('2026-10-01T10:00:00.000-06:00'),
      }),
    ).toThrow(/folio/i);

    const ok = estadoTrasAcuseConFolio({
      resultado: 'aceptado',
      folio: 'UIF-2026-000123',
      plazoLimite: plazo,
      ahora: new Date('2026-10-01T10:00:00.000-06:00'),
    });
    expect(ok.estado).toBe('cerrado');
    expect(ok.cierra).toBe(true);
    expect(ok.folio).toBe('UIF-2026-000123');
  });

  it('rechazado y plazo vencido = incumplido', () => {
    const c = clasificarCumplimiento24h({
      estado: 'acuse_rechazo',
      plazoLimite: plazo,
      ahora: new Date('2026-10-02T19:00:00.000-06:00'),
    });
    expect(c).toBe('incumplido');
  });
});

describe('3.3 XML fep no se presenta como validado contra DOF 2026', () => {
  it('layout fep es incompatible con formato oficial dof-2026-09-24', () => {
    const c = xmlCompatibleConFormatoOficial({
      layout: 'fep',
      formatoVersion: 'dof-2026-09-24',
    });
    expect(c.ok).toBe(false);
    expect(c.motivo).toMatch(/DOF|formato oficial|estructura/i);
  });

  it('decidirPresentacion no marca verificado si el XML es fep ante formato DOF', () => {
    const d = decidirPresentacion({
      estado: 'generado',
      tipo: 'mensual',
      tieneXml: true,
      validacion: { ok: true, verificado: true, errores: [], noValidados: [] },
      layout: 'fep',
      formatoVersion: 'dof-2026-09-24',
    });
    expect(d.comoVerificado).toBe(false);
    expect(d.puedePresentar).toBe(false);
    expect(d.bloqueos.join(' ')).toMatch(/fep|DOF|formato oficial/i);
  });
});
