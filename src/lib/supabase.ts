import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn(
    '[Ikán] VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no están definidas. Copia .env.example a .env.local y rellena.',
  );
}

export const supabase = createClient<Database>(url ?? '', anon ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
