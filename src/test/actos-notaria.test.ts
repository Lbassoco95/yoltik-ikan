import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TIPOS_ACTO_NOTARIA, actosDe, actosDelSppld, canalDeActo, labelTipoActo,
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
