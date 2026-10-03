/**
 * Derivación determinista de patrones DOF (L / A / M / D / 9 / X).
 *
 * No se inventa regex a mano por campo. No se normaliza el valor del usuario.
 * Notación incompleta, ambigua o tipo regex → `no_validado` (como catálogo ausente).
 */

export type PatronDof =
  | {
      estado: 'derivado';
      regex: RegExp;
      esperado: string;
      crudo: string;
      /** Restricción literal del DOF tras el token (no se inventa). */
      sinCerosIzquierda?: boolean;
    }
  | { estado: 'no_validado'; motivo: string; crudo: string }
  | { estado: 'ausente' };

/** Extrae el texto crudo del patrón desde `formato` del JSON DOF. */
export function textoPatronCrudo(formato: string): string | null {
  if (!formato || /^n\/a$/i.test(formato.trim())) return null;
  const conPatron = formato.match(/Patr[oó]n:\s*(.+)$/i);
  if (conPatron) return conPatron[1].trim();

  // Formato: AA / AAAAMM (token DOF sin prefijo «Patrón:»)
  const conFormato = formato.trim().match(/^Formato:\s*([LAMD9X]+)\b/);
  if (conFormato) return conFormato[1];

  const bare = formato.trim();
  if (/^[LAMD9X]+$/.test(bare)) return bare;
  return null;
}

function esDateish(token: string): boolean {
  // AAAAMM, AAAAMMDD, AAAAMMDDHHMISS, … y tokens con MMDD (RFC/CURP).
  return (
    /M{2}D{2}/.test(token) ||
    /^A{2,8}M{2}(D{2})?(H{2}(I{2}S{2})?)?$/.test(token)
  );
}

function letraL(donde: string): string {
  // RFC: L=(A-Z) letra o caracteres & o Ñ
  if (/&/.test(donde) || /Ñ/i.test(donde)) return '[A-ZÑ&]';
  return '[A-Z]';
}

function clasePara(
  ch: string,
  token: string,
  donde: string,
): string | null {
  const dateish = esDateish(token) || (token.includes('-') && /^A{4}-9+$/.test(token));
  switch (ch) {
    case 'L':
      return letraL(donde);
    case '9':
      return '[0-9]';
    case 'X':
      return '[A-Z0-9]';
    case 'A':
      // Año (dígito) en fechas/RFC/CURP; letra en claves tipo AAA / AA
      return dateish || /[MD]/.test(token) || token.includes('-') ? '[0-9]' : '[A-Z]';
    case 'M':
    case 'D':
      return dateish || /M{2}D{2}/.test(token) ? '[0-9]' : null;
    case 'G':
      // CURP: G = M ó H
      return donde ? '[MH]' : null;
    case 'E':
    case 'F':
    case 'C':
      return donde ? '[A-Z]' : null;
    case 'H':
      // CURP: H = letra o número; en fecha/hora HH = dígitos
      if (esDateish(token)) return '[0-9]';
      return donde ? '[A-Z0-9]' : null;
    case 'I':
    case 'S':
      return esDateish(token) ? '[0-9]' : null;
    default:
      return null;
  }
}

function compilarAlternativa(token: string, donde: string): string | null {
  if (!token) return null;
  if (token.includes('-')) {
    if (!/^A{4}-9+$/.test(token)) return null;
    // AAAA-999999999 → 4 dígitos, guion, N dígitos
    const digitos = token.length - 5;
    return `[0-9]{4}-[0-9]{${digitos}}`;
  }

  let out = '';
  for (const ch of token) {
    const clase = clasePara(ch, token, donde);
    if (!clase) return null;
    out += clase;
  }
  return out;
}

/**
 * Deriva un RegExp anclado desde la notación DOF del campo.
 * Si el texto no es derivable de forma inequívoca → `no_validado`.
 */
export function derivarPatronDof(formato: string): PatronDof {
  const crudoFull = textoPatronCrudo(formato);
  if (!crudoFull) return { estado: 'ausente' };

  const partes = crudoFull.split(/\s+en\s+donde\s*,?\s*/i);
  let base = partes[0].trim();
  const donde = partes[1]?.trim() ?? '';

  base = base.replace(/;+\s*$/, '').trim();
  const sinCerosIzquierda = /sin ceros a la izquierda/i.test(crudoFull);
  // Notas entre paréntesis al final («sin ceros a la izquierda»)
  base = base.replace(/\s*\([^)]*\)\s*$/, '').trim();

  // Notación tipo regex del DOF (correo, etc.) — no se “arregla”
  if ([...'[]()+*?@|\\'].some((ch) => base.includes(ch))) {
    return {
      estado: 'no_validado',
      motivo: 'Patrón con notación tipo regex o metacaracteres; no se deriva ni se adivina.',
      crudo: crudoFull,
    };
  }

  // Espacios dentro del token (p. ej. correo con `[0- 9]` o `/ LLL…`)
  const compact = base.replace(/\s*\/\s*/g, '/');
  if (/\s/.test(compact)) {
    return {
      estado: 'no_validado',
      motivo: 'Patrón con espacios en la notación; inconsistencia de extracción/DOF.',
      crudo: crudoFull,
    };
  }
  base = compact;

  if (!base) {
    return { estado: 'no_validado', motivo: 'Patrón vacío tras normalizar delimitadores.', crudo: crudoFull };
  }

  const alts = base.split('/');
  const compiladas: string[] = [];
  for (const alt of alts) {
    const pieza = compilarAlternativa(alt, donde);
    if (!pieza) {
      return {
        estado: 'no_validado',
        motivo: `Símbolo o notación no derivable en «${alt}» (solo L/A/M/D/9/X y extras definidos en «en donde»).`,
        crudo: crudoFull,
      };
    }
    compiladas.push(pieza);
  }

  const body = compiladas.length === 1 ? compiladas[0] : `(?:${compiladas.join('|')})`;
  return {
    estado: 'derivado',
    regex: new RegExp(`^${body}$`),
    esperado: base,
    crudo: crudoFull,
    sinCerosIzquierda: sinCerosIzquierda || undefined,
  };
}
