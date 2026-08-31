import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Integridad de los catálogos extraídos de las plantillas del SAT.
 *
 * El JSON es dato, no código: nadie lo compila y una edición a mano pasaría
 * inadvertida hasta que el portal rechazara un aviso. Estas pruebas lo fijan —
 * procedencia, forma de las claves, cuentas — para que cualquier cambio tenga
 * que ser deliberado.
 */
interface CatalogoExtraido {
  origen: string;
  hoja: string;
  columna: number;
  valores: { clave: string; descripcion: string }[];
}

const datos: Record<string, CatalogoExtraido> = JSON.parse(
  readFileSync('docs/catalogos-uif/catalogos_fep.json', 'utf8'),
);

/** Patrones declarados en el registro generado (seed 13). */
const registro = readFileSync('supabase/seed/13_catalogos_fep.sql', 'utf8');
const patrones = new Map(
  [
    ...registro.matchAll(
      /\('([a-z0-9_]+)', '(?:[^']|'')*', 'fep', array\[[^\]]*\]::text\[\], (null|'[^']*'),/g,
    ),
  ].map((m) => [m[1], m[2] === 'null' ? null : m[2].slice(1, -1)] as const),
);

describe('catálogos de la UIF extraídos de las plantillas del SAT', () => {
  it('trae los 25 catálogos con 924 valores', () => {
    expect(Object.keys(datos)).toHaveLength(25);
    expect(Object.values(datos).reduce((n, c) => n + c.valores.length, 0)).toBe(924);
  });

  it('cada catálogo dice de qué archivo del SAT salió', () => {
    for (const [codigo, c] of Object.entries(datos)) {
      expect(c.origen, codigo).toMatch(/\.xlsm$/);
      expect(c.hoja, codigo).toBe('Combos');
      expect(c.columna, codigo).toBeGreaterThan(0);
    }
  });

  it('cada catálogo extraído está registrado en el seed 13', () => {
    for (const codigo of Object.keys(datos)) {
      expect(patrones.has(codigo), codigo).toBe(true);
    }
  });

  it('toda clave cumple el patrón declarado para su catálogo', () => {
    const malas: string[] = [];
    for (const [codigo, c] of Object.entries(datos)) {
      const patron = patrones.get(codigo);
      if (!patron) continue;
      const re = new RegExp(patron);
      for (const v of c.valores) {
        if (!re.test(v.clave)) malas.push(`${codigo}: "${v.clave}" no cumple ${patron}`);
      }
    }
    expect(malas).toEqual([]);
  });

  it('ninguna clave se repite dentro de su catálogo', () => {
    for (const [codigo, c] of Object.entries(datos)) {
      const claves = c.valores.map((v) => v.clave);
      expect(new Set(claves).size, codigo).toBe(claves.length);
    }
  });

  it('ninguna descripción viene vacía', () => {
    for (const [codigo, c] of Object.entries(datos)) {
      for (const v of c.valores) {
        expect(v.descripcion.trim(), `${codigo}/${v.clave}`).not.toBe('');
      }
    }
  });

  it('los valores que la notaría ve a diario son los que dice el SAT', () => {
    // Si alguno de estos cambia, el aviso empieza a reportar otra cosa.
    const ef = new Map(datos.entidad_federativa.valores.map((v) => [v.clave, v.descripcion]));
    expect(ef.size).toBe(32);
    expect(ef.get('14')).toBe('JALISCO');
    expect(ef.get('9')).toBe('DISTRITO FEDERAL');

    const pais = new Map(datos.pais.valores.map((v) => [v.clave, v.descripcion]));
    expect(pais.get('MX')).toBe('MEXICO');
    expect(pais.size).toBe(249);

    const poder = datos.tipo_de_poder.valores;
    expect(poder.map((v) => v.clave)).toEqual(['1', '2', '3']);
    expect(poder[2].descripcion).toBe('de administración y de dominio');

    // La clave de la actividad vulnerable de una notaría.
    const av = new Map(datos.actividades_vulnerables.valores.map((v) => [v.clave, v.descripcion]));
    expect(av.get('FEP')).toBe('FE PUBLICA');
    expect(av.get('AVI')).toBe('OPERACIONES CON ACTIVOS VIRTUALES');
  });

  it('el catálogo de países usa clave de dos letras, no el nombre', () => {
    for (const v of datos.pais.valores) {
      expect(v.clave, v.descripcion).toMatch(/^[A-Z]{2}$/);
    }
  });
});
