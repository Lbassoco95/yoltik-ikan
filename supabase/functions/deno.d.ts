/**
 * Lo mínimo para que TypeScript pueda comprobar las Edge Functions.
 *
 * Corren en Deno, no en Node: `Deno.serve`, `Deno.env` y los imports por URL
 * no existen para `tsc`. Hasta ahora eso se tapaba con un `@ts-expect-error`
 * por línea, que suprime CUALQUIER error de esa línea —incluido uno real— y
 * que además dejó sin comprobar el archivo entero cuando nadie lo importaba.
 *
 * Con estas declaraciones el resto del archivo sí se revisa. Los módulos por
 * URL quedan como `any`: tiparlos de verdad exigiría la cadena de Deno, y lo
 * que hace falta aquí es cazar un `deBytea is not defined`, no validar la
 * firma de `createClient`.
 */

declare const Deno: {
  env: { get(nombre: string): string | undefined };
  serve(manejador: (req: Request) => Response | Promise<Response>): void;
};

declare module 'https://*';
declare module 'npm:*';
