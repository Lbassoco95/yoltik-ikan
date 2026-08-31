import { describe, it, expect } from 'vitest';
import { generarAvisoXml } from '@/lib/aviso/generador-xml';
import { ramaDelActo } from '@/lib/aviso/ramas-acto';
import { claveConteo, claveDato, escribirValor, escribirVariante } from '@/lib/aviso/valores-acto';
import {
  SIN_APELLIDO,
  camposDelActo,
  camposPendientesDelSubarbol,
  pendientesDelSubarbol,
  catalogosPendientes,
  fechasIncoherentes,
  pendientesActo,
  pendientesCompareciente,
  pendientesIdentificacion,
  pendientesSujetoObligado,
  resumenExpediente,
  subarbolDeActo,
  type ComparecienteParaAviso,
} from '@/lib/aviso/completitud';
import { CAMPOS_FEP } from '@/lib/aviso/campos-fep.generated';
import { actosDelSppld } from '@/lib/perfil-actividad';

const campos = (ps: { campo: string }[]) => ps.map((p) => p.campo);

/** Persona física con todo capturado. Fecha, RFC y CURP son coherentes entre sí
 *  a propósito: 800502 en los tres. */
const PF_COMPLETA: ComparecienteParaAviso = {
  tipo_persona: 'fisica',
  nombre: 'JUAN CARLOS',
  apellido_paterno: 'PEREZ',
  apellido_materno: 'LOPEZ',
  fecha_nacimiento: '1980-05-02',
  rfc: 'PELJ800502AB1',
  curp: 'PELJ800502HDFRPN09',
  pais_nacionalidad_clave: 'MX',
};

describe('diccionario del layout de fe pública', () => {
  it('transcribe los 518 campos del instructivo', () => {
    expect(CAMPOS_FEP).toHaveLength(518);
  });

  it('los diez actos del SPPLD tienen su rama en el layout', () => {
    for (const acto of actosDelSppld()) {
      expect(subarbolDeActo(acto.value), acto.value).toBeDefined();
    }
  });

  it('cada rama de acto aporta campos con valor, no sólo etiquetas', () => {
    for (const acto of actosDelSppld()) {
      expect(camposDelActo(acto.value).length, acto.value).toBeGreaterThan(0);
    }
  });

  it('un tipo de acto que no existe en el layout no inventa campos', () => {
    // 'transmision_inmueble' se presenta por DeclaraNOT: no tiene rama aquí.
    expect(subarbolDeActo('transmision_inmueble')).toBeUndefined();
    expect(camposDelActo('transmision_inmueble')).toEqual([]);
  });

  it('reporta los catálogos de la UIF que la rama necesita', () => {
    expect(catalogosPendientes('otorgamiento_poder')).toContain('Tipo de Poder');
  });
});

