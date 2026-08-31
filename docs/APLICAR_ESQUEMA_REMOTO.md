# Aplicar y verificar el esquema en el Supabase remoto

> Nota corta para no volver a perder tiempo: **tener el código en el repo NO significa que el
> Supabase remoto (`cibpguwwggwzdhhpdomz`) tenga el esquema aplicado.** Ya nos pasó dos veces.
> Aquí queda cómo aplicarlo y cómo verificar que siga aplicado.

## Probar contra un Postgres que se parezca a Supabase

`supabase/manual/harness_postgres_local.sql` prepara una base desechable con lo que
Supabase tiene y un PostgreSQL limpio no. Correrlo ANTES de las migrations no es opcional:
dos errores llegaron a producción el 30 de agosto de 2026 porque el banco de pruebas era
más permisivo que el entorno real, y un banco de pruebas más permisivo no prueba nada.

```bash
createdb prueba
psql -d prueba -f supabase/manual/harness_postgres_local.sql
for f in supabase/migrations/*.sql; do psql -d prueba -v ON_ERROR_STOP=1 -f "$f"; done
```

Lo que reproduce, y por qué cada cosa:

| Qué | Qué error dejó pasar su ausencia |
|---|---|
| `ALTER DEFAULT PRIVILEGES` que da EXECUTE a `anon` y `authenticated` | La 0021 revocaba sólo de `PUBLIC`; en Supabase la función seguía abierta a los clientes |
| `pgcrypto` y `btree_gist` en el esquema `extensions`, no en `public` | La 0021 usaba `gen_random_bytes()` sin calificar; en Supabase no la veía y **rompió toda alta en producción** |
| Rol `probador` sin privilegios | Un superusuario se salta el RLS SIEMPRE, incluso con FORCE: probar como `postgres` no prueba nada |

## Antes que nada: el SQL Editor sólo muestra la ÚLTIMA consulta

Nos costó tres vueltas. Si pegas un script con varios `SELECT`, el editor del dashboard
enseña **únicamente el resultado del último** y parece que lo demás no corrió. Por eso todos
los scripts de diagnóstico de `supabase/manual/` devuelven **una sola tabla**, armada en una
tabla temporal. Si escribes uno nuevo, respeta esa regla.

## 0. Lo primero: ¿qué falta correr?

Desde la migration 0011 en adelante hay un diagnóstico que lo responde solo. Pega
`supabase/manual/00_estado_migraciones.sql` en el SQL Editor: **no escribe nada**, sólo
mira el esquema y devuelve dos tablas —una con cada migration marcada `ya está` o `FALTA`
con el bundle que hay que correr, y otra con lo que puede estar a medias aunque la tabla
exista (catálogos sin valores, códigos postales sin cargar, funciones `SECURITY DEFINER`
abiertas).

Corre los pendientes en el orden de la columna `orden`. Todos los bundles son idempotentes:
si uno ya estaba, volver a correrlo no hace daño.

