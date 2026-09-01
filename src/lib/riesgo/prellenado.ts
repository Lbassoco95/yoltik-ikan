import type { MatrizConfig, MatrizVariable, TipoPersona } from '@/types/domain';
import { variablesAplicables, respuestaValida, type CatalogosDisponibles } from './matriz';
import { magnitudDeOperacion } from './tramos';
import { riesgoDeActividad } from './actividad';
import { riesgoPaisMaximo, claveDeNivel, type PaisCapturado } from './pais';
import { riesgoDeZona, type ZonaAtencion } from './zona';
import { riesgoDeCanal, riesgoDeFrecuencia } from './perfil-transaccional';

/**
 * Lo que la matriz puede responderse sola con lo que ya está capturado.
 *
 * ---------------------------------------------------------------------
 * La regla que gobierna este módulo
 * ---------------------------------------------------------------------
 * Sólo responde lo que se DERIVA de un dato registrado, con una fuente que se
 * puede nombrar. Nunca estima, nunca elige "la opción media" porque falte el
 * dato, nunca supone.
 *
 * La tentación es evidente: si la matriz tiene ocho variables y sólo tres se
 * pueden derivar, dejar cinco vacías se ve peor que rellenarlas con algo
 * razonable. Pero una clasificación de riesgo es un dictamen que el sujeto
 * obligado presenta ante la autoridad, y que la mitad salga de una suposición
 * del software la vuelve indefendible entera. Prefiere quedarse corto.
 *
 * Por eso cada respuesta trae `fuente`: el OC ve de dónde salió y puede
 * cambiarla. Lo que el sistema no puede saber se queda sin responder y se dice.
 *
 * ---------------------------------------------------------------------
 * Lo que HOY no se puede derivar, y por qué
 * ---------------------------------------------------------------------
 *   Valor de la operación, SÓLO en la matriz v1
 *     Sus tramos son 645 y 3,210 UMA: umbrales de activos virtuales del régimen
 *     anterior a la reforma, en una matriz de fe pública. Responderlos sería
 *     clasificar contra cifras derogadas de otra fracción. En la v2 (migration
 *     0037) la variable mide proporción del umbral del acto y sí se responde.
 *
 * La actividad y el giro SÍ se responden desde la Adenda 1: su apartado 3 fija
 * la regla de asignación. Y se responden SIEMPRE, incluso cuando la clave no
 * está en la tabla, porque dejarlas en blanco sumaría cero y cero es más bajo
 * que la actividad más inocua. Esas van marcadas `por_defecto`.
 *
 *   Condición de PEP, mientras la coincidencia no esté RESUELTA
 *     El campo existe desde la migration 0038, y una determinación de la célula
 *     sí se responde —`no_pep` incluido, que es una determinación y no una
 *     ausencia—. Lo que no se traduce a ninguna opción es una coincidencia del
 *     screening que nadie ha revisado: las RCG reservan al sujeto obligado la
 *     determinación del nivel.
 *
 *   Beneficiario controlador identificado
 *     El módulo de estructura societaria no existe todavía.
 *
 *   Zona geográfica nacional, mientras la lista interna esté VACÍA
 *     La determinación de qué zonas son de atención es de Cumplimiento. Con la
 *     lista vacía la variable no se responde y tampoco puntúa: ver `zona.ts`.
 *
 *   Canal de distribución, si no se capturó
 *     No se deduce de que exista una verificación de Didit. Se puede verificar a
 *     distancia a alguien que vino a la notaría, y suponerlo al revés
 *     convertiría un dato administrativo en una calificación de riesgo.
 *
 * La forma de pago y el país de origen de los recursos SÍ se derivan desde la
 * migration 0036, que los añadió a la captura del acto. Antes no era que no se
 * dedujeran: es que el dato no existía y el OC los contestaba de memoria.
 *
 * Del país de origen conviene decir lo que NO se hace: no se deriva de la
 * residencia del compareciente. Dónde vive alguien y de dónde salió el dinero
 * son cosas distintas, y confundirlas es exactamente lo que esa variable existe
 * para detectar. Desde la matriz v3 (migration 0042) los tres países
 * —nacionalidad, residencia o constitución, y origen de los recursos— alimentan
 * UNA sola variable que toma el más alto: siguen siendo tres datos distintos, y
 * la divergencia entre ellos es precisamente la señal.
 *
 * Módulo puro: sin red, sin React. Se prueba solo.
 */

