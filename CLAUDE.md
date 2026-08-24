# Ikán — contexto persistente para Claude Code

> Este archivo lo lee Claude Code automáticamente al abrir el repo.
> Cuando trabajes con Code: NO te leas todo el repo de inicio. Lee solo este archivo,
> después `docs/SPRINT_D1_BACKLOG.md`, y a partir de ahí abre los archivos que el
> bloque activo necesite.

## Qué es este proyecto

**Ikán** es la plataforma de cumplimiento PLD de Yoltik (operada por Kawiil), dirigida
a sujetos obligados bajo LFPIORPI. El demo arranca con el sector **XVI — Activos
Virtuales**, usando la metodología EBR de **Ixim Pay** (cliente real Kawiil)
como seed canónico.

Producto en construcción. Sprint actual: **D-1 — Foundations + onboarding + EBR
cargado + 3 roles funcionales**.

El repo nació como scaffold Lovable (`5ad7870 Implement dashboard scaffolding`) con
12 páginas y base shadcn/ui. Ikán se construye encima preservando ese scaffold:
añade auth + roles + RLS + Motor PLD, reaprovecha las páginas existentes
envolviéndolas con `<ProtectedRoute>`.

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

- Front: Vite + React 18 + TypeScript + Tailwind 3 + shadcn/ui (ya instalado por Lovable)
- Tipografía: **Plus Jakarta Sans** (heredada del Lovable; sustituye a `Sora` mencionado en docs históricos)
- Auth: Supabase Auth con **2FA TOTP obligatorio**
- BD: Supabase Postgres con **RLS multi-tenant por organización y por rol**
- Edge Functions: Deno/TS (Motor PLD vive aquí en Sprint D-3)
- Supabase: proyecto remoto `cibpguwwggwzdhhpdomz` (sin entorno local separado).
  Ver `docs/SPRINT_D1_BACKLOG.md` D1.B1 para el flujo `supabase link` + `db push`.
- Deploy: Vercel (`https://yoltik-regtech-hub.vercel.app`)
- Port dev local: **8080** (heredado del Lovable)
- Path alias `@/` apunta a `src/`

## Convenciones — críticas

1. **Bloque por bloque con checkpoint.** Nunca acumules más de 1 bloque sin
   verificar con el usuario. Cada bloque cierra con build limpio + smoke notes.
2. **No inventes campos ni valores.** Si algo no está en metodología Ixim Pay, en
   las guías oficiales (UIF/SAT/GAFI), o en el código existente: pregunta. NUNCA
   improvises algoritmos, umbrales o estructuras "razonables".
3. **Mocks visibles.** Lo que no esté integrado (Moffin, listas tiempo real,
   analítica on-chain, envío SAT) debe llevar **banner ámbar** con texto explícito
   "DEMO — sin integración real". Nunca silencioso.
4. **IDs fijos en seeds.** Los seeds usan UUIDs deterministas para que el front
   pueda referenciar sin race conditions. NO los cambies sin razón fuerte:
   - Organización Ixim Pay: `11111111-1111-1111-1111-111111111111`
   - Metodología EBR XVI v1: `22222222-2222-2222-2222-222222222201`
   - Tipologías XVI-01..XVI-08: `33333333-0000-0000-0000-00000000000{1..8}`
   - Plantilla matriz cliente XVI: `44444444-0000-0000-0000-000000000001`
   - Cliente demo Juan Pérez: `55555555-0000-0000-0000-000000000001`
5. **Brand Yoltik v3.** Navy / Jade / Mint / Ámbar; tipografía Plus Jakarta Sans.
   `tailwind.config.ts` ya tiene los tokens `ikan.*` apuntando a las CSS vars HSL
   que shadcn usa. **Yoli (mascota) NO aparece en docs ni UI formales** — solo en
   materiales informales si se solicita.
6. **No mezclar con Kailash.** Repo separado, conceptos separados, nada de copiar
   patrones específicos de Kailash sin pensar si aplican.
7. **Idioma**: UI y mensajes de usuario en **español de México**. Comentarios de
   código y mensajes de commit en español también (consistente con el resto del
   código existente). Sin emojis salvo que se pida.
8. **Comentarios `TODO[Sprint D-x]`** para puntos pendientes; mantén ese formato
   para que sean rastreables con `rg "TODO\[Sprint"`.
9. **Preservar Lovable.** Las 12 páginas existentes (Clientes, Operaciones, Alertas,
   Reportes, Listas, RulesEngine, Verificacion, Auditoria, Configuracion, etc.) se
   reaprovechan tal cual. NO se reescriben en Sprint D-1. La conexión a queries
   reales en Supabase entra en Sprint D-2/D-3.

