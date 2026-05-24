# Ikán — Brief de implementación para Claude Code

> **Destinatario**: Claude Code trabajando sobre el repo `yoltik-regtech-hub`.
> **Sprint objetivo**: D-1 (Foundations + 3 roles + EBR cargado + tipologías visibles).
> **Fecha**: 23 de mayo de 2026.

---

## Cómo usar este documento

Lo pegas a Code en **7 chunks**, uno a la vez. Cada chunk cierra con un checkpoint;
no avances al siguiente sin que el actual esté limpio.

Los archivos van delimitados así:

```
---FILE: path/relativo/al/repo---
... contenido literal entre fences ...
---END FILE---
```

Cuando Code vea ese formato, crea el archivo en esa ruta exacta con el contenido
literal. Si el archivo ya existe en el repo Lovable y está marcado `[MERGE]`,
Code propone diff antes de aplicar.

---

## Reglas duras (válidas en todos los chunks)

1. **No commit ni push automáticos.** Polo aprueba cada commit antes del push.
   Code puede `git add` y proponer mensaje, no ejecutar `git commit` ni `git push`.
2. **No inventar valores.** Si un campo, peso, umbral o SQL no está en este brief
   ni en metodología FIATCOIN, Code pregunta.
3. **No instalar libs nuevas** sin avisar. El `package.json` del Chunk 5 lista las
   deps esperadas.
4. **Mocks visibles** (Moffin, listas tiempo real, SAT real) con banner ámbar
   `DEMO — sin integración real`.
5. **Brand Yoltik v3**: Navy/Jade/Mint/Ámbar, tipografía Sora. Sin Yoli.
6. **UI en español de México.**
7. **MERGE vs CREATE vs REPLACE**: archivos marcados `[MERGE]` deben fusionarse
   con el contenido existente. Los `[CREATE]` se crean nuevos. Los `[REPLACE]`
   reemplazan completo lo existente (Code reporta diff antes de aplicar).
8. **Modelo operativo**: Operador captura → Motor PLD procesa → OC consume.
   **No hay revisión humana cruzada entre Operador y OC.**
9. **Separación sandbox (Code) vs Mac local (Polo)**:
   - Sandbox: edita archivos, corre typecheck/lint/build, propone commits.
   - Mac local: corre Supabase local, migrations, seeds, bootstrap, dev server.

---

## Chunk 1 — INVENTORY (sin generar archivos todavía)

**Objetivo**: que Code entienda qué tiene el repo Lovable hoy antes de tocar nada.

**Mensaje exacto para pegar a Code**:

```text
Antes de generar nada, hazme un inventory del repo actual y reporta:

1. Estructura: `find . -maxdepth 3 -type d -not -path '*/node_modules/*' -not -path '*/.git*' | sort`.
2. `package.json`: nombre, scripts existentes, dependencies y devDependencies (con versiones).
3. Configs raíz: tailwind, vite, tsconfig, postcss, eslint, prettier, index.html. ¿Existen? ¿Resumen?
4. `src/`: estructura. Lista App.tsx, main.tsx, pages/, components/, lib/.
5. Tests: ¿playwright? ¿vitest? ¿carpetas test/, tests/, e2e/?
6. Componentes shadcn instalados en `src/components/ui/`. Listar nombres.
7. ¿Existe `supabase/`, `docs/`, `scripts/`, `CLAUDE.md`?
8. Último commit: `git log -1 --oneline`.
9. Rama actual: `git branch --show-current`.

NO modifiques nada. Solo reporta. Espera mi visto bueno antes del Chunk 2.
```

**Checkpoint Chunk 1**: Polo confirma qué del Lovable se preserva. Polo dice
"OK, sigue con Chunk 2" o ajusta el plan.

---

## Chunk 2 — FUNDAMENTOS (CLAUDE.md + docs/)

**Objetivo**: aterrizar contexto persistente en el repo, sin tocar código aún.

**Archivos**: todos `[CREATE]` (nuevos en el repo).

**Cierre del Chunk 2**: Code reporta archivos creados. Polo aprueba commit
`D1.B0a: contexto persistente y docs Ikán`.


---FILE: CLAUDE.md---
```markdown
# Ikán — contexto persistente para Claude Code

> Este archivo lo lee Claude Code automáticamente al abrir el repo.
> Cuando trabajes con Code: NO te leas todo el repo de inicio. Lee solo este archivo,
> después `docs/SPRINT_D1_BACKLOG.md`, y a partir de ahí abre los archivos que el
> bloque activo necesite.

## Qué es este proyecto

**Ikán** es la plataforma de cumplimiento PLD de Yoltik (operada por Kawiil), dirigida
a sujetos obligados bajo LFPIORPI. El demo arranca con el sector **XVI — Activos
Virtuales**, usando la metodología EBR de **FIATCOIN RAMPLE** (cliente real Kawiil)
como seed canónico.

Producto en construcción. Sprint actual: **D-1 — Foundations + onboarding + EBR
cargado + 3 roles funcionales**.

## Modelo operativo (NO confundir)

El modelo es lineal con motor automático en medio. **No hay revisión humana cruzada
entre Operador y OC.**

```
Operador captura → Motor PLD procesa → OC consume bandejas del motor
                                    ↑
                                Admin configura
```

- **Operador**: vende u opera. Captura clientes, integra expedientes, registra
  operaciones. Acuse neutro: "Operación registrada". NO menciona al OC.
- **Motor PLD**: módulo automatizado. Identifica operaciones ≥645 UMA, clasifica
  para aviso, aplica tipologías por AV, genera borradores de aviso.
- **OC**: consume hallazgos del motor (NO revisa al Operador). Confirma/descarta,
  marca Inusual/Preocupante, firma avisos. También aprueba (sin editar) los cambios
  técnicos del Admin.
- **Administrador**: configura el motor (metodología, tipologías, catálogos, reglas).
  Sus cambios pasan por aprobación del OC en `pending_approvals`. Si OC = Admin,
  auto-firma con registro en bitácora.

Para detalle, ver `docs/ROLES.md`, `docs/MOTOR_PLD.md`, `docs/ARCHITECTURE.md`.

## Stack

- Front: Vite + React 18 + TypeScript + Tailwind 3 + shadcn/ui (instalable on-demand)
- Auth: Supabase Auth con **2FA TOTP obligatorio**
- BD: Supabase Postgres con **RLS multi-tenant por organización y por rol**
- Edge Functions: Deno/TS (Motor PLD vive aquí en Sprint D-3)
- Deploy: Vercel (previews por PR, prod en main)
- Path alias `@/` apunta a `src/`

## Convenciones — críticas

1. **Bloque por bloque con checkpoint.** Nunca acumules más de 1 bloque sin
   verificar con el usuario. Cada bloque cierra con build limpio + smoke notes.
2. **No inventes campos ni valores.** Si algo no está en metodología FIATCOIN, en
   las guías oficiales (UIF/SAT/GAFI), o en el código existente: pregunta. NUNCA
   improvises algoritmos, umbrales o estructuras "razonables".
3. **Mocks visibles.** Lo que no esté integrado (Moffin, listas tiempo real,
   analítica on-chain, envío SAT) debe llevar **banner ámbar** con texto explícito
   "DEMO — sin integración real". Nunca silencioso.
4. **IDs fijos en seeds.** Los seeds usan UUIDs deterministas para que el front
   pueda referenciar sin race conditions. NO los cambies sin razón fuerte:
   - Organización FIATCOIN: `11111111-1111-1111-1111-111111111111`
   - Metodología EBR XVI v1: `22222222-2222-2222-2222-222222222201`
   - Tipologías XVI-01..XVI-08: `33333333-0000-0000-0000-00000000000{1..8}`
   - Plantilla matriz cliente XVI: `44444444-0000-0000-0000-000000000001`
   - Cliente demo Juan Pérez: `55555555-0000-0000-0000-000000000001`
5. **Brand Yoltik v3.** Navy / Jade / Mint / Ámbar; tipografía Sora.
   `tailwind.config.ts` tiene los tokens. **Yoli (mascota) NO aparece en docs ni UI
   formales** — solo en materiales informales si se solicita.
6. **No mezclar con Kailash.** Repo separado, conceptos separados, nada de copiar
   patrones específicos de Kailash sin pensar si aplican.
7. **Idioma**: UI y mensajes de usuario en **español de México**. Comentarios de
   código y mensajes de commit en español también (consistente con el resto del
   código existente). Sin emojis salvo que se pida.
8. **Comentarios `TODO[Sprint D-x]`** para puntos pendientes; mantén ese formato
   para que sean rastreables con `rg "TODO\[Sprint"`.

## Comandos

```bash
npm install                       # deps
npm run dev                       # dev server (http://localhost:5173)
npm run build                     # build prod
npm run typecheck                 # tsc --noEmit
npm run lint                      # eslint
npm run format                    # prettier

npx supabase start                # postgres local en docker
npx supabase db reset             # aplica migrations + corre seeds
npx supabase db push              # sube migrations al remoto vinculado
npm run supabase:gen:types        # regenera src/types/database.ts

npm run bootstrap:users           # crea 3 usuarios FIATCOIN (script scripts/bootstrap-users.ts)
```

## Estructura

Ver `README.md` para tree completo. Resumen:

- `src/` — front (App, components, hooks, lib, pages, types, styles)
- `supabase/migrations/0001..0005` — schema completo con RLS
- `supabase/seed/` — datos demo FIATCOIN (no inventados; vienen de los Excel/docx originales)
- `supabase/functions/motor-pld/` — Edge Function (stub para Sprint D-3)
- `scripts/` — utilidades (bootstrap usuarios, etc.)
- `docs/` — ARCHITECTURE, ROLES, MOTOR_PLD, SPRINT_D1_BACKLOG

## Por dónde empezar (Sprint D-1)

Lee `docs/SPRINT_D1_BACKLOG.md`. Ese archivo tiene los bloques ordenados por
dependencias, cada uno con criterio de aceptación y validación.

**Bloque actual recomendado**: D1.B1 — Levantar el entorno local (migrations + seeds
+ bootstrap de usuarios + dev server arriba con login funcional).

## Lo que NO va al demo (postpónlo si te lo piden)

- Integración real con Moffin (mock visible queda hasta Sprint post-demo).
- IA de revisión del manual PLD (sprint posterior dedicado).
- Envío real al portal SPPLD del SAT (solo descarga JSON en el demo).
- Análisis on-chain real (mock hasta contrato con Chainalysis/TRM/Elliptic).
- Listas OFAC/ONU en tiempo real (snapshot en BD versionado por ahora).
- Los otros 5 sectores AV (IV, V, VII, VIII, XV) — modelo de datos los soporta,
  pero plantillas y tipologías quedan para después del demo.

## Cuando termines un bloque

1. `npm run typecheck && npm run lint && npm run build` → todo verde.
2. Si tocaste schema: documentar la migration y regenerar types.
3. Smoke notes breves: qué construiste, qué probaste, qué dejaste TODO.
4. Reporta al usuario y espera checkpoint antes del siguiente bloque.

## Cuando algo te genere duda

Pregunta. No improvises:
- Si un campo no está en seed ni en docs → pregunta.
- Si una regla no está en metodología FIATCOIN → pregunta.
- Si una decisión de UX no está documentada en `docs/` → pregunta.
- Si dudas sobre la separación de funciones Operador/OC/Admin → relee `docs/ROLES.md`.

## Referencias externas (en la carpeta de proyectos del usuario, NO en este repo)

- `Yoltik Desarrollos/Ikan-Arquitectura-Roadmap-v0.1-2026-05-23.docx` — arquitectura general
- `Yoltik Desarrollos/Ikan-Demo-Decisiones-y-Plan-v0.1-2026-05-23.docx` — decisiones de arranque
- `Yoltik Desarrollos/Ikan-Demo-Motor-PLD-y-Tipologias-v0.3-2026-05-23.docx` — modelo Motor PLD (vigente)
- Excel/docx originales de FIATCOIN — la fuente de verdad de la metodología

## Versiones de documentos

El documento vigente del modelo es **v0.3** (Motor PLD y tipologías por AV). El v0.2
(Roles y walkthrough) sigue siendo válido en lo que toca a roles y separación de
funciones, pero su Acto 2 del walkthrough quedó reescrito en v0.3. El v0.1 quedó
superseded por completo.
```
---END FILE---

---FILE: docs/CODE_BRIEF.md---
```markdown
# Brief para Claude Code — primera sesión sobre Ikán

> **Cómo usar este archivo:** copia el bloque de abajo y pégalo como primer mensaje
> cuando abras este repo con `claude` en la terminal. El bloque está pensado para
> que Code arranque con el contexto correcto sin tener que escarbar el repo entero.

---

## Bloque para pegar en Code

```text
Hola. Estoy trabajando en Ikán, la plataforma de cumplimiento PLD de Yoltik (operada
por Kawiil). Este es un proyecto largo y vamos a hacerlo bloque por bloque con
checkpoint, sin acumular cambios.

Antes de proponer nada, lee en este orden:
  1. CLAUDE.md (contexto, convenciones, comandos, modelo operativo Operador→Motor→OC)
  2. docs/SPRINT_D1_BACKLOG.md (backlog ordenado por bloques con criterios de aceptación)
  3. README.md (estructura del repo y quick start)

Reglas duras:
  - No inventes campos, valores, umbrales ni algoritmos. Si algo no está en
    metodología FIATCOIN, en seeds, en docs/ o en código existente: pregunta.
  - No instales librerías nuevas sin avisar y justificar.
  - No hagas git commit ni git push automáticamente. Yo decido cuándo se commitea.
  - Bloque por bloque con checkpoint. Al cerrar un bloque, corre:
        npm run typecheck && npm run lint && npm run build
    y reporta resultado antes de empezar el siguiente.
  - Mocks visibles (Moffin, listas en tiempo real, on-chain, SAT real) con banner
    ámbar "DEMO — sin integración real". Nunca silencioso.
  - Brand Yoltik v3: Navy / Jade / Mint / Ámbar, tipografía Sora. Sin Yoli en UI ni docs.
  - UI en español de México.

Arranquemos con el bloque D1.B1 — Levantar entorno local. Sigue los pasos del
backlog. Cuando termines (dev server arriba, BD con seeds, 3 usuarios FIATCOIN
creados), reporta y espera mi visto bueno para D1.B2.

Si algo del setup local tropieza, NO intentes "arreglar" tocando código del repo
hasta que entiendas la causa. Reporta primero el error exacto.
```

---

## Notas operativas para ti, Polo

### Cómo abrir el repo con Code

```bash
cd ~/Documents/Claude/Projects/Yoltik\ Desarrollos/ikan-app
claude
```

Pegas el bloque de arriba. Code lee `CLAUDE.md` y se contextualiza solo.

### Cómo manejar la conversación

- **Pídele que arranque un bloque específico** del backlog (ej. "vamos con D1.B2").
  El backlog está ordenado por dependencias.
- **Si algo se le va de las manos**, pídele que pare y resuma qué hizo antes de
  continuar.
- **Si propone instalar una librería nueva**, pregúntale por qué y qué alternativas
  hay; el stack está cerrado.
- **Al final de cada bloque**, pídele las "smoke notes" — qué construyó, qué probó,
  qué dejó pendiente.

### Comandos que verás mucho

```bash
npm install                       # primera vez
npm run dev                       # mientras desarrollas
npm run typecheck                 # antes de cerrar bloque
npm run lint
npm run build

npx supabase start                # postgres local
npx supabase db reset             # aplica migrations + corre seeds (perderás datos locales)
npm run supabase:gen:types        # cada vez que toques migrations

npm run bootstrap:users           # crear los 3 usuarios FIATCOIN tras db reset
```

### Si el repo crece y necesitas que Code lea menos de inicio

Edita `CLAUDE.md` para dejar solo lo crítico, y mueve detalle a `docs/`. Code leerá
lo que tú apuntes desde `CLAUDE.md`. Mientras menos contexto inicial, más rápido
arranca.

### Cuándo conviene abrir una nueva sesión de Code

- Cuando cierres un sprint completo (D-1, D-2, D-3).
- Cuando hayas estado más de 2 horas en una sesión y el contexto esté saturado.
- Cuando cambies de foco mayor (ej. de front a Edge Function).

### Cuándo NO interrumpir a Code

- Mientras está aplicando una migration o corriendo build. Espera al output.
- Mientras está explicando un diff que acaba de generar (déjalo terminar para que
  el siguiente paso quede bien marcado).

### Cuando un bloque cierre limpio

Sugiere al Code el mensaje de commit (formato `D1.Bn: descripción`) pero TÚ
ejecutas `git commit` y `git push`. Esa es regla dura.

---

## Si Code propone algo que se sale del modelo

Recuerda los pilares (en orden de importancia):

1. **Modelo lineal** Operador → Motor PLD → OC. NO hay revisión humana cruzada.
2. **Catálogo unificado** para los 6 sectores AV, pero el demo arranca con XVI.
3. **3 roles con separación de funciones** y `pending_approvals` para Admin → OC.
4. **Mocks visibles**, nada silencioso.
5. **No inventar campos** — la fuente es la metodología FIATCOIN.

Si una propuesta de Code rompe alguno, dile que se detenga y reformule.
```
---END FILE---

