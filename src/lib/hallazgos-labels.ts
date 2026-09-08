/**
 * Etiquetas y estilos compartidos de la bandeja de hallazgos.
 * Viven fuera de los componentes para que la tarjeta (AlertsPage) y el
 * expediente muestren exactamente lo mismo.
 */
import type {
  ClasificacionUrgencia,
  EstadoHallazgo,
  SeveridadTipologia,
  TipoBitacoraHallazgo,
} from '@/types/domain';

export const ESTADO_LABEL: Record<EstadoHallazgo, string> = {
  abierto: 'Abierto',
  en_revision: 'En revisión',
  confirmado_inusual: 'Inusual',
  confirmado_preocupante: 'Preocupante',
  descartado: 'Descartado',
  falso_positivo: 'Falso positivo',
};

/** Orden en que se ofrecen los estados al OC en el expediente. */
export const ESTADOS_HALLAZGO: EstadoHallazgo[] = [
  'abierto',
  'en_revision',
  'confirmado_inusual',
  'confirmado_preocupante',
  'descartado',
  'falso_positivo',
];

/**
 * El estado de un hallazgo, en los cuatro significados de la paleta.
 *
 * `abierto` deja de ser rojo: un hallazgo recién levantado no es algo roto, es
 * algo que le toca atender al Oficial de Cumplimiento —que es exactamente lo
 * que significa el ámbar—. El rojo se reserva para lo que sí está roto: una
 * cadena de bitácora que no cuadra, un aviso rechazado.
 *
 * `confirmado_preocupante` es el único barro del sistema, y es el sitio para
 * el que se pensó: una confirmación de riesgo alto no se deshace.
 *
 * `confirmado_inusual` iba en `bg-vulnerable/10 text-vulnerable`, un color que
 * no existe en el tema —nunca lo hubo—, así que la insignia llevaba desde
 * siempre saliendo sin color ninguno.
 */
export const ESTADO_CLASS: Record<EstadoHallazgo, string> = {
  abierto: 'bg-warning/15 text-warning-ink',
  en_revision: 'bg-accent/10 text-accent',
  confirmado_inusual: 'bg-primary/10 text-primary',
  confirmado_preocupante: 'bg-ikan-barro/10 text-ikan-barro dark:text-[#D08672]',
  descartado: 'bg-muted text-muted-foreground',
  falso_positivo: 'bg-muted text-muted-foreground',
};

export const SEVERIDAD_CLASS: Record<SeveridadTipologia, string> = {
  critica: 'bg-destructive/10 text-destructive',
  alta: 'bg-destructive/10 text-destructive',
  media: 'bg-warning/10 text-warning-ink',
  baja: 'bg-muted text-muted-foreground',
};

// ---------------------------------------------------------------------
// Clasificación de urgencia — SLA operativo interno (migration 0007)
// ---------------------------------------------------------------------
export const URGENCIA_LABEL: Record<ClasificacionUrgencia, string> = {
  '24_horas': '24 horas',
  por_umbral: 'Por umbral',
};

export const URGENCIA_CLASS: Record<ClasificacionUrgencia, string> = {
  // Ámbar: es prioridad operativa, no una avería.
  '24_horas': 'bg-warning/15 text-warning-ink',
  por_umbral: 'bg-muted text-muted-foreground',
};

export const URGENCIA_DESCRIPCION: Record<ClasificacionUrgencia, string> = {
  '24_horas':
    'Proviene de una regla de aviso siempre (sin umbral de monto). Atención inmediata.',
  por_umbral:
    'Proviene de una regla de umbral monetario. Se atiende en el flujo normal.',
};

/** Aviso que acompaña siempre a la clasificación: es prioridad operativa
 *  interna, no un plazo regulatorio distinto al de la fracción XII. */
export const URGENCIA_NOTA =
  'Prioridad operativa interna de la bandeja del OC. No es un plazo regulatorio distinto al de la fracción XII.';

export const CLASIFICACIONES_URGENCIA: ClasificacionUrgencia[] = ['24_horas', 'por_umbral'];

/** Los hallazgos creados antes de la migration 0007 (o leídos desde un remoto
 *  donde aún no se aplicó) llegan sin clasificación. Se devuelve null en vez de
 *  asumir un valor: clasificar de más un hallazgo por umbral como de 24 horas
 *  distorsionaría la prioridad de la bandeja. */
export function urgenciaValida(valor: unknown): ClasificacionUrgencia | null {
  return valor === '24_horas' || valor === 'por_umbral' ? valor : null;
}

export const TIPO_BITACORA_LABEL: Record<TipoBitacoraHallazgo, string> = {
  cambio_estado: 'Cambio de estado',
  cambio_urgencia: 'Cambio de urgencia',
  documento_subido: 'Documento cargado',
  nota: 'Nota del OC',
};
