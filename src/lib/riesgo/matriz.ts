import type {
  MatrizConfig,
  MatrizElemento,
  MatrizVariable,
  TipoPersona,
  TriggerAltoDeOficio,
} from '@/types/domain';
import { calcularIndice, type PisoActivo } from './indice';

/**
 * Helpers puros de la matriz de riesgo del cliente.
 *
 * Resuelven qué variables aplican, validan que la captura esté completa y
 * calculan score y clasificación (ver "Cálculo de score" más abajo).
 */

/**
 * Evalúa el predicado `aplica_si` del elemento contra el tipo de persona.
 * Soporta la forma usada en el seed: "tipo_persona == 'fisica'" / "'moral'".
 * Sin predicado (o no reconocido) el elemento aplica.
 */
export function aplicaElemento(elemento: MatrizElemento, tipoPersona: TipoPersona): boolean {
  const pred = elemento.aplica_si?.trim();
  if (!pred) return true;
  const m = /tipo_persona\s*==\s*'?(fisica|moral)'?/.exec(pred);
  if (!m) return true;
  return m[1] === tipoPersona;
}

export function elementosAplicables(
  config: MatrizConfig,
  tipoPersona: TipoPersona,
): MatrizElemento[] {
  return config.elementos.filter((e) => aplicaElemento(e, tipoPersona));
}

/**
 * Catálogos cargados. Una variable que declara `requiere_catalogo` y cuyo
 * catálogo no está aquí NO puntúa y queda fuera del máximo y del mínimo.
 *
 * `undefined` significa «no se sabe qué hay cargado» y entonces todas las
 * variables cuentan: es el comportamiento de antes, y el que necesitan las
 * plantillas que no usan el mecanismo.
 */
export type CatalogosDisponibles = ReadonlySet<string> | undefined;

/** ¿Puede esta variable puntuar con los catálogos que hay? */
export function variablePuntua(v: MatrizVariable, catalogos: CatalogosDisponibles): boolean {
  if (!v.requiere_catalogo) return true;
  if (catalogos === undefined) return true;
  return catalogos.has(v.requiere_catalogo);
}

export function variablesAplicables(
  config: MatrizConfig,
  tipoPersona: TipoPersona,
  catalogos?: CatalogosDisponibles,
): MatrizVariable[] {
  return elementosAplicables(config, tipoPersona)
    .flatMap((e) => e.variables)
    .filter((v) => variablePuntua(v, catalogos));
}

/**
 * ¿Es este número una de las opciones que la variable ofrece?
 *
 * No es paranoia de tipos: las respuestas viajan como `jsonb` y se guardan
 * enteras, así que una evaluación de una versión anterior de la plantilla, una
 * escritura por API o una corrección a mano pueden traer un valor que la
 * variable ya no tiene —o que nunca tuvo—. Un `-10` en una variable de 1 a 3
 * pasaba como respuesta válida, se sumaba, y el índice lo recortaba a cero: el
 * expediente salía «bajo» por un dato imposible.
 */
export function respuestaValida(v: MatrizVariable, valor: unknown): valor is number {
  return typeof valor === 'number' && v.opciones.some((o) => o.valor === valor);
}

/** ¿Están respondidas todas las variables aplicables, CON UNA OPCIÓN QUE EXISTE? */
export function respuestasCompletas(
  config: MatrizConfig,
  tipoPersona: TipoPersona,
  respuestas: Record<string, number>,
  catalogos?: CatalogosDisponibles,
): boolean {
  const variables = variablesAplicables(config, tipoPersona, catalogos);
  return variables.every((v) => respuestaValida(v, respuestas[v.codigo]));
}

// =====================================================================
// Cálculo de score y clasificación
// =====================================================================
// Fórmula acordada (cierra RCG0.B0b): matriz ponderada estándar.
//
//   score_total = Σ (peso_variable × valor_opcion_elegida)
//                 sobre las variables que aplican y que fueron respondidas.
//
// Un trigger de alto de oficio activado gana sobre el score.
//
// ADVERTENCIA: esta es metodología estándar de matriz ponderada, NO la copia
// literal del Excel de Ixim Pay — ese sigue sin poder usarse tal cual (sus
// subtotales suman 25 y declara score 17). Kawiil-Cumplimiento debe validarla
// contra la intención del Excel antes de usarla para decisiones regulatorias
// reales. No bloquea el piloto controlado.

/** Peso por defecto cuando la variable no declara uno. */
export const PESO_POR_DEFECTO = 1;