---FILE: docs/SPRINT_D1_BACKLOG.md---
```markdown
# Sprint D-1 · Backlog ordenado

> Cada bloque (D1.Bn) cierra con checkpoint antes de pasar al siguiente.
> Si terminas un bloque, ejecuta:
> `npm run typecheck && npm run lint && npm run build`
> y reporta al usuario antes de seguir.

## D1.B1 · Levantar entorno local

**Objetivo**: tener el dev server arriba, BD con migrations + seeds aplicados, y los
3 usuarios FIATCOIN creados.

**Pasos**:
1. `npm install`
2. `cp .env.example .env.local` y editar con credenciales
3. `npx supabase start`
4. `npx supabase db reset` (aplica migrations + corre seeds)
5. `npm run supabase:gen:types`
6. `npm run bootstrap:users` (crea operador@, oc@, admin@ con sus roles)
7. `npm run dev`

**Criterio de aceptación**:
- `http://localhost:5173` muestra el login.
- En el dashboard de Supabase Studio (`http://localhost:54323`), las tablas
  `organizations`, `tipologia_av`, `country_risk_list` están pobladas.
- `select * from v_user_roles_simple` devuelve 3 usuarios con roles asignados.

**Smoke**:
- Login con `oc@fiatcoin.mx` redirige a `/oc` (Motor PLD dashboard).
- Login con `operador@fiatcoin.mx` redirige a `/operador`.
- Login con `admin@fiatcoin.mx` redirige a `/admin`.
- El selector "Operando como" aparece para `oc@fiatcoin.mx` (tiene oc + admin).

**Checkpoint con Polo antes de seguir.**

---

## D1.B2 · Auth real con roles desde BD

**Objetivo**: reemplazar el placeholder de `auth-context.tsx` que devuelve siempre
`['operador']` por query real a `user_profile + user_roles`.

**Archivos a tocar**:
- `src/lib/auth-context.tsx` — implementar `loadProfile` real.
- `src/types/database.ts` — regenerar con `npm run supabase:gen:types` después de
  validar que las migrations estén aplicadas.

**Implementación**:
```typescript
// en loadProfile() de AuthProvider
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
- `oc@fiatcoin.mx` puede cambiar entre OC y Admin desde el switcher.
- Logout funciona y devuelve a `/login`.

**Smoke**:
- TypeScript compila limpio (`npm run typecheck`).
- Cambiar de rol en el switcher cambia el sidebar y la pantalla activa.

---

## D1.B3 · Bitácora — escribir entradas

**Objetivo**: que cada acción relevante (login, role-switch, captura) deje entrada
en `audit_log` con el rol activo.

**Archivos**:
- Crear `src/lib/audit.ts` con `logAuditEntry({ accion, recurso_tipo, recurso_id, antes, despues })`.
- Llamar desde `auth-context.tsx` (al login y logout).
- Llamar desde el `RoleSwitcher` al cambiar de rol.

**Schema ya soporta** (migration 0001). Solo es implementación del cliente.

**Criterio de aceptación**:
- `select * from audit_log order by ts desc limit 10` muestra entradas de los
  últimos eventos de prueba.
- Cada entrada lleva `rol_activo` poblado correctamente.

---

## D1.B4 · Onboarding wizard de organización (admin-only)

**Objetivo**: pantalla de alta de organización (solo accesible para Admin, que en
demo es el primer usuario). Aunque FIATCOIN ya está seedada, este wizard sirve para
demos donde se quiere mostrar cómo se onboarda un sujeto obligado nuevo.

**Archivos a crear**:
- `src/pages/admin/OnboardingOrganizacion.tsx` — formulario 3 pasos:
  1. Datos generales (RFC, razón social, sectores, oficio SAT, fecha alta).
  2. Datos del Oficial de Cumplimiento (designado y suplente).
  3. Confirmación + creación.
- `src/lib/api/organizations.ts` — `createOrganization()` + `assignDesignadoOC()`.

**Validaciones**:
- RFC con regex MX (12 PM / 13 PF).
- Sectores: array de `sector_av` enum.
- Fecha alta SAT no futura.

**Criterio de aceptación**:
- Admin puede crear una segunda organización en el demo (ej. una org de prueba).
- La organización queda con metodología EBR auto-importada del sector elegido
  (si es XVI, clona la plantilla FIATCOIN; si es otro sector, queda vacía con
  banner "Configurar metodología").

---

## D1.B5 · Listado y detalle de metodología EBR (admin)

**Objetivo**: que el Admin pueda ver la metodología EBR cargada con sus 5 Elementos,
indicadores, pesos y mitigantes.

**Archivos a crear**:
- `src/pages/admin/Metodologia.tsx` — listado + detalle expandible por elemento.
- `src/lib/api/risk-methodology.ts` — `listMethodologies()`, `getMethodologyTree(id)`.

**Vista**:
- Encabezado con apetito de riesgo, frecuencia, versión.
- Tabla por Elemento: peso, impacto, riesgo inherente calculado, riesgo residual calculado.
- Expand: indicadores del elemento con peso, nivel inherente, mitigantes.

**Cálculo**:
- Reutilizar fórmulas documentadas en `docs/MOTOR_PLD.md` § 3.4 del v0.3.
- Crear `src/lib/risk-engine.ts` con `computeMethodology(tree)`.

**Criterio de aceptación**:
- Para FIATCOIN, la vista debe mostrar:
  - Riesgo institucional inherente y residual calculados.
  - Clasificación final (Bajo / Medio / Alto) coincidente con el archivo Excel original.
- TypeScript limpio.

---

## D1.B6 · Editor de metodología EBR con flujo de aprobación

**Objetivo**: que el Admin pueda editar pesos, impactos, niveles y mitigantes. Cada
cambio cae en `pending_approvals` y el OC lo aprueba.

**Archivos a crear**:
- `src/pages/admin/MetodologiaEditor.tsx`.
- `src/pages/oc/Aprobaciones.tsx` — bandeja del OC.
- `src/lib/api/pending-approvals.ts`.

**Flujo**:
1. Admin modifica un campo → al guardar, se crea entrada en `pending_approvals` con
   `tipo_recurso='metodologia'` y el diff en `payload`.
2. UI muestra banner "Cambio pendiente de aprobación".
3. OC abre `/oc/aprobaciones`, ve el diff, aprueba o rechaza con motivo.
4. Al aprobar: si OC = Admin, queda registrado "auto-firmado por OC/Admin"; si no,
   queda con `aprobado_por = oc_user_id`.
5. Al aprobar, la metodología pasa a una nueva versión (`version + 1`) y la
   anterior queda con `activa_hasta = today`.

**Criterio de aceptación**:
- Modificar un peso e ir a aprobaciones muestra el cambio.
- Aprobar incrementa versión y deja entrada en `audit_log`.
- `select count(*) from risk_methodology` aumenta en 1 tras la aprobación.

---

## D1.B7 · Listado de tipologías por AV (admin)

**Objetivo**: que el Admin vea las 8 tipologías XVI seedeadas con su `regla_dsl`.

**Archivos**:
- `src/pages/admin/Tipologias.tsx`.
- `src/lib/api/tipologias.ts`.

**Vista**:
- Listado con código, nombre, severidad, versión, activa, fuente.
- Click → modal con `regla_dsl` formateado (JSON con sintaxis highlighting básico).
- Solo lectura en este bloque; editor entra en Sprint D-2.

**Criterio de aceptación**:
- Muestra XVI-01..XVI-08 con todos los datos del seed.
- Click en XVI-01 muestra el JSON declarativo de la regla.

---

## D1.B8 · Gestión de usuarios y roles (admin)

**Objetivo**: que el Admin pueda crear/desactivar usuarios y asignar roles desde la
UI, sin tocar el dashboard de Supabase.

**Archivos**:
- `src/pages/admin/Usuarios.tsx`.
- `src/lib/api/users.ts` — `inviteUser({ email, nombre, roles })`,
  `updateUserRoles(user_id, roles)`, `deactivateUser(user_id)`.

**Implementación**:
- Usar `supabase.auth.admin.inviteUserByEmail()` (requiere service role; vive en
  una Edge Function porque el cliente NO debe tener service role).
- Crear Edge Function `supabase/functions/admin-users/index.ts` que valida que el
  caller tiene rol admin y hace la operación.

**Criterio de aceptación**:
- Admin invita a `nuevo-operador@fiatcoin.mx` con rol operador.
- El email recibe el link de Supabase y al confirmar entra al sistema.
- Admin puede desactivar el usuario (RLS lo bloquea de toda lectura).

---

## D1.B9 · Smoke test del Sprint D-1

**Objetivo**: end-to-end manual de todo lo construido.

**Checklist**:
- [ ] Los 3 usuarios pueden hacer login con 2FA TOTP.
- [ ] El sidebar muestra solo las opciones de su rol.
- [ ] El usuario con OC + Admin puede cambiar de rol y la pantalla cambia.
- [ ] Admin puede crear una nueva organización.
- [ ] Admin ve la metodología EBR FIATCOIN con cálculos correctos.
- [ ] Admin edita un peso y el cambio queda pendiente de aprobación.
- [ ] OC aprueba el cambio y la versión sube.
- [ ] Admin lista las 8 tipologías XVI con su regla_dsl visible.
- [ ] Admin invita a un usuario nuevo y le asigna rol.
- [ ] Bitácora muestra entradas con `rol_activo` correcto.
- [ ] `npm run build` corre limpio.
- [ ] `npm run typecheck` corre limpio.
- [ ] `npm run lint` con 0 warnings.

**Si todo verde**: Sprint D-1 cerrado. Abrir Sprint D-2.

---

## Lo que NO entra en Sprint D-1 (espera Sprint D-2 / D-3)

- Vista del Operador funcional (alta de cliente, captura de operación). **D-2.**
- KYC mock con Moffin (modal con banner). **D-2.**
- Editor visual de tipologías con regla_dsl. **D-2.**
- Editor de catálogos (países, entidades, señales). **D-2.**
- Motor PLD funcional (evaluadores de regla_dsl). **D-3.**
- Hallazgos del motor + flujo de confirmación OC. **D-3.**
- Generación de borradores de aviso 24h y mensual. **D-3.**

---

## Notas para Claude Code mientras trabaja

- **No instales librerías nuevas sin avisar.** El stack está cerrado en
  `package.json`. Si necesitas una, propónla con justificación.
- **No hagas commit ni push automáticamente.** Polo decide cuándo se commitea.
  Cuando un bloque cierre limpio, sugiere un mensaje de commit pero NO lo ejecutes.
- **Patrón de commit sugerido**: `D1.Bn: <descripción corta>` (alineado al backlog).
- **Si encuentras inconsistencias entre CLAUDE.md y el código**, levanta la mano
  antes de "corregir" — puede ser intencional.
- **Si necesitas ver los Excel/docx originales de FIATCOIN**, pídeselos a Polo;
  viven en su carpeta de proyectos, no en este repo.
```
---END FILE---

---FILE: docs/ARCHITECTURE.md---
```markdown
# Arquitectura · Ikán

## Vista lógica — Fase 1 (Sprint D-1 a D-3)

```
[Usuario]
   ↓
[Front Vercel (Vite + React + TS)]
   ↓                  ↓
[Supabase Auth   ][Supabase Postgres]
[(2FA TOTP)      ][(RLS por org y rol)]
                       ↓
                  [Edge Functions]
                       ↓
                  [motor-pld]  →  evalúa tipologías, crea hallazgos, genera avisos
```

## Decisiones clave

1. **Sector piloto**: XVI (Activos Virtuales). Seed = FIATCOIN.
2. **Catálogo unificado**: el motor es uno solo; cada AV trae su set de tipologías.
3. **Fase 1 monolito-funcional**: el front consume Supabase directo. Fase 2 (post-demo) introducirá API REST propia.
4. **3 roles**: Operador, OC, Admin. Un usuario puede acumular roles. RLS discrimina por rol.
5. **Motor PLD nombrado**: módulo con identidad propia, panel propio y ciclo configurar → aprobar → ejecutar → entregar.
6. **Tipologías por AV** como entidad de primer orden (regla_dsl en JSONB, versionadas, aprobadas por OC).

## Multi-tenancy

- 1 organización = 1 sujeto obligado.
- Una organización puede tener varios sectores (en BD el sector vive a nivel de operación y metodología, no de organización).
- Todas las tablas core llevan `organization_id` y se protegen con RLS via `current_org_id()`.

## Separación de funciones

| Acción técnica                      | Quién la hace               | Aprobación                  |
| ----------------------------------- | --------------------------- | --------------------------- |
| Editar metodología EBR              | Admin                       | OC firma vía pending_approvals |
| Editar tipologías por AV            | Admin                       | OC firma vía pending_approvals |
| Editar catálogos                    | Admin                       | OC firma vía pending_approvals |
| Marcar Inusual / Preocupante        | OC                          | —                           |
| Generar y firmar Aviso              | OC                          | —                           |
| Capturar cliente y operación        | Operador (o cualquier rol)  | —                           |

Cuando OC = Admin, la aprobación es auto-firma pero queda registrada en bitácora.

## Mocks visibles (no romper)

- Moffin (KYC): modal con banner ámbar "DEMO".
- Listas en tiempo real OFAC/ONU: snapshot en BD versionado.
- Análisis on-chain: tipología XVI-03 lee mock `blockchain_analytics_mock`.
- Envío real al SAT: solo descarga JSON, no envía.
```
---END FILE---

---FILE: docs/ROLES.md---
```markdown
# Roles y permisos · Ikán

Tres roles operativos. Un usuario puede acumular roles (típicamente OC + Admin).

## Operador

- Vende u opera. Captura clientes y operaciones. **Su flujo termina con el acuse.**
- Ve solo lo que él capturó.
- No ve alertas/hallazgos/avisos. No es notificado por el OC.

## Oficial de Cumplimiento (OC)

- Consume las bandejas del Motor PLD: operaciones identificadas, hallazgos por tipología,
  avisos por firmar, clientes Alto pendientes DDR.
- Marca Inusual/Preocupante. Firma avisos.
- Aprueba (no edita) cambios técnicos propuestos por el Admin (metodología, tipologías,
  catálogos, reglas).

## Administrador

- Configura el motor: gestiona usuarios y roles, edita metodología EBR, edita tipologías
  por AV, edita catálogos y reglas.
- Sus cambios pasan por **aprobación del OC** en `pending_approvals` antes de quedar
  vigentes.
- Si OC = Admin, auto-firma pero queda registrado en bitácora.

## Matriz de permisos resumida

| Acción                                              | Operador | OC  | Admin |
| --------------------------------------------------- | -------- | --- | ----- |
| Dar de alta cliente / capturar operación            | Sí       | Sí  | Sí    |
| Ver lista completa de operaciones de la org         | Solo suyas | Sí | Sí  |
| Ver y resolver hallazgos                            | No       | Sí  | Si=OC |
| Marcar Inusual / Preocupante                        | No       | Sí  | Si=OC |
| Generar y descargar Aviso 24h / mensual             | No       | Sí  | Si=OC |
| Aprobar DDR de cliente Alto                         | No       | Sí  | Si=OC |
| Crear / desactivar usuarios                         | No       | Si=Admin | Sí |
| Editar metodología EBR                              | No       | Aprobar | Editar |
| Editar tipologías por AV                            | No       | Aprobar | Editar |
| Editar catálogos                                    | No       | Aprobar | Editar |
| Editar reglas y umbrales                            | No       | Aprobar | Editar |
| Ver bitácora completa de la organización            | Solo suyas | Sí | Sí |

## RLS — cómo se aplica

- Todas las tablas core usan `current_org_id()` (lee de `user_profile.organization_id`)
  + `has_rol('rol')` (lee de `user_roles`) para discriminar acceso.
- El Operador solo ve filas con `capturado_por = auth.uid()` en `client`, `operation` y
  vistas relacionadas.
- El OC y el Admin ven toda la org.
- Solo el Admin escribe en tablas de configuración (metodología, tipologías, catálogos).
- Solo el OC actualiza estado de hallazgos y avisos.
- Solo el OC resuelve `pending_approvals`.

## Selector de rol activo

Cuando un usuario tiene varios roles, el topbar muestra un selector "Operando como".
La elección persiste en `localStorage`. La bitácora registra el rol activo en cada
acción para que la auditoría pueda diferenciar.
```
---END FILE---