export interface RespuestaSugerida {
  variable_codigo: string;
  valor: number;
  /** La opción que se eligió, con su texto. Para que el OC vea qué se contestó. */
  etiqueta: string;
  /** De dónde salió, en español y sin jerga. Es lo que hace revisable la sugerencia. */
  fuente: string;
  /**
   * La respuesta salió de un VALOR POR DEFECTO, no de un dato del expediente.
   *
   * Hoy sólo la actividad económica: cuando la clave no está en la tabla de
   * riesgo, se responde «medio» porque dejarla en blanco sería peor. Pero eso
   * no es lo mismo que haberlo determinado, y la pantalla tiene que poder
   * distinguirlo: una respuesta por omisión que se ve igual que una derivada
   * es una respuesta que nadie va a ir a revisar.
   */
  por_defecto?: boolean;
}

/** Lo que el sistema conoce del compareciente y del acto al pre-llenar. */
export interface ContextoPrellenado {
  tipo_persona: TipoPersona;
  /** ISO2 de residencia (persona física) o de constitución (persona moral). */
  pais_iso2?: string | null;
  /** Tipo de acto del layout, cuando el pre-llenado se hace desde un acto. */
  tipo_acto?: string | null;
  /** Moneda de la operación. 'MXN' o el código de la divisa. */
  moneda_origen?: string | null;
  /** Activo virtual involucrado, si lo hay. */
  activo_virtual?: string | null;
  /** Cómo se liquidó el acto (migration 0036): bancarizado, mixto o efectivo. */
  forma_pago?: string | null;
  /** ISO2 del país de donde vienen los recursos (migration 0036). */
  pais_origen_recursos?: string | null;
  /** Clave del catálogo de la UIF: actividad económica en persona física,
   *  giro mercantil en persona moral. */
  actividad_clave?: string | null;
  /** Condición de PPE resuelta (migration 0038). Nulo o sin resolver = la
   *  variable no se responde: ver abajo. */
  condicion_pep?: string | null;
  /** Valor del acto en UMA, ya convertido con la UMA de SU fecha. */
  monto_uma?: number | null;
  /** El umbral de Aviso del acto, en UMA. Null cuando el Aviso procede siempre:
   *  no es «no sé», es que no hay proporción que calcular. */
  umbral_uma?: number | null;
  /** Países en listas GAFI, del snapshot que ya usa el Motor PLD. */
  gafi_gris?: Set<string>;
  gafi_negra?: Set<string>;
  /**
   * El snapshot TERMINÓ de cargar.
   *
   * Sin esta bandera, una consulta todavía en vuelo se veía igual que un
   * snapshot en el que el país no aparece: `nivelDePais` no lo encontraba en
   * ninguna lista y respondía «sin observaciones». Irán salía como jurisdicción
   * limpia, el valor quedaba escrito, y como el pre-llenado no pisa lo ya
   * respondido, se quedaba así aunque después llegaran las listas.
   *
   * `false` o ausente = la variable de país NO se responde. No saber de dónde
   * es alguien y saber que su país está limpio son cosas distintas, y la
   * diferencia entre las dos es justo lo que esta variable existe para ver.
   */
  listas_cargadas?: boolean;
  /** Plenario del GAFI del snapshot (migration 0041). Viaja a la explicación
   *  para que se pueda reconstruir contra qué versión se calificó. */
  plenario_gafi?: string | null;

  // --- Adenda 1, instrucciones 6, 7 y 10 (matriz v3) ------------------
  /** ISO2 de la nacionalidad del compareciente. Distinta de la residencia:
   *  la divergencia entre las dos es precisamente la señal. */
  pais_nacionalidad?: string | null;
  /** Cómo llegó el cliente (migration 0041). */
  canal_distribucion?: string | null;
  /** Lista interna de zonas de atención. Vacía = la variable no se responde. */
  zonas_atencion?: ZonaAtencion[];
  entidad_cliente?: string | null;
  municipio_cliente?: string | null;
  entidad_inmueble?: string | null;
  municipio_inmueble?: string | null;
  /** Operaciones al año que el cliente declaró esperar (Cap. III Ter). */
  frecuencia_esperada_anual?: number | null;
  /** Operaciones observadas en la ventana móvil de seis meses del art. 7. */
  operaciones_en_ventana?: number;
  /**
   * El compareciente tiene al menos un acto registrado.
   *
   * Se pasa explícito en vez de deducirlo de que falten `tipo_acto`, `monto_uma`
   * y compañía: «no hay actos» y «hay un acto al que le faltan datos» son cosas
   * distintas, y la pantalla tiene que poder decir cuál de las dos es. Sin esto,
   * cuatro variables aparecían vacías sin explicación y el OC no tenía forma de
   * saber si le faltaba capturar algo o si simplemente no había nada que
   * derivar.
   */
  hay_actos?: boolean;
  /**
   * Margen del perfil transaccional, del parámetro firmado
   * `margen_perfil_transaccional_operaciones` (migration 0044).
   *
   * Sin él la variable de frecuencia NO se responde. No hay valor por defecto y
   * es deliberado: un default en el código sería otra vez una tolerancia
   * escondida, que es lo que la instrucción 12 de la Adenda mandó retirar.
   */
  margen_perfil?: number | null;
}

