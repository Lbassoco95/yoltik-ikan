/**
 * Despachador de lectores de lista.
 *
 * Cada fuente publica en su propio formato y con su propia idea de qué es un
 * identificador y qué es un alias. Ese conocimiento vive en el lector de cada
 * una —`sat69b.ts`, `ofac.ts`, `onu.ts`—; aquí sólo se decide cuál aplica y se
 * traduce todo a UNA forma, para que el diálogo de carga no tenga que saber de
 * qué fuente viene el archivo que le pasaron.
 */

import { parsear69B } from '@/lib/sat69b';
import { leerOfac, registrosParaCarga as ofacParaCarga } from '@/lib/ofac';
import { leerOnu, registrosParaCarga as onuParaCarga } from '@/lib/onu';
import type { RegistroParaCarga } from '@/lib/api/listas';

/**
 * Tope de tamaño para el camino del navegador.
 *
 * No es un número redondo por gusto: el `SDN_ENHANCED.XML` de OFAC pesa 104 MB
 * y leerlo como texto crea una cadena que en memoria ocupa el doble. Los demás
 * archivos reales van de 2 a 5 MB, así que 25 separa con holgura lo que cabe de
 * lo que no. Pasado el tope no se intenta y se explica: colgar la pestaña sin
 * decir por qué sería peor que negarse.
 */
const TOPE_NAVEGADOR_MB = 25;

export interface Cifra {
  etiqueta: string;
  valor: number;
}

export interface AnalisisLista {
  /** Qué se leyó, para que la vista previa lo confirme antes de aplicar. */
  etiqueta: string;
  /** Fecha declarada por la FUENTE, no la de carga. */
  fechaActualizacion: string | null;
  registros: RegistroParaCarga[];
  descartadas: { referencia: string; motivo: string }[];
  /** Lo que el lector propone; quien carga confirma. */
  alcanceSugerido: 'completa' | 'parcial';
  cifras: Cifra[];
  /** Lo que hay que mirar antes de aplicar. Se muestra en ámbar. */
  avisos: string[];
}

/** Qué fuentes tienen lector hoy. */
export const FUENTES_CON_LECTOR = new Set([
  'sat_69b',
  'sat_69b_bis',
  'ofac_sdn',
  'onu_consolidada',
]);

/** Qué extensión espera cada una, para decirlo antes de que suban lo otro. */
export const FORMATO_ESPERADO: Record<string, string> = {
  sat_69b: 'El CSV del SAT, con extensión .xls. Tal cual se descarga.',
  sat_69b_bis: 'El CSV del SAT, con extensión .xls. Tal cual se descarga.',
  ofac_sdn:
    'El XML ENHANCED de OFAC, ya extraído del .zip: CONS_ENHANCED.XML o SDN_ENHANCED.XML. ' +
    'No el ADVANCED.',
  onu_consolidada:
    'El XML de la ONU ordenado por número de referencia permanente: ' +
    'consolidatedLegacyByPRN.xml. No el alfabético.',
};

function cuenta<T>(items: T[], clave: (x: T) => string): Cifra[] {
  const m = new Map<string, number>();
  for (const x of items) {
    const k = clave(x);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([etiqueta, valor]) => ({ etiqueta, valor }));
}

function totalAlias(registros: RegistroParaCarga[], debiles: boolean): number {
  return registros.reduce(
    (n, r) => n + ((debiles ? r.nombres_alternos_debiles : r.nombres_alternos)?.length ?? 0),
    0,
  );
}

/**
 * Revisa que el archivo pueda leerse aquí ANTES de leerlo.
 *
 * Va aparte de `analizarArchivo` a propósito: si el tope se comprobara adentro,
 * ya se habrían cargado los 104 MB en memoria para poder medirlos, que es
 * justo lo que se quiere evitar. Sólo necesita el tamaño, no el contenido.
 */
export function revisarTamano(bytes: number): void {
  const mb = bytes / (1024 * 1024);
  if (mb > TOPE_NAVEGADOR_MB) {
    throw new Error(
      `El archivo pesa ${mb.toFixed(0)} MB y por la consola sólo se pueden cargar hasta ` +
        `${TOPE_NAVEGADOR_MB} MB: leerlo aquí colgaría el navegador. Los archivos de este tamaño ` +
        `—el SDN de OFAC son 104 MB— se cargan por el proceso programado, que corre en el ` +
        `servidor. Este archivo NO se cargó.`,
    );
  }
}

