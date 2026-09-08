/**
 * Lector de las listas de OFAC en formato ENHANCED XML — núcleo puro.
 *
 * Sin red ni base: recibe el texto del XML y devuelve registros normalizados.
 * Se prueba contra los archivos reales del Tesoro, que es lo único que da
 * confianza cuando el entorno de desarrollo no puede alcanzar la fuente.
 *
 * ---------------------------------------------------------------------
 * Por qué ENHANCED y no ADVANCED
 * ---------------------------------------------------------------------
 * OFAC publica los dos. El ADVANCED es el modelo canónico y está
 * completamente normalizado: para armar un nombre hay que recorrer
 * `DistinctParty → Profile → Identity → Alias → DocumentedName →
 * DocumentedNamePart → NamePartValue` y resolver los identificadores contra
 * `ReferenceValueSets`. El ENHANCED trae los mismos datos con los nombres ya
 * compuestos en `formattedFullName` y los catálogos resueltos en línea.
 *
 * Los dos traen el identificador único que Cumplimiento exige —el `id` de la
 * entidad—, así que el ENHANCED da lo mismo con mucho menos código que pueda
 * equivocarse. Verificado contra los archivos del 4 de septiembre de 2026:
 * las 19,365 entidades de la SDN y las 481 de la Consolidada traen todas su
 * nombre primario con `formattedFullName`.
 *
 * ---------------------------------------------------------------------
 * Por qué se recorre a mano y no con DOMParser
 * ---------------------------------------------------------------------
 * `SDN_ENHANCED.XML` pesa 109 MB. Un DOM de ese tamaño no cabe en el
 * navegador, y en Deno no hay DOMParser. Así que se recorre por trozos: se
 * localiza cada `<entity …>…</entity>` y se extrae de ese trozo, que son unos
 * cientos de bytes. El consumo es lineal y no depende del tamaño del archivo.
 *
 * Es la misma decisión que en el lector del SAT: el esquema lo genera una
 * máquina y es estable, y cada dependencia en una Edge Function es peso y
 * superficie.
 *
 * ---------------------------------------------------------------------
 * Lo que se conserva, y lo que no
 * ---------------------------------------------------------------------
 * Se conservan los ALIAS —30,309 en la SDN y 1,298 en la Consolidada, contados
 * a la salida de este lector— porque un designado opera bajo cualquiera de
 * ellos y cotejar sólo el nombre primario dejaría pasar la mayoría.
 *
 * Esa cuenta es mayor que la de los `<name>` no primarios (24,583 en la SDN) a
 * propósito: también entran las traducciones NO PRIMARIAS del nombre primario,
 * que son transliteraciones. Las traen 4,803 entidades, y hacen falta porque un
 * mismo nombre árabe o cirílico se translitera de varias formas y la que venga
 * en el documento del compareciente puede no ser la del listado.
 *
 * Se conserva la fecha de nacimiento cuando viene, que es lo único que
 * permite descartar un homónimo sin llamar a nadie.
 *
 * ---------------------------------------------------------------------
 * Qué garantiza el esquema y qué es sólo observación
 * ---------------------------------------------------------------------
 * Comprobado contra `enhanced_xml.xsd`, porque la diferencia decide dónde hace
 * falta defenderse y dónde sería ruido:
 *
 *   OBLIGATORIOS  `formattedFullName`, `entityType`, el `value` de un rasgo,
 *                 `sanctionsTypes`, y al menos una `sanctionsList` con su
 *                 atributo `datePublished`. De estos no hay que dudar.
 *
 *   OPCIONALES    `addresses`, `country` y `features`. Por eso el país y la
 *                 fecha de nacimiento pueden ser null, y eso NO es un defecto
 *                 del archivo: 3,264 entidades de la SDN no traen país.
 *
 *   NO GARANTIZADO  que exista exactamente un nombre primario. El esquema
 *                 permite varios o ninguno. En los archivos del 4 de
 *                 septiembre las 19,846 entidades traen uno, pero el lector no
 *                 se apoya en eso: si falta, la entidad se descarta con su
 *                 motivo en vez de quedarse sin nombre.
 *
 * NO se conservan direcciones completas ni documentos de identidad: no hacen
 * falta para cotejar y ampliarían a diez años lo que guardamos de una persona
 * sin que nadie lo haya pedido.
 */

