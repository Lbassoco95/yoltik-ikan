-- =====================================================================
-- Ikán · Aplicar migration 0027 en el SQL Editor / API de gestión
-- =====================================================================
-- Abre una puerta y sólo una: que KAWIIL pueda ver a sus prospectos.
--
-- Desde la 0023 el formulario público escribe en `prospect_intake` y la tabla
-- quedó con RLS activo y cero políticas, a propósito. El efecto no previsto es
-- que tampoco puede leerla Kawiil: quien llena el formulario del sitio entra a
-- la base y NADIE lo ve nunca.
--
-- Las organizaciones cliente siguen sin verla, y ahí el comentario de la 0023
-- sigue vigente palabra por palabra.
--
-- No toca ningún dato. Idempotente y en transacción.
-- =====================================================================

begin;

-- =====================================================================
-- 0027 · Que Kawiil pueda ver a sus prospectos (D-2)
-- =====================================================================
-- Desde la migration 0023 el formulario público escribe en `prospect_intake`
-- y la tabla quedó con RLS activo y CERO políticas, a propósito: la escribe la
-- Edge Function con service_role y nadie más debía leerla.
--
-- El efecto no previsto es que tampoco puede leerla KAWIIL. Quien llena el
-- formulario del sitio entra a la base y NADIE lo ve nunca. Un embudo comercial
-- que no se puede consultar es lo mismo que no tenerlo.
--
-- Se abre exactamente una puerta: lectura para administradores de plataforma.
-- No se abre para las organizaciones cliente, y ahí el comentario de la 0023
-- sigue vigente palabra por palabra: son datos de contacto de prospectos
-- —nombre, correo, teléfono y qué tan avanzado va su cumplimiento— que no le
-- tocan a ningún cliente de Ikán.
--
-- Y se abre SÓLO lectura. Marcar un prospecto como atendido se hace con una
-- función acotada, no dándole `update` a la tabla: con update abierto, un
-- administrador podría reescribir el nombre o el correo con el que alguien se
-- registró, y ese dato es la constancia de lo que la persona escribió.
-- =====================================================================

-- Explícito, sin depender del ALTER DEFAULT PRIVILEGES de Supabase: lo que
-- protege la tabla tiene que ser la política de abajo, no el azar de que a
-- alguien se le olvidara un GRANT. Con RLS activo, el GRANT por sí solo no
-- abre nada.
grant select on prospect_intake to authenticated;

drop policy if exists "prospect_intake_select_kawiil" on prospect_intake;
create policy "prospect_intake_select_kawiil" on prospect_intake
  for select using (public.es_admin_kawiil());

comment on table prospect_intake is
  'Prospectos que llenan el formulario público. La escribe la Edge Function '
  'on-prospect-intake con service_role. Sólo LECTURA para administradores de '
  'plataforma (migration 0027); ninguna organización cliente la ve.';

-- ---------------------------------------------------------------------
-- Estado del prospecto, sin poder tocar lo que la persona escribió
-- ---------------------------------------------------------------------
-- `status` nace en 'nuevo' (migration 0023). Los demás valores no estaban
-- acotados en ninguna parte, así que se fijan aquí antes de que la pantalla
-- empiece a escribirlos y cada quien invente el suyo.

