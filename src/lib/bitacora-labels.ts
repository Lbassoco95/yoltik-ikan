import type { EventoListado } from "@/lib/api/bitacora";

/**
 * Cómo se leen los eventos de bitácora en palabras.
 *
 * Vivían dentro de `AuditPage`, que era su único consumidor. Al llevar la
 * bitácora también al tablero —ESTELA la pone ahí como hilo de lo que acaba
 * de pasar— dejan de ser de una pantalla: si el tablero y Auditoría llamaran
 * distinto al mismo evento, quien lo viera en los dos sitios pensaría que son
 * dos cosas. Misma tabla de nombres, un solo idioma.
 *
 * Regla en los tres mapas: lo que no esté aquí se muestra tal cual. Un
 * identificador feo es preferible a un nombre inventado.
 */

/** `operation.insert` → «Alta». */
const OPERACION: Record<string, string> = {
  insert: "Alta",
  update: "Cambio",
  delete: "Baja",
};

/**
 * Nombre de la tabla → nombre en español.
 *
 * El filtro y la columna enseñaban el identificador crudo de la base
 * (`operation`, `catalogo_valor`), que sólo significa algo para quien conoce
 * el esquema.
 */
const ENTIDAD: Record<string, string> = {
  client: "Compareciente",
  operation: "Acto u operación",
  hallazgo: "Hallazgo",
  hallazgo_bitacora: "Movimiento de hallazgo",
  aviso: "Aviso",
  catalogo_valor: "Valor de catálogo",
  lista_movimiento: "Movimiento de lista",
  parametro_regulatorio: "Parámetro regulatorio",
};

export function entidadLegible(entidad: string): string {
  return ENTIDAD[entidad] ?? entidad;
}

export function accionLegible(tipo: string): string {
  const [, op] = tipo.split(".");
  return OPERACION[op] ?? tipo;
}

/** `operation.insert` → «Alta · Acto u operación», para el desplegable. */
export function tipoLegible(tipo: string): string {
  const [entidad, op] = tipo.split(".");
  if (!op) return tipo;
  return `${OPERACION[op] ?? op} · ${entidadLegible(entidad)}`;
}

/** El actor, en palabras. `persona` sin id es un evento del sistema sin sesión
 *  (un job, una migración): decirlo es mejor que enseñar un UUID vacío. */
export function actorLegible(e: EventoListado): string {
  switch (e.actor_tipo) {
    case "motor":
      return "Motor PLD";
    case "job":
      return "Proceso programado";
    case "sistema":
      return "Sistema";
    default:
      return e.actor_id ? e.actor_id.slice(0, 8) : "Sin sesión";
  }
}

/** Una línea de bitácora contada de corrido: «Alta · Acto u operación». */
export function descripcionEvento(e: EventoListado): string {
  return `${accionLegible(e.tipo)} · ${entidadLegible(e.entidad)}`;
}
