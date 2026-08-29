import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// =====================================================================
// La UMA y los umbrales YA NO viven aquí.
// =====================================================================
// Estaban declarados como constantes (`UMA_MXN = 113.07`) y el mock declaraba
// otro valor distinto (132.59) que era el que veía el usuario, mientras el
// motor calculaba con el primero. Ninguno era correcto.
//
// Ahora son parámetros con vigencia y fuente en `parametro_regulatorio`
// (migration 0011). Se leen con `useParametros()` en el front y desde la base
// en el Motor PLD. Si no hay parámetro vigente se muestra un guion; no se
// sustituye por un valor por omisión.
//
// Ver: src/lib/parametros.ts · src/lib/api/parametros.ts · src/hooks/useParametros.ts
// =====================================================================

export function formatMxn(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}

/** Convierte un monto en pesos a UMA. Requiere el valor vigente de la UMA,
 *  que viene de `parametro_regulatorio`, nunca de una constante local. */
export function mxnToUma(montoMxn: number, umaMxn: number): number {
  return montoMxn / umaMxn;
}

/** Convierte un valor en UMA a pesos, con la UMA vigente que reciba. */
export function umaToMxn(uma: number, umaMxn: number): number {
  return uma * umaMxn;
}
