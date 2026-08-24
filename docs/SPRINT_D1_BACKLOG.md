# Sprint D-1 · Backlog ordenado

> Cada bloque (D1.Bn) cierra con checkpoint antes de pasar al siguiente.
> Si terminas un bloque, ejecuta:
> `npm run typecheck && npm run lint && npm run build`
> y reporta antes de seguir. Commit + push directos a `claude/magical-davinci-Md6ls`
> con formato `D1.Bn: descripción`. Merge a `main` requiere aprobación del usuario.

## Bootstrap (D1.B0*)

### ✅ D1.B0a — Pre-trabajo sobre scaffold Lovable

Commits `3d8f20e` y `323c38b`. Logros:
- Eliminados `bun.lock` y `bun.lockb` (stack 100% npm).
- Eliminado `lovable-tagger` de `package.json` y `vite.config.ts`.
- Añadidas dependencias `@supabase/supabase-js`, `tsx`, `prettier`.
- Añadidos scripts `typecheck`, `format`, `supabase:*`, `bootstrap:users`.
- Añadidos tokens `ikan.{navy,jade,mint,ambar}` a `tailwind.config.ts` como aliases
  de las CSS vars HSL existentes (sin tocar paleta shadcn).
- Creado shim `src/data/_legacy_mock.ts` para preservar mock data del Lovable.
- Fixes lint del scaffold: empty interfaces → type alias, `require()` → import,
  override `react-refresh/only-export-components` en `src/components/ui/**`.
- `package-lock.json` regenerado.
- typecheck/lint/build verdes.

### 🟡 D1.B0b — Contexto persistente y docs Ikán

Este chunk. Crea:
- `CLAUDE.md` (raíz) con port 8080, Plus Jakarta Sans, estado del bootstrap.
- `docs/CODE_BRIEF.md`, `docs/ARCHITECTURE.md`, `docs/ROLES.md`, `docs/MOTOR_PLD.md`,
  `docs/SPRINT_D1_BACKLOG.md` (este), `docs/claude-code-settings.md`.
- `.claude/settings.json` con allow/deny según regla viva.

### ⏳ D1.B0c — Schema (migrations + config Supabase + Edge Function stub)

Crea:
- `supabase/config.toml` con `project_id="yoltik-regtech-hub"`.
- `supabase/migrations/0001_initial_schema.sql` (orgs, users, roles, RLS, bitácora).
- `supabase/migrations/0002_risk_methodology.sql` (metodología EBR + matriz cliente).
- `supabase/migrations/0003_catalogos.sql` (países GAFI/OFAC, entidades MX, listas).
- `supabase/migrations/0004_clientes_operaciones.sql` (clientes, evaluación riesgo, operaciones).
- `supabase/migrations/0005_motor_pld.sql` (tipologías por AV, hallazgos, runs, avisos).
- `supabase/functions/motor-pld/index.ts` (stub Sprint D-3).

### ⏳ D1.B0d — Seeds Ixim Pay

Crea `supabase/seed/seed.sql` + 6 archivos con datos exactos de Ixim Pay
(organización, metodología EBR XVI, tipologías XVI-01..08, catálogos países/entidades,
plantilla matriz cliente XVI, cliente demo Juan Pérez).

### ⏳ D1.B0e — Configs, env, scripts

