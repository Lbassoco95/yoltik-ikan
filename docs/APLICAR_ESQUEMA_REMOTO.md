# Aplicar y verificar el esquema en el Supabase remoto

> Nota corta para no volver a perder tiempo: **tener el código en el repo NO significa que el
> Supabase remoto (`cibpguwwggwzdhhpdomz`) tenga el esquema aplicado.** Ya nos pasó dos veces.
> Aquí queda cómo aplicarlo y cómo verificar que siga aplicado.

## 1. Verificar si el remoto ya tiene el esquema

En el SQL Editor del dashboard:

```sql
select
  to_regclass('public.organizations') as organizations,
  to_regclass('public.user_profile')  as user_profile,
  to_regclass('public.client')        as client,
  to_regclass('public.tipologia_av')  as tipologia_av,
  to_regclass('public.hallazgo')      as hallazgo;
```

- **Todas `NULL`** → el remoto está vacío; aplica el esquema (paso 2).
- **Todas con nombre** → el esquema está; verifica los seeds:

```sql
select
  (select count(*) from tipologia_av) as tipologias,   -- esperado: 8
  (select count(*) from client)       as clientes,      -- esperado: 1 (Juan Pérez)
  (select count(*) from operation)    as operaciones;   -- esperado: 6 (DEMO)
```

- **Mezcla (unas sí, otras no)** → esquema parcial; NO corras el bundle encima. Investiga qué
  quedó a medias antes de continuar (esto no debería pasar si siempre aplicas con el bundle
  transaccional del paso 2, que revierte todo ante cualquier error).

## 2. Aplicar el esquema

### Opción A — SQL Editor (sin CLI)

Copia **todo** `supabase/manual/apply_all_remote.sql` y córrelo una vez. Contiene, en orden,
las migrations `0001`–`0005` + los seeds `01`–`07`, **envuelto en `begin;`…`commit;`**: si algo
truena a media, revierte todo y el proyecto queda vacío (seguro para reintentar), nunca a medias.

Las migrations NO son idempotentes (`create type/table` truena si ya existen) → úsalo solo sobre
un proyecto vacío. Los seeds sí son idempotentes (`on conflict do nothing`).

### Opción B — CLI

```bash
supabase link --project-ref cibpguwwggwzdhhpdomz
supabase db push                       # aplica migrations/0001..0005
# seeds (uno por uno, o el runner con \i desde psql):
psql "$DB_URL" -f supabase/seed/01_organization_fiatcoin.sql   # ...y 02..07 en orden
```

## 3. Crear el usuario maestro

El esquema no trae usuarios (los usuarios viven en `auth.users`, no en las migrations). Para el
usuario maestro:

1. Dashboard → Authentication → Users → **Add user** (`leo.bassoco@kawiil.mx`, Auto Confirm).
2. Copia su UID.
3. Corre `supabase/manual/bootstrap_usuario_maestro.sql` reemplazando `PEGA_AQUI_EL_UID`.

Para reconstruir los 3 usuarios demo (operador@/oc@/admin@fiatcoin.mx) + el maestro de forma
automatizada: `npm run bootstrap:users` (requiere `SUPABASE_SERVICE_ROLE_KEY`; ver
`scripts/bootstrap-users.ts`).

## 4. Regenerar el bundle si cambian migrations/seeds

`supabase/manual/apply_all_remote.sql` es un artefacto generado. Si tocas alguna migration o
seed, regénralo concatenando `migrations/0001..0005` + `seed/01..07` en ese orden, envuelto en
`begin;`/`commit;` (mismo encabezado que el archivo actual).

## Historial

- El esquema D-1 (migrations 0001–0005 + seeds) se mergeó al repo en `main`, pero **nunca se
  había aplicado al remoto** — por eso `user_profile` y compañía no existían y no había usuarios.
- Al aplicar por primera vez apareció un bug en las políticas RLS de `risk_element` (usaban
  `element_id`, columna inexistente; corregido a `methodology_id` en `0002`). Afectaba también
  `supabase db reset`.

## Demo Notarías (fracción XII) — aplicación

Requiere aplicar la migration `0006` y el seed `08` **en dos envíos separados** del SQL Editor,
por la regla de PostgreSQL de que un valor de enum recién agregado no puede usarse en la misma
transacción:

1. **Envío 1** — pega y corre `supabase/migrations/0006_perfil_actividad_notarias.sql`
   (agrega el valor de enum `XII` y la columna `organizations.perfil_actividad`).
2. **Envío 2** — pega y corre `supabase/seed/08_notarias_demo.sql` (org notaría, comparecientes,
   actos DEMO y tipologías XII). Idempotente.
3. **Usuario notaría**: Authentication → Users → Add user `notaria@demo.mx` (Auto Confirm), copia
   el UID y corre `supabase/manual/bootstrap_usuario_notaria.sql`. (O `npm run bootstrap:users`,
   que ya lo incluye.)

Verificación:

```sql
select razon_social, perfil_actividad from organizations
where id = '12121212-1212-1212-1212-121212121212';           -- perfil_actividad = 'notarias'
select count(*) from tipologia_av where sector = 'XII';       -- 3
```

Al entrar con `notaria@demo.mx`, la UI se "viste" de notaría (Comparecientes / Actos). En la
bandeja del OC, **Recorrer motor** genera los hallazgos de los actos DEMO (compraventa ≥16,000 UMA,
poder irrevocable, socio en país de riesgo).