/**
 * Los cuatro tipos de acto que la matriz nombra, con su etiqueta oficial.
 *
 * La matriz se escribió con los nombres anteriores a la migration 0031
 * —«Compraventa de inmueble», «Constitución de sociedad»— y el catálogo del
 * layout usa otros. La correspondencia es la misma que aplicó la 0031 sobre las
 * operaciones: no es criterio nuevo, es el mismo acto con su nombre oficial.
 *
 * Los otros SIETE tipos del layout no están en la matriz y por eso no se
 * responden: asignarles un valor de riesgo sería decidir metodología.
 */
const ACTO_EN_MATRIZ: Record<string, string> = {
  transmision_inmueble: 'Compraventa de inmueble',
  constitucion_personas_morales: 'Constitución de sociedad',
  constitucion_modificacion_fideicomiso: 'Fideicomiso',
  otorgamiento_poder: 'Poder irrevocable',
};

/**
 * Cómo se reconoce cada variable dentro de la plantilla.
 *
 * Estaban escritas en línea, cada una en su bloque, y ahora las usan dos
 * funciones: la que pre-llena y la que explica por qué algo no se pudo
 * pre-llenar. Dos copias de un patrón que se compara contra texto en español
 * se desincronizan en cuanto alguien cambia una pregunta de la plantilla, y la
 * copia que quede atrás dejaría de reconocer la variable en silencio.
 */
export const RECONOCE = {
  acto: /tipo de acto/i,
  magnitud: /valor de la operaci/i,
  formaPago: /forma de pago/i,
  monedaAv: /moneda extranjera|activos virtuales/i,
  riesgoPais: /riesgo pa[ií]s/i,
  pep: /condici[oó]n de pep/i,
  actividad: /actividad o profesi/i,
  giro: /giro de la sociedad/i,
  canal: /canal de distribuci/i,
  zona: /zona geogr[aá]fica/i,
  frecuencia: /frecuencia de operaci/i,
  beneficiario: /beneficiario controlador/i,
  // Sólo en las plantillas v1 y v2, que tenían el país desdoblado.
  fondos: /origen de los fondos/i,
  constitucion: /jurisdicci[oó]n de constituci[oó]n/i,
  residencia: /residencia/i,
} as const;

/** Busca la opción cuyo texto empieza igual, sin depender de mayúsculas ni acentos. */
function opcionPorTexto(v: MatrizVariable, texto: string) {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim();
  return v.opciones.find((o) => norm(o.label) === norm(texto));
}

/** Riesgo del país según el snapshot GAFI, en las palabras de la matriz. */
function nivelPais(
  iso2: string,
  ctx: ContextoPrellenado,
): 'nacional' | 'sin_observaciones' | 'gris' | 'negra' {
  const p = iso2.toUpperCase();
  if (p === 'MX') return 'nacional';
  if (ctx.gafi_negra?.has(p)) return 'negra';
  if (ctx.gafi_gris?.has(p)) return 'gris';
  return 'sin_observaciones';
}

/**
 * Elige entre las opciones de una variable de país.
 *
 * Las variables de persona física tienen TRES opciones (nacional / extranjero
 * sin observaciones / extranjero de riesgo) y las de persona moral CUATRO
 * (separa lista gris de lista negra). Con tres, gris y negra caen las dos en
 * «de riesgo»: agrupar hacia arriba es lo correcto cuando la escala no
 * distingue, porque lo contrario sería bajarle el riesgo a un país en lista
 * negra por una limitación del formulario.
 */
function opcionDePais(v: MatrizVariable, nivel: ReturnType<typeof nivelPais>) {
  const cuatro = v.opciones.length >= 4;
  if (nivel === 'nacional') return v.opciones[0];
  if (nivel === 'sin_observaciones') return v.opciones[1];
  // Con tres opciones, gris y negra caen las dos en la última.
  if (nivel === 'gris') return v.opciones[2];
  return cuatro ? v.opciones[3] : v.opciones[2];
}

