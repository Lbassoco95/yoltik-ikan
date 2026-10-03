import { describe, expect, it } from 'vitest';
import { etiquetaVersionDof } from '@/lib/formatos-uif/etiquetas';

describe('etiquetas formato DOF', () => {
  it('traduce dof-2026-09-24 a fecha en español MX', () => {
    const et = etiquetaVersionDof('dof-2026-09-24');
    expect(et).toMatch(/septiembre/i);
    expect(et).toMatch(/2026/);
    expect(et).toMatch(/24/);
  });

  it('deja intacta una versión no parseable', () => {
    expect(etiquetaVersionDof('custom-v1')).toBe('custom-v1');
  });
});
