/**
 * Si un valor sirve para el layout, dicho mientras se captura.
 *
 * El día 17 no es momento de enterarse de que un RFC tiene doce caracteres en
 * vez de trece. Para entonces el compareciente ya se fue, el instrumento está
 * en el protocolo y corregir significa volver a buscarlo. Así que lo que el
 * instructivo exige del VALOR —longitud, patrón, formato— se comprueba en el
 * formulario del acto, campo por campo, en el momento en que se escribe.
 *
 * Cada regla sale de las columnas LONGITUD y FORMATO del instructivo. Ninguna
 * es criterio propio.
 *
 * Módulo puro.
 */

import type { CampoFep } from './campos-fep.generated';
import { controlDe } from './ramas-acto';

/** Patrón LLLLAAMMDDXXX del instructivo: cuatro letras para persona física,
 *  tres para moral. El & y la Ñ son letras válidas en un RFC. */
const RFC_PF = /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/;
const RFC_PM = /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/;
/** Patrón LLLLAAMMDDGEFCCC99. */
const CURP_RE = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/;

/** Los límites de la columna LONGITUD: "1-200", "13", "1 -254", "4 - 17". */
export function longitudesDe(campo: CampoFep): { min: number; max: number } | null {
  const m = campo.longitud.match(/^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/);
  if (!m) return null;
  const min = Number(m[1]);
  const max = Number(m[2] ?? m[1]);
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

/** Una fecha real, no sólo ocho dígitos: 20260231 pasa el patrón y no existe. */
function fechaReal(aaaa: number, mm: number, dd: number): boolean {
  if (mm < 1 || mm > 12 || dd < 1) return false;
  const d = new Date(Date.UTC(aaaa, mm - 1, dd));
  return d.getUTCFullYear() === aaaa && d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd;
}

/**
 * Qué está mal con el valor, en español, o null si sirve.
 *
 * Un campo vacío NO es un error aquí: que falte lo dice la lista de pendientes,
 * que sabe si el campo es exigible o sólo condicional. Esto juzga el contenido,
 * no la ausencia.
 */
export function validarCampo(campo: CampoFep, valor: string | null | undefined): string | null {
  const crudo = String(valor ?? '').trim();
  if (!crudo) return null;

  switch (controlDe(campo)) {
    case 'fecha': {
      const m = crudo.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
      if (!m) return 'La fecha va como AAAA-MM-DD.';
      if (!fechaReal(Number(m[1]), Number(m[2]), Number(m[3]))) return 'Esa fecha no existe.';
      return null;
    }

    case 'monto': {
      const n = Number(crudo.replace(/[, ]/g, ''));
      if (!Number.isFinite(n)) return 'Va un importe, sólo dígitos y punto decimal.';
      if (n < 0) return 'El importe no puede ser negativo.';
      // "1 entero de 14 dígitos, 1 punto y 2 decimales": 14 posiciones enteras.
      if (Math.floor(Math.abs(n)).toString().length > 14)
        return 'El formato del aviso admite hasta 14 dígitos enteros.';
      return null;
    }

    case 'si_no':
      return /^(SI|NO)$/i.test(crudo) ? null : 'Sólo admite SI o NO.';

    default: {
      const clave = crudo.toUpperCase();

      if (campo.etiqueta === 'rfc') {
        // Comparación EXACTA y no /12/: el diccionario declara hoy "13" y "12"
        // a secas, pero una versión futura del instructivo que dijera "12-13"
        // o "121" haría que un RFC válido mostrara un error falso.
        const moral = campo.longitud.trim() === '12';
        const largo = moral ? 12 : 13;
        if (clave.length !== largo)
          return `El RFC de persona ${moral ? 'moral' : 'física'} va con ${largo} caracteres; lleva ${clave.length}.`;
        return (moral ? RFC_PM : RFC_PF).test(clave)
          ? null
          : `Ese RFC no tiene la forma de uno de persona ${moral ? 'moral' : 'física'}: ` +
              `${moral ? 'tres' : 'cuatro'} letras, seis dígitos de fecha y tres caracteres.`;
      }

      if (campo.etiqueta === 'curp') {
        if (clave.length !== 18) return `La CURP va con 18 caracteres; lleva ${clave.length}.`;
        return CURP_RE.test(clave)
          ? null
          : 'Esa CURP no tiene la forma que pide el formato del aviso: cuatro letras, seis ' +
              'dígitos de fecha, H o M, y el resto de la clave.';
      }

      // El carácter va antes que la longitud: "M X" es un espacio de más, no
      // un país de tres letras, y decirlo bien ahorra el segundo intento. Un
      // espacio en una clave hace que el portal rechace el archivo entero.
      const control = controlDe(campo);
      if ((control === 'catalogo' || control === 'numero') && !/^[A-ZÑ&0-9]+$/.test(clave))
        return 'La clave sólo admite letras y dígitos.';

      const l = longitudesDe(campo);
      if (l) {
        if (clave.length < l.min)
          return `Va de ${l.min} a ${l.max} caracteres; lleva ${clave.length}.`;
        if (clave.length > l.max) return `El formato del aviso admite hasta ${l.max} caracteres.`;
      }

      return null;
    }
  }
}
