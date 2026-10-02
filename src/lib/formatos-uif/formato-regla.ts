/**
 * Clasificación exhaustiva de la columna `formato` del DOF.
 *
 * Todo campo con contenido en `formato` cae en exactamente un cubo:
 *   derivado | prosa | no_validado
 * Ninguno en silencio.
 */

import { derivarPatronDof, type PatronDof } from './patron-dof';

export type ReglaProsa =
  | { clase: 'monto'; minDec: number; maxDec: number; enterosMax: number; esperado: string }
  | { clase: 'enum'; valores: readonly string[]; esperado: string };

export type ReglaFormato =
  | { cubo: 'derivado'; patron: Extract<PatronDof, { estado: 'derivado' }> }
  | { cubo: 'prosa'; regla: ReglaProsa; crudo: string }
  | { cubo: 'no_validado'; motivo: string; crudo: string }
  | { cubo: 'ausente' };

const MONTO_2 =
  /14\s*d[ií]gitos\s+con\s+2\s+decimales\s+obligatorios/i;
const MONTO_2_A_10 =
  /14\s*d[ií]gitos\s+con\s+2\s+a\s+10\s+decimales/i;
const ENUM_SI_NO_CADENA =
  /Solo se permite la cadena\s*"SI"\s*o\s*"NO"/i;
const ENUM_SI_NO_FORMATO = /^Formato:\s*SI\/NO\s*$/i;
const ENUM_A_B = /Solo se permite\s*"A"\s*o\s*"B"/i;
const TELEFONO_REGION = /Clave de regi[oó]n\s*\+\s*n[uú]mero telef[oó]nico/i;

/** Fragmentos de RFC/CURP/fecha partidos por la extracción (sin token usable). */
function esFragmentoPartido(formato: string): boolean {
  const f = formato.trim();
  if (/^(Patr[oó]n:|Formato:)/i.test(f)) return false;
  if (/^[LAMD9X]+$/.test(f)) return false;
  // Tiene Patrón: embebido → lo atiende derivarPatronDof, no es fragmento mudo.
  if (/Patr[oó]n:/i.test(f)) return false;
  return (
    /en donde/i.test(f) ||
    /^donde,/i.test(f) ||
    /^L=/i.test(f) ||
    /^Z\)/i.test(f) ||
    /^MM=mes/i.test(f) ||
    /^caracteres\s*&/i.test(f) ||
    /^letra o caracteres/i.test(f) ||
    /^\d+\),\s*DD=/i.test(f) ||
    /letra o caracteres\s*&\s*o\s*Ñ/i.test(f)
  );
}

export function clasificarFormato(formato: string): ReglaFormato {
  const crudo = (formato ?? '').trim();
  if (!crudo || /^n\/a$/i.test(crudo)) return { cubo: 'ausente' };

  // Prosa numérica / enumeración (antes del tokenizador).
  if (MONTO_2.test(crudo) && !/2\s+a\s+10/i.test(crudo)) {
    return {
      cubo: 'prosa',
      crudo,
      regla: {
        clase: 'monto',
        enterosMax: 14,
        minDec: 2,
        maxDec: 2,
        esperado: '14 dígitos con 2 decimales obligatorios',
      },
    };
  }
  if (MONTO_2_A_10.test(crudo)) {
    return {
      cubo: 'prosa',
      crudo,
      regla: {
        clase: 'monto',
        enterosMax: 14,
        minDec: 2,
        maxDec: 10,
        esperado: '14 dígitos con 2 a 10 decimales',
      },
    };
  }
  if (ENUM_SI_NO_CADENA.test(crudo) || ENUM_SI_NO_FORMATO.test(crudo)) {
    return {
      cubo: 'prosa',
      crudo,
      regla: { clase: 'enum', valores: ['SI', 'NO'], esperado: 'SI|NO' },
    };
  }
  if (ENUM_A_B.test(crudo)) {
    return {
      cubo: 'prosa',
      crudo,
      regla: { clase: 'enum', valores: ['A', 'B'], esperado: 'A|B' },
    };
  }

  const patron = derivarPatronDof(crudo);
  if (patron.estado === 'derivado') return { cubo: 'derivado', patron };
  if (patron.estado === 'no_validado') {
    return { cubo: 'no_validado', motivo: patron.motivo, crudo: patron.crudo };
  }

  if (TELEFONO_REGION.test(crudo)) {
    return {
      cubo: 'no_validado',
      motivo:
        'Formato «Clave de región + número telefónico» sin catálogo/regla derivable; no se adivina.',
      crudo,
    };
  }

  if (esFragmentoPartido(crudo)) {
    return {
      cubo: 'no_validado',
      motivo:
        'Fragmento de patrón partido en la extracción (RFC/CURP/fecha incompleto); no se reconstruye.',
      crudo,
    };
  }

  // Remite a la capa de catálogo (no es patrón/prosa). No cuenta como silencio
  // en el cuadrado 1660: en los JSON DOF no aparece este texto suelto.
  if (/clave del cat[aá]logo/i.test(crudo) || /^cat[aá]logo\b/i.test(crudo)) {
    return { cubo: 'ausente' };
  }

  return {
    cubo: 'no_validado',
    motivo: 'Formato con contenido no clasificado (sin token DOF ni prosa conocida).',
    crudo,
  };
}

/** Valida un valor ya presente contra una regla de prosa. */
export function validarProsa(
  regla: ReglaProsa,
  valor: string,
  numeroCampo: string,
): { estado: 'ok' } | { estado: 'error'; motivo: string } {
  if (regla.clase === 'enum') {
    if ((regla.valores as readonly string[]).includes(valor)) return { estado: 'ok' };
    return {
      estado: 'error',
      motivo: `Campo ${numeroCampo}: esperado ${regla.esperado}; recibido «${valor}».`,
    };
  }

  // Monto: decimales obligatorios; sin punto decimal = rechazo.
  const m = valor.match(/^(\d+)\.(\d+)$/);
  if (!m) {
    return {
      estado: 'error',
      motivo: `Campo ${numeroCampo}: esperado ${regla.esperado} (decimales obligatorios).`,
    };
  }
  const enteros = m[1];
  const dec = m[2];
  if (enteros.length < 1 || enteros.length > regla.enterosMax) {
    return {
      estado: 'error',
      motivo: `Campo ${numeroCampo}: parte entera ${enteros.length} fuera de 1–${regla.enterosMax} (${regla.esperado}).`,
    };
  }
  if (dec.length < regla.minDec || dec.length > regla.maxDec) {
    return {
      estado: 'error',
      motivo: `Campo ${numeroCampo}: ${dec.length} decimales; esperado ${regla.minDec}${
        regla.minDec === regla.maxDec ? '' : `–${regla.maxDec}`
      } (${regla.esperado}).`,
    };
  }
  return { estado: 'ok' };
}
