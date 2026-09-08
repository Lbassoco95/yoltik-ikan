/**
 * Verificación de identidad con Didit: lo que decide si una entrega es
 * auténtica.
 *
 * Se separa de la Edge Function para poder probarlo. Un webhook mal verificado
 * no falla ruidosamente: acepta cualquier cosa que le manden, y aquí lo que le
 * mandan es «este compareciente quedó aprobado».
 */

/** Estados que Didit manda, literales y sensibles a mayúsculas. */
export type EstadoDidit =
  | "Not Started"
  | "In Progress"
  | "Awaiting User"
  | "In Review"
  | "Approved"
  | "Declined"
  | "Resubmitted"
  | "Abandoned"
  | "Expired"
  | "Kyc Expired";

/** El enum de la migration 0032. */
export type EstadoIkan =
  | "no_iniciada"
  | "en_progreso"
  | "en_revision"
  | "aprobada"
  | "rechazada"
  | "reenviada"
  | "abandonada"
  | "expirada"
  | "error";

/**
 * Traduce el estado de Didit al nuestro.
 *
 * Un estado que no reconocemos NO cae a 'error' ni a 'aprobada': se queda en
 * 'en_progreso', que es la lectura conservadora. Si Didit añade un estado
 * mañana, lo peor que pasa es que una verificación se vea pendiente de más;
 * lo contrario sería darla por buena sin saber qué dijo.
 */
export function estadoDeDidit(s: string): EstadoIkan {
  switch (s) {
    case "Approved":
      return "aprobada";
    case "Declined":
      return "rechazada";
    case "In Review":
      return "en_revision";
    case "Resubmitted":
      return "reenviada";
    case "Abandoned":
      return "abandonada";
    case "Expired":
    case "Kyc Expired":
      return "expirada";
    case "Not Started":
      return "no_iniciada";
    case "In Progress":
    case "Awaiting User":
      return "en_progreso";
    default:
      return "en_progreso";
  }
}

/**
 * Los estados que sabemos leer.
 *
 * Existe porque `estadoDeDidit` colapsa lo desconocido en `en_progreso`, que es
 * el default seguro para recibir un aviso —nunca convierte algo raro en
 * «aprobada»— pero es peligroso para CORREGIR: la conciliación compara el
 * estado del proveedor con el nuestro, y si el proveedor devolviera mañana un
 * estado nuevo, «desconocido» se leería como una divergencia y degradaría una
 * verificación aprobada a en_progreso. Antes de corregir hay que saber que se
 * entendió lo que llegó.
 */
export const ESTADOS_CONOCIDOS: ReadonlySet<string> = new Set([
  "Approved",
  "Declined",
  "In Review",
  "Resubmitted",
  "Abandoned",
  "Expired",
  "Kyc Expired",
  "Not Started",
  "In Progress",
  "Awaiting User",
]);

/** Un estado es final cuando ya no va a cambiar solo. */
export function esFinal(e: EstadoIkan): boolean {
  return (
    e === "aprobada" ||
    e === "rechazada" ||
    e === "expirada" ||
    e === "abandonada"
  );
}

/**
 * Enteros que viajan como flotantes (1.0) vuelven a entero.
 *
 * En JavaScript esto NO hace nada, y es correcto que no haga nada: `JSON.parse`
 * ya convierte `1.0` en `1`, y `Number.isInteger(1.0)` es `true`. El paso
 * existe porque el canónico de Didit se define sobre Python, donde `1.0` es un
 * float distinto de `1`.
 *
 * Se deja escrito en vez de omitirlo para que quien lea el canónico lo
 * encuentre donde el contrato dice que está, y para que nadie lo «arregle»
 * pensando que falta.
 */
export function acortarFlotantes(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(acortarFlotantes);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [
        k,
        acortarFlotantes(x),
      ]),
    );
  }
  if (typeof v === "number" && !Number.isInteger(v) && v % 1 === 0)
    return Math.trunc(v);
  return v;
}

/** Claves ordenadas alfabéticamente, en profundidad. El orden de los arreglos
 *  se respeta: ahí la posición es significativa. */