## 1. Verificar si el remoto ya tiene el esquema (0001–0010)

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
psql "$DB_URL" -f supabase/seed/01_organization_ixim_pay.sql   # ...y 02..07 en orden
```

## 3. Crear el usuario maestro

El esquema no trae usuarios (los usuarios viven en `auth.users`, no en las migrations). Para el
usuario maestro:

1. Dashboard → Authentication → Users → **Add user** (`leo.bassoco@kawiil.mx`, Auto Confirm).
2. Copia su UID.
3. Corre `supabase/manual/bootstrap_usuario_maestro.sql` reemplazando `PEGA_AQUI_EL_UID`.

Para reconstruir los 3 usuarios demo (operador@/oc@/admin@iximpay.mx) + el maestro de forma
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

## Expediente del hallazgo (migration 0007) — aplicación

Aditiva sobre `hallazgo` (0005). Se puede correr en **un solo envío** del SQL Editor: los enums
nuevos se crean con `CREATE TYPE` (no `ALTER TYPE ... ADD VALUE`), así que sí pueden usarse en la
misma transacción.

1. Pega y corre `supabase/migrations/0007_hallazgo_expediente.sql`. Agrega:
   - `hallazgo.clasificacion_urgencia` (`24_horas` / `por_umbral`), derivada de la regla por el
     trigger `trg_hallazgo_urgencia` y con backfill de los hallazgos que ya existían.
   - `hallazgo_documento` y `hallazgo_bitacora` con RLS (lectura oc/admin, escritura del OC).
   - Triggers que escriben la bitácora solos: cambio de estado, cambio de urgencia y carga de
     documento.
   - El bucket privado `hallazgo-documentos` y sus políticas de Storage.
2. Redespliega la Edge Function del motor para que mande la clasificación explícita:
   `npx supabase functions deploy motor-pld`. (Si no se redespliega, el trigger de BD la deriva
   igual; solo se pierde la fuente explícita del motor.)

Al correrla, el SQL Editor responde **"Success. No rows returned"**: es DDL puro y la última
sentencia es un `create policy`. Como el editor envuelve el script en una transacción, ese
"Success" significa que pasó completo, políticas de Storage incluidas.

Verificación (devuelve un checklist con filas): pega y corre
`supabase/manual/verificar_0007.sql`. Las 7 primeras filas deben decir `OK`; las últimas listan
los hallazgos con su clasificación — XII-01 (umbral 16,000 UMA) → `por_umbral`, XII-02 y XII-03
→ `24_horas`. Si la lista de hallazgos sale vacía, es que el motor no ha corrido todavía: entra
a `/alertas` y usa **Recorrer motor**.

Smoke en la UI, entrando como `notaria@demo.mx` (rol activo **Oficial de Cumplimiento**):
clic en una tarjeta de `/alertas` → abre "Expediente del hallazgo". En **Detalle**, cambiar el
estado y verlo aparecer en **Bitácora**. En **Documentos**, subir un PDF y comprobar que el
propio archivo se abre con liga firmada y que la carga también quedó en la bitácora.

> La clasificación de urgencia es un **SLA operativo interno** para priorizar la bandeja del OC.
> No es un plazo regulatorio distinto al de la fracción XII.

---

## 5. El bundle NO cubre todo (léelo antes de dar por aplicado el esquema)

`supabase/manual/apply_all_remote.sql` sólo contiene **migrations 0001–0005 + seeds 01–07**.
Todo lo posterior quedó fuera y hay que aplicarlo aparte. Si el remoto no lo tiene, el demo
de notarías **no existe**: sin `perfil_actividad`, sin la organización notaría, sin tipologías
XII, sin expediente de hallazgo, sin folio, sin matriz configurable, sin parámetros.

| Qué falta | Qué habilita | Cómo aplicarlo |
|---|---|---|
| `0006` | enum `XII` + `organizations.perfil_actividad` | Un envío **solo** (regla de `alter type ... add value`) |
| seed `08` | organización Notaría Demo GDL, comparecientes, actos, tipologías XII | Envío posterior al de 0006 |
| `0007` | expediente del hallazgo: documentos, bitácora, urgencia | Envío normal |
| `0008` | folio configurable + `platform_admin` + `es_admin_kawiil()` | Envío normal |
| `0009` | lectura de `audit_log` para admins de Kawiil | Envío normal |
| `0010` | matriz de riesgo configurable (borrador / publicada) | Envío normal |
| seed `09` | plantilla de matriz XII | Requiere 0010 |
| `0011` + seed `10` | parámetros regulatorios (UMA, umbrales) | `supabase/manual/apply_0011_parametros.sql` — idempotente |

### Verificación rápida de lo posterior a 0005

```sql
select
  to_regclass('public.hallazgo_documento')      as m0007,
  to_regclass('public.platform_admin')          as m0008,
  to_regclass('public.parametro_regulatorio')   as m0011,
  (select count(*) from organizations where perfil_actividad = 'notarias') as org_notaria,
  (select count(*) from tipologia_av where sector = 'XII')                 as tipologias_xii,
  public.parametro_vigente('uma_diaria')        as uma_vigente;