/** Los tipos de OFAC calzan con los cuatro que la migration 0012 ya preveía. */
export type TipoEntidadOfac = 'persona' | 'empresa' | 'embarcacion' | 'aeronave';

const TIPO: Record<string, TipoEntidadOfac> = {
  Individual: 'persona',
  Entity: 'empresa',
  Vessel: 'embarcacion',
  Aircraft: 'aeronave',
};

export interface RegistroOfac {
  /**
   * El `id` de la entidad en OFAC. Es el identificador estable que la Adenda 3
   * exige y que Cumplimiento reiteró: nunca la posición en el archivo ni el
   * nombre traducido.
   */
  identificadorFuente: string;
  tipoEntidad: TipoEntidadOfac;
  /** El nombre primario, ya compuesto por OFAC. */
  nombre: string;
  /** Alias y transliteraciones, sin duplicados y sin el primario. */
  nombresAlternos: string[];
  pais: string | null;
  /** Programas de sanción (CUBA, IRAN, SDGT…). Es el «por qué» de la medida. */
  programas: string[];
  /** En qué listas aparece: SDN List, Consolidated List, y las no-SDN. */
  listas: string[];
  /**
   * La naturaleza de la medida: «Block» (bloqueo de bienes) o «Reject»
   * (rechazo de la operación), entre otras. El esquema la marca obligatoria,
   * así que siempre viene, y dice algo que ni el programa ni la lista dicen:
   * qué se supone que hace quien encuentra la coincidencia. Va al expediente.
   */
  tiposSancion: string[];
  /** La publicación más reciente entre sus listas, en ISO. */
  publicadoEn: string | null;
  /**
   * Fecha de nacimiento TAL COMO LA PUBLICA OFAC, que a veces es sólo un año
   * («1955») y a veces un día. Se conserva como texto a propósito: convertirla
   * a fecha inventaría una precisión que la fuente no tiene, y en un cotejo de
   * homónimos esa precisión falsa descartaría a la persona equivocada.
   */
  fechaNacimiento: string | null;
}

export interface ResultadoOfac {
  /** `dataAsOf` del archivo: la fecha de la FUENTE, no la de carga. */
  fechaActualizacion: string | null;
  /** Qué listas declara el archivo en su cabecera. */
  listasDelArchivo: string[];
  registros: RegistroOfac[];
  /** Entidades no interpretables, con su motivo. Nunca se descarta en silencio. */
  descartadas: { identificador: string; motivo: string }[];
}

/** Deshace las cinco entidades XML predefinidas. El archivo viene en UTF-8. */
function desescapar(t: string): string {
  return t
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    // El & va al final: si fuera primero, re-interpretaría lo que acaba de salir.
    .replace(/&amp;/g, '&');
}

/**
 * El texto de la primera aparición de un elemento, sin importar el prefijo de
 * espacio de nombres. El archivo real no usa prefijos, pero un
 * `ElementTree.tostring` sí, y las pruebas se apoyan en eso.
 */
function texto(trozo: string, elemento: string): string | null {
  const m = trozo.match(
    new RegExp(`<(?:\\w+:)?${elemento}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${elemento}>`),
  );
  return m ? desescapar(m[1].trim()) || null : null;
}

/** Todas las apariciones del texto de un elemento. */
function textos(trozo: string, elemento: string): string[] {
  const re = new RegExp(
    `<(?:\\w+:)?${elemento}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${elemento}>`,
    'g',
  );
  const salida: string[] = [];
  for (const m of trozo.matchAll(re)) {
    const v = desescapar(m[1].trim());
    if (v) salida.push(v);
  }
  return salida;
}

