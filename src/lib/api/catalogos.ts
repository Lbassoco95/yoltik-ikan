import { supabase } from '@/lib/supabase';
import type { EstadoCatalogo, ValorCatalogo } from '@/lib/catalogos';
import type { ZonaAtencion } from '@/lib/riesgo/zona';
import { NIVELES_SANCION } from '@/lib/riesgo/sanciones';
import type { ListasSanciones, NivelSancion } from '@/lib/riesgo/sanciones';
import { comoJson } from './json';

/** Estado de todos los catálogos: cuáles están cargados y desde cuándo.
 *  Lo lee cualquier usuario autenticado; escribirlos es sólo de Kawiil. */
export async function listarCatalogos(): Promise<EstadoCatalogo[]> {
  const { data, error } = await supabase
    .from('v_catalogos_estado')
    .select('*')
    .order('codigo');
  if (error) throw error;
  return (data ?? []) as unknown as EstadoCatalogo[];
}

/**
 * Valores vigentes de un catálogo, en el orden en que se cargaron.
 *
 * Devuelve arreglo vacío si el catálogo no existe o no está cargado. Quien
 * llama distingue los dos casos con `listarCatalogos()`; para pintar un select,
 * ambos significan lo mismo: no hay lista que ofrecer.
 */
export async function valoresDeCatalogo(codigo: string): Promise<ValorCatalogo[]> {
  const { data, error } = await supabase
    .from('v_catalogo_vigente')
    .select('clave, descripcion, orden')
    .eq('catalogo', codigo)
    .order('orden', { nullsFirst: false });
  if (error) return [];
  return (data ?? []) as unknown as ValorCatalogo[];
}

/**
 * Reemplaza los valores de un catálogo. Sólo un admin de plataforma: la base
 * lo vuelve a comprobar, así que un cliente que llame esto directo recibe un
 * error, no una carga.
 *
 * Devuelve cuántos valores quedaron vigentes.
 */
