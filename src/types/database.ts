/**
 * Tipos generados desde Supabase.
 *
 * Para regenerar este archivo desde el schema real:
 *   npm run supabase:gen:types
 *
 * Mientras eso no ocurra, este placeholder describe la FORMA que
 * `@supabase/supabase-js` espera (Tables/Views/Functions/Enums por esquema)
 * sin describir las tablas una por una. Antes era `Record<string, unknown>`,
 * que compilaba pero hacía que cada `.from(...).insert(...)` resolviera a
 * `never`: todo el `src/lib/api` quedaba sin verificar de tipos.
 *
 * TODO[Sprint D-3]: reemplazar por los tipos reales una vez aplicadas las
 * migrations 0007–0010 en cibpguwwggwzdhhpdomz.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type FilaGenerica = Record<string, any>;

interface EsquemaGenerico {
  Tables: {
    [tabla: string]: {
      Row: FilaGenerica;
      Insert: FilaGenerica;
      Update: FilaGenerica;
      Relationships: [];
    };
  };
  Views: {
    [vista: string]: { Row: FilaGenerica; Relationships: [] };
  };
  Functions: {
    [fn: string]: { Args: FilaGenerica; Returns: any };
  };
  Enums: { [nombre: string]: string };
  CompositeTypes: { [nombre: string]: FilaGenerica };
}

export type Database = {
  public: EsquemaGenerico;
};
