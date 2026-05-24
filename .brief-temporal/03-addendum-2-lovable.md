# Ikán — Addendum #2: adaptación al estado real del scaffold Lovable

> **Aplica DESPUÉS del Brief original y el Addendum #1**, antes de arrancar el
> Chunk 2 con Code. Reemplaza decisiones del brief que asumían un repo vacío y
> ahora chocan con las 12 páginas funcionales y la base shadcn ya instalada en
> el Lovable scaffold (commit `5ad7870 Implement dashboard scaffolding`).
>
> **Principio rector**: NO destruir trabajo del Lovable que sirve. Construir
> Ikán encima añadiendo auth + roles + RLS + Motor PLD, y reaprovechar las
> páginas (Clientes, Operaciones, Alertas, Reportes, Listas, RulesEngine,
> Verificacion, Auditoria, Configuracion) tal cual con `<ProtectedRoute>`.

---

## 1. Las 11 decisiones (resueltas con criterio conservador)

| # | Pregunta de Code | Decisión |
|---|------------------|----------|
| 1 | 12 páginas Lovable: ¿conservar o tirar? | **CONSERVAR.** Son la base operativa de Ikán. Se envuelven con `<ProtectedRoute requireRole>`. |
| 2 | Sidebar/Shell: ¿reemplazar o adaptar? | **ADAPTAR.** Conservar `AppLayout`, `AppHeader`, `AppSidebar`, `NavLink`. Renombrar `AppLayout`→`AppShell` opcional. Inyectar `RoleSwitcher` en `AppHeader` (reemplaza el "Patricia Vega · OC" mock). Hacer `AppSidebar` consciente del rol activo. |
| 3 | Tipografía: ¿cambiar Plus Jakarta Sans → Sora? | **CONSERVAR Plus Jakarta Sans.** Es muy similar a Sora, ya está integrada en `index.css`. Ahorra un cambio sin ganancia real. Actualizo el brandbook Yoltik para reflejar PJS como tipografía vigente del demo. |
| 4 | Paleta: ¿reemplazar HSL o añadir tokens? | **AÑADIR navy/jade/mint/ambar como aliases** apuntando a las variables HSL existentes. No tocar lo que shadcn ya consume. |
| 5 | `src/data/mockData.ts`: ¿conservar o mover? | **MOVER a `src/data/_legacy_mock.ts`** y crear un `src/data/mockData.ts` mínimo que reexporte lo necesario, marcado con TODO. Las páginas siguen funcionando con mock hasta Sprint D-2/D-3 que conecta queries reales. |
| 6 | Lockfiles: 3 mezclados (bun + npm) | **Eliminar `bun.lock` y `bun.lockb`.** Quedarnos con `package-lock.json`. Todo el stack asume npm. |
| 7 | `lovable-tagger` en `vite.config.ts` | **Eliminar.** Salimos del ecosistema Lovable, evita confusión. |
| 8 | eslint flat config v9 vs script del brief | **Adaptar el script** a flat config: `eslint . --max-warnings 0`. NO migrar a `.eslintrc.cjs`. |
| 9 | tsconfig strict actualmente en `false` | **Mantener en `false`** por ahora. Endurecer es Sprint D-2+ porque rompería las 13 páginas existentes. Añadir `typecheck: tsc --noEmit` como script para verificación sin bloquear build. |
| 10 | build: ¿añadir `tsc &&` antes de `vite build`? | **NO añadir.** Mantener `vite build`. Si las páginas Lovable tienen tipos laxos, romperíamos el build hoy. `typecheck` separado cubre validación. |
| 11 | Port 8080 (Lovable) vs 5173 (brief) | **Mantener 8080.** Ajustar redirect URLs de Supabase Auth y `.env.example`. |

---

## 2. Cambios al Brief original — qué se aplica, qué no

### 2.1 Archivos del Brief que se aplican SIN cambio

Estos archivos del brief original siguen válidos tal cual:

- `CLAUDE.md` (raíz)
- Todos los `docs/*` (CODE_BRIEF, SPRINT_D1_BACKLOG, ARCHITECTURE, ROLES, MOTOR_PLD, claude-code-settings)
- `supabase/config.toml` (versión del Addendum #1 con `project_id="yoltik-regtech-hub"`)
- `supabase/migrations/0001..0005_*.sql` (las 5 migrations)
- `supabase/seed/*.sql` (los 7 archivos seed)
- `supabase/functions/motor-pld/index.ts` (stub)
- `scripts/bootstrap-users.ts` (versión del Addendum #1 con passwords aleatorios)
- `src/types/domain.ts`
- `src/types/database.ts` (placeholder)
- `src/lib/supabase.ts`
- `src/lib/auth-context.tsx`
- `src/hooks/useActiveRole.ts`
- `src/components/auth/ProtectedRoute.tsx`
- `src/components/layout/RoleSwitcher.tsx` (componente nuevo que se importa en el AppHeader existente)
- `src/pages/auth/Login.tsx`

### 2.2 Archivos del Brief que se DESCARTAN (no se aplican)

Estos se descartan porque chocan con el Lovable existente:

- ❌ `src/pages/operador/Dashboard.tsx`
- ❌ `src/pages/oc/Dashboard.tsx`
- ❌ `src/pages/admin/Dashboard.tsx`
- ❌ `src/components/layout/AppShell.tsx` (se adapta el `AppLayout` existente)
- ❌ `src/components/layout/Sidebar.tsx` (se adapta el `AppSidebar` existente)
- ❌ `src/main.tsx` (conservar el actual del Lovable)
- ❌ `index.html` (conservar el actual)
- ❌ `src/styles/global.css` (conservar el `src/index.css` actual; añadir solo las utilidades Ikán que falten al final)

### 2.3 Archivos del Brief que se MERGEAN (no REPLACE)

- 🔀 `package.json` — ver §3 abajo.
- 🔀 `tailwind.config.ts` — ver §4 abajo.
- 🔀 `vite.config.ts` — ver §5 abajo.
- 🔀 `src/App.tsx` — ver §6 abajo.
- 🔀 `src/lib/utils.ts` — preservar `cn` existente, añadir `UMA_MXN`, `umaToMxn`, `formatMxn`.
- 🔀 `src/index.css` (NO crear `src/styles/global.css`) — añadir al final las clases `ikan-card`, `ikan-btn-*`, `ikan-badge-*`, `demo-banner` que no existan ya en el `.glass-card / .metric-card / .status-badge` actuales. Si solapan, Code reporta antes de añadir.

### 2.4 Archivos NUEVOS específicos de esta integración (no estaban en el brief)

- `src/lib/role-routes.ts` — mapa rol → rutas permitidas (ver §7).
- Adaptación de `src/components/AppHeader.tsx` — quitar el mock "Patricia Vega · OC", inyectar `<RoleSwitcher>` real desde `useAuth() + useActiveRole()`. El badge de alertas pendientes pasa a ser un counter conectado a Supabase (en Sprint D-3; por ahora puede quedar con mock pero comentado).
- Adaptación de `src/components/AppSidebar.tsx` — filtrar las entradas del menú según `activeRole`.
- Adaptación de `src/components/AppLayout.tsx` — envolver con `<AuthProvider>` y leer `useAuth()` para mostrar nombre/email reales.

---

## 3. Modificaciones a `package.json` (MERGE)

### Quitar
- `lovable-tagger` (dependency)

### Añadir (las que aún no están)
```json
"dependencies": {
  "@supabase/supabase-js": "^2.45.0"
  // @tanstack/react-query ya está (5.83.0)
  // react-router-dom ya está (6.30.1)
  // zod ya está (3.25.76)
}
```

### devDependencies a añadir
```json
"devDependencies": {
  "tsx": "^4.19.0"
  // @types/node ya está (22.16.5)
}
```

### Scripts — ajustar/añadir
```json
"scripts": {
  "dev": "vite",                                        // (existente, mantener)
  "build": "vite build",                                // (existente, NO añadir tsc previo)
  "build:dev": "vite build --mode development",         // (existente, mantener)
  "lint": "eslint . --max-warnings 0",                  // CAMBIAR (quitar --ext)
  "preview": "vite preview",                            // (existente)
  "test": "vitest run",                                 // (existente)
  "test:watch": "vitest",                               // (existente)
  "typecheck": "tsc --noEmit",                          // NUEVO
  "format": "prettier --write \"src/**/*.{ts,tsx,css}\"", // NUEVO (si prettier no está, añadirlo a devDeps)
  "supabase:start": "supabase start",                   // NUEVO
  "supabase:db:push": "supabase db push",               // NUEVO
  "supabase:db:reset": "supabase db reset",             // NUEVO
  "supabase:gen:types": "supabase gen types typescript --linked > src/types/database.ts",  // NUEVO
  "bootstrap:users": "tsx scripts/bootstrap-users.ts"   // NUEVO
}
```

### Lockfiles
- `git rm bun.lock bun.lockb`
- Conservar `package-lock.json`. Si Code añade nuevas deps, regenera con `npm install`.

---

## 4. Modificaciones a `tailwind.config.ts` (MERGE)

Preservar todo lo existente (paleta HSL navy/jade/destructive/vulnerable, plugin `tailwindcss-animate`, animaciones fade/slide, fuente Plus Jakarta Sans).

**Añadir al final de `theme.extend.colors`** los tokens Yoltik como aliases:

```ts
// theme.extend.colors → añadir al final
ikan: {
  navy: 'hsl(var(--navy, 218 60% 12%))',
  jade: 'hsl(var(--jade, 165 80% 32%))',
  mint: 'hsl(160 60% 88%)',
  ambar: 'hsl(38 92% 50%)',
}
```

Razón del namespace `ikan.*`: evita colisión con las clases navy/jade que el
Lovable ya usa con sus propios HSL. Si en el futuro decidimos unificar, lo
hacemos en Sprint D-2.

**NO añadir** Sora a fontFamily; mantener Plus Jakarta Sans.

---

## 5. Modificaciones a `vite.config.ts`

- Quitar import y uso de `componentTagger()` (de `lovable-tagger`).
- Mantener `mode === 'development' ? componentTagger() : null` queda en blanco.
- Mantener port 8080.
- Mantener alias `@→./src` y dedupe.

Resultado esperado:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig({
  server: { host: '::', port: 8080 },
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
  },
});
```

---

## 6. Modificaciones a `src/App.tsx` (MERGE)

El App.tsx actual del Lovable tiene 12 rutas con `BrowserRouter`. **NO se
reemplaza.** Se envuelve con `<AuthProvider>` y se añade `<ProtectedRoute>` a
las rutas, más una nueva ruta `/login`.

Estructura objetivo:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/lib/auth-context';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AppLayout } from '@/components/AppLayout';
import { LoginPage } from '@/pages/auth/Login';
// ... imports existentes de páginas Lovable

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              {/* Todas las rutas Lovable existentes, ahora protegidas */}
              <Route index element={<DashboardPage />} />
              <Route path="clientes" element={<ProtectedRoute requireAnyRole={['operador','oc','admin']}><ClientsPage /></ProtectedRoute>} />
              <Route path="clientes/:id" element={<ProtectedRoute requireAnyRole={['operador','oc','admin']}><ClientDetailPage /></ProtectedRoute>} />
              <Route path="operaciones" element={<ProtectedRoute requireAnyRole={['operador','oc','admin']}><OperationsPage /></ProtectedRoute>} />
              <Route path="alertas" element={<ProtectedRoute requireAnyRole={['oc','admin']}><AlertsPage /></ProtectedRoute>} />
              <Route path="reportes" element={<ProtectedRoute requireAnyRole={['oc','admin']}><ReportsPage /></ProtectedRoute>} />
              <Route path="listas" element={<ProtectedRoute requireRole="admin"><ListsPage /></ProtectedRoute>} />
              <Route path="motor-reglas" element={<ProtectedRoute requireRole="admin"><RulesEnginePage /></ProtectedRoute>} />
              <Route path="verificacion" element={<ProtectedRoute requireAnyRole={['operador','oc']}><VerificationPage /></ProtectedRoute>} />
              <Route path="auditoria" element={<ProtectedRoute requireAnyRole={['oc','admin']}><AuditPage /></ProtectedRoute>} />
              <Route path="configuracion" element={<ProtectedRoute requireRole="admin"><ConfigPage /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

**Importante**: el `ProtectedRoute` del brief admite solo `requireRole` (string).
Hay que **extenderlo** para aceptar también `requireAnyRole` (array). Code añade
esa variante al componente.

---

## 7. `src/lib/role-routes.ts` (NUEVO)

Mapa centralizado de qué rol ve qué entrada del sidebar. Lo consume `AppSidebar`.

```ts
import type { RolUsuario } from '@/types/domain';
import {
  LayoutDashboard, Users, Receipt, ShieldAlert, FileSignature,
  ListChecks, Settings, BookOpen, Eye, History, FileText,
} from 'lucide-react';

export interface NavEntry {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: RolUsuario[];
}

export const NAV_ENTRIES: NavEntry[] = [
  { to: '/',             label: 'Dashboard',     icon: LayoutDashboard, roles: ['operador','oc','admin'] },
  { to: '/clientes',     label: 'Clientes',      icon: Users,           roles: ['operador','oc','admin'] },
  { to: '/operaciones',  label: 'Operaciones',   icon: Receipt,         roles: ['operador','oc','admin'] },
  { to: '/verificacion', label: 'Verificación',  icon: Eye,             roles: ['operador','oc'] },
  { to: '/alertas',      label: 'Alertas',       icon: ShieldAlert,     roles: ['oc','admin'] },
  { to: '/reportes',     label: 'Reportes',      icon: FileText,        roles: ['oc','admin'] },
  { to: '/auditoria',    label: 'Auditoría',     icon: History,         roles: ['oc','admin'] },
  { to: '/listas',       label: 'Listas',        icon: ListChecks,      roles: ['admin'] },
  { to: '/motor-reglas', label: 'Motor reglas',  icon: Settings,        roles: ['admin'] },
  { to: '/configuracion',label: 'Configuración', icon: BookOpen,        roles: ['admin'] },
];

export function navEntriesForRole(rol: RolUsuario): NavEntry[] {
  return NAV_ENTRIES.filter(e => e.roles.includes(rol));
}
```

---

## 8. Plan de chunks ajustado

| Chunk | Antes (brief original) | Ahora (con este addendum) |
|-------|------------------------|---------------------------|
| 1 | Inventory | ✅ Ya hecho. |
| 2 | Crear CLAUDE.md + docs/ | Sin cambios. Aplica tal cual. |
| 3 | Schema (migrations + config + edge function) | Sin cambios. |
| 4 | Seeds FIATCOIN | Sin cambios. |
| 5 | Configs (package.json, env, tailwind, scripts) | **MERGE conservador**. Quitar lovable-tagger. Eliminar lockfiles bun. Adaptar lint script. Añadir typecheck/supabase:*/bootstrap:users. Tailwind: añadir tokens `ikan.*` sin tocar HSL. Vite: quitar componentTagger, mantener 8080. env: port 8080 en docs. |
| 6 | Front (auth, layout, dashboards) | **REESCRITO**: solo crear lo que falta. NO crear AppShell ni Sidebar nuevos; adaptar `AppLayout`, `AppSidebar`, `AppHeader` existentes para ser conscientes del rol. Crear `src/lib/role-routes.ts`. Crear `src/pages/auth/Login.tsx`. Envolver rutas en `App.tsx` con `<ProtectedRoute>` por rol. Mover `mockData.ts` a `_legacy_mock.ts` con shim. NO crear dashboards por rol — la DashboardPage existente sirve. |
| 7 | Smoke | Sin cambios (versión del Addendum #1, contra cibpguwwggwzdhhpdomz). |

---

## 9. Mapeo de páginas Lovable → roles Ikán

Esta es la tabla de verdad para `ProtectedRoute` y `NAV_ENTRIES`:

| Ruta | Página Lovable existente | Roles con acceso | Justificación |
|------|--------------------------|------------------|---------------|
| `/` | `DashboardPage` | operador, oc, admin | KPIs + kanban; en Sprint D-3 el contenido se filtra por rol activo |
| `/clientes` | `ClientsPage` | operador, oc, admin | Operador alta + ve los suyos (RLS); OC/Admin ven todos |
| `/clientes/:id` | `ClientDetailPage` | operador, oc, admin | Misma lógica RLS |
| `/operaciones` | `OperationsPage` | operador, oc, admin | Operador captura; OC/Admin consultan |
| `/verificacion` | `VerificationPage` | operador, oc | KYC mock Moffin. Admin no opera KYC directamente |
| `/alertas` | `AlertsPage` | oc, admin | Es la futura bandeja de hallazgos del Motor PLD. Operador NO ve |
| `/reportes` | `ReportsPage` | oc, admin | Avisos 24h y mensual |
| `/auditoria` | `AuditPage` | oc, admin | Bitácora completa |
| `/listas` | `ListsPage` | admin | Catálogos GAFI/OFAC. OC aprueba via pending_approvals |
| `/motor-reglas` | `RulesEnginePage` | admin | Configura tipologías + umbrales. OC aprueba via pending_approvals |
| `/configuracion` | `ConfigPage` | admin | Usuarios, metodología EBR |

---

## 10. Cierre del Chunk 6 (smoke con Lovable preservado)

Después de aplicar este addendum + Chunks 2-6:

```bash
npm install          # quitará lovable-tagger, añadirá @supabase/supabase-js + tsx
npm run typecheck    # con strict:false debe estar limpio
npm run lint         # con flat config + max-warnings 0
npm run build        # vite build sin tsc previo
```

Si todo verde, Code propone commit `D1.B0c: front Ikán sobre Lovable (auth + roles + role-routes)`.
Polo aprueba y push. Vercel deploya. Tú entras a la URL pública con las 3
cuentas FIATCOIN (después de correr `bootstrap:users` en tu Mac).

---

## 11. Lo que NO entra en este Sprint D-1 (postpónlo)

Las páginas Lovable funcionan hoy con `mockData.ts`. Para Sprint D-2 / D-3:

- **Conectar queries reales** a Supabase en `ClientsPage`, `OperationsPage`,
  `AlertsPage`, `ReportsPage`, `AuditPage` (hoy leen del mock).
- **Renderizar contenido del Dashboard distinto según rol activo**.
- **Implementar Motor PLD** real (Edge Function `motor-pld` evalúa
  `regla_dsl` de las tipologías).
- **Convertir `AlertsPage` en `HallazgosDelMotorPLDPage`** conceptualmente
  (mismo componente, fuente de datos cambia).
- **Editor visual de tipologías** y flujo de aprobación Admin → OC en
  `RulesEnginePage` / `ConfigPage`.

---

## Resumen ejecutivo para Polo

- Las 12 páginas del Lovable se preservan en su totalidad y se reaprovechan.
- Sprint D-1 ahora es: añadir auth + roles + RLS + tipologías + motor PLD
  esqueleto, sin reescribir la UI.
- El alcance se reduce en código UI (menos archivos nuevos) y se mantiene en
  schema/seeds/auth (idéntico al brief).
- Riesgo de regresión sobre el Lovable: bajo. Solo se modifica `App.tsx`,
  `AppHeader`, `AppSidebar`, `AppLayout`, `package.json`, `tailwind.config`,
  `vite.config`.

---

## Apéndice: cómo Polo le pasa esto a Code

Después de pegar el inventory reporte que ya hiciste, Polo te pega en este
orden:

1. El **Brief original completo** (`Ikan-Code-Implementation-Brief.md`).
2. El **Addendum #1** (`Ikan-Code-Addendum-Vercel-Supabase-Remoto.md`).
3. **Este Addendum #2**.
4. Mensaje: "Aplica integrando las 3 fuentes. Las decisiones del Addendum #2
   ganan sobre el brief original cuando haya conflicto. Arranca Chunk 2."

Code procesa todo y avanza Chunks 2-6 autónomamente, parando solo si tropieza.