export async function reemplazarValoresCatalogo(
  codigo: string,
  valores: ValorCatalogo[],
  motivo?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('reemplazar_valores_catalogo', {
    p_codigo: codigo,
    p_valores: comoJson(valores),
    p_motivo: motivo ?? null,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

/**
 * Los países en listas GAFI, por fuente.
 *
 * Es el MISMO snapshot que el Motor PLD usa para la tipología de contraparte en
 * país de alto riesgo. Que la matriz y el motor midan el riesgo de país contra
 * fuentes distintas sería la manera más fácil de que el sistema se contradiga a
 * sí mismo sobre el mismo compareciente.
 *
 * Sólo las vigentes: una lista cerrada es historia, no criterio de hoy.
 */
export async function paisesEnListas(): Promise<{
  gafi_gris: Set<string>;
  gafi_negra: Set<string>;
  /**
   * Plenario del GAFI del snapshot vigente (migration 0041), p. ej. «2026-06».
   *
   * El GAFI actualiza sus listas TRES VECES AL AÑO, y la referencia con la que
   * se calificó un expediente tiene que poder reconstruirse: sin ella, una
   * reclasificación posterior parece un error en lugar de una actualización.
   *
   * Null cuando las filas todavía no lo traen. Se toma el más alto de los que
   * hay: si conviven dos, el vigente es el último publicado.
   */
  plenario: string | null;
}> {
  const { data, error } = await supabase
    .from('country_risk_list')
    .select('iso2, fuente, vigente_hasta, plenario')
    .in('fuente', ['gafi_gris', 'gafi_negra'])
    .is('vigente_hasta', null);
  if (error) throw error;

  const gris = new Set<string>();
  const negra = new Set<string>();
  let plenario: string | null = null;
  for (const f of (data ?? []) as { iso2: string; fuente: string; plenario?: string | null }[]) {
    (f.fuente === 'gafi_negra' ? negra : gris).add(f.iso2.toUpperCase());
    if (f.plenario && (plenario === null || f.plenario > plenario)) plenario = f.plenario;
  }
  return { gafi_gris: gris, gafi_negra: negra, plenario };
}

/**
 * Los países bajo régimen de sanciones de la ONU y de OFAC (migration 0053).
 *
 * Consulta APARTE de `paisesEnListas` y no un filtro más sobre la misma, porque
 * el GAFI y las sanciones miden cosas distintas: el GAFI evalúa la solidez del
 * régimen PLD de una jurisdicción, y una sanción no dice nada sobre eso. Un
 * país puede tener un régimen impecable y estar bajo embargo. Devolverlos
 * juntos obligaría a quien llama a separarlos otra vez, y el día que alguien no
 * los separe, «tiene deficiencias técnicas» y «no se puede operar con él» se
 * verían igual.
 *
 * El `nivel` de la tabla es un entero donde MÁS ES PEOR —3 prohibición, 2
 * riesgo alto—, al revés que los niveles de la Adenda 3. La traducción a texto
 * se hace aquí, una sola vez, para que ningún otro sitio tenga que acordarse.
 */
export async function paisesSancionados(): Promise<ListasSanciones> {
  const { data, error } = await supabase
    .from('country_risk_list')
    .select('iso2, fuente, nivel, plenario')
    // `manual` es el catálogo propio de jurisdicciones en atención: criterio de
    // Kawiil con derivación escrita, no de una autoridad externa.
    .in('fuente', ['onu', 'ofac_sancionado', 'manual'])
    .is('vigente_hasta', null);
  if (error) throw error;

  const onu = new Map<string, NivelSancion>();
  const ofac = new Map<string, NivelSancion>();
  const propio = new Map<string, NivelSancion>();
  let lectura: string | null = null;

  for (const f of (data ?? []) as {
    iso2: string;
    fuente: string;
    nivel: number;
    plenario?: string | null;
  }[]) {
    // El entero de la tabla va AL REVÉS que los niveles de la adenda: aquí 3 es
    // lo más severo y allá el 1 es la prohibición. La traducción está también en
    // `proyectar_sanciones_a_paises`, y las dos tienen que decir lo mismo: si se
    // desincronizan, un país bajo embargo puede salir como simple atención.
    const nivel: NivelSancion =
      f.nivel >= 3 ? 'prohibicion' : f.nivel === 2 ? 'riesgo_alto' : 'atencion';
    const destino = f.fuente === 'onu' ? onu : f.fuente === 'manual' ? propio : ofac;
    const iso2 = f.iso2.toUpperCase();
    // Si un país aparece dos veces en la misma fuente, se queda el más severo.
    const previo = destino.get(iso2);
    if (previo == null || NIVELES_SANCION.indexOf(nivel) > NIVELES_SANCION.indexOf(previo)) {
      destino.set(iso2, nivel);
    }
    // `plenario` guarda «lectura DD/MM/AAAA» en estas dos fuentes.
    if (f.plenario && (lectura === null || f.plenario > lectura)) lectura = f.plenario;
  }

  return { onu, ofac, propio, lectura: lectura?.replace(/^lectura /, '') ?? null };
}

/**
 * La lista interna de zonas geográficas de atención (migration 0041).
 *
 * Nace VACÍA a propósito: la determinación de qué zonas son de atención, a la
 * luz de la evaluación nacional de riesgos, es de Kawiil-Cumplimiento. Mientras
 * devuelva un arreglo vacío, la variable de zona de la matriz no se responde ni
 * puntúa —ver `zona.ts` y `requiere_catalogo` en la plantilla—.
 */
export async function zonasDeAtencion(): Promise<ZonaAtencion[]> {
  const { data, error } = await supabase
    .from('zona_atencion')
    .select('entidad_clave, municipio, nivel, motivo, vigente_hasta')
    .is('vigente_hasta', null);
  if (error) throw error;
  return (data ?? []).map((z) => ({
    entidad_clave: z.entidad_clave as string,
    municipio: (z.municipio as string | null) ?? null,
    nivel: z.nivel as number,
    motivo: z.motivo as string,
  }));
}
