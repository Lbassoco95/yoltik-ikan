import { describe, it, expect } from 'vitest';
import {
  CORTES_ABSOLUTOS_UMA,
  banderaBandaDeUmbral,
  banderaFraccionamiento,
  magnitudDeOperacion,
  umbralDelActo,
} from '@/lib/riesgo/tramos';
import {
  CORTES_INDICE,
  calcularIndice,
  maximoPosible,
  minimoPosible,
} from '@/lib/riesgo/indice';
import { PARAM } from '@/lib/parametros';
import type { MatrizConfig } from '@/types/domain';

// Umbral de una transmisión de inmuebles: 8,000 UMA.
const INMUEBLE = 8000;

describe('la magnitud se mide contra el umbral que le toca', () => {
  it('el mismo monto da tramos distintos según el acto', () => {
    // Es el defecto que la escala relativa arregla: 8,000 UMA es el 100 % del
    // umbral en una transmisión de inmuebles y el 200 % en un fideicomiso.
    expect(magnitudDeOperacion(8000, 8000).tramo).toBe('T3'); // 100 %
    expect(magnitudDeOperacion(8000, 4000).tramo).toBe('T4'); // 200 %
  });

  it('los cuatro tramos caen donde dice la Adenda', () => {
    expect(magnitudDeOperacion(INMUEBLE * 0.10, INMUEBLE).tramo).toBe('T1');
    expect(magnitudDeOperacion(INMUEBLE * 0.25, INMUEBLE).tramo).toBe('T2');
    expect(magnitudDeOperacion(INMUEBLE * 0.74, INMUEBLE).tramo).toBe('T2');
    expect(magnitudDeOperacion(INMUEBLE * 0.75, INMUEBLE).tramo).toBe('T3');
    expect(magnitudDeOperacion(INMUEBLE * 1.49, INMUEBLE).tramo).toBe('T3');
    expect(magnitudDeOperacion(INMUEBLE * 1.50, INMUEBLE).tramo).toBe('T4');
  });

  it('cruzar el umbral NO es lo que salta de tramo', () => {
    // El punto entero del diseño: la frontera de la escala está donde el
    // legislador no la puso. Con el corte en 100 % la escala sería una copia
    // del umbral de Aviso con otro nombre.
    expect(magnitudDeOperacion(INMUEBLE * 0.99, INMUEBLE).nivel).toBe(3);
    expect(magnitudDeOperacion(INMUEBLE * 1.01, INMUEBLE).nivel).toBe(3);
  });

  it('sin umbral usa los tramos absolutos anclados en el artículo 32', () => {
    // Los cinco actos que se avisan siempre no tienen proporción que calcular.
    expect(magnitudDeOperacion(500, null).tramo).toBe('T1');
    expect(magnitudDeOperacion(CORTES_ABSOLUTOS_UMA.t2, null).tramo).toBe('T2');
    expect(magnitudDeOperacion(CORTES_ABSOLUTOS_UMA.t3, null).tramo).toBe('T3');
    expect(magnitudDeOperacion(CORTES_ABSOLUTOS_UMA.t4, null).tramo).toBe('T4');
  });

  it('siempre explica cómo midió', () => {
    const conUmbral = magnitudDeOperacion(4000, 8000);
    expect(conUmbral.fuente).toMatch(/50 % del umbral/);
    const sinUmbral = magnitudDeOperacion(4000, null);
    expect(sinUmbral.fuente).toMatch(/se avisa siempre/i);
  });

  it('un monto inválido no revienta ni inventa riesgo', () => {
    expect(magnitudDeOperacion(NaN, 8000).nivel).toBe(1);
    expect(magnitudDeOperacion(-1, 8000).nivel).toBe(1);
  });
});

describe('la bandera de banda de umbral', () => {
  it('salta entre el 90 % y el 99.99 %', () => {
    expect(banderaBandaDeUmbral(INMUEBLE * 0.89, INMUEBLE)).toBeNull();
    expect(banderaBandaDeUmbral(INMUEBLE * 0.95, INMUEBLE)?.clave).toBe('banda_de_umbral');
    expect(banderaBandaDeUmbral(INMUEBLE * 0.999, INMUEBLE)?.clave).toBe('banda_de_umbral');
  });

  it('no salta al cruzar el umbral', () => {
    // Cruzarlo no es la señal: quedarse justo debajo lo es. Una operación que
    // lo cruza es reportable, que es otra cosa.
    expect(banderaBandaDeUmbral(INMUEBLE, INMUEBLE)).toBeNull();
    expect(banderaBandaDeUmbral(INMUEBLE * 2, INMUEBLE)).toBeNull();
  });

  it('sin umbral no hay banda que medir', () => {
    expect(banderaBandaDeUmbral(5000, null)).toBeNull();
  });

  it('captura lo que la escala de magnitud no puede', () => {
    // Una operación al 95 % es más sospechosa que una al 200 %, y a la vez la
    // de 200 % es de mayor magnitud. Una escala única tendría que subir y luego
    // bajar; por eso van separadas.
    const casi = INMUEBLE * 0.95;
    const doble = INMUEBLE * 2;
    expect(magnitudDeOperacion(casi, INMUEBLE).nivel).toBeLessThan(
      magnitudDeOperacion(doble, INMUEBLE).nivel,
    );
    expect(banderaBandaDeUmbral(casi, INMUEBLE)).not.toBeNull();
    expect(banderaBandaDeUmbral(doble, INMUEBLE)).toBeNull();
  });
});

