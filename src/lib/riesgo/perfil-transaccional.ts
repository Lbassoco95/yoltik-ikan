/**
 * El perfil transaccional: lo declarado contra lo observado.
 *
 * Fuente: Adenda 1 de Kawiil-Cumplimiento (31/08/2026), apartado 7.
 * Instrucción 10. Base normativa: Capítulo III Ter de las RCG.
 *
 * ---------------------------------------------------------------------
 * Qué faltaba
 * ---------------------------------------------------------------------
 * El Capítulo III Ter exige perfil transaccional con monto, frecuencia,
 * ubicación, origen y destino de recursos y actividad económica. La matriz
 * capturaba el MONTO DE LA OPERACIÓN AISLADA y nada más. Un cliente que declara
 * una operación al año y hace nueve en seis meses no se distinguía de uno que
 * hizo la que dijo que iba a hacer.
 *
 * De las piezas del Capítulo III Ter, la frecuencia esperada es la única que no
 * se puede calcular: hay que preguntarla. La observada sale sola de la misma
 * ventana móvil de seis meses del artículo 7 del Reglamento que ya usa el motor
 * —no otra ventana: dos ventanas distintas para el mismo cliente sería la
 * manera más fácil de que el sistema se contradiga—.
 *
 * ---------------------------------------------------------------------
 * Cómo se comparan seis meses con un año
 * ---------------------------------------------------------------------
 * Lo declarado es anual y lo observado son seis meses, así que la comparación
 * se hace contra la MITAD de lo declarado, redondeada HACIA ARRIBA.
 *
 * El redondeo va hacia arriba y no hacia abajo por una razón concreta: quien
 * declaró una operación al año y lleva una en seis meses no está excediendo
 * nada. Con redondeo hacia abajo su tolerancia sería cero y cualquier operación
 * lo marcaría, que es un falso positivo garantizado en el caso más común de
 * todos.
 *
 * No hay margen de tolerancia por encima de eso, y es deliberado: la Adenda no
 * fija ninguno, e inventar un «10 % de holgura» sería exactamente la clase de
 * cifra razonable-pero-nuestra que la metodología no puede llevar sin respaldo.
 * Queda como pregunta abierta para Cumplimiento.
 *
 * ---------------------------------------------------------------------
 * Sin declaración no es «dentro de lo declarado»
 * ---------------------------------------------------------------------
 * Cuando el cliente no declaró frecuencia esperada, la respuesta es el valor
 * intermedio y va marcada `por_defecto`. No es el mínimo: un expediente al que
 * le falta el dato no puede puntuar mejor que uno que lo tiene y está en orden.
 * Es el mismo criterio de la actividad económica (apartado 3 de la Adenda).
 *
 * Módulo puro: sin red, sin React.
 */

/** Claves de opción de la variable de perfil transaccional en la matriz. */
export type ClavePerfil = 'dentro' | 'sin_declaracion' | 'excede';

export interface RiesgoFrecuencia {
  clave: ClavePerfil;
  /** 1 dentro · 2 sin declaración · 3 excede. */
  valor: number;
  fuente: string;
  /** La respuesta salió de la ausencia del dato, no del dato. */
  por_defecto: boolean;
  /** Lo que se esperaba en la ventana, para poder auditar la comparación. */
  esperadas_en_ventana: number | null;
  observadas_en_ventana: number;
}

/** Meses de la ventana móvil del art. 7 del Reglamento. La misma del motor. */
export const MESES_VENTANA = 6;

/**
 * El inicio de la ventana móvil, contando MESES DE CALENDARIO.
 *
 * Es la misma aritmética de `ventanaDesde` en el Motor PLD (Edge Function), y
 * está duplicada a propósito: aquel módulo corre en Deno y meterlo al bundle
 * del navegador arrastraría su entorno entero. La duplicación está cubierta por
 * una prueba que compara las dos implementaciones fecha por fecha; si alguna se
 * mueve sin la otra, esa prueba lo dice.
 *
 * Seis meses son SEIS MESES, no 180 días: del 31 de agosto se va al 28 de
 * febrero, y el día se recorta al último del mes destino cuando ese mes no lo
 * tiene. Restar 180 días daría el 3 de marzo y dejaría fuera cinco días de
 * operaciones que la ventana sí cubre.
 */