describe('pendientes del compareciente persona física', () => {
  it('una persona física completa no tiene pendientes', () => {
    expect(pendientesCompareciente(PF_COMPLETA)).toEqual([]);
  });

  it('reclama los apellidos por separado', () => {
    const p = pendientesCompareciente({ ...PF_COMPLETA, apellido_paterno: '', apellido_materno: '' });
    expect(campos(p)).toEqual(expect.arrayContaining(['apellido_paterno', 'apellido_materno']));
  });

  it('acepta XXXX en un apellido pero no en los dos', () => {
    const uno = pendientesCompareciente({ ...PF_COMPLETA, apellido_materno: SIN_APELLIDO });
    expect(uno).toEqual([]);

    const dos = pendientesCompareciente({
      ...PF_COMPLETA,
      apellido_paterno: SIN_APELLIDO,
      apellido_materno: SIN_APELLIDO,
    });
    expect(dos.some((p) => p.detalle.includes('no pueden ser'))).toBe(true);
  });

  it('sin fecha de nacimiento, RFC ni CURP el aviso se frena', () => {
    const p = pendientesCompareciente({
      ...PF_COMPLETA,
      fecha_nacimiento: null,
      rfc: null,
      curp: null,
    });
    const bloqueo = p.find((x) => x.gravedad === 'bloquea_aviso' && x.campo === 'fecha_nacimiento');
    expect(bloqueo?.detalle).toContain('al menos uno de los tres');
  });

  it('con sólo uno de los tres el aviso sale, pero se recomienda completar', () => {
    const p = pendientesCompareciente({
      ...PF_COMPLETA,
      rfc: null,
      curp: null,
    });
    expect(p.every((x) => x.gravedad === 'recomendado')).toBe(true);
    expect(campos(p)).toEqual(expect.arrayContaining(['rfc', 'curp']));
  });

  it('detecta el RFC que no trae homoclave', () => {
    const p = pendientesCompareciente({ ...PF_COMPLETA, rfc: 'PELJ800502' });
    expect(p.some((x) => x.campo === 'rfc' && x.gravedad === 'bloquea_aviso')).toBe(true);
  });

  it('detecta que la fecha de nacimiento no cuadra con el RFC', () => {
    const p = pendientesCompareciente({ ...PF_COMPLETA, fecha_nacimiento: '1980-05-03' });
    expect(p.some((x) => x.detalle.includes('VC354R4'))).toBe(true);
  });

  it('la coherencia compara sólo AAMMDD: el siglo no viaja en la clave', () => {
    // Nacida en 2005; el RFC dice 050502 igual que uno de 1905. No es error.
    expect(
      fechasIncoherentes({ fecha_nacimiento: '2005-05-02', rfc: 'PELJ050502AB1', curp: null }),
    ).toBe(false);
    expect(fechasIncoherentes({ fecha_nacimiento: '1980-05-02', curp: 'PELJ800503HDFRPN09' })).toBe(
      true,
    );
  });
});

describe('pendientes del compareciente persona moral', () => {
  it('no le reclama apellidos a una sociedad', () => {
    const p = pendientesCompareciente({
      tipo_persona: 'moral',
      nombre_razon_social: 'INMOBILIARIA DEL BAJIO SA DE CV',
      fecha_constitucion: '2015-03-10',
      rfc: 'IBA150310XY1',
      pais_nacionalidad_clave: 'MX',
      actividad_economica_clave: '5311001',
    });
    expect(p).toEqual([]);
  });

  it('exige fecha de constitución y RFC de 12 caracteres', () => {
    const p = pendientesCompareciente({
      tipo_persona: 'moral',
      nombre_razon_social: 'ACME SA DE CV',
      rfc: 'ACME150310XY1',
    });
    expect(campos(p)).toEqual(expect.arrayContaining(['fecha_constitucion', 'rfc']));
  });
});

