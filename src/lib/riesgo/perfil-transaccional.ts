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
 * Cómo se comparan seis meses con un año, y el error que había aquí
 * ---------------------------------------------------------------------
 * Lo declarado es anual y lo observado son seis meses, así que la expectativa
 * se PRORRATEA: la mitad de lo declarado, sin redondear.
 *
 * Este módulo redondeaba esa mitad HACIA ARRIBA y lo documentaba como «no hay
 * margen de tolerancia, porque la Adenda no fija ninguno». Era falso, y
 * Cumplimiento lo señaló (Adenda 1, apartado 7.1): no era ausencia de
 * tolerancia, era una tolerancia del CINCUENTA POR CIENTO. Una cifra inventada
 * exactamente igual que lo habría sido un diez por ciento, sólo que cinco veces
 * más amplia y sin quedar escrita en ninguna parte.
 *
 * Y era peor de lo que parece, porque el redondeo la hacía VARIABLE y más
 * generosa justo donde los conteos son más chicos: quien declaraba una
 * operación al año podía hacer una en seis meses —el doble del ritmo
 * declarado— sin que nada se levantara; quien declaraba cuatro no tenía holgura
 * ninguna. Nadie decidió esa política: salió de un `Math.ceil`.
 *
 * ---------------------------------------------------------------------
 * Lo que hay ahora: primero la razón, y el estado binario sólo si hace falta
 * ---------------------------------------------------------------------
 * La instrucción de Cumplimiento tiene un orden de preferencia, y las dos
 * partes están implementadas:
 *
 *   1. `desviacionDeFrecuencia` calcula la RAZÓN CONTINUA entre observada y
 *      esperada. No decide nada: sirve para ORDENAR la cola de revisión. Una
 *      cola ordenada por desviación no necesita umbral, y es la única salida
 *      que no exige inventar ninguna cifra. Es lo preferido, y se calcula
 *      siempre.
 *
 *   2. `riesgoDeFrecuencia` produce el estado binario que la matriz necesita
 *      para su variable discreta, con un MARGEN ABSOLUTO —una operación por
 *      encima de lo esperado— que NO vive aquí: es el parámetro
 *      `margen_perfil_transaccional_operaciones` del registro versionado y
 *      firmado (migration 0044). Si es una constante en el fuente, nadie puede
 *      acreditar ante un verificador cuándo cambió ni quién lo aprobó.
 *
 * El margen es absoluto y no porcentual porque en fe pública la frecuencia
 * declarada es un entero pequeño: un diez por ciento sobre dos operaciones
 * esperadas da 2.2, que al redondear se comporta igual que no tener tolerancia.
 * Un porcentaje sólo discrimina cuando los conteos son grandes, y aquí no lo
 * son.
 *
 * ---------------------------------------------------------------------
 * La comparación es DIRECCIONAL
 * ---------------------------------------------------------------------
 * Operar por encima de lo declarado y operar por debajo no son la misma señal.
 * Lo primero es actividad fuera del perfil y puede indicar fraccionamiento; lo
 * segundo, en una actividad de actos discretos como la fe pública, casi siempre
 * es un cliente que no necesitó el servicio.
 *
 * La subutilización produce, a lo sumo, una nota de CALIDAD DEL DATO. No suma
 * puntos y no baja de banda a nadie. Marcar los dos lados genera ruido que
 * termina desatendiendo la cola, que es la forma más segura de que la cola deje
 * de servir para nada.
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

/**
 * La desviación, sin decidir nada.
 *
 * Es la opción PREFERIDA de Cumplimiento (Adenda 1, apartado 7.1): calcular la
 * razón continua y usarla para ordenar la cola de revisión, no para clasificar.
 * Una cola ordenada por desviación no necesita umbral, y es la única salida que
 * no exige inventar ninguna cifra.
 *
 * Se calcula SIEMPRE, exista o no el parámetro del margen.
 */
export interface DesviacionFrecuencia {
  /** Lo declarado, prorrateado a la ventana. Sin redondear. Null si no declaró. */
  esperadas_en_ventana: number | null;
  observadas_en_ventana: number;
  /**
   * Observadas entre esperadas. Es la clave de ordenamiento de la cola.
   *
   * Null cuando no hay contra qué dividir: sin declaración, o con cero
   * operaciones esperadas. En esos casos ordena `exceso`, que siempre existe.
   */
  razon: number | null;
  /** Observadas menos esperadas. Negativo = por debajo. Null si no declaró. */
  exceso: number | null;
  /**
   * Opera por DEBAJO de lo declarado.
   *
   * No es señal de riesgo y no puntúa. En una actividad de actos discretos como
   * la fe pública casi siempre es un cliente que no necesitó el servicio; a lo
   * sumo es una nota de calidad del dato. Marcar los dos lados genera ruido que
   * termina desatendiendo la cola.
   */
  subutilizacion: boolean;
}

