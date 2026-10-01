/**
 * Validación campo a campo contra la especificación de docs/formatos-uif/.
 *
 * Reglas:
 * - Condicional / obligatoriedad: se evalúa lo declarado; no se “arreglan” erratas.
 * - Longitud y patrón: según `longitud` y `formato` del JSON.
 * - Catálogo: si el catálogo no está cargado → el campo queda `no_validado`
 *   (nunca se acepta un valor libre como válido). Sin validación completa no
 *   se presenta el aviso como verificado.
 */

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

/** Extrae longitud máxima numérica. Soporta "13", "1-40", "N/A". */
export function longitudMaxima(longitud: string): number | null {
  if (!longitud || /^n\/a$/i.test(longitud.trim())) return null;
  const rango = longitud.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (rango) return Number(rango[2]);
  const n = longitud.trim().match(/^(\d+)$/);
  return n ? Number(n[1]) : null;
}

/**
 * Extrae un patrón usable desde el texto `formato` del DOF.
 * Sólo reconoce formas explícitas "Patrón: …". No inventa regex.
 */
export function patronDeclarado(formato: string): RegExp | null {
  if (!formato || /^n\/a$/i.test(formato.trim())) return null;
  const m = formato.match(/Patr[oó]n:\s*([^;]+)/i);
  if (!m) return null;
  const crudo = m[1].trim();
  // Patrones tipo LLLLAAMMDDXXX no son regex: se documentan, no se ejecutan
  // como tal. Sólo compilamos si el texto ya trae una expresión entre / /.
  const slash = crudo.match(/^\/(.+)\/([a-z]*)$/i);
  if (slash) {
    try {
      return new RegExp(slash[1], slash[2]);
    } catch {
      return null;
    }
  }
  return null;
}

/** Heurística conservadora: el formato menciona catálogo / clave de catálogo. */
export function detectarCatalogo(campo: CampoFormato): string | null {
  if (campo.catalogo_codigo) return campo.catalogo_codigo;
  const f = `${campo.formato} ${campo.nombre}`.toLowerCase();
  if (/fracci[oó]n arancelaria/.test(f)) return 'anexo_a_fracciones_arancelarias';
  if (/cat[aá]logo/.test(f) || /clave del cat[aá]logo/.test(f)) {
    // Catálogo genérico no identificado: se marca no_validado sin inventar código.
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

  const max = longitudMaxima(campo.longitud);
  if (max != null && [...valor].length > max) {
    return {
      estado: 'error',
      motivo: `Longitud ${[...valor].length} excede el máximo declarado ${max} (${campo.numero}).`,
    };
  }

  const re = patronDeclarado(campo.formato);
  if (re && !re.test(valor)) {
    return {
      estado: 'error',
      motivo: `No cumple el patrón declarado en el formato (${campo.numero}).`,
    };
  }

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
        motivo: `Valor «${valor}» no existe en el catálogo ${cat} (${campo.numero}).`,
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