export interface ResultadoEvaluacion {
  score_total: number;
  /** Score parcial por código de elemento; se persiste en `subtotales`. */
  subtotales: Record<string, number>;
  clasificacion: 'bajo' | 'medio' | 'alto';
  /** Códigos de los triggers de alto de oficio que se activaron. */
  triggers_activados: string[];
  /** Texto para `client_risk_assessment.motivo_alto_de_oficio`; null si no aplica. */
  motivo_alto_de_oficio: string | null;
  /** Situaciones que no impiden clasificar pero conviene registrar. */
  warnings: string[];
  /**
   * El índice normalizado de 0 a 100, cuando la plantilla declara
   * `escala_normalizada`. Null en las plantillas de puntaje crudo (la v1).
   */
  indice: number | null;
  /** Máximo posible de la configuración aplicable. Null igual que `indice`. */
  maximo: number | null;
  /** Los cortes no se han calibrado contra datos reales: no presentar como definitivo. */
  provisional: boolean;
  /** Códigos de los indicadores booleanos activos. Viajan aunque no sean piso. */
  indicadores_activos: string[];
  /** Variables que no puntuaron por falta de su catálogo, con el catálogo que falta. */
  variables_sin_catalogo: { variable_codigo: string; catalogo: string }[];
}

/** Lo que la evaluación necesita saber además de las respuestas. */
export interface ContextoEvaluacion {
  /** Catálogos cargados hoy. Ver `variablePuntua`. */
  catalogos_disponibles?: CatalogosDisponibles;
  /** Banderas booleanas por código de indicador (llamado a la acción del GAFI). */
  indicadores?: Record<string, boolean>;
  /**
   * Puntos de las banderas que viven fuera de la matriz —banda de umbral,
   * posible fraccionamiento—. Suman al puntaje sin entrar al máximo: son
   * excepcionales por definición y meterlas en el denominador diluiría todo lo
   * demás.
   */
  puntaje_extra?: number;
}

/**
 * Score de una sola variable. Sin respuesta aporta 0.
 *
 * Un valor que no corresponde a ninguna opción tampoco suma: sumarlo sería
 * puntuar contra un dato que la plantilla no reconoce. Como `respuestasCompletas`
 * ya lo rechaza, llegar aquí con uno significa que alguien evaluó sin pasar por
 * ahí, y en ese caso lo correcto es no inventarle un puntaje.
 */
function scoreVariable(v: MatrizVariable, respuestas: Record<string, number>): number {
  const valor = respuestas[v.codigo];
  if (!respuestaValida(v, valor)) return 0;
  return (v.peso ?? PESO_POR_DEFECTO) * valor;
}

/** Triggers de alto de oficio activados por las respuestas.
 *  Solo puede dispararse un trigger que declare `variable_codigo` y
 *  `valor_minimo`; los demás son documentales. */
export function triggersActivados(
  config: MatrizConfig,
  tipoPersona: TipoPersona,
  respuestas: Record<string, number>,
  ctx: ContextoEvaluacion = {},
): TriggerAltoDeOficio[] {
  const variables = variablesAplicables(config, tipoPersona, ctx.catalogos_disponibles);
  const porCodigo = new Map(variables.map((v) => [v.codigo, v]));

  return (config.triggers_alto_de_oficio ?? []).filter((t) => {
    // Por indicador booleano: no apunta a ninguna variable de puntaje. Es el
    // llamado a la acción del GAFI, que la escala agrupa con la lista gris
    // —agrupar para puntuar es aceptable— y que el flujo tiene que separar
    // —el llamado a la acción conlleva contramedidas, no diligencia reforzada—.
    if (t.indicador_codigo) return ctx.indicadores?.[t.indicador_codigo] === true;
    if (!t.variable_codigo) return false;
    // Un trigger que apunta a una variable que no aplica a este tipo de
    // persona no dispara (ej. "PEP extranjero" de persona física en una moral).
    const variable = porCodigo.get(t.variable_codigo);
    if (!variable) return false;
    const respuesta = respuestas[t.variable_codigo];
    if (typeof respuesta !== 'number') return false;

    // Por CLAVE cuando la trae: un disparador de fideicomiso tiene que apuntar
    // al fideicomiso, no al tercer renglón de una lista. Con `valor_minimo`
    // bastaba añadir una opción para que señalara a otra cosa —y eso pasó: al
    // pasar el catálogo de actos de cuatro a once, el poder irrevocable ocupó
    // la posición del fideicomiso y disparaba su alerta.
    if (t.claves && t.claves.length > 0) {
      const elegida = variable.opciones.find((o) => o.valor === respuesta);
      return elegida?.clave != null && t.claves.includes(elegida.clave);
    }

    // Forma antigua, para las plantillas que todavía la usan.
    return typeof t.valor_minimo === 'number' && respuesta >= t.valor_minimo;
  });
}

/** Clasifica un score contra las bandas de `escala_cliente`.
 *  Si cae fuera de todas, usa la banda más cercana y lo reporta. */
