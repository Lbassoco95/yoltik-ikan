import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TIPOS_ACTO_NOTARIA, actosDe, actosDelSppld, canalDeActo, labelTipoActo,
  etiquetaConocimiento, nivelConocimiento,
} from '@/lib/perfil-actividad';

/** Los tipos de acto tal como los publica el SAT, extraídos del instructivo. */
const oficiales: { etiqueta_xml: string }[] = JSON.parse(
  readFileSync(resolve(__dirname, '../../docs/layouts-sat/tipos_acto_fep.json'), 'utf8'),
);

describe('catálogo de actos de la fracción XII', () => {
  it('los actos del SPPLD son exactamente los diez del layout del SAT', () => {
    // Esta es la prueba que importa: si alguien agrega un tipo inventado, el
    // aviso generado con él fallaría la validación en el portal el día 17.
    const nuestros = actosDelSppld().map((a) => a.value).sort();
    const suyos = oficiales.map((a) => a.etiqueta_xml).sort();
    expect(nuestros).toEqual(suyos);
  });

  it('la transmisión de inmuebles va por DeclaraNOT, no por el SPPLD', () => {
    // El artículo 17 fracción XII la menciona primero y es la trampa natural:
    // el layout del SPPLD no tiene etiqueta para ella porque va por otro sistema.
    expect(canalDeActo('transmision_inmueble')).toBe('declaranot');
    expect(actosDelSppld().map((a) => a.value)).not.toContain('transmision_inmueble');
  });

  it('no quedan los valores inventados del catálogo anterior', () => {
    const valores = TIPOS_ACTO_NOTARIA.map((a) => a.value);
    for (const viejo of ['compraventa_inmueble', 'poder_irrevocable', 'constitucion_sociedad', 'fideicomiso']) {
      expect(valores, `«${viejo}» no existe en el layout del SAT`).not.toContain(viejo);
    }
  });

  it('todo acto declara su canal', () => {
    for (const a of TIPOS_ACTO_NOTARIA) {
      expect(['sppld', 'declaranot'], a.value).toContain(a.canal);
    }
  });

  it('el corredor no otorga poderes irrevocables ni transmite inmuebles', () => {
    const suyos = actosDe('corredor').map((a) => a.value);
    expect(suyos).not.toContain('otorgamiento_poder');
    expect(suyos).not.toContain('transmision_inmueble');
  });

  it('el notario no hace avalúos como actividad vulnerable', () => {
    expect(actosDe('notario').map((a) => a.value)).not.toContain('avaluo');
  });

  it('etiqueta los actos de forma legible y no truena con uno desconocido', () => {
    expect(labelTipoActo('otorgamiento_poder')).toBe('Otorgamiento de poder irrevocable');
    expect(labelTipoActo('lo_que_sea')).toBe('lo_que_sea');
    expect(labelTipoActo(null)).toBe('—');
  });
});

describe('KYC o KYB, según a quién se conoce', () => {
  it('una persona moral no lleva KYC', () => {
    // KYC es el proceso sobre una PERSONA: identificación oficial y prueba de
    // vida. Sobre una sociedad lo que se hace es KYB —acta constitutiva, objeto
    // social, quién está detrás—. Llamarles igual le dice a un notario que a su
    // cliente sociedad se le hizo un proceso que no se le hizo.
    expect(etiquetaConocimiento('moral')).toBe('KYB');
    expect(etiquetaConocimiento('fisica')).toBe('KYC');
  });

  it('un tipo desconocido cae en KYC, no en vacío', () => {
    // Preferible a dejar la etiqueta en blanco: la gran mayoría de
    // comparecientes son personas físicas.
    expect(etiquetaConocimiento('')).toBe('KYC');
  });

  it('el nivel se compone sin perder cuál es', () => {
    expect(nivelConocimiento('fisica', 'N1')).toBe('KYC · N1');
    expect(nivelConocimiento('moral', 'N3')).toBe('KYB · N3');
  });
});

describe('los campos capturados llegan completos al insert', () => {
  // `crearOperacion` y `crearCliente` arman la fila campo por campo, así que un
  // campo nuevo en el tipo de entrada que nadie añada al insert se pierde en
  // SILENCIO: el alta responde 200, el registro se guarda, y el dato
  // simplemente no está. Ya pasó con forma_pago y pais_origen_recursos.
  //
  // La lista NO se escribe a mano aquí: se lee del tipo de entrada. Una lista
  // escrita a mano tiene el mismo defecto que quiere prevenir —hay que
  // acordarse de actualizarla— y falla el día que a alguien se le olvida.
  async function camposDeLaInterfaz(nombre: string): Promise<string[]> {
    const dominio = await readFile('src/types/domain.ts', 'utf8');
    const inicio = dominio.indexOf(`export interface ${nombre} {`);
    expect(inicio, `no se encontró ${nombre}`).toBeGreaterThan(-1);
    const cuerpo = dominio.slice(inicio, dominio.indexOf('\n}', inicio));
    return [...cuerpo.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
  }

  it('la fila de crearOperacion cubre todo NuevaOperacionInput', async () => {
    const fuente = await readFile('src/lib/api/operaciones.ts', 'utf8');
    const cuerpo = fuente.slice(
      fuente.indexOf('export async function crearOperacion'),
      fuente.indexOf('export async function actualizarDatosActo'),
    );
    const campos = await camposDeLaInterfaz('NuevaOperacionInput');
    expect(campos.length).toBeGreaterThan(10);
    for (const campo of campos) {
      expect(cuerpo, `crearOperacion no manda ${campo}`).toContain(`${campo}:`);
    }
  });

  it('la fila de crearCliente cubre todo NuevoClienteInput', async () => {
    const fuente = await readFile('src/lib/api/clientes.ts', 'utf8');
    const cuerpo = fuente.slice(
      fuente.indexOf('export async function crearCliente'),
      fuente.indexOf('export async function getPlantillaRiesgoActiva'),
    );
    const campos = await camposDeLaInterfaz('NuevoClienteInput');
    expect(campos.length).toBeGreaterThan(10);
    for (const campo of campos) {
      expect(cuerpo, `crearCliente no manda ${campo}`).toContain(`${campo}:`);
    }
  });
});
