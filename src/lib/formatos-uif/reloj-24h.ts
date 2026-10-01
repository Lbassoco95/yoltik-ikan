/**
 * Proceso de 24 horas (avisos de conocimiento).
 *
 * El reloj corre desde el CONOCIMIENTO del acto u operación relevante, no
 * desde su celebración. No se exige que la operación esté celebrada para
 * abrir el plazo. El contador es visible para el Oficial de Cumplimiento.
 */

export interface Reloj24h {
  fechaConocimiento: Date;
  plazoLimite: Date;
  /** Milisegundos restantes (puede ser negativo si venció). */
  restanteMs: number;
  vencido: boolean;
  /** Texto corto para el OC, en español de México. */
  etiqueta: string;
  /** Porcentaje consumido 0–100 (tope 100). */
  consumidoPct: number;
}

const MS_24H = 24 * 60 * 60 * 1000;

export function iniciarReloj24h(
  fechaConocimiento: Date | string,
  ahora: Date = new Date(),
): Reloj24h {
  const inicio = typeof fechaConocimiento === 'string'
    ? new Date(fechaConocimiento)
    : new Date(fechaConocimiento.getTime());
  if (Number.isNaN(inicio.getTime())) {
    throw new Error('fecha_conocimiento inválida');
  }
  const plazoLimite = new Date(inicio.getTime() + MS_24H);
  const restanteMs = plazoLimite.getTime() - ahora.getTime();
  const vencido = restanteMs < 0;
  const consumidoPct = Math.min(100, Math.max(0, ((MS_24H - restanteMs) / MS_24H) * 100));

  return {
    fechaConocimiento: inicio,
    plazoLimite,
    restanteMs,
    vencido,
    consumidoPct,
    etiqueta: etiquetaReloj(restanteMs, vencido),
  };
}

export function etiquetaReloj(restanteMs: number, vencido: boolean): string {
  if (vencido) {
    const h = Math.floor(Math.abs(restanteMs) / 3_600_000);
    const m = Math.floor((Math.abs(restanteMs) % 3_600_000) / 60_000);
    return `Plazo de 24 h vencido hace ${h} h ${m} min`;
  }
  const h = Math.floor(restanteMs / 3_600_000);
  const m = Math.floor((restanteMs % 3_600_000) / 60_000);
  const s = Math.floor((restanteMs % 60_000) / 1000);
  return `Quedan ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s
    .toString()
    .padStart(2, '0')} para presentar (24 h desde el conocimiento)`;
}

/**
 * Un aviso de 24 h puede abrirse con sólo la fecha de conocimiento.
 * No se exige operation_id ni acto celebrado.
 */
export function puedeAbrirAviso24h(input: {
  fechaConocimiento: Date | string | null | undefined;
  operacionCelebrada?: boolean;
}): { ok: boolean; motivo: string } {
  if (!input.fechaConocimiento) {
    return { ok: false, motivo: 'Falta la fecha de conocimiento del acto u operación.' };
  }
  const d = new Date(input.fechaConocimiento);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, motivo: 'La fecha de conocimiento no es válida.' };
  }
  // operacionCelebrada se ignora a propósito: el plazo no la exige.
  return {
    ok: true,
    motivo: input.operacionCelebrada
      ? 'Aviso de 24 h abierto. El reloj corre desde el conocimiento.'
      : 'Aviso de 24 h abierto sin operación celebrada. El reloj corre desde el conocimiento.',
  };
}