---FILE: docs/MOTOR_PLD.md---
```markdown
# Motor PLD · Cómo funciona

## Concepto

El Motor PLD procesa cada operación automáticamente y produce **hallazgos** cuando una
**tipología** dispara. El OC consume hallazgos; no revisa la captura del Operador.

```
[Operador captura] → [Motor PLD] → [OC consume bandejas del motor]
```

## Entidades

- **tipologia_av**: catálogo de reglas por sector y organización, con `regla_dsl` declarativa,
  versionadas, aprobadas por OC.
- **hallazgo**: salida del motor. Lleva snapshot inmutable de la tipología al momento del disparo.
- **motor_run**: registro de cada ejecución (cuándo, sobre qué, con qué versión, qué produjo).
- **operation.requiere_aviso**: bandera que el motor actualiza al identificar operaciones.
- **aviso**: borrador del aviso UIF (24h o mensual) que el motor arma.

## Formato de regla_dsl

Cada tipología tiene un `tipo` y parámetros propios. Tipos soportados en Sprint D-3:

### `agregado` — contar / sumar dentro de una ventana

```json
{
  "tipo": "agregado",
  "ventana": "72h",
  "agrupar_por": "client_id",
  "condicion": {
    "count": { "op": ">=", "valor": 3 },
    "suma_monto_uma": { "op": ">=", "valor": 645 }
  }
}
```

Ejemplo: **XVI-01 Structuring** — 3+ operaciones de mismo cliente en 72h que sumen ≥645 UMA.

### `secuencia` — eventos en orden dentro de una ventana

```json
{
  "tipo": "secuencia",
  "ventana": "24h",
  "secuencia": ["deposito_fiat", "retiro_cripto"],
  "condicion": { "razon_retiro_saldo": { "op": ">=", "valor": 0.9 } }
}
```

Ejemplo: **XVI-02 Layering** — depósito fiat seguido de retiro >=90% del saldo en 24h.

### `score` — score externo (ej. blockchain analytics)

```json
{
  "tipo": "score",
  "fuente": "blockchain_analytics_mock",
  "condicion": {
    "exposicion_pct": { "op": ">", "valor": 10 },
    "categorias": ["mixer", "ofac_sdn", "ransomware", "darknet"]
  }
}
```

Ejemplo: **XVI-03 Exposición on-chain**.

### `lookup` — coincidencia con catálogo

```json
{
  "tipo": "lookup",
  "campo": "contraparte.pais_iso2",
  "fuentes": ["gafi_negra", "gafi_gris", "ofac_sancionado", "onu"]
}
```

Ejemplo: **XVI-04 País de alto riesgo**.

### `duplicado` — varias entidades con campo coincidente

```json
{
  "tipo": "duplicado",
  "campos": ["device_id", "ip", "biometric_hash"],
  "umbral_cuentas": 2
}
```

Ejemplo: **XVI-05 Smurfing**.

### `desviacion` — fuera de perfil

```json
{
  "tipo": "desviacion",
  "factor": 3.0,
  "comparar": "promedio_historico_mensual"
}
```

Ejemplo: **XVI-07 Fuera de perfil**.

## Ciclo de configuración

1. Admin propone (alta o cambio de tipología) → inserta en `pending_approvals`.
2. OC revisa, aprueba (firma) o rechaza con motivo.
3. Al aprobar, la tipología nueva entra con `version += 1` y `aprobada_por_oc_en` poblado.
4. Las versiones anteriores quedan; el motor opera con la versión vigente, pero los hallazgos
   ya existentes conservan el snapshot de la versión que aplicaba en su momento.

## Idempotencia

`hallazgo` tiene constraint único sobre `(operation_id, tipologia_id, tipologia_version)`. Si
se vuelve a correr el motor sobre el mismo dataset, no duplica hallazgos.

## Trazabilidad

Cada hallazgo guarda en `regla_payload` los datos exactos que cumplieron la regla. Esto
permite auditar después por qué disparó, con los valores del momento.

## Cómo se invoca

- Post-insert en `operation`: trigger lambda o RPC `invoke_motor_pld(op_id)`.
- Manual: botón en panel del OC "Recorrer motor sobre operaciones del mes".
- Cron: para reglas agregadas que dependen de ventanas grandes.
```
---END FILE---

---FILE: docs/claude-code-settings.md---
```markdown
# Configuración recomendada de Claude Code para este repo

Cuando abras el repo con Code, la primera vez puedes crear el archivo
`.claude/settings.json` (Code te preguntará permisos individualmente para cada
comando hasta que lo configures). Para evitar la pregunta cada vez, copia este
contenido:

## Pasos

```bash
mkdir -p .claude
cat > .claude/settings.json <<'EOF'
{
  "permissions": {
    "allow": [
      "Bash(npm install)",
      "Bash(npm install --save-dev:*)",
      "Bash(npm run dev)",
      "Bash(npm run build)",
      "Bash(npm run typecheck)",
      "Bash(npm run lint)",
      "Bash(npm run format)",
      "Bash(npm run bootstrap:users)",
      "Bash(npm run supabase:*)",
      "Bash(npx tsx:*)",
      "Bash(npx supabase:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git branch:*)"
    ],
    "deny": [
      "Bash(git push:*)",
      "Bash(git commit:*)",
      "Bash(rm -rf:*)",
      "Bash(npx supabase db reset --linked:*)"
    ]
  }
}
EOF
```

## Por qué cada bloque

**`allow`**: comandos seguros del día a día. Code podrá ejecutarlos sin pedirte
permiso cada vez (te ahorra clicks).

**`deny`**:
- `git commit` y `git push` — TÚ decides cuándo se commitea, no Code.
- `rm -rf` — evita borrados accidentales recursivos.
- `supabase db reset --linked` — el `--linked` aplica al proyecto remoto y
  perdería datos en producción. El reset local (`supabase db reset` sin flag) sí
  está permitido.

## Si después quieres permitir git commit

Edita `.claude/settings.json` y mueve `"Bash(git commit:*)"` de `deny` a `allow`.
Recomiendo mantenerlo en `deny` mientras la metodología sea bloque-por-bloque,
porque obliga a verificar cada cambio antes de commitearlo.

---

## Extensiones recomendadas de VS Code / Cursor / Code

Si trabajas el repo desde VS Code o Cursor en paralelo, crea `.vscode/extensions.json`:

```bash
mkdir -p .vscode
cat > .vscode/extensions.json <<'EOF'
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-azuretools.vscode-docker",
    "supabase.vscode-supabase-extension",
    "denoland.vscode-deno",
    "anthropic.claude-code"
  ]
}
EOF
```
```
---END FILE---

---

## Chunk 3 — SCHEMA (Supabase migrations + config + Edge Function stub)

**Objetivo**: dejar el schema completo en el repo. Quien corre `supabase db reset`
es Polo en su Mac local.

**Archivos**: todos `[CREATE]`.

**Cierre del Chunk 3** (lo corre Polo en su Mac):

```bash
git pull
npx supabase start
npx supabase db reset
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" \
     -c "select tablename from pg_tables where schemaname='public' order by tablename;"
```

Polo confirma que las 20+ tablas existen.


---FILE: supabase/config.toml---
```toml
# Supabase config para Ikán
# Vincular con `supabase link --project-ref <REF>` después de crear el proyecto.

project_id = "ikan-app"

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
site_url = "http://localhost:5173"
additional_redirect_urls = ["http://localhost:5173"]
jwt_expiry = 3600
enable_signup = false  # Solo el Admin crea usuarios. No hay registro público.

[auth.email]
enable_signup = false
enable_confirmations = true

[auth.mfa]
max_enrolled_factors = 1
```
---END FILE---

---FILE: supabase/migrations/0001_initial_schema.sql---
```sql
-- =====================================================================
-- Ikán · Migration 0001 · Schema base (orgs, users, roles, RLS, bitácora)
-- =====================================================================
-- Documentación de referencia:
--   - docs/ARCHITECTURE.md (esta carpeta)
--   - Yoltik Desarrollos/Ikan-Demo-Motor-PLD-y-Tipologias-v0.3-2026-05-23.docx
-- =====================================================================

-- Extensiones útiles
create extension if not exists "pgcrypto" with schema public;

-- =====================================================================
-- ENUMs de dominio
-- =====================================================================
create type sector_av as enum ('IV', 'V', 'VII', 'VIII', 'XV', 'XVI');
create type rol_usuario as enum ('operador', 'oc', 'admin');
create type tipo_persona as enum ('fisica', 'moral');
create type clasificacion_riesgo as enum ('bajo', 'medio', 'alto', 'alto_oficio');
create type nivel_kyc as enum ('N1', 'N2', 'N3');
create type severidad_tipologia as enum ('baja', 'media', 'alta', 'critica');
create type estado_hallazgo as enum (
  'abierto', 'en_revision', 'confirmado_inusual',
  'confirmado_preocupante', 'descartado', 'falso_positivo'
);
create type tipo_aviso as enum ('24h', 'mensual');
create type estado_aviso as enum ('borrador', 'listo_firma', 'enviado', 'acusado');
create type estado_aprobacion as enum ('pendiente', 'aprobada', 'rechazada');

-- =====================================================================
-- Organizaciones (sujetos obligados)
-- =====================================================================
create table organizations (
  id uuid primary key default gen_random_uuid(),
  rfc text not null unique,
  razon_social text not null,
  sectores sector_av[] not null default '{}',
  oficio_alta_sat text,
  fecha_alta_sat date,
  representante_legal text,
  domicilio_fiscal text,
  creada_en timestamptz not null default now(),
  creada_por uuid references auth.users(id)
);
comment on table organizations is 'Sujetos obligados / clientes de Ikán';

-- =====================================================================
-- Perfiles de usuario + roles (muchos-a-muchos)
-- =====================================================================
create table user_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete restrict,
  nombre text not null,
  email text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
comment on table user_profile is 'Perfil de usuario ligado a auth.users';

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profile(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  rol rol_usuario not null,
  otorgado_por uuid references auth.users(id),
  otorgado_en timestamptz not null default now(),
  unique (user_id, organization_id, rol)
);
comment on table user_roles is 'Roles que un usuario tiene dentro de una organización';

create index idx_user_roles_user on user_roles(user_id);
create index idx_user_roles_org on user_roles(organization_id);

-- =====================================================================
-- Aprobaciones pendientes (Admin propone → OC aprueba)
-- =====================================================================
create table pending_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  tipo_recurso text not null,            -- 'metodologia' | 'tipologia' | 'catalogo' | 'regla'
  recurso_id uuid,                       -- ID del recurso afectado (puede ser null si es alta)
  payload jsonb not null,                -- snapshot del cambio propuesto
  estado estado_aprobacion not null default 'pendiente',
  solicitado_por uuid not null references auth.users(id),
  solicitado_en timestamptz not null default now(),
  resuelto_por uuid references auth.users(id),
  resuelto_en timestamptz,
  motivo text                            -- opcional, sobre todo si se rechaza
);
comment on table pending_approvals is 'Cola de cambios técnicos que el OC debe aprobar';

create index idx_pending_approvals_org on pending_approvals(organization_id);
create index idx_pending_approvals_estado on pending_approvals(estado);

-- =====================================================================
-- Bitácora de auditoría
-- =====================================================================
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  actor uuid references auth.users(id),
  rol_activo rol_usuario,
  accion text not null,                  -- 'create' | 'update' | 'delete' | 'sign' | 'login' | 'role-switch' | ...
  recurso_tipo text not null,            -- 'cliente' | 'operacion' | 'hallazgo' | 'aviso' | ...
  recurso_id uuid,
  antes jsonb,
  despues jsonb,
  ip inet,
  user_agent text,
  ts timestamptz not null default now()
);
comment on table audit_log is 'Bitácora trazable de toda acción relevante';

create index idx_audit_org_ts on audit_log(organization_id, ts desc);
create index idx_audit_recurso on audit_log(recurso_tipo, recurso_id);

-- =====================================================================
-- Helpers de seguridad (RLS)
-- =====================================================================

-- Devuelve la organization_id del usuario actual (asume 1 org por user en demo)
create or replace function public.current_org_id()
returns uuid
language sql stable security definer
as $$
  select organization_id
  from user_profile
  where id = auth.uid()
  limit 1
$$;

-- Devuelve true si el usuario actual tiene un rol específico en su org
create or replace function public.has_rol(target_rol rol_usuario)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1
    from user_roles ur
    where ur.user_id = auth.uid()
      and ur.organization_id = public.current_org_id()
      and ur.rol = target_rol
  )
$$;

-- =====================================================================
-- RLS policies
-- =====================================================================
alter table organizations enable row level security;
alter table user_profile enable row level security;
alter table user_roles enable row level security;
alter table pending_approvals enable row level security;
alter table audit_log enable row level security;

-- organizations: usuario solo ve la suya
create policy "org_select_own" on organizations
  for select using (id = public.current_org_id());

-- user_profile: solo usuarios de la misma org
create policy "user_profile_select_same_org" on user_profile
  for select using (organization_id = public.current_org_id());

create policy "user_profile_insert_admin" on user_profile
  for insert with check (
    organization_id = public.current_org_id() and public.has_rol('admin')
  );

create policy "user_profile_update_admin_or_self" on user_profile
  for update using (
    id = auth.uid() or (organization_id = public.current_org_id() and public.has_rol('admin'))
  );

-- user_roles: visible misma org; solo Admin escribe
create policy "user_roles_select_same_org" on user_roles
  for select using (organization_id = public.current_org_id());

create policy "user_roles_write_admin" on user_roles
  for all using (
    organization_id = public.current_org_id() and public.has_rol('admin')
  );

-- pending_approvals: Admin escribe propuestas; OC y Admin leen; OC resuelve
create policy "pending_select_oc_admin" on pending_approvals
  for select using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

create policy "pending_insert_admin" on pending_approvals
  for insert with check (
    organization_id = public.current_org_id() and public.has_rol('admin')
  );

create policy "pending_update_oc" on pending_approvals
  for update using (
    organization_id = public.current_org_id() and public.has_rol('oc')
  );

-- audit_log: misma org (insert lo hace el server via SECURITY DEFINER)
create policy "audit_select_same_org" on audit_log
  for select using (organization_id = public.current_org_id());

-- =====================================================================
-- Vistas auxiliares
-- =====================================================================
create or replace view v_user_roles_simple as
  select up.id as user_id, up.nombre, up.email, up.organization_id,
         coalesce(array_agg(ur.rol order by ur.rol) filter (where ur.rol is not null), '{}') as roles
  from user_profile up
  left join user_roles ur on ur.user_id = up.id
  group by up.id;
```
---END FILE---

---FILE: supabase/migrations/0002_risk_methodology.sql---
```sql
-- =====================================================================
-- Ikán · Migration 0002 · Metodología EBR (institucional) y matriz de cliente
-- =====================================================================
-- Generaliza el EBR FIATCOIN. Ver memoria [[metodologia-ebr-fiatcoin]] y
-- el archivo Excel "Metodologia EBR - FIATCOIN RAMPLE.xlsx" para la fuente.
-- =====================================================================

-- Metodología (versionada por organización)
create table risk_methodology (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  sector sector_av not null,
  version int not null default 1,
  apetito_riesgo clasificacion_riesgo not null default 'medio',
  frecuencia_revision text not null default 'anual',
  activa_desde date not null default current_date,
  activa_hasta date,
  notas text,
  creada_por uuid references auth.users(id),
  creada_en timestamptz not null default now(),
  unique (organization_id, sector, version)
);

create table risk_element (
  id uuid primary key default gen_random_uuid(),
  methodology_id uuid not null references risk_methodology(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  peso numeric(5,4) not null check (peso >= 0 and peso <= 1),
  impacto_pct numeric(5,2) not null check (impacto_pct >= 0 and impacto_pct <= 100),
  orden int not null default 0,
  unique (methodology_id, codigo)
);

create table risk_indicator (
  id uuid primary key default gen_random_uuid(),
  element_id uuid not null references risk_element(id) on delete cascade,
  codigo text not null,
  variable text not null,
  indicador text not null,
  peso numeric(5,4) not null check (peso >= 0 and peso <= 1),
  nivel_inherente int not null check (nivel_inherente between 1 and 3),
  orden int not null default 0,
  unique (element_id, codigo)
);

create table risk_mitigant (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references risk_indicator(id) on delete cascade,
  descripcion text not null,
  factor numeric(5,4) not null check (factor >= 0 and factor <= 1)
);

-- =====================================================================
-- Plantilla de matriz de riesgo del cliente (por sector)
-- =====================================================================
-- La plantilla define las preguntas del formulario de captura para el
-- Operador. El score y la clasificación se calculan al guardar.
-- =====================================================================
create table client_risk_template (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  sector sector_av not null,
  version int not null default 1,
  configuracion jsonb not null,
  -- estructura sugerida:
  -- {
  --   "elementos": [
  --     {
  --       "codigo": "PRODUCTOS_SERVICIOS",
  --       "nombre": "Productos y Servicios",
  --       "variables": [
  --         {
  --           "codigo": "PROD-01",
  --           "pregunta": "...",
  --           "opciones": [
  --             { "valor": 1, "label": "Bajo: ..." },
  --             { "valor": 2, "label": "Medio: ..." },
  --             { "valor": 3, "label": "Alto: ..." }
  --           ]
  --         }
  --       ]
  --     }
  --   ],
  --   "escala_cliente": {
  --     "bajo":   { "min": 15, "max": 22 },
  --     "medio":  { "min": 23, "max": 30 },
  --     "alto":   { "min": 31, "max": 39 }
  --   },
  --   "triggers_alto_de_oficio": [
  --     { "codigo": "OFAC_SDN", "descripcion": "Coincidencia OFAC SDN" },
  --     { "codigo": "PEP_FED",  "descripcion": "PEP federal MX" },
  --     ...
  --   ]
  -- }
  activa boolean not null default true,
  creada_en timestamptz not null default now(),
  unique (organization_id, sector, version)
);

-- =====================================================================
-- RLS
-- =====================================================================
alter table risk_methodology enable row level security;
alter table risk_element enable row level security;
alter table risk_indicator enable row level security;
alter table risk_mitigant enable row level security;
alter table client_risk_template enable row level security;

create policy "methodology_select_same_org" on risk_methodology
  for select using (organization_id = public.current_org_id());

create policy "methodology_write_admin" on risk_methodology
  for all using (organization_id = public.current_org_id() and public.has_rol('admin'));

create policy "element_select_via_methodology" on risk_element
  for select using (
    exists (select 1 from risk_methodology m
            where m.id = element_id and m.organization_id = public.current_org_id())
  );

create policy "element_write_admin" on risk_element
  for all using (
    public.has_rol('admin')
    and exists (select 1 from risk_methodology m
                where m.id = element_id and m.organization_id = public.current_org_id())
  );

create policy "indicator_select_via_element" on risk_indicator
  for select using (
    exists (
      select 1 from risk_element e
      join risk_methodology m on m.id = e.methodology_id
      where e.id = element_id and m.organization_id = public.current_org_id()
    )
  );

create policy "indicator_write_admin" on risk_indicator
  for all using (
    public.has_rol('admin')
    and exists (
      select 1 from risk_element e
      join risk_methodology m on m.id = e.methodology_id
      where e.id = element_id and m.organization_id = public.current_org_id()
    )
  );

create policy "mitigant_select_via_indicator" on risk_mitigant
  for select using (
    exists (
      select 1 from risk_indicator i
      join risk_element e on e.id = i.element_id
      join risk_methodology m on m.id = e.methodology_id
      where i.id = indicator_id and m.organization_id = public.current_org_id()
    )
  );

create policy "mitigant_write_admin" on risk_mitigant
  for all using (
    public.has_rol('admin')
    and exists (
      select 1 from risk_indicator i
      join risk_element e on e.id = i.element_id
      join risk_methodology m on m.id = e.methodology_id
      where i.id = indicator_id and m.organization_id = public.current_org_id()
    )
  );

create policy "template_select_same_org" on client_risk_template
  for select using (organization_id = public.current_org_id());

create policy "template_write_admin" on client_risk_template
  for all using (organization_id = public.current_org_id() and public.has_rol('admin'));
```
---END FILE---

