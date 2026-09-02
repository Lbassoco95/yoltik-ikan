/**
 * Qué periodo se puede presentar, y cuál todavía no.
 *
 * El art. 23 de la LFPIORPI da hasta el día 17 del mes SIGUIENTE al periodo
 * reportado. De ahí se sigue algo que la pantalla no estaba respetando: el
 * periodo reportable es un mes CERRADO. El mes en curso no se presenta porque
 * todavía le pueden entrar actos —el día 2 de septiembre no se sabe qué va a
 * pasar el 20—, y un aviso presentado a mitad de mes queda incompleto por
 * construcción.
 *
 * El defecto que esto corrige: la pantalla metía el mes en curso en el
 * selector y además abría en él. En septiembre ofrecía generar el aviso de
 * septiembre, mientras el de agosto —que vence el 17 de septiembre y sí es
 * exigible— no aparecía por ningún lado. Ofrecer lo que no toca y callar lo que
 * sí es la peor combinación posible en una pantalla de plazos.
 */

/** AAAA-MM del mes de una fecha. */
export function periodoDe(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

/** AAAA-MM del mes en curso. */
export function mesActual(hoy: Date = new Date()): string {
  return periodoDe(hoy);
}

/** El último mes CERRADO, que es el primero que se puede presentar. */
export function ultimoPeriodoCerrado(hoy: Date = new Date()): string {
  return periodoDe(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));
}

/** Un periodo está cerrado cuando su mes ya terminó. */
export function periodoCerrado(
  periodo: string,
  hoy: Date = new Date(),
): boolean {
  return periodo < mesActual(hoy);
}

/**
 * La fecha límite de presentación: el día 17 del mes siguiente al periodo.
 *
 * Se devuelve a las 23:59:59 porque el plazo vence al terminar el día 17, no al
 * empezarlo.
 */
export function fechaLimite(periodo: string): Date {
  const [anio, mes] = periodo.split("-").map(Number);
  return new Date(anio, mes, 17, 23, 59, 59);
}

export type EstadoPeriodo =
  | "en_curso"
  | "por_presentar"
  | "fuera_de_plazo"
  | "presentado";

export interface SituacionPeriodo {
  periodo: string;
  estado: EstadoPeriodo;
  /** Si se puede generar y presentar el aviso de este periodo HOY. */
  presentable: boolean;
  limite: Date | null;
  /** Días que faltan para el día 17. Negativo si ya pasó. Null si no aplica. */
  diasParaElLimite: number | null;
  /** Qué decirle al usuario. El color no informa: el texto sí. */
  leyenda: string;
}

const DIA = 24 * 60 * 60 * 1000;

/**
 * Días de CALENDARIO entre dos fechas, ignorando la hora.
 *
 * Contar milisegundos daba un día de más: a las 10 de la mañana del día 17
 * todavía faltan catorce horas para que venza el plazo, y `Math.ceil` de eso es
 * 1, así que la pantalla decía «queda 1 día» el mismo día del vencimiento. Lo
 * que la gente cuenta son días del calendario, y el 17 quedan cero.
 */
function diasDeCalendario(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.round((b - a) / DIA);
}

/**
 * En qué situación está un periodo.
 *
 * `presentado` gana sobre el plazo: un aviso ya presentado fuera de tiempo no
 * se sigue pidiendo, se asienta como presentado y la extemporaneidad es un
 * hecho de la bitácora, no un pendiente abierto para siempre.
 */
export function situacionDelPeriodo(
  periodo: string,
  yaPresentado: boolean,
  hoy: Date = new Date(),
): SituacionPeriodo {
  if (!periodoCerrado(periodo, hoy)) {
    const desde = new Date(
      Number(periodo.split("-")[0]),
      Number(periodo.split("-")[1]),
      1,
    );
    return {
      periodo,
      estado: "en_curso",
      presentable: false,
      limite: null,
      diasParaElLimite: null,
      leyenda:
        "Mes en curso. Todavía le pueden entrar actos, así que no se presenta: se abre el " +
        desde.toLocaleDateString("es-MX", { day: "numeric", month: "long" }) +
        " y vence el 17 de ese mes.",
    };
  }

  const limite = fechaLimite(periodo);
  const dias = diasDeCalendario(hoy, limite);

  if (yaPresentado) {
    return {
      periodo,
      estado: "presentado",
      presentable: true,
      limite,
      diasParaElLimite: dias,
      leyenda: "Presentado.",
    };
  }

  if (dias < 0) {
    return {
      periodo,
      estado: "fuera_de_plazo",
      presentable: true,
      limite,
      diasParaElLimite: dias,
      leyenda:
        `Fuera de plazo: venció el 17 de ${limite.toLocaleDateString("es-MX", { month: "long" })}. ` +
        "Se presenta de todas formas —dejar de presentarlo no repara el retraso, lo agrava— y " +
        "la extemporaneidad queda asentada en la bitácora.",
    };
  }

  return {
    periodo,
    estado: "por_presentar",
    presentable: true,
    limite,
    diasParaElLimite: dias,
    leyenda:
      dias === 0
        ? "Vence HOY, día 17."
        : `Por presentar. Quedan ${dias} día${dias === 1 ? "" : "s"}: vence el 17 de ` +
          `${limite.toLocaleDateString("es-MX", { month: "long" })}.`,
  };
}

/**
 * Los periodos que se ofrecen en el selector, del más reciente al más antiguo.
 *
 * Incluye el mes en curso para que se VEA que existe y por qué no se presenta
 * todavía —quitarlo dejaría a quien lo busca pensando que la pantalla se
 * equivocó—, y siempre el último mes cerrado, tenga actos o no: un periodo sin
 * actos también se presenta, en ceros, y si no aparece nadie lo presenta.
 */
export function periodosOfrecidos(
  conActos: readonly string[],
  hoy: Date = new Date(),
): string[] {
  return [...new Set([mesActual(hoy), ultimoPeriodoCerrado(hoy), ...conActos])]
    .sort()
    .reverse();
}

/**
 * En qué periodo abrir la pantalla.
 *
 * En el más reciente CERRADO que tenga actos; si ninguno los tiene, en el
 * último mes cerrado. Nunca en el mes en curso: abrir en un periodo que no se
 * puede presentar invita a presentarlo.
 */
export function periodoDeApertura(
  conActos: readonly string[],
  hoy: Date = new Date(),
): string {
  const cerrados = conActos
    .filter((p) => periodoCerrado(p, hoy))
    .sort()
    .reverse();
  return cerrados[0] ?? ultimoPeriodoCerrado(hoy);
}
