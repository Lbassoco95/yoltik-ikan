/**
 * La frontera entre los tipos del dominio y las columnas `jsonb`.
 *
 * ---------------------------------------------------------------------
 * Por qué hace falta
 * ---------------------------------------------------------------------
 * Los tipos que genera Supabase declaran las columnas `jsonb` como `Json`, un
 * tipo recursivo cerrado. TypeScript no puede demostrar que una interfaz del
 * dominio —`MatrizConfig`, `ValorCatalogo[]`, `Record<string, unknown>`— sea
 * asignable a él, porque las interfaces no reciben firma de índice implícita.
 * No es que el valor no sea JSON: es que el compilador no tiene cómo saberlo.
 *
 * Es la misma limitación estructural que ya se resuelve en el sentido de
 * LECTURA con `as unknown as Client` por todo `src/lib/api`. Esto es su
 * simétrico en el sentido de ESCRITURA, con un nombre y una explicación en vez
 * de un `as any` suelto en cada sitio.
 *
 * ---------------------------------------------------------------------
 * Lo que este helper NO hace, y hay que tenerlo presente
 * ---------------------------------------------------------------------
 * No valida nada. Si le pasas algo que no es serializable —una función, un
 * `Date`, un `undefined` anidado, una referencia circular— compila igual y el
 * problema aparece en tiempo de ejecución o, peor, se guarda mal en la base.
 *
 * Por eso se usa SÓLO sobre valores que ya son datos planos por construcción:
 * lo que viene de un formulario, de un `JSON.parse`, o de una interfaz del
 * dominio cuyos campos son primitivos. Nunca sobre algo que acabas de recibir
 * de una librería.
 *
 * ---------------------------------------------------------------------
 * Por qué el tipo vive aquí y no se importa del archivo generado
 * ---------------------------------------------------------------------
 * `src/types/database.ts` se REGENERA con `npm run supabase:gen:types`, y todo
 * lo que se le añada a mano desaparece en la siguiente regeneración. Un helper
 * que dependa de él se rompe cada vez. Éste es idéntico en forma al `Json` que
 * genera Supabase, así que asigna sin problema, y es nuestro.
 */

/** La misma forma que el `Json` que genera Supabase. */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [clave: string]: Json | undefined }
  | Json[];

/**
 * Marca un valor del dominio como lo que la columna `jsonb` espera.
 *
 * Usar sólo sobre datos planos. Ver la advertencia de arriba.
 */
export function comoJson(valor: unknown): Json {
  return valor as Json;
}