/**
 * La condición de PPE, en las palabras con que la matriz nombra la opción.
 *
 * `coincidencia_sin_resolver` NO está aquí a propósito: no tiene traducción
 * porque no es una determinación. Mientras la célula no resuelva, la variable
 * se queda sin responder y la pantalla lo dice.
 */
const TEXTO_PEP: Record<string, string> = {
  no_pep: 'No es PEP',
  pep_nacional: 'PEP nacional',
  pep_extranjera: 'PEP federal',
  familiar_o_asociado: 'PEP federal',
};

const FUENTE_PEP: Record<string, string> = {
  no_pep: 'el screening de listas no encontró coincidencias de PPE',
  pep_nacional: 'la célula de cumplimiento resolvió la coincidencia como PPE nacional',
  pep_extranjera:
    'la célula de cumplimiento resolvió la coincidencia como PPE federal o extranjera',
  familiar_o_asociado:
    'la célula resolvió que es cónyuge, familiar hasta segundo grado o asociado cercano de una PPE',
};

/** Lo capturado en el acto, en las palabras con que la matriz nombra la opción. */
const TEXTO_FORMA_PAGO: Record<string, string> = {
  bancarizado: 'Bancarizado',
  mixto: 'Mixto',
  efectivo: 'Efectivo',
};

const TEXTO_PAIS: Record<ReturnType<typeof nivelPais>, string> = {
  nacional: 'el país registrado es México',
  sin_observaciones: 'país extranjero sin observaciones del GAFI',
  gris: 'país en la lista gris del GAFI',
  negra: 'país en la lista negra del GAFI',
};

/**
 * Los países del expediente, con la calidad en que entra cada uno.
 *
 * La residencia y la constitución comparten campo (`pais_iso2`) porque en el
 * modelo de datos son la misma columna leída según la forma jurídica. El rol
 * cambia para que la explicación diga cuál es.
 */
function paisesCapturados(ctx: ContextoPrellenado): PaisCapturado[] {
  return [
    { rol: 'nacionalidad', iso2: ctx.pais_nacionalidad },
    {
      rol: ctx.tipo_persona === 'moral' ? 'constitucion' : 'residencia',
      iso2: ctx.pais_iso2,
    },
    { rol: 'origen_recursos', iso2: ctx.pais_origen_recursos },
  ];
}

/**
 * Las banderas booleanas que la matriz evalúa fuera del puntaje.
 *
 * Hoy sólo una: el llamado a la acción del GAFI. Va aparte de
 * `prellenarMatriz` porque no es una respuesta a una variable —no suma
 * puntos— sino una condición de flujo que fuerza la banda alta.
 */
export function indicadoresDerivados(ctx: ContextoPrellenado): Record<string, boolean> {
  // Con las listas sin cargar, la bandera no se puede afirmar NI negar. Se
  // devuelve false porque es lo único que el tipo admite, pero la variable de
  // país tampoco se responde, así que la matriz no se puede cerrar y nadie
  // guarda una evaluación con el piso apagado por una consulta en vuelo.
  if (ctx.listas_cargadas === false) return { GAFI_LLAMADO_ACCION: false };
  const r = riesgoPaisMaximo(paisesCapturados(ctx), {
    gafi_gris: ctx.gafi_gris,
    gafi_negra: ctx.gafi_negra,
    plenario: ctx.plenario_gafi,
  });
  return { GAFI_LLAMADO_ACCION: r?.llamado_a_la_accion === true };
}

