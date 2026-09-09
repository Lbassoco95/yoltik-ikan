/**
 * Lector de la Lista Consolidada del Consejo de Seguridad de la ONU.
 *
 * Sin red ni base: recibe el texto del XML y devuelve registros normalizados.
 * Verificado contra el archivo real del 7 de septiembre de 2026, que trae
 * exactamente las 736 personas y 275 entidades que Kawiil-Cumplimiento fijó
 * como cifra de control (su punto 1.3, instrucción 244).
 *
 * ---------------------------------------------------------------------
 * Cuál de los dos archivos
 * ---------------------------------------------------------------------
 * La ONU publica la misma lista ordenada de dos formas y NO son
 * intercambiables. Se usa la de número de referencia permanente
 * (`consolidatedLegacyByPRN.xml`): el `REFERENCE_NUMBER` —«CDi.001»— es el
 * identificador estable que la Adenda 3 exige. El orden alfabético cambia con
 * cada alta y no sirve como clave.
 *
 * Comprobado: los 736 y los 275 traen su `REFERENCE_NUMBER`, y los 1,011 son
 * únicos.
 *
 * ---------------------------------------------------------------------
 * Y esta lista SÍ impide operar
 * ---------------------------------------------------------------------
 * A diferencia de OFAC. Las resoluciones del Consejo de Seguridad vinculan a
 * México, así que una coincidencia confirmada es un impedimento y no un factor
 * de riesgo. El efecto no lo decide este lector: vive en `lista_fuente.efecto`
 * (migration 0066), donde Cumplimiento lo declaró.
 */

export type TipoEntidadOnu = 'persona' | 'empresa';

export interface RegistroOnu {
  /** El `REFERENCE_NUMBER`: el número de referencia permanente. */
  identificadorFuente: string;
  /** El `DATAID`. Se conserva como dato adicional, no como llave. */
  dataId: string | null;
  tipoEntidad: TipoEntidadOnu;
  /** Nombre compuesto de los campos que trae la ONU, en orden. */
  nombre: string;
  /**
   * Alias de buena calidad y el nombre en su escritura original —árabe,
   * cirílico—, que lo traen 338 de las 736 personas. Un compareciente puede
   * presentarse con cualquiera de ellos.
   */
  nombresAlternos: string[];
  /**
   * Los alias que la propia ONU marca `Low`. Van aparte porque son variantes
   * ortográficas débiles: sirven para levantar un candidato a revisar, no para
   * afirmar una coincidencia. Mezclarlos con los buenos convertiría el barrido
   * en una fuente de falsos positivos que nadie querría revisar.
   */
  nombresAlternosDebiles: string[];
  pais: string | null;
  /** El régimen de sanciones: Al-Qaida, Taliban, DPRK, Iran… */
  regimen: string | null;
  /** `LISTED_ON`: cuándo lo listó el Consejo. Es la fecha de la fuente. */
  listadoEn: string | null;
  /** Última revisión o actualización que declara el registro. */
  revisadoEn: string | null;
  /**
   * Fecha de nacimiento COMO LA PUBLICA LA ONU. El archivo la da de ocho
   * formas distintas —día exacto, sólo año, año aproximado, un rango entre dos
   * años, o nada— y convertirlas todas a una fecha inventaría precisión.
   */
  fechaNacimiento: string | null;
  /** El calificador de esa fecha: EXACT, APPROXIMATELY, BETWEEN. */
  fechaNacimientoTipo: string | null;
  /**
   * Las fechas de nacimiento EXACTAS, como lista y en formato ISO.
   *
   * Va aparte de `fechaNacimiento` —que es para mostrar— porque cotejar exige
   * comparar valor por valor: la ONU publica varias fechas candidatas para la
   * misma persona y unirlas en una cadena hace que ninguna iguale. Quedan
   * fuera los años sueltos, los aproximados y los rangos: no son el mismo dato
   * que una fecha de nacimiento.
   */
  fechasNacimientoExactas: string[];
  /**
   * La nacionalidad declarada por la fuente, SIN caer al país del domicilio.
   *
   * `pais` sí cae, porque así se muestra. Para corroborar hace falta la
   * distinción: contradecir una coincidencia porque el designado tiene
   * domicilio en otro país no es una no-coincidencia demostrada.
   */
  nacionalidad: string | null;
  /** El país del domicilio, cuando la fuente lo trae. */
  paisDomicilio: string | null;
  /** El cargo o calidad con que se le lista. */
  designacion: string | null;
  /**
   * Elementos de alias sin nombre que traía este registro.
   *
   * Instrucción 295 de Cumplimiento: se descartan en la ingesta y se asienta
   * la cuenta, «misma disciplina que las 238 filas suprimidas del 69-B, se
   * descarta y se reporta, nunca en silencio». Son 294 en el archivo del 7 de
   * septiembre de 2026. No entran al índice porque no hay nada que cotejar,
   * pero una caída de esa cifra a cero en una carga futura significaría que el
   * lector dejó de ver una parte del archivo, y eso hay que poder notarlo.
   */
  aliasVacios: number;
}

