-- =====================================================================
-- Ikán · Migration 0022 · Cierre de fuga entre organizaciones
-- =====================================================================
-- Tres agujeros que estaban ACTIVOS en producción desde la migration 0001.
-- Los tres se verificaron uno por uno antes de escribir esto; ninguno es
-- teórico.
--
-- 1. `v_user_roles_simple` (0001, línea 197) se creó sin `security_invoker`.
--    Una vista sin esa opción corre con los privilegios de su DUEÑO, así que
--    el RLS de `user_profile` y `user_roles` no se aplica. Y PostgREST expone
--    toda vista del esquema `public`. Resultado: cualquier usuario autenticado
--    de cualquier organización podía leer nombre, correo, organización y roles
--    de TODOS los usuarios de TODOS los clientes. En una plataforma de
--    cumplimiento eso es la lista de oficiales de cumplimiento de la
--    competencia.
--
-- 2. `user_profile_update_admin_or_self` se escribió con `using` y sin
--    `with check`, lo que en principio dejaría a un usuario mudarse de
--    organización editándose el perfil.
--
--    OJO — se reprodujo en PostgreSQL 16 y NO era explotable. Lo frenaba otra
--    política: `user_profile_select_same_org`. PostgreSQL exige que la fila
--    RESULTANTE de un UPDATE siga siendo visible bajo las políticas de
--    lectura, y `organization_id = current_org_id()` deja de cumplirse en
--    cuanto cambias de organización, así que el motor rechaza el cambio.
--
--    El `with check` se pone igual, y por una razón concreta: hoy la
--    protección depende de un efecto lateral de una política de SELECT que
--    alguien podría relajar mañana sin darse cuenta de lo que sostiene. Que la
--    regla esté escrita donde corresponde no es redundancia, es que deje de
--    ser frágil. Es endurecimiento, no el cierre de un agujero activo.
--
-- 3. `current_org_id()` y `has_rol()` son SECURITY DEFINER sin `search_path`
--    fijo. Son las dos funciones de las que cuelga todo el RLS del sistema.
--
-- Origen del arreglo: rama `devin/1787247611-security-hardening`, que nunca se
-- mergeó y cuyo número 0007 chocaba con `0007_hallazgo_expediente.sql`. Aquí
-- entra renumerado, hecho idempotente y con las pruebas que faltaban.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Las dos funciones de las que cuelga todo el RLS
-- ---------------------------------------------------------------------
-- `search_path = ''` obliga a calificar cada nombre. Es más estricto que
-- apuntar a `public`: con la cadena vacía no hay esquema donde alguien pueda
-- colocar un `user_profile` propio que la función acabe leyendo.
create or replace function public.current_org_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select organization_id
  from public.user_profile
  where id = auth.uid()
  limit 1
$$;

create or replace function public.has_rol(target_rol public.rol_usuario)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.organization_id = public.current_org_id()
      and ur.rol = target_rol
  )
$$;

-- ---------------------------------------------------------------------
-- 2. La vista que exponía el directorio completo de la plataforma
-- ---------------------------------------------------------------------
-- Se recrea con la MISMA definición más la opción, en vez de un `alter view`
-- suelto: así la migration deja la vista en un estado conocido aunque en algún
-- entorno no exista todavía. Las dos formas exigen ser dueño de la vista —por
-- eso esto entra como migration y no por la API de gestión, que corre con otro
-- rol y devuelve error de propiedad.
create or replace view public.v_user_roles_simple
with (security_invoker = true) as
  select up.id as user_id, up.nombre, up.email, up.organization_id,
         coalesce(array_agg(ur.rol order by ur.rol) filter (where ur.rol is not null), '{}') as roles
  from public.user_profile up
  left join public.user_roles ur on ur.user_id = up.id
  group by up.id;

comment on view public.v_user_roles_simple is
  'Perfil y roles. security_invoker: respeta el RLS de quien consulta. Sin esa opción exponía el directorio de usuarios de TODAS las organizaciones (corregido en 0022).';

-- ---------------------------------------------------------------------
-- 3. La política que permitía mudarse de organización
-- ---------------------------------------------------------------------
-- El `with check` fija dos cosas sobre la fila resultante: que la organización
-- siga siendo la misma, y que sólo te edites a ti o seas admin.
--
-- Por qué `organization_id = public.current_org_id()` sí frena la mudanza:
-- `current_org_id()` es STABLE, así que dentro de la misma sentencia lee la
-- foto anterior de `user_profile` — la organización de ANTES del UPDATE. La
-- fila nueva se compara contra ella. Si algún día se vuelve VOLATILE, esta
-- protección se cae sin ruido; hay una prueba que lo cubre en
-- supabase/manual/probar_0022_fuga.sql.
drop policy if exists "user_profile_update_admin_or_self" on user_profile;
create policy "user_profile_update_admin_or_self" on user_profile
  for update using (
    id = auth.uid() or (organization_id = public.current_org_id() and public.has_rol('admin'))
  )
  with check (
    organization_id = public.current_org_id()
    and (id = auth.uid() or public.has_rol('admin'))
  );

-- ---------------------------------------------------------------------
-- 4. La otra vista sin security_invoker, que se queda así a propósito
-- ---------------------------------------------------------------------
-- `v_listas_estado` (0017) tampoco lo tiene, y NO es el mismo caso: sólo lee
-- datos de plataforma —catálogo de listas restrictivas, conteos y fechas— que
-- son idénticos para todos los clientes. No cruza ninguna tabla con
-- `organization_id`. Existe precisamente para que un cliente vea la fecha de
-- actualización sin ver las cargas de Kawiil.
--
-- Se anota aquí para que la próxima auditoría que corra "toda vista debe tener
-- security_invoker" sepa por qué ésta no, y no la cambie rompiendo la pantalla
-- de Listas.
comment on view public.v_listas_estado is
  'Estado de cada lista restrictiva: fecha de la fuente y conteos. SIN security_invoker A PROPÓSITO (revisado en 0022): sólo expone datos de plataforma, iguales para todos los clientes, y ninguna fila de lista_carga. No confundir con el caso de v_user_roles_simple.';