export function prellenarMatriz(
  config: MatrizConfig,
  ctx: ContextoPrellenado,
): RespuestaSugerida[] {
  const variables = variablesAplicables(config, ctx.tipo_persona);
  const porCodigo = new Map(variables.map((v) => [v.codigo, v]));
  const out: RespuestaSugerida[] = [];

  const sugerir = (v: MatrizVariable | undefined, texto: string, fuente: string) => {
    if (!v) return;
    const opcion = opcionPorTexto(v, texto);
    if (!opcion) return;
    out.push({
      variable_codigo: v.codigo,
      valor: opcion.valor,
      etiqueta: opcion.label,
      fuente,
    });
  };

  // --- Tipo de acto -------------------------------------------------
  if (ctx.tipo_acto) {
    const v = variables.find((x) => RECONOCE.acto.test(x.pregunta));
    // Por CLAVE cuando la plantilla la trae (matriz v2, migration 0037): los
    // once actos del layout, sin traducir nada. La traducción de abajo es para
    // la v1, que sólo nombra cuatro con los rótulos anteriores a la 0031.
    const porClave = v?.opciones.find((o) => o.clave === ctx.tipo_acto);
    if (v && porClave) {
      out.push({
        variable_codigo: v.codigo,
        valor: porClave.valor,
        etiqueta: porClave.label,
        fuente: 'el tipo de acto que se está instrumentando',
      });
    } else {
      const enMatriz = ACTO_EN_MATRIZ[ctx.tipo_acto];
      if (enMatriz) sugerir(v, enMatriz, 'el tipo de acto que se está instrumentando');
    }
  }

  // --- Magnitud, relativa al umbral del acto -------------------------
  // Sólo la responde la matriz v2: la v1 tiene tramos absolutos de 645 y 3,210
  // UMA, umbrales de activos virtuales derogados en una matriz de fe pública.
  // Contestarlos sería clasificar contra cifras equivocadas de otra fracción.
  if (ctx.monto_uma != null && Number.isFinite(ctx.monto_uma)) {
    const v = variables.find((x) => RECONOCE.magnitud.test(x.pregunta));
    const porTramo = v?.opciones.some((o) => o.clave?.startsWith('T'));
    if (v && porTramo) {
      const m = magnitudDeOperacion(ctx.monto_uma, ctx.umbral_uma ?? null);
      const opcion = v.opciones.find((o) => o.clave === m.tramo);
      if (opcion) {
        out.push({
          variable_codigo: v.codigo,
          valor: opcion.valor,
          etiqueta: opcion.label,
          fuente: m.fuente,
        });
      }
    }
  }

  // --- Riesgo país -----------------------------------------------------
  // En la matriz v3 (migration 0042) es UNA variable que toma el valor MÁS ALTO
  // de nacionalidad, residencia (o constitución) y origen de los recursos. No
  // promedia: un promedio dejaría que dos países limpios diluyeran al tercero,
  // que es justo el que importa.
  //
  // En la v1 y la v2 son tres variables sueltas, y se responden como antes.
  {
    const v = variables.find((x) => RECONOCE.riesgoPais.test(x.pregunta));
    const porClave = v?.opciones.some((o) => o.clave === 'riesgo');
    // Sin snapshot no hay contra qué comparar, y contestar «sin observaciones»
    // porque la consulta no ha vuelto sería inventar una respuesta benigna.
    const hayListas = ctx.listas_cargadas !== false;

    if (v && porClave && hayListas) {
      const r = riesgoPaisMaximo(paisesCapturados(ctx), {
        gafi_gris: ctx.gafi_gris,
        gafi_negra: ctx.gafi_negra,
        plenario: ctx.plenario_gafi,
      });
      const opcion = r ? v.opciones.find((o) => o.clave === claveDeNivel(r.nivel)) : undefined;
      if (r && opcion) {
        out.push({
          variable_codigo: v.codigo,
          valor: opcion.valor,
          etiqueta: opcion.label,
          fuente: r.fuente,
        });
      }
    } else if (ctx.pais_iso2 && hayListas) {
      // Plantillas v1 y v2.
      const nivel = nivelPais(ctx.pais_iso2, ctx);
      const vViejo = variables.find((x) =>
        ctx.tipo_persona === 'moral'
          ? RECONOCE.constitucion.test(x.pregunta)
          : RECONOCE.residencia.test(x.pregunta),
      );
      if (vViejo) {
        const opcion = opcionDePais(vViejo, nivel);
        if (opcion) {
          out.push({
            variable_codigo: vViejo.codigo,
            valor: opcion.valor,
            etiqueta: opcion.label,
            fuente: `${TEXTO_PAIS[nivel]} (${ctx.pais_iso2.toUpperCase()}), contra el snapshot de listas de Ikán`,
          });
        }
      }
    }
  }

  // --- Moneda extranjera o activos virtuales ------------------------
  // Sólo cuando hay un acto de por medio: sin operación, «no involucra
  // moneda extranjera» no es una respuesta, es una ausencia de pregunta.
  if (ctx.tipo_acto || ctx.moneda_origen || ctx.activo_virtual) {
    const v = variables.find((x) => RECONOCE.monedaAv.test(x.pregunta));
    if (v) {
      if (ctx.activo_virtual) {
        sugerir(v, 'Activos virtuales', `la operación involucra ${ctx.activo_virtual}`);
      } else if (ctx.moneda_origen && ctx.moneda_origen.toUpperCase() !== 'MXN') {
        sugerir(v, 'Moneda extranjera', `la operación está en ${ctx.moneda_origen.toUpperCase()}`);
      } else if (ctx.moneda_origen) {
        sugerir(v, 'No, solo moneda nacional', 'la operación está en pesos');
      }
    }
  }

  // --- Condición de PPE ------------------------------------------------
  // Sólo cuando alguien la RESOLVIÓ. Una coincidencia del screening que nadie
  // ha revisado no se traduce a ninguna opción: las RCG reservan al sujeto
  // obligado la determinación del nivel, y responderla desde el proveedor
  // sería atribuirle una decisión que no es suya.
  //
  // Y `no_pep` sí se responde: es una determinación, no una ausencia.
  if (ctx.condicion_pep && ctx.condicion_pep !== 'coincidencia_sin_resolver') {
    const v = variables.find((x) => RECONOCE.pep.test(x.pregunta));
    const texto = TEXTO_PEP[ctx.condicion_pep];
    if (v && texto) {
      const opcion = v.opciones.find((o) => o.label.toLowerCase().startsWith(texto.toLowerCase()));
      if (opcion) {
        out.push({
          variable_codigo: v.codigo,
          valor: opcion.valor,
          etiqueta: opcion.label,
          fuente: FUENTE_PEP[ctx.condicion_pep] ?? 'la condición de PPE registrada',
        });
      }
    }
  }

  // --- Actividad o giro ------------------------------------------------
  // SIEMPRE se responde, incluso sin clave capturada y con claves que la tabla
  // no contempla. Dejarla en blanco sumaría cero, y cero en una escala aditiva
  // es más bajo que la actividad más inocua de la lista: la clave desconocida
  // acabaría puntuando mejor que un notario. Es el peor modo de falla posible,
  // porque produce falsos negativos silenciosos.
  {
    const v = variables.find((x) =>
      ctx.tipo_persona === 'moral'
        ? RECONOCE.giro.test(x.pregunta)
        : RECONOCE.actividad.test(x.pregunta),
    );
    if (v) {
      const r = riesgoDeActividad(ctx.actividad_clave);
      const opcion = v.opciones.find((o) => o.valor === r.valor);
      if (opcion) {
        out.push({
          variable_codigo: v.codigo,
          valor: opcion.valor,
          etiqueta: opcion.label,
          fuente: r.fuente,
          por_defecto: !r.mapeada,
        });
      }
    }
  }

  // --- Forma de pago ---------------------------------------------------
  if (ctx.forma_pago) {
    const v = variables.find((x) => RECONOCE.formaPago.test(x.pregunta));
    const texto = TEXTO_FORMA_PAGO[ctx.forma_pago];
    if (v && texto) {
      // Se busca por prefijo: la opción del seed dice «Bancarizado
      // (transferencia o cheque nominativo)» y el paréntesis es explicación, no
      // parte del valor.
      const opcion = v.opciones.find((o) => o.label.toLowerCase().startsWith(texto.toLowerCase()));
      if (opcion) {
        out.push({
          variable_codigo: v.codigo,
          valor: opcion.valor,
          etiqueta: opcion.label,
          fuente: `la forma de pago capturada en el acto (${texto.toLowerCase()})`,
        });
      }
    }
  }

  // --- País de origen de los recursos ----------------------------------
  if (ctx.pais_origen_recursos) {
    const nivel = nivelPais(ctx.pais_origen_recursos, ctx);
    const v = variables.find((x) => RECONOCE.fondos.test(x.pregunta));
    if (v) {
      // Tres opciones: bajo / medio / alto (gris o negra). México y los países
      // sin observaciones caen en la primera; gris y negra en la última. La
      // opción intermedia no tiene un criterio que la defina en el catálogo que
      // tenemos, así que no se usa: elegirla sería inventar un «riesgo medio»
      // de país que ninguna lista respalda.
      const indice = nivel === 'nacional' || nivel === 'sin_observaciones' ? 0 : 2;
      const opcion = v.opciones[indice];
      if (opcion) {
        out.push({
          variable_codigo: v.codigo,
          valor: opcion.valor,
          etiqueta: opcion.label,
          fuente: `los recursos vienen de ${ctx.pais_origen_recursos.toUpperCase()}: ${TEXTO_PAIS[nivel]}`,
        });
      }
    }
  }

  // --- Canal de distribución -------------------------------------------
  // No se deduce de que exista una verificación de Didit: se puede verificar a
  // distancia a alguien que vino a la notaría, y suponerlo al revés convertiría
  // un dato administrativo en una calificación de riesgo. Sin canal capturado,
  // la variable se queda sin responder.
  {
    const v = variables.find((x) => RECONOCE.canal.test(x.pregunta));
    const r = riesgoDeCanal(ctx.canal_distribucion);
    const opcion = v && r ? v.opciones.find((o) => o.clave === r.clave) : undefined;
    if (v && r && opcion) {
      out.push({
        variable_codigo: v.codigo,
        valor: opcion.valor,
        etiqueta: opcion.label,
        fuente: r.fuente,
      });
    }
  }

  // --- Zona geográfica nacional ----------------------------------------
  // Con la lista interna vacía NO se responde, y la variable tampoco puntúa
  // (`requiere_catalogo` en la plantilla). Contestar «sin observaciones»
  // porque la lista está vacía le daría la calificación más baja a cualquier
  // ubicación del país: el falso negativo silencioso de siempre.
  {
    const v = variables.find((x) => RECONOCE.zona.test(x.pregunta));
    const r = riesgoDeZona(
      [
        {
          rol: 'inmueble',
          entidad_clave: ctx.entidad_inmueble,
          municipio: ctx.municipio_inmueble,
        },
        {
          rol: 'domicilio_cliente',
          entidad_clave: ctx.entidad_cliente,
          municipio: ctx.municipio_cliente,
        },
      ],
      ctx.zonas_atencion ?? [],
    );
    const opcion = v && r ? v.opciones.find((o) => o.valor === r.valor) : undefined;
    if (v && r && opcion) {
      out.push({
        variable_codigo: v.codigo,
        valor: opcion.valor,
        etiqueta: opcion.label,
        fuente: r.fuente,
      });
    }
  }

  // --- Perfil transaccional: frecuencia --------------------------------
  // Se responde siempre QUE HAYA MARGEN CARGADO. Sin declaración del cliente la
  // respuesta es la intermedia y va marcada `por_defecto`, no el mínimo: un
  // expediente al que le falta el dato no puede puntuar mejor que uno que lo
  // tiene y está en orden.
  //
  // Pero sin el PARÁMETRO del margen no se responde nada. No hay default en el
  // código, y es el punto entero de la instrucción 12: la tolerancia anterior
  // —media anualidad redondeada hacia arriba— era un 50 % inventado que nadie
  // podía acreditar cuándo cambió ni quién lo aprobó.
  {
    const v = variables.find((x) => RECONOCE.frecuencia.test(x.pregunta));
    if (v) {
      const r = riesgoDeFrecuencia(
        ctx.frecuencia_esperada_anual,
        ctx.operaciones_en_ventana ?? 0,
        ctx.margen_perfil,
      );
      const opcion = r ? v.opciones.find((o) => o.clave === r.clave) : undefined;
      if (r && opcion) {
        out.push({
          variable_codigo: v.codigo,
          valor: opcion.valor,
          etiqueta: opcion.label,
          fuente: r.fuente,
          por_defecto: r.por_defecto,
        });
      }
    }
  }

  // Nunca dos respuestas para la misma variable.
  const vistas = new Set<string>();
  return out.filter((r) => {
    if (vistas.has(r.variable_codigo) || !porCodigo.has(r.variable_codigo)) return false;
    vistas.add(r.variable_codigo);
    return true;
  });
}

