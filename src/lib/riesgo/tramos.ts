import { supuestoDeActo, type SupuestoXII } from './supuestos-xii';

/**
 * La magnitud de la operación, medida contra el umbral que le toca.
 *
 * Fuente: Adenda 1 de Kawiil-Cumplimiento (31/08/2026), apartados 1.2 a 1.4.
 *
 * ---------------------------------------------------------------------
 * Por qué proporción y no cifras absolutas
 * ---------------------------------------------------------------------
 * La fracción XII no tiene UN umbral: tiene tres y además cinco supuestos sin
 * umbral. Ningún juego de tramos absolutos puede ser correcto para los once
 * actos a la vez, porque 8,000 UMA es el 100 % del umbral en una transmisión de
 * inmuebles y el 200 % en un fideicomiso. Una escala expresada como proporción
 * del umbral aplicable funciona para los once, sobrevive al cambio anual de la
 * UMA, y se reutiliza sin tocarla en activos virtuales, cuyo umbral vigente es
 * de 210 UMA.
 *
 * ---------------------------------------------------------------------
 * Por qué el corte alto está en 150 % y no en 100 %
 * ---------------------------------------------------------------------
 * Deliberado, y es el punto entero del diseño: coloca la frontera de la escala
 * de riesgo donde el legislador NO la puso. Con el corte en 100 % la escala
 * sería una copia del umbral de Aviso con otro nombre, y el umbral y el riesgo
 * son cosas distintas —el primero es una frontera de reporte fijada por el
 * legislador, el segundo un juicio propio del sujeto obligado—.
 *
 * Donde sí coinciden no es donde suele suponerse: lo relevante en riesgo no es
 * cruzar el umbral, sino quedarse justo por debajo. Eso lo mide la bandera de
 * proximidad, no la escala.
 */

export type NivelMagnitud = 1 | 2 | 3 | 4;

export interface Magnitud {
  nivel: NivelMagnitud;
  /** Qué tramo, para poder explicarlo: 'T1'…'T4'. */
  tramo: 'T1' | 'T2' | 'T3' | 'T4';
  /** Cómo se midió, en español. Va a la pantalla y a la constancia. */
  fuente: string;
  /** Proporción del umbral, cuando el acto tiene uno. Null en los que se avisan siempre. */
  proporcion?: number;
}

/** Los cortes de la escala relativa, en proporción del umbral aplicable. */
export const CORTES_RELATIVOS = { t2: 0.25, t3: 0.75, t4: 1.5 } as const;

/**
 * Tramos absolutos de respaldo, para los actos que se avisan SIEMPRE y por lo
 * tanto no tienen umbral contra el cual calcular una proporción.
 *
 * Los cortes no son redondos por casualidad: 3,210 UMA es el límite de efectivo
 * para acciones y partes sociales, y 8,025 el de inmuebles, los dos del
 * artículo 32. Anclarlos ahí hace que el tramo tenga una lectura defendible
 * ante una visita de verificación en vez de ser una cifra elegida a ojo.
 */
export const CORTES_ABSOLUTOS_UMA = { t2: 1000, t3: 3210, t4: 8025 } as const;

/** Umbrales de la banda de proximidad, en proporción del umbral aplicable. */
export const BANDA_UMBRAL = { desde: 0.9, hasta: 0.9999 } as const;

/**
 * La magnitud de una operación.
 *
 * `umbralUma` es el umbral de Aviso del acto en UMA, o null cuando el Aviso
 * procede siempre. Null NO significa «no sé»: significa que no hay proporción
 * que calcular y se usan los tramos absolutos.
 */
export function magnitudDeOperacion(montoUma: number, umbralUma: number | null): Magnitud {
  if (!Number.isFinite(montoUma) || montoUma < 0) {
    return { nivel: 1, tramo: 'T1', fuente: 'monto no válido' };
  }

  if (umbralUma == null || umbralUma <= 0) {
    const { t2, t3, t4 } = CORTES_ABSOLUTOS_UMA;
    const nivel: NivelMagnitud =
      montoUma >= t4 ? 4 : montoUma >= t3 ? 3 : montoUma >= t2 ? 2 : 1;
    return {
      nivel,
      tramo: `T${nivel}` as Magnitud['tramo'],
      fuente:
        `${redondear(montoUma)} UMA. Este acto se avisa siempre, así que no hay umbral ` +
        'contra el cual medir: se usan los tramos anclados en los límites de efectivo del ' +
        'artículo 32.',
    };
  }

  const proporcion = montoUma / umbralUma;
  const { t2, t3, t4 } = CORTES_RELATIVOS;
  const nivel: NivelMagnitud =
    proporcion >= t4 ? 4 : proporcion >= t3 ? 3 : proporcion >= t2 ? 2 : 1;

  return {
    nivel,
    tramo: `T${nivel}` as Magnitud['tramo'],
    proporcion,
    fuente:
      `${redondear(montoUma)} UMA, el ${Math.round(proporcion * 100)} % del umbral de este ` +
      `acto (${redondear(umbralUma)} UMA).`,
  };
}

