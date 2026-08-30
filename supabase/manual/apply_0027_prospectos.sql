-- =====================================================================
-- Ikán · Aplicar migration 0027 en el SQL Editor / API de gestión
-- =====================================================================
-- prospect_intake existía con RLS activo y CERO políticas: la escribía la
-- Edge Function on-prospect-intake con service_role, que salta RLS, y nadie
-- más podía leerla.
--
-- Esta migration abre UNA sola puerta de lectura, y sólo para los
-- administradores de plataforma de Kawiil. Sigue sin políticas de escritura:
-- el único que escribe es service_role.
--
-- Idempotente y en transacción. Las 6 comprobaciones del final abortan si hay
-- más de una política, si la política no es SELECT o si aparece cualquier
-- política de escritura.
-- =====================================================================

begin;

-- =====================================================================
-- Ikán · Migration 0027 · prospect_intake: lectura sólo para Kawiil
-- =====================================================================
-- No tocamos la tabla. Sólo le ponemos una política de SELECT restringida.
--
-- La Edge Function on-prospect-intake sigue usando SUPABASE_SERVICE_ROLE_KEY,
-- por lo que no pasa por RLS. Si se cambiara eso, dejaría de escribir y habría
-- que repensar el modelo, no añadirle INSERT a una política.
drop policy if exists "prospect_intake_select_kawiil" on prospect_intake;
create policy "prospect_intake_select_kawiil" on prospect_intake
  for select using (public.es_admin_kawiil());

comment on table prospect_intake is
  'Prospectos que llenan el formulario público. La escribe la Edge Function on-prospect-intake con service_role. RLS activo: sólo los administradores de plataforma de Kawiil pueden leer (migration 0027).';

-- =====================================================================
-- Verificación · 6 comprobaciones
-- =====================================================================
-- Si alguna falla, la transacción se aborta y nada queda aplicado.
do $$
declare
  v_n int;
  v_cmd text;
  v_qual text;
  v_polname text;
begin
  -- 1. La tabla existe.
  if to_regclass('public.prospect_intake') is null then
    raise exception 'FALLA 1: prospect_intake no existe';
  end if;

  -- 2. RLS está activo.
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'prospect_intake' and rowsecurity
  ) then
    raise exception 'FALLA 2: prospect_intake no tiene RLS activo';
  end if;

  -- 3. Exactamente una política.
  select count(*) into v_n
    from pg_policies
   where schemaname = 'public' and tablename = 'prospect_intake';
  if v_n <> 1 then
    raise exception 'FALLA 3: prospect_intake tiene % política(s), debe tener exactamente 1', v_n;
  end if;

  -- 4. Esa única política es SELECT.
  select policyname, cmd into v_polname, v_cmd
    from pg_policies
   where schemaname = 'public' and tablename = 'prospect_intake';
  if v_cmd <> 'SELECT' then
    raise exception 'FALLA 4: la política % de prospect_intake es %, debe ser SELECT',
      v_polname, v_cmd;
  end if;

  -- 5. Su expresión using evalúa es_admin_kawiil().
  select qual::text into v_qual
    from pg_policies
   where schemaname = 'public' and tablename = 'prospect_intake';
  if v_qual is null or v_qual not like '%es_admin_kawiil%' then
    raise exception 'FALLA 5: la política % no evalúa es_admin_kawiil(): %',
      v_polname, v_qual;
  end if;

  -- 6. No hay políticas de escritura. Si alguien agregó INSERT/UPDATE/DELETE/ALL,
  --    abortamos antes del commit.
  select count(*) into v_n
    from pg_policies
   where schemaname = 'public' and tablename = 'prospect_intake'
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  if v_n > 0 then
    raise exception 'FALLA 6: prospect_intake tiene % política(s) de escritura; se aborta',
      v_n;
  end if;
end $$;

select 'prospect_intake (Kawiil)' as bundle,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'prospect_intake')::text
         || ' política(s)' as politicas,
       (select cmd from pg_policies
         where schemaname = 'public' and tablename = 'prospect_intake') as cmd,
       (select policyname from pg_policies
         where schemaname = 'public' and tablename = 'prospect_intake') as nombre,
       (select case when qual::text like '%es_admin_kawiil%' then 'sí' else 'no' end
          from pg_policies
         where schemaname = 'public' and tablename = 'prospect_intake') as solo_kawiil,
       (select count(*) from prospect_intake)::text || ' prospectos' as datos;

commit;
