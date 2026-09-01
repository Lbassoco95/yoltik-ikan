/**
 * El riesgo país, cuando el país no es uno solo.
 *
 * Fuente: Adenda 1 de Kawiil-Cumplimiento (31/08/2026), apartados 4.1 a 4.3.
 * Instrucciones 6 y 7.
 *
 * ---------------------------------------------------------------------
 * Por qué tres campos y no uno
 * ---------------------------------------------------------------------
 * Nacionalidad, residencia, jurisdicción de la operación y origen de los
 * recursos son cosas distintas que pueden divergir, y LA DIVERGENCIA ES LA
 * SEÑAL. Con un solo campo de país, un mexicano residente en México que paga
 * con recursos venidos de una jurisdicción bajo monitoreo intensificado se veía
 * exactamente igual que uno que paga con recursos locales: la matriz no tenía
 * dónde enterarse.
 *
 * La derivación automática opera sobre cada uno de los países capturados y la
 * variable toma EL VALOR MÁS ALTO. No promedia: un promedio dejaría que dos
 * países limpios diluyeran al tercero, que es justo el que importa.
 *
 * ---------------------------------------------------------------------
 * Por qué el puntaje agrupa y el flujo no
 * ---------------------------------------------------------------------
 * Para efectos de puntaje, juntar lista gris y lista negra en «jurisdicción de
 * riesgo» es aceptable, y redondear hacia arriba es la dirección correcta. Esa
 * convención conservadora queda escrita aquí como decisión expresa: lo que hoy
 * es una elección razonable, sin constancia, mañana parece un descuido.
 *
 * Para efectos de FLUJO no es aceptable. Las jurisdicciones bajo llamado a la
 * acción conllevan contramedidas, no simplemente diligencia reforzada, y tienen
 * que levantar una bandera propia que la lista gris no levanta. Por eso el
 * resultado trae `llamado_a_la_accion` como booleano independiente del valor:
 * el puntaje se agrupa, el flujo no.
 *
 * ---------------------------------------------------------------------
 * Lo que este módulo NO hace
 * ---------------------------------------------------------------------
 * No consulta al GAFI en vivo. Lee el snapshot que ya usa el Motor PLD, y ese
 * snapshot está versionado por plenario (migration 0041). Una respuesta que
 * cambia sola entre dos consultas del mismo expediente es indefendible ante una
 * verificación.
 *
 * Y el snapshot no basta por sí solo: las RCG piden considerar países y zonas a
 * la luz de la evaluación nacional de riesgos, no sólo de las listas
 * internacionales. Esa parte la cubre `zona.ts`, con la lista interna.
 *
 * Módulo puro: sin red, sin React.
 */

/** Los niveles, de menor a mayor. El orden del arreglo ES la jerarquía. */
export const NIVELES_PAIS = [
  'nacional',
  'sin_observaciones',
  'monitoreo_intensificado',
  'llamado_a_la_accion',
] as const;

export type NivelPais = (typeof NIVELES_PAIS)[number];

/** Qué es cada país respecto del expediente. Se reporta para que el OC vea
 *  cuál de los tres fue el que mandó. */
export type RolPais = 'nacionalidad' | 'residencia' | 'constitucion' | 'origen_recursos';

export const ETIQUETA_ROL: Record<RolPais, string> = {
  nacionalidad: 'la nacionalidad del compareciente',
  residencia: 'el país de residencia',
  constitucion: 'la jurisdicción de constitución',
  origen_recursos: 'el país de origen de los recursos',
};

const ETIQUETA_NIVEL: Record<NivelPais, string> = {
  nacional: 'México',
  sin_observaciones: 'jurisdicción extranjera sin observaciones del GAFI',
  monitoreo_intensificado: 'jurisdicción bajo monitoreo intensificado del GAFI (lista gris)',
  llamado_a_la_accion: 'jurisdicción bajo llamado a la acción del GAFI (lista negra)',
};

export interface PaisCapturado {
  rol: RolPais;
  iso2?: string | null;
}

export interface ListasGafi {
  gafi_gris?: Set<string>;
  gafi_negra?: Set<string>;
  /** Plenario del snapshot, p. ej. «2026-06». Viaja a la evaluación. */
  plenario?: string | null;
}

