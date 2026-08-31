import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ningún `.select()` pide una columna que no exista.
 *
 * Existe por un renglón concreto: la consulta del aviso mensual pedía
 * `operation.folio`. Esa columna nunca existió. La pantalla más importante del
 * producto —la que arma lo que se presenta al SAT— fallaba con «column
 * operation.folio does not exist» desde el día que se escribió, y se desplegó
 * así.
 *
 * El typecheck no lo veía y no lo va a ver: `src/types/database.ts` es un
 * marcador genérico, con las filas tipadas como `Record<string, any>`, así que
 * para TypeScript cualquier cadena dentro de `.select()` es válida. Y no es un
 * error que se note al revisar el diff: `folio` es un nombre perfectamente
 * razonable para una operación, y la tabla `hallazgo` sí lo tiene.
 *
 * Así que el esquema se lee de donde de verdad vive —las migrations— y se
 * coteja contra cada select del front. Sin red y sin base de datos: corre en
 * `npm test` como cualquier otra prueba.
 *
 * Deliberadamente conservador. Prefiere dejar pasar algo antes que fallar sobre
 * código sano: se salta las vistas (sus columnas salen de un `select` que no se
 * puede leer con confianza) y cualquier campo con paréntesis, que es la sintaxis
 * de los joins embebidos de PostgREST.
 */

const DIR_MIGRATIONS = 'supabase/migrations';

/** Columnas por tabla, leídas de las migrations en orden. */
function esquemaDeMigrations(): Map<string, Set<string>> {
  const tablas = new Map<string, Set<string>>();
  const archivos = readdirSync(DIR_MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

  for (const archivo of archivos) {
    const sql = readFileSync(join(DIR_MIGRATIONS, archivo), 'utf8')
      // Los comentarios traen SQL de ejemplo y frases como "add column"; si no
      // se quitan, el esquema se llena de columnas que nadie creó.
      .replace(/^\s*--.*$/gm, '');

    // create table [if not exists] [public.]nombre ( ... );
    const crea = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = crea.exec(sql)) !== null) {
      const nombre = m[1];
      // Hasta el paréntesis que cierra, contando anidados (numeric(14,2), checks).
      let i = crea.lastIndex;
      let nivel = 1;
      while (i < sql.length && nivel > 0) {
        if (sql[i] === '(') nivel++;
        else if (sql[i] === ')') nivel--;
        i++;
      }
      const cuerpo = sql.slice(crea.lastIndex, i - 1);

      const cols = tablas.get(nombre) ?? new Set<string>();
      for (const trozo of partirNivelCero(cuerpo)) {
        const linea = trozo.trim();
        if (!linea) continue;
        // Restricciones a nivel de tabla, no columnas.
        if (/^(primary|foreign|unique|check|constraint|exclude|like)\b/i.test(linea)) continue;
        const col = linea.match(/^([a-z0-9_]+)\s/i);
        if (col) cols.add(col[1]);
      }
      tablas.set(nombre, cols);
    }

    // Un `alter table` puede traer VARIAS acciones separadas por comas:
    //
    //   alter table organizations
    //     add column if not exists clave_sujeto_obligado text,
    //     add column if not exists clave_entidad_colegiada text;
    //
    // Con un patrón que sólo mirara la primera, las demás columnas quedarían
    // fuera del esquema y la prueba las reportaría como inexistentes. Así que
    // se toma el cuerpo entero del alter y se recorren todas sus acciones.
    const altera = /alter\s+table\s+(?:only\s+)?(?:public\.)?([a-z0-9_]+)\b([\s\S]*?);/gi;
    while ((m = altera.exec(sql)) !== null) {
      const [, tabla, cuerpo] = m;

      const agrega = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi;
      let a: RegExpExecArray | null;
      while ((a = agrega.exec(cuerpo)) !== null) {
        const cols = tablas.get(tabla) ?? new Set<string>();
        cols.add(a[1]);
        tablas.set(tabla, cols);
      }

      const quita = /drop\s+column\s+(?:if\s+exists\s+)?([a-z0-9_]+)/gi;
      while ((a = quita.exec(cuerpo)) !== null) {
        tablas.get(tabla)?.delete(a[1]);
      }

      const renombra = /rename\s+column\s+([a-z0-9_]+)\s+to\s+([a-z0-9_]+)/gi;
      while ((a = renombra.exec(cuerpo)) !== null) {
        const cols = tablas.get(tabla);
        if (cols) {
          cols.delete(a[1]);
          cols.add(a[2]);
        }
      }
    }
  }
  return tablas;
}