export interface ResultadoOnu {
  /** `dateGenerated` del archivo: la fecha de la FUENTE, no la de carga. */
  fechaActualizacion: string | null;
  registros: RegistroOnu[];
  descartadas: { identificador: string; motivo: string }[];
  /** Suma de los elementos de alias sin nombre. Instrucción 295. */
  aliasVacios: number;
}

function desescapar(t: string): string {
  return t
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function texto(trozo: string, elemento: string): string | null {
  const m = trozo.match(new RegExp(`<${elemento}(?:\\s[^>]*)?>([\\s\\S]*?)</${elemento}>`));
  if (!m) return null;
  return desescapar(m[1].trim()).replace(/\s+/g, ' ').trim() || null;
}

function bloques(trozo: string, elemento: string): string[] {
  const re = new RegExp(`<${elemento}(?:\\s[^>]*)?>([\\s\\S]*?)</${elemento}>`, 'g');
  return [...trozo.matchAll(re)].map((m) => m[1]);
}

/**
 * Parte un alias que trae varios nombres en un solo campo.
 *
 * No es una hipótesis: en el archivo real 22 alias vienen así —«Azim Adhajani;
 * Azim Agha-Jani»— y son 51 nombres que sin partir no cotejarían nunca. Varios
 * pertenecen al programa nuclear iraní.
 *
 * Pero el punto y coma no siempre separa alias. A veces va DENTRO de un
 * paréntesis, separando transliteraciones del mismo nombre, y ahí partir a
 * ciegas destroza el dato. El caso real es QDi.299:
 *
 *   «أبو بكر البغدادي الحسيني القريشي (Abu Bakr al-Baghdadi al-Husayni
 *    al-Quraishi; Abu Bakr al-Baghdadi)»
 *
 * Partido a ciegas producía dos cadenas con el paréntesis descuadrado —una
 * abierta sin cerrar y otra que terminaba en «al-Baghdadi)»— y ninguna de las
 * dos cotejaba con lo que un operador teclearía. En la ÚNICA lista que impide
 * operar, eso es una coincidencia que se pierde.
 *
 * Así que se parte sólo en el nivel cero de paréntesis, y el paréntesis se
 * abre aparte: lo que hay dentro son formas del mismo nombre y cada una es
 * superficie de cotejo por derecho propio. Leer el paréntesis no es inventar
 * un nombre; dejarlo pegado sí es perder tres.
 */
export function partirAlias(valor: string): string[] {
  const nivelCero: string[] = [];
  let actual = '';
  let hondura = 0;
  for (const c of valor) {
    if (c === '(' || c === '[') hondura++;
    else if (c === ')' || c === ']') hondura = Math.max(0, hondura - 1);
    if (c === ';' && hondura === 0) {
      nivelCero.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  nivelCero.push(actual);

  const salida: string[] = [];
  for (const bruto of nivelCero) {
    const pieza = bruto.trim();
    if (pieza.length === 0) continue;

    // «Nombre (forma A; forma B)» → el nombre a secas, más cada forma.
    const m = pieza.match(/^(.*?)\s*[([]([^()[\]]*)[)\]]\s*$/);
    if (m && m[2].includes(';')) {
      const fuera = m[1].trim();
      if (fuera.length > 0) salida.push(fuera);
      for (const dentro of m[2].split(';')) {
        const x = dentro.trim();
        if (x.length > 0) salida.push(x);
      }
      continue;
    }
    salida.push(pieza);
  }
  return salida;
}

/** Compone la fecha de nacimiento respetando la forma en que la ONU la da. */
function fechaDeNacimiento(bloque: string): { valor: string | null; tipo: string | null } {
  const tipo = texto(bloque, 'TYPE_OF_DATE');
  const dia = texto(bloque, 'DATE');
  const anio = texto(bloque, 'YEAR');
  const desde = texto(bloque, 'FROM_YEAR');
  const hasta = texto(bloque, 'TO_YEAR');

  let valor: string | null = null;
  if (dia) valor = dia;
  else if (desde && hasta) valor = `entre ${desde} y ${hasta}`;
  else if (anio) valor = tipo === 'APPROXIMATELY' ? `${anio} (aproximada)` : anio;

  return { valor, tipo };
}

/** Recorre las personas y entidades del documento, una por vez. */
export function* registros(xml: string): Generator<{ trozo: string; tipo: TipoEntidadOnu }> {
  for (const [envoltura, hijo, tipo] of [
    ['INDIVIDUALS', 'INDIVIDUAL', 'persona'],
    ['ENTITIES', 'ENTITY', 'empresa'],
  ] as const) {
    const grupo = bloques(xml, envoltura)[0];
    if (!grupo) continue;
    for (const trozo of bloques(grupo, hijo)) yield { trozo, tipo };
  }
}

export function leerEntidadOnu(
  trozo: string,
  tipoEntidad: TipoEntidadOnu,
): RegistroOnu | { error: string; id: string } {
  const identificadorFuente = texto(trozo, 'REFERENCE_NUMBER');
  const dataId = texto(trozo, 'DATAID');

  if (!identificadorFuente) {
    return {
      error:
        'El registro no trae REFERENCE_NUMBER, que es el número de referencia permanente. ' +
        '¿Es el archivo ordenado alfabéticamente en vez del ordenado por PRN?',
      id: dataId ?? '(sin id)',
    };
  }

  // El nombre viene partido en hasta cuatro campos, en orden. Las entidades
  // usan sólo el primero, con el nombre completo dentro.
  //
  // Y un campo puede traer DOS nombres separados por «;». Pasa en el nombre
  // primario, no sólo en los alias: CDe.003 es
  //   «COMPAGNIE AERIENNE DES GRANDS LACS (CAGL) ; GREAT LAKES BUSINESS COMPANY (GLBC)»
  // que son dos razones sociales de la misma entidad designada. Guardarlo como
  // una sola cadena haría que ninguna de las dos cotejara nunca.
  //
  // Se parte cada campo por separado y se compone el nombre con la PRIMERA
  // pieza de cada uno; las piezas de más entran como alias buenos. Así un
  // individuo con FIRST_NAME y SECOND_NAME sigue componiéndose bien, y una
  // entidad con dos razones sociales queda con las dos cotejables.
  const piezas = ['FIRST_NAME', 'SECOND_NAME', 'THIRD_NAME', 'FOURTH_NAME']
    .map((c) => texto(trozo, c))
    .filter((x): x is string => x !== null)
    .map(partirAlias);

  const nombre = piezas
    .map((p) => p[0])
    .filter((x) => x !== undefined)
    .join(' ')
    .trim();

  if (!nombre) {
    return { error: 'Sin ningún campo de nombre.', id: identificadorFuente };
  }

  /** Las razones sociales o formas adicionales que venían empacadas. */
  const empacados = piezas.flatMap((p) => p.slice(1));

  // --- Alias, separando por la calidad que declara la ONU ------------
  const buenos = new Set<string>();
  const debiles = new Set<string>();
  const etiqueta = tipoEntidad === 'persona' ? 'INDIVIDUAL_ALIAS' : 'ENTITY_ALIAS';

  let aliasVacios = 0;
  for (const alias of bloques(trozo, etiqueta)) {
    const valor = texto(alias, 'ALIAS_NAME');
    if (!valor) {
      // No entra al índice —no hay nada que cotejar— pero se cuenta.
      aliasVacios++;
      continue;
    }
    const calidad = texto(alias, 'QUALITY');
    const destino = calidad === 'Low' ? debiles : buenos;
    for (const parte of partirAlias(valor)) destino.add(parte);
  }

  // El nombre en escritura original cuenta como alias bueno: es el mismo
  // nombre, no una variante ortográfica.
  const original = texto(trozo, 'NAME_ORIGINAL_SCRIPT');
  if (original) for (const parte of partirAlias(original)) buenos.add(parte);

  // Las razones sociales que venían empacadas en el nombre primario.
  for (const parte of empacados) buenos.add(parte);

  buenos.delete(nombre);
  debiles.delete(nombre);
  for (const b of buenos) debiles.delete(b);

  // --- País: se separan, y ahora sí importa la diferencia ------------
  //
  // `pais` sigue siendo el de siempre —nacionalidad si la hay, si no el del
  // domicilio— porque así se muestra y así lo lee todo lo construido. Pero la
  // nacionalidad va aparte, y no es un lujo: la compuerta del corroborante
  // (instrucciones 327 a 330) contrasta la NACIONALIDAD que declara el
  // compareciente, y contrastarla contra un país de domicilio sería corroborar
  // o contradecir con el dato equivocado. Peor todavía en el sentido de la
  // contradicción, que descarta una coincidencia: descartarla porque el
  // designado tiene domicilio en otro país no es una no-coincidencia
  // demostrada, es un error.
  const nacionalidad = texto(bloques(trozo, 'NATIONALITY')[0] ?? '', 'VALUE');
  const paisDomicilio = texto(
    bloques(trozo, `${tipoEntidad === 'persona' ? 'INDIVIDUAL' : 'ENTITY'}_ADDRESS`)[0] ?? '',
    'COUNTRY',
  );
  const pais = nacionalidad ?? paisDomicilio;

  // --- Fechas de nacimiento: puede haber más de una ------------------
  const nacimientos = bloques(trozo, 'INDIVIDUAL_DATE_OF_BIRTH').map(fechaDeNacimiento);
  const conValor = nacimientos.filter((x) => x.valor !== null);
  // Las fechas EXACTAS aparte y como lista, no como cadena.
  //
  // `fechaNacimiento` une varias con ' · ' para mostrarlas, y eso está bien
  // para leerlas y mal para cotejar: «1965-12-28 · 1965-12-29» son DOS fechas
  // candidatas que la ONU publica, no una fecha imprecisa, y contra una cadena
  // así ninguna igualdad acierta. De los 231 registros con alias de baja
  // calidad, 68 tienen más de una o alguna aproximada.
  //
  // Sólo las exactas: un año suelto o un «1966 (aproximada)» no son el mismo
  // dato que una fecha de nacimiento, y tratarlos como tal sería corroborar
  // con una coincidencia de 1 en 365 o contradecir sobre un dato que la propia
  // ONU marca como incierto.
  const fechasExactas = [
    ...new Set(
      conValor
        .filter((x) => x.tipo === 'EXACT' && /^\d{4}-\d{2}-\d{2}$/.test(x.valor!))
        .map((x) => x.valor!),
    ),
  ];

  return {
    identificadorFuente,
    dataId,
    tipoEntidad,
    nombre,
    nombresAlternos: [...buenos],
    nombresAlternosDebiles: [...debiles],
    pais,
    regimen: texto(trozo, 'UN_LIST_TYPE'),
    listadoEn: texto(trozo, 'LISTED_ON'),
    revisadoEn:
      texto(bloques(trozo, 'LAST_DAY_UPDATED')[0] ?? '', 'VALUE') ?? texto(trozo, 'LAST_REVIEWED_ON'),
    fechaNacimiento: conValor.map((x) => x.valor).join(' · ') || null,
    fechaNacimientoTipo: conValor[0]?.tipo ?? nacimientos[0]?.tipo ?? null,
    fechasNacimientoExactas: fechasExactas,
    nacionalidad,
    paisDomicilio,
    designacion: texto(bloques(trozo, 'DESIGNATION')[0] ?? '', 'VALUE'),
    aliasVacios,
  };
}

export function leerOnu(xml: string): ResultadoOnu {
  if (!/<CONSOLIDATED_LIST[\s>]/.test(xml.slice(0, 4000))) {
    throw new Error(
      'Esto no parece la Lista Consolidada de la ONU: falta el elemento raíz ' +
        '`CONSOLIDATED_LIST`. Descárguela de scsanctions.un.org, en la variante ' +
        'ordenada por número de referencia permanente.',
    );
  }

  const mFecha = xml.slice(0, 4000).match(/dateGenerated="([^"]+)"/);
  const fechaActualizacion = mFecha ? (mFecha[1].match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null) : null;

  const salida: RegistroOnu[] = [];
  const descartadas: ResultadoOnu['descartadas'] = [];

  for (const { trozo, tipo } of registros(xml)) {
    const r = leerEntidadOnu(trozo, tipo);
    if ('error' in r) descartadas.push({ identificador: r.id, motivo: r.error });
    else salida.push(r);
  }

  const aliasVacios = salida.reduce((n, r) => n + r.aliasVacios, 0);
  return { fechaActualizacion, registros: salida, descartadas, aliasVacios };
}

/**
 * Traduce lo que lee este módulo a lo que espera el camino de carga.
 *
 * La ONU sí distingue la calidad de sus alias, así que los débiles viajan
 * aparte y llegan a `nombres_alternos_debiles`.
 */
export function registrosParaCarga(registros: RegistroOnu[]) {
  return registros.map((r) => ({
    nombre: r.nombre,
    rfc: null,
    tipo_entidad: r.tipoEntidad,
    pais: r.pais,
    identificador_fuente: r.identificadorFuente,
    nombres_alternos: r.nombresAlternos,
    nombres_alternos_debiles: r.nombresAlternosDebiles,
    identificadores: {
      data_id: r.dataId,
      regimen: r.regimen,
      listado_en: r.listadoEn,
      revisado_en: r.revisadoEn,
      fecha_nacimiento: r.fechaNacimiento,
      fecha_nacimiento_tipo: r.fechaNacimientoTipo,
      // Lo que usa la compuerta del corroborante. Aparte de lo de mostrar.
      fechas_nacimiento_exactas: r.fechasNacimientoExactas,
      nacionalidad: r.nacionalidad,
      pais_domicilio: r.paisDomicilio,
      designacion: r.designacion,
      // Instrucción 295: la cuenta viaja con el registro, no sólo en el total.
      alias_vacios: r.aliasVacios,
    },
  }));
}
