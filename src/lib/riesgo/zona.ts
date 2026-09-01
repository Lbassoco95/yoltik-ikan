/**
 * La zona geográfica, que no es el país.
 *
 * Fuente: Adenda 1 de Kawiil-Cumplimiento (31/08/2026), apartados 4.4 y 7.
 * Instrucción 10.
 *
 * ---------------------------------------------------------------------
 * Por qué hace falta si ya hay campo de país
 * ---------------------------------------------------------------------
 * Las RCG exigen zona geográfica como factor de riesgo, y zona geográfica no es
 * país. Para una notaría que opera enteramente en territorio nacional, el campo
 * de país responde «México» en el noventa y tantos por ciento de los
 * expedientes: una variable que casi siempre da la misma respuesta no
 * discrimina, y una variable que no discrimina ocupa lugar en la escala sin
 * aportar nada.
 *
 * Lo que sí discrimina es interno: entidad federativa y municipio DEL INMUEBLE
 * y DEL DOMICILIO DEL CLIENTE. Son dos ubicaciones distintas y las dos cuentan
 * —alguien domiciliado en Guadalajara que compra en una zona de atención es
 * justo el caso que este factor existe para ver—, así que se toma la más alta,
 * por la misma razón por la que el país toma la más alta.
 *
 * ---------------------------------------------------------------------
 * Por qué una lista vacía NO responde «sin observaciones»
 * ---------------------------------------------------------------------
 * La lista interna de zonas de atención se creó vacía a propósito (migration
 * 0041): la determinación de qué zonas son de atención, a la luz de la
 * evaluación nacional de riesgos, es de Kawiil-Cumplimiento y no de quien
 * escribe el código.
 *
 * Mientras esté vacía, esta función devuelve null y la variable NO SE RESPONDE.
 * La alternativa —contestar «sin observaciones» a todo— daría la calificación
 * más baja a cualquier ubicación del país, que es el falso negativo silencioso
 * de siempre: una variable que suma su mínimo en todos los expedientes y que
 * nadie va a ir a revisar porque se ve contestada.
 *
 * Y la variable, mientras tanto, queda FUERA de la escala: ver
 * `requiere_catalogo` en la plantilla. Dejarla dentro con todos en el mínimo
 * comprimiría el índice de todos los expedientes hacia abajo por una razón que
 * no tiene que ver con su riesgo.
 *
 * Módulo puro: sin red, sin React.
 */

/** Una fila de `zona_atencion` (migration 0041), sólo lo que se usa aquí. */
export interface ZonaAtencion {
  entidad_clave: string;
  /** Null = la entidad federativa entera. */
  municipio: string | null;
  /** 1 sin observaciones · 2 atención · 3 atención prioritaria. */
  nivel: number;
  motivo: string;
}

/** Una ubicación a calificar, con la calidad en que entra al expediente. */
export interface Ubicacion {
  rol: 'inmueble' | 'domicilio_cliente';
  entidad_clave?: string | null;
  municipio?: string | null;
}

const ETIQUETA_UBICACION: Record<Ubicacion['rol'], string> = {
  inmueble: 'la ubicación del inmueble',
  domicilio_cliente: 'el domicilio del cliente',
};

export interface RiesgoZona {
  /** 1 a 3, el mismo rango que la columna `nivel` del catálogo. */
  valor: number;
  determinante: {
    rol: Ubicacion['rol'];
    entidad_clave: string;
    municipio: string | null;
  };
  motivo: string;
  fuente: string;
}

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

/**
 * La zona más alta entre las ubicaciones capturadas.
 *
 * Devuelve null cuando el catálogo está vacío o cuando no hay ninguna ubicación
 * capturada. En ambos casos la variable se queda sin responder, y eso es la
 * respuesta correcta: no hay contra qué comparar.
 */
export function riesgoDeZona(
  ubicaciones: Ubicacion[],
  catalogo: ZonaAtencion[],
): RiesgoZona | null {
  if (catalogo.length === 0) return null;

  const conDatos = ubicaciones.filter((u) => (u.entidad_clave ?? '').trim() !== '');
  if (conDatos.length === 0) return null;

  let mejor: RiesgoZona | null = null;

  for (const u of conDatos) {
    const entidad = (u.entidad_clave ?? '').trim();

    // La fila de municipio gana sobre la de entidad entera: es la más
    // específica y la que el catálogo escribió pensando en ese lugar.
    const delMunicipio =
      norm(u.municipio) === ''
        ? undefined
        : catalogo.find(
            (z) =>
              norm(z.entidad_clave) === norm(entidad) && norm(z.municipio) === norm(u.municipio),
          );
    const deLaEntidad = catalogo.find(
      (z) => norm(z.entidad_clave) === norm(entidad) && (z.municipio ?? '') === '',
    );

    const fila = delMunicipio ?? deLaEntidad;
    // Sin fila en el catálogo, la ubicación es «sin observaciones»: aquí sí es
    // una respuesta y no una ausencia, porque el catálogo existe y no la
    // menciona. Distinto del caso de catálogo vacío, que es el de arriba.
    const nivel = fila?.nivel ?? 1;
    const motivo = fila?.motivo ?? 'no aparece en la lista interna de zonas de atención';

    if (!mejor || nivel > mejor.valor) {
      mejor = {
        valor: nivel,
        determinante: {
          rol: u.rol,
          entidad_clave: entidad,
          municipio: u.municipio ?? null,
        },
        motivo,
        fuente:
          `manda ${ETIQUETA_UBICACION[u.rol]} (${[entidad, u.municipio].filter(Boolean).join(', ')}): ` +
          `${motivo}, contra la lista interna de zonas de atención`,
      };
    }
  }

  return mejor;
}