```

Si `uma_vigente` sale `null`, **el Motor PLD devuelve 422 y no corre**: es a propósito, no un
error. Calcular umbrales sin UMA vigente produciría hallazgos falsos.


---

## Quién entra a la consola de plataforma

La consola de Kawiil **no tiene usuarios propios**: usa el mismo usuario de Supabase Auth,
pero exige una fila en `platform_admin` (migration 0008). Es un privilegio **global**,
distinto de los roles por organización de `user_roles`.

Confirmado el 29 de agosto de 2026 contra el remoto: **`leo.bassoco@kawiil.mx`** ya lo tiene,
otorgado ese mismo día. No hace falta correr nada; se entra a la consola con ese correo y su
contraseña de Supabase.

Para ver el estado o agregar a alguien más: `supabase/manual/bootstrap_platform_admin.sql`.
El script es seguro de correr siempre — si ya hay administradores, lo dice y no toca nada.

## Cómo darle a Claude acceso al remoto

Está pedido y la herramienta ya existe: `scripts/sql-remoto.sh`. Falta **una sola cosa**,
y no es una credencial.

### El bloqueo es de red, no de permisos

El entorno remoto donde corre Claude Code sale a internet por un proxy con una lista de
dominios permitidos. Hoy `supabase.com`, `api.supabase.com` y `*.supabase.co` no están en
ella: el gateway responde **403 al CONNECT**. Además sólo deja salir HTTP(S), no TCP crudo,
así que `psql` al puerto 5432 no funcionaría ni con la contraseña en la mano.

Comprobarlo en cualquier momento:

```bash
curl -sS "$HTTPS_PROXY/__agentproxy/status" | grep -A4 recentRelayFailures
```

**Un token de Supabase, por sí solo, no cambia nada.** Con la red cerrada, la petición no
llega a salir.

### Los dos pasos

1. **Permitir `api.supabase.com`** en la política de red del entorno de Claude Code. Se
   elige al crear el entorno, desde claude.ai/code → configuración del entorno. Documentado
   en https://code.claude.com/docs/en/claude-code-on-the-web
   Con ese dominio basta: la API de gestión ejecuta SQL sobre HTTPS y no hace falta abrir
   `*.supabase.co` ni el puerto de Postgres.

2. **Un personal access token de Supabase**, en `SUPABASE_ACCESS_TOKEN` o en
   `~/.config/supabase/pat`. Se crea en https://supabase.com/dashboard/account/tokens

   Dos cosas antes de generarlo: los tokens de Supabase son **de cuenta, no de proyecto**
   —quien lo tenga alcanza todos los proyectos de la organización— y se revocan en esa
   misma página cuando ya no hagan falta.

Lo que se configure en Cowork **no sirve aquí**: son entornos distintos, cada uno con su
propia política de red.

### Ya listo de este lado

`scripts/sql-remoto.sh` va por la API de gestión y distingue los tres fallos, para no
mandar a nadie a perseguir el problema equivocado: falta de token, token rechazado, o red
cerrada. Hoy responde lo tercero.

```bash
./scripts/sql-remoto.sh "select count(*) from client;"
./scripts/sql-remoto.sh -f supabase/manual/00_estado_migraciones.sql
```

`.gitignore` cubre `.env`, `.env.*` y `*.pat`, y el token nunca se imprime ni se escribe en
el repo.

## Antecedente

La pregunta salió en la sesión del 29 de agosto de 2026 y la respuesta no es de credenciales:
**el entorno remoto donde corre Claude Code bloquea `supabase.com` y `*.supabase.co` en su
política de red** (el proxy responde 403 al CONNECT), y además sólo deja salir HTTP(S), no
TCP crudo, así que `psql` al puerto 5432 tampoco funcionaría aunque el dominio estuviera
permitido.

Un token de acceso de Supabase, por sí solo, **no arregla nada**. Para que Claude pudiera
aplicar migrations sin intermediario harían falta las dos cosas:

1. Permitir `api.supabase.com` en la política de red del entorno de Claude Code
   (se elige al crear el entorno; ver
   https://code.claude.com/docs/en/claude-code-on-the-web).
2. Un **personal access token** de Supabase, para usar
   `POST https://api.supabase.com/v1/projects/{ref}/database/query`, que sí ejecuta SQL
   sobre HTTPS.

Sobre el token, dos cosas que conviene saber antes de crear uno: los de Supabase son de
**cuenta**, no de proyecto —quien lo tenga alcanza todos los proyectos de la organización—,
y se revocan en https://supabase.com/dashboard/account/tokens cuando ya no haga falta.

Mientras eso no exista, el camino es el de arriba: el diagnóstico dice qué falta y los
bundles se pegan en el SQL Editor. Con el diagnóstico son un par de minutos, no una tarde.
