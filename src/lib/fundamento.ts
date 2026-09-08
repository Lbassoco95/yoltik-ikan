import type { ParametroVigente } from "@/lib/parametros";

/** Fecha corta en dd/mm/aaaa, que es como se citan las publicaciones del DOF. */
function fecha(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * La línea de fundamento de un parámetro regulatorio: de dónde sale la cifra.
 *
 * No hay nada inventado aquí: `fuente`, `publicacion_dof`, `vigente_desde` y
 * la pareja `confirmado_por`/`confirmado_en` son columnas de
 * `parametros_regulatorios`. Lo único que aporta este código es el orden en
 * que se leen —de dónde sale, cuándo se publicó, desde cuándo rige, quién lo
 * confirmó—, que es el orden en que alguien la verifica.
 *
 * Es la mitad de datos del `<Cartucho>` de ESTELA, y la razón de que el
 * componente exista: la base exigía guardar la procedencia de cada parámetro
 * desde el principio, y la interfaz pintaba el número y se la guardaba.
 */
export function fundamentoDe(p: ParametroVigente): string {
  const partes = [p.fuente];
  const dof = fecha(p.publicacion_dof);
  if (dof) partes.push(`DOF ${dof}`);
  const desde = fecha(p.vigente_desde);
  if (desde) partes.push(`vigente desde ${desde}`);
  if (p.confirmado_por) {
    const cuando = fecha(p.confirmado_en);
    partes.push(
      cuando
        ? `validado por ${p.confirmado_por} · ${cuando}`
        : `validado por ${p.confirmado_por}`,
    );
  }
  return partes.filter(Boolean).join(" · ");
}

/** Cómo se escribe el valor de un parámetro según su unidad. */
export function valorDe(
  p: ParametroVigente,
  formatMxn: (n: number, conCentavos?: boolean) => string,
): string {
  const n = p.valor_numerico;
  switch (p.unidad) {
    case "mxn":
      return formatMxn(n, true);
    case "uma":
      return `${n.toLocaleString("es-MX")} UMA`;
    case "dia":
      return `${n.toLocaleString("es-MX")} ${n === 1 ? "día" : "días"}`;
    case "anio":
      return `${n.toLocaleString("es-MX")} ${n === 1 ? "año" : "años"}`;
    case "porcentaje":
      return `${n.toLocaleString("es-MX")} %`;
    case "operacion":
      return `${n.toLocaleString("es-MX")} ${n === 1 ? "operación" : "operaciones"}`;
    default:
      return n.toLocaleString("es-MX");
  }
}