export function clasificarPorBanda(
  config: MatrizConfig,
  score: number,
): { clasificacion: 'bajo' | 'medio' | 'alto'; warning: string | null } {
  const bandas = (['bajo', 'medio', 'alto'] as const).map((nombre) => ({
    nombre,
    ...config.escala_cliente[nombre],
  }));

  const dentro = bandas.find((b) => score >= b.min && score <= b.max);
  if (dentro) return { clasificacion: dentro.nombre, warning: null };

  // Fuera de todas las bandas: la plantilla está mal calibrada. Se clasifica
  // por el extremo más cercano en vez de fallar, y se deja constancia.
  const ordenadas = [...bandas].sort((a, b) => a.min - b.min);
  const menor = ordenadas[0];
  const mayor = ordenadas[ordenadas.length - 1];

  let elegida: (typeof bandas)[number];
  if (score < menor.min) {
    elegida = menor;
  } else if (score > mayor.max) {
    elegida = mayor;
  } else {
    // Hueco entre bandas: la más cercana por distancia al borde.
    elegida = ordenadas.reduce((mejor, b) => {
      const d = score < b.min ? b.min - score : score - b.max;
      const dMejor = score < mejor.min ? mejor.min - score : score - mejor.max;
      return d < dMejor ? b : mejor;
    }, ordenadas[0]);
  }

  return {
    clasificacion: elegida.nombre,
    warning:
      `score_total ${score} cae fuera de todas las bandas de escala_cliente ` +
      `(${menor.min}–${mayor.max}); se clasificó como "${elegida.nombre}" por cercanía. ` +
      'Revisar la calibración de la plantilla.',
  };
}

/**
 * Evalúa el riesgo de un cliente contra su plantilla.
 *
 * Solo debe llamarse con la captura completa (`respuestasCompletas`); el caller
 * es quien decide qué hacer si no lo está.
 */
export function evaluarMatriz(
  config: MatrizConfig,
  tipoPersona: TipoPersona,
  respuestas: Record<string, number>,
  ctx: ContextoEvaluacion = {},
): ResultadoEvaluacion {
  const warnings: string[] = [];
  const subtotales: Record<string, number> = {};
  const variables_sin_catalogo: { variable_codigo: string; catalogo: string }[] = [];
  let score_total = 0;

  for (const el of elementosAplicables(config, tipoPersona)) {
    let subtotal = 0;
    for (const v of el.variables) {
      if (!variablePuntua(v, ctx.catalogos_disponibles)) {
        // No suma y no entra al máximo. Se reporta para que la pantalla lo
        // diga: una variable que la plantilla declara y que no está puntuando
        // es información que el OC necesita, no un detalle de implementación.
        variables_sin_catalogo.push({
          variable_codigo: v.codigo,
          catalogo: v.requiere_catalogo as string,
        });
        continue;
      }
      subtotal += scoreVariable(v, respuestas);
    }
    subtotales[el.codigo] = subtotal;
    score_total += subtotal;
  }

  const activados = triggersActivados(config, tipoPersona, respuestas, ctx);
  const indicadores_activos = (config.indicadores ?? [])
    .filter((i) => ctx.indicadores?.[i.codigo] === true)
    .map((i) => i.codigo);

  // ------------------------------------------------------------------
  // Escala normalizada (matriz v2 en adelante)
  // ------------------------------------------------------------------
  // Las bandas de la v2 y la v3 están en índice de 0 a 100. Comparar contra
  // ellas el puntaje CRUDO —que con once variables ronda los treinta puntos—
  // haría que todos los expedientes cayeran en «bajo», que empieza en 0 y
  // termina en 39. No sería una calibración floja: sería una matriz que no
  // clasifica y que se ve como si clasificara.
  if (config.escala_normalizada) {
    const pisos: PisoActivo[] = activados.map((t) => ({
      clave: t.codigo,
      detalle: t.descripcion,
    }));
    const r = calcularIndice(config, tipoPersona, score_total, {
      pisos,
      puntajeExtra: ctx.puntaje_extra,
      calibrada: config.calibrada,
      catalogos: ctx.catalogos_disponibles,
    });
    return {
      score_total: r.puntaje,
      subtotales,
      clasificacion: r.banda,
      triggers_activados: activados.map((t) => t.codigo),
      motivo_alto_de_oficio:
        activados.length > 0
          ? activados.map((t) => `${t.codigo}: ${t.descripcion}`).join(' \u00b7 ')
          : null,
      warnings,
      indice: r.indice,
      maximo: r.maximo,
      provisional: r.provisional,
      indicadores_activos,
      variables_sin_catalogo,
    };
  }

  // ------------------------------------------------------------------
  // Puntaje crudo (matriz v1)
  // ------------------------------------------------------------------
  if (activados.length > 0) {
    return {
      score_total,
      subtotales,
      clasificacion: 'alto',
      triggers_activados: activados.map((t) => t.codigo),
      motivo_alto_de_oficio: activados.map((t) => `${t.codigo}: ${t.descripcion}`).join(' \u00b7 '),
      warnings,
      indice: null,
      maximo: null,
      provisional: false,
      indicadores_activos,
      variables_sin_catalogo,
    };
  }

  const { clasificacion, warning } = clasificarPorBanda(config, score_total);
  if (warning) warnings.push(warning);

  return {
    score_total,
    subtotales,
    clasificacion,
    triggers_activados: [],
    motivo_alto_de_oficio: null,
    warnings,
    indice: null,
    maximo: null,
    provisional: false,
    indicadores_activos,
    variables_sin_catalogo,
  };
}