/** El contenido del primer bloque `<elemento>…</elemento>`, o cadena vacía. */
function bloque(trozo: string, elemento: string): string {
  const m = trozo.match(
    new RegExp(`<(?:\\w+:)?${elemento}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${elemento}>`),
  );
  return m ? m[1] : '';
}

/**
 * Recorre el documento entregando el texto de cada `<entity …>…</entity>`.
 *
 * Generador a propósito: quien consume decide si acumula o va insertando por
 * lotes, y con 19,365 entidades esa diferencia es la que hace que quepa.
 */
export function* entidades(xml: string): Generator<string> {
  const APERTURA = /<(?:\w+:)?entity\s[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = APERTURA.exec(xml)) !== null) {
    // El cierre correspondiente. Las entidades no se anidan en este esquema,
    // así que el primer cierre que aparece es el de esta entidad.
    const desde = m.index;
    const cierre = xml.indexOf('</', APERTURA.lastIndex);
    const fin = xml.indexOf('>', xml.indexOf('entity>', cierre));
    if (fin === -1) return;
    yield xml.slice(desde, fin + 1);
    APERTURA.lastIndex = fin;
  }
}

/** «2026-07-27T00:00:00» → 2026-07-27 */
function soloFecha(t: string | null): string | null {
  if (!t) return null;
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Extrae un registro de un trozo `<entity>`. Null si no es interpretable. */
export function leerEntidad(trozo: string): RegistroOfac | { error: string; id: string } {
  const mId = trozo.match(/<(?:\w+:)?entity\s[^>]*\bid="([^"]+)"/);
  const id = mId ? mId[1] : '';
  if (!id) return { error: 'La entidad no trae id, que es su identificador estable.', id: '(sin id)' };

  const crudo = texto(bloque(trozo, 'generalInfo'), 'entityType');
  const tipoEntidad = crudo ? TIPO[crudo] : undefined;
  if (!tipoEntidad) {
    return {
      error: `Tipo de entidad desconocido: "${crudo ?? 'ausente'}". Si OFAC agregó uno, hay que darlo de alta antes de ingerir.`,
      id,
    };
  }

  // --- Nombres -------------------------------------------------------
  // El primario es el `<name>` con isPrimary true; dentro de él, la
  // traducción con isPrimary true es la forma canónica. El resto de
  // traducciones son transliteraciones y valen como alias.
  const bloqueNombres = bloque(trozo, 'names');
  const partes = bloqueNombres.split(/<(?:\w+:)?name\s/).slice(1);

  let nombre: string | null = null;
  const alternos = new Set<string>();

  for (const parte of partes) {
    const esPrimario = /<(?:\w+:)?isPrimary>true<\/(?:\w+:)?isPrimary>/.test(
      parte.slice(0, parte.indexOf('<translations') === -1 ? parte.length : parte.indexOf('<translations')),
    );
    const completos = textos(parte, 'formattedFullName');
    if (completos.length === 0) continue;
    if (esPrimario && nombre === null) {
      nombre = completos[0];
      for (const otro of completos.slice(1)) alternos.add(otro);
    } else {
      for (const otro of completos) alternos.add(otro);
    }
  }

  if (!nombre) {
    return { error: 'Sin nombre primario con formattedFullName.', id };
  }
  alternos.delete(nombre);

  // --- Listas y programas --------------------------------------------
  const listas = textos(bloque(trozo, 'sanctionsLists'), 'sanctionsList');
  const programas = textos(bloque(trozo, 'sanctionsPrograms'), 'sanctionsProgram');
  const tiposSancion = textos(bloque(trozo, 'sanctionsTypes'), 'sanctionsType');

  // La publicación más reciente entre sus listas. Es el dato de la FUENTE.
  const fechas = [...bloque(trozo, 'sanctionsLists').matchAll(/datePublished="([^"]+)"/g)]
    .map((m) => soloFecha(m[1]))
    .filter((x): x is string => x !== null)
    .sort();
  const publicadoEn = fechas.length ? fechas[fechas.length - 1] : null;

  // --- País y fecha de nacimiento ------------------------------------
  const pais = texto(bloque(trozo, 'addresses'), 'country');

  // Se toma `value`, que es lo que OFAC publica, y NO `fromDateBegin`.
  //
  // Parece un detalle y no lo es: cuando la fuente sólo sabe el año, `value`
  // dice «1955» y `fromDateBegin` dice «1955-01-01». Guardar lo segundo
  // afirmaría un día que nadie determinó, y en un cotejo de homónimos esa
  // precisión falsa es justo la que llevaría a descartar a la persona
  // equivocada. Se conserva como texto porque es para que lo lea una persona,
  // no para hacer aritmética con él.
  let fechaNacimiento: string | null = null;
  const bloqueRasgos = bloque(trozo, 'features');
  for (const rasgo of bloqueRasgos.split(/<(?:\w+:)?feature\s/).slice(1)) {
    if (!/>Birthdate</.test(rasgo)) continue;
    fechaNacimiento = texto(rasgo, 'value') ?? texto(rasgo, 'fromDateBegin');
    break;
  }

  return {
    identificadorFuente: id,
    tipoEntidad,
    nombre,
    nombresAlternos: [...alternos],
    pais,
    programas,
    listas,
    tiposSancion,
    publicadoEn,
    fechaNacimiento,
  };
}