/**
 * Lee el contenido con el lector de su fuente y devuelve la forma común.
 *
 * Recibe los BYTES y no el `File`: así es puro y se prueba sin navegador, igual
 * que los lectores. Quien lo llama ya pasó por `revisarTamano`.
 */
export function analizarBytes(codigoFuente: string, datos: ArrayBuffer): AnalisisLista {
  if (!FUENTES_CON_LECTOR.has(codigoFuente)) {
    throw new Error(`Todavía no hay lector para la fuente «${codigoFuente}».`);
  }

  if (codigoFuente === 'sat_69b' || codigoFuente === 'sat_69b_bis') {
    // El del SAT decodifica latin-1 por su cuenta: recibe los bytes crudos.
    const r = parsear69B(datos);

    // Un mismo RFC con situaciones distintas es normal en el listado completo
    // —el SAT concatena sus listados por situación— y se resuelve por la fecha
    // de publicación de cada una. Los que no traen fecha se marcan.
    const porRfc = new Map<string, typeof r.registros>();
    for (const x of r.registros) {
      if (!porRfc.has(x.rfc)) porRfc.set(x.rfc, []);
      porRfc.get(x.rfc)!.push(x);
    }
    let distintas = 0;
    let sinFecha = 0;
    for (const filas of porRfc.values()) {
      if (filas.length < 2) continue;
      if (new Set(filas.map((x) => x.situacion)).size < 2) continue;
      distintas++;
      if (filas.some((x) => !x.fechaSituacion)) sinFecha++;
    }

    const avisos: string[] = [];
    if (distintas > 0) {
      avisos.push(
        `${distintas.toLocaleString('es-MX')} RFC vienen más de una vez con situaciones ` +
          'distintas. No son dos versiones del mismo expediente: son procedimientos distintos, y ' +
          'el archivo no los ordena por fecha. Se resuelve por la publicación en el DOF de cada ' +
          'situación, y a igualdad de fecha por la etapa más avanzada.',
      );
    }
    if (sinFecha > 0) {
      avisos.push(
        `De ésos, ${sinFecha.toLocaleString('es-MX')} no traen fecha de publicación y quedarán ` +
          'marcados para revisión: no se resuelven por su posición en el archivo.',
      );
    }

    const situaciones = new Set(r.registros.map((x) => x.situacion));
    return {
      etiqueta: r.articulo,
      fechaActualizacion: r.fechaActualizacion,
      registros: r.registros.map((x) => ({
        nombre: x.nombre,
        rfc: x.rfc,
        tipo_entidad: 'empresa',
        situacion: x.situacion,
        orden_origen: x.fila,
        fecha_situacion: x.fechaSituacion,
        oficio_situacion: x.oficioSituacion,
        identificadores: { etapas: x.etapas },
      })),
      descartadas: r.descartadas.map((d) => ({
        referencia: `fila ${d.fila}`,
        motivo: d.motivo,
      })),
      // El listado completo trae varias situaciones; los de una sola son
      // subconjuntos. Es la señal más fiable, y se propone, no se impone.
      alcanceSugerido: situaciones.size > 1 ? 'completa' : 'parcial',
      cifras: cuenta(r.registros, (x) => x.situacion),
      avisos,
    };
  }

  if (codigoFuente === 'ofac_sdn') {
    const r = leerOfac(new TextDecoder('utf-8').decode(datos));
    const registros = ofacParaCarga(r.registros);
    return {
      etiqueta: `OFAC · ${r.listasDelArchivo.join(', ') || 'sin lista declarada'}`,
      fechaActualizacion: r.fechaActualizacion,
      registros,
      descartadas: r.descartadas.map((d) => ({
        referencia: `entidad ${d.identificador}`,
        motivo: d.motivo,
      })),
      // PARCIAL a propósito, aunque el archivo sea completo.
      //
      // El catálogo tiene UNA fuente para OFAC y el Tesoro publica DOS listas:
      // la SDN y la Consolidada de programas no-SDN. Mientras las dos entren en
      // la misma fuente, una carga «completa» daría de baja los registros de la
      // otra. Vale la regla que esta base ya trae escrita: ante la duda,
      // parcial — dejar de más es recuperable, dar de baja a alguien que sigue
      // sancionado no lo es.
      alcanceSugerido: 'parcial',
      cifras: [
        ...cuenta(registros, (x) => x.tipo_entidad ?? 'sin tipo'),
        { etiqueta: 'alias', valor: totalAlias(registros, false) },
      ],
      avisos: [
        'Se propone alcance PARCIAL aunque el archivo sea completo: el catálogo tiene una sola ' +
          'fuente para OFAC y el Tesoro publica dos listas (SDN y Consolidada no-SDN). Con una ' +
          'carga completa, cada una daría de baja a la otra. Hay que separarlas en dos fuentes ' +
          'antes de poder aplicar la diferencia.',
      ],
    };
  }

  // ONU
  const r = leerOnu(new TextDecoder('utf-8').decode(datos));
  const registros = onuParaCarga(r.registros);
  const debiles = totalAlias(registros, true);
  return {
    etiqueta: 'ONU · Lista Consolidada del Consejo de Seguridad',
    fechaActualizacion: r.fechaActualizacion,
    registros,
    descartadas: r.descartadas.map((d) => ({
      referencia: d.identificador,
      motivo: d.motivo,
    })),
    // Aquí sí: el archivo ES la lista consolidada completa y la fuente es una.
    alcanceSugerido: 'completa',
    cifras: [
      ...cuenta(registros, (x) => x.tipo_entidad ?? 'sin tipo'),
      { etiqueta: 'alias', valor: totalAlias(registros, false) },
      { etiqueta: 'alias de baja calidad', valor: debiles },
    ],
    avisos: [
      'Una coincidencia confirmada en esta lista IMPIDE operar: las resoluciones del Consejo de ' +
        'Seguridad vinculan a México. No es un factor de riesgo como OFAC.',
      ...(debiles > 0
        ? [
            `${debiles.toLocaleString('es-MX')} alias vienen marcados de baja calidad por la ` +
              'propia ONU. Se cargan aparte: levantan un candidato a revisar, no una coincidencia.',
          ]
        : []),
    ],
  };
}