---FILE: supabase/migrations/0003_catalogos.sql---
```sql
-- =====================================================================
-- Ikán · Migration 0003 · Catálogos (países, entidades MX, listas)
-- =====================================================================
-- Catálogos versionados por organización. Vienen seedados con los
-- datos de FIATCOIN (Lista negra/gris GAFI 02/2025, OFAC, paraísos, etc.)
-- y son editables por el Admin con aprobación del OC.
-- =====================================================================

create type fuente_lista as enum (
  'gafi_negra', 'gafi_gris', 'ofac_sancionado', 'onu', 'paraiso_fiscal_mx',
  'entidad_alta_mx', 'entidad_media_mx', 'entidad_baja_mx',
  'pep_nacional', 'pep_extranjero', 'manual'
);

create table country_risk_list (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  iso2 text not null check (length(iso2) = 2),
  nombre text not null,
  nivel int not null check (nivel between 1 and 3),
  fuente fuente_lista not null,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  notas text,
  unique (organization_id, iso2, fuente, vigente_desde)
);

create table entity_risk_list (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  entidad text not null,
  nivel int not null check (nivel between 1 and 3),
  fuente fuente_lista not null,
  notas text,
  unique (organization_id, entidad, fuente)
);

create table alerta_on_chain_signal (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  codigo text not null,
  descripcion text not null,
  activa boolean not null default true,
  unique (organization_id, codigo)
);

create table sanctions_list_entry (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  fuente fuente_lista not null,
  tipo_entidad text not null,             -- 'persona' | 'organizacion' | 'wallet'
  identificador text not null,            -- nombre, alias, dirección wallet
  metadata jsonb,
  agregado_en timestamptz not null default now()
);

-- RLS
alter table country_risk_list enable row level security;
alter table entity_risk_list enable row level security;
alter table alerta_on_chain_signal enable row level security;
alter table sanctions_list_entry enable row level security;

create policy "country_list_select_same_org" on country_risk_list
  for select using (organization_id = public.current_org_id());
create policy "country_list_write_admin" on country_risk_list
  for all using (organization_id = public.current_org_id() and public.has_rol('admin'));

create policy "entity_list_select_same_org" on entity_risk_list
  for select using (organization_id = public.current_org_id());
create policy "entity_list_write_admin" on entity_risk_list
  for all using (organization_id = public.current_org_id() and public.has_rol('admin'));

create policy "onchain_select_same_org" on alerta_on_chain_signal
  for select using (organization_id = public.current_org_id());
create policy "onchain_write_admin" on alerta_on_chain_signal
  for all using (organization_id = public.current_org_id() and public.has_rol('admin'));

create policy "sanctions_select_same_org" on sanctions_list_entry
  for select using (organization_id = public.current_org_id());
create policy "sanctions_write_admin" on sanctions_list_entry
  for all using (organization_id = public.current_org_id() and public.has_rol('admin'));
```
---END FILE---

---FILE: supabase/migrations/0004_clientes_operaciones.sql---
```sql
-- =====================================================================
-- Ikán · Migration 0004 · Clientes finales y operaciones
-- =====================================================================

create table client (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  tipo_persona tipo_persona not null,
  nombre_razon_social text not null,
  curp text,
  rfc text,
  nacionalidad text,
  entidad_federativa text,
  pais_residencia_iso2 text,
  datos_kyc jsonb not null default '{}',     -- documentos, liveness, biometría, etc.
  datos_kyb jsonb,                            -- Persona Moral
  beneficiario_controlador jsonb,
  nivel_kyc nivel_kyc not null default 'N1',
  alto_de_oficio boolean not null default false,
  triggers_oficio text[] not null default '{}',
  moffin_case_id text,                        -- mock en demo
  activo boolean not null default true,
  capturado_por uuid references auth.users(id),
  capturado_en timestamptz not null default now()
);
comment on table client is 'Cliente final / usuario del sujeto obligado';

create index idx_client_org on client(organization_id);
create index idx_client_capturado_por on client(capturado_por);

-- Evaluación de riesgo del cliente (snapshot al momento de evaluar)
create table client_risk_assessment (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client(id) on delete cascade,
  template_id uuid not null references client_risk_template(id),
  respuestas jsonb not null,                 -- { "PROD-01": 2, "CLI-PF-01": 1, ... }
  subtotales jsonb not null,                 -- { "PRODUCTOS_SERVICIOS": 3, "CLIENTE": 8, ... }
  score_total int not null,
  clasificacion clasificacion_riesgo not null,
  evaluado_por uuid references auth.users(id),
  evaluado_en timestamptz not null default now(),
  motivo_alto_de_oficio text
);

create index idx_assessment_client on client_risk_assessment(client_id);

-- Operaciones
create type tipo_operacion as enum (
  'compra_fiat_cripto', 'venta_cripto_fiat', 'retiro_cripto', 'deposito_fiat', 'otro'
);

create table operation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete restrict,
  tipo tipo_operacion not null,
  monto_mxn numeric(14,2) not null check (monto_mxn >= 0),
  moneda_origen text not null default 'MXN',
  activo_virtual text,                       -- 'USDC', 'BTC', 'ETH', etc.
  contraparte jsonb,                         -- wallet destino, beneficiario, etc.
  fecha timestamptz not null default now(),

  -- Producidos por el Motor PLD:
  requiere_aviso boolean not null default false,
  identificada_en timestamptz,               -- cuándo el motor la identificó
  motor_version_aplicada int,

  capturado_por uuid references auth.users(id),
  capturado_en timestamptz not null default now()
);

create index idx_operation_org_fecha on operation(organization_id, fecha desc);
create index idx_operation_client on operation(client_id);
create index idx_operation_capturado_por on operation(capturado_por);
create index idx_operation_requiere_aviso on operation(organization_id, requiere_aviso) where requiere_aviso = true;

-- =====================================================================
-- RLS
-- =====================================================================
alter table client enable row level security;
alter table client_risk_assessment enable row level security;
alter table operation enable row level security;

-- Operador ve solo lo que él capturó. OC y Admin ven toda la org.
create policy "client_select" on client
  for select using (
    organization_id = public.current_org_id()
    and (
      public.has_rol('oc') or public.has_rol('admin')
      or (public.has_rol('operador') and capturado_por = auth.uid())
    )
  );

create policy "client_insert" on client
  for insert with check (
    organization_id = public.current_org_id()
    and (public.has_rol('operador') or public.has_rol('oc') or public.has_rol('admin'))
    and capturado_por = auth.uid()
  );

create policy "client_update_oc_admin" on client
  for update using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

create policy "assessment_select" on client_risk_assessment
  for select using (
    exists (select 1 from client c
            where c.id = client_id and c.organization_id = public.current_org_id()
              and (
                public.has_rol('oc') or public.has_rol('admin')
                or (public.has_rol('operador') and c.capturado_por = auth.uid())
              ))
  );

create policy "assessment_insert" on client_risk_assessment
  for insert with check (
    exists (select 1 from client c
            where c.id = client_id and c.organization_id = public.current_org_id())
  );

create policy "operation_select" on operation
  for select using (
    organization_id = public.current_org_id()
    and (
      public.has_rol('oc') or public.has_rol('admin')
      or (public.has_rol('operador') and capturado_por = auth.uid())
    )
  );

create policy "operation_insert" on operation
  for insert with check (
    organization_id = public.current_org_id()
    and (public.has_rol('operador') or public.has_rol('oc') or public.has_rol('admin'))
    and capturado_por = auth.uid()
  );

create policy "operation_update_motor_or_oc" on operation
  for update using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );
```
---END FILE---

---FILE: supabase/migrations/0005_motor_pld.sql---
```sql
-- =====================================================================
-- Ikán · Migration 0005 · Motor PLD (tipologías por AV, hallazgos, runs)
-- =====================================================================
-- Modelo central del producto. Una tipología es una regla parametrizada
-- en `regla_dsl` (JSONB declarativo) que el motor evalúa contra operaciones
-- y su contexto. Cuando dispara, genera un `hallazgo` con snapshot.
-- =====================================================================

create table tipologia_av (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  sector sector_av not null,
  codigo text not null,                       -- 'XVI-01', 'XVI-02', etc.
  nombre text not null,
  descripcion text not null,
  regla_dsl jsonb not null,                   -- ver formato en docs/MOTOR_PLD.md
  severidad severidad_tipologia not null,
  activa boolean not null default true,
  version int not null default 1,
  fuente text,                                -- cita normativa o de guía
  aprobada_por_oc_en timestamptz,
  aprobada_por_oc uuid references auth.users(id),
  creada_en timestamptz not null default now(),
  unique (organization_id, sector, codigo, version)
);

create index idx_tipologia_org_sector on tipologia_av(organization_id, sector) where activa = true;

-- Hallazgo: salida del motor cuando dispara una tipología
create table hallazgo (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  operation_id uuid references operation(id) on delete set null,
  client_id uuid references client(id) on delete set null,

  -- Snapshot de la tipología en el momento del disparo (inmutable)
  tipologia_id uuid not null references tipologia_av(id),
  tipologia_codigo text not null,
  tipologia_nombre text not null,
  tipologia_version int not null,
  severidad severidad_tipologia not null,

  regla_payload jsonb not null,               -- datos exactos que cumplieron la regla

  estado estado_hallazgo not null default 'abierto',
  asignado_a uuid references auth.users(id),
  resolucion text,
  resuelto_por uuid references auth.users(id),
  resuelto_en timestamptz,

  aviso_id uuid,                              -- si el OC genera aviso, se enlaza acá

  creado_en timestamptz not null default now(),

  unique (operation_id, tipologia_id, tipologia_version)
);

create index idx_hallazgo_org_estado on hallazgo(organization_id, estado);
create index idx_hallazgo_op on hallazgo(operation_id);

-- Cada ejecución del motor queda registrada
create table motor_run (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  trigger_tipo text not null,                 -- 'on_insert' | 'manual' | 'cron'
  triggered_by uuid references auth.users(id),
  operaciones_procesadas int not null default 0,
  hallazgos_creados int not null default 0,
  duracion_ms int,
  metadata jsonb,
  ts timestamptz not null default now()
);

create index idx_motor_run_org_ts on motor_run(organization_id, ts desc);

-- Avisos UIF
create table aviso (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  tipo tipo_aviso not null,
  periodo text,                               -- '2026-05' para mensuales
  payload jsonb not null,                     -- JSON listo para Portal SPPLD
  hallazgo_ids uuid[] not null default '{}',  -- para 24h, hallazgos que lo motivan
  estado estado_aviso not null default 'borrador',
  generado_por uuid references auth.users(id),
  generado_en timestamptz not null default now(),
  firmado_por uuid references auth.users(id),
  firmado_en timestamptz,
  acuse jsonb
);

create index idx_aviso_org_periodo on aviso(organization_id, tipo, periodo);

-- =====================================================================
-- RLS
-- =====================================================================
alter table tipologia_av enable row level security;
alter table hallazgo enable row level security;
alter table motor_run enable row level security;
alter table aviso enable row level security;

create policy "tipologia_select" on tipologia_av
  for select using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

create policy "tipologia_write_admin" on tipologia_av
  for all using (
    organization_id = public.current_org_id() and public.has_rol('admin')
  );

create policy "hallazgo_select_oc_admin" on hallazgo
  for select using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

create policy "hallazgo_update_oc" on hallazgo
  for update using (
    organization_id = public.current_org_id() and public.has_rol('oc')
  );

create policy "motor_run_select_oc_admin" on motor_run
  for select using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

create policy "aviso_select_oc_admin" on aviso
  for select using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

create policy "aviso_update_oc" on aviso
  for update using (
    organization_id = public.current_org_id() and public.has_rol('oc')
  );
```
---END FILE---

---FILE: supabase/functions/motor-pld/index.ts---
```typescript
// =====================================================================
// Edge Function · motor-pld
// =====================================================================
// El Motor PLD evalúa las tipologías activas contra las operaciones de
// una organización y genera hallazgos. Es idempotente: si se vuelve a
// correr no duplica hallazgos (constraint operation_id+tipologia_id+version).
//
// Se invoca por:
//   - Trigger automático tras insert en `operation` (vía DB trigger o queue)
//   - Botón "Recorrer motor" en el panel del OC
//   - Cron diario para reglas agregadas (volumen mensual, etc.)
//
// Sprint D-3: aquí se implementan los evaluadores por tipo de regla_dsl.
// Sprint D-1/D-2: este stub deja claro el contrato y los pasos.
// =====================================================================

// @ts-expect-error — Deno runtime, no Node.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// @ts-expect-error — Deno runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error — Deno runtime
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RunInput {
  organization_id: string;
  trigger_tipo: 'on_insert' | 'manual' | 'cron';
  operation_id?: string; // si se evalúa una sola operación
}

interface ReglaDsl {
  tipo: 'agregado' | 'secuencia' | 'score' | 'lookup' | 'duplicado' | 'desviacion';
  [key: string]: unknown;
}

// @ts-expect-error — Deno.serve
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const input: RunInput = await req.json();
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const t0 = Date.now();

  // 1. Cargar tipologías activas de la org
  const { data: tipologias, error: errTips } = await supabase
    .from('tipologia_av')
    .select('*')
    .eq('organization_id', input.organization_id)
    .eq('activa', true);

  if (errTips) {
    return new Response(JSON.stringify({ error: errTips.message }), { status: 500 });
  }

  // 2. Cargar operaciones a evaluar
  let opQuery = supabase
    .from('operation')
    .select('*, client:client_id(*)')
    .eq('organization_id', input.organization_id);
  if (input.operation_id) opQuery = opQuery.eq('id', input.operation_id);
  const { data: operaciones, error: errOps } = await opQuery;
  if (errOps) {
    return new Response(JSON.stringify({ error: errOps.message }), { status: 500 });
  }

  // 3. Evaluar cada tipología contra cada operación
  // TODO[Sprint D-3]: implementar evaluadores por tipo de regla_dsl.
  // Por ahora, stub que solo escribe el motor_run sin generar hallazgos.
  // Estructura prevista:
  //   - evaluadores: Record<ReglaDsl['tipo'], (op, ctx) => boolean | { matched, payload }>
  //   - para cada op × tipologia: si dispara, insert hallazgo (idempotente)
  //   - actualizar operation.requiere_aviso si supera umbral
  //   - reconstruir borradores de aviso del periodo

  const hallazgos_creados = 0;
  const duracion_ms = Date.now() - t0;

  // 4. Registrar la ejecución
  await supabase.from('motor_run').insert({
    organization_id: input.organization_id,
    trigger_tipo: input.trigger_tipo,
    operaciones_procesadas: operaciones?.length ?? 0,
    hallazgos_creados,
    duracion_ms,
    metadata: {
      tipologias_evaluadas: tipologias?.length ?? 0,
      stub: 'Sprint D-3 implementará evaluadores reales',
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      operaciones_procesadas: operaciones?.length ?? 0,
      hallazgos_creados,
      duracion_ms,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
});

export {};
```
---END FILE---

---

## Chunk 4 — DATA (seeds FIATCOIN)

**Objetivo**: seeds con los datos reales de FIATCOIN.

**Archivos**: todos `[CREATE]`.

**Cierre del Chunk 4** (Polo en su Mac):

```bash
npx supabase db reset   # vuelve a correr migrations + seeds
psql "$DB_URL" -c "select rfc, razon_social from organizations;"
psql "$DB_URL" -c "select codigo, severidad from tipologia_av order by codigo;"
psql "$DB_URL" -c "select count(*) from country_risk_list;"
psql "$DB_URL" -c "select score_total, clasificacion from client_risk_assessment;"
```