/**
 * Lee un archivo ENHANCED completo.
 *
 * Acumula en memoria, así que sirve para la Consolidada (481 entidades) y para
 * las pruebas. Para la SDN, que son 19,365, use `entidades()` + `leerEntidad()`
 * e inserte por lotes sin acumular.
 */
export function leerOfac(xml: string): ResultadoOfac {
  const cabecera = xml.slice(0, Math.min(xml.length, 20000));
  const fechaActualizacion = soloFecha(texto(bloque(cabecera, 'publicationInfo'), 'dataAsOf'));
  const listasDelArchivo = textos(bloque(cabecera, 'filters'), 'sanctionsList');

  if (!/<(?:\w+:)?sanctionsData[\s>]/.test(cabecera)) {
    throw new Error(
      'Esto no parece un archivo ENHANCED de OFAC: falta el elemento raíz `sanctionsData`. ' +
        'Si el archivo dice `Sanctions` en la raíz, es el ADVANCED y este lector no lo interpreta.',
    );
  }

  const registros: RegistroOfac[] = [];
  const descartadas: ResultadoOfac['descartadas'] = [];

  for (const trozo of entidades(xml)) {
    const r = leerEntidad(trozo);
    if ('error' in r) descartadas.push({ identificador: r.id, motivo: r.error });
    else registros.push(r);
  }

  return { fechaActualizacion, listasDelArchivo, registros, descartadas };
}

/**
 * Traduce lo que lee este módulo a lo que espera el camino de carga.
 *
 * Va aquí y no en la capa de API porque es conocimiento de OFAC: qué campo de
 * la fuente es la llave estable, qué es alias, y qué se guarda como dato
 * adicional en vez de como columna.
 */
export function registrosParaCarga(registros: RegistroOfac[]) {
  return registros.map((r) => ({
    nombre: r.nombre,
    // OFAC no publica RFC: es un registro de sanciones, no fiscal.
    rfc: null,
    tipo_entidad: r.tipoEntidad,
    pais: r.pais,
    identificador_fuente: r.identificadorFuente,
    nombres_alternos: r.nombresAlternos,
    // OFAC marca `isLowQuality` por nombre, pero este lector todavía no lo
    // separa: hasta que lo haga, ninguno viaja como débil. Declararlo vacío es
    // más honesto que meter los buenos y los dudosos en el mismo saco.
    nombres_alternos_debiles: [] as string[],
    // Lo que no tiene columna y sí tiene valor para el expediente.
    identificadores: {
      programas: r.programas,
      listas: r.listas,
      tipos_sancion: r.tiposSancion,
      publicado_en: r.publicadoEn,
      fecha_nacimiento: r.fechaNacimiento,
    },
  }));
}
