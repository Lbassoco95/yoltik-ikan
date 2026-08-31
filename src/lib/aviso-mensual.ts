/**
 * Reglas de presentación del aviso mensual — núcleo puro.
 *
 * Sin red ni base: recibe el estado del periodo y decide qué se puede
 * presentar. Se prueba aislado porque es la lógica que, si falla, hace que un
 * fedatario presente algo falso ante la autoridad.
 *
 * ---------------------------------------------------------------------
 * La regla, y por qué es asimétrica
 * ---------------------------------------------------------------------
 * Dos situaciones que parecen iguales y no lo son:
 *
 *   Operaciones que rebasaron el UMBRAL
 *     La obligación ya nació: el monto la disparó, no el criterio de nadie.
 *     Un informe en ceros con operaciones sobre umbral es una declaración
 *     falsa. Se BLOQUEA. No es paternalismo del sistema: es que ese informe
 *     dice literalmente «no tuve operaciones reportables» y sí las tuvo.
 *
 *   Hallazgos abiertos (24 horas, inusual, preocupante)
 *     Todavía no hay obligación: el OC está determinando si lo son. Si tienen
 *     fecha de compromiso, el trabajo está planeado y presentar el aviso del
 *     periodo no tiene por qué esperar. Se RECUERDA, no se bloquea.
 *
 *   Actos que el motor nunca recorrió
 *     No es que no sean reportables: es que nadie lo ha determinado. Se
 *     BLOQUEA. Un informe en ceros sobre actos sin evaluar no es una
 *     declaración equivocada, es una declaración sin fundamento: afirma haber
 *     comprobado algo que no se comprobó.
 *
 * La diferencia práctica: el umbral es un hecho, el hallazgo es un juicio en
 * curso, y el acto sin evaluar es un hueco. Bloquear por un juicio en curso
 * paralizaría al fedatario; no bloquear por un hecho —o por un hueco— lo
 * pondría a mentir.
 */

export type TipoAvisoMensual = 'con_operaciones' | 'en_ceros';

export interface OperacionDelPeriodo {
  id: string;
  /** Etiqueta oficial del layout (docs/layouts-sat/tipos_acto_fep.json). */
  tipo_acto: string;
  monto_mxn: number;
  fecha: string;
  /** Si el monto o el tipo de acto la vuelven reportable. Lo determina el
   *  Motor PLD contra `parametro_regulatorio`, no esta función. */
  rebasa_umbral: boolean;
  /**
   * El Motor PLD ya la recorrió, haya encontrado algo o no.
   *
   * Sin este dato, `rebasa_umbral: false` significaba dos cosas distintas —"se
   * revisó y no es reportable" y "nadie la ha mirado"— y esta función leía
   * las dos como la primera. Un mes entero de actos sin evaluar se presentaba
   * en ceros sin una sola advertencia.
   */
  evaluada: boolean;
  /** 'sppld' o 'declaranot'. Sólo las del SPPLD entran en este aviso. */
  canal: string;
}

export interface HallazgoDelPeriodo {
  id: string;
  folio: string | null;
  tipologia_codigo: string;
  estado: string;
  /** Compromiso del OC. Null = nadie ha planeado cuándo se resuelve. */
  fecha_compromiso: string | null;
}

export interface Bloqueo {
  /** Qué clase de bloqueo es. La pantalla lo usa para saber cuál puede
   *  resolver desde ahí; distinguirlos por el texto del motivo haría que
   *  reescribir una frase rompiera un botón. */
  clave: 'umbral' | 'sin_evaluar';
  motivo: string;
  detalle: string;
  operaciones: string[];
}

export interface Recordatorio {
  motivo: string;
  detalle: string;
}

export interface EvaluacionAviso {
  /** Operaciones del SPPLD que deben ir en el aviso. */
  reportables: OperacionDelPeriodo[];
  /** Las del SPPLD que el motor todavía no ha recorrido. No se sabe si son
   *  reportables, y por eso el periodo no puede darse por vacío. */
  sinEvaluar: OperacionDelPeriodo[];
  /** Las de inmuebles: van por DeclaraNOT y NO entran aquí. Se listan para
   *  que nadie las dé por reportadas al presentar este aviso. */
  porDeclaraNot: OperacionDelPeriodo[];
  /** Qué impide presentar en ceros. Vacío = sí se puede. */
  bloqueos: Bloqueo[];
  /** Lo que conviene saber antes de presentar, sin impedirlo. */
  recordatorios: Recordatorio[];
  puedeEnCeros: boolean;
}

