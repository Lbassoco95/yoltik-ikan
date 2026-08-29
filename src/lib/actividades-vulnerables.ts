/**
 * Catálogo de actividades vulnerables del artículo 17 de la LFPIORPI.
 *
 * Estaba duplicado: una versión correcta en el formulario público de registro
 * y otra EQUIVOCADA en la pantalla de Configuración, que decía que la fracción
 * XII era vehículos y la XIII fe pública. Un abogado lo detecta en segundos, y
 * en una plataforma de cumplimiento una fracción mal numerada no es una errata:
 * es una afirmación falsa sobre la ley.
 *
 * Una sola fuente, y las dos pantallas la consumen.
 *
 * PENDIENTE_CONFIRMAR con Kawiil-Cumplimiento: las descripciones son las que
 * ya traía el repo. Sirven para identificar la fracción, no como definición
 * legal.
 */

export interface ActividadVulnerable {
  /** Como se cita la fracción. 'V Bis' no es 'V'. */
  fraccion: string;
  /** Valor del enum `sector_av` cuando existe. Null = el modelo todavía no la
   *  soporta como sector propio, aunque el catálogo la reconozca. */
  sector: string | null;
  nombre: string;
  descripcion: string;
}

export const ACTIVIDADES_VULNERABLES: ActividadVulnerable[] = [
  { fraccion: 'IV',    sector: 'IV',   nombre: 'Mutuo, préstamo o crédito',
    descripcion: 'Con o sin garantía. SOFOMes, fintech de crédito.' },
  { fraccion: 'V',     sector: 'V',    nombre: 'Inmuebles',
    descripcion: 'Compraventa y corretaje de bienes inmuebles.' },
  { fraccion: 'V Bis', sector: null,   nombre: 'Desarrollo inmobiliario',
    descripcion: 'Fracción añadida en la reforma de 2026.' },
  { fraccion: 'VII',   sector: 'VII',  nombre: 'Metales preciosos, joyas y piedras',
    descripcion: 'Comercialización o intermediación.' },
  { fraccion: 'VIII',  sector: 'VIII', nombre: 'Vehículos',
    descripcion: 'Aéreos, marítimos y terrestres.' },
  { fraccion: 'IX',    sector: null,   nombre: 'Blindaje',
    descripcion: 'Servicios de blindaje de vehículos e inmuebles.' },
  { fraccion: 'X',     sector: null,   nombre: 'Traslado y custodia de valores',
    descripcion: 'Traslado de dinero o valores.' },
  { fraccion: 'XI',    sector: null,   nombre: 'Servicios profesionales',
    descripcion: 'Despachos que actúan en nombre de un cliente.' },
  { fraccion: 'XII',   sector: 'XII',  nombre: 'Fe pública',
    descripcion: 'Notarios, corredores públicos y facilitadores MASC.' },
  { fraccion: 'XIII',  sector: null,   nombre: 'Donativos',
    descripcion: 'Recepción de donativos por asociaciones sin fines de lucro.' },
  { fraccion: 'XIV',   sector: null,   nombre: 'Comercio exterior',
    descripcion: 'Agentes y apoderados aduanales.' },
  { fraccion: 'XV',    sector: 'XV',   nombre: 'Arrendamiento',
    descripcion: 'Arrendamiento de bienes inmuebles.' },
  { fraccion: 'XVI',   sector: 'XVI',  nombre: 'Activos virtuales',
    descripcion: 'Intercambio, custodia y transferencia de activos virtuales.' },
];

/** Busca por el valor de `sector_av`. Devuelve undefined si la fracción no
 *  está modelada como sector, que no es lo mismo que no existir. */
export function actividadPorSector(sector: string): ActividadVulnerable | undefined {
  return ACTIVIDADES_VULNERABLES.find((a) => a.sector === sector);
}

/** Etiqueta completa para mostrar: «Fracción XII · Fe pública». */
export function etiquetaFraccion(sector: string): string {
  const a = actividadPorSector(sector);
  return a ? `Fracción ${a.fraccion} · ${a.nombre}` : `Fracción ${sector}`;
}