describe('pendientes del acto', () => {
  const ACTO_BASE = {
    fecha: '2026-08-14T12:00:00.000Z',
    instrumento_publico: '45321',
    tipo_acto: 'otorgamiento_poder',
    datos_acto: {},
  };

  it('reclama el número de instrumento', () => {
    const p = pendientesActo({ ...ACTO_BASE, instrumento_publico: '' });
    expect(campos(p)).toContain('instrumento_publico');
  });

  it('rechaza la coma del número de instrumento escrito a la mexicana', () => {
    const p = pendientesActo({ ...ACTO_BASE, instrumento_publico: '45,321' });
    const err = p.find((x) => x.campo === 'instrumento_publico');
    expect(err?.detalle).toContain('sin comas');
  });

  it('acepta guiones y ceros a la izquierda', () => {
    const p = pendientesActo({ ...ACTO_BASE, instrumento_publico: '0045-321_A' });
    expect(campos(p)).not.toContain('instrumento_publico');
  });

  it('sin tipo de acto no hay rama que llenar', () => {
    const p = pendientesActo({ ...ACTO_BASE, tipo_acto: null });
    expect(campos(p)).toContain('tipo_actividad');
  });

  it('nombra cada campo que falta de la rama, no un total', () => {
    const p = pendientesActo(ACTO_BASE);
    const delActo = p.filter((x) => x.origen === 'acto' && x.no.startsWith('3.6.1.3.1'));
    expect(delActo.length).toBeGreaterThan(0);
    // Cada pendiente apunta a un campo del instructivo y se explica solo.
    for (const x of delActo) {
      expect(x.detalle.length).toBeGreaterThan(5);
      expect(x.gravedad).toBe('bloquea_aviso');
    }
    expect(p.map((x) => x.detalle).join(' ')).not.toMatch(/\d+ campos de esta rama/);
  });

  it('dice de qué apoderado falta el dato cuando hay varios', () => {
    const p = pendientesDelSubarbol('otorgamiento_poder', { [claveConteo('3.6.1.3.1.2')]: 2 });
    const contextos = [...new Set(p.map((x) => x.contexto).filter(Boolean))];
    expect(contextos.some((c) => /Apoderados 1/.test(c!))).toBe(true);
    expect(contextos.some((c) => /Apoderados 2/.test(c!))).toBe(true);
  });

  it('un valor con formato inválido pesa igual que uno que falta', () => {
    // Un RFC de doce caracteres en una persona física no lo rechaza nadie
    // hasta el día 17. Aquí se ve al escribirlo.
    const tipoPersona = ramaDelActo('otorgamiento_poder')!.hijos[1].hijos.find(
      (h) => h.esTipoPersona,
    )!;
    const datos = escribirValor(
      escribirVariante({}, tipoPersona, [0], 'persona_fisica'),
      '3.6.1.3.1.2.2.1.5',
      [0],
      'PELJ80050AB1',
    );
    const conRfcCorto = pendientesDelSubarbol('otorgamiento_poder', datos);
    expect(conRfcCorto.some((x) => x.campo === 'rfc' && /RFC/.test(x.detalle))).toBe(true);
  });

  it('capturar el subárbol baja la cuenta de faltantes', () => {
    const antes = camposPendientesDelSubarbol('otorgamiento_poder', {});
    const despues = camposPendientesDelSubarbol('otorgamiento_poder', {
      // Tipo de poder del primer apoderado: el grupo es repetible.
      [claveDato('3.6.1.3.1.2.1', [0])]: '1',
    });
    expect(despues).toBe(antes - 1);
  });

  it('cada repetición cuenta aparte: dos apoderados piden dos juegos de datos', () => {
    const uno = camposPendientesDelSubarbol('otorgamiento_poder', {});
    const dos = camposPendientesDelSubarbol('otorgamiento_poder', {
      [claveConteo('3.6.1.3.1.2')]: 2,
    });
    expect(dos).toBeGreaterThan(uno);
  });

  it('elegir el tipo de persona cambia lo que falta', () => {
    const sinElegir = camposPendientesDelSubarbol('otorgamiento_poder', {});
    const rama = ramaDelActo('otorgamiento_poder')!;
    const tipoPersona = rama.hijos[0].hijos[0]; // <tipo_persona> del poderdante
    const conFisica = camposPendientesDelSubarbol(
      'otorgamiento_poder',
      escribirVariante({}, tipoPersona, [0], 'persona_fisica'),
    );
    // Deja de faltar la elección y empiezan a faltar los datos de la persona.
    expect(conFisica).not.toBe(sinElegir);
  });

  it('no cuenta un contenedor opcional que nadie llenó', () => {
    // El mutuo trae <datos_garantia>, que sólo aplica si hay garantía. Vacío no
    // debe pedir nada: si lo pidiera, el aviso nunca se podría cerrar.
    const mutuo = camposPendientesDelSubarbol('contrato_mutuo_credito', {});
    const conGarantia = camposPendientesDelSubarbol('contrato_mutuo_credito', {
      [claveDato('3.6.1.3.9.4.1', [0])]: '1',
    });
    expect(conGarantia).toBeGreaterThan(mutuo);
  });
});

