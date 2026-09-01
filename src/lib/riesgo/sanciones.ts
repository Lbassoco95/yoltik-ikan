import type { PaisCapturado, RolPais } from './pais';
import { ETIQUETA_ROL } from './pais';

/**
 * Sanciones del Consejo de Seguridad de la ONU y programas de OFAC.
 *
 * Fuente: Adenda 3 de Kawiil-Cumplimiento (01/09/2026). Instrucción 28.
 *
 * ---------------------------------------------------------------------
 * Por qué esto vive aparte del GAFI y no dentro de `pais.ts`
 * ---------------------------------------------------------------------
 * Miden cosas distintas y pesan distinto.
 *
 * El GAFI evalúa la SOLIDEZ DEL RÉGIMEN PLD de una jurisdicción: estar en la
 * lista gris dice que el país tiene deficiencias, no que operar con él esté
 * prohibido. Una sanción dice lo contrario: el país puede tener un régimen
 * impecable y estar bajo embargo por razones que nada tienen que ver con el
 * lavado.
 *
 * Meterlos en la misma escala haría que un país sancionado y uno con
 * deficiencias técnicas se vieran igual, y el OC no podría distinguir «tiene
 * fallas en su régimen» de «no se puede operar con él».
 *
 * ---------------------------------------------------------------------
 * ONU y OFAC no pesan lo mismo, y el sistema tiene que poder decirlo
 * ---------------------------------------------------------------------
 * Las resoluciones del Consejo de Seguridad vinculan a México como Estado
 * miembro y se implementan internamente: su omisión es difícilmente defendible.
 *
 * OFAC es DERECHO EXTRANJERO. Un fedatario público mexicano no es U.S. person y
 * no está obligado por OFAC. Su relevancia es otra —exposición a sanciones
 * secundarias, riesgo de corresponsalía en dólares, valor indiciario dentro del
 * enfoque basado en riesgo— y conviene decirlo con precisión, porque determina
 * cuánto debe pesar. Es un indicador de riesgo excelente y no es ley aplicable.
 *
 * Por eso el resultado dice SIEMPRE qué autoridad lo produjo. Un booleano
 * «sancionado» perdería la única distinción que aquí importa.
 *
 * Módulo puro: sin red, sin React.
 */

/**
 * Los dos niveles del eje territorial que producen efecto.
 *
 * El tercero de la adenda —«atención»— no aparece porque no sale de estas dos
 * fuentes: es una lista interna revisada cada semestre, y hoy no existe. Cuando
 * exista, entra por `zona.ts`, que es donde viven los criterios propios.
 */
export type NivelSancion = 'prohibicion' | 'riesgo_alto';

export type Autoridad = 'onu' | 'ofac';

export const ETIQUETA_AUTORIDAD: Record<Autoridad, string> = {
  onu: 'el Consejo de Seguridad de la ONU',
  ofac: 'OFAC',
};

/**
 * El snapshot cargado, por autoridad.
 *
 * El nivel viene del entero de `country_risk_list`, donde MÁS ES PEOR: 3 es
 * prohibición y 2 es riesgo alto. Los niveles de la Adenda 3 van al revés —allá
 * el 1 es la prohibición— y la traducción se hace en la proyección de la 0053,
 * en un solo sitio. Aquí ya llega en texto.
 */
export interface ListasSanciones {
  onu?: Map<string, NivelSancion>;
  ofac?: Map<string, NivelSancion>;
  /** Fecha de lectura de las páginas oficiales. Viaja a la evaluación. */
  lectura?: string | null;
}

export interface SancionDePais {
  autoridad: Autoridad;
  nivel: NivelSancion;
}

/** Qué autoridades alcanzan a un país, y con qué nivel cada una. */
export function sancionesDePais(iso2: string, listas: ListasSanciones): SancionDePais[] {
  const p = iso2.trim().toUpperCase();
  if (!p) return [];
  const out: SancionDePais[] = [];
  const onu = listas.onu?.get(p);
  if (onu) out.push({ autoridad: 'onu', nivel: onu });
  const ofac = listas.ofac?.get(p);
  if (ofac) out.push({ autoridad: 'ofac', nivel: ofac });
  return out;
}

