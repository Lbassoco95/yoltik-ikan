/**
 * Nivel de riesgo por actividad económica o giro.
 *
 * Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 1 del 31/08/2026,
 * apartado 3. Instrucción 5 de su resumen.
 *
 * ---------------------------------------------------------------------
 * Esto NO es una clasificación oficial, y decirlo importa
 * ---------------------------------------------------------------------
 * No existe una clasificación de la UIF que asigne riesgo a las claves de
 * actividad económica. El catálogo que viaja en los layouts es una taxonomía de
 * REPORTE, no una calificación de riesgo. Esta tabla es metodología propia de
 * Kawiil, construida bajo el Capítulo II Quáter de las RCG.
 *
 * Es defendible mientras esté escrita, fundada y versionada. Deja de serlo si
 * se aplica como una lista heredada sin autor, que es exactamente lo que era
 * antes de esta adenda.
 *
 * ---------------------------------------------------------------------
 * Por qué el valor por defecto es MEDIO y nunca nulo
 * ---------------------------------------------------------------------
 * Un campo sin respuesta en una matriz aditiva no es neutro: suma cero, y sumar
 * cero equivale a la calificación más baja posible. La clave desconocida
 * terminaría puntuando MEJOR que la actividad más inocua de la lista.
 *
 * Es el peor modo de falla que puede tener el diseño, porque produce falsos
 * negativos silenciosos: el expediente sale limpio y nadie se entera de que
 * salió limpio por un hueco.
 *
 * Por eso la función siempre responde, y la respuesta trae `mapeada: false`
 * cuando el nivel salió del valor por defecto. Esa bandera va al expediente:
 * una clave fuera de catálogo puede significar una actividad benigna que nadie
 * clasificó, o una actividad nueva que la tabla todavía no contempla, y son
 * cosas distintas.
 */

export type NivelActividad = 'bajo' | 'medio' | 'alto';

export interface RiesgoActividad {
  nivel: NivelActividad;
  /** 1, 2 o 3, en la escala de la matriz. */
  valor: 1 | 2 | 3;
  /** La clave estaba en la tabla. False = salió del valor por defecto. */
  mapeada: boolean;
  /** Por qué ese nivel, en español. Va a la pantalla y a la constancia. */
  fuente: string;
}

/**
 * ALTO · el cliente realiza él mismo una Actividad Vulnerable del artículo 17.
 *
 * La ENR 2023 califica obras de arte y metales, piedras preciosas y joyería
 * como de riesgo alto tanto en amenaza como en vulnerabilidad. Las demás
 * coinciden con supuestos del artículo 17 y con las restricciones de efectivo
 * del artículo 32.
 */
const ALTO_ACTIVIDAD_VULNERABLE: Record<string, string> = {
  // Metales, piedras preciosas y joyería (art. 17 fr. VIII · ENR 2023)
  '5721100': 'joyeros y orfebres',
  '3430005': 'orfebrería y joyería de metales y piedras preciosos',
  '3440005': 'joyería de metales y piedras no preciosos',
  '4660026': 'comercio de artículos de joyería y relojes',
  '2500002': 'minería de piedras preciosas',
  // Obras de arte (art. 17 fr. IX · ENR 2023)
  '4680006': 'comercio de antigüedades y obras de arte',
  // Juegos con apuesta, concursos y sorteos (art. 17 fr. I)
  '7140019': 'casinos o centros de apuesta',
  '7150019': 'venta de billetes de lotería y sorteos',
  '7130019': 'casas de juegos electrónicos',
  // Blindaje (art. 17 fr. VI)
  '2754004': 'servicios de blindaje de inmuebles',
  '3380005': 'vehículos blindados y equipo de blindaje',
  // Traslado y custodia de valores (art. 17 fr. VII)
  '4840007': 'transporte y custodia de valores',
  // Mutuo, préstamo y garantía sin ser del sistema financiero (art. 17 fr. IV)
  '5320013': 'casas de empeño',
  '5340013': 'intermediación crediticia no financiera',
  // Comercio exterior (art. 17 fr. XV y restricciones de efectivo)
  '1135070': 'agente aduanal',
  '4890007': 'servicios de agencias aduanales',
  // Vehículos, aeronaves y embarcaciones (art. 17 fr. X)
  '4720006': 'comercio de vehículos nuevos',
  '4730006': 'comercio de vehículos usados',
  // Inmuebles (art. 17 fr. V)
  '5520014': 'inmobiliarias y corredores de bienes raíces',
  // Transmisores de dinero (art. 17 fr. XI)
  '5370013': 'transmisores de dinero',
};