/**
 * Por qué falta cada variable que quedó sin responder.
 *
 * ---------------------------------------------------------------------
 * Qué problema resuelve
 * ---------------------------------------------------------------------
 * La pantalla decía, con un texto escrito a mano: «faltan las que no puede
 * saber por sí solo: si el compareciente es PEP y quién es el beneficiario
 * controlador». En un compareciente sin actos registrados faltaban SEIS, no
 * dos, y el OC leía que le faltaban dos casillas.
 *
 * Peor que la cuenta equivocada era esconder que los huecos tienen causas
 * distintas, y que cada causa se atiende en un lugar distinto:
 *
 *   · Cuatro de esas seis dependen de un ACTO, y este compareciente no tiene
 *     ninguno. No hay nada que capturar en la matriz: hay que registrar el
 *     acto, y entonces se responden solas.
 *   · El canal de distribución es un dato del ALTA que se quedó vacío.
 *   · La condición de PPE y el beneficiario controlador necesitan que una
 *     PERSONA los determine. Ahí sí le toca al OC.
 *
 * Un hueco sin motivo se ve igual que un descuido, y el OC no tiene forma de
 * saber cuál de los tres es. Con el motivo, sabe si tiene que ir a Actos, al
 * alta del cliente, o resolverlo él.
 */