export interface PaisSancionado {
  rol: RolPais;
  iso2: string;
  sanciones: SancionDePais[];
}

export interface RiesgoSanciones {
  /** El nivel más severo entre todos los países capturados. */
  nivel: NivelSancion;
  /** Cuál país y en qué calidad lo produjo. */
  determinante: PaisSancionado;
  /** Todos los alcanzados, para poder auditar la comparación. */
  alcanzados: PaisSancionado[];
  /**
   * Si alguna de las jurisdicciones está alcanzada por el Consejo de Seguridad.
   *
   * Se reporta aparte del nivel porque cambia el tipo de argumento, no su
   * intensidad: una resolución vincula a México y su omisión no se defiende
   * con el enfoque basado en riesgo; una designación de OFAC sí se pondera.
   */
  hay_onu: boolean;
  lectura: string | null;
  motivo: string;
}

/**
 * El riesgo por sanciones de los países capturados.
 *
 * Devuelve null cuando ninguno está alcanzado, y también cuando no se capturó
 * ninguno. Los dos casos significan «esto no levanta bandera», y quien llama
 * distingue «sin países» con `pais.ts`, que ya lo reporta. Lo que NO se hace es
 * devolver un objeto con nivel bajo: un país sin capturar no es un país limpio.
 */
export function riesgoDeSanciones(
  paises: PaisCapturado[],
  listas: ListasSanciones,
): RiesgoSanciones | null {
  const alcanzados: PaisSancionado[] = [];
  for (const p of paises) {
    const iso2 = p.iso2?.trim().toUpperCase();
    if (!iso2) continue;
    const sanciones = sancionesDePais(iso2, listas);
    if (sanciones.length > 0) alcanzados.push({ rol: p.rol, iso2, sanciones });
  }
  if (alcanzados.length === 0) return null;

  const severidad = (s: PaisSancionado): number =>
    s.sanciones.some((x) => x.nivel === 'prohibicion') ? 2 : 1;

  const determinante = alcanzados.reduce((mayor, s) =>
    severidad(s) > severidad(mayor) ? s : mayor,
  );
  const nivel: NivelSancion = severidad(determinante) === 2 ? 'prohibicion' : 'riesgo_alto';
  const hay_onu = alcanzados.some((s) => s.sanciones.some((x) => x.autoridad === 'onu'));

  const autoridades = determinante.sanciones
    .map((x) => ETIQUETA_AUTORIDAD[x.autoridad])
    .join(' y ');

  return {
    nivel,
    determinante,
    alcanzados,
    hay_onu,
    lectura: listas.lectura ?? null,
    motivo:
      `${ETIQUETA_ROL[determinante.rol]} (${determinante.iso2}) está bajo ` +
      `${nivel === 'prohibicion' ? 'embargo amplio' : 'régimen de sanciones'} de ${autoridades}` +
      (listas.lectura ? `, según la lectura del ${listas.lectura}` : '') +
      '.',
  };
}

/**
 * ¿Este expediente está bloqueado?
 *
 * La prohibición NO se resuelve con puntos, dice la adenda, y por eso no entra
 * como piso de la matriz: un piso deja el expediente en banda alta y permite
 * seguir. Aquí lo que procede es detener y escalar.
 *
 * Se separa de `riesgoDeSanciones` porque quien pinta el bloqueo y quien
 * calcula el puntaje son sitios distintos, y mezclarlos haría que apagar uno
 * apagara el otro sin querer.
 */
export function estaBloqueado(riesgo: RiesgoSanciones | null): boolean {
  return riesgo?.nivel === 'prohibicion';
}

/**
 * El código del indicador de la matriz que levanta el piso de banda alta.
 *
 * Sólo el nivel 2. El nivel 1 no es un piso: es un bloqueo, y presentarlo como
 * piso diría que se puede continuar con banda alta cuando lo que procede es
 * detenerse.
 */
export const INDICADOR_PAIS_SANCIONADO = 'PAIS_SANCIONADO';

export function indicadorDeSanciones(riesgo: RiesgoSanciones | null): boolean {
  return riesgo != null;
}