export function inicioDeVentana(fin: Date, meses = MESES_VENTANA): Date {
  const inicio = new Date(fin.getTime());
  const dia = inicio.getUTCDate();
  inicio.setUTCDate(1); // primero se fija el mes, si no el 31 se desborda solo
  inicio.setUTCMonth(inicio.getUTCMonth() - meses);
  const ultimoDelMes = new Date(
    Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0),
  ).getUTCDate();
  inicio.setUTCDate(Math.min(dia, ultimoDelMes));
  return inicio;
}

/**
 * Cuántas de esas fechas caen en la ventana.
 *
 * El borde de inicio es INCLUSIVO, igual que en el motor: un acto exactamente
 * en el límite de los seis meses está dentro de la ventana, no fuera.
 */
export function operacionesEnVentana(
  fechas: (string | Date | null | undefined)[],
  fin: Date = new Date(),
  meses = MESES_VENTANA,
): number {
  const desde = inicioDeVentana(fin, meses).getTime();
  const hasta = fin.getTime();
  let n = 0;
  for (const f of fechas) {
    if (!f) continue;
    const t = f instanceof Date ? f.getTime() : Date.parse(f);
    if (!Number.isFinite(t)) continue;
    if (t >= desde && t <= hasta) n += 1;
  }
  return n;
}

export function riesgoDeFrecuencia(
  esperadaAnual: number | null | undefined,
  observadasEnVentana: number,
): RiesgoFrecuencia {
  const observadas = Number.isFinite(observadasEnVentana) ? Math.max(0, observadasEnVentana) : 0;

  if (esperadaAnual == null || !Number.isFinite(esperadaAnual) || esperadaAnual < 0) {
    return {
      clave: 'sin_declaracion',
      valor: 2,
      fuente:
        'el cliente no declaró frecuencia esperada de operación; sin ella no hay contra qué ' +
        'comparar las ' +
        `${observadas} operación(es) de los últimos ${MESES_VENTANA} meses`,
      por_defecto: true,
      esperadas_en_ventana: null,
      observadas_en_ventana: observadas,
    };
  }

  const esperadas = Math.ceil(esperadaAnual / 2);

  if (observadas > esperadas) {
    return {
      clave: 'excede',
      valor: 3,
      fuente:
        `${observadas} operación(es) en los últimos ${MESES_VENTANA} meses frente a las ` +
        `${esperadas} que corresponden a las ${esperadaAnual} anuales declaradas`,
      por_defecto: false,
      esperadas_en_ventana: esperadas,
      observadas_en_ventana: observadas,
    };
  }

  return {
    clave: 'dentro',
    valor: 1,
    fuente:
      `${observadas} operación(es) en los últimos ${MESES_VENTANA} meses, dentro de las ` +
      `${esperadas} que corresponden a las ${esperadaAnual} anuales declaradas`,
    por_defecto: false,
    esperadas_en_ventana: esperadas,
    observadas_en_ventana: observadas,
  };
}

/**
 * El canal por el que llegó el cliente, en clave de matriz.
 *
 * Uno de los cuatro factores obligatorios de las RCG, y el que más claramente
 * aplica a este producto: el onboarding es remoto. El canal remoto SUMA riesgo,
 * y así debe ser —es la contrapartida razonable de haber resuelto la
 * identificación con verificación digital, no un castigo—.
 *
 * Sin canal capturado no se responde. El canal no se deduce de que exista una
 * verificación de Didit: se puede verificar a distancia a alguien que vino a la
 * notaría, y suponerlo al revés convertiría un dato administrativo en una
 * calificación de riesgo.
 */
export const CANALES: Record<string, { valor: number; etiqueta: string }> = {
  presencial: { valor: 1, etiqueta: 'presencial ante el fedatario' },
  remoto_verificacion_reforzada: {
    valor: 2,
    etiqueta: 'remoto con verificación reforzada',
  },
  remoto_estandar: { valor: 3, etiqueta: 'remoto estándar' },
};

export function riesgoDeCanal(
  canal: string | null | undefined,
): { valor: number; clave: string; fuente: string } | null {
  if (!canal) return null;
  const c = CANALES[canal];
  if (!c) return null;
  return {
    valor: c.valor,
    clave: canal,
    fuente: `el canal por el que llegó el cliente: ${c.etiqueta}`,
  };
}
