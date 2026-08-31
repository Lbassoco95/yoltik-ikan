import type { MatrizConfig, MatrizVariable, TipoPersona } from '@/types/domain';
import { variablesAplicables } from './matriz';

/**
 * Lo que la matriz puede responderse sola con lo que ya está capturado.
 *
 * ---------------------------------------------------------------------
 * La regla que gobierna este módulo
 * ---------------------------------------------------------------------
 * Sólo responde lo que se DERIVA de un dato registrado, con una fuente que se
 * puede nombrar. Nunca estima, nunca elige "la opción media" porque falte el
 * dato, nunca supone.
 *
 * La tentación es evidente: si la matriz tiene ocho variables y sólo tres se
 * pueden derivar, dejar cinco vacías se ve peor que rellenarlas con algo
 * razonable. Pero una clasificación de riesgo es un dictamen que el sujeto
 * obligado presenta ante la autoridad, y que la mitad salga de una suposición
 * del software la vuelve indefendible entera. Prefiere quedarse corto.
 *
 * Por eso cada respuesta trae `fuente`: el OC ve de dónde salió y puede
 * cambiarla. Lo que el sistema no puede saber se queda sin responder y se dice.
 *
 * ---------------------------------------------------------------------
 * Lo que HOY no se puede derivar, y por qué
 * ---------------------------------------------------------------------
 *   Valor de la operación en UMA
 *     La variable tiene los tramos 645 / 3,210 UMA: umbrales de ACTIVOS
 *     VIRTUALES del régimen anterior a la reforma DOF 16/07/2025, en una matriz
 *     de fe pública. Responderla sería clasificar contra cifras derogadas de
 *     otra fracción. Pendiente de que Kawiil-Cumplimiento fije los tramos.
 *
 *   Actividad o profesión · Giro de la sociedad
 *     La matriz pide bajo/medio/alto y nosotros capturamos una clave del
 *     catálogo de la UIF con cientos de valores. Falta la regla que dice qué
 *     claves son de riesgo alto. Inventarla sería decidir metodología.
 *
 *   Condición de PEP · Forma de pago
 *     No hay ningún campo en Ikán donde se registren. No es que no se deriven:
 *     es que el dato no existe.
 *
 *   Beneficiario controlador identificado
 *     El módulo de estructura societaria no existe todavía.
 *
 *   País de origen de los fondos
 *     Tentador derivarlo de la residencia del compareciente, y sería un error:
 *     dónde vive alguien y de dónde salió el dinero son cosas distintas, y
 *     confundirlas es exactamente lo que la variable existe para detectar.
 *
 * Módulo puro: sin red, sin React. Se prueba solo.
 */

export interface RespuestaSugerida {
  variable_codigo: string;
  valor: number;
  /** La opción que se eligió, con su texto. Para que el OC vea qué se contestó. */
  etiqueta: string;
  /** De dónde salió, en español y sin jerga. Es lo que hace revisable la sugerencia. */
  fuente: string;
}

/** Lo que el sistema conoce del compareciente y del acto al pre-llenar. */
export interface ContextoPrellenado {
  tipo_persona: TipoPersona;
  /** ISO2 de residencia (persona física) o de constitución (persona moral). */
  pais_iso2?: string | null;
  /** Tipo de acto del layout, cuando el pre-llenado se hace desde un acto. */
  tipo_acto?: string | null;
  /** Moneda de la operación. 'MXN' o el código de la divisa. */
  moneda_origen?: string | null;
  /** Activo virtual involucrado, si lo hay. */
  activo_virtual?: string | null;
  /** Países en listas GAFI, del snapshot que ya usa el Motor PLD. */
  gafi_gris?: Set<string>;
  gafi_negra?: Set<string>;
}

/**
 * Los cuatro tipos de acto que la matriz nombra, con su etiqueta oficial.
 *
 * La matriz se escribió con los nombres anteriores a la migration 0031
 * —«Compraventa de inmueble», «Constitución de sociedad»— y el catálogo del
 * layout usa otros. La correspondencia es la misma que aplicó la 0031 sobre las
 * operaciones: no es criterio nuevo, es el mismo acto con su nombre oficial.
 *
 * Los otros SIETE tipos del layout no están en la matriz y por eso no se
 * responden: asignarles un valor de riesgo sería decidir metodología.
 */
const ACTO_EN_MATRIZ: Record<string, string> = {
  transmision_inmueble: 'Compraventa de inmueble',
  constitucion_personas_morales: 'Constitución de sociedad',
  constitucion_modificacion_fideicomiso: 'Fideicomiso',
  otorgamiento_poder: 'Poder irrevocable',
};

/** Busca la opción cuyo texto empieza igual, sin depender de mayúsculas ni acentos. */
function opcionPorTexto(v: MatrizVariable, texto: string) {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
  return v.opciones.find((o) => norm(o.label) === norm(texto));
}

