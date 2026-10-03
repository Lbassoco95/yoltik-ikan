/** Etiquetas de presentación para formatos oficiales UIF (es-MX). */

export const REGIMEN_FORMATO_LABEL: Record<string, string> = {
  nov_2026: 'Noviembre 2026',
  dic_2026: 'Diciembre 2026',
  jun_2027: 'Junio 2027',
  jul_2027: 'Julio 2027',
};

function fechaMx(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', {
    dateStyle: 'long',
  });
}

/** dof-2026-09-24 → 24 de septiembre de 2026 */
export function etiquetaVersionDof(version: string): string {
  const m = version.match(/^dof-(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return version;
  return fechaMx(`${m[1]}-${m[2]}-${m[3]}`);
}

export function fechaCatalogoMx(iso: string | null | undefined): string {
  if (!iso) return '—';
  return fechaMx(iso);
}
