/**
 * Listas restrictivas (migrations 0012 y 0013) — núcleo puro.
 *
 * Sin dependencias de red, para poder probarlo aislado. La lectura y la
 * escritura contra la base viven en `src/lib/api/listas.ts`.
 */

export type ModoActualizacion = 'snapshot' | 'movimientos';
export type NaturalezaLista = 'sancion_aml' | 'fiscal' | 'jurisdiccion' | 'pep' | 'interna';

/**
 * Qué produce una coincidencia. Es atributo de la FUENTE, no interpretación de
 * quien lee la pantalla: la ONU vincula a México y una coincidencia confirmada
 * es un impedimento; OFAC es derecho extranjero y su valor es indiciario. Si
 * las dos alimentaran el mismo casillero, el sistema o bloquea de más o
 * bloquea de menos, y los dos errores son graves.
 */
export type EfectoLista = 'impedimento' | 'eleva_diligencia' | 'dato';

/** Si ya se resolvió que la obligación de consultar la fuente existe. */
export type DeterminacionFuente = 'aplica' | 'no_aplica' | 'pendiente' | 'no_disponible';

/**
 * Cuatro estados que en pantalla se verían iguales —cero registros— y que se
 * resuelven de maneras distintas. Distinguirlos es el punto: `pendiente_carga`
 * se arregla bajando un archivo que existe; `pendiente_determinacion` con una
 * determinación jurídica que nadie ha hecho; `via_no_disponible` no se arregla,
 * porque la ley prohíbe entregar la fuente y el cumplimiento va por otro
 * camino.
 */
export type EstadoFuente =
  | 'cargada'
  | 'en_validacion'
  | 'pendiente_carga'
  | 'pendiente_determinacion'
  | 'no_aplica'
  | 'via_no_disponible';

/**
 * Si el barrido consulta la fuente o si todavía se está revisando.
 *
 * Va aparte de `activa` porque una fuente en validación tiene que VERSE —de
 * eso se trata validarla, mirar sus cifras y su fecha— y no tiene que
 * barrerse. Con una sola bandera había que elegir entre esconder lo que se
 * valida o barrer lo que no está listo.
 */
export type ModoOperacion = 'validacion' | 'operativa';

export function labelEfecto(e: EfectoLista | null): string {
  if (e === null) return 'Sin declarar';
  // El texto sale de la tabla del apartado 3.1 de la Nota 5, tal cual.
  return { impedimento: 'Impedimento', eleva_diligencia: 'Eleva diligencia', dato: 'Dato del expediente' }[e];
}

/** Una línea que explica el efecto sin que haya que saberse la norma. */
export function explicaEfecto(e: EfectoLista | null): string {
  if (e === null) {
    return 'La fuente todavía no ha declarado qué produce una coincidencia, así que no puede '
         + 'producir ninguno de forma automática.';
  }
  return {
    impedimento: 'Una coincidencia confirmada impide operar.',
    eleva_diligencia: 'Una coincidencia no impide operar: exige diligencia reforzada y revisión documentada.',
    dato: 'Una coincidencia se registra en el expediente y no tiene efecto automático.',
  }[e];
}

export function labelEstadoFuente(e: EstadoFuente): string {
  return {
    cargada: 'Cargada',
    en_validacion: 'En validación',
    pendiente_carga: 'Pendiente de carga',
    pendiente_determinacion: 'Pendiente de determinación',
    no_aplica: 'Sin obligación · informativa',
    via_no_disponible: 'Vía de consulta no disponible',
  }[e];
}

export function explicaEstadoFuente(e: EstadoFuente): string {
  return {
    cargada: 'Se consulta con los registros vigentes.',
    // Instrucción 297. Los datos están y el camino de carga se probó; lo que
    // falta es la compuerta que decide qué se hace con un alias de baja
    // calidad. Hasta entonces el barrido no la consulta, y decirlo es la
    // diferencia entre validar y aparentar que se opera.
    en_validacion:
      'Cargada para revisarse: el barrido todavía no la consulta, así que un resultado '
      + 'sin coincidencias no la incluye.',
    pendiente_carga: 'Ya se determinó que aplica; falta cargar el archivo de la autoridad.',
    pendiente_determinacion:
      'No es que falte un archivo: falta resolver si la obligación de consultarla existe. '
      + 'Hasta entonces no se puede afirmar que esta fuente esté cubierta.',
    no_aplica: 'No hay norma que obligue a consultarla. Se puede consultar y queda en el expediente.',
    // Instrucción 307: se dice como lo que es. Un «sin coincidencias» o un
    // «pendiente» aquí serían las dos formas de mentir: la primera afirma que
    // se consultó, la segunda manda a alguien a buscar un trámite que no
    // existe.
    via_no_disponible:
      'La ley prohíbe entregar esta fuente, así que no hay archivo que cargar ni trámite '
      + 'que pedir. La obligación que cubría sigue viva y se cumple por otra vía; el '
      + 'fundamento está en la ficha de la fuente.',
  }[e];
}
/**
 * De dónde nace la exigencia de consultar una fuente.
 *
 * Sustituye a la insignia «Obligatoria», que afirmaba que la ley manda
 * consultar estas listas. El art. 18 LFPIORPI, en sus once fracciones, no lo
 * manda (verificado por Cumplimiento sobre el texto con reforma del
 * 16/07/2025). Poner esa palabra en pantalla era poner por escrito, frente al
 * usuario, el argumento que en una visita de verificación se cae.
 *
 * `pendiente_manual` no es una clase distinta de fundamento: es
 * `metodologia_manual` cuando la organización todavía no tiene Manual
 * asentado. Lo resuelve la vista `v_listas_estado`, no este front, para que no
 * haya forma de pintar «previsto en el Manual» sin que exista el Manual.
 */
