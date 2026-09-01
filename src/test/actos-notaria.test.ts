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

describe('los campos del acto llegan completos al insert', () => {
  // `crearOperacion` arma la fila campo por campo, así que un campo nuevo en el
  // formulario que nadie añada aquí se pierde en silencio: el alta responde
  // 200, el acto se guarda, y el dato simplemente no está. Pasó con forma_pago
  // y pais_origen_recursos.
  it('la fila del insert cubre todo lo que el formulario captura', async () => {
    const fuente = await readFile('src/lib/api/operaciones.ts', 'utf8');
    const cuerpo = fuente.slice(
      fuente.indexOf('export async function crearOperacion'),
      fuente.indexOf('export async function actualizarDatosActo'),
    );
    for (const campo of [
      'client_id', 'tipo', 'monto_mxn', 'moneda_origen', 'activo_virtual',
      'contraparte', 'fecha', 'instrumento_publico', 'datos_acto',
      'forma_pago', 'pais_origen_recursos',
    ]) {
      expect(cuerpo, `crearOperacion no manda ${campo}`).toContain(`${campo}:`);
    }
  });
});
