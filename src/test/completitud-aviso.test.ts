import { describe, it, expect } from 'vitest';
import {
  SIN_APELLIDO,
  camposDelActo,
  camposPendientesDelSubarbol,
  catalogosPendientes,
  fechasIncoherentes,
  pendientesActo,
  pendientesCompareciente,
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

  it('cuenta los campos que faltan del subárbol del acto', () => {
    const p = pendientesActo(ACTO_BASE);
    const detalle = p.find((x) => x.campo === 'otorgamiento_poder')?.detalle ?? '';
    expect(detalle).toMatch(/Falta el detalle del acto: \d+ campos/);
  });

  it('capturar el subárbol baja la cuenta de faltantes', () => {
    const antes = camposPendientesDelSubarbol('otorgamiento_poder', {});
    const despues = camposPendientesDelSubarbol('otorgamiento_poder', { tipo_poder: '1' });
    expect(despues).toBe(antes - 1);
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