## Comandos

```bash
npm install                       # deps
npm run dev                       # dev server (http://localhost:8080)
npm run build                     # build prod
npm run typecheck                 # tsc --noEmit
npm run lint                      # eslint
npm run format                    # prettier

# Supabase (proyecto remoto cibpguwwggwzdhhpdomz)
npx supabase login                # primera vez
npx supabase link --project-ref cibpguwwggwzdhhpdomz
npx supabase db push              # aplica migrations al remoto
npm run supabase:gen:types        # regenera src/types/database.ts

npm run bootstrap:users           # crea 3 usuarios Ixim Pay (scripts/bootstrap-users.ts)
```

## Estructura

Ver `README.md` para tree completo. Resumen:

- `src/` — front Lovable (App.tsx, components/, pages/, data/) + capas Ikán
  (`lib/auth-context.tsx`, `lib/supabase.ts`, `lib/role-routes.ts`, `hooks/`,
  `components/auth/`, `components/layout/RoleSwitcher.tsx`, `pages/auth/`)
- `supabase/migrations/0001..0005` — schema completo con RLS
- `supabase/seed/` — datos demo Ixim Pay (no inventados; vienen de los Excel/docx originales)
- `supabase/functions/motor-pld/` — Edge Function (stub para Sprint D-3)
- `scripts/` — utilidades (bootstrap usuarios, etc.)
- `docs/` — ARCHITECTURE, ROLES, MOTOR_PLD, SPRINT_D1_BACKLOG, CODE_BRIEF, claude-code-settings

## Por dónde empezar (Sprint D-1)

Lee `docs/SPRINT_D1_BACKLOG.md`. Ese archivo tiene los bloques ordenados por
dependencias, cada uno con criterio de aceptación y validación.

**Estado actual del bootstrap**:
- ✅ D1.B0a — pre-trabajo sobre scaffold Lovable (lockfiles, lovable-tagger, tokens `ikan.*`).
- 🟡 D1.B0b — contexto persistente y docs (este chunk).
- ⏳ D1.B0c — schema (migrations + config + edge function stub).
- ⏳ D1.B0d — seeds Ixim Pay.
- ⏳ D1.B0e — configs (package.json, env, scripts).
- ⏳ D1.B0f — front Ikán sobre Lovable (auth + roles + role-routes).
- ⏳ D1.B1 — smoke test contra Supabase remoto.

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
4. Commit + push a `claude/magical-davinci-Md6ls` con formato `D1.Bn: descripción`.
   No esperes aprobación previa para esto. Merge a `main` SÍ requiere aprobación.

## Cuando algo te genere duda

Pregunta. No improvises:
- Si un campo no está en seed ni en docs → pregunta.
- Si una regla no está en metodología Ixim Pay → pregunta.
- Si una decisión de UX no está documentada en `docs/` → pregunta.
- Si dudas sobre la separación de funciones Operador/OC/Admin → relee `docs/ROLES.md`.

## Referencias externas (en la carpeta de proyectos del usuario, NO en este repo)

- `Yoltik Desarrollos/Ikan-Arquitectura-Roadmap-v0.1-2026-05-23.docx` — arquitectura general
- `Yoltik Desarrollos/Ikan-Demo-Decisiones-y-Plan-v0.1-2026-05-23.docx` — decisiones de arranque
- `Yoltik Desarrollos/Ikan-Demo-Motor-PLD-y-Tipologias-v0.3-2026-05-23.docx` — modelo Motor PLD (vigente)
- Excel/docx originales de Ixim Pay — la fuente de verdad de la metodología

Mientras dure el Sprint D-1, los 3 documentos clave del plan viven en `.brief-temporal/`
del repo:
- `.brief-temporal/03-addendum-2-lovable.md` — decisiones vigentes (precedencia máxima)
- `.brief-temporal/02-addendum-1-vercel-supabase.md` — setup Vercel + Supabase remoto
- `.brief-temporal/01-brief-original.md` — brief original (referencia)

Se borran con `chore: limpiar brief temporal` al cierre del Sprint D-1.

## Versiones de documentos

El documento vigente del modelo es **v0.3** (Motor PLD y tipologías por AV). El v0.2
(Roles y walkthrough) sigue siendo válido en lo que toca a roles y separación de
funciones, pero su Acto 2 del walkthrough quedó reescrito en v0.3. El v0.1 quedó
superseded por completo.
