/**
 * Validación campo a campo contra la especificación de docs/formatos-uif/.
 *
 * Reglas:
 * - Condicional / obligatoriedad: se evalúa lo declarado; no se “arreglan” erratas.
 * - Longitud: exacta o min/máx (el mínimo se exige).
 * - Patrón: derivación determinista DOF (L/A/M/D/9/X); ambigüedad → `no_validado`.
 * - Tipo: Numérico / Alfabético / Alfanumérico según lo declarado.
 * - Catálogo: si no está cargado → `no_validado` (nunca valor libre como válido).
 * - Incumplimiento: mensaje con número de campo + valor esperado.
 * - Longitud/patrón/tipo se suman a obligatoriedad; no la duplican.
 */

import { derivarPatronDof } from './patron-dof';
import { clasificarFormato, validarProsa } from './formato-regla';

export { clasificarFormato } from './formato-regla';

export type ResultadoCampo =
  | { estado: 'ok' }
  | { estado: 'error'; motivo: string }
  | { estado: 'no_validado'; motivo: string }
  | { estado: 'omitido'; motivo: string };

export interface CampoFormato {
  orden: number;
  numero: string;
  padre: string | null;
  nombre: string;
  etiqueta_xml: string;
  obligatoriedad: string;
  tipo_dato: string;
  longitud: string;
  formato: string;
  catalogo_codigo?: string | null;
}

export interface ContextoValidacion {
  /** Valores capturados: clave = numero de campo o etiqueta_xml sin <>. */
  valores: Record<string, string | null | undefined>;
  /**
   * Catálogos disponibles: codigo → set de claves vigentes.
   * Ausente o vacío = catálogo no cargado.
   */
  catalogos: Record<string, Set<string> | undefined>;
  /** Si el campo nombra un catálogo (heurística o metadata). */
  catalogoDeCampo?: (campo: CampoFormato) => string | null;
}

const ETIQUETA = /^(Etiqueta|N\/A)$/i;

/** Normaliza la etiqueta XML a clave de valor (`<rfc>` → `rfc`). */
export function claveDeEtiqueta(etiquetaXml: string): string {
  return etiquetaXml.replace(/^<|>$/g, '').trim();
}

/**
 * ¿El campo es estructural (solo etiqueta de agrupación) y no lleva valor?
 * En el JSON, tipo_dato === 'Etiqueta' y longitud/formato N/A.
 */
export function esEtiquetaEstructural(campo: CampoFormato): boolean {
  return (
    ETIQUETA.test(campo.tipo_dato) ||
    (campo.longitud === 'N/A' && campo.formato === 'N/A' && /Etiqueta/i.test(campo.tipo_dato))
  );
}

/**
 * Obligatoriedad “base” sin interpretar condiciones de negocio no modeladas.
 * Las erratas del DOF (`Obligatiorio`, `honeroso`) se tratan como obligatorias
 * si empiezan por “Obligat” — se registran en INCONSISTENCIAS.md, no se corrigen.
 */
export function esObligatorioDeclarado(obligatoriedad: string): boolean {
  const o = obligatoriedad.trim();
  if (/^opcional$/i.test(o)) return false;
  // "1-200" aparece como obligatoriedad en un campo (inconsistencia).
  if (/^\d/.test(o)) return false;
  if (/^obligat/i.test(o)) return true;
  return false;
}

/** Condición textual no evaluable con el modelo actual → no se inventa. */
export function esCondicionalNoEvaluable(obligatoriedad: string): boolean {
  const o = obligatoriedad.trim();
  if (/^obligatorio$/i.test(o) || /^opcional$/i.test(o) || /^obligatiorio$/i.test(o)) {
    return false;
  }
  return /^obligat/i.test(o);
}

export type LongitudDeclarada =
  | { clase: 'exacta'; n: number; esperado: string }
  | { clase: 'rango'; min: number; max: number; esperado: string }
  | { clase: 'ausente' }
  | { clase: 'no_interpretable'; crudo: string };