/**
 * La cuenta de la pantalla y lo que frena al generador tienen que ser la misma
 * cosa. Si divergen, la captura diría "listo para aviso" y el portal
 * rechazaría el archivo: el peor de los dos errores posibles.
 */
describe('la cuenta de pendientes coincide con lo que frena el XML', () => {
  const BASE = {
    mes_reportado: '2026-08',
    sujeto: { clave_sujeto_obligado: 'NOTA900101AB1', clave_actividad: 'FEP' },
    actos: [] as never[],
  };

  const acto = (datos_acto: Record<string, unknown>) => ({
    referencia_aviso: 'IKAN2608001',
    prioridad: '1' as const,
    alerta: { tipo: '100', descripcion: 'Sin alerta' },
    persona: {
      nombre: 'Juan',
      apellido_paterno: 'Pérez',
      apellido_materno: 'López',
      rfc: 'PELJ800502AB1',
    },
    instrumento_publico: '45321',
    fecha_operacion: '2026-08-14',
    tipo_acto: 'otorgamiento_poder',
    datos_acto,
  });

  it('cero pendientes implica que el generador no se queja de la rama', () => {
    let d: Record<string, unknown> = {};
    const rama = ramaDelActo('otorgamiento_poder')!;
    const tp = (i: 0 | 1) => rama.hijos[i].hijos.find((h) => h.esTipoPersona)!;
    d = escribirVariante(d, tp(0), [0], 'persona_fisica');
    d = escribirVariante(d, tp(1), [0], 'persona_fisica');
    for (const [no, valor] of [
      ['3.6.1.3.1.1.1.1.1', 'MARIA'],
      ['3.6.1.3.1.1.1.1.2', 'MUÑOZ'],
      ['3.6.1.3.1.1.1.1.3', 'RAMIREZ'],
      ['3.6.1.3.1.1.1.1.5', 'MURM750311AB1'],
      ['3.6.1.3.1.1.1.1.7', 'MX'],
      ['3.6.1.3.1.1.1.1.8', '1234567'],
      ['3.6.1.3.1.2.1', '1'],
      ['3.6.1.3.1.2.2.1.1', 'JUAN'],
      ['3.6.1.3.1.2.2.1.2', 'PEREZ'],
      ['3.6.1.3.1.2.2.1.3', 'LOPEZ'],
      ['3.6.1.3.1.2.2.1.5', 'PELJ800502AB1'],
      ['3.6.1.3.1.2.2.1.7', 'MX'],
    ] as const)
      d = escribirValor(d, no, [0], valor);

    expect(camposPendientesDelSubarbol('otorgamiento_poder', d)).toBe(0);
    const r = generarAvisoXml({ ...BASE, actos: [acto(d)] });
    expect(r.errores).toEqual([]);
  });

  it('con pendientes el generador tampoco entrega archivo', () => {
    expect(camposPendientesDelSubarbol('otorgamiento_poder', {})).toBeGreaterThan(0);
    expect(generarAvisoXml({ ...BASE, actos: [acto({})] }).xml).toBeNull();
  });
});

describe('pendientes del sujeto obligado', () => {
  it('sin claves del padrón ningún aviso se puede generar', () => {
    const p = pendientesSujetoObligado({});
    expect(campos(p)).toEqual(['clave_sujeto_obligado', 'clave_actividad']);
    expect(p.every((x) => x.gravedad === 'bloquea_aviso')).toBe(true);
  });

  it('con las claves capturadas no queda pendiente', () => {
    expect(
      pendientesSujetoObligado({ clave_sujeto_obligado: 'NOTA900101AB1', clave_actividad: 'FEP' }),
    ).toEqual([]);
  });
});