---FILE: supabase/seed/seed.sql---
```sql
-- =====================================================================
-- Ikán · Entrypoint de seeds
-- =====================================================================
-- Aplica todos los seeds en orden. Ejecutar después de las migrations.
--
-- Localmente:
--   supabase db reset    (corre migrations + ejecuta seed.sql automáticamente)
--
-- Manualmente:
--   psql $SUPABASE_DB_URL -f supabase/seed/seed.sql
--
-- ORDEN:
--   1. Organización (FIATCOIN)
--   2. Metodología EBR XVI
--   3. Tipologías XVI (catálogo del motor)
--   4. Catálogos auxiliares (países GAFI/OFAC, entidades MX, señales on-chain)
--   5. Plantilla matriz de cliente XVI
--   6. Cliente Juan Pérez Ejemplo (demo)
-- =====================================================================

\i 01_organization_fiatcoin.sql
\i 02_metodologia_ebr_xvi.sql
\i 03_tipologias_xvi.sql
\i 04_catalogos_paises_entidades.sql
\i 05_plantilla_matriz_cliente_xvi.sql
\i 06_juan_perez_demo.sql
```
---END FILE---

---FILE: supabase/seed/01_organization_fiatcoin.sql---
```sql
-- =====================================================================
-- Seed · FIATCOIN RAMPLE como organización demo
-- =====================================================================
-- Datos derivados de "Metodologia PLD-FT - FIATCOIN RAMPLE.docx".
-- Antes de aplicar este seed en producción, obtener consentimiento explícito
-- del cliente para usar su info como datos demo de Ikán.
-- =====================================================================

insert into organizations (id, rfc, razon_social, sectores, oficio_alta_sat,
                           fecha_alta_sat, representante_legal, domicilio_fiscal)
values (
  '11111111-1111-1111-1111-111111111111',
  'FRA250514B41',
  'FIATCOIN RAMPLE, S.A. DE C.V.',
  ARRAY['XVI']::sector_av[],
  '600-07-01-00-2025-2068',
  '2025-12-10',
  'Leopoldo Bassoco Nova',
  'Calle Tuxpan No. 63, Interior 402, Colonia Roma Sur, Cuauhtémoc, CDMX, C.P. 06760'
)
on conflict (rfc) do update set
  razon_social = excluded.razon_social,
  sectores = excluded.sectores;
```
---END FILE---

---FILE: supabase/seed/02_metodologia_ebr_xvi.sql---
```sql
-- =====================================================================
-- Seed · Metodología EBR sector XVI (FIATCOIN)
-- =====================================================================
-- Valores exactos del archivo "Metodologia EBR - FIATCOIN RAMPLE.xlsx".
-- 5 Elementos con pesos institucionales, sus indicadores con peso interno,
-- nivel inherente y mitigantes (factor de reducción).
-- =====================================================================

-- Metodología
insert into risk_methodology (id, organization_id, sector, version,
                              apetito_riesgo, frecuencia_revision, notas)
values (
  '22222222-2222-2222-2222-222222222201',
  '11111111-1111-1111-1111-111111111111',
  'XVI', 1, 'medio', 'anual',
  'Metodología EBR base FIATCOIN — Activos Virtuales (Art. 17 fr. XVI LFPIORPI).'
)
on conflict (organization_id, sector, version) do nothing;

-- ============================
-- ELEMENTO 1 — Productos y Servicios (peso 0.25, impacto 75%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E1_PRODUCTOS',
          'Productos y Servicios', 0.25, 75, 1)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E1-01', 'On/off ramp (fiat⇄cripto)', 'Anonimato o falta de identificación del Usuario', 0.35::numeric, 2, 1),
  ('E1-02', 'On/off ramp (fiat⇄cripto)', 'Producto que facilita la transferencia de valor', 0.40::numeric, 3, 2),
  ('E1-03', 'On/off ramp (fiat⇄cripto)', 'Manipulación de grandes volúmenes de recursos', 0.25::numeric, 3, 3)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;

-- ============================
-- ELEMENTO 2 — Tipos de Usuario (peso 0.20, impacto 50%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E2_USUARIO',
          'Tipos de Usuario', 0.20, 50, 2)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E2-01', 'Persona Física', 'Tipo de persona', 0.15::numeric, 2, 1),
  ('E2-02', 'Persona Física', 'Edad', 0.10::numeric, 2, 2),
  ('E2-03', 'Persona Física', 'Nacionalidad', 0.15::numeric, 2, 3),
  ('E2-04', 'Persona Física', 'Ocupación / actividad económica', 0.15::numeric, 2, 4),
  ('E2-05', 'Persona Física', 'Identificados en listas PEPs o bloqueados', 0.20::numeric, 3, 5),
  ('E2-06', 'Persona Moral', 'Antigüedad / tipo de sociedad / BC', 0.15::numeric, 3, 6),
  ('E2-07', 'Persona Moral', 'Beneficiario Controlador (transparencia)', 0.10::numeric, 3, 7)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;

-- ============================
-- ELEMENTO 3 — Países y Áreas Geográficas (peso 0.10, impacto 45%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E3_PAISES',
          'Países y Áreas Geográficas', 0.10, 45, 3)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E3-01', 'Países (contraparte externa)', 'Regímenes fiscales preferentes', 0.15::numeric, 2, 1),
  ('E3-02', 'Países (contraparte externa)', 'Medidas deficientes en LD/FT (GAFI)', 0.15::numeric, 3, 2),
  ('E3-03', 'Países (contraparte externa)', 'Alto nivel de corrupción', 0.10::numeric, 2, 3),
  ('E3-04', 'Países (contraparte externa)', 'Alto nivel de delincuencia', 0.15::numeric, 3, 4),
  ('E3-05', 'Países (contraparte externa)', 'Sancionados OFAC/ONU', 0.15::numeric, 3, 5),
  ('E3-06', 'Áreas geográficas nacionales (México)', 'Entidades de incidencia delictiva alta', 0.15::numeric, 3, 6),
  ('E3-07', 'Áreas geográficas nacionales (México)', 'Entidades con frontera y puertos internacionales', 0.15::numeric, 2, 7)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;

-- ============================
-- ELEMENTO 4 — Canales (peso 0.15, impacto 55%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E4_CANALES',
          'Canales de contratación, fondeo y retiro', 0.15, 55, 4)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E4-01', 'Alta no presencial (web/app)', 'Canales no presenciales', 0.30::numeric, 3, 1),
  ('E4-02', 'SPEI fiat in/out', 'Acceso inmediato a recursos', 0.25::numeric, 3, 2),
  ('E4-03', 'Retiro on-chain', 'Canales que permiten operaciones por montos altos', 0.25::numeric, 3, 3),
  ('E4-04', 'Retiro on-chain', 'Canales con exposición a wallets externas / cripto-nativas', 0.20::numeric, 3, 4)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;

-- ============================
-- ELEMENTO 5 — Transacciones (peso 0.30, impacto 70%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E5_TRANSACCIONES',
          'Transacciones (calibrado con Ops 2025)', 0.30, 70, 5)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E5-01', 'Compra fiat→cripto', 'Monto de las transacciones (ticket promedio)', 0.20::numeric, 2, 1),
  ('E5-02', 'Compra fiat→cripto', 'Volumen mensual acumulado', 0.20::numeric, 2, 2),
  ('E5-03', 'Venta cripto→fiat', 'Frecuencia transaccional', 0.15::numeric, 2, 3),
  ('E5-04', 'Compra + venta', 'Origen de las transacciones (fiat in)', 0.15::numeric, 2, 4),
  ('E5-05', 'Compra + venta', 'Destino de las transacciones (cripto out)', 0.15::numeric, 3, 5),
  ('E5-06', 'Compra + venta', 'Exposición on-chain (mixers, sanctioned, darknet)', 0.15::numeric, 3, 6)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;
```
---END FILE---

---FILE: supabase/seed/03_tipologias_xvi.sql---
```sql
-- =====================================================================
-- Seed · Tipologías sector XVI (Activos Virtuales)
-- =====================================================================
-- 8 tipologías derivadas de la metodología FIATCOIN y de las señales de
-- alerta UIF para activos virtuales (Anexo D de la metodología PLD-FT).
-- Cada `regla_dsl` es declarativa: el Motor PLD las interpreta sin código.
-- =====================================================================

insert into tipologia_av (id, organization_id, sector, codigo, nombre, descripcion,
                          regla_dsl, severidad, version, fuente)
values
  -- XVI-01 Structuring
  ('33333333-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-01', 'Structuring (fraccionamiento)',
   'Al menos 3 operaciones del mismo cliente en 72 horas cuya suma alcance o supere 645 UMA.',
   '{
      "tipo": "agregado",
      "ventana": "72h",
      "agrupar_por": "client_id",
      "condicion": {
        "count": { "op": ">=", "valor": 3 },
        "suma_monto_uma": { "op": ">=", "valor": 645 }
      }
    }'::jsonb,
   'alta', 1, 'UIF Guía 24h · ENR 2023 · Guía señales LD/FT'),

  -- XVI-02 Layering
  ('33333333-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-02', 'Layering (retiro inmediato post-fondeo)',
   'Retiro on-chain >= 90% del saldo dentro de 24 horas posteriores a fondeo fiat.',
   '{
      "tipo": "secuencia",
      "ventana": "24h",
      "secuencia": ["deposito_fiat", "retiro_cripto"],
      "condicion": { "razon_retiro_saldo": { "op": ">=", "valor": 0.9 } }
    }'::jsonb,
   'alta', 1, 'GAFI Recomendación 15 · Anexo D Metodología FIATCOIN'),

  -- XVI-03 Exposición on-chain
  ('33333333-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-03', 'Exposición on-chain a mixers o sanctioned',
   'Wallet contraparte con exposición > 10% a Tornado Cash, ChipMixer, OFAC SDN, ransomware o darknet.',
   '{
      "tipo": "score",
      "fuente": "blockchain_analytics_mock",
      "condicion": {
        "exposicion_pct": { "op": ">", "valor": 10 },
        "categorias": ["mixer", "ofac_sdn", "ransomware", "darknet"]
      }
    }'::jsonb,
   'critica', 1, 'Anexo D · señales on-chain UIF'),

  -- XVI-04 Operación con país de alto riesgo
  ('33333333-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-04', 'Operación con país de alto riesgo',
   'Origen o destino en lista negra/gris GAFI o sancionado OFAC/ONU.',
   '{
      "tipo": "lookup",
      "campo": "contraparte.pais_iso2",
      "fuentes": ["gafi_negra", "gafi_gris", "ofac_sancionado", "onu"]
    }'::jsonb,
   'critica', 1, 'GAFI 02/2025 · OFAC · ONU consolidada'),

  -- XVI-05 Smurfing por dispositivo / biometría
  ('33333333-0000-0000-0000-000000000005',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-05', 'Smurfing por dispositivo o biometría',
   'Dos o más cuentas con coincidencia de device_id, IP o biometría facial.',
   '{
      "tipo": "duplicado",
      "campos": ["device_id", "ip", "biometric_hash"],
      "umbral_cuentas": 2
    }'::jsonb,
   'alta', 1, 'Señales de alerta UIF · estructuración'),

  -- XVI-06 VPN / Tor sistemática
  ('33333333-0000-0000-0000-000000000006',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-06', 'Uso sistemático de VPN o Tor',
   'Cinco o más accesos del cliente desde IPs de VPN/Tor conocidas en el mes.',
   '{
      "tipo": "agregado",
      "ventana": "1M",
      "agrupar_por": "client_id",
      "condicion": { "count_ip_anonima": { "op": ">=", "valor": 5 } }
    }'::jsonb,
   'media', 1, 'Anexo D · señales on-chain · GAFI 2021 VASPs'),

  -- XVI-07 Operación fuera de perfil
  ('33333333-0000-0000-0000-000000000007',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-07', 'Operación fuera del perfil transaccional',
   'Volumen mensual del cliente > 3x el promedio histórico declarado.',
   '{
      "tipo": "desviacion",
      "factor": 3.0,
      "comparar": "promedio_historico_mensual"
    }'::jsonb,
   'alta', 1, 'Metodología FIATCOIN §6 — perfil transaccional'),

  -- XVI-08 Privacy coins
  ('33333333-0000-0000-0000-000000000008',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-08', 'Uso de privacy coins',
   'Operación con activos virtuales de privacidad (Monero, Zcash shielded, Dash PrivateSend).',
   '{
      "tipo": "lookup",
      "campo": "activo_virtual",
      "valores": ["XMR", "ZEC", "DASH"]
    }'::jsonb,
   'media', 1, 'GAFI Recomendación 15 · Banxico Circular 4/2019')
on conflict (organization_id, sector, codigo, version) do nothing;
```
---END FILE---

---FILE: supabase/seed/04_catalogos_paises_entidades.sql---
```sql
-- =====================================================================
-- Seed · Catálogos auxiliares (países GAFI/OFAC, entidades MX, señales on-chain)
-- =====================================================================
-- Fuentes:
--   - GAFI Lista Negra/Gris (corte febrero 2025)
--   - OFAC países/regiones sancionados
--   - LISR Art. 176 / regla 3.1.15 paraísos fiscales
--   - ENR 2023 + SESNSP para clasificación de entidades MX
-- =====================================================================

-- =================== Países GAFI Lista Negra ===================
insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
values
  ('11111111-1111-1111-1111-111111111111', 'KP', 'Corea del Norte (RPDC)', 3, 'gafi_negra'),
  ('11111111-1111-1111-1111-111111111111', 'IR', 'Irán', 3, 'gafi_negra'),
  ('11111111-1111-1111-1111-111111111111', 'MM', 'Myanmar', 3, 'gafi_negra')
on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

-- =================== Países GAFI Lista Gris (feb 2025) ===================
insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
values
  ('11111111-1111-1111-1111-111111111111', 'DZ', 'Argelia', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'AO', 'Angola', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'BG', 'Bulgaria', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'BF', 'Burkina Faso', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'CM', 'Camerún', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'CI', 'Costa de Marfil', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'HR', 'Croacia', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'CD', 'República Democrática del Congo', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'HT', 'Haití', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'KE', 'Kenia', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'LB', 'Líbano', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'NG', 'Nigeria', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'SY', 'Siria', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'VE', 'Venezuela', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'YE', 'Yemen', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'ZW', 'Zimbabue', 3, 'gafi_gris')
on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

-- =================== Países / regiones sancionadas OFAC ===================
insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
values
  ('11111111-1111-1111-1111-111111111111', 'CU', 'Cuba', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'IR', 'Irán', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'KP', 'Corea del Norte', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'SY', 'Siria', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'BY', 'Bielorrusia', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'VE', 'Venezuela (sectorial)', 3, 'ofac_sancionado')
on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

-- =================== Paraísos fiscales (LISR 176) ===================
insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
values
  ('11111111-1111-1111-1111-111111111111', 'KY', 'Islas Caimán', 3, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'BM', 'Bermudas', 3, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'VG', 'Islas Vírgenes Británicas', 3, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'PA', 'Panamá', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'BZ', 'Belice', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'BS', 'Bahamas', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'SC', 'Seychelles', 3, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'JE', 'Jersey', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'GG', 'Guernsey', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'IM', 'Isla de Man', 2, 'paraiso_fiscal_mx')
on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

-- =================== Entidades MX — riesgo Alto ===================
insert into entity_risk_list (organization_id, entidad, nivel, fuente, notas)
values
  ('11111111-1111-1111-1111-111111111111', 'Baja California', 3, 'entidad_alta_mx', 'Frontera, ENR 2023 + SESNSP'),
  ('11111111-1111-1111-1111-111111111111', 'Chihuahua', 3, 'entidad_alta_mx', 'Frontera, ENR 2023'),
  ('11111111-1111-1111-1111-111111111111', 'Guanajuato', 3, 'entidad_alta_mx', 'Alta incidencia delictiva'),
  ('11111111-1111-1111-1111-111111111111', 'Guerrero', 3, 'entidad_alta_mx', 'Alta incidencia delictiva'),
  ('11111111-1111-1111-1111-111111111111', 'Jalisco', 3, 'entidad_alta_mx', 'Puerto / ruta'),
  ('11111111-1111-1111-1111-111111111111', 'Michoacán', 3, 'entidad_alta_mx', 'Puerto / ruta'),
  ('11111111-1111-1111-1111-111111111111', 'Morelos', 3, 'entidad_alta_mx', 'Incidencia delictiva'),
  ('11111111-1111-1111-1111-111111111111', 'Nuevo León', 3, 'entidad_alta_mx', 'Frontera'),
  ('11111111-1111-1111-1111-111111111111', 'Sonora', 3, 'entidad_alta_mx', 'Frontera'),
  ('11111111-1111-1111-1111-111111111111', 'Tamaulipas', 3, 'entidad_alta_mx', 'Frontera'),
  ('11111111-1111-1111-1111-111111111111', 'Zacatecas', 3, 'entidad_alta_mx', 'Ruta')
on conflict (organization_id, entidad, fuente) do nothing;

-- =================== Entidades MX — riesgo Medio ===================
insert into entity_risk_list (organization_id, entidad, nivel, fuente, notas)
values
  ('11111111-1111-1111-1111-111111111111', 'CDMX', 2, 'entidad_media_mx', 'Riesgo moderado'),
  ('11111111-1111-1111-1111-111111111111', 'Colima', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Puebla', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'San Luis Potosí', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Sinaloa', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Tabasco', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Aguascalientes', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Chiapas', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Oaxaca', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Campeche', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Durango', 2, 'entidad_media_mx', '')
on conflict (organization_id, entidad, fuente) do nothing;

-- =================== Entidades MX — riesgo Bajo ===================
insert into entity_risk_list (organization_id, entidad, nivel, fuente, notas)
values
  ('11111111-1111-1111-1111-111111111111', 'Querétaro', 1, 'entidad_baja_mx', 'Baja incidencia'),
  ('11111111-1111-1111-1111-111111111111', 'Hidalgo', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Nayarit', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Coahuila', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Tlaxcala', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Yucatán', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Baja California Sur', 1, 'entidad_baja_mx', '')
on conflict (organization_id, entidad, fuente) do nothing;

-- =================== Señales on-chain ===================
insert into alerta_on_chain_signal (organization_id, codigo, descripcion)
values
  ('11111111-1111-1111-1111-111111111111', 'MIXER_INTERACTION',  'Interacción directa con mixers / tumblers (Tornado Cash, ChipMixer, Samourai Whirlpool).'),
  ('11111111-1111-1111-1111-111111111111', 'RANSOMWARE_LINKED',  'Direcciones vinculadas a ransomware, darknet markets, stolen funds o hacks reportados.'),
  ('11111111-1111-1111-1111-111111111111', 'OFAC_SDN_WALLET',    'Wallet contraparte en OFAC SDN list.'),
  ('11111111-1111-1111-1111-111111111111', 'IMMEDIATE_WITHDRAW', 'Retiros inmediatos del 100% del saldo a wallets externas después de fondeo fiat.'),
  ('11111111-1111-1111-1111-111111111111', 'STRUCTURED_DEPOSITS','Depósitos fiat estructurados por debajo del umbral 645 UMA con patrón sistemático.'),
  ('11111111-1111-1111-1111-111111111111', 'VPN_FROM_SANCTIONED','IP/dispositivo desde país sancionado OFAC/ONU o VPN sistemática.'),
  ('11111111-1111-1111-1111-111111111111', 'DEVICE_BIOMETRIC_OVERLAP', 'Coincidencia de dispositivo / biometría / INE entre varias cuentas (smurfing).'),
  ('11111111-1111-1111-1111-111111111111', 'EXTORTION_PATTERN',  'Beneficiario o tercero repetido recibe múltiples depósitos pequeños sin relación.'),
  ('11111111-1111-1111-1111-111111111111', 'LOW_CAP_ASSET',      'Operación en activos virtuales de baja capitalización o sin prueba de reservas.'),
  ('11111111-1111-1111-1111-111111111111', 'PROFILE_INCONSISTENT','Volumen inconsistente con perfil declarado (ingresos, ocupación).'),
  ('11111111-1111-1111-1111-111111111111', 'PRIVACY_COINS_ONLY', 'Uso exclusivo de privacy coins (Monero, Zcash shielded, Dash PrivateSend).')
on conflict (organization_id, codigo) do nothing;
```
---END FILE---