/** Lo que usa el diálogo: revisa el tamaño, lee, y analiza. */
export async function analizarArchivo(
  codigoFuente: string,
  archivo: File,
): Promise<AnalisisLista> {
  revisarTamano(archivo.size);
  return analizarBytes(codigoFuente, await archivo.arrayBuffer());
}

/**
 * Cifra de control para validar la primera carga.
 *
 * La fijó Kawiil-Cumplimiento (instrucción 244) para que el cargador falle
 * ruidosamente: si la carga no aterriza en cifras del mismo orden, el problema
 * es del lector y conviene enterarse antes de que el barrido diga «sin
 * coincidencias».
 */
export const CIFRA_DE_CONTROL: Record<string, { total: number; nota: string }> = {
  onu_consolidada: {
    total: 1011,
    nota: '736 personas y 275 entidades, según el Consejo de Seguridad al 4 de septiembre de 2026',
  },
};

/** Si el total leído se aparta de la cifra de control, el aviso que hay que dar. */
export function avisoDeControl(codigoFuente: string, leidos: number): string | null {
  const c = CIFRA_DE_CONTROL[codigoFuente];
  if (!c) return null;
  // Un 10% de holgura: la lista cambia con cada alta y la cifra es de una
  // fecha concreta. Lo que importa es detectar un orden de magnitud distinto.
  const holgura = Math.max(1, Math.round(c.total * 0.1));
  if (Math.abs(leidos - c.total) <= holgura) return null;
  return (
    `Se leyeron ${leidos.toLocaleString('es-MX')} registros y la cifra de control es ` +
    `${c.total.toLocaleString('es-MX')} (${c.nota}). La diferencia es grande: revisa que el ` +
    'archivo sea el correcto y esté completo antes de aplicar.'
  );
}
