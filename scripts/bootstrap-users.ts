/**
 * scripts/bootstrap-users.ts
 *
 * Crea los usuarios iniciales de FIATCOIN para el demo (3 de rol + 1 maestro).
 * Genera passwords aleatorios seguros y los imprime una sola vez.
 *
 * Requiere las variables de entorno (NO commitear):
 *   - SUPABASE_URL              (default: el remoto cibpguwwggwzdhhpdomz)
 *   - SUPABASE_SERVICE_ROLE_KEY (admin key del proyecto remoto)
 *
 * Uso:
 *   export SUPABASE_URL="https://cibpguwwggwzdhhpdomz.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="<service_role del dashboard>"
 *   npm run bootstrap:users
 *
 * Idempotente: si los usuarios ya existen, solo asegura sus roles y
 * NO regenera sus passwords (eso solo pasa en el primer create).
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  'https://cibpguwwggwzdhhpdomz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error(
    '\n[bootstrap-users] Falta SUPABASE_SERVICE_ROLE_KEY.\n' +
      '  Obtén el key en:\n' +
      '  https://supabase.com/dashboard/project/cibpguwwggwzdhhpdomz/settings/api\n\n' +
      '  Y exporta:\n' +
      '    export SUPABASE_SERVICE_ROLE_KEY="<la_key>"\n',
  );
  process.exit(1);
}

const FIATCOIN_ORG_ID = '11111111-1111-1111-1111-111111111111';
const NOTARIA_ORG_ID = '12121212-1212-1212-1212-121212121212';

/** Genera password de 24 caracteres URL-safe (~144 bits de entropía). */
function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

interface SeedUser {
  email: string;
  nombre: string;
  roles: Array<'operador' | 'oc' | 'admin'>;
  /** Organización del usuario. Default: FIATCOIN. La org debe existir en BD
   *  (aplicar seeds) antes de correr el script. */
  organizationId?: string;
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'operador@fiatcoin.mx',
    nombre: 'Mariana Operadora (demo)',
    roles: ['operador'],
  },
  {
    email: 'oc@fiatcoin.mx',
    nombre: 'Oficial de Cumplimiento (demo)',
    roles: ['oc', 'admin'],
  },
  {
    email: 'admin@fiatcoin.mx',
    nombre: 'Admin delegado (demo)',
    roles: ['admin'],
  },
  {
    // Usuario maestro de Kawiil: los 3 roles para poder recorrer todo el demo
    // con una sola cuenta. Si se reconstruye el entorno, este script lo recrea.
    email: 'leo.bassoco@kawiil.mx',
    nombre: 'Leo Bassoco (maestro)',
    roles: ['operador', 'oc', 'admin'],
  },
  {
    // Usuario de la notaría demo (org distinta). Requiere el seed 08 aplicado.
    email: 'notaria@demo.mx',
    nombre: 'Notaría Demo GDL',
    roles: ['oc', 'admin'],
    organizationId: NOTARIA_ORG_ID,
  },
];

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface BootstrapResult {
  email: string;
  password?: string;
  alreadyExisted: boolean;
  userId: string;
}

async function ensureAuthUser(u: SeedUser): Promise<BootstrapResult> {
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find(
    (x) => x.email?.toLowerCase() === u.email.toLowerCase(),
  );
  if (existing) {
    console.log(`  · ya existe → ${u.email}`);
    return { email: u.email, alreadyExisted: true, userId: existing.id };
  }
  const password = generatePassword();
  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password,
    email_confirm: true,
    user_metadata: { nombre: u.nombre, seed: true },
  });
  if (error) throw error;
  console.log(`  + creado → ${u.email}`);
  return { email: u.email, password, alreadyExisted: false, userId: data.user!.id };
}

async function ensureProfileAndRoles(userId: string, u: SeedUser) {
  const orgId = u.organizationId ?? FIATCOIN_ORG_ID;
  const { error: profErr } = await supabase.from('user_profile').upsert(
    {
      id: userId,
      organization_id: orgId,
      email: u.email,
      nombre: u.nombre,
      activo: true,
    },
    { onConflict: 'id' },
  );
  if (profErr) throw profErr;

  const { error: delErr } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('organization_id', orgId);
  if (delErr) throw delErr;

  const rows = u.roles.map((rol) => ({
    user_id: userId,
    organization_id: orgId,
    rol,
  }));
  const { error: rolesErr } = await supabase.from('user_roles').insert(rows);
  if (rolesErr) throw rolesErr;

  console.log(`    roles: [${u.roles.join(', ')}]`);
}

async function main() {
  console.log('[bootstrap-users] target:', SUPABASE_URL);
  console.log('[bootstrap-users] organización:', FIATCOIN_ORG_ID, '(FIATCOIN RAMPLE)\n');

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, razon_social')
    .eq('id', FIATCOIN_ORG_ID)
    .single();
  if (orgErr || !org) {
    console.error(
      '\n[bootstrap-users] La organización FIATCOIN no existe en BD.\n' +
        '   ¿Aplicaste migrations y seeds al proyecto remoto?\n' +
        '   Ver docs/SPRINT_D1_BACKLOG.md D1.B1 para el flujo.\n',
    );
    process.exit(2);
  }
  console.log('[bootstrap-users] organización OK →', org.razon_social, '\n');

  const results: BootstrapResult[] = [];
  for (const u of SEED_USERS) {
    console.log(`Procesando ${u.email}…`);
    const r = await ensureAuthUser(u);
    await ensureProfileAndRoles(r.userId, u);
    results.push(r);
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' CREDENCIALES DEMO (guarda en 1Password — NO se vuelven a mostrar)');
  console.log('═══════════════════════════════════════════════════════════════\n');
  for (const r of results) {
    if (r.alreadyExisted) {
      console.log(`  ${r.email}`);
      console.log(`    (ya existía, password no se cambió desde acá)`);
    } else {
      console.log(`  ${r.email}`);
      console.log(`    password: ${r.password}`);
    }
    console.log('');
  }
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' En el PRIMER login cada usuario debe enrolar 2FA TOTP.');
  console.log(' Si extravías un password, bórralos desde el dashboard y');
  console.log(' re-ejecuta este script.');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n[bootstrap-users]', err);
  process.exit(1);
});
