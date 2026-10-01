/**
 * Proceso de 24 horas (avisos de conocimiento).
 *
 * El reloj corre desde el CONOCIMIENTO del acto u operación relevante, no
 * desde su celebración ni desde created_at/generado_en. El plazo se persiste
 * al abrir el aviso y, tras `generado`, no se muta.
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

export interface Plazo24hPersistido {
  fechaConocimiento: Date;
  plazoLimite: Date;
}

const MS_24H = 24 * 60 * 60 * 1000;

function comoFecha(d: Date | string): Date {
  const x = typeof d === 'string' ? new Date(d) : new Date(d.getTime());
  if (Number.isNaN(x.getTime())) throw new Error('fecha_conocimiento inválida');
  return x;
}

/** Calcula y devuelve el plazo a persistir (ancla inmutable). */
export function abrirPlazo24h(fechaConocimiento: Date | string): Plazo24hPersistido {
  const inicio = comoFecha(fechaConocimiento);
  return {
    fechaConocimiento: inicio,
    plazoLimite: new Date(inicio.getTime() + MS_24H),
  };
}

/**
 * Contador a partir del plazo YA persistido.
 * No recalcula el límite desde “ahora”; usa `plazoLimite` guardado.
 */
export function relojDesdePlazoPersistido(
  fechaConocimiento: Date | string,
  plazoLimite: Date | string,
  ahora: Date = new Date(),
): Reloj24h {
  const inicio = comoFecha(fechaConocimiento);
  const limite = comoFecha(plazoLimite);
  const restanteMs = limite.getTime() - ahora.getTime();
  const vencido = restanteMs < 0;
  const total = limite.getTime() - inicio.getTime() || MS_24H;
  const consumidoPct = Math.min(100, Math.max(0, ((total - restanteMs) / total) * 100));
  return {
    fechaConocimiento: inicio,
    plazoLimite: limite,
    restanteMs,
    vencido,
    consumidoPct,
    etiqueta: etiquetaReloj(restanteMs, vencido),
  };
}

/** Compat: deriva el plazo y cuenta. Preferir persistir con `abrirPlazo24h`. */
export function iniciarReloj24h(
  fechaConocimiento: Date | string,
  ahora: Date = new Date(),
): Reloj24h {
  const plazo = abrirPlazo24h(fechaConocimiento);
  return relojDesdePlazoPersistido(plazo.fechaConocimiento, plazo.plazoLimite, ahora);
}

/** Tras generado/presentado/acuse el plazo de 24 h no se reescribe. */
export function puedeMutarPlazo24h(estado: string): boolean {
  return estado === 'borrador' || estado === 'validado' || estado === 'listo_firma';
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