describe('la bandera de posible fraccionamiento', () => {
  const umbral = () => INMUEBLE;

  it('salta cuando varias suman el umbral y ninguna lo alcanzaba', () => {
    const f = banderaFraccionamiento(
      [
        { id: 'a', tipo_acto: 'transmision_inmueble', monto_uma: 4500, fecha: '2026-03-01' },
        { id: 'b', tipo_acto: 'transmision_inmueble', monto_uma: 4000, fecha: '2026-06-01' },
      ],
      umbral,
    );
    expect(f?.clave).toBe('posible_fraccionamiento');
    expect(f?.detalle).toMatch(/Aviso por acumulación/i);
  });

  it('NO salta si una sola ya cruzaba el umbral', () => {
    // Ahí no hubo fraccionamiento: hubo una operación reportable.
    const f = banderaFraccionamiento(
      [
        { id: 'a', tipo_acto: 'transmision_inmueble', monto_uma: 9000, fecha: '2026-03-01' },
        { id: 'b', tipo_acto: 'transmision_inmueble', monto_uma: 100, fecha: '2026-06-01' },
      ],
      umbral,
    );
    expect(f).toBeNull();
  });

  it('acumula por TIPO de acto, no por cliente a secas', () => {
    // Sumar un poder con una compraventa daría un total que ningún umbral
    // gobierna.
    const f = banderaFraccionamiento(
      [
        { id: 'a', tipo_acto: 'transmision_inmueble', monto_uma: 4500, fecha: '2026-03-01' },
        { id: 'b', tipo_acto: 'otorgamiento_poder', monto_uma: 4000, fecha: '2026-06-01' },
      ],
      umbral,
    );
    expect(f).toBeNull();
  });

  it('una sola operación nunca es fraccionamiento', () => {
    const f = banderaFraccionamiento(
      [{ id: 'a', tipo_acto: 'transmision_inmueble', monto_uma: 7999, fecha: '2026-03-01' }],
      umbral,
    );
    expect(f).toBeNull();
  });
});

describe('umbralDelActo', () => {
  const valores: Record<string, number> = {
    [PARAM.XII_INMUEBLE]: 8000,
    [PARAM.XII_FIDEICOMISO]: 4000,
  };
  const buscar = (c: string) => valores[c];

  it('resuelve el umbral contra el catálogo, no contra una cifra escrita', () => {
    expect(umbralDelActo('transmision_inmueble', buscar).umbral).toBe(8000);
    expect(umbralDelActo('constitucion_modificacion_fideicomiso', buscar).umbral).toBe(4000);
  });

  it('los actos que se avisan siempre no traen umbral', () => {
    expect(umbralDelActo('otorgamiento_poder', buscar).umbral).toBeNull();
    expect(umbralDelActo('constitucion_personas_morales', buscar).umbral).toBeNull();
  });

  it('un acto desconocido no inventa umbral ni supuesto', () => {
    const r = umbralDelActo('compraventa_inmueble', buscar);
    expect(r.umbral).toBeNull();
    expect(r.supuesto).toBeUndefined();
  });
});

// ---------------------------------------------------------------------
// Índice normalizado
// ---------------------------------------------------------------------

/** Dos bloques excluyentes con distinto número de opciones: el caso que rompía. */
const CONFIG: MatrizConfig = {
  elementos: [
    {
      codigo: 'COMUN',
      nombre: 'Común',
      variables: [
        { codigo: 'C1', pregunta: 'c1', opciones: [
          { label: 'a', valor: 1 }, { label: 'b', valor: 2 }, { label: 'c', valor: 3 }] },
      ],
    },
    {
      codigo: 'PF', nombre: 'PF', aplica_si: "tipo_persona == 'fisica'",
      variables: [
        { codigo: 'F1', pregunta: 'f1', opciones: [
          { label: 'a', valor: 1 }, { label: 'b', valor: 2 }, { label: 'c', valor: 3 }] },
      ],
    },
    {
      codigo: 'PM', nombre: 'PM', aplica_si: "tipo_persona == 'moral'",
      variables: [
        { codigo: 'M1', pregunta: 'm1', opciones: [
          { label: 'a', valor: 1 }, { label: 'b', valor: 2 },
          { label: 'c', valor: 3 }, { label: 'd', valor: 4 }] },
      ],
    },
  ],
  escala_cliente: {
    bajo: { min: 0, max: 39, acciones: '' },
    medio: { min: 40, max: 69, acciones: '' },
    alto: { min: 70, max: 100, acciones: '' },
  },
  triggers_alto_de_oficio: [],
};