describe('resumen del expediente', () => {
  const ORG = { clave_sujeto_obligado: 'NOTA900101AB1', clave_actividad: 'FEP' };

  it('todo lo pendiente es del momento de la captura, no del cierre', () => {
    const r = resumenExpediente(ORG, { tipo_persona: 'fisica' }, {});
    expect(r.pendientes.every((p) => p.momento === 'captura')).toBe(true);
  });

  it('un expediente incompleto no está listo para aviso', () => {
    const r = resumenExpediente(ORG, { tipo_persona: 'fisica' }, {});
    expect(r.listoParaAviso).toBe(false);
    expect(r.bloqueanElAviso.length).toBeGreaterThan(0);
  });

  it('separa lo que frena el aviso de lo que sólo lo debilita', () => {
    const r = resumenExpediente(
      ORG,
      { ...PF_COMPLETA, curp: null, pais_nacionalidad_clave: null },
      { fecha: '2026-08-14', instrumento_publico: '45321', tipo_acto: 'otorgamiento_poder', datos_acto: { tipo_poder: '1' } },
    );
    expect(campos(r.recomendados)).toEqual(
      expect.arrayContaining(['curp', 'pais_nacionalidad']),
    );
    expect(r.bloqueanElAviso.every((p) => p.origen === 'acto')).toBe(true);
  });
});

describe('la identificación del artículo 18 va aparte del layout', () => {
  it('sin verificación, el expediente no está completo', () => {
    const p = pendientesIdentificacion(null);
    expect(p).toHaveLength(1);
    expect(p[0].gravedad).toBe('bloquea_expediente');
  });

  it('NUNCA se presenta como algo que el portal rechace', () => {
    // El XML del SPPLD no tiene un campo que diga si al compareciente lo
    // identificaron: un aviso de alguien sin verificar pasa la validación igual
    // de bien. Decir lo contrario contagiaría de duda a los renglones ciertos.
    for (const estado of [null, 'no_iniciada', 'en_progreso', 'rechazada', 'expirada']) {
      for (const x of pendientesIdentificacion(estado)) {
        expect(x.gravedad).not.toBe('bloquea_aviso');
      }
    }
  });

  it('sólo «aprobada» cierra el pendiente', () => {
    expect(pendientesIdentificacion('aprobada')).toEqual([]);
    // En progreso es una verificación que la persona no ha terminado, y
    // rechazada es peor que no tenerla: significa que NO se comprobó.
    expect(pendientesIdentificacion('en_progreso')).toHaveLength(1);
    expect(pendientesIdentificacion('rechazada')).toHaveLength(1);
    expect(pendientesIdentificacion('expirada')).toHaveLength(1);
  });

  it('distingue no pedida, sin resolver y rechazada', () => {
    expect(pendientesIdentificacion(null)[0].detalle).toMatch(/no se le ha pedido/i);
    expect(pendientesIdentificacion('en_progreso')[0].detalle).toMatch(/sin resolver/i);
    expect(pendientesIdentificacion('rechazada')[0].detalle).toMatch(/no pasó/i);
  });
});

describe('la identificación no crea pendientes imposibles', () => {
  it('una persona moral no se identifica con Didit', () => {
    // El diálogo de envío se niega a abrirle una verificación —no tiene INE ni
    // cara— así que exigirla sería un pendiente que nadie puede cerrar nunca. Y
    // un pendiente imposible enseña a ignorar la lista entera.
    expect(pendientesIdentificacion(null, { tipoPersona: 'moral' })).toEqual([]);
    expect(pendientesIdentificacion('rechazada', { tipoPersona: 'moral' })).toEqual([]);
    // La física sí.
    expect(pendientesIdentificacion(null, { tipoPersona: 'fisica' })).toHaveLength(1);
  });

  it('mientras carga no afirma que no se le haya pedido', () => {
    // Sin esto, un compareciente verificado aparecía medio segundo como si
    // nunca se le hubiera pedido nada, y luego saltaba a verde.
    expect(pendientesIdentificacion(undefined, { cargando: true })).toEqual([]);
    expect(pendientesIdentificacion(undefined, { cargando: false })).toHaveLength(1);
  });
});
