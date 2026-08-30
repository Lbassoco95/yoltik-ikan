/**
 * La estructura de cada tipo de acto, sacada del instructivo.
 *
 * Las diez ramas del layout no se parecen entre sí: un poder tiene poderdantes
 * y apoderados; una constitución tiene socios, capital y folio mercantil; un
 * mutuo tiene acreedor, deudor y garantías. Escribir diez formularios a mano
 * sería diez oportunidades de equivocarse en un campo, y el error no se ve
 * hasta que el portal rechaza el aviso.
 *
 * Así que la pantalla se arma desde el diccionario: si el SAT cambia el layout
 * en noviembre, se regenera `campos-fep.generated.ts` y la captura cambia sola.
 *
 * Módulo puro.
 */

import { CAMPOS_FEP, type CampoFep } from './campos-fep.generated';

export interface NodoRama {
  /** Número del instructivo. Es la jerarquía y la trazabilidad. */
  no: string;
  etiqueta: string;
  nombre: string;
  obligatorio: boolean;
  /** Admite varias apariciones: "una <datos_apoderado> por cada apoderado". */
  repetible: boolean;
  /** Campos con valor propios de este nodo, no de sus hijos. */
  campos: CampoFep[];
  hijos: NodoRama[];
  /**
   * El nodo es un `<tipo_persona>`: sus hijos son las tres variantes
   * —física, moral, fideicomiso— y sólo va UNA. La captura muestra un selector,
   * no tres formularios uno debajo del otro.
   */
  esTipoPersona: boolean;
}

const segmentos = (no: string) => no.split('.');

/** Hijos inmediatos: los que cuelgan del prefijo con exactamente un nivel más. */
function hijosDe(prefijo: string): CampoFep[] {
  const nivel = segmentos(prefijo).length + 1;
  return CAMPOS_FEP.filter(
    (c) => c.no.startsWith(prefijo + '.') && segmentos(c.no).length === nivel,
  );
}

const VARIANTES_PERSONA = ['persona_fisica', 'persona_moral', 'fideicomiso'];

function construir(raiz: CampoFep): NodoRama {
  const hijos = hijosDe(raiz.no);
  const etiquetasHijas = hijos.map((h) => h.etiqueta);

  return {
    no: raiz.no,
    etiqueta: raiz.etiqueta,
    nombre: raiz.nombre,
    obligatorio: raiz.obligatorio,
    repetible: raiz.repetible,
    campos: hijos.filter((h) => h.tipo !== 'Etiqueta'),
    hijos: hijos.filter((h) => h.tipo === 'Etiqueta').map(construir),
    // Basta con que estén las tres variantes: hay nodos que además traen algún
    // campo suelto, y siguen siendo un selector de tipo de persona.
    esTipoPersona: VARIANTES_PERSONA.every((v) => etiquetasHijas.includes(v)),
  };
}

/** La rama de un tipo de acto. Null si ese acto no existe en este layout —la
 *  transmisión de inmuebles, por ejemplo, se presenta por DeclaraNOT. */
export function ramaDelActo(tipoActo: string): NodoRama | null {
  const raiz = CAMPOS_FEP.find(
    (c) => c.no.startsWith('3.6.1.3.') && c.etiqueta === tipoActo && c.tipo === 'Etiqueta',
  );
  return raiz ? construir(raiz) : null;
}

/** Cuántos campos obligatorios cuelgan del nodo, contando sus hijos. */
export function camposObligatorios(nodo: NodoRama): number {
  return (
    nodo.campos.filter((c) => c.obligatorio).length +
    nodo.hijos.reduce((n, h) => n + camposObligatorios(h), 0)
  );
}

/** Todos los campos con valor de la rama, aplanados. Sirve para contar y para
 *  saber qué catálogos hacen falta. */
export function camposPlanos(nodo: NodoRama): CampoFep[] {
  return [...nodo.campos, ...nodo.hijos.flatMap(camposPlanos)];
}

/**
 * Cómo se captura cada campo, deducido del par (tipo de dato, formato) del
 * instructivo. No es criterio propio: un campo con patrón AAAAMMDD es una
 * fecha, uno que remite a un catálogo es una lista.
 */
export type ControlCampo = 'catalogo' | 'fecha' | 'monto' | 'numero' | 'si_no' | 'texto';

export function controlDe(campo: CampoFep): ControlCampo {
  if (campo.catalogo) return 'catalogo';
  if (/AAAAMMDD/.test(campo.formato)) return 'fecha';
  // "14 dígitos con 2 decimales obligatorios" es como el instructivo describe
  // los importes.
  if (/decimales/i.test(campo.formato)) return 'monto';
  if (/^SI\/NO$/i.test(campo.formato.replace('Formato: ', '').trim())) return 'si_no';
  if (/Numérico/i.test(campo.tipo) && !/Alfanumérico/i.test(campo.tipo)) return 'numero';
  return 'texto';
}
