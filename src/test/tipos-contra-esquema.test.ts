import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { esquemaDeMigrations } from './esquema-migrations';

/**
 * `src/types/database.ts` no se queda viejo sin que nadie se entere.
 *
 * ---------------------------------------------------------------------
 * Por qué existe esta prueba
 * ---------------------------------------------------------------------
 * Ese archivo se genera con `npm run supabase:gen:types` contra el proyecto
 * remoto, y durante meses fue un MARCADOR de cuarenta líneas donde cada fila
 * era `Record<string, any>`. Su propio comentario lo advertía, y aun así nadie
 * lo vio: con ese marcador, TODO `src/lib/api` quedaba sin verificar contra el
 * esquema. Cuando por fin se regeneró aparecieron SIETE desajustes reales que
 * llevaban ahí desde el principio, uno de ellos una firma que aceptaba
 * cualquier llave con cualquier valor hacia un `update`.
 *
 * El problema no fue el marcador: fue que nada avisaba de que estaba viejo. Un
 * archivo generado que se commitea y no se vuelve a mirar vuelve a quedarse
 * atrás en cuanto entra la siguiente migration, y en unos meses estaríamos
 * igual.
 *
 * ---------------------------------------------------------------------
 * Qué compara, y contra qué
 * ---------------------------------------------------------------------
 * Contra las MIGRATIONS, no contra el proyecto remoto. Es deliberado:
 *
 *   · No necesita credenciales ni red, así que corre en `npm test` como
 *     cualquier otra prueba y en cualquier CI sin secretos.
 *   · Detecta la deriva en su origen. Si alguien escribe una migration y no
 *     regenera los tipos, falla en su propia rama, antes de aplicar nada.
 *     Comparar contra el remoto sólo lo cazaría después de desplegar.
 *   · No depende de que producción esté al día. Si producción va atrasada, ése
 *     es otro problema y no el que esta prueba vigila.
 *
 * ---------------------------------------------------------------------
 * En qué dirección compara, y por qué sólo en ésa
 * ---------------------------------------------------------------------
 * Exige que todo lo que las migrations crean ESTÉ en los tipos. No exige lo
 * contrario, porque los tipos generados traen legítimamente cosas que las
 * migrations de este repo no crean: vistas, tablas del propio Supabase,
 * columnas que añadió una extensión. Fallar por eso sería fallar sobre un
 * archivo correcto.
 *
 * Misma disciplina conservadora que `selects-contra-esquema`: preferir dejar
 * pasar algo antes que romper sobre código sano.
 */

const RUTA_TIPOS = 'src/types/database.ts';

/**
 * Tablas que las migrations crean y que los tipos generados NO traen por una
 * razón conocida y aceptada. Vacío hoy, y conviene que siga así: cada entrada
 * aquí es un pedazo de esquema que deja de estar vigilado.
 */
const TABLAS_EXENTAS = new Set<string>();

describe('los tipos generados van al día con las migrations', () => {
  const tipos = readFileSync(RUTA_TIPOS, 'utf8');
  const esquema = esquemaDeMigrations();

  /**
   * La guarda contra la regresión exacta que ya ocurrió: que alguien reponga
   * el marcador genérico, o que la regeneración falle y deje el archivo a
   * medias. Sin esto, todas las demás comprobaciones pasarían en vacío.
   */
  it('no son el marcador genérico', () => {
    expect(tipos).toContain('export type Json');
    expect(tipos).not.toContain('type FilaGenerica = Record<string, any>');
    // El marcador tenía 41 líneas; el esquema real pasa de las tres mil.
    expect(tipos.split('\n').length).toBeGreaterThan(500);
  });

  it('el esquema de las migrations no está vacío', () => {
    // Si el parser se rompiera y devolviera nada, las dos pruebas de abajo
    // pasarían sin comprobar absolutamente nada.
    expect(esquema.size).toBeGreaterThan(30);
  });

  it('cada tabla de las migrations está en los tipos', () => {
    const faltan = [...esquema.keys()].filter(
      (t) => !TABLAS_EXENTAS.has(t) && !new RegExp(`^ {6}${t}: \\{`, 'm').test(tipos),
    );
    expect(
      faltan,
      `Faltan tablas en ${RUTA_TIPOS}. Corre \`npm run supabase:gen:types\` y commitea el resultado.`,
    ).toEqual([]);
  });

  it('cada columna de las migrations está en los tipos', () => {
    const faltan: string[] = [];
    for (const [tabla, columnas] of esquema) {
      if (TABLAS_EXENTAS.has(tabla)) continue;
      if (!new RegExp(`^ {6}${tabla}: \\{`, 'm').test(tipos)) continue; // ya lo reporta la de arriba
      for (const col of columnas) {
        if (!new RegExp(`^ {10}${col}\\??:`, 'm').test(tipos)) faltan.push(`${tabla}.${col}`);
      }
    }
    expect(
      faltan,
      `Columnas que las migrations crean y los tipos no tienen. Corre ` +
        `\`npm run supabase:gen:types\` y commitea el resultado.`,
    ).toEqual([]);
  });
});

describe('el parser de migrations no se come columnas', () => {
  /**
   * Regresión de un falso verde. Un comentario `--` DETRÁS de código dejaba su
   * texto dentro del cuerpo del `create table`, y la columna siguiente quedaba
   * pegada a él y no se reconocía. `verificacion_identidad.resumen` era
   * invisible para el esquema, así que la prueba de selects marcaba como
   * inexistente una columna perfectamente válida —y, del otro lado, una columna
   * fantasma habría dejado pasar un select roto.
   */
  it('ve las columnas que van después de un comentario de fin de línea', () => {
    const esquema = esquemaDeMigrations();
    const cols = esquema.get('verificacion_identidad');
    expect(cols).toBeDefined();
    // `enviado_a` lleva su comentario en la misma línea; `resumen` es la que
    // venía después y desaparecía.
    expect(cols).toContain('enviado_a');
    expect(cols).toContain('resumen');
  });

  it('no corta en los guiones que van dentro de una cadena', () => {
    // Varias migrations usan `E'\n---\n'` como separador de notas. Si el
    // barrido de comentarios no respetara las comillas, cortaría ahí y se
    // llevaría por delante el resto de la sentencia.
    const esquema = esquemaDeMigrations();
    expect(esquema.get('parametro_regulatorio')).toContain('notas');
  });
});
