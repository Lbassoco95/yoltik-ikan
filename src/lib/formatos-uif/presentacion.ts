/**
 * Canal de presentación de avisos (interfaz única + implementación manual).
 *
 * Sin API real a la autoridad. Flujo:
 *   1. generar / descargar XML
 *   2. confirmar presentación manual
 *   3. registrar acuse (aceptado | rechazo)
 *
 * Acuse de rechazo NO cierra el aviso.
 */

import type { ResumenValidacion } from './validacion';

export type EstadoAvisoUif =
  | 'borrador'
  | 'validado'
  | 'listo_firma'
  | 'generado'
  | 'enviado'
  | 'presentado'
  | 'acuse_aceptado'
  | 'acuse_rechazo'
  | 'acusado'
  | 'cerrado';

export type TipoAvisoUif = '24h' | 'mensual' | 'modificatorio' | 'informe_sin_operaciones';

/** Transiciones permitidas (espejo de public.transicion_aviso_permitida). */
const TRANSICIONES: Record<EstadoAvisoUif, EstadoAvisoUif[]> = {
  borrador: ['validado', 'listo_firma'],
  validado: ['listo_firma', 'borrador'],
  listo_firma: ['generado', 'borrador', 'enviado'],
  generado: ['presentado', 'borrador', 'enviado'],
  enviado: ['presentado', 'acuse_aceptado', 'acuse_rechazo', 'acusado'],
  presentado: ['acuse_aceptado', 'acuse_rechazo', 'acusado'],
  acuse_aceptado: ['cerrado', 'acusado'],
  acusado: ['cerrado', 'acuse_aceptado'],
  acuse_rechazo: ['generado', 'borrador', 'listo_firma'],
  cerrado: [],
};

export function transicionPermitida(desde: EstadoAvisoUif, hasta: EstadoAvisoUif): boolean {
  if (desde === hasta) return true;
  return TRANSICIONES[desde]?.includes(hasta) ?? false;
}

export interface DecisionPresentacion {
  puedePresentar: boolean;
  comoVerificado: boolean;
  bloqueos: string[];
  advertencias: string[];
}

/**
 * ¿Se puede confirmar la presentación manual?
 * - Requiere XML generado y estado compatible.
 * - Si la validación no está completa (catálogos ausentes), se puede presentar
 *   sólo como NO verificado.
 * - Informe sin operaciones (Anexo 14) pendiente → bloqueo explícito.
 */
export function decidirPresentacion(input: {
  estado: EstadoAvisoUif;
  tipo: TipoAvisoUif;
  tieneXml: boolean;
  validacion: Pick<ResumenValidacion, 'ok' | 'verificado' | 'errores' | 'noValidados'>;
  anexoInformeSinOpsPendiente?: boolean;
}): DecisionPresentacion {
  const bloqueos: string[] = [];
  const advertencias: string[] = [];

  if (!['generado', 'listo_firma', 'enviado', 'acuse_rechazo'].includes(input.estado)) {
    bloqueos.push(`Estado «${input.estado}» no admite confirmar presentación.`);
  }
  if (!input.tieneXml) {
    bloqueos.push('No hay XML generado para descargar y presentar.');
  }
  if (!input.validacion.ok) {
    bloqueos.push(...input.validacion.errores);
  }
  if (input.tipo === 'informe_sin_operaciones' && input.anexoInformeSinOpsPendiente !== false) {
    bloqueos.push(
      'Anexo 14 (informe sin operaciones) pendiente de carga. No se inventa el formato; no se puede presentar este tipo hasta cargarlo.',
    );
  }
  if (input.validacion.noValidados.length) {
    advertencias.push(
      ...input.validacion.noValidados.map(
        (n) => `Campo no validado (catálogo ausente o condición no evaluable): ${n}`,
      ),
    );
    advertencias.push(
      'La presentación NO se marcará como verificada mientras haya campos no validados.',
    );
  }

  const puedePresentar = bloqueos.length === 0;
  return {
    puedePresentar,
    comoVerificado: puedePresentar && input.validacion.verificado,
    bloqueos,
    advertencias,
  };
}

/**
 * Registrar acuse. Rechazo → estado acuse_rechazo (no cierra).
 */
export function estadoTrasAcuse(resultado: 'aceptado' | 'rechazo'): EstadoAvisoUif {
  return resultado === 'aceptado' ? 'acuse_aceptado' : 'acuse_rechazo';
}

export function acuseCierraAviso(resultado: 'aceptado' | 'rechazo'): boolean {
  return resultado === 'aceptado';
}

/** Ventana de modificatorio: 1 vez / 30 días desde la presentación del original. */
export function puedeCrearModificatorio(input: {
  presentadoEn: Date | string | null;
  modificatoriosPreviosNoBorrador: number;
  ahora?: Date;
}): { ok: boolean; motivo: string } {
  if (!input.presentadoEn) {
    return { ok: false, motivo: 'El aviso original aún no está presentado.' };
  }
  const presentado = new Date(input.presentadoEn);
  const ahora = input.ahora ?? new Date();
  const limite = new Date(presentado.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (ahora > limite) {
    return {
      ok: false,
      motivo: 'Ventana de 30 días para modificatorio vencida.',
    };
  }
  if (input.modificatoriosPreviosNoBorrador >= 1) {
    return {
      ok: false,
      motivo: 'Ya existe un modificatorio para este aviso (máximo 1 en la ventana de 30 días).',
    };
  }
  return { ok: true, motivo: 'Modificatorio admitido dentro de la ventana de 30 días.' };
}

/**
 * Mensual en ceros / informe sin operaciones.
 * Mientras Anexo 14 esté pendiente, no se genera ese tipo.
 */
export function decisionMensualSinOperaciones(input: {
  hayOperacionesReportables: boolean;
  anexo14Pendiente: boolean;
}): { tipo: TipoAvisoUif | null; bloqueo: string | null } {
  if (input.hayOperacionesReportables) {
    return { tipo: 'mensual', bloqueo: null };
  }
  if (input.anexo14Pendiente) {
    return {
      tipo: null,
      bloqueo:
        'No hubo operaciones reportables, pero el Anexo 14 (informe sin operaciones) está pendiente de carga. No se inventa; no se presenta en ceros con un formato inexistente.',
    };
  }
  return { tipo: 'informe_sin_operaciones', bloqueo: null };
}

/** SHA-256 hex de un texto (Web Crypto o node:crypto vía subtle). */
export async function huellaSha256(contenido: string): Promise<string> {
  const data = new TextEncoder().encode(contenido);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
