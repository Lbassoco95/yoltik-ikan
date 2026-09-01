/**
 * Parámetros regulatorios (migration 0011) — núcleo puro.
 *
 * Sin dependencias de red ni del cliente de Supabase, para poder probarlo
 * aislado. La lectura contra la base vive en `src/lib/api/parametros.ts`.
 * Mismo patrón que `src/lib/riesgo/matriz.ts`.
 *
 * Reemplaza a las constantes que vivían en el código. La UMA estaba declarada
 * en tres lugares con dos valores distintos, y el que veía el usuario no era
 * el que usaba el motor. Aquí hay una sola fuente: la base.
 *
 * Un parámetro sin `confirmado_por` está sembrado pero NO validado por
 * Kawiil-Cumplimiento: la UI debe marcarlo como referencia, nunca mostrarlo
 * como si fuera cifra firme.
 */

export interface ParametroVigente {
  codigo: string;
  nombre: string;
  valor_numerico: number;
  unidad: 'mxn' | 'uma' | 'dia' | 'anio' | 'porcentaje' | 'operacion';
  /** '*' = aplica a todas las actividades. */
  sector: string;
  vigente_desde: string;
  fuente: string;
  publicacion_dof: string | null;
  url_fuente: string | null;
  confirmado_por: string | null;
  confirmado_en: string | null;
  notas: string | null;
}

/** Códigos que el producto conoce. No inventar códigos nuevos en el front:
 *  un parámetro nace en la base, no en una pantalla. */
export const PARAM = {
  UMA_DIARIA: 'uma_diaria',

  // Fe pública (fracción XII), régimen vigente desde la reforma DOF 16/07/2025.
  XII_INMUEBLE: 'umbral_xii_inmueble_uma',
  XII_FIDEICOMISO: 'umbral_xii_fideicomiso_uma',

  // Prohibición de pago en efectivo (art. 32). NO son umbrales de Aviso y no
  // deben mezclarse con ellos: el de Aviso para inmuebles son 8,000 UMA y el
  // de efectivo 8,025. La asimetría es de la ley, no una errata.
  EFECTIVO_INMUEBLE: 'umbral_efectivo_inmueble_uma',
  EFECTIVO_ACCIONES: 'umbral_efectivo_acciones_uma',

  // Perfil transaccional (Cap. III Ter de las RCG). Margen ABSOLUTO en
  // operaciones, no porcentaje: en fe pública la frecuencia declarada es un
  // entero pequeño y un 10 % sobre dos esperadas da 2.2, que al redondear se
  // comporta igual que no tener tolerancia. Provisional y firmado (0044).
  MARGEN_PERFIL: 'margen_perfil_transaccional_operaciones',

  // Activos virtuales (fracción XVI), mismo régimen.
  XVI_OPERACION: 'umbral_xvi_operacion_uma',
  XVI_CONTRAPRESTACION: 'umbral_xvi_contraprestacion_uma',

  // Retirados por la reforma. Se conservan sólo para poder leer registros
  // históricos del catálogo; NINGUNA pantalla debe publicarlos como vigentes.
  //   umbral_identificacion_uma  645 UMA   · derogado
  //   umbral_restriccion_uma   3,210 UMA   · derogado
  //   umbral_xii_persona_moral_uma 8,025   · derogado: ahora el Aviso es siempre
} as const;

/**
 * Resuelve un parámetro del arreglo ya cargado. El valor específico del sector
 * gana sobre el global ('*'), igual que en `parametro_vigente()` en la base.
 *
 * Devuelve `undefined` si no hay ninguno vigente. Quien llama decide qué hacer:
 * el front pinta un guion, el motor falla. Nunca se sustituye por un valor
 * inventado.
 */
export function resolverParametro(
  parametros: ParametroVigente[],
  codigo: string,
  sector = '*',
): ParametroVigente | undefined {
  const candidatos = parametros.filter(
    (p) => p.codigo === codigo && (p.sector === sector || p.sector === '*'),
  );
  return candidatos.find((p) => p.sector !== '*') ?? candidatos[0];
}

/** Atajo para el valor numérico. `undefined` si el parámetro no está vigente. */
export function valorParametro(
  parametros: ParametroVigente[],
  codigo: string,
  sector = '*',
): number | undefined {
  return resolverParametro(parametros, codigo, sector)?.valor_numerico;
}

/** Un parámetro sembrado pero sin validar por Kawiil-Cumplimiento. */
export function esReferenciaSinConfirmar(p: ParametroVigente | undefined): boolean {
  return p != null && p.confirmado_por == null;
}