---FILE: supabase/seed/05_plantilla_matriz_cliente_xvi.sql---
```sql
-- =====================================================================
-- Seed · Plantilla de matriz de riesgo del cliente (sector XVI)
-- =====================================================================
-- Replica las preguntas de "Matriz de Riesgos Clientes - FIATCOIN RAMPLE.xlsx",
-- hoja Evaluación Cliente. Escala fija 15–39 (Bajo / Medio / Alto).
-- =====================================================================

insert into client_risk_template (id, organization_id, sector, version, configuracion, activa)
values (
  '44444444-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'XVI', 1,
  '{
    "elementos": [
      {
        "codigo": "E1_PRODUCTOS",
        "nombre": "Productos y Servicios",
        "variables": [
          {
            "codigo": "PROD-01",
            "pregunta": "Producto: Compra/venta fiat ⇄ cripto (on/off ramp)",
            "criterio": "Intercambio de activos virtuales",
            "peso": 1,
            "opciones": [
              { "valor": 1, "label": "Bajo: Compra únicamente" },
              { "valor": 2, "label": "Medio: Compra y venta" },
              { "valor": 3, "label": "Alto: Compra, venta y retiro on-chain a wallet externa" }
            ]
          }
        ]
      },
      {
        "codigo": "E2_CLIENTE_PF",
        "nombre": "Persona Física",
        "aplica_si": "tipo_persona == ''fisica''",
        "variables": [
          {
            "codigo": "CLI-PF-01",
            "pregunta": "Listas de bloqueados / PEP",
            "opciones": [
              { "valor": 1, "label": "Sin coincidencia" },
              { "valor": 2, "label": "PEP estatal/municipal" },
              { "valor": 3, "label": "PEP federal o PEP extranjero / OFAC (ALTO DE OFICIO)" }
            ]
          },
          {
            "codigo": "CLI-PF-02",
            "pregunta": "Edad",
            "opciones": [
              { "valor": 1, "label": "51+ años" },
              { "valor": 2, "label": "36–50 años" },
              { "valor": 3, "label": "18–35 años" }
            ]
          },
          {
            "codigo": "CLI-PF-03",
            "pregunta": "Nacionalidad",
            "opciones": [
              { "valor": 1, "label": "Mexicana" },
              { "valor": 2, "label": "Extranjera (país no GAFI)" },
              { "valor": 3, "label": "Extranjera (país GAFI gris/negra)" }
            ]
          },
          {
            "codigo": "CLI-PF-04",
            "pregunta": "Ocupación / Actividad económica",
            "opciones": [
              { "valor": 1, "label": "Empleado formal / asalariado" },
              { "valor": 2, "label": "Profesional independiente" },
              { "valor": 3, "label": "Actividad Vulnerable (Art. 17) o giro en efectivo" }
            ]
          },
          {
            "codigo": "CLI-PF-05",
            "pregunta": "Origen de recursos",
            "opciones": [
              { "valor": 1, "label": "Nómina/salario comprobable" },
              { "valor": 2, "label": "Honorarios/negocio comprobable" },
              { "valor": 3, "label": "Inversiones/herencia sin comprobante sólido" }
            ]
          }
        ]
      },
      {
        "codigo": "E2_CLIENTE_PM",
        "nombre": "Persona Moral",
        "aplica_si": "tipo_persona == ''moral''",
        "variables": [
          {
            "codigo": "CLI-PM-01",
            "pregunta": "Listas bloqueados / PEP (integrantes / BC)",
            "opciones": [
              { "valor": 1, "label": "Sin coincidencia" },
              { "valor": 2, "label": "Integrante con PEP estatal/municipal" },
              { "valor": 3, "label": "Integrante PEP federal / extranjero / OFAC (ALTO DE OFICIO)" }
            ]
          },
          {
            "codigo": "CLI-PM-02",
            "pregunta": "Antigüedad de constitución",
            "opciones": [
              { "valor": 1, "label": "Más de 5 años" },
              { "valor": 2, "label": "Entre 2 y 5 años" },
              { "valor": 3, "label": "Menos de 2 años" }
            ]
          },
          {
            "codigo": "CLI-PM-03",
            "pregunta": "Nacionalidad de la sociedad",
            "opciones": [
              { "valor": 1, "label": "México" },
              { "valor": 2, "label": "Extranjera no GAFI" },
              { "valor": 3, "label": "Extranjera lista gris/negra GAFI o paraíso fiscal" }
            ]
          },
          {
            "codigo": "CLI-PM-04",
            "pregunta": "Actividad económica / giro",
            "opciones": [
              { "valor": 1, "label": "Giro de bajo riesgo" },
              { "valor": 2, "label": "Comercio / servicios con efectivo moderado" },
              { "valor": 3, "label": "Realiza AV (Art. 17) o giro intensivo en efectivo" }
            ]
          },
          {
            "codigo": "CLI-PM-05",
            "pregunta": "Tipo de sociedad o entidad",
            "opciones": [
              { "valor": 1, "label": "Afores / Seguros / Fianzas / Asesores Inv." },
              { "valor": 2, "label": "Casa de cambio / Banca desarrollo / SOCAP / SOFOM" },
              { "valor": 3, "label": "Banca Múltiple / Centros Cambiarios / SOFOMER" }
            ]
          },
          {
            "codigo": "CLI-PM-06",
            "pregunta": "Estructura accionaria (BC)",
            "opciones": [
              { "valor": 1, "label": "BC identificado y único" },
              { "valor": 2, "label": "Estructura 2–5 niveles, todos identificados" },
              { "valor": 3, "label": "Múltiples niveles / fideicomisos / acciones al portador" }
            ]
          }
        ]
      },
      {
        "codigo": "E3_PAISES",
        "nombre": "Países y Áreas Geográficas",
        "variables": [
          {
            "codigo": "PAIS-01",
            "pregunta": "País de residencia fiscal del cliente",
            "opciones": [
              { "valor": 1, "label": "México" },
              { "valor": 2, "label": "Extranjero (no GAFI)" },
              { "valor": 3, "label": "GAFI gris/negra, OFAC/ONU o paraíso fiscal" }
            ]
          },
          {
            "codigo": "PAIS-02",
            "pregunta": "Entidad federativa de domicilio (MX)",
            "opciones": [
              { "valor": 1, "label": "Baja (Querétaro, Hidalgo, BCS, etc.)" },
              { "valor": 2, "label": "Media (CDMX, Colima, Puebla, etc.)" },
              { "valor": 3, "label": "Alta (BC, Chih, Gto, Gro, Jal, Mich, NL, Son, Tamps, Zac, Mor)" }
            ]
          },
          {
            "codigo": "PAIS-03",
            "pregunta": "País contraparte (origen o destino de fondos)",
            "opciones": [
              { "valor": 1, "label": "México" },
              { "valor": 2, "label": "Extranjero (no GAFI)" },
              { "valor": 3, "label": "GAFI, OFAC, paraíso fiscal" }
            ]
          }
        ]
      },
      {
        "codigo": "E4_CANALES",
        "nombre": "Canales de Contratación, Fondeo y Retiro",
        "variables": [
          {
            "codigo": "CAN-01",
            "pregunta": "Canal de alta (KYC)",
            "opciones": [
              { "valor": 1, "label": "Presencial con oficial" },
              { "valor": 2, "label": "No presencial con liveness + biometría + INE/RENAPO" },
              { "valor": 3, "label": "No presencial sin biometría reforzada" }
            ]
          },
          {
            "codigo": "CAN-02",
            "pregunta": "Canal de fondeo en fiat (MXN)",
            "opciones": [
              { "valor": 1, "label": "SPEI desde cuenta a nombre del mismo cliente" },
              { "valor": 2, "label": "SPEI de tercero autorizado (familia/patrón)" },
              { "valor": 3, "label": "Depósito en efectivo / fuentes no rastreables" }
            ]
          },
          {
            "codigo": "CAN-03",
            "pregunta": "Canal de retiro",
            "opciones": [
              { "valor": 1, "label": "SPEI a cuenta del mismo cliente" },
              { "valor": 2, "label": "Retiro cripto a wallet propia declarada" },
              { "valor": 3, "label": "Retiro cripto a wallet externa no declarada" }
            ]
          }
        ]
      },
      {
        "codigo": "E5_TRANSACCIONES",
        "nombre": "Características de las Transacciones",
        "variables": [
          {
            "codigo": "TRX-01",
            "pregunta": "Monto promedio por operación",
            "opciones": [
              { "valor": 1, "label": "< $20,000 MXN (≤ p50)" },
              { "valor": 2, "label": "$20,000 – $75,000 MXN (umbral 645 UMA)" },
              { "valor": 3, "label": "> $75,000 MXN (≥ umbral identificación)" }
            ]
          },
          {
            "codigo": "TRX-02",
            "pregunta": "Volumen mensual acumulado",
            "opciones": [
              { "valor": 1, "label": "< $75,000 MXN" },
              { "valor": 2, "label": "$75,000 – $300,000 MXN" },
              { "valor": 3, "label": "> $300,000 MXN (≥ 4x umbral)" }
            ]
          },
          {
            "codigo": "TRX-03",
            "pregunta": "Frecuencia transaccional",
            "opciones": [
              { "valor": 1, "label": "≤ 5 ops/mes" },
              { "valor": 2, "label": "6–15 ops/mes" },
              { "valor": 3, "label": "> 15 ops/mes" }
            ]
          },
          {
            "codigo": "TRX-04",
            "pregunta": "Origen de las transacciones (fiat in)",
            "opciones": [
              { "valor": 1, "label": "Desde México / cuenta propia" },
              { "valor": 2, "label": "Desde país extranjero no GAFI" },
              { "valor": 3, "label": "Desde país GAFI gris/negra, OFAC o paraíso fiscal" }
            ]
          },
          {
            "codigo": "TRX-05",
            "pregunta": "Destino de retiros (cripto out)",
            "opciones": [
              { "valor": 1, "label": "Wallet del mismo cliente en exchange regulado" },
              { "valor": 2, "label": "Wallet externa propia declarada" },
              { "valor": 3, "label": "Wallet en país sancionado / mixer" }
            ]
          },
          {
            "codigo": "TRX-06",
            "pregunta": "Exposición on-chain (análisis blockchain)",
            "opciones": [
              { "valor": 1, "label": "Sin exposición a wallets de alto riesgo" },
              { "valor": 2, "label": "Exposición indirecta < 10%" },
              { "valor": 3, "label": "Exposición directa a mixers/OFAC" }
            ]
          },
          {
            "codigo": "TRX-07",
            "pregunta": "Tipo de activo virtual operado",
            "opciones": [
              { "valor": 1, "label": "Stablecoin auditada (USDC/USDT) o BTC/ETH" },
              { "valor": 2, "label": "Otros tokens en cadena transparente" },
              { "valor": 3, "label": "Privacy coins (Monero, Zcash shielded, Dash PrivateSend)" }
            ]
          }
        ]
      }
    ],
    "escala_cliente": {
      "bajo":  { "min": 15, "max": 22, "acciones": "Debida Diligencia Simplificada. Monitoreo estándar. Revisión anual." },
      "medio": { "min": 23, "max": 30, "acciones": "Debida Diligencia Estándar. Monitoreo mensual. Revisión semestral." },
      "alto":  { "min": 31, "max": 39, "acciones": "Debida Diligencia Reforzada (DDR). Aprobación escrita OC. Monitoreo continuo. Revisión cada 6 meses." }
    },
    "triggers_alto_de_oficio": [
      { "codigo": "OFAC_SDN", "descripcion": "Coincidencia en lista OFAC SDN" },
      { "codigo": "ONU_CONSOLIDADA", "descripcion": "Coincidencia en lista ONU consolidada" },
      { "codigo": "PEP_FED_MX", "descripcion": "PEP federal mexicano" },
      { "codigo": "PEP_EXTRANJERO", "descripcion": "PEP extranjero" },
      { "codigo": "WALLET_SANCIONADA", "descripcion": "Wallet sancionada (OFAC SDN o ransomware)" },
      { "codigo": "GAFI_NEGRA", "descripcion": "País de residencia o contraparte en lista negra GAFI" }
    ]
  }'::jsonb,
  true
)
on conflict (organization_id, sector, version) do nothing;
```
---END FILE---

---FILE: supabase/seed/06_juan_perez_demo.sql---
```sql
-- =====================================================================
-- Seed · Cliente Juan Pérez Ejemplo (persona ficticia)
-- =====================================================================
-- Cliente final de muestra para el walkthrough del demo.
-- Sus datos no corresponden a ninguna persona real.
-- =====================================================================

insert into client (id, organization_id, tipo_persona, nombre_razon_social,
                    curp, rfc, nacionalidad, entidad_federativa, pais_residencia_iso2,
                    datos_kyc, nivel_kyc, alto_de_oficio, activo)
values (
  '55555555-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'fisica',
  'Juan Pérez Ejemplo (DEMO)',
  'PEJU850101HDFXXX01',
  'PEJU850101ABC',
  'Mexicana',
  'CDMX',
  'MX',
  '{
    "telefono": "+52 55 0000 0000",
    "email": "juan.perez+demo@ejemplo.mx",
    "domicilio": "Calle Demo 123, CDMX",
    "ocupacion": "Empleado formal",
    "origen_recursos": "Nómina"
  }'::jsonb,
  'N1', false, true
)
on conflict (id) do nothing;

-- Evaluación de riesgo precargada (score 17 → Bajo)
insert into client_risk_assessment (client_id, template_id, respuestas, subtotales,
                                    score_total, clasificacion)
values (
  '55555555-0000-0000-0000-000000000001',
  '44444444-0000-0000-0000-000000000001',
  '{
    "PROD-01": 3,
    "CLI-PF-01": 1, "CLI-PF-02": 2, "CLI-PF-03": 1, "CLI-PF-04": 1, "CLI-PF-05": 1,
    "PAIS-01": 1, "PAIS-02": 2, "PAIS-03": 1,
    "CAN-01": 2, "CAN-02": 1, "CAN-03": 2,
    "TRX-01": 1, "TRX-02": 1, "TRX-03": 1, "TRX-04": 1, "TRX-05": 1, "TRX-06": 1, "TRX-07": 1
  }'::jsonb,
  '{
    "E1_PRODUCTOS": 3,
    "E2_CLIENTE": 6,
    "E3_PAISES": 4,
    "E4_CANALES": 5,
    "E5_TRANSACCIONES": 7
  }'::jsonb,
  17,
  'bajo'
);

-- NOTA: este cliente sirve para que el operador pueda capturar operaciones
-- adicionales y para que el Motor PLD tenga contra qué evaluar tipologías.
```
---END FILE---