export interface PaisEvaluado {
  rol: RolPais;
  iso2: string;
  nivel: NivelPais;
}

export interface RiesgoPais {
  /** El nivel más alto de los países capturados. */
  nivel: NivelPais;
  /** Qué país lo produjo, y en qué calidad. */
  determinante: PaisEvaluado;
  /** Todos los que se miraron, para poder auditar la comparación. */
  considerados: PaisEvaluado[];
  /**
   * Bandera de flujo, independiente del puntaje: llamado a la acción conlleva
   * CONTRAMEDIDAS, no diligencia reforzada. Levanta piso de banda alta y
   * revisión obligatoria del OC antes de continuar.
   */
  llamado_a_la_accion: boolean;
  /** Plenario del GAFI contra el que se calificó. Null si el snapshot no lo trae. */
  plenario: string | null;
  fuente: string;
}

/** El nivel de un país contra el snapshot. */
export function nivelDePais(iso2: string, listas: ListasGafi): NivelPais {
  const p = iso2.toUpperCase();
  if (p === 'MX') return 'nacional';
  if (listas.gafi_negra?.has(p)) return 'llamado_a_la_accion';
  if (listas.gafi_gris?.has(p)) return 'monitoreo_intensificado';
  return 'sin_observaciones';
}

/**
 * El más alto de los países capturados.
 *
 * Devuelve null cuando no se capturó ninguno: eso NO es «riesgo bajo», es una
 * variable sin responder, y la pantalla tiene que poder decirlo. Contestar
 * «nacional» porque falta el dato sería exactamente lo que este módulo existe
 * para no hacer.
 */
export function riesgoPaisMaximo(paises: PaisCapturado[], listas: ListasGafi): RiesgoPais | null {
  const considerados: PaisEvaluado[] = [];
  const vistos = new Set<string>();

  for (const p of paises) {
    const iso2 = p.iso2?.trim().toUpperCase();
    if (!iso2 || iso2.length !== 2) continue;
    // El mismo país en dos roles se mira una vez, pero se conserva el primer
    // rol para que la explicación nombre uno solo.
    const llave = `${p.rol}:${iso2}`;
    if (vistos.has(llave)) continue;
    vistos.add(llave);
    considerados.push({ rol: p.rol, iso2, nivel: nivelDePais(iso2, listas) });
  }

  if (considerados.length === 0) return null;

  const rango = (n: NivelPais) => NIVELES_PAIS.indexOf(n);
  const determinante = considerados.reduce((mayor, p) =>
    rango(p.nivel) > rango(mayor.nivel) ? p : mayor,
  );

  const otros = considerados.filter((p) => p !== determinante);
  const detalleOtros =
    otros.length > 0
      ? ` Se compararon además ${otros
          .map((p) => `${ETIQUETA_ROL[p.rol]} (${p.iso2})`)
          .join(' y ')}.`
      : '';

  return {
    nivel: determinante.nivel,
    determinante,
    considerados,
    llamado_a_la_accion: considerados.some((p) => p.nivel === 'llamado_a_la_accion'),
    plenario: listas.plenario ?? null,
    fuente:
      `manda ${ETIQUETA_ROL[determinante.rol]} (${determinante.iso2}): ` +
      `${ETIQUETA_NIVEL[determinante.nivel]}` +
      (listas.plenario ? `, snapshot del plenario ${listas.plenario}` : '') +
      `.${detalleOtros}`,
  };
}

/**
 * La clave de opción de la matriz que corresponde a un nivel.
 *
 * Tres opciones para los cuatro niveles: gris y negra caen las dos en
 * `riesgo`. Es el agrupamiento del apartado 4.3, y es hacia arriba —lo
 * contrario sería bajarle el riesgo a un país en lista negra por una
 * limitación del formulario—.
 */
export function claveDeNivel(nivel: NivelPais): 'nacional' | 'sin_observaciones' | 'riesgo' {
  if (nivel === 'nacional') return 'nacional';
  if (nivel === 'sin_observaciones') return 'sin_observaciones';
  return 'riesgo';
}
