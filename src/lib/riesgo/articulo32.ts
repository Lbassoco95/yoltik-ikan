import { PARAM } from '@/lib/parametros';

/**
 * La prohibición de liquidar en efectivo del artículo 32 de la LFPIORPI.
 *
 * Fuente: Adenda 1 de Kawiil-Cumplimiento (31/08/2026), apartado 6.2. Segunda
 * mitad de la instrucción 9.
 *
 * ---------------------------------------------------------------------
 * Esto no es una variable de riesgo: es una prohibición con sanción
 * ---------------------------------------------------------------------
 * Todas las demás variables de la matriz califican. Ésta impide. El artículo 32
 * PROHÍBE liquidar en efectivo la constitución o transmisión de derechos reales
 * sobre inmuebles desde 8,025 UMA, y la transmisión de acciones o partes
 * sociales desde 3,210 UMA. El fedatario debe identificar la forma de pago y
 * dejar constancia, y la omisión se sanciona con un PORCENTAJE SOBRE EL VALOR
 * DE LA OPERACIÓN, no con multa fija.
 *
 * Por eso el resultado correcto aquí no es sumar puntos. Un acto que cae en el
 * supuesto no debe poder registrarse como si nada: se bloquea y escala. Es la
 * única variable de toda la matriz donde eso es lo que corresponde.
 *
 * ---------------------------------------------------------------------
 * La UMA es la del DÍA DEL PAGO
 * ---------------------------------------------------------------------
 * No la del día del instrumento. La distinción importa porque la UMA cambia
 * cada 1 de febrero: un pago de enero y la escritura de febrero se miden con
 * valores distintos, y usar la del instrumento subestimaría o sobreestimaría el
 * límite según el sentido del cruce.
 *
 * ---------------------------------------------------------------------
 * Sólo los dos supuestos que el artículo nombra
 * ---------------------------------------------------------------------
 * Inmuebles y acciones o partes sociales. Los demás actos del catálogo no caen
 * en la prohibición, y extenderla por analogía —«una constitución de sociedad
 * también implica suscribir acciones»— sería inventar un supuesto sancionable
 * que la ley no escribió. Si Cumplimiento determina que alguno más aplica, se
 * añade aquí con su fundamento.
 */

export interface SupuestoEfectivo {
  /** Tipos de acto del layout a los que aplica. */
  actos: string[];
  /** Código del límite en `parametro_regulatorio`. Nunca la cifra. */
  limite_codigo: string;
  descripcion: string;
}

export const SUPUESTOS_ARTICULO_32: SupuestoEfectivo[] = [
  {
    actos: ['transmision_inmueble'],
    limite_codigo: PARAM.EFECTIVO_INMUEBLE,
    descripcion: 'constitución o transmisión de derechos reales sobre inmuebles',
  },
  {
    actos: ['compra_venta_acciones'],
    limite_codigo: PARAM.EFECTIVO_ACCIONES,
    descripcion: 'transmisión de acciones o partes sociales',
  },
];

export interface ResultadoArticulo32 {
  /** El acto cae en un supuesto de la prohibición. */
  aplica: boolean;
  /** El efectivo declarado alcanza o supera el límite: la operación NO procede. */
  prohibido: boolean;
  /** Límite en UMA, cuando aplica. */
  limite_uma?: number;
  /** El mismo límite en pesos, con la UMA del día del pago. */
  limite_mxn?: number;
  /** El efectivo declarado, en UMA del día del pago. */
  efectivo_uma?: number;
  /** Qué pasó, en español. Es lo que ve quien captura. */
  detalle: string;
}

/**
 * ¿El efectivo declarado cae en la prohibición?
 *
 * `umaDelDiaDelPago` la resuelve el llamador contra `parametro_vigente`, que ya
 * sabe leer un parámetro a una fecha. Se pide como número y no como fecha para
 * que este módulo siga siendo puro y comprobable sin base de datos.
 */
export function evaluarArticulo32(entrada: {
  tipo_acto: string | null | undefined;
  /** Efectivo entregado, en pesos. 0 o null cuando no hubo. */
  efectivo_mxn: number | null | undefined;
  umaDelDiaDelPago: number | null | undefined;
  /** Límites en UMA por código, del catálogo de parámetros. */
  limitesUma: (codigo: string) => number | null | undefined;
}): ResultadoArticulo32 {
  const acto = String(entrada.tipo_acto ?? '');
  const supuesto = SUPUESTOS_ARTICULO_32.find((s) => s.actos.includes(acto));

  if (!supuesto) {
    return {
      aplica: false,
      prohibido: false,
      detalle: 'Este acto no cae en la prohibición de efectivo del artículo 32.',
    };
  }

  const efectivo = Number(entrada.efectivo_mxn ?? 0);
  if (!Number.isFinite(efectivo) || efectivo <= 0) {
    return {
      aplica: true,
      prohibido: false,
      detalle:
        `Este acto —${supuesto.descripcion}— cae en la prohibición del artículo 32, y no se ` +
        'declaró entrega de efectivo.',
    };
  }

  const limiteUma = entrada.limitesUma(supuesto.limite_codigo);
  const uma = entrada.umaDelDiaDelPago;

  // Sin límite en el catálogo o sin UMA no se puede concluir. Y no se concluye:
  // decir «no está prohibido» porque falta un parámetro sería dar por lícito lo
  // que nadie midió, sobre una prohibición con sanción de porcentaje.
  if (limiteUma == null || uma == null || uma <= 0) {
    return {
      aplica: true,
      prohibido: false,
      detalle:
        `Este acto cae en la prohibición del artículo 32 y NO se pudo verificar: falta el ` +
        'límite en el catálogo de parámetros o la UMA del día del pago. Revísalo antes de ' +
        'instrumentar.',
    };
  }

  const limiteMxn = limiteUma * uma;
  const efectivoUma = efectivo / uma;
  const prohibido = efectivo >= limiteMxn;

  return {
    aplica: true,
    prohibido,
    limite_uma: limiteUma,
    limite_mxn: limiteMxn,
    efectivo_uma: efectivoUma,
    detalle: prohibido
      ? `El artículo 32 PROHÍBE liquidar en efectivo ${supuesto.descripcion} desde ` +
        `${limiteUma.toLocaleString('es-MX')} UMA (${pesos(limiteMxn)} con la UMA del día del ` +
        `pago). Se declararon ${pesos(efectivo)} en efectivo. La operación no procede así.`
      : `Efectivo declarado: ${pesos(efectivo)}, por debajo del límite de ` +
        `${limiteUma.toLocaleString('es-MX')} UMA (${pesos(limiteMxn)}) que el artículo 32 fija ` +
        `para ${supuesto.descripcion}.`,
  };
}

function pesos(n: number): string {
  return n.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  });
}