---

## Chunk 5 — CONFIGS, ENV Y SCRIPTS

**Archivos**:

- `package.json` **[MERGE]**: añadir las dependencias y scripts del bloque de
  abajo a las que YA TENGA el repo. Code reporta el diff antes de aplicar.

  Dependencias a añadir/asegurar:
  ```
  dependencies:
    @supabase/supabase-js: ^2.45.0
    @tanstack/react-query: ^5.51.0
    react-router-dom: ^6.26.0
    zod: ^3.23.8
  devDependencies:
    tsx: ^4.19.0
    @types/node: ^22.5.0
  ```

  Scripts a añadir/asegurar:
  ```json
  {
    "typecheck": "tsc --noEmit",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
    "supabase:start": "supabase start",
    "supabase:db:push": "supabase db push",
    "supabase:db:reset": "supabase db reset",
    "supabase:gen:types": "supabase gen types typescript --linked > src/types/database.ts",
    "bootstrap:users": "tsx scripts/bootstrap-users.ts"
  }
  ```

- `.env.example` **[CREATE]**
- `tailwind.config.ts` **[MERGE]**: añadir tokens Yoltik a `theme.extend.colors` y
  familia `Sora` a `theme.extend.fontFamily`. Conservar lo que el Lovable ya tenga.
- `scripts/bootstrap-users.ts` **[CREATE]**
- `src/styles/global.css` **[MERGE]**: añadir clases `ikan-card`, `ikan-btn-*`,
  `ikan-badge-*`, `demo-banner` al final si no existen. La directiva `@tailwind`
  base/components/utilities probablemente ya está; no duplicar.
- `public/favicon.svg` **[REPLACE]**

**Cierre del Chunk 5**: Code corre `npm install && npm run typecheck`. Debe correr
limpio. Polo aprueba commit `D1.B0b: schema, seeds y configs Ikán`.


---FILE: .env.example---
```bash
# Ikán — variables de entorno (copiar a .env.local y rellenar)
# NO COMMITEAR .env.local

# Supabase project (https://supabase.com/dashboard/project/_/settings/api)
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE

# Feature flags
VITE_MOCK_MOFFIN=true            # mientras Moffin no esté integrado, mock visible
VITE_MOCK_SANCTIONS_LISTS=true   # mientras no se conecte proveedor de listas en tiempo real

# Branding
VITE_APP_NAME=Ikán
VITE_APP_TAGLINE=Cumplimiento PLD por Yoltik
```
---END FILE---

---FILE: tailwind.config.ts---
```typescript
import type { Config } from 'tailwindcss';

/**
 * Paleta Yoltik (brandbook v3) — hex aproximados.
 * TODO: confirmar con brandbook oficial antes de cerrar Sprint D-1.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0A1F44',
          50: '#E6E9F0',
          100: '#C2C9DA',
          500: '#0A1F44',
          900: '#050F22',
        },
        jade: {
          DEFAULT: '#0F8F6C',
          50: '#E7F6EF',
          100: '#C3E9D7',
          500: '#0F8F6C',
          900: '#06472E',
        },
        mint: {
          DEFAULT: '#D4F1E4',
          50: '#F4FCF8',
          500: '#D4F1E4',
          900: '#8AC6A9',
        },
        ambar: {
          DEFAULT: '#F59E0B',
          50: '#FEF3C7',
          500: '#F59E0B',
          900: '#92400E',
        },
      },
      fontFamily: {
        sans: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
```
---END FILE---

---FILE: scripts/bootstrap-users.ts---
```typescript
/**
 * scripts/bootstrap-users.ts
 *
 * Crea los 3 usuarios iniciales de FIATCOIN para el demo Sprint D-1.
 *
 * Requiere las variables de entorno:
 *   - SUPABASE_URL              (proyecto local o remoto)
 *   - SUPABASE_SERVICE_ROLE_KEY (admin key — NO commitear)
 *
 * Uso:
 *   npx tsx scripts/bootstrap-users.ts
 *   o
 *   npm run bootstrap:users
 *
 * Idempotente: si los usuarios ya existen, solo asegura sus roles.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    '\n[bootstrap-users] Faltan variables. Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY antes de correr.\n' +
      'Sugerencia: en local con Supabase CLI, exporta:\n' +
      '  export SUPABASE_URL="http://127.0.0.1:54321"\n' +
      '  export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2)"\n',
  );
  process.exit(1);
}

const FIATCOIN_ORG_ID = '11111111-1111-1111-1111-111111111111';

interface SeedUser {
  email: string;
  password: string; // temporal — los usuarios deberán cambiarla y enrolar 2FA en su primer login
  nombre: string;
  roles: Array<'operador' | 'oc' | 'admin'>;
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'operador@fiatcoin.mx',
    password: 'IkanDemo2026!',
    nombre: 'Mariana Operadora (demo)',
    roles: ['operador'],
  },
  {
    email: 'oc@fiatcoin.mx',
    password: 'IkanDemo2026!',
    nombre: 'Oficial de Cumplimiento (demo)',
    roles: ['oc', 'admin'],
  },
  {
    email: 'admin@fiatcoin.mx',
    password: 'IkanDemo2026!',
    nombre: 'Admin delegado (demo)',
    roles: ['admin'],
  },
];

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureAuthUser(u: SeedUser): Promise<string> {
  // Buscar por email
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());
  if (existing) {
    console.log(`  · auth.users ya existe → ${u.email}  (id=${existing.id})`);
    return existing.id;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    user_metadata: { nombre: u.nombre, seed: true },
  });
  if (error) throw error;
  console.log(`  + auth.users creado → ${u.email}  (id=${data.user!.id})`);
  return data.user!.id;
}

async function ensureProfileAndRoles(userId: string, u: SeedUser) {
  // user_profile (upsert)
  const { error: profErr } = await supabase.from('user_profile').upsert(
    {
      id: userId,
      organization_id: FIATCOIN_ORG_ID,
      email: u.email,
      nombre: u.nombre,
      activo: true,
    },
    { onConflict: 'id' },
  );
  if (profErr) throw profErr;

  // user_roles — limpiar y reinsertar para mantener la lista exacta
  const { error: delErr } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('organization_id', FIATCOIN_ORG_ID);
  if (delErr) throw delErr;

  const rows = u.roles.map((rol) => ({
    user_id: userId,
    organization_id: FIATCOIN_ORG_ID,
    rol,
  }));
  const { error: rolesErr } = await supabase.from('user_roles').insert(rows);
  if (rolesErr) throw rolesErr;

  console.log(`    roles asignados: [${u.roles.join(', ')}]`);
}

async function main() {
  console.log('[bootstrap-users] Iniciando contra', SUPABASE_URL);
  console.log('[bootstrap-users] Organización destino:', FIATCOIN_ORG_ID, '(FIATCOIN RAMPLE)');
  console.log('');

  // Verificar que la organización existe
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, razon_social')
    .eq('id', FIATCOIN_ORG_ID)
    .single();
  if (orgErr || !org) {
    console.error(
      '\n[bootstrap-users] ❌  La organización FIATCOIN no existe en BD.\n' +
        '   ¿Corriste `npx supabase db reset`? Eso aplica las migrations y los seeds.\n',
    );
    process.exit(2);
  }
  console.log('[bootstrap-users] Organización OK →', org.razon_social);
  console.log('');

  for (const u of SEED_USERS) {
    console.log(`Procesando ${u.email}…`);
    const userId = await ensureAuthUser(u);
    await ensureProfileAndRoles(userId, u);
    console.log('');
  }

  console.log('[bootstrap-users] ✓ Listo. Credenciales temporales:');
  for (const u of SEED_USERS) {
    console.log(`  ${u.email}  /  ${u.password}`);
  }
  console.log(
    '\n  Importante: estos passwords son SOLO para demo local.\n' +
      '  En producción, cambia las credenciales y enrola 2FA TOTP en el primer login.\n',
  );
}

main().catch((err) => {
  console.error('\n[bootstrap-users] ❌', err);
  process.exit(1);
});
```
---END FILE---

---FILE: src/styles/global.css---
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    font-family: 'Sora', 'Inter', system-ui, sans-serif;
  }
  body {
    @apply bg-navy-50 text-navy-900;
  }
}

@layer components {
  .ikan-card {
    @apply bg-white rounded-lg border border-navy-100 shadow-sm p-5;
  }
  .ikan-btn-primary {
    @apply bg-jade text-white px-4 py-2 rounded-md font-semibold hover:bg-jade-900 transition;
  }
  .ikan-btn-secondary {
    @apply bg-white text-navy border border-navy-100 px-4 py-2 rounded-md font-semibold hover:bg-navy-50 transition;
  }
  .ikan-badge-bajo {
    @apply bg-jade-50 text-jade-900 px-2 py-0.5 rounded text-xs font-semibold;
  }
  .ikan-badge-medio {
    @apply bg-ambar-50 text-ambar-900 px-2 py-0.5 rounded text-xs font-semibold;
  }
  .ikan-badge-alto {
    @apply bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs font-semibold;
  }
  .demo-banner {
    @apply bg-ambar-50 border border-ambar text-ambar-900 px-3 py-1 text-xs rounded font-semibold inline-flex items-center gap-1;
  }
}
```
---END FILE---

---FILE: public/favicon.svg---
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0A1F44"/><path d="M16 7 L24 16 L16 25 L8 16 Z" fill="#0F8F6C"/></svg>
```
---END FILE---

---

## Chunk 6 — FRONT (auth, layout, dashboards)

**Archivos a CREATE**:
- `src/types/domain.ts`
- `src/types/database.ts` (placeholder, se regenera con `supabase gen types`)
- `src/lib/supabase.ts`
- `src/lib/utils.ts` **[MERGE]**: si el Lovable ya tiene `cn()`, conservar y añadir
  `UMA_MXN`, `umaToMxn`, `formatMxn`.
- `src/lib/auth-context.tsx`
- `src/hooks/useActiveRole.ts`
- `src/components/auth/ProtectedRoute.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/RoleSwitcher.tsx`
- `src/pages/auth/Login.tsx`
- `src/pages/operador/Dashboard.tsx`
- `src/pages/oc/Dashboard.tsx`
- `src/pages/admin/Dashboard.tsx`

**Archivos a REPLACE** (Code reporta diff antes de aplicar):
- `src/App.tsx`
- `src/main.tsx`
- `index.html`

**Cierre del Chunk 6**: Code corre `npm run typecheck && npm run lint && npm run build`.
Si todo verde, Polo aprueba commit `D1.B0c: front esqueleto Ikán con 3 dashboards`.


---FILE: src/types/domain.ts---
```typescript
/**
 * Tipos de dominio Ikán.
 * Las definiciones más estrictas vienen de Supabase (src/types/database.ts),
 * generadas con `npm run supabase:gen:types` después de aplicar migrations.
 */

export type SectorAV = 'IV' | 'V' | 'VII' | 'VIII' | 'XV' | 'XVI';

export type RolUsuario = 'operador' | 'oc' | 'admin';

export type ClasificacionRiesgo = 'bajo' | 'medio' | 'alto' | 'alto_oficio';

export type NivelKyc = 'N1' | 'N2' | 'N3';

export type SeveridadTipologia = 'baja' | 'media' | 'alta' | 'critica';

export type EstadoHallazgo =
  | 'abierto'
  | 'en_revision'
  | 'confirmado_inusual'
  | 'confirmado_preocupante'
  | 'descartado'
  | 'falso_positivo';

export type EstadoAviso = 'borrador' | 'listo_firma' | 'enviado' | 'acusado';

export type TipoAviso = '24h' | 'mensual';

export type TipoPersona = 'fisica' | 'moral';

export interface Organization {
  id: string;
  rfc: string;
  razon_social: string;
  sectores: SectorAV[];
  oficio_alta_sat: string | null;
  fecha_alta_sat: string | null;
  representante_legal: string | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  organization_id: string;
  email: string;
  nombre: string;
  roles: RolUsuario[];
  activo: boolean;
  mfa_habilitado: boolean;
}
```
---END FILE---

---FILE: src/types/database.ts---
```typescript
/**
 * Tipos generados desde Supabase.
 *
 * Para regenerar este archivo desde el schema real:
 *   npm run supabase:gen:types
 *
 * Mientras tanto, esta declaración placeholder permite que `createClient<Database>()`
 * compile sin errores de TS. Los tipos reales se generan tras correr migrations.
 */
export type Database = Record<string, unknown>;
```
---END FILE---

---FILE: src/lib/supabase.ts---
```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // eslint-disable-next-line no-console
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
```
---END FILE---

---FILE: src/lib/utils.ts---
```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * UMA 2026 — referencia. Verificar al cierre de cada año con INEGI.
 * Ver memoria [[metodologia-ebr-fiatcoin]] para reglas regulatorias.
 */
export const UMA_MXN = 113.07;

export const UMBRAL_IDENTIFICACION_UMA = 645;
export const UMBRAL_IDENTIFICACION_MXN = UMA_MXN * UMBRAL_IDENTIFICACION_UMA;

export function umaToMxn(uma: number): number {
  return uma * UMA_MXN;
}

export function formatMxn(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}
```
---END FILE---

---FILE: src/lib/auth-context.tsx---
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { RolUsuario, UserProfile } from '@/types/domain';

interface AuthContextValue {
  session: Session | null;
  profile: UserProfile | null;
  roles: RolUsuario[];
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<RolUsuario[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function loadProfile() {
      if (!session?.user) {
        setProfile(null);
        setRoles([]);
        return;
      }
      // En Sprint D-1: query user_profile + user_roles unidos por user_id.
      // TODO[D-1]: implementar esta query contra la BD real.
      // Por ahora, placeholder visible.
      setProfile({
        id: session.user.id,
        organization_id: 'pending',
        email: session.user.email ?? '',
        nombre: session.user.email?.split('@')[0] ?? 'Usuario',
        roles: ['operador'],
        activo: true,
        mfa_habilitado: true,
      });
      setRoles(['operador']);
    }
    void loadProfile();
  }, [session]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, profile, roles, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
```
---END FILE---

---FILE: src/hooks/useActiveRole.ts---
```typescript
import { useCallback, useEffect, useState } from 'react';
import type { RolUsuario } from '@/types/domain';

const STORAGE_KEY = 'ikan.activeRole';

/**
 * Selector de rol activo cuando un usuario tiene varios.
 * Persiste en localStorage para mantener la elección entre sesiones.
 *
 * En Sprint D-1 el listado de roles del usuario sale de la sesión Supabase
 * (tabla user_roles). Mientras tanto el hook acepta `availableRoles` como prop
 * para que los dashboards demo puedan operar.
 */
export function useActiveRole(availableRoles: RolUsuario[]) {
  const [activeRole, setActiveRoleState] = useState<RolUsuario | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(STORAGE_KEY) as RolUsuario | null;
    if (stored && availableRoles.includes(stored)) return stored;
    return availableRoles[0] ?? null;
  });

  useEffect(() => {
    if (activeRole && !availableRoles.includes(activeRole)) {
      setActiveRoleState(availableRoles[0] ?? null);
    }
  }, [activeRole, availableRoles]);

  const setActiveRole = useCallback((rol: RolUsuario) => {
    if (!availableRoles.includes(rol)) return;
    setActiveRoleState(rol);
    window.localStorage.setItem(STORAGE_KEY, rol);
  }, [availableRoles]);

  return { activeRole, setActiveRole, hasMultipleRoles: availableRoles.length > 1 };
}
```
---END FILE---

---FILE: src/components/auth/ProtectedRoute.tsx---
```tsx
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { RolUsuario } from '@/types/domain';

interface Props {
  children: ReactNode;
  requireRole?: RolUsuario;
}