const ESTADOS_ABIERTOS = ['abierto', 'en_revision'];

export function evaluarAvisoMensual(
  operaciones: OperacionDelPeriodo[],
  hallazgos: HallazgoDelPeriodo[],
  hoy: Date = new Date(),
): EvaluacionAviso {
  const delSppld = operaciones.filter((o) => o.canal === 'sppld');
  const porDeclaraNot = operaciones.filter((o) => o.canal === 'declaranot');
  const reportables = delSppld.filter((o) => o.rebasa_umbral);
  // Sólo las del SPPLD: las de DeclaraNOT no entran en este aviso, así que su
  // evaluación no cambia si este mes va en ceros o no.
  const sinEvaluar = delSppld.filter((o) => !o.evaluada);

  const bloqueos: Bloqueo[] = [];
  const recordatorios: Recordatorio[] = [];

  // Lo único que bloquea: presentar en ceros teniendo operaciones sobre umbral.
  if (reportables.length > 0) {
    bloqueos.push({
      clave: 'umbral',
      motivo: 'Hay operaciones que rebasaron el umbral',
      detalle:
        `${reportables.length} ${reportables.length === 1 ? 'operación rebasó' : 'operaciones rebasaron'} ` +
        'el umbral en este periodo. Un informe en ceros declara que no hubo operaciones reportables, ' +
        'y eso no sería cierto. Presenta el aviso con estas operaciones.',
      operaciones: reportables.map((o) => o.id),
    });
  }

  // Actos sin evaluar: bloquean el informe en ceros, no la presentación.
  // Se puede presentar el aviso con lo que ya se sabe reportable; lo que no se
  // puede es afirmar que no hubo nada teniendo actos sin revisar.
  if (sinEvaluar.length > 0) {
    bloqueos.push({
      clave: 'sin_evaluar',
      motivo: 'Hay actos que el motor no ha evaluado',
      detalle:
        `${sinEvaluar.length} ${sinEvaluar.length === 1 ? 'acto del periodo no ha pasado' : 'actos del periodo no han pasado'} ` +
        'por el Motor PLD, así que no se sabe si son reportables. Un informe en ceros afirma que ' +
        'se revisaron y no lo fueron. Corre el motor sobre el periodo antes de presentar.',
      operaciones: sinEvaluar.map((o) => o.id),
    });
  }

  // Hallazgos abiertos: se recuerdan, nunca bloquean.
  const abiertos = hallazgos.filter((h) => ESTADOS_ABIERTOS.includes(h.estado));
  if (abiertos.length > 0) {
    const sinPlan = abiertos.filter((h) => !h.fecha_compromiso);
    const vencidos = abiertos.filter(
      (h) => h.fecha_compromiso && new Date(h.fecha_compromiso + 'T23:59:59') < hoy,
    );

    if (sinPlan.length > 0) {
      recordatorios.push({
        motivo: `${sinPlan.length} sin fecha de compromiso`,
        detalle:
          'Nadie ha planeado cuándo se resuelven. Puedes presentar el aviso igual, pero un ' +
          'expediente sin fecha es el que se queda olvidado.',
      });
    }
    if (vencidos.length > 0) {
      recordatorios.push({
        motivo: `${vencidos.length} con el compromiso vencido`,
        detalle: 'Su fecha ya pasó. O se cierran, o conviene mover la fecha con su motivo.',
      });
    }
    const enPlazo = abiertos.length - sinPlan.length - vencidos.length;
    if (enPlazo > 0) {
      recordatorios.push({
        motivo: `${enPlazo} en curso, dentro de su plazo`,
        detalle:
          'El OC se comprometió a resolverlos más adelante. No impiden presentar el aviso de ' +
          'este periodo.',
      });
    }
  }

  if (porDeclaraNot.length > 0) {
    recordatorios.push({
      motivo: `${porDeclaraNot.length} de transmisión de inmuebles`,
      detalle:
        'Van por DeclaraNOT, no por el SPPLD, y su plazo es de 15 días naturales tras la firma ' +
        '—no el día 17—. Presentar este aviso NO las reporta.',
    });
  }

  return {
    reportables,
    sinEvaluar,
    porDeclaraNot,
    bloqueos,
    recordatorios,
    puedeEnCeros: bloqueos.length === 0,
  };
}

/** Qué tipo de aviso corresponde según lo que hay. */
export function tipoAvisoSugerido(ev: EvaluacionAviso): TipoAvisoMensual {
  return ev.reportables.length > 0 ? 'con_operaciones' : 'en_ceros';
}