export type MotivoFalta = 'sin_actos' | 'sin_dato' | 'requiere_criterio' | 'sin_parametro';

export interface FaltaExplicada {
  variable_codigo: string;
  pregunta: string;
  motivo: MotivoFalta;
  /** Qué hay que hacer para que deje de faltar, en una frase. */
  detalle: string;
}

/** Lo que hay que hacer, por motivo. */
export const ACCION_POR_MOTIVO: Record<MotivoFalta, string> = {
  sin_actos:
    'Se responden solas al registrar el acto: dependen de lo que se instrumente. ' +
    'No hay que contestarlas a mano aquí.',
  sin_dato: 'El dato está vacío en el expediente. Se captura en el alta del compareciente.',
  requiere_criterio:
    'Ninguna de estas se puede derivar de un dato: las tiene que determinar una persona.',
  sin_parametro:
    'Falta un parámetro regulatorio vigente en la configuración. Sin él no se puede ' +
    'calcular, y no se sustituye por un valor inventado.',
};

export function faltasExplicadas(
  config: MatrizConfig,
  ctx: ContextoPrellenado,
  respuestas: Record<string, number>,
  catalogos?: CatalogosDisponibles,
): FaltaExplicada[] {
  const pendientes = faltanPorResponder(config, ctx.tipo_persona, respuestas, catalogos);
  const hayActos = ctx.hay_actos !== false;

  return pendientes.map((v) => {
    const p = v.pregunta;
    const base = { variable_codigo: v.codigo, pregunta: p };

    // Las que salen del acto. Si no hay actos, el motivo es ése y no otro:
    // decir «captura el dato» sobre un acto que no existe manda al OC a buscar
    // un campo que no está en ninguna pantalla.
    const delActo =
      RECONOCE.acto.test(p) ||
      RECONOCE.magnitud.test(p) ||
      RECONOCE.formaPago.test(p) ||
      RECONOCE.monedaAv.test(p) ||
      RECONOCE.fondos.test(p);
    if (delActo) {
      return {
        ...base,
        motivo: hayActos ? ('sin_dato' as const) : ('sin_actos' as const),
        detalle: hayActos
          ? 'El acto está registrado pero le falta este dato. Se completa desde el acto.'
          : 'El compareciente no tiene ningún acto registrado.',
      };
    }

    if (RECONOCE.frecuencia.test(p)) {
      return {
        ...base,
        motivo: 'sin_parametro' as const,
        detalle:
          'Falta el margen del perfil transaccional en los parámetros regulatorios ' +
          '(margen_perfil_transaccional_operaciones).',
      };
    }

    if (RECONOCE.canal.test(p)) {
      return {
        ...base,
        motivo: 'sin_dato' as const,
        detalle:
          'Cómo llegó el compareciente. No se deduce de que exista una verificación ' +
          'digital: se puede verificar a distancia a quien vino a la notaría.',
      };
    }

    if (RECONOCE.pep.test(p)) {
      return {
        ...base,
        motivo: 'requiere_criterio' as const,
        detalle:
          ctx.condicion_pep === 'coincidencia_sin_resolver'
            ? 'El screening encontró una coincidencia y nadie la ha resuelto. Las RCG ' +
              'reservan al sujeto obligado la determinación del nivel.'
            : 'No se ha consultado ni determinado la condición de PPE.',
      };
    }

    if (RECONOCE.riesgoPais.test(p) || RECONOCE.constitucion.test(p)) {
      return {
        ...base,
        motivo: ctx.listas_cargadas === false ? ('sin_parametro' as const) : ('sin_dato' as const),
        detalle:
          ctx.listas_cargadas === false
            ? 'El snapshot de listas del GAFI todavía no ha cargado.'
            : 'No hay ningún país capturado en el expediente.',
      };
    }

    // Todo lo demás: el beneficiario controlador y cualquier variable que la
    // plantilla añada y este módulo no sepa derivar todavía. Se agrupa como
    // criterio de una persona porque es lo único honesto que se puede decir
    // sin saber de qué se trata.
    return {
      ...base,
      motivo: 'requiere_criterio' as const,
      detalle: 'El sistema no tiene de dónde derivarla.',
    };
  });
}

/** Las que siguen sin respuesta después de pre-llenar. Es lo que el OC tiene que contestar. */
export function faltanPorResponder(
  config: MatrizConfig,
  tipoPersona: TipoPersona,
  respuestas: Record<string, number>,
  catalogos?: CatalogosDisponibles,
): MatrizVariable[] {
  // Una variable con un valor que no es ninguna de sus opciones cuenta como
  // NO respondida: es un dato que la plantilla no reconoce, y tratarlo como
  // respuesta lo dejaría fuera de la lista de lo que el OC tiene que contestar.
  return variablesAplicables(config, tipoPersona, catalogos).filter(
    (v) => !respuestaValida(v, respuestas[v.codigo]),
  );
}