export function ProtectedRoute({ children, requireRole }: Props) {
  const { session, roles, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-navy-500">
        Cargando…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireRole && !roles.includes(requireRole)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
```
---END FILE---

---FILE: src/components/layout/AppShell.tsx---
```tsx
import { Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useActiveRole } from '@/hooks/useActiveRole';
import { RoleSwitcher } from './RoleSwitcher';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const { profile, roles, signOut } = useAuth();
  const { activeRole, setActiveRole } = useActiveRole(roles);

  if (!profile || !activeRole) {
    return (
      <div className="flex h-screen items-center justify-center text-navy-500">
        Cargando perfil…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar activeRole={activeRole} />
      <div className="flex-1 flex flex-col">
        <header className="h-14 bg-white border-b border-navy-100 px-6 flex items-center justify-between gap-4">
          <div className="text-sm text-navy-500">
            <span className="font-semibold text-navy">{profile.nombre}</span>
            <span className="mx-2">·</span>
            <span>{profile.email}</span>
          </div>
          <div className="flex items-center gap-4">
            <RoleSwitcher roles={roles} activeRole={activeRole} onChange={setActiveRole} />
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-2 text-sm text-navy-500 hover:text-navy transition"
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet context={{ activeRole }} />
        </main>
      </div>
    </div>
  );
}
```
---END FILE---

---FILE: src/components/layout/Sidebar.tsx---
```tsx
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  UserPlus,
  Receipt,
  ListChecks,
  ShieldAlert,
  FileSignature,
  Users,
  Settings,
  BookOpen,
  Database,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RolUsuario } from '@/types/domain';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_BY_ROLE: Record<RolUsuario, NavItem[]> = {
  operador: [
    { to: '/operador', label: 'Mi día', icon: LayoutDashboard },
    { to: '/operador/clientes/nuevo', label: 'Capturar cliente', icon: UserPlus },
    { to: '/operador/operaciones/nueva', label: 'Capturar operación', icon: Receipt },
    { to: '/operador/mis-capturas', label: 'Mis capturas', icon: ListChecks },
  ],
  oc: [
    { to: '/oc', label: 'Motor PLD', icon: Activity },
    { to: '/oc/hallazgos', label: 'Hallazgos', icon: ShieldAlert },
    { to: '/oc/avisos', label: 'Avisos por firmar', icon: FileSignature },
    { to: '/oc/clientes', label: 'Clientes', icon: Users },
    { to: '/oc/bitacora', label: 'Bitácora', icon: BookOpen },
  ],
  admin: [
    { to: '/admin', label: 'Administración', icon: LayoutDashboard },
    { to: '/admin/usuarios', label: 'Usuarios y roles', icon: Users },
    { to: '/admin/metodologia', label: 'Metodología EBR', icon: BookOpen },
    { to: '/admin/tipologias', label: 'Tipologías por AV', icon: ShieldAlert },
    { to: '/admin/catalogos', label: 'Catálogos', icon: Database },
    { to: '/admin/reglas', label: 'Reglas y umbrales', icon: Settings },
  ],
};

interface Props {
  activeRole: RolUsuario;
}

export function Sidebar({ activeRole }: Props) {
  const items = NAV_BY_ROLE[activeRole];
  return (
    <aside className="w-64 shrink-0 bg-navy text-white p-4 flex flex-col gap-2">
      <div className="px-2 py-3 mb-2">
        <div className="text-2xl font-bold text-white tracking-tight">Ikán</div>
        <div className="text-xs text-navy-100 opacity-80">Cumplimiento PLD · por Yoltik</div>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === `/${activeRole}` || it.to === `/admin`}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition',
                isActive
                  ? 'bg-jade text-white'
                  : 'text-navy-100 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <it.icon className="h-4 w-4" />
            {it.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto px-2 py-3 text-xs text-navy-100 opacity-70">
        Demo · Sprint D-1
      </div>
    </aside>
  );
}
```
---END FILE---

---FILE: src/components/layout/RoleSwitcher.tsx---
```tsx
import { ChevronDown } from 'lucide-react';
import type { RolUsuario } from '@/types/domain';

const ROLE_LABEL: Record<RolUsuario, string> = {
  operador: 'Operador',
  oc: 'Oficial de Cumplimiento',
  admin: 'Administrador',
};

interface Props {
  roles: RolUsuario[];
  activeRole: RolUsuario;
  onChange: (rol: RolUsuario) => void;
}

export function RoleSwitcher({ roles, activeRole, onChange }: Props) {
  if (roles.length <= 1) {
    return (
      <span className="text-sm text-navy-500">
        Rol: <strong className="text-navy">{ROLE_LABEL[activeRole]}</strong>
      </span>
    );
  }
  return (
    <label className="flex items-center gap-2 text-sm text-navy-500">
      <span>Operando como</span>
      <span className="relative">
        <select
          value={activeRole}
          onChange={(e) => onChange(e.target.value as RolUsuario)}
          className="appearance-none border border-navy-100 rounded-md pl-3 pr-8 py-1 bg-white text-navy font-semibold focus:outline-none focus:ring-2 focus:ring-jade-100"
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1.5 h-4 w-4 text-navy-500 pointer-events-none" />
      </span>
    </label>
  );
}
```
---END FILE---

---FILE: src/pages/auth/Login.tsx---
```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

type LoginStep = 'credentials' | 'otp';

export function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitCredentials = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;

      // Detectar si requiere 2FA
      const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors();
      if (factorsErr) throw factorsErr;
      const totp = factors?.totp?.[0];
      if (totp) {
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
        if (chErr) throw chErr;
        setFactorId(totp.id);
        setChallengeId(ch.id);
        setStep('otp');
      } else {
        // Sin 2FA configurado todavía — el usuario podrá enrolar en su primer login.
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!factorId || !challengeId) return;
    setBusy(true);
    setError(null);
    try {
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: otp,
      });
      if (verifyErr) throw verifyErr;
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-navy-50 p-6">
      <div className="ikan-card w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl font-bold text-navy">Ikán</div>
          <div className="text-sm text-navy-500">Cumplimiento PLD por Yoltik</div>
        </div>

        {step === 'credentials' && (
          <form onSubmit={submitCredentials} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy-900 mb-1">Correo</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-navy-100 rounded-md focus:outline-none focus:ring-2 focus:ring-jade-100"
                placeholder="oficial@empresa.mx"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-900 mb-1">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-navy-100 rounded-md focus:outline-none focus:ring-2 focus:ring-jade-100"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button type="submit" disabled={busy} className="ikan-btn-primary w-full disabled:opacity-50">
              {busy ? 'Validando…' : 'Continuar'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={submitOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy-900 mb-1">
                Código de tu app de autenticación (TOTP)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2 border border-navy-100 rounded-md text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-jade-100"
                placeholder="000000"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button type="submit" disabled={busy} className="ikan-btn-primary w-full disabled:opacity-50">
              {busy ? 'Verificando…' : 'Verificar'}
            </button>
            <button
              type="button"
              onClick={() => setStep('credentials')}
              className="text-sm text-navy-500 hover:text-navy w-full text-center"
            >
              Volver
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```
---END FILE---

---FILE: src/pages/operador/Dashboard.tsx---
```tsx
import { UserPlus, Receipt, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';

export function OperadorDashboard() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Mi día</h1>
        <p className="text-navy-500 text-sm mt-1">
          Captura clientes y operaciones del sector Activos Virtuales (XVI).
        </p>
      </header>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="ikan-card">
          <div className="text-xs text-navy-500 uppercase tracking-wide">Clientes capturados hoy</div>
          <div className="text-3xl font-bold text-navy mt-2">0</div>
        </div>
        <div className="ikan-card">
          <div className="text-xs text-navy-500 uppercase tracking-wide">Operaciones capturadas hoy</div>
          <div className="text-3xl font-bold text-navy mt-2">0</div>
        </div>
        <div className="ikan-card">
          <div className="text-xs text-navy-500 uppercase tracking-wide">Capturas pendientes</div>
          <div className="text-3xl font-bold text-navy mt-2">0</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Link to="/operador/clientes/nuevo" className="ikan-card hover:border-jade transition group">
          <UserPlus className="h-6 w-6 text-jade mb-3" />
          <h3 className="font-semibold text-navy">Capturar cliente</h3>
          <p className="text-sm text-navy-500 mt-1">Datos básicos, KYC e integración de expediente.</p>
        </Link>
        <Link to="/operador/operaciones/nueva" className="ikan-card hover:border-jade transition group">
          <Receipt className="h-6 w-6 text-jade mb-3" />
          <h3 className="font-semibold text-navy">Capturar operación</h3>
          <p className="text-sm text-navy-500 mt-1">Registrar una compra, venta o retiro.</p>
        </Link>
        <Link to="/operador/mis-capturas" className="ikan-card hover:border-jade transition group">
          <ListChecks className="h-6 w-6 text-jade mb-3" />
          <h3 className="font-semibold text-navy">Mis capturas</h3>
          <p className="text-sm text-navy-500 mt-1">Listado de lo que has registrado.</p>
        </Link>
      </div>

      <p className="text-xs text-navy-500 italic">
        Tu trabajo aquí es la captura. El sistema procesa cada operación automáticamente.
      </p>
    </div>
  );
}
```
---END FILE---

---FILE: src/pages/oc/Dashboard.tsx---
```tsx
import { Activity, ShieldAlert, FileSignature, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

export function OcDashboard() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Motor PLD</h1>
        <p className="text-navy-500 text-sm mt-1">
          Estado del motor automatizado y bandejas para tu revisión y firma.
        </p>
      </header>

      <div className="ikan-card border-jade-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-jade" />
              <h2 className="font-semibold text-navy">Estado del motor</h2>
            </div>
            <p className="text-xs text-navy-500 mt-1">
              Versión de reglas activa · Tipologías habilitadas · Última corrida
            </p>
          </div>
          <span className="ikan-badge-bajo">Operando</span>
        </div>
        <div className="grid md:grid-cols-4 gap-4 mt-4">
          <Stat label="Última corrida" value="—" />
          <Stat label="Versión reglas" value="v1" />
          <Stat label="Tipologías activas" value="8" />
          <Stat label="Operaciones procesadas (mes)" value="0" />
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <BandejaCard
          to="/oc/hallazgos"
          icon={ShieldAlert}
          label="Hallazgos abiertos"
          value={0}
          hint="Por tipología disparada"
        />
        <BandejaCard
          to="/oc/avisos?tipo=24h"
          icon={FileSignature}
          label="Avisos 24h"
          value={0}
          hint="Por firmar"
        />
        <BandejaCard
          to="/oc/avisos?tipo=mensual"
          icon={FileSignature}
          label="Aviso mensual"
          value={0}
          hint="Borrador del periodo"
        />
        <BandejaCard
          to="/oc/clientes?filtro=alto"
          icon={Users}
          label="Clientes Alto pendientes DDR"
          value={0}
          hint="Por aprobar"
        />
      </div>

      <p className="text-xs text-navy-500 italic">
        Cada hallazgo cita la tipología y la regla que disparó. Las versiones de tipologías se
        congelan al momento del hallazgo para no mutar registros pasados.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-navy-500 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold text-navy mt-1">{value}</div>
    </div>
  );
}

interface BandejaProps {
  to: string;
  icon: typeof Activity;
  label: string;
  value: number;
  hint: string;
}

function BandejaCard({ to, icon: Icon, label, value, hint }: BandejaProps) {
  return (
    <Link to={to} className="ikan-card hover:border-jade transition">
      <Icon className="h-5 w-5 text-jade mb-2" />
      <div className="text-xs text-navy-500 uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-bold text-navy mt-1">{value}</div>
      <div className="text-xs text-navy-500 mt-2">{hint}</div>
    </Link>
  );
}
```
---END FILE---

---FILE: src/pages/admin/Dashboard.tsx---
```tsx
import { Link } from 'react-router-dom';
import { Users, BookOpen, ShieldAlert, Database, Settings } from 'lucide-react';

export function AdminDashboard() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Administración</h1>
        <p className="text-navy-500 text-sm mt-1">
          Configura el motor. Los cambios pasan por aprobación del Oficial de Cumplimiento.
        </p>
      </header>

      <div className="grid md:grid-cols-3 gap-4">
        <Stat label="Usuarios activos" value="—" />
        <Stat label="Versión metodología EBR" value="v1" />
        <Stat label="Cambios pendientes de aprobación" value={0} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Link to="/admin/usuarios" className="ikan-card hover:border-jade transition">
          <Users className="h-6 w-6 text-jade mb-3" />
          <h3 className="font-semibold text-navy">Usuarios y roles</h3>
          <p className="text-sm text-navy-500 mt-1">Operador, OC, Admin. Alta y baja.</p>
        </Link>
        <Link to="/admin/metodologia" className="ikan-card hover:border-jade transition">
          <BookOpen className="h-6 w-6 text-jade mb-3" />
          <h3 className="font-semibold text-navy">Metodología EBR</h3>
          <p className="text-sm text-navy-500 mt-1">Elementos, indicadores, mitigantes, pesos.</p>
        </Link>
        <Link to="/admin/tipologias" className="ikan-card hover:border-jade transition">
          <ShieldAlert className="h-6 w-6 text-jade mb-3" />
          <h3 className="font-semibold text-navy">Tipologías por AV</h3>
          <p className="text-sm text-navy-500 mt-1">Catálogo XVI con 8 tipologías seed.</p>
        </Link>
        <Link to="/admin/catalogos" className="ikan-card hover:border-jade transition">
          <Database className="h-6 w-6 text-jade mb-3" />
          <h3 className="font-semibold text-navy">Catálogos</h3>
          <p className="text-sm text-navy-500 mt-1">Países GAFI/OFAC, entidades, alertas on-chain.</p>
        </Link>
        <Link to="/admin/reglas" className="ikan-card hover:border-jade transition">
          <Settings className="h-6 w-6 text-jade mb-3" />
          <h3 className="font-semibold text-navy">Reglas y umbrales</h3>
          <p className="text-sm text-navy-500 mt-1">Umbral 645 UMA, ventanas, factores.</p>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ikan-card">
      <div className="text-xs text-navy-500 uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-bold text-navy mt-2">{value}</div>
    </div>
  );
}
```
---END FILE---

---FILE: src/App.tsx---
```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/auth/Login';
import { OperadorDashboard } from '@/pages/operador/Dashboard';
import { OcDashboard } from '@/pages/oc/Dashboard';
import { AdminDashboard } from '@/pages/admin/Dashboard';

function RootRedirect() {
  const { roles } = useAuth();
  if (roles.includes('admin')) return <Navigate to="/admin" replace />;
  if (roles.includes('oc')) return <Navigate to="/oc" replace />;
  return <Navigate to="/operador" replace />;
}

function Placeholder({ titulo }: { titulo: string }) {
  return (
    <div className="ikan-card">
      <h1 className="text-xl font-bold text-navy">{titulo}</h1>
      <p className="text-navy-500 text-sm mt-2">
        Pantalla en construcción — se entrega en el bloque correspondiente del Sprint D-1/D-2/D-3.
      </p>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<RootRedirect />} />

          {/* Operador */}
          <Route path="/operador" element={<OperadorDashboard />} />
          <Route path="/operador/clientes/nuevo" element={<Placeholder titulo="Capturar cliente" />} />
          <Route path="/operador/operaciones/nueva" element={<Placeholder titulo="Capturar operación" />} />
          <Route path="/operador/mis-capturas" element={<Placeholder titulo="Mis capturas" />} />

          {/* OC */}
          <Route path="/oc" element={<OcDashboard />} />
          <Route path="/oc/hallazgos" element={<Placeholder titulo="Hallazgos del Motor PLD" />} />
          <Route path="/oc/avisos" element={<Placeholder titulo="Avisos por firmar" />} />
          <Route path="/oc/clientes" element={<Placeholder titulo="Clientes" />} />
          <Route path="/oc/bitacora" element={<Placeholder titulo="Bitácora" />} />

          {/* Admin */}
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/usuarios" element={<Placeholder titulo="Usuarios y roles" />} />
          <Route path="/admin/metodologia" element={<Placeholder titulo="Metodología EBR" />} />
          <Route path="/admin/tipologias" element={<Placeholder titulo="Tipologías por AV" />} />
          <Route path="/admin/catalogos" element={<Placeholder titulo="Catálogos" />} />
          <Route path="/admin/reglas" element={<Placeholder titulo="Reglas y umbrales" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
```
---END FILE---

---FILE: src/main.tsx---
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
```
---END FILE---

---FILE: index.html---
```html
<!doctype html>
<html lang="es-MX">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ikán · Cumplimiento PLD por Yoltik</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body class="bg-navy-50 text-navy-900 antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```
---END FILE---

---

## Chunk 7 — SMOKE TEST D1.B1 (validación final)

**Lo que corre Code en el sandbox** (si tiene red para `npm install`):
```bash
npm install
npm run typecheck
npm run lint
npm run build
```

**Lo que corre Polo en su Mac** (después de hacer git pull con los commits de Code):
```bash
cd <ruta-local-del-repo>
npm install
cp .env.example .env.local
# Editar .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY del proyecto local

npx supabase start
npx supabase db reset
npm run supabase:gen:types

export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2)"
npm run bootstrap:users

npm run dev
```

**Checks que confirma Polo en el navegador**:
- [ ] `http://localhost:5173` muestra login Ikán.
- [ ] Login con `operador@fiatcoin.mx / IkanDemo2026!` → `/operador`, "Mi día".
- [ ] Login con `oc@fiatcoin.mx / IkanDemo2026!` → panel Motor PLD.
- [ ] Selector "Operando como" aparece para `oc@fiatcoin.mx` (oc + admin).
- [ ] Login con `admin@fiatcoin.mx / IkanDemo2026!` → vista Administración.

Si todo OK, Sprint D-1 bootstrap cerrado. Siguiente bloque: **D1.B2** —
implementar `auth-context.tsx` con query real a `user_profile + user_roles`
(hoy es placeholder).

---

## Anexo — Bloques posteriores del Sprint D-1

Una vez aplicado este brief y validado el smoke (esto cubre D1.B1), el resto del
Sprint D-1 es:

- **D1.B2** — auth real con roles desde BD.
- **D1.B3** — bitácora con escritura desde cliente.
- **D1.B4** — onboarding wizard de organización (Admin).
- **D1.B5** — listado y detalle de metodología EBR.
- **D1.B6** — editor de metodología con flujo Admin → OC.
- **D1.B7** — listado de tipologías por AV (solo lectura).
- **D1.B8** — gestión de usuarios y roles desde UI.
- **D1.B9** — smoke test final Sprint D-1 completo.

Detalle de cada uno en `docs/SPRINT_D1_BACKLOG.md` (queda en el repo después del
Chunk 2).

