import type {
  MatrizConfig,
  MatrizElemento,
  MatrizVariable,
  TipoPersona,
  TriggerAltoDeOficio,
} from '@/types/domain';

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

export function variablesAplicables(
  config: MatrizConfig,
  tipoPersona: TipoPersona,
): MatrizVariable[] {
  return elementosAplicables(config, tipoPersona).flatMap((e) => e.variables);
}

/** ¿Están respondidas todas las variables aplicables? */
export function respuestasCompletas(
  config: MatrizConfig,
  tipoPersona: TipoPersona,
  respuestas: Record<string, number>,
): boolean {
  const variables = variablesAplicables(config, tipoPersona);
  return variables.every((v) => typeof respuestas[v.codigo] === 'number');
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
}

/** Score de una sola variable. Sin respuesta aporta 0. */
function scoreVariable(v: MatrizVariable, respuestas: Record<string, number>): number {
  const valor = respuestas[v.codigo];
  if (typeof valor !== 'number') return 0;
  return (v.peso ?? PESO_POR_DEFECTO) * valor;
}

/** Triggers de alto de oficio activados por las respuestas.
 *  Solo puede dispararse un trigger que declare `variable_codigo` y
 *  `valor_minimo`; los demás son documentales. */
export function triggersActivados(
  config: MatrizConfig,
  tipoPersona: TipoPersona,
  respuestas: Record<string, number>,
): TriggerAltoDeOficio[] {
  const variables = variablesAplicables(config, tipoPersona);
  const porCodigo = new Map(variables.map((v) => [v.codigo, v]));

  return (config.triggers_alto_de_oficio ?? []).filter((t) => {
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
): ResultadoEvaluacion {
  const warnings: string[] = [];
  const subtotales: Record<string, number> = {};
  let score_total = 0;

  for (const el of elementosAplicables(config, tipoPersona)) {
    const subtotal = el.variables.reduce((s, v) => s + scoreVariable(v, respuestas), 0);
    subtotales[el.codigo] = subtotal;
    score_total += subtotal;
  }

  const activados = triggersActivados(config, tipoPersona, respuestas);
  if (activados.length > 0) {
    return {
      score_total,
      subtotales,
      clasificacion: 'alto',
      triggers_activados: activados.map((t) => t.codigo),
      motivo_alto_de_oficio: activados.map((t) => `${t.codigo}: ${t.descripcion}`).join(' · '),
      warnings,
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
  };
}