/** Riesgo del país según el snapshot GAFI, en las palabras de la matriz. */
function nivelPais(
  iso2: string,
  ctx: ContextoPrellenado,
): 'nacional' | 'sin_observaciones' | 'gris' | 'negra' {
  const p = iso2.toUpperCase();
  if (p === 'MX') return 'nacional';
  if (ctx.gafi_negra?.has(p)) return 'negra';
  if (ctx.gafi_gris?.has(p)) return 'gris';
  return 'sin_observaciones';
}

/**
 * Elige entre las opciones de una variable de país.
 *
 * Las variables de persona física tienen TRES opciones (nacional / extranjero
 * sin observaciones / extranjero de riesgo) y las de persona moral CUATRO
 * (separa lista gris de lista negra). Con tres, gris y negra caen las dos en
 * «de riesgo»: agrupar hacia arriba es lo correcto cuando la escala no
 * distingue, porque lo contrario sería bajarle el riesgo a un país en lista
 * negra por una limitación del formulario.
 */
function opcionDePais(v: MatrizVariable, nivel: ReturnType<typeof nivelPais>) {
  const cuatro = v.opciones.length >= 4;
  if (nivel === 'nacional') return v.opciones[0];
  if (nivel === 'sin_observaciones') return v.opciones[1];
  // Con tres opciones, gris y negra caen las dos en la última.
  if (nivel === 'gris') return v.opciones[2];
  return cuatro ? v.opciones[3] : v.opciones[2];
}

const TEXTO_PAIS: Record<ReturnType<typeof nivelPais>, string> = {
  nacional: 'el país registrado es México',
  sin_observaciones: 'país extranjero sin observaciones del GAFI',
  gris: 'país en la lista gris del GAFI',
  negra: 'país en la lista negra del GAFI',
};

export function prellenarMatriz(
  config: MatrizConfig,
  ctx: ContextoPrellenado,
): RespuestaSugerida[] {
  const variables = variablesAplicables(config, ctx.tipo_persona);
  const porCodigo = new Map(variables.map((v) => [v.codigo, v]));
  const out: RespuestaSugerida[] = [];

  const sugerir = (v: MatrizVariable | undefined, texto: string, fuente: string) => {
    if (!v) return;
    const opcion = opcionPorTexto(v, texto);
    if (!opcion) return;
    out.push({ variable_codigo: v.codigo, valor: opcion.valor, etiqueta: opcion.label, fuente });
  };

  // --- Tipo de acto -------------------------------------------------
  if (ctx.tipo_acto) {
    const enMatriz = ACTO_EN_MATRIZ[ctx.tipo_acto];
    if (enMatriz) {
      const v = variables.find((x) => /tipo de acto/i.test(x.pregunta));
      sugerir(v, enMatriz, 'el tipo de acto que se está instrumentando');
    }
  }

  // --- País: residencia de la persona física, constitución de la moral ---
  if (ctx.pais_iso2) {
    const nivel = nivelPais(ctx.pais_iso2, ctx);
    const v = variables.find((x) =>
      ctx.tipo_persona === 'moral'
        ? /jurisdicci[oó]n de constituci[oó]n/i.test(x.pregunta)
        : /residencia/i.test(x.pregunta),
    );
    if (v) {
      const opcion = opcionDePais(v, nivel);
      if (opcion) {
        out.push({
          variable_codigo: v.codigo,
          valor: opcion.valor,
          etiqueta: opcion.label,
          fuente: `${TEXTO_PAIS[nivel]} (${ctx.pais_iso2.toUpperCase()}), contra el snapshot de listas de Ikán`,
        });
      }
    }
  }

  // --- Moneda extranjera o activos virtuales ------------------------
  // Sólo cuando hay un acto de por medio: sin operación, «no involucra
  // moneda extranjera» no es una respuesta, es una ausencia de pregunta.
  if (ctx.tipo_acto || ctx.moneda_origen || ctx.activo_virtual) {
    const v = variables.find((x) => /moneda extranjera|activos virtuales/i.test(x.pregunta));
    if (v) {
      if (ctx.activo_virtual) {
        sugerir(v, 'Activos virtuales', `la operación involucra ${ctx.activo_virtual}`);
      } else if (ctx.moneda_origen && ctx.moneda_origen.toUpperCase() !== 'MXN') {
        sugerir(v, 'Moneda extranjera', `la operación está en ${ctx.moneda_origen.toUpperCase()}`);
      } else if (ctx.moneda_origen) {
        sugerir(v, 'No, solo moneda nacional', 'la operación está en pesos');
      }
    }
  }

  // Nunca dos respuestas para la misma variable.
  const vistas = new Set<string>();
  return out.filter((r) => {
    if (vistas.has(r.variable_codigo) || !porCodigo.has(r.variable_codigo)) return false;
    vistas.add(r.variable_codigo);
    return true;
  });
}

/** Las que siguen sin respuesta después de pre-llenar. Es lo que el OC tiene que contestar. */
export function faltanPorResponder(
  config: MatrizConfig,
  tipoPersona: TipoPersona,
  respuestas: Record<string, number>,
): MatrizVariable[] {
  return variablesAplicables(config, tipoPersona).filter(
    (v) => typeof respuestas[v.codigo] !== 'number',
  );
}