MERGE conservador:
- `package.json`: scripts ya añadidos en D1.B0a; verificar.
- `.env.example` con `VITE_SUPABASE_URL` apuntando a `cibpguwwggwzdhhpdomz`.
- `scripts/bootstrap-users.ts` (versión Addendum #1, passwords aleatorios).
- `src/index.css`: añadir clases `ikan-card`, `ikan-btn-*`, `ikan-badge-*`,
  `demo-banner` al final si no existen ya como `.glass-card / .metric-card / .status-badge`.

### ⏳ D1.B0f — Front Ikán sobre Lovable

CREATE:
- `src/types/domain.ts` (tipos de dominio Ikán).
- `src/types/database.ts` (placeholder, se regenera con `supabase:gen:types`).
- `src/lib/supabase.ts` (cliente Supabase).
- `src/hooks/useActiveRole.ts` (selector rol activo con localStorage).
- `src/components/auth/ProtectedRoute.tsx` (con `requireRole` y `requireAnyRole`).
- `src/components/layout/RoleSwitcher.tsx`.
- `src/lib/role-routes.ts` (mapa rol → entradas sidebar).
- `src/lib/auth-context.tsx`.
- `src/pages/auth/Login.tsx` (con 2FA TOTP).

MERGE:
- `src/lib/utils.ts`: preservar `cn` existente, añadir `UMA_MXN`, `umaToMxn`, `formatMxn`.
- `src/App.tsx`: envolver con `<AuthProvider>` + `<ProtectedRoute>` por ruta según roles.
- `src/components/AppHeader.tsx`: quitar mock "Patricia Vega · OC", inyectar `<RoleSwitcher>` + datos `useAuth`.
- `src/components/AppSidebar.tsx`: filtrar `NAV_ENTRIES` por `activeRole`.
- `src/components/AppLayout.tsx`: leer `useAuth()` para perfil real.

NO crear (cancelado por Addendum #2): `AppShell.tsx`, `Sidebar.tsx` nuevos,
dashboards stub por rol, `src/main.tsx`, `index.html`, `src/styles/global.css`.

---

## D1.B1 · Smoke test contra Supabase remoto

> Lo corre **Polo en su Mac**, no Code en el sandbox.

**Objetivo**: aplicar migrations + seeds a `cibpguwwggwzdhhpdomz`, crear los 3 usuarios,
validar que el deploy de Vercel apunta a esa BD.

### Pasos (Mac de Polo)

```bash
cd ~/path/to/yoltik-regtech-hub
git pull

npm install
cp .env.example .env.local
# Editar .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY del dashboard.

# 1. Vincular el repo al proyecto remoto
npx supabase login
npx supabase link --project-ref cibpguwwggwzdhhpdomz

# 2. Aplicar migrations al remoto
npx supabase db push

# 3. Aplicar seeds al remoto
#    Conexión desde: https://supabase.com/dashboard/project/cibpguwwggwzdhhpdomz/settings/database
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

# 5. Regenerar types
npm run supabase:gen:types

# 6. Bootstrap 3 usuarios
export SUPABASE_URL="https://cibpguwwggwzdhhpdomz.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role_key del dashboard>"
npm run bootstrap:users
# ⚠️ Anota las 3 credenciales en 1Password.

# 7. Probar local
npm run dev
# http://localhost:8080
```

### Criterio de aceptación

- `http://localhost:8080` muestra el login Ikán.
- Login `operador@iximpay.mx` → redirige al dashboard con sidebar de Operador.
- Login `oc@iximpay.mx` → dashboard con sidebar OC + selector "Operando como".
- Login `admin@iximpay.mx` → dashboard con sidebar Admin.
- `https://yoltik-regtech-hub.vercel.app` (deploy automático) acepta los mismos logins.

**Checkpoint con Polo antes de seguir.**

---

## D1.B2 · Auth real con roles desde BD

**Objetivo**: reemplazar el placeholder de `auth-context.tsx` que devuelve siempre
`['operador']` por query real a `user_profile + user_roles`.

**Archivos a tocar**:
- `src/lib/auth-context.tsx` — implementar `loadProfile` real.
- `src/types/database.ts` — regenerar con `npm run supabase:gen:types` tras migrations.

**Implementación**:
```typescript
const { data: profileRow } = await supabase
  .from('user_profile')
  .select('id, organization_id, email, nombre, activo')
  .eq('id', session.user.id)
  .single();

const { data: roleRows } = await supabase
  .from('user_roles')
  .select('rol')
  .eq('user_id', session.user.id)
  .eq('organization_id', profileRow.organization_id);

const roles = roleRows?.map(r => r.rol) ?? [];
setProfile({ ...profileRow, roles, mfa_habilitado: true });
setRoles(roles);
```

**Criterio de aceptación**:
- Cada usuario ve el sidebar correcto según sus roles reales.
- `oc@iximpay.mx` puede cambiar entre OC y Admin desde el switcher.
- Logout funciona y devuelve a `/login`.

---

## D1.B3 · Bitácora — escribir entradas

**Objetivo**: que cada acción relevante (login, role-switch, captura) deje entrada
en `audit_log` con el rol activo.

**Archivos**:
- Crear `src/lib/audit.ts` con `logAuditEntry({ accion, recurso_tipo, recurso_id, antes, despues })`.
- Llamar desde `auth-context.tsx` (al login y logout).
- Llamar desde el `RoleSwitcher` al cambiar de rol.

---

## D1.B4 · Onboarding wizard de organización (admin-only)

**Objetivo**: pantalla de alta de organización (solo accesible para Admin). Aunque
Ixim Pay ya está seedada, este wizard sirve para demos donde se quiere mostrar
cómo se onboarda un sujeto obligado nuevo.

**Archivos**:
- `src/pages/admin/OnboardingOrganizacion.tsx`.
- `src/lib/api/organizations.ts`.

---

## D1.B5 · Listado y detalle de metodología EBR (admin)

**Objetivo**: Admin ve la metodología EBR cargada con sus 5 Elementos, indicadores,
pesos y mitigantes.

**Archivos**:
- `src/pages/admin/Metodologia.tsx` (o adaptar `ConfigPage` existente).
- `src/lib/api/risk-methodology.ts`.
- `src/lib/risk-engine.ts` con `computeMethodology(tree)`.

---

## D1.B6 · Editor de metodología EBR con flujo de aprobación

**Objetivo**: Admin edita pesos, impactos, niveles y mitigantes. Cada cambio cae en
`pending_approvals` y el OC lo aprueba.

**Archivos**:
- `src/pages/admin/MetodologiaEditor.tsx`.
- `src/pages/oc/Aprobaciones.tsx` (bandeja del OC).
- `src/lib/api/pending-approvals.ts`.

---

## D1.B7 · Listado de tipologías por AV (admin)

**Objetivo**: Admin ve las 8 tipologías XVI seedeadas con su `regla_dsl`.

**Archivos**:
- `src/pages/admin/Tipologias.tsx` (o adaptar `RulesEnginePage` existente).
- `src/lib/api/tipologias.ts`.

---

## D1.B8 · Gestión de usuarios y roles (admin)

**Objetivo**: Admin crea/desactiva usuarios y asigna roles desde la UI.

**Archivos**:
- `src/pages/admin/Usuarios.tsx`.
- `src/lib/api/users.ts`.
- Edge Function `supabase/functions/admin-users/index.ts` (con service role).

---

## D1.B9 · Smoke test final del Sprint D-1

**Checklist**:
- [ ] Los 3 usuarios pueden hacer login con 2FA TOTP.
- [ ] El sidebar muestra solo las opciones de su rol.
- [ ] El usuario OC + Admin puede cambiar de rol y la pantalla cambia.
- [ ] Admin puede crear una nueva organización.
- [ ] Admin ve la metodología EBR Ixim Pay con cálculos correctos.
- [ ] Admin edita un peso y queda pendiente de aprobación.
- [ ] OC aprueba el cambio y la versión sube.
- [ ] Admin lista las 8 tipologías XVI con su regla_dsl visible.
- [ ] Admin invita a un usuario nuevo y le asigna rol.
- [ ] Bitácora muestra entradas con `rol_activo` correcto.
- [ ] `npm run build`, `typecheck`, `lint` corren limpios.

**Si todo verde**: Sprint D-1 cerrado. Abrir Sprint D-2.

---

## Deuda técnica identificada en D1.B0a

Pendientes detectados al ejecutar el pre-trabajo. No bloquean Sprint D-1 pero
hay que cerrarlos antes de demo público o en Sprint D-2.

- **Browserslist data 11 meses vieja**: `npx update-browserslist-db@latest` (1 comando).
  Resuelve el warning del `npm run build`.
- **`npm audit`**: 16 vulnerabilidades transitivas (7 moderate + 9 high) en dev deps.
  Revisar cuáles requieren acción real vs cuáles son falsos positivos heredados.
- **Bundle 840 KB / gzip 243 KB**: el `index-*.js` excede 500 KB. Implementar
  route-based code splitting con `React.lazy` por página (las 12 páginas Lovable).
  Bajaría el initial a ~300 KB. **Sprint D-2** si no es urgente para el demo.
- **Seed Demo Genérica XVI**: el seed `01_organization_ixim_pay.sql` usa datos reales
  de Ixim Pay (autorizado por el representante legal para uso interno y demos
  Kawiil). Para demos a terceros sin contexto Kawiil, crear `supabase/seed/01b_demo_generica_xvi.sql`
  con datos sintéticos. **Sprint D-2+**.

---

## Lo que NO entra en Sprint D-1

- Vista del Operador funcional (alta de cliente, captura de operación). **D-2.**
- KYC mock con Moffin (modal con banner). **D-2.**
- Editor visual de tipologías con regla_dsl. **D-2.**
- Editor de catálogos (países, entidades, señales). **D-2.**
- Motor PLD funcional (evaluadores de regla_dsl). **D-3.**
- Hallazgos del motor + flujo de confirmación OC. **D-3.**
- Generación de borradores de aviso 24h y mensual. **D-3.**
- Conectar las 12 páginas Lovable a queries reales (hoy leen del shim `_legacy_mock.ts`). **D-2/D-3.**

---

## Notas para Claude Code mientras trabaja

- **No instales librerías nuevas sin avisar.** El stack está cerrado en
  `package.json`. Si necesitas una, propón con justificación.
- **Commit + push directo a la rama de trabajo** está OK. Merge a `main` no.
- **Patrón de commit**: `D1.Bn: <descripción corta>` (alineado al backlog).
- **Si encuentras inconsistencias entre `CLAUDE.md` y el código**, levanta la mano
  antes de "corregir" — puede ser intencional.
- **Si necesitas ver los Excel/docx originales de Ixim Pay**, pídeselos a Polo;
  viven en su carpeta de proyectos, no en este repo.