export interface RiesgoFrecuencia {
  clave: ClavePerfil;
  /** 1 dentro · 2 sin declaración · 3 excede. */
  valor: number;
  fuente: string;
  /** La respuesta salió de la ausencia del dato, no del dato. */
  por_defecto: boolean;
  /** La desviación continua, para ordenar la cola. Viaja siempre con el estado. */
  desviacion: DesviacionFrecuencia;
  /** El margen absoluto que se aplicó, tal como venía del parámetro firmado. */
  margen_aplicado: number;
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

/**
 * La desviación entre lo declarado y lo observado. No clasifica.
 *
 * Lo declarado es anual y la ventana son seis meses, así que se PRORRATEA sin
 * redondear. El redondeo es exactamente lo que introducía la tolerancia
 * invisible del cincuenta por ciento que Cumplimiento mandó retirar.
 */
export function desviacionDeFrecuencia(
  esperadaAnual: number | null | undefined,
  observadasEnVentana: number,
  meses = MESES_VENTANA,
): DesviacionFrecuencia {
  const observadas = Number.isFinite(observadasEnVentana) ? Math.max(0, observadasEnVentana) : 0;

  if (esperadaAnual == null || !Number.isFinite(esperadaAnual) || esperadaAnual < 0) {
    return {
      esperadas_en_ventana: null,
      observadas_en_ventana: observadas,
      razon: null,
      exceso: null,
      subutilizacion: false,
    };
  }

  const esperadas = (esperadaAnual * meses) / 12;
  return {
    esperadas_en_ventana: esperadas,
    observadas_en_ventana: observadas,
    razon: esperadas > 0 ? observadas / esperadas : null,
    exceso: observadas - esperadas,
    subutilizacion: observadas < esperadas,
  };
}

/**
 * El estado que la matriz necesita para su variable discreta.
 *
 * `margen` NO tiene valor por defecto a propósito: es un parámetro normativo
 * que vive en `parametro_regulatorio` (migration 0044), firmado y con fecha de
 * revisión. Un default aquí sería otra vez una cifra escondida en el código, que
 * es justo lo que la instrucción 12 mandó retirar. Sin parámetro cargado, esta
 * función devuelve null y la variable se queda sin responder: la pantalla lo
 * dice, en vez de inventar una tolerancia.
 */
export function riesgoDeFrecuencia(
  esperadaAnual: number | null | undefined,
  observadasEnVentana: number,
  margen: number | null | undefined,
  meses = MESES_VENTANA,
): RiesgoFrecuencia | null {
  if (margen == null || !Number.isFinite(margen) || margen < 0) return null;

  const desviacion = desviacionDeFrecuencia(esperadaAnual, observadasEnVentana, meses);
  const observadas = desviacion.observadas_en_ventana;
  const base = { desviacion, margen_aplicado: margen };

  if (desviacion.esperadas_en_ventana == null) {
    return {
      ...base,
      clave: 'sin_declaracion',
      valor: 2,
      por_defecto: true,
      fuente:
        'el cliente no declaró frecuencia esperada de operación; sin ella no hay contra qué ' +
        `comparar las ${observadas} operación(es) de los últimos ${meses} meses`,
    };
  }

  const esperadas = desviacion.esperadas_en_ventana;
  const enTexto = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  // La comparación es DIRECCIONAL: sólo el exceso es señal. Operar por debajo,
  // en una actividad de actos discretos, casi siempre es un cliente que no
  // necesitó el servicio, y marcarlo generaría ruido que desatiende la cola.
  if (observadas > esperadas + margen) {
    return {
      ...base,
      clave: 'excede',
      valor: 3,
      por_defecto: false,
      fuente:
        `${observadas} operación(es) en los últimos ${meses} meses frente a las ` +
        `${enTexto(esperadas)} que corresponden a las ${esperadaAnual} anuales declaradas, ` +
        `más el margen de ${margen} del parámetro firmado`,
    };
  }

  return {
    ...base,
    clave: 'dentro',
    valor: 1,
    por_defecto: false,
    fuente:
      `${observadas} operación(es) en los últimos ${meses} meses, dentro de las ` +
      `${enTexto(esperadas)} que corresponden a las ${esperadaAnual} anuales declaradas ` +
      `más el margen de ${margen}` +
      (desviacion.subutilizacion
        ? '. Opera por debajo de lo declarado: es nota de calidad del dato, no señal de riesgo'
        : ''),
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
