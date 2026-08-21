import type { MatrizConfig, MatrizElemento, MatrizVariable, TipoPersona } from '@/types/domain';

/**
 * Helpers puros de la matriz de riesgo del cliente.
 *
 * NOTA[RCG-0]: el cálculo de `score_total`/`clasificacion` NO está aquí a
 * propósito. La fórmula de ponderación vive en el Excel original de FIATCOIN
 * ("Matriz de Riesgos Clientes - FIATCOIN RAMPLE.xlsx") y el seed de Juan Pérez
 * es inconsistente con una suma simple (subtotales suman 25 pero declara 17).
 * Por la regla "no inventar algoritmos", el score queda PENDIENTE hasta que
 * Kawiil-Cumplimiento confirme la fórmula. Estos helpers solo resuelven qué
 * variables aplican y validan que la captura esté completa.
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
