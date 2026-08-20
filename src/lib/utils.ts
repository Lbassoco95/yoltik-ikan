import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * UMA 2026 — referencia. Verificar al cierre de cada año con INEGI.
 * Umbral de identificación PLD: 645 UMA = 72,930.15 MXN aprox (Art. 17 LFPIORPI).
 */
export const UMA_MXN = 113.07;

export const UMBRAL_IDENTIFICACION_UMA = 645;
export const UMBRAL_IDENTIFICACION_MXN = UMA_MXN * UMBRAL_IDENTIFICACION_UMA;

export function umaToMxn(uma: number): number {
  return uma * UMA_MXN;
}

export function formatMxn(value: number): string {
  return formatMxnValue(value);
}

export function formatMxnWithUnit(value: number): string {
  return formatMxn(value) + " MXN";
}

export function formatMxnValue(value: number): string {
  return "$" + value.toLocaleString("es-MX", { maximumFractionDigits: 0 });
}