create or replace function public.marcar_prospecto(
  p_id uuid,
  p_status text,
  p_notas text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_kawiil() then
    raise exception 'Sólo un administrador de plataforma puede mover un prospecto.';
  end if;

  if p_status not in ('nuevo', 'contactado', 'en_diagnostico', 'cliente', 'descartado') then
    raise exception 'Estado "%" no válido para un prospecto.', p_status;
  end if;

  update public.prospect_intake
     set status = p_status,
         -- Las notas se AÑADEN, no se sustituyen: son el historial de lo que
         -- se habló con esa persona, y perderlo al escribir la siguiente sería
         -- perder el motivo por el que el prospecto está donde está.
         notas = case
                   when p_notas is null or btrim(p_notas) = '' then notas
                   when notas is null or btrim(notas) = '' then p_notas
                   else notas || E'\n---\n' || p_notas
                 end,
         updated_at = now()
   where id = p_id;

  if not found then
    raise exception 'No existe el prospecto %.', p_id;
  end if;
end;
$$;

comment on function public.marcar_prospecto(uuid, text, text) is
  'Mueve un prospecto de estado y le añade una nota. Acotada a propósito: con '
  'un update abierto se podría reescribir el nombre o el correo con el que '
  'alguien se registró, y eso es la constancia de lo que esa persona escribió.';

-- PostgreSQL otorga EXECUTE a PUBLIC en cada función nueva, y Supabase además
-- lo da directo a anon/authenticated por ALTER DEFAULT PRIVILEGES. La función
-- comprueba el privilegio por dentro, pero no hay razón para dejarla al
-- alcance de quien no es de Kawiil.
revoke all on function public.marcar_prospecto(uuid, text, text) from public, anon;

-- ---------------------------------------------------------------------
-- Resumen del embudo
-- ---------------------------------------------------------------------
-- Con security_invoker para que la RLS de arriba decida quién lo ve, y no la
-- vista. Sin él, cualquiera con acceso a la vista vería el conteo de
-- prospectos de Kawiil.
drop view if exists v_prospectos_resumen;
create view v_prospectos_resumen with (security_invoker = true) as
select
  coalesce(status, 'nuevo') as status,
  count(*)                  as cuantos,
  max(created_at)           as mas_reciente
from public.prospect_intake
group by coalesce(status, 'nuevo');

comment on view v_prospectos_resumen is
  'Cuántos prospectos hay en cada estado. Sólo la ve Kawiil, por la RLS de la tabla.';

-- =====================================================================
-- Verificación · si algo falla, la transacción no llega al commit
-- =====================================================================
do $$
declare v_n int;
begin
  -- 1. Una sola política, y de lectura. Si aparece una de escritura, alguien
  --    le dio a un administrador la capacidad de reescribir el nombre o el
  --    correo con el que un prospecto se registró.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'prospect_intake';
  if v_n <> 1 then
    raise exception 'FALLA 1: prospect_intake tiene % políticas, debe tener 1', v_n;
  end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'prospect_intake' and cmd <> 'SELECT';
  if v_n <> 0 then
    raise exception 'FALLA 1b: hay % política(s) de escritura en prospect_intake', v_n;
  end if;

  -- 2. La RLS sigue encendida: sin ella la política no protege nada.
  if not exists (select 1 from pg_tables
                  where schemaname = 'public' and tablename = 'prospect_intake'
                    and rowsecurity) then
    raise exception 'FALLA 2: prospect_intake sin RLS';
  end if;

  -- 3. La función y la vista existen
  if to_regprocedure('public.marcar_prospecto(uuid,text,text)') is null then
    raise exception 'FALLA 3: falta marcar_prospecto';
  end if;
  if to_regclass('public.v_prospectos_resumen') is null then
    raise exception 'FALLA 3b: falta v_prospectos_resumen';
  end if;

  -- 4. La vista respeta la RLS de quien consulta. Sin security_invoker, el
  --    conteo del embudo de Kawiil se le escapa a cualquiera.
  if not exists (
    select 1 from pg_class c
     where c.relname = 'v_prospectos_resumen'
       and c.reloptions::text like '%security_invoker=true%') then
    raise exception 'FALLA 4: v_prospectos_resumen sin security_invoker';
  end if;

  -- 5. La función es SECURITY DEFINER y no quedó al alcance de cualquiera.
  --    En Supabase el ALTER DEFAULT PRIVILEGES la abre sola: nos costó la 0021.
  if has_function_privilege('anon', 'public.marcar_prospecto(uuid,text,text)', 'execute') then
    raise exception 'FALLA 5: marcar_prospecto quedó abierta a anon';
  end if;

  -- 6. Las cadenas de bitácora siguen íntegras: esto no las toca.
  select count(*) into v_n from cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  if v_n <> 0 then raise exception 'FALLA 6: % cadena(s) rota(s)', v_n; end if;
end $$;

select 'prospectos visibles para Kawiil' as bundle,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'prospect_intake')::text
         || ' política (sólo lectura, sólo Kawiil)' as rls,
       (select count(*) from prospect_intake)::text || ' prospectos en la tabla' as datos,
       (select count(*) from platform_admin)::text || ' admin(s) de plataforma que los ven' as quien,
       '6 comprobaciones pasaron' as verificacion;

commit;