/** Interpreta `longitud` del DOF: "13", "1-40", "4 - 25", "N/A". */
export function longitudDeclarada(longitud: string): LongitudDeclarada {
  if (!longitud || /^n\/a$/i.test(longitud.trim())) return { clase: 'ausente' };
  const rango = longitud.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (rango) {
    const min = Number(rango[1]);
    const max = Number(rango[2]);
    return { clase: 'rango', min, max, esperado: `${min}-${max}` };
  }
  const n = longitud.trim().match(/^(\d+)$/);
  if (n) {
    const exacta = Number(n[1]);
    return { clase: 'exacta', n: exacta, esperado: String(exacta) };
  }
  return { clase: 'no_interpretable', crudo: longitud };
}

/** @deprecated Preferir `longitudDeclarada`. Conservado para pruebas existentes. */
export function longitudMaxima(longitud: string): number | null {
  const d = longitudDeclarada(longitud);
  if (d.clase === 'exacta') return d.n;
  if (d.clase === 'rango') return d.max;
  return null;
}

/** @deprecated Preferir `derivarPatronDof` en `patron-dof.ts`. */
export function patronDeclarado(formato: string): RegExp | null {
  const p = derivarPatronDof(formato);
  return p.estado === 'derivado' ? p.regex : null;
}

/** Heurística conservadora: el formato menciona catálogo / clave de catálogo. */
export function detectarCatalogo(campo: CampoFormato): string | null {
  if (campo.catalogo_codigo) return campo.catalogo_codigo;
  const f = `${campo.formato} ${campo.nombre}`.toLowerCase();
  if (/fracci[oó]n arancelaria/.test(f)) return 'anexo_a_fracciones_arancelarias';
  if (/cat[aá]logo/.test(f) || /clave del cat[aá]logo/.test(f)) {
    return '__catalogo_no_identificado__';
  }
  return null;
}

function valorDe(campo: CampoFormato, valores: Record<string, string | null | undefined>): string | null {
  const porNumero = valores[campo.numero];
  if (porNumero != null && String(porNumero).length) return String(porNumero);
  const porEtiqueta = valores[claveDeEtiqueta(campo.etiqueta_xml)];
  if (porEtiqueta != null && String(porEtiqueta).length) return String(porEtiqueta);
  return null;
}

function longitudDeValor(valor: string): number {
  return [...valor].length;
}

/**
 * Tipo declarado. Alfanumérico no restringe el alfabeto (textos libres del DOF).
 * No se normaliza el valor: minúsculas fallan si el tipo exige A-Z.
 */
export function validarTipoDato(
  tipoDato: string,
  valor: string,
  numeroCampo: string,
): ResultadoCampo | null {
  const t = tipoDato.trim();
  if (!t || /^n\/a$/i.test(t) || /^etiqueta$/i.test(t)) return null;

  if (/^num[eé]rico$/i.test(t)) {
    if (!/^[0-9]+([.][0-9]+)?$/.test(valor)) {
      return {
        estado: 'error',
        motivo: `Campo ${numeroCampo}: tipo Numérico esperado; valor no numérico.`,
      };
    }
    return null;
  }

  if (/^alfab[eé]tic[oa]$/i.test(t)) {
    // Constructor: evita que tsc interprete mal la clase con Ñ/ñ.
    if (!new RegExp('^[A-Za-z\u00D1\u00F1]+$').test(valor)) {
      return {
        estado: 'error',
        motivo: `Campo ${numeroCampo}: tipo Alfabético esperado (solo letras); valor incompatible.`,
      };
    }
    return null;
  }

  // Alfanumérico / otros: sin restricción de alfabeto más allá de longitud/patrón.
  return null;
}

