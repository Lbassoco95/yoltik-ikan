import { describe, it, expect } from 'vitest';
import { clavesFueraDePatron, estaCargado, parsearCatalogo } from '@/lib/catalogos';

describe('parseo del archivo de catálogo', () => {
  it('lee dos columnas con encabezado', () => {
    const r = parsearCatalogo('clave,descripcion\n9,Ciudad de México\n14,Jalisco\n');
    expect(r.conEncabezado).toBe(true);
    expect(r.valores).toEqual([
      { clave: '9', descripcion: 'Ciudad de México', orden: 1 },
      { clave: '14', descripcion: 'Jalisco', orden: 2 },
    ]);
  });

  it('lee dos columnas sin encabezado', () => {
    const r = parsearCatalogo('9,Ciudad de México\n14,Jalisco');
    expect(r.conEncabezado).toBe(false);
    expect(r.valores).toHaveLength(2);
  });

  it('acepta los sinónimos de encabezado que usan los archivos oficiales', () => {
    const r = parsearCatalogo('CÓDIGO;NOMBRE\n1;Normal\n2;24 hrs');
    expect(r.conEncabezado).toBe(true);
    expect(r.valores[0]).toEqual({ clave: '1', descripcion: 'Normal', orden: 1 });
  });

  it('acepta punto y coma y tabulador como separador', () => {
    expect(parsearCatalogo('1;Uno\n2;Dos').valores).toHaveLength(2);
    expect(parsearCatalogo('1\tUno\n2\tDos').valores).toHaveLength(2);
  });

  it('respeta comas dentro de comillas', () => {
    const r = parsearCatalogo('clave,descripcion\n7,"Comercio al por mayor, excepto vehículos"');
    expect(r.valores[0].descripcion).toBe('Comercio al por mayor, excepto vehículos');
  });

  it('soporta CRLF', () => {
    expect(parsearCatalogo('clave,descripcion\r\n9,CDMX\r\n').valores).toHaveLength(1);
  });

  it('conserva el orden del archivo: no alfabetiza por su cuenta', () => {
    const r = parsearCatalogo('clave,descripcion\n14,Jalisco\n1,Aguascalientes\n9,CDMX');
    expect(r.valores.map((v) => v.clave)).toEqual(['14', '1', '9']);
    expect(r.valores.map((v) => v.orden)).toEqual([1, 2, 3]);
  });

  it('descarta y REPORTA las filas sin clave o sin descripción', () => {
    const r = parsearCatalogo('clave,descripcion\n9,CDMX\n,Sin clave\n14,\n');
    expect(r.valores).toHaveLength(1);
    expect(r.descartadas).toHaveLength(2);
    expect(r.descartadas[0].motivo).toBe('sin clave');
    expect(r.descartadas[1].motivo).toContain('sin descripción');
  });

  it('descarta la clave repetida y dice cuál', () => {
    const r = parsearCatalogo('clave,descripcion\n9,CDMX\n9,Distrito Federal');
    expect(r.valores).toHaveLength(1);
    expect(r.descartadas[0].motivo).toContain('9');
  });

  it('un archivo vacío no revienta', () => {
    expect(parsearCatalogo('').valores).toEqual([]);
    expect(parsearCatalogo('\n\n  \n').valores).toEqual([]);
  });
});

describe('validación contra el formato del catálogo', () => {
  const valores = [
    { clave: '9', descripcion: 'CDMX' },
    { clave: 'JAL', descripcion: 'Jalisco' },
  ];

  it('señala las claves que no cumplen el patrón', () => {
    expect(clavesFueraDePatron(valores, '^[0-9]{1,2}$')).toEqual([
      { clave: 'JAL', descripcion: 'Jalisco' },
    ]);
  });

  it('sin patrón conocido no inventa una restricción', () => {
    expect(clavesFueraDePatron(valores, null)).toEqual([]);
  });

  it('un patrón inválido no tumba la carga', () => {
    expect(clavesFueraDePatron(valores, '^[0-9')).toEqual([]);
  });
});

describe('estado del catálogo', () => {
  it('distingue cargado de registrado sin valores', () => {
    expect(estaCargado({ valores_vigentes: 0 })).toBe(false);
    expect(estaCargado({ valores_vigentes: 32 })).toBe(true);
  });
});