/**
 * BAJO · lista corta y CERRADA.
 *
 * Entidades financieras supervisadas y personas morales de derecho público. El
 * artículo 19 de la Ley prevé régimen simplificado de identificación para las
 * segundas, y las primeras tienen supervisor propio.
 *
 * Corta a propósito: cada entrada aquí es una excepción que baja el riesgo, y
 * una lista de excepciones que crece es una lista que dejó de ser excepción.
 */
const BAJO_SUPERVISADO: Record<string, string> = {
  '5210013': 'banca central',
  '5220013': 'banca múltiple',
  '5250013': 'uniones de crédito',
  '5350013': 'casas de bolsa',
  '5410013': 'compañías de seguros',
};

/** El nivel por defecto. NUNCA nulo, nunca cero. */
export const NIVEL_POR_DEFECTO: NivelActividad = 'medio';

const VALOR: Record<NivelActividad, 1 | 2 | 3> = { bajo: 1, medio: 2, alto: 3 };

/**
 * El riesgo de una clave de actividad económica o de giro mercantil.
 *
 * Siempre responde. Nunca devuelve null ni undefined: ver arriba por qué.
 */
export function riesgoDeActividad(clave: string | null | undefined): RiesgoActividad {
  const c = String(clave ?? '').trim();

  const alto = ALTO_ACTIVIDAD_VULNERABLE[c];
  if (alto) {
    return {
      nivel: 'alto',
      valor: VALOR.alto,
      mapeada: true,
      fuente: `${alto}: es una Actividad Vulnerable del artículo 17`,
    };
  }

  const bajo = BAJO_SUPERVISADO[c];
  if (bajo) {
    return {
      nivel: 'bajo',
      valor: VALOR.bajo,
      mapeada: true,
      fuente: `${bajo}: entidad financiera con supervisor propio`,
    };
  }

  if (!c) {
    return {
      nivel: NIVEL_POR_DEFECTO,
      valor: VALOR[NIVEL_POR_DEFECTO],
      mapeada: false,
      fuente:
        'No se capturó la actividad. Se toma el nivel medio por omisión: dejarla sin ' +
        'responder sumaría cero, que en esta escala es más bajo que la actividad más inocua.',
    };
  }

  return {
    nivel: NIVEL_POR_DEFECTO,
    valor: VALOR[NIVEL_POR_DEFECTO],
    mapeada: false,
    fuente:
      `La clave ${c} no está en la tabla de riesgo por actividad. Se toma el nivel medio ` +
      'por omisión, no el más bajo, y queda marcada para que Cumplimiento la clasifique.',
  };
}

/**
 * Las claves que se han visto y la tabla no contempla.
 *
 * Alimenta el reporte mensual a la célula de cumplimiento. Si crece mes a mes,
 * la tabla está desactualizada y la metodología deja de ser defendible: es el
 * indicador de que hay que revisarla, no un dato curioso.
 */
export function clavesNoMapeadas(claves: (string | null | undefined)[]): string[] {
  const vistas = new Set<string>();
  for (const k of claves) {
    const c = String(k ?? '').trim();
    if (!c) continue;
    if (!riesgoDeActividad(c).mapeada) vistas.add(c);
  }
  return [...vistas].sort();
}

/** Cuántas claves tiene la tabla. Para la consola de Kawiil y las pruebas. */
export function tamanoTabla(): { alto: number; bajo: number } {
  return {
    alto: Object.keys(ALTO_ACTIVIDAD_VULNERABLE).length,
    bajo: Object.keys(BAJO_SUPERVISADO).length,
  };
}