/** Parte por comas de primer nivel: `numeric(14,2)` no debe partirse en dos. */
function partirNivelCero(texto: string): string[] {
  const fuera: string[] = [];
  let nivel = 0;
  let actual = '';
  for (const ch of texto) {
    if (ch === '(') nivel++;
    else if (ch === ')') nivel--;
    if (ch === ',' && nivel === 0) {
      fuera.push(actual);
      actual = '';
    } else {
      actual += ch;
    }
  }
  fuera.push(actual);
  return fuera;
}

/** Todos los archivos .ts/.tsx bajo src/. */
function fuentes(dir = 'src'): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) salida.push(...fuentes(p));
    else if (/\.tsx?$/.test(e.name)) salida.push(p);
  }
  return salida;
}

interface Uso {
  archivo: string;
  tabla: string;
  columna: string;
}

function selectsQueNoCuadran(esquema: Map<string, Set<string>>): Uso[] {
  const malos: Uso[] = [];
  // .from('tabla') … .select('a, b, c') — el primer select que le sigue.
  const patron = /\.from\(\s*'([a-z0-9_]+)'\s*\)[\s\S]{0,400}?\.select\(\s*'([^']*)'/g;

  for (const archivo of fuentes()) {
    const txt = readFileSync(archivo, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = patron.exec(txt)) !== null) {
      const [, tabla, seleccion] = m;
      // Las vistas no se validan: sus columnas salen del select que las define.
      if (tabla.startsWith('v_')) continue;
      const cols = esquema.get(tabla);
      if (!cols || cols.size === 0) continue;

      for (const bruto of partirNivelCero(seleccion)) {
        const campo = bruto.trim();
        if (!campo || campo === '*') continue;
        // Join embebido de PostgREST: `client:client_id(datos_kyc)`.
        if (campo.includes('(')) continue;
        const columna = campo.split(':').pop()!.trim();
        if (!/^[a-z0-9_]+$/.test(columna)) continue;
        if (!cols.has(columna)) malos.push({ archivo, tabla, columna });
      }
    }
  }
  return malos;
}

describe('los selects del front coinciden con el esquema', () => {
  const esquema = esquemaDeMigrations();

  it('las migrations describen las tablas que el front consulta', () => {
    // Si esto falla, el lector de migrations dejó de entender el SQL y la
    // prueba de abajo estaría pasando por no mirar nada.
    expect(esquema.get('operation')?.has('monto_mxn')).toBe(true);
    expect(esquema.get('client')?.has('nombre_razon_social')).toBe(true);
    expect(esquema.get('hallazgo')?.has('folio')).toBe(true);
    expect(esquema.get('operation')?.has('evaluada_en')).toBe(true);
    // Añadida en un `alter table` con varias acciones: si el lector sólo viera
    // la primera, ésta se le escaparía.
    expect(esquema.get('organizations')?.has('clave_entidad_colegiada')).toBe(true);
  });

  it('operation no tiene folio, y por eso no se puede pedir', () => {
    // El caso concreto que motivó la prueba. `hallazgo` sí lo tiene, y ahí
    // estuvo la confusión.
    expect(esquema.get('operation')?.has('folio')).toBe(false);
  });

  it('ningún select pide una columna que no exista', () => {
    const malos = selectsQueNoCuadran(esquema);
    const detalle = malos.map((u) => `${u.archivo}: ${u.tabla}.${u.columna}`).join('\n');
    expect(detalle).toBe('');
  });
});