export function ordenarClaves(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenarClaves);
  if (v && typeof v === "object") {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = ordenarClaves((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

/** El texto exacto sobre el que Didit calcula la firma. */
export function canonico(cuerpoCrudo: string): string {
  return JSON.stringify(
    ordenarClaves(acortarFlotantes(JSON.parse(cuerpoCrudo))),
  );
}

/** Comparación en tiempo constante. Con `===` sobre cadenas, el tiempo de
 *  respuesta filtra cuántos caracteres iniciales acertó quien prueba. */
export function igualEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function hmacHex(secreto: string, texto: string): Promise<string> {
  const cripto = globalThis.crypto;
  const llave = await cripto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await cripto.subtle.sign(
    "HMAC",
    llave,
    new TextEncoder().encode(texto),
  );
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface ResultadoVerificacion {
  ok: boolean;
  /** Por qué NO es válida. Se distingue el motivo para poder registrarlo: una
   *  firma mala y una entrega vieja son incidentes distintos. */
  motivo?:
    | "sin_firma"
    | "sin_fecha"
    | "caducada"
    | "firma_invalida"
    | "cuerpo_ilegible";
}

/** Ventana de frescura, en segundos. La fija Didit. */
export const VENTANA_SEGUNDOS = 300;

/**
 * Comprueba que la entrega viene de Didit y es reciente.
 *
 * El orden importa: primero la frescura, que es barata, y después el HMAC. Y la
 * frescura va en valor absoluto a propósito — una marca de tiempo en el futuro
 * es tan sospechosa como una vieja.
 */
export async function verificarWebhook(
  cuerpoCrudo: string,
  firma: string | null,
  marcaTiempo: string | null,
  secreto: string,
  ahoraSegundos: number = Date.now() / 1000,
): Promise<ResultadoVerificacion> {
  if (!firma) return { ok: false, motivo: "sin_firma" };

  const ts = Number(marcaTiempo);
  if (!marcaTiempo || !Number.isFinite(ts))
    return { ok: false, motivo: "sin_fecha" };
  if (Math.abs(ahoraSegundos - ts) > VENTANA_SEGUNDOS)
    return { ok: false, motivo: "caducada" };

  let texto: string;
  try {
    texto = canonico(cuerpoCrudo);
  } catch {
    return { ok: false, motivo: "cuerpo_ilegible" };
  }

  const esperada = await hmacHex(secreto, texto);
  return igualEnTiempoConstante(esperada, firma)
    ? { ok: true }
    : { ok: false, motivo: "firma_invalida" };
}

/**
 * Extrae de la decisión de Didit lo que sí guardamos.
 *
 * Deliberadamente corto. La decisión completa trae fotografía del documento,
 * imagen de referencia de la prueba de vida y, en flujos activos, vídeo. Eso es
 * biometría, y copiarla a nuestra base multiplica dónde vive sin que nadie lo
 * haya pedido — más aún con la conservación a diez años de la fracción XII.
 *
 * Lo que queda es lo que permite operar y demostrar que la verificación
 * ocurrió. Las imágenes se consultan en Didit, que es donde el compareciente
 * consintió que estuvieran.
 */
export function resumirDecision(decision: unknown): Record<string, unknown> {
  if (!decision || typeof decision !== "object") return {};
  const d = decision as Record<string, unknown>;

  /** El primer nodo de un arreglo de módulo, o null. En V3 cada módulo puede
   *  correr varias veces sobre nodos distintos del grafo; para el resumen basta
   *  el primero, y si algún día hacen falta todos se indexa por `node_id`. */
  const primero = (arr: unknown): Record<string, unknown> | null =>
    Array.isArray(arr) && arr.length > 0 && arr[0] && typeof arr[0] === "object"
      ? (arr[0] as Record<string, unknown>)
      : null;

  const id = primero(d.id_verifications);
  const vida = primero(d.liveness_checks);
  const cara = primero(d.face_matches);
  const aml = primero(d.aml_screenings);
  const canal = primero(d.ip_analyses);
  const base = primero(d.database_validations);

  const resumen: Record<string, unknown> = {};

  /**
   * Versión del resumen.
   *
   * Existe para que la conciliación sepa cuándo lo que tiene guardado lo
   * escribió una versión anterior de este código y hay que rehacerlo. Sin
   * marca, una verificación resuelta antes de que entrara un módulo se queda
   * sin él para siempre: la conciliación la ve aprobada, con sus artefactos
   * completos, y se la salta.
   *   1 · documento, prueba de vida, cotejo facial, listas
   *   2 · + señales de canal (VPN, centro de datos, divergencia)
   *   3 · + qué módulos corrieron y cuáles NO, con el motivo del proveedor
   *   4 · + resultado de la validación contra bases oficiales (CURP, INE)
   */
  resumen.version = 4;

  /**
   * Qué corrió y qué no.
   *
   * Esto es lo que faltaba, y no es un detalle de presentación. El resumen se
   * escribía con la regla «lo que no venga, no se pinta» —correcta contra
   * inventarse resultados— pero tenía un punto ciego: cuando un módulo NO
   * corre, la pantalla se queda callada, y el Oficial de Cumplimiento no puede
   * distinguir «se consultaron las listas y no hubo coincidencias» de «las
   * listas no se consultaron». En cumplimiento esas dos cosas son opuestas, y
   * la segunda disfrazada de la primera es exactamente la afirmación que no se
   * puede sostener frente a una visita de verificación.
   *
   * Didit dice las dos cosas y no las estábamos leyendo: `features` trae los
   * módulos que realmente se ejecutaron en la sesión, y los campos
   * `*_not_performed_reason` traen el porqué del que no —con código, mensaje y
   * qué servicios estaban configurados—.
   */
  resumen.modulos_ejecutados = Array.isArray(d.features)
    ? d.features.filter((f): f is string => typeof f === "string")
    : null;

  const motivoBase = d.database_validation_not_performed_reason;
  if (motivoBase && typeof motivoBase === "object") {
    const m = motivoBase as Record<string, unknown>;
    resumen.validacion_base_no_corrio = {
      codigo: typeof m.code === "string" ? m.code : null,
      mensaje: typeof m.message === "string" ? m.message : null,
      // Qué habría consultado: en México, CURP contra RENAPO y validez de la
      // credencial del INE. Enseñarlo convierte «no corrió» en «no corrió
      // ESTO», que es lo que alguien necesita para decidir si le importa.
      servicios: Array.isArray(m.configured_services)
        ? m.configured_services.filter((x): x is string => typeof x === "string")
        : null,
    };
  }

  if (id) {
    resumen.documento = {
      tipo: id.document_type ?? null,
      pais: id.issuing_state ?? null,
      nombre_leido:
        [id.first_name, id.last_name].filter(Boolean).join(" ") || null,
      // El número del documento NO se guarda: identifica por sí solo y ya está
      // en Didit. Si Kawiil-Cumplimiento lo pide para el expediente, se añade.
      vence: id.expiration_date ?? null,
      avisos: Array.isArray(id.warnings) ? id.warnings.length : 0,
    };
  }
  if (vida)
    resumen.prueba_de_vida = {
      estado: vida.status ?? null,
      puntaje: vida.score ?? null,
    };
  if (cara)
    resumen.cotejo_facial = {
      estado: cara.status ?? null,
      puntaje: cara.score ?? null,
    };
  if (aml) {
    resumen.listas = {
      estado: aml.status ?? null,
      coincidencias: aml.total_hits ?? 0,
      // El puntaje de riesgo del barrido. Es una cifra sobre NUESTRO cliente
      // —cuánto se parece a lo que hay en los acervos—, no sobre el tercero
      // con el que coincidió, así que sí se guarda. Sin él, «56 coincidencias»
      // se lee igual con un parecido del 40 % que del 92 %.
      puntaje: typeof aml.score === "number" ? aml.score : null,
      // QUÉ TIPO de coincidencia, no con quién.
      //
      // La distinción es la que separa un dato del expediente de un dato de un
      // tercero. «Hubo una coincidencia de tipo PEP» dice algo sobre NUESTRO
      // cliente y el expediente lo necesita; «coincidió con Fulano de Tal,
      // nacido en tal fecha» es información de otra persona y se queda en el
      // proveedor.
      //
      // Sin este campo, una coincidencia de sanción y una de persona
      // políticamente expuesta se veían iguales, y son cosas muy distintas: la
      // primera puede impedir operar y la segunda pide diligencia reforzada.
      categorias: categoriasDeCoincidencias(aml),
    };
  }
  /**
   * La validación contra bases oficiales. En México: la CURP contra RENAPO y
   * la vigencia de la credencial del INE.
   *
   * Es la pieza que separa «este documento parece auténtico y la cara coincide»
   * de «esta persona existe en el registro nacional con estos datos». Un INE
   * bien falsificado pasa lo primero; lo segundo no.
   *
   * Los dos campos y sus valores están comprobados contra el contrato de Didit
   * (`database_validation.status` y `.match_type`), no supuestos: es la misma
   * lección que dejó el AML, donde cinco nombres de campo inventados tiraban
   * la clasificación entera.
   */
  if (base) {
    resumen.validacion_base = {
      // Approved · Declined · In Review · Not Finished
      estado: typeof base.status === "string" ? base.status : null,
      // full_match · partial_match · no_match. La coincidencia parcial es la
      // que importa: algunos campos casan y otros no, y eso NO es un fallo del
      // sistema —es una discrepancia entre lo que dice el documento y lo que
      // dice el registro, y la mira una persona.
      coincidencia: typeof base.match_type === "string" ? base.match_type : null,
    };
  }

  if (canal) {
    /**
     * Señales de canal, con el recorte de la Adenda 5 y la Adenda 6 §5:
     * PAÍS Y BANDERAS DE RED SÍ; DIRECCIÓN COMPLETA Y COORDENADAS NO.
     *
     * La decisión trae `latitude`, `longitude` e `ip_address`, y también la
     * dirección del documento con sus coordenadas. Nada de eso se copia. No es
     * una omisión: es que la geolocalización por red NO es el domicilio del
     * cliente ni el lugar del acto —es evidencia sobre el canal por el que se
     * conectó—, y rotularla como ubicación del cliente llevaría a un analista a
     * concluir de más. En fe pública la ubicación jurídicamente relevante es la
     * del inmueble y la del domicilio declarado.
     *
     * Lo que sí se guarda es la DIVERGENCIA, que es donde está la señal: Didit
     * calcula la distancia entre la procedencia de la sesión y la del documento
     * de identidad. Que coincidan no dice gran cosa; que no coincidan es una
     * señal barata y limpia. Y es un escalar derivado, no un punto en el mapa.
     */
    const dist = (
      nodo: unknown,
      llave: string,
    ): Record<string, unknown> | null => {
      if (!nodo || typeof nodo !== "object") return null;
      const v = (nodo as Record<string, unknown>)[llave];
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    };
    const contraDocumento = dist(canal.ip, "distance_from_id_document");
    const contraComprobante = dist(canal.ip, "distance_from_poa_document");

    resumen.canal = {
      pais: canal.ip_country ?? null,
      pais_iso2: canal.ip_country_code ?? null,
      // Las tres banderas de red. `null` cuando el módulo no las devolvió, que
      // NO es lo mismo que `false`: «no se detectó VPN» y «no se miró» son
      // afirmaciones distintas y sólo una se puede sostener.
      vpn_o_tor:
        typeof canal.is_vpn_or_tor === "boolean" ? canal.is_vpn_or_tor : null,
      centro_de_datos:
        typeof canal.is_data_center === "boolean" ? canal.is_data_center : null,
      divergencia_documento_km:
        typeof contraDocumento?.distance === "number"
          ? contraDocumento.distance
          : null,
      divergencia_documento_rumbo:
        typeof contraDocumento?.direction === "string"
          ? contraDocumento.direction
          : null,
      divergencia_comprobante_km:
        typeof contraComprobante?.distance === "number"
          ? contraComprobante.distance
          : null,
    };
  }

  return resumen;
}

/**
 * Las categorías de las coincidencias de listas, normalizadas.
 *
 * Se lee a la defensiva: la forma exacta del payload de Didit puede cambiar y
 * no está fijada por contrato con nosotros. Lo que NO se hace es adivinar: si
 * hay coincidencias y ninguna trae categoría reconocible, se devuelve
 * `['sin_clasificar']` en vez de suponer que no eran PEP.
 *
 * Suponer ahí sería lo peor: convertiría una coincidencia sin revisar en un
 * «no es PEP» silencioso, que es justo lo que una visita de verificación
 * desarma primero.
 */
export function categoriasDeCoincidencias(
  aml: Record<string, unknown>,
): string[] {
  const total = Number(aml.total_hits ?? 0);
  if (!Number.isFinite(total) || total <= 0) return [];

  // Los sitios donde Didit ha puesto las coincidencias, en orden de preferencia.
  const posibles = [aml.hits, aml.matches, aml.results, aml.screening_results];
  const lista = posibles.find((x) => Array.isArray(x) && x.length > 0) as
    | Record<string, unknown>[]
    | undefined;

  if (!lista) return ["sin_clasificar"];

  const fuera = new Set<string>();
  for (const hit of lista) {
    if (!hit || typeof hit !== "object") continue;
    /**
     * De dónde sale la categoría, comprobado contra un barrido real.
     *
     * Los cinco campos que se miraban antes —`category`, `type`, `list_type`,
     * `match_type`, `categories`— NO existen en la respuesta de Didit. Se
     * escribieron a la defensiva, sin una carga real delante, y el resultado
     * era que TODA coincidencia caía en «sin clasificar»: en el barrido de
     * prueba, las 56. Falla del lado seguro —lo sin clasificar escala a la
     * célula— pero tira la clasificación que sí venía, y un expediente que
     * dice «56 coincidencias sin clasificar» donde había 26 de sanciones y 28
     * de PPE obliga a repetir a mano un trabajo ya hecho.
     *
     * Los dos sitios donde Didit sí la pone:
     *   · `datasets` — los acervos que casaron: «Sanctions», «PEP»,
     *     «PEP Level 1..4», «Warnings and Regulatory Enforcement», SIE, SIP.
     *   · la PRESENCIA de `sanction_matches`, `pep_matches`,
     *     `adverse_media_matches` y `warning_matches`, cada uno con su
     *     detalle. Del detalle no se toma nada —es información del tercero con
     *     el que se coincidió— pero que el arreglo venga con algo dentro ya
     *     dice de qué tipo fue la coincidencia, y eso es de nuestro cliente.
     *
     * Se dejan los cinco nombres viejos: no cuestan nada y cubren que Didit
     * cambie de forma otra vez.
     */
    const porArreglo: string[] = [];
    for (const [llave, categoria] of [
      ["sanction_matches", "sancion"],
      ["pep_matches", "pep"],
      ["adverse_media_matches", "nota_adversa"],
      ["warning_matches", "lista_de_atencion"],
    ] as const) {
      const v = hit[llave];
      if (Array.isArray(v) && v.length > 0) porArreglo.push(categoria);
    }

    const crudo = [
      hit.datasets,
      hit.category,
      hit.type,
      hit.list_type,
      hit.match_type,
      hit.categories,
    ]
      .flat()
      .filter((x): x is string => typeof x === "string")
      .map(normalizarCategoria)
      .concat(porArreglo);

    if (crudo.length === 0) {
      fuera.add("sin_clasificar");
      continue;
    }
    // Un acervo que no reconocemos —SIE, SIP— cae en «sin clasificar», y eso
    // se queda al lado de las categorías que sí: que 26 coincidencias sean de
    // sanciones no vuelve benignas las que no supimos leer.
    for (const c of crudo) fuera.add(c);
  }
  return fuera.size > 0 ? [...fuera].sort() : ["sin_clasificar"];
}

/**
 * Categoría del proveedor a la nuestra.
 *
 * Deliberadamente conservador: lo que no se reconoce cae en 'sin_clasificar' y
 * no en 'otro', porque las dos cosas se tratan distinto —lo sin clasificar
 * escala a la célula de cumplimiento, lo demás no—.
 */
function normalizarCategoria(crudo: string): string {
  const c = crudo.toLowerCase();
  if (c.includes("pep") || c.includes("political")) return "pep";
  if (c.includes("sanction") || c.includes("sancion")) return "sancion";
  if (c.includes("adverse") || c.includes("media")) return "nota_adversa";
  if (c.includes("warning") || c.includes("watch")) return "lista_de_atencion";
  return "sin_clasificar";
}