export interface BanderaUmbral {
  clave: 'banda_de_umbral' | 'posible_fraccionamiento';
  detalle: string;
  /** Puntos que suma, aparte de la escala de magnitud. */
  puntos: number;
}

/** Lo que suma cada bandera. Aparte de la escala, nunca dentro de ella. */
export const PUNTOS_BANDERA = { banda_de_umbral: 2, posible_fraccionamiento: 3 } as const;

/**
 * ¿La operación se quedó justo debajo del umbral?
 *
 * Entre el 90 % y el 99.99 %. Es la señal que la escala de magnitud NO puede
 * capturar, porque tendría que subir y luego bajar: una operación al 95 % del
 * umbral es más sospechosa que una al 200 %, y a la vez la de 200 % es de mayor
 * magnitud. Son dos cosas distintas y por eso van separadas.
 */
export function banderaBandaDeUmbral(
  montoUma: number,
  umbralUma: number | null,
): BanderaUmbral | null {
  if (umbralUma == null || umbralUma <= 0) return null;
  const p = montoUma / umbralUma;
  if (p < BANDA_UMBRAL.desde || p > BANDA_UMBRAL.hasta) return null;
  return {
    clave: 'banda_de_umbral',
    puntos: PUNTOS_BANDERA.banda_de_umbral,
    detalle:
      `La operación quedó en el ${Math.round(p * 100)} % del umbral, justo por debajo. ` +
      'Quedarse a un paso de la frontera de reporte es una señal por sí misma.',
  };
}

export interface OperacionEnVentana {
  id: string;
  tipo_acto: string;
  monto_uma: number;
  fecha: string;
}

/**
 * ¿Dos o más operaciones del mismo tipo suman el umbral dentro de la ventana?
 *
 * La ventana móvil de seis meses del artículo 7 del Reglamento. No se calcula
 * sobre operaciones sueltas sino sobre la POSICIÓN DEL CLIENTE en la ventana,
 * así que necesita el histórico y no sólo la captura de hoy.
 *
 * No es opcional: el artículo 18 fracción X obliga a que los mecanismos
 * automatizados detecten las operaciones que deban acumularse conforme al
 * penúltimo párrafo del artículo 17. Y cuando salta, además de sumar riesgo,
 * dispara el Aviso por acumulación.
 */
export function banderaFraccionamiento(
  operaciones: OperacionEnVentana[],
  umbralPorActo: (tipoActo: string) => number | null,
): BanderaUmbral | null {
  // Por tipo de acto: la ley acumula por tipo, no por cliente a secas. Sumar
  // un poder con una compraventa daría un total que ningún umbral gobierna.
  const porTipo = new Map<string, OperacionEnVentana[]>();
  for (const o of operaciones) {
    const lista = porTipo.get(o.tipo_acto);
    if (lista) lista.push(o);
    else porTipo.set(o.tipo_acto, [o]);
  }

  for (const [tipo, lista] of porTipo) {
    if (lista.length < 2) continue;
    const umbral = umbralPorActo(tipo);
    if (umbral == null || umbral <= 0) continue;
    const suma = lista.reduce((s, o) => s + o.monto_uma, 0);
    if (suma < umbral) continue;
    // Sólo cuenta si NINGUNA por separado alcanzaba el umbral: si una sola ya
    // lo cruzaba, no hubo fraccionamiento, hubo una operación reportable.
    if (lista.some((o) => o.monto_uma >= umbral)) continue;

    return {
      clave: 'posible_fraccionamiento',
      puntos: PUNTOS_BANDERA.posible_fraccionamiento,
      detalle:
        `${lista.length} operaciones del mismo tipo en seis meses suman ${redondear(suma)} UMA ` +
        `y ninguna alcanzaba por sí sola el umbral de ${redondear(umbral)} UMA. ` +
        'Acumuladas sí lo alcanzan: procede el Aviso por acumulación.',
    };
  }
  return null;
}

/** El umbral en UMA de un tipo de acto, resuelto contra el catálogo de parámetros. */
export function umbralDelActo(
  tipoActo: string | null | undefined,
  valorDeParametro: (codigo: string) => number | null | undefined,
): { umbral: number | null; supuesto?: SupuestoXII } {
  const supuesto = supuestoDeActo(tipoActo);
  if (!supuesto) return { umbral: null };
  if (!supuesto.umbral_codigo) return { umbral: null, supuesto };
  const valor = valorDeParametro(supuesto.umbral_codigo);
  return { umbral: valor ?? null, supuesto };
}

function redondear(n: number): string {
  return n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
}
