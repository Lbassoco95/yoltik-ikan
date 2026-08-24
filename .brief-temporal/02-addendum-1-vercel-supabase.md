# Ikán — Addendum al Brief: setup contra Supabase remoto + Vercel

> **Aplica antes del Chunk 5 del brief original** (`Ikan-Code-Implementation-Brief.md`).
> Los Chunks 1–4 del brief original siguen válidos sin cambios. A partir del
> Chunk 5, los archivos `.env.example`, `supabase/config.toml` y
> `scripts/bootstrap-users.ts` se reemplazan por las versiones que están aquí.
> El Chunk 7 (smoke) también se reescribe completo abajo.

## Contexto

- **Proyecto Supabase**: `cibpguwwggwzdhhpdomz` (URL: https://cibpguwwggwzdhhpdomz.supabase.co)
- **Deploy Vercel**: https://yoltik-regtech-hub.vercel.app
- **Estrategia**: único entorno (sin staging separado). Migrations se aplican
  directo a cibpguwwggwzdhhpdomz.
- **Passwords demo**: generados aleatoriamente por el script bootstrap. Polo los
  anota en 1Password / gestor de credenciales y los comparte solo con el equipo.

## Tareas que solo Polo puede hacer (antes de pedirle Chunk 5 a Code)

### 1. Obtener credenciales del dashboard Supabase

En [https://supabase.com/dashboard/project/cibpguwwggwzdhhpdomz/settings/api](https://supabase.com/dashboard/project/cibpguwwggwzdhhpdomz/settings/api):

Copiar:
- `Project URL` → `https://cibpguwwggwzdhhpdomz.supabase.co` (ya la sabemos)
- `anon` `public` key → para `.env.local` y Vercel
- `service_role` `secret` key → **solo para correr `bootstrap-users` localmente, NUNCA al repo ni a Vercel del lado del cliente**

### 2. Habilitar 2FA TOTP en Supabase Auth

En [https://supabase.com/dashboard/project/cibpguwwggwzdhhpdomz/auth/providers](https://supabase.com/dashboard/project/cibpguwwggwzdhhpdomz/auth/providers):

- Authentication → Multi-Factor Auth → habilitar **TOTP**.
- En Authentication → Sign In / Up → desactivar `Allow new users to sign up`
  (en Ikán solo el Admin invita usuarios; no hay registro público).

### 3. Configurar URLs permitidas

En Authentication → URL Configuration:

- **Site URL**: `https://yoltik-regtech-hub.vercel.app`
- **Redirect URLs** (uno por línea):
  ```
  http://localhost:5173
  http://localhost:5173/**
  https://yoltik-regtech-hub.vercel.app
  https://yoltik-regtech-hub.vercel.app/**
  https://*.vercel.app
  ```
  El `https://*.vercel.app` permite que las preview URLs de Vercel también
  acepten el callback de auth en pruebas de PR.

### 4. Configurar variables de entorno en Vercel

En [https://vercel.com/leopoldo-bassoco-novas-projects/yoltik-regtech-hub/settings/environment-variables](https://vercel.com/leopoldo-bassoco-novas-projects/yoltik-regtech-hub/settings/environment-variables):

Añadir para **Production, Preview y Development**:

```
VITE_SUPABASE_URL = https://cibpguwwggwzdhhpdomz.supabase.co
VITE_SUPABASE_ANON_KEY = <el anon key del paso 1>
VITE_MOCK_MOFFIN = true
VITE_MOCK_SANCTIONS_LISTS = true
VITE_APP_NAME = Ikán
VITE_APP_TAGLINE = Cumplimiento PLD por Yoltik
```

**No** añadas `SUPABASE_SERVICE_ROLE_KEY` aquí. Esa key solo vive en tu Mac
para correr el script de bootstrap.

Después de configurar, dispara un redeploy en Vercel (o esperas al siguiente
push para que se aplique).

### 5. Configurar `.env.local` en tu Mac (después del Chunk 5)

```bash
cd ~/path/to/yoltik-regtech-hub
cp .env.example .env.local
# Editar .env.local con:
#   VITE_SUPABASE_URL=https://cibpguwwggwzdhhpdomz.supabase.co
#   VITE_SUPABASE_ANON_KEY=<el anon key del paso 1>
```

`.env.local` ya está en `.gitignore` (ver brief original). Verifica con
`git status` que no aparezca.

---

## Archivos del brief que se REEMPLAZAN

### `.env.example` — versión para Vercel + Supabase remoto

---FILE: .env.example---
```bash
# Ikán — variables de entorno (copiar a .env.local y rellenar)
# NO COMMITEAR .env.local

# Supabase project — cibpguwwggwzdhhpdomz
# Dashboard: https://supabase.com/dashboard/project/cibpguwwggwzdhhpdomz/settings/api
VITE_SUPABASE_URL=https://cibpguwwggwzdhhpdomz.supabase.co
VITE_SUPABASE_ANON_KEY=PASTE_ANON_KEY_HERE

# Feature flags
VITE_MOCK_MOFFIN=true            # mock visible de KYC hasta integración real
VITE_MOCK_SANCTIONS_LISTS=true   # snapshot en BD hasta proveedor en tiempo real

# Branding
VITE_APP_NAME=Ikán
VITE_APP_TAGLINE=Cumplimiento PLD por Yoltik

# ====================================================================
# Solo para tu Mac (scripts/bootstrap-users.ts).
# NUNCA commitear esto, NUNCA a Vercel del lado del cliente.
# Dashboard: https://supabase.com/dashboard/project/cibpguwwggwzdhhpdomz/settings/api
# ====================================================================
# SUPABASE_SERVICE_ROLE_KEY=PASTE_SERVICE_ROLE_KEY_HERE
```
---END FILE---

### `supabase/config.toml` — con project_id real

---FILE: supabase/config.toml---
```toml
# Supabase config para Ikán
# Proyecto remoto: cibpguwwggwzdhhpdomz.supabase.co
# Vincular con: supabase link --project-ref cibpguwwggwzdhhpdomz

project_id = "yoltik-regtech-hub"

[api]
enabled = true
port = 54321
schemas = ["public"]

[db]
port = 54322
shadow_port = 54320
major_version = 15

[auth]
enabled = true
# En remoto, Site URL y redirect URLs se configuran en el dashboard.
# Estos valores son para `supabase start` local.
site_url = "http://localhost:5173"
additional_redirect_urls = [
  "http://localhost:5173",
  "https://yoltik-regtech-hub.vercel.app"
]
jwt_expiry = 3600
enable_signup = false  # En Ikán solo el Admin invita usuarios.

[auth.email]
enable_signup = false
enable_confirmations = true

[auth.mfa]
max_enrolled_factors = 1
```
---END FILE---

### `scripts/bootstrap-users.ts` — passwords aleatorios + apunta a remoto

---FILE: scripts/bootstrap-users.ts---
```typescript
/**
 * scripts/bootstrap-users.ts
 *
 * Crea los 3 usuarios iniciales de Ixim Pay para el demo Sprint D-1.
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

const IXIM_PAY_ORG_ID = '11111111-1111-1111-1111-111111111111';

/** Genera password de 24 caracteres URL-safe (~144 bits de entropía). */
function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

interface SeedUser {
  email: string;
  nombre: string;
  roles: Array<'operador' | 'oc' | 'admin'>;
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'operador@iximpay.mx',
    nombre: 'Mariana Operadora (demo)',
    roles: ['operador'],
  },
  {
    email: 'oc@iximpay.mx',
    nombre: 'Oficial de Cumplimiento (demo)',
    roles: ['oc', 'admin'],
  },
  {
    email: 'admin@iximpay.mx',
    nombre: 'Admin delegado (demo)',
    roles: ['admin'],
  },
];

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface BootstrapResult {
  email: string;
  password?: string; // solo si se creó nuevo
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
  const { error: profErr } = await supabase.from('user_profile').upsert(
    {
      id: userId,
      organization_id: IXIM_PAY_ORG_ID,
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
    .eq('organization_id', IXIM_PAY_ORG_ID);
  if (delErr) throw delErr;

  const rows = u.roles.map((rol) => ({
    user_id: userId,
    organization_id: IXIM_PAY_ORG_ID,
    rol,
  }));
  const { error: rolesErr } = await supabase.from('user_roles').insert(rows);
  if (rolesErr) throw rolesErr;

  console.log(`    roles: [${u.roles.join(', ')}]`);
}

async function main() {
  console.log('[bootstrap-users] target:', SUPABASE_URL);
  console.log('[bootstrap-users] organización:', IXIM_PAY_ORG_ID, '(Ixim Pay)\n');

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, razon_social')
    .eq('id', IXIM_PAY_ORG_ID)
    .single();
  if (orgErr || !org) {
    console.error(
      '\n[bootstrap-users] ❌  La organización Ixim Pay no existe en BD.\n' +
        '   ¿Aplicaste migrations y seeds al proyecto remoto?\n' +
        '   Ver "Aplicar migrations + seeds a remoto" en el addendum.\n',
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
  console.log(' Si extravías un password, corre `supabase auth admin reset` o ');
  console.log(' bórralos desde el dashboard y re-ejecuta este script.');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n[bootstrap-users] ❌', err);
  process.exit(1);
});
```
---END FILE---

---

## Chunk 7 — SMOKE TEST (REESCRITO para remoto)

Reemplaza al Chunk 7 del brief original.

**Objetivo**: aplicar migrations + seeds a `cibpguwwggwzdhhpdomz` desde tu Mac,
crear los 3 usuarios, y validar que el deploy de Vercel apunta a esa BD.

### Lo que corre Code en el sandbox (verificación de código)

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

Todo debe estar verde. Code reporta el resultado y propone commit.

### Lo que corres tú en tu Mac (aplicar a remoto)

```bash
cd ~/path/to/yoltik-regtech-hub
git pull   # trae los commits que Code y tú aprobaron

npm install
cp .env.example .env.local
# Edita .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY del dashboard.

# 1. Vincular el repo al proyecto remoto
npx supabase login
npx supabase link --project-ref cibpguwwggwzdhhpdomz

# 2. Aplicar migrations al remoto
npx supabase db push

# 3. Aplicar seeds al remoto
#    Obtén la conexión a la BD desde el dashboard:
#    https://supabase.com/dashboard/project/cibpguwwggwzdhhpdomz/settings/database
#    Selecciona el modo "URI" con la contraseña que pusiste al crear el proyecto.
export DB_URL='postgresql://postgres.cibpguwwggwzdhhpdomz:<DB_PASSWORD>@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
psql "$DB_URL" -f supabase/seed/01_organization_ixim_pay.sql
psql "$DB_URL" -f supabase/seed/02_metodologia_ebr_xvi.sql
psql "$DB_URL" -f supabase/seed/03_tipologias_xvi.sql
psql "$DB_URL" -f supabase/seed/04_catalogos_paises_entidades.sql
psql "$DB_URL" -f supabase/seed/05_plantilla_matriz_cliente_xvi.sql
psql "$DB_URL" -f supabase/seed/06_juan_perez_demo.sql

# 4. Verificar
psql "$DB_URL" -c "select rfc, razon_social from organizations;"
psql "$DB_URL" -c "select codigo, severidad from tipologia_av order by codigo;"
psql "$DB_URL" -c "select score_total, clasificacion from client_risk_assessment;"

# 5. Regenerar types TypeScript desde el schema remoto
npm run supabase:gen:types

# 6. Bootstrap de los 3 usuarios (anota los passwords que imprime)
export SUPABASE_URL="https://cibpguwwggwzdhhpdomz.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role_key del dashboard>"
npm run bootstrap:users
# ⚠️ Anota las 3 credenciales en 1Password. Solo se muestran una vez.

# 7. Probar local contra remoto
npm run dev
# Abre http://localhost:5173 y prueba login con las credenciales anotadas.
```

### Verificación del deploy en Vercel

1. Después del último commit, espera ~1 minuto a que Vercel termine el deploy.
2. Abre https://yoltik-regtech-hub.vercel.app — debe mostrar el login Ikán
   (no el scaffold Lovable viejo).
3. Login con `operador@iximpay.mx` + password generado → `/operador`.
4. Login con `oc@iximpay.mx` → panel Motor PLD; el selector de rol aparece.
5. Login con `admin@iximpay.mx` → vista Administración.

Si los 3 entran y ven sus dashboards desde la URL pública de Vercel,
**Sprint D-1 bootstrap cerrado**.

---

## Workflow continuo (a partir de aquí)

### Cambios en código (front, edge functions)

1. Code (sandbox) o tú (Mac) editan archivos.
2. `npm run typecheck && npm run lint && npm run build` antes de commitear.
3. Polo aprueba commit + push.
4. Vercel deploya automáticamente la rama main; las PRs generan preview deploys.

### Cambios en schema (migrations)

```bash
npx supabase migration new <nombre_descriptivo>
# Edita el SQL generado en supabase/migrations/
npx supabase db push   # aplica a remoto cibpguwwggwzdhhpdomz
npm run supabase:gen:types
git add -A && git commit -m "schema: <descripción>"
```

⚠️ `supabase db push` modifica la BD remota. Si la migration trae destructivos
(drop column, etc.), confirma dos veces. No hay deshacer automático.

### Cambios en seeds o catálogos

Los seeds NO se vuelven a aplicar con `db push`. Si necesitas reseedar:

```bash
psql "$DB_URL" -f supabase/seed/0X_archivo.sql
```

O, si quieres reset completo (perderás todos los datos en remoto):

```bash
npx supabase db reset --linked   # ⚠️ DESTRUCTIVO en remoto, confirma 2 veces
```

Por eso lo dejé en `deny` de las settings de Claude Code en el brief original.

---

## Seguridad — checklist obligatorio

- [ ] `.env.local` está en `.gitignore` y `git status` no lo lista.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` solo está en tu Mac (export temporal en
      terminal o en un `.env.local` que NO se commitea). Nunca en Vercel
      del lado del cliente, nunca en el código.
- [ ] Los passwords generados por `bootstrap-users` están en tu gestor de
      credenciales (1Password / Bitwarden). No en notas planas.
- [ ] En el primer login de cada usuario demo, enrolas 2FA TOTP. La caja de
      enrolamiento aparece automáticamente porque `enable_signup` está apagado
      y MFA está habilitado.
- [ ] El proyecto Supabase tiene **Row Level Security** activo en todas las
      tablas (las migrations 0001–0005 lo dejan así).
- [ ] El service role key NO está en ninguna Edge Function del front.
- [ ] No hay Mac, contraseña ni service key en `git log`. Verifica con
      `git log -p | grep -i 'service_role\|password\|sk_'` después del commit.

---

## Resumen — qué cambia respecto al brief original

| Punto                     | Brief original                              | Este addendum                                            |
| ------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| Entorno Supabase          | Local con Docker (`supabase start`)         | Remoto `cibpguwwggwzdhhpdomz`                            |
| `.env.example`            | URLs placeholder genéricas                  | URL real Supabase + placeholders para anon/service       |
| `supabase/config.toml`    | `project_id = "ikan-app"`                   | `project_id = "yoltik-regtech-hub"` + redirect URLs Vercel |
| Passwords demo            | `IkanDemo2026!` fijo                        | Aleatorios con `randomBytes(18).toString('base64url')`   |
| Aplicar migrations        | `supabase db reset` local                   | `supabase link` + `supabase db push` contra remoto        |
| Aplicar seeds             | Auto con `db reset`                         | `psql -f` por cada archivo contra remoto                 |
| Vercel                    | No contemplado                              | Env vars + redirect URLs + deploy automático             |
| 2FA                       | Habilitable en código                       | Habilitar en dashboard Supabase Auth (paso manual)       |
| Smoke                     | `npm run dev` local                         | `npm run dev` local + verificar Vercel deploy            |

---

## Si tropieza algo en el camino

- **`supabase link` falla con "project not found"**: verifica que estás logueado
  con la cuenta correcta (`supabase login` te pide token del dashboard).
- **`supabase db push` da error "schema mismatch"**: la BD remota ya tiene algo;
  revisa con `supabase db diff` qué difiere antes de forzar.
- **Vercel deploy falla en `npm run build`**: lo más probable es env vars
  faltantes (VITE_SUPABASE_URL/ANON_KEY). Las añades en Vercel y disparas
  redeploy.
- **El login en Vercel preview redirige y rompe**: revisa que los redirect URLs
  en Supabase Auth incluyen `https://*.vercel.app`.
- **Bootstrap-users dice "Ixim Pay no existe"**: aplicaste migrations pero no
  seeds. Corre los `psql -f` del paso 3 del Chunk 7.