export type FundamentoConsulta =
  | 'obligacion_ley'
  | 'metodologia_manual'
  | 'informativa'
  | 'pendiente_manual';

export function labelFundamento(f: FundamentoConsulta | null): string {
  if (f === null) return '';
  return {
    obligacion_ley: 'Obligación de ley',
    metodologia_manual: 'Metodología del Manual',
    informativa: 'Informativa',
    pendiente_manual: 'Pendiente en el Manual',
  }[f];
}

/**
 * El texto de ayuda de cada fundamento.
 *
 * Va literal del apartado 3.4 de la Nota 5 de la Célula de Cumplimiento, y la
 * instrucción 338 pide adoptarlo SIN modificarlo: son afirmaciones jurídicas
 * dirigidas al usuario final, no copy. Si hace falta acortarlas por espacio,
 * se consulta a Cumplimiento antes — no se recortan aquí.
 *
 * `pendiente_manual` es el único que no viene de la nota, porque la nota da la
 * etiqueta (instrucción 337) y no su explicación. Se redactó para decir
 * exactamente lo que la etiqueta significa y nada más.
 */
export function explicaFundamento(f: FundamentoConsulta | null): string {
  if (f === null) return '';
  return {
    obligacion_ley:
      'La ley obliga a identificar y dar seguimiento a Personas Políticamente Expuestas. '
      + 'Esta fuente es el medio para cumplirlo.',
    metodologia_manual:
      'La ley no ordena consultar esta lista. Su despacho la adoptó en su Manual como '
      + 'medida para evaluar y mitigar riesgos.',
    informativa:
      'No prevista en su Manual. Se consulta por decisión propia y no produce efecto '
      + 'automático.',
    pendiente_manual:
      'La ley no ordena consultar esta lista, y su Manual todavía no consta en el sistema. '
      + 'Mientras no conste, no se puede afirmar que su despacho la haya adoptado.',
  }[f];
}

export type AccionMovimiento = 'alta' | 'baja';
export type EstadoCarga = 'borrador' | 'aplicada' | 'revertida';
export type TipoEntidad = 'persona' | 'empresa' | 'embarcacion' | 'aeronave';

export interface ListaFuente {
  id: string;
  codigo: string;
  nombre: string;
  autoridad: string;
  naturaleza: NaturalezaLista;
  modo_actualizacion: ModoActualizacion;
  url_oficial: string | null;
  frecuencia_objetivo: string | null;
  obligatoria: boolean;
  activa: boolean;
  notas: string | null;
  /** Situaciones posibles en esta fuente. Null = no las maneja (OFAC, ONU:
   *  estar en la lista es el único estado). */
  situaciones: string[] | null;
  /** Cuáles cuentan como coincidencia que exige acción. Null = todas.
   *  En el 69-B sólo 'definitivo': un presunto tiene plazo para desvirtuar. */
  situaciones_bloqueantes: string[] | null;
}

export interface ListaCarga {
  id: string;
  fuente_id: string;
  tipo: 'archivo' | 'captura_manual' | 'api';
  estado: EstadoCarga;
  fecha_publicacion_fuente: string | null;
  num_movimientos: number;
  cargada_en: string;
  notas: string | null;
  fuente_codigo?: string;
}

export interface RegistroVigente {
  registro_id: string;
  fuente: string;
  fuente_nombre: string;
  naturaleza: NaturalezaLista;
  tipo_entidad: TipoEntidad;
  nombre: string;
  rfc: string | null;
  curp: string | null;
  pais: string | null;
  alta_oficio: string | null;
  alta_fecha: string | null;
  actualizado_en: string;
  situacion: string | null;
  /** false = aparece en la lista pero NO exige acción (ej. un presunto del
   *  69-B, o alguien con sentencia favorable). Es contexto para debida
   *  diligencia reforzada, nunca un hallazgo confirmado. */
  bloqueante: boolean;
}

