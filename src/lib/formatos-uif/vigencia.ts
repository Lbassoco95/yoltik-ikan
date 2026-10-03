/**
 * Vigencia de formatos oficiales UIF.
 *
 * Un aviso se valida contra la versión vigente a la FECHA DEL ACTO, no contra
 * la última cargada. Fuente: docs/formatos-uif/index.json → vigencias.
 *
 * No se infiere nada del PDF. Si la fecha cae fuera de los hitos conocidos,
 * se declara el régimen y se deja al llamador decidir.
 */

export type RegimenFormatoUif = 'nov_2026' | 'dic_2026' | 'jun_2027' | 'jul_2027';

/** Hitos del DOF 24/09/2026 (index.json). */
export const VIGENCIAS_FORMATO_UIF = {
  /** Referencia de transición de layouts anteriores (nov-2026). */
  nov_2026: '2026-11-01',
  /** Avisos arts. 26 Bis, 26 Bis 1, 26 Bis 2 y 27 de las Reglas. */
  dic_2026: '2026-12-01',
  /** Todos los avisos e informes. */
  jun_2027: '2027-06-01',
  /** Último día para modificatorios con formato anterior. */
  modificatorios_formato_anterior_hasta: '2027-06-30',
  /** Formatos anteriores dejan de existir. */
  jul_2027: '2027-07-01',
} as const;

export interface ResolucionVigencia {
  regimen: RegimenFormatoUif;
  /** true = los formatos nuevos de la resolución aplican al acto. */
  formatosNuevosAplican: boolean;
  /**
   * true = aún se admite presentar un modificatorio con el formato anterior
   * (hasta 30-jun-2027 inclusive).
   */
  admiteModificatorioFormatoAnterior: boolean;
  /** true = los formatos anteriores ya no están disponibles. */
  formatosAnterioresRetirados: boolean;
  detalle: string;
}

function soloFecha(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Resuelve el régimen aplicable a la fecha del acto u operación.
 *
 * Anexos con entrada anticipada (p. ej. 14-A / 26 Bis) se evalúan aparte con
 * `formatoVigenteParaAnexo`.
 */
/**
 * Régimen del aviso según la fecha del ACTO.
 * `fechaCaptura` se acepta sólo para dejar explícito que NO interviene
 * (acto 15-nov-2026 capturado en ene-2027 → sigue siendo nov_2026).
 */
export function regimenDelActo(
  fechaActo: Date | string,
  _fechaCaptura?: Date | string | null,
): ResolucionVigencia {
  void _fechaCaptura;
  return resolverRegimen(fechaActo);
}

export function resolverRegimen(fechaActo: Date | string): ResolucionVigencia {
  const f = soloFecha(fechaActo);
  const { nov_2026, dic_2026, jun_2027, modificatorios_formato_anterior_hasta, jul_2027 } =
    VIGENCIAS_FORMATO_UIF;

  if (f >= jul_2027) {
    return {
      regimen: 'jul_2027',
      formatosNuevosAplican: true,
      admiteModificatorioFormatoAnterior: false,
      formatosAnterioresRetirados: true,
      detalle:
        'A partir del 1-jul-2027 los formatos anteriores dejan de estar disponibles. Sólo aplican los de la Resolución DOF 24/09/2026.',
    };
  }
  if (f >= jun_2027) {
    return {
      regimen: 'jun_2027',
      formatosNuevosAplican: true,
      admiteModificatorioFormatoAnterior: f <= modificatorios_formato_anterior_hasta,
      formatosAnterioresRetirados: false,
      detalle:
        'A partir del 1-jun-2027 entran en vigor para todos los Avisos e Informes, incluso respecto de actos realizados antes de esa fecha.',
    };
  }
  if (f >= dic_2026) {
    return {
      regimen: 'dic_2026',
      formatosNuevosAplican: false, // salvo anexos de entrada anticipada
      admiteModificatorioFormatoAnterior: true,
      formatosAnterioresRetirados: false,
      detalle:
        'Desde el 1-dic-2026 aplican los formatos nuevos a los Avisos de los artículos 26 Bis, 26 Bis 1, 26 Bis 2 y 27 de las Reglas. El resto sigue con el formato anterior hasta el 1-jun-2027.',
    };
  }
  if (f >= nov_2026) {
    return {
      regimen: 'nov_2026',
      formatosNuevosAplican: false,
      admiteModificatorioFormatoAnterior: true,
      formatosAnterioresRetirados: false,
      detalle:
        'Régimen de transición (nov-2026). Los formatos de la Resolución DOF 24/09/2026 aún no son el régimen general.',
    };
  }
  return {
    regimen: 'nov_2026',
    formatosNuevosAplican: false,
    admiteModificatorioFormatoAnterior: true,
    formatosAnterioresRetirados: false,
    detalle:
      'Fecha del acto anterior a la transición nov-2026. Aplican los formatos anteriores.',
  };
}

/**
 * ¿El anexo concreto ya está en vigor en esa fecha?
 *
 * - `14-A` (avisos 24 h fr. XIV / 26 Bis): desde 1-dic-2026.
 * - Resto de anexos activos: desde 1-jun-2027.
 * - Anexos `pendiente` (4, 10, 14): nunca “vigentes” para presentación.
 */
export function formatoVigenteParaAnexo(
  codigoAnexo: string,
  fechaActo: Date | string,
  estado: 'activo' | 'pendiente' | 'retirado' = 'activo',
): { vigente: boolean; motivo: string } {
  if (estado === 'pendiente') {
    return {
      vigente: false,
      motivo: `Anexo ${codigoAnexo} pendiente de carga (no publicado en la extracción). No se inventa ni se presenta.`,
    };
  }
  if (estado === 'retirado') {
    return {
      vigente: false,
      motivo: `Anexo ${codigoAnexo} retirado: los formatos anteriores ya no están disponibles.`,
    };
  }

  const f = soloFecha(fechaActo);
  const entrada = codigoAnexo === '14-A'
    ? VIGENCIAS_FORMATO_UIF.dic_2026
    : VIGENCIAS_FORMATO_UIF.jun_2027;

  if (f < entrada) {
    return {
      vigente: false,
      motivo: `Anexo ${codigoAnexo} entra en vigor el ${entrada}. Fecha del acto: ${f}.`,
    };
  }
  return { vigente: true, motivo: `Anexo ${codigoAnexo} vigente para la fecha del acto ${f}.` };
}

/** Anexos marcados pendientes en index.json — no se inventan. */
export const ANEXOS_PENDIENTES = ['4', '10', '14'] as const;

export function esAnexoPendiente(codigo: string): boolean {
  return (ANEXOS_PENDIENTES as readonly string[]).includes(codigo);
}