describe('el índice normalizado', () => {
  it('la forma jurídica deja de mover la clasificación', () => {
    // Era el defecto: con máximos distintos y una banda común, la persona moral
    // llegaba a «alto» con menos porcentaje de su puntaje posible que la
    // física, sin que ninguna decisión de política lo dispusiera.
    const fisica = calcularIndice(CONFIG, 'fisica', maximoPosible(CONFIG, 'fisica'));
    const moral = calcularIndice(CONFIG, 'moral', maximoPosible(CONFIG, 'moral'));
    expect(fisica.indice).toBe(100);
    expect(moral.indice).toBe(100);
    expect(fisica.banda).toBe(moral.banda);
  });

  it('el expediente más limpio posible da 0, no un 30 % fantasma', () => {
    // Se normaliza sobre el recorrido, no sobre el máximo: con variables cuyo
    // valor más bajo es 1, un expediente impecable habría sacado un tercio del
    // máximo y parecido tener un riesgo que no tiene.
    const limpio = calcularIndice(CONFIG, 'fisica', minimoPosible(CONFIG, 'fisica'));
    expect(limpio.indice).toBe(0);
    expect(limpio.banda).toBe('bajo');
  });

  it('las bandas caen en 40 y 70', () => {
    // Máximo 6, mínimo 2, recorrido 4. Puntaje 4 → (4-2)/4 = 50 %.
    expect(calcularIndice(CONFIG, 'fisica', 4).indice).toBe(50);
    expect(calcularIndice(CONFIG, 'fisica', 4).banda).toBe('medio');
    expect(calcularIndice(CONFIG, 'fisica', 5).indice).toBe(75);
    expect(calcularIndice(CONFIG, 'fisica', 5).banda).toBe('alto');
  });

  it('añadir una variable no descalibra la escala', () => {
    // Es la razón de normalizar y no separar: van a entrar tres bloques nuevos.
    const ampliada: MatrizConfig = {
      ...CONFIG,
      elementos: [
        ...CONFIG.elementos,
        { codigo: 'NUEVO', nombre: 'nuevo', variables: [
          { codigo: 'N1', pregunta: 'n1', opciones: [
            { label: 'a', valor: 1 }, { label: 'b', valor: 2 }, { label: 'c', valor: 3 }] }] },
      ],
    };
    // Todo en su valor más alto sigue dando 100 en las dos configuraciones.
    expect(calcularIndice(CONFIG, 'fisica', maximoPosible(CONFIG, 'fisica')).indice).toBe(100);
    expect(
      calcularIndice(ampliada, 'fisica', maximoPosible(ampliada, 'fisica')).indice,
    ).toBe(100);
  });
});

describe('los pisos ganan sobre la suma', () => {
  const PISO = [{ clave: 'ppe_extranjera', detalle: 'PPE extranjera' }];

  it('un expediente impecable con un piso activo queda en alto', () => {
    const r = calcularIndice(CONFIG, 'fisica', minimoPosible(CONFIG, 'fisica'), { pisos: PISO });
    expect(r.indice).toBe(0);
    expect(r.banda_por_indice).toBe('bajo');
    expect(r.banda).toBe('alto');
  });

  it('ninguna combinación favorable puede bajar de banda con piso activo', () => {
    // El techo simétrico. Sin él, el piso sería una sugerencia.
    for (const puntaje of [2, 3, 4, 5, 6]) {
      expect(calcularIndice(CONFIG, 'fisica', puntaje, { pisos: PISO }).banda).toBe('alto');
    }
  });

  it('sin pisos manda el índice', () => {
    const r = calcularIndice(CONFIG, 'fisica', 2);
    expect(r.pisos).toEqual([]);
    expect(r.banda).toBe(r.banda_por_indice);
  });

  it('los puntos de las banderas suman sin diluir el denominador', () => {
    // Las banderas son excepcionales por definición; meterlas en el máximo
    // diluiría todo lo demás.
    const sin = calcularIndice(CONFIG, 'fisica', 3);
    const con = calcularIndice(CONFIG, 'fisica', 3, { puntajeExtra: 2 });
    expect(con.maximo).toBe(sin.maximo);
    expect(con.indice).toBeGreaterThan(sin.indice);
  });
});

describe('la clasificación se declara provisional hasta calibrar', () => {
  it('por omisión es provisional', () => {
    // Los cortes de 40 y 70 son un punto de partida. Presentarlos como
    // definitivos antes de calibrar contra datos reales es justo lo que la
    // Adenda pide no hacer.
    expect(calcularIndice(CONFIG, 'fisica', 3).provisional).toBe(true);
  });

  it('deja de serlo sólo cuando alguien lo declara calibrado', () => {
    expect(calcularIndice(CONFIG, 'fisica', 3, { calibrada: true }).provisional).toBe(false);
  });

  it('los cortes son los del apartado 5.1', () => {
    expect(CORTES_INDICE).toEqual({ medio: 40, alto: 70 });
  });
});
