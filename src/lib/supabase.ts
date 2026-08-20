import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isSupabaseConfigured = Boolean(url && anon);
const fallbackUrl = 'http://127.0.0.1:54399';
const fallbackAnonKey = 'dev-missing-supabase-anon-key';

const missingConfigMessage =
  '[Ikán] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Configura las variables de entorno de Supabase.';

if (!isSupabaseConfigured && import.meta.env.PROD) {
  throw new Error(missingConfigMessage);
}

if (!isSupabaseConfigured) {
  console.error(missingConfigMessage);
}

export const supabase = createClient<Database>(url ?? fallbackUrl, anon ?? fallbackAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
