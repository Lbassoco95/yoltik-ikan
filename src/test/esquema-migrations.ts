import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El esquema, leído de donde de verdad vive: las migrations.
 *
 * Estaba dentro de `selects-contra-esquema.test.ts` y lo usa ahora una segunda
 * prueba —la que vigila que `src/types/database.ts` no se quede viejo—, así que
 * vive aquí en vez de duplicarse. Dos copias de un parser de SQL se
 * desincronizan en cuanto alguien arregla una y no la otra, y la que quede
 * atrás va a dar falsos verdes sin que nadie se entere.
 *
 * Deliberadamente conservador: prefiere dejar pasar algo antes que fallar sobre
 * código sano.
 */

const DIR_MIGRATIONS = 'supabase/migrations';

/** Columnas por tabla, leídas de las migrations en orden. */
export function esquemaDeMigrations(): Map<string, Set<string>> {
  const tablas = new Map<string, Set<string>>();
  const archivos = readdirSync(DIR_MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

  for (const archivo of archivos) {
    const sql = readFileSync(join(DIR_MIGRATIONS, archivo), 'utf8')
      // Los comentarios traen SQL de ejemplo y frases como "add column"; si no
      // se quitan, el esquema se llena de columnas que nadie creó.
      //
      // Los de bloque también, y no es teórico: `lista_job_ejecucion` documenta
      // sus columnas con `/** ... */` DENTRO del create table, y de ahí salían
      // dos columnas fantasma llamadas «si» y «para» —las primeras palabras de
      // dos frases en español—. El daño no era cosmético: una columna fantasma
      // en el esquema hace que la prueba de selects deje pasar un select que
      // pide algo que no existe, que es exactamente lo que esa prueba existe
      // para cazar.
      .replace(/\/\*[\s\S]*?\*\//g, '')
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

/** Parte por comas de primer nivel: `numeric(14,2)` no debe partirse en dos.
 *  También lo usa el lector de `.select()`, cuyos campos van separados igual. */
export function partirNivelCero(texto: string): string[] {
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
