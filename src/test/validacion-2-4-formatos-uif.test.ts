/**
 * Criterio 2.4 — longitud / patrón / tipo contra la versión aplicable (anexo 16 + 12-A).
 * Casos de la tabla del brief: válido + inválido. Cobertura: todo campo anexo 16 con longitud.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import {
  clasificarFormato,
  longitudDeclarada,
  validarCampo,
  type CampoFormato,
} from '@/lib/formatos-uif/validacion';
import { derivarPatronDof } from '@/lib/formatos-uif/patron-dof';

const DIR = join(process.cwd(), 'docs/formatos-uif');

function cargarAnexo(archivo: string): CampoFormato[] {
  const raw = JSON.parse(readFileSync(join(DIR, archivo), 'utf8'));
  return (raw.campos as Record<string, unknown>[]).map((c) => ({
    orden: c.orden as number,
    numero: c.numero as string,
    padre: (c.padre as string | null) ?? null,
    nombre: c.nombre as string,
    etiqueta_xml: c.etiqueta_xml as string,
    obligatoriedad: c.obligatoriedad as string,
    tipo_dato: c.tipo_dato as string,
    longitud: c.longitud as string,
    formato: c.formato as string,
  }));
}

function campo(anexo: CampoFormato[], numero: string): CampoFormato {
  const c = anexo.find((x) => x.numero === numero);
  if (!c) throw new Error(`Campo ${numero} no encontrado`);
  return c;
}

const a16 = cargarAnexo('anexo-16.json');
const a12a = cargarAnexo('anexo-12-A.json');
const a14a = cargarAnexo('anexo-14-A.json');

function tieneFormato(c: CampoFormato): boolean {
  const f = (c.formato ?? '').trim();
  return Boolean(f) && !/^n\/a$/i.test(f);
}

describe('2.4 tabla brief — válido e inválido', () => {
  it('rfc 16/3.5.2.1.1.5 — longitud 13 + LLLLAAMMDDXXX', () => {
    const c = campo(a16, '3.5.2.1.1.5');
    const ok = validarCampo(c, { valores: { rfc: 'ABCD010101XXX' }, catalogos: {} });
    const bad = validarCampo(c, { valores: { rfc: 'ABC010101XXX' }, catalogos: {} });
    expect(ok.estado).toBe('ok');
    expect(bad.estado).toBe('error');
    expect((bad as { motivo: string }).motivo).toMatch(/3\.5\.2\.1\.1\.5/);
    expect((bad as { motivo: string }).motivo).toMatch(/esperada 13/);
  });

  it('curp 16/3.5.2.1.1.6 — longitud 18 + patrón CURP', () => {
    const c = campo(a16, '3.5.2.1.1.6');
    const ok = validarCampo(c, {
      valores: { curp: 'ABCD010101HDFRRN09' },
      catalogos: {},
    });
    const bad = validarCampo(c, {
      valores: { curp: 'ABCD010101HDFRRN0' },
      catalogos: {},
    });
    expect(ok.estado).toBe('ok');
    expect(bad.estado).toBe('error');
    expect((bad as { motivo: string }).motivo).toMatch(/3\.5\.2\.1\.1\.6/);
  });

  it('descripcion_alerta 16/3.4.2 — rango 15-3000 (mínimo)', () => {
    const c = campo(a16, '3.4.2');
    const ok = validarCampo(c, {
      valores: { descripcion_alerta: 'x'.repeat(15) },
      catalogos: {},
    });
    const bad = validarCampo(c, {
      valores: { descripcion_alerta: 'corto' },
      catalogos: {},
    });
    expect(ok.estado).toBe('ok');
    expect(bad.estado).toBe('error');
    expect((bad as { motivo: string }).motivo).toMatch(/15-3000/);
  });

  it('acumulacion 16/3.7 — longitud 2', () => {
    const c = campo(a16, '3.7');
    expect(validarCampo(c, { valores: { acumulacion: 'SI' }, catalogos: {} }).estado).toBe(
      'ok',
    );
    const bad = validarCampo(c, { valores: { acumulacion: 'S' }, catalogos: {} });
    expect(bad.estado).toBe('error');
    expect((bad as { motivo: string }).motivo).toMatch(/3\.7/);
  });

  it('monto_operacion 16/3.5.3.3.1.3 — rango 4-25 + decimales obligatorios', () => {
    const c = campo(a16, '3.5.3.3.1.3');
    expect(
      validarCampo(c, { valores: { monto_operacion: '1234.56' }, catalogos: {} }).estado,
    ).toBe('ok');
    const badLen = validarCampo(c, { valores: { monto_operacion: '12' }, catalogos: {} });
    expect(badLen.estado).toBe('error');
    expect((badLen as { motivo: string }).motivo).toMatch(/4-25/);
    const sinDec = validarCampo(c, { valores: { monto_operacion: '1234' }, catalogos: {} });
    expect(sinDec.estado).toBe('error');
    expect((sinDec as { motivo: string }).motivo).toMatch(/decimales obligatorios/);
  });

  it('mes_reportado 16/1 — AAAAMM', () => {
    const c = campo(a16, '1');
    expect(validarCampo(c, { valores: { mes_reportado: '202609' }, catalogos: {} }).estado).toBe(
      'ok',
    );
    const bad = validarCampo(c, { valores: { mes_reportado: '2026' }, catalogos: {} });
    expect(bad.estado).toBe('error');
    expect((bad as { motivo: string }).motivo).toMatch(/^Campo 1:/);
  });

  it('folio_modificacion 16/3.3.1 — AAAA-999999999 sin ceros a la izquierda', () => {
    const c = campo(a16, '3.3.1');
    expect(
      validarCampo(c, { valores: { folio_modificacion: '2026-123456789' }, catalogos: {} })
        .estado,
    ).toBe('ok');
    const cero = validarCampo(c, {
      valores: { folio_modificacion: '2026-012345678' },
      catalogos: {},
    });
    expect(cero.estado).toBe('error');
    expect((cero as { motivo: string }).motivo).toMatch(/3\.3\.1/);
    const corto = validarCampo(c, {
      valores: { folio_modificacion: '2026-1' },
      catalogos: {},
    });
    expect(corto.estado).toBe('error');
  });

  it('codigo_postal extr. 16/3.5.1.3.1.5 — longitud 5', () => {
    const c = campo(a16, '3.5.1.3.1.5');
    expect(
      validarCampo(c, { valores: { codigo_postal: '12345' }, catalogos: {} }).estado,
    ).toBe('ok');
    const bad = validarCampo(c, { valores: { codigo_postal: '1234' }, catalogos: {} });
    expect(bad.estado).toBe('error');
    expect((bad as { motivo: string }).motivo).toMatch(/3\.5\.1\.3\.1\.5/);
  });

  it('pais_nacionalidad OPCIONAL 16/3.6.1.4.1.1.7 — ausente OK, mal capturado falla', () => {
    const c = campo(a16, '3.6.1.4.1.1.7');
    expect(c.obligatoriedad.toLowerCase()).toMatch(/opcional/);
    expect(validarCampo(c, { valores: {}, catalogos: {} }).estado).toBe('omitido');
    const bad = validarCampo(c, { valores: { pais_nacionalidad: 'MEX' }, catalogos: {} });
    expect(bad.estado).toBe('error');
    expect((bad as { motivo: string }).motivo).toMatch(/3\.6\.1\.4\.1\.1\.7/);
  });

  it('prioridad 16/3.2 — patrón 9', () => {
    const c = campo(a16, '3.2');
    expect(validarCampo(c, { valores: { prioridad: '1' }, catalogos: {} }).estado).toBe('ok');
    const bad = validarCampo(c, { valores: { prioridad: '12' }, catalogos: {} });
    expect(bad.estado).toBe('error');
    expect((bad as { motivo: string }).motivo).toMatch(/3\.2/);
  });

  it('tipo_alerta 16/3.4.1 — longitud 3-4 + patrón 9999', () => {
    const c = campo(a16, '3.4.1');
    expect(validarCampo(c, { valores: { tipo_alerta: '1001' }, catalogos: {} }).estado).toBe(
      'ok',
    );
    const corto = validarCampo(c, { valores: { tipo_alerta: '10' }, catalogos: {} });
    expect(corto.estado).toBe('error');
    expect((corto as { motivo: string }).motivo).toMatch(/3\.4\.1/);
    // 3 dígitos: pasa longitud mínima, falla patrón 9999
    const tres = validarCampo(c, { valores: { tipo_alerta: '100' }, catalogos: {} });
    expect(tres.estado).toBe('error');
    expect((tres as { motivo: string }).motivo).toMatch(/patrón esperado 9999/);
  });

  it('clave_actividad 16/2.3 — patrón AAA', () => {
    const c = campo(a16, '2.3');
    expect(validarCampo(c, { valores: { clave_actividad: 'AVI' }, catalogos: {} }).estado).toBe(
      'ok',
    );
    const bad = validarCampo(c, { valores: { clave_actividad: 'AV' }, catalogos: {} });
    expect(bad.estado).toBe('error');
    expect((bad as { motivo: string }).motivo).toMatch(/2\.3/);
  });

  it('fecha_operacion 12-A/3.6.1.2 — AAAAMMDD', () => {
    const c = campo(a12a, '3.6.1.2');
    expect(
      validarCampo(c, { valores: { fecha_operacion: '20260915' }, catalogos: {} }).estado,
    ).toBe('ok');
    const bad = validarCampo(c, {
      valores: { fecha_operacion: '2026-09-15' },
      catalogos: {},
    });
    expect(bad.estado).toBe('error');
    expect((bad as { motivo: string }).motivo).toMatch(/3\.6\.1\.2/);
  });

  it('correo_electronico 16/3.5.1.4.3 — patrón con espacios → no_validado', () => {
    const c = campo(a16, '3.5.1.4.3');
    const p = derivarPatronDof(c.formato);
    expect(p.estado).toBe('no_validado');
    const r = validarCampo(c, {
      valores: { correo_electronico: 'A@B.C' },
      catalogos: {},
    });
    expect(r.estado).toBe('no_validado');
    expect((r as { motivo: string }).motivo).toMatch(/3\.5\.1\.4\.3/);
  });
});

describe('2.4 cobertura anexo 16 — longitud declarada', () => {
  it('todo campo con longitud numérica/rango tiene regla activa', () => {
    const conLongitud = a16.filter((c) => {
      const d = longitudDeclarada(c.longitud);
      return d.clase === 'exacta' || d.clase === 'rango';
    });
    expect(conLongitud.length).toBeGreaterThan(0);

    for (const c of conLongitud) {
      const d = longitudDeclarada(c.longitud);
      if (d.clase !== 'exacta' && d.clase !== 'rango') continue;
      // Valor vacío no prueba longitud (obligatoriedad). Valor fuera de rango sí.
      const demasiadoCorto =
        d.clase === 'exacta' ? 'x'.repeat(Math.max(0, d.n - 1)) : 'x'.repeat(Math.max(0, d.min - 1));
      // Si min/exacta es 0, usar exceso
      const valorPrueba =
        demasiadoCorto.length === 0 && d.clase === 'exacta'
          ? 'x'.repeat(d.n + 1)
          : demasiadoCorto.length === 0 && d.clase === 'rango'
            ? 'x'.repeat(d.max + 1)
            : demasiadoCorto;

      const r = validarCampo(c, {
        valores: { [c.numero]: valorPrueba },
        catalogos: {},
      });
      expect(r.estado, `${c.numero} long=${c.longitud}`).toBe('error');
      expect((r as { motivo: string }).motivo).toMatch(new RegExp(`Campo ${c.numero.replace(/\./g, '\\.')}`));
      expect((r as { motivo: string }).motivo).toMatch(/longitud|esperada|rango/);
    }
  });
});

describe('2.4 prosa — montos y enumeraciones', () => {
  it('acumulacion SI/NO: válido / inválido', () => {
    const c = campo(a16, '3.7');
    expect(clasificarFormato(c.formato).cubo).toBe('prosa');
    expect(validarCampo(c, { valores: { acumulacion: 'NO' }, catalogos: {} }).estado).toBe('ok');
    const bad = validarCampo(c, { valores: { acumulacion: 'si' }, catalogos: {} });
    expect(bad.estado).toBe('error');
    expect((bad as { motivo: string }).motivo).toMatch(/SI\|NO/);
  });

  it('monto 2–10 decimales (prosa)', () => {
    const c = a16.find(
      (x) =>
        x.etiqueta_xml.includes('monto') &&
        /2 a 10 decimales/i.test(x.formato) &&
        !/obligatorios/i.test(x.formato),
    );
    expect(c).toBeTruthy();
    if (!c) return;
    expect(clasificarFormato(c.formato).cubo).toBe('prosa');
    expect(
      validarCampo(c, { valores: { [c.numero]: '1234.567890' }, catalogos: {} }).estado,
    ).toBe('ok');
    const sinDec = validarCampo(c, { valores: { [c.numero]: '12345' }, catalogos: {} });
    expect(sinDec.estado).toBe('error');
  });
});

describe('2.4 cuadrado global formato = 1660', () => {
  it('derivados + prosa + no_validado = 1660; cero silencio', () => {
    const counts = { derivado: 0, prosa: 0, no_validado: 0, ausente: 0 };
    for (const f of readdirSync(DIR).filter((x) => /^anexo-.*\.json$/.test(x))) {
      for (const c of cargarAnexo(f)) {
        if (!tieneFormato(c)) continue;
        const r = clasificarFormato(c.formato);
        counts[r.cubo]++;
      }
    }
    expect(counts.ausente).toBe(0);
    expect(counts.derivado + counts.prosa + counts.no_validado).toBe(1660);
    expect(counts).toEqual({ derivado: 1409, prosa: 203, no_validado: 48, ausente: 0 });
  });
});

describe('2.4 cobertura formato — anexos 16, 12-A, 14-A', () => {
  for (const [nombre, campos] of [
    ['16', a16],
    ['12-A', a12a],
    ['14-A', a14a],
  ] as const) {
    it(`anexo ${nombre}: todo formato con contenido → derivado|prosa|no_validado`, () => {
      const conFmt = campos.filter(tieneFormato);
      expect(conFmt.length).toBeGreaterThan(0);
      for (const c of conFmt) {
        const r = clasificarFormato(c.formato);
        expect(
          r.cubo,
          `${nombre}/${c.numero} silencio: ${c.formato.slice(0, 80)}`,
        ).not.toBe('ausente');
        expect(['derivado', 'prosa', 'no_validado']).toContain(r.cubo);

        // Si hay valor, la validación no se traga el formato en silencio:
        // o ok/error (regla activa) o no_validado.
        const muestra =
          r.cubo === 'prosa' && r.regla.clase === 'enum'
            ? r.regla.valores[0]
            : r.cubo === 'prosa' && r.regla.clase === 'monto'
              ? '1'.repeat(4) + '.' + '0'.repeat(r.regla.minDec)
              : 'X';
        const res = validarCampo(c, { valores: { [c.numero]: muestra }, catalogos: {} });
        // omitido = etiqueta estructural (formato informativo, sin valor).
        expect(['ok', 'error', 'no_validado', 'omitido']).toContain(res.estado);
      }
    });
  }
});
