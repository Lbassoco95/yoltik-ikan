/**
 * La célula de cumplimiento de Kawiil: las personas de carne y hueso detrás
 * del producto.
 *
 * ESTELA la pone en la barra lateral a la vista permanentemente, y no por
 * simpatía: un sujeto obligado que no sabe a quién llamar cuando el umbral no
 * le cuadra acaba llamando a nadie. Poner nombre y ciudad convierte «el
 * sistema» en «Fulana, en Mérida».
 *
 * Los nombres NO se inventan. Mientras Dirección no confirme quiénes componen
 * la célula y con qué correo se les escribe, la lista va vacía y el bloque
 * sencillamente no se dibuja —que es honesto— en vez de enseñar personas que
 * no existen —que en un producto de cumplimiento es exactamente el tipo de
 * dato que nadie debería poder inventar—.
 *
 * TODO[Sprint D-2]: pedir a Dirección la integración de la célula (nombre,
 * ciudad, correo de contacto) y el compromiso de respuesta que se puede
 * publicar. En cuanto estén, se rellenan aquí y el bloque aparece solo.
 */

export interface MiembroCelula {
  /** Nombre como quiere que se le nombre, no el del acta. */
  nombre: string;
  /** Ciudad desde la que atiende. */
  ciudad: string;
}

export const CELULA_CUMPLIMIENTO: readonly MiembroCelula[] = [];

/** Buzón de la célula. `null` mientras no haya uno confirmado. */
export const CORREO_CELULA: string | null = null;

/**
 * Compromiso de respuesta publicable, ya redactado. `null` mientras Dirección
 * no lo confirme: prometer un plazo de atención que nadie firmó es una
 * promesa que el producto no puede cumplir.
 */
export const COMPROMISO_CELULA: string | null = null;

/** Iniciales para el círculo del avatar. */
export function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase();
}

/** ¿Hay algo que enseñar? Si no, el bloque no se dibuja. */
export const HAY_CELULA =
  CELULA_CUMPLIMIENTO.length > 0 || CORREO_CELULA !== null;