/** Una línea de captura antes de mandarse a la base. */
export interface MovimientoCaptura {
  accion: AccionMovimiento;
  tipo_entidad: TipoEntidad;
  nombre: string;
  rfc: string;
  curp: string;
  oficio_numero: string;
  oficio_fecha: string;
  motivo: string;
  /** Sólo en fuentes que manejan situaciones. Cadena vacía = ninguna. */
  situacion: string;
}

export function movimientoVacio(accion: AccionMovimiento = 'alta'): MovimientoCaptura {
  return {
    accion,
    tipo_entidad: 'persona',
    nombre: '',
    rfc: '',
    curp: '',
    oficio_numero: '',
    oficio_fecha: '',
    motivo: '',
    situacion: '',
  };
}

/**
 * Valida una línea antes de tocar la base.
 *
 * El oficio NO es obligatorio en el esquema pero sí lo exigimos aquí: en la
 * lista de la UIF es lo que justifica por qué alguien entró o salió, y una
 * baja sin oficio no es defendible ante una revisión. Mejor frenarlo en el
 * formulario que descubrirlo en una verificación.
 */
export function validarMovimiento(m: MovimientoCaptura, fuente?: ListaFuente): string[] {
  const errores: string[] = [];

  if (!m.nombre.trim()) {
    errores.push('Falta el nombre o razón social.');
  }
  if (!m.oficio_numero.trim()) {
    errores.push('Falta el número de oficio: es lo que respalda el movimiento.');
  }
  if (m.rfc.trim() && !esRfcPlausible(m.rfc)) {
    errores.push(`El RFC "${m.rfc.trim()}" no tiene forma de RFC (12 caracteres para moral, 13 para física).`);
  }
  if (m.oficio_fecha && Number.isNaN(Date.parse(m.oficio_fecha))) {
    errores.push('La fecha del oficio no es válida.');
  }
  if (m.oficio_fecha && new Date(m.oficio_fecha) > new Date()) {
    errores.push('La fecha del oficio está en el futuro.');
  }

  // La situación se valida también en la base, pero atajarla aquí evita
  // mandar una carga completa que va a fallar a la mitad.
  if (fuente) {
    const situaciones = fuente.situaciones;
    if (m.situacion && !situaciones) {
      errores.push(`«${fuente.nombre}» no maneja situaciones; deja ese campo vacío.`);
    } else if (m.situacion && situaciones && !situaciones.includes(m.situacion)) {
      errores.push(`Situación no válida. Las de esta fuente: ${situaciones.join(', ')}.`);
    } else if (!m.situacion && situaciones) {
      errores.push(`«${fuente.nombre}» exige una situación: ${situaciones.join(', ')}.`);
    }
  }

  return errores;
}

/** Etiquetas legibles de las situaciones del 69-B. Otras fuentes que
 *  incorporen situaciones caen al valor crudo, que es preferible a inventar
 *  una traducción. */
export const SITUACION_LABEL: Record<string, string> = {
  presunto: 'Presunto',
  definitivo: 'Definitivo',
  desvirtuado: 'Desvirtuado',
  sentencia_favorable: 'Sentencia favorable',
};

export function labelSituacion(s: string | null): string {
  if (!s) return '—';
  return SITUACION_LABEL[s] ?? s;
}

/**
 * Forma de RFC, no existencia. Física: 4 letras + 6 dígitos + 3 de homoclave.
 * Moral: 3 letras + 6 dígitos + 3 de homoclave. No valida el dígito
 * verificador ni que exista ante el SAT: eso no se puede hacer sin consultar.
 */
export function esRfcPlausible(rfc: string): boolean {
  const v = rfc.trim().toUpperCase();
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(v);
}

/** Normaliza el RFC igual que la base: mayúsculas y sin espacios. */
export function normalizarRfc(rfc: string): string | null {
  const v = rfc.trim().toUpperCase();
  return v === '' ? null : v;
}

export const NATURALEZA_LABEL: Record<NaturalezaLista, string> = {
  sancion_aml: 'Sanción PLD/FT',
  fiscal: 'Fiscal',
  jurisdiccion: 'Jurisdicción',
  pep: 'Persona políticamente expuesta',
  interna: 'Lista interna',
};

export const MODO_LABEL: Record<ModoActualizacion, string> = {
  snapshot: 'Archivo completo',
  movimientos: 'Altas y bajas por oficio',
};

export const ESTADO_CARGA_LABEL: Record<EstadoCarga, string> = {
  borrador: 'Borrador',
  aplicada: 'Aplicada',
  revertida: 'Revertida',
};

/** Sólo las fuentes que se capturan por oficio admiten captura manual. */
export function admiteCapturaManual(f: ListaFuente): boolean {
  return f.modo_actualizacion === 'movimientos' && f.activa;
}