export function validarCampo(campo: CampoFormato, ctx: ContextoValidacion): ResultadoCampo {
  if (esEtiquetaEstructural(campo)) {
    return { estado: 'omitido', motivo: 'Etiqueta estructural: no lleva valor.' };
  }

  const valor = valorDe(campo, ctx.valores);
  const obligatorio = esObligatorioDeclarado(campo.obligatoriedad);
  const condicional = esCondicionalNoEvaluable(campo.obligatoriedad);

  if (valor == null || valor === '') {
    if (condicional) {
      return {
        estado: 'no_validado',
        motivo: `Obligatoriedad condicional no evaluada automáticamente: «${campo.obligatoriedad}».`,
      };
    }
    if (obligatorio) {
      return { estado: 'error', motivo: `Campo obligatorio vacío (${campo.numero} ${campo.nombre}).` };
    }
    return { estado: 'omitido', motivo: 'Opcional sin valor.' };
  }

  // Longitud (exacta o min/máx). Se suma a obligatoriedad; no se re-emite el vacío.
  const long = longitudDeclarada(campo.longitud);
  const len = longitudDeValor(valor);
  if (long.clase === 'exacta' && len !== long.n) {
    return {
      estado: 'error',
      motivo: `Campo ${campo.numero}: longitud ${len} ≠ esperada ${long.esperado}.`,
    };
  }
  if (long.clase === 'rango' && (len < long.min || len > long.max)) {
    return {
      estado: 'error',
      motivo: `Campo ${campo.numero}: longitud ${len} fuera de rango esperado ${long.esperado}.`,
    };
  }
  if (long.clase === 'no_interpretable') {
    return {
      estado: 'no_validado',
      motivo: `Campo ${campo.numero}: longitud «${long.crudo}» no interpretable.`,
    };
  }

  const tipoErr = validarTipoDato(campo.tipo_dato, valor, campo.numero);
  if (tipoErr) return tipoErr;

  // Formato: derivado (L/A/M/D/9/X) | prosa (montos/enums) | no_validado. Sin silencio.
  const reglaFmt = clasificarFormato(campo.formato);
  if (reglaFmt.cubo === 'no_validado') {
    return {
      estado: 'no_validado',
      motivo: `Campo ${campo.numero}: formato no validado — ${reglaFmt.motivo}`,
    };
  }
  if (reglaFmt.cubo === 'prosa') {
    const pr = validarProsa(reglaFmt.regla, valor, campo.numero);
    if (pr.estado === 'error') return pr;
  }
  if (reglaFmt.cubo === 'derivado') {
    const patron = reglaFmt.patron;
    if (!patron.regex.test(valor)) {
      return {
        estado: 'error',
        motivo: `Campo ${campo.numero}: no cumple patrón esperado ${patron.esperado}.`,
      };
    }
    if (patron.sinCerosIzquierda) {
      const cola = valor.includes('-') ? valor.slice(valor.indexOf('-') + 1) : valor;
      if (cola.length > 1 && cola.startsWith('0')) {
        return {
          estado: 'error',
          motivo: `Campo ${campo.numero}: patrón ${patron.esperado} sin ceros a la izquierda.`,
        };
      }
    }
  }
  // cubo ausente (N/A): sin regla de formato; longitud/tipo bastan.

  const resolver = ctx.catalogoDeCampo ?? detectarCatalogo;
  const cat = resolver(campo);
  if (cat) {
    const claves = ctx.catalogos[cat];
    if (!claves || claves.size === 0) {
      return {
        estado: 'no_validado',
        motivo:
          cat === '__catalogo_no_identificado__'
            ? `Depende de un catálogo UIF no identificado/cargado (${campo.numero}). No se acepta valor libre como válido.`
            : `Catálogo «${cat}» ausente o vacío. Campo no validado; no presentar como verificado.`,
      };
    }
    if (!claves.has(valor)) {
      return {
        estado: 'error',
        motivo: `Campo ${campo.numero}: valor «${valor}» no existe en el catálogo ${cat} (esperado: clave del catálogo).`,
      };
    }
  }

  return { estado: 'ok' };
}

export interface ResumenValidacion {
  ok: boolean;
  /** true sólo si no hay errores NI campos no_validados. */
  verificado: boolean;
  resultados: { campo: CampoFormato; resultado: ResultadoCampo }[];
  errores: string[];
  noValidados: string[];
}

export function validarFormato(campos: CampoFormato[], ctx: ContextoValidacion): ResumenValidacion {
  const resultados = campos.map((campo) => ({ campo, resultado: validarCampo(campo, ctx) }));
  const errores = resultados
    .filter((r) => r.resultado.estado === 'error')
    .map((r) => (r.resultado as { motivo: string }).motivo);
  const noValidados = resultados
    .filter((r) => r.resultado.estado === 'no_validado')
    .map((r) => `${r.campo.numero}: ${(r.resultado as { motivo: string }).motivo}`);

  return {
    ok: errores.length === 0,
    verificado: errores.length === 0 && noValidados.length === 0,
    resultados,
    errores,
    noValidados,
  };
}
