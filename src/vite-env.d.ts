/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Qué aplicación monta `src/main.tsx`. Se fija en tiempo de build.
   *  'admin' = consola de plataforma de Kawiil; cualquier otro valor (o sin
   *  definir) = app para sujetos obligados. */
  readonly VITE_APP_TARGET?: 'app' | 'admin';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_TAGLINE?: string;
  readonly VITE_MOCK_MOFFIN?: string;
  readonly VITE_MOCK_SANCTIONS_LISTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
