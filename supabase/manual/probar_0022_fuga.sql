-- =====================================================================
-- Ikán · Pruebas de la migration 0022 (fuga entre organizaciones)
-- =====================================================================
-- NO se corre en el remoto: crea organizaciones y usuarios de prueba, fuerza
-- RLS y restaura políticas viejas para reproducir el agujero. Es para el
-- PostgreSQL desechable.
--
-- Corre como el rol `probador`, que NO es superusuario ni dueño de las tablas:
-- un superusuario se salta el RLS SIEMPRE, incluso con FORCE, así que probar
-- como postgres no probaría nada.
--
-- Imprime A1 a A2 (cómo estaba) y B1 a B4 (con el arreglo).
-- =====================================================================

create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('ikan.uid', true), '')::uuid $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'probador') then create role probador; end if;
end $$;
grant usage on schema public, auth to probador;
grant select, insert, update on user_profile, user_roles to probador;
grant select on v_user_roles_simple, organizations to probador;
grant execute on function public.current_org_id(), public.has_rol(public.rol_usuario), auth.uid() to probador;
alter table user_profile force row level security;
alter table user_roles force row level security;

insert into organizations (id, rfc, razon_social, sectores)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'FUGA010101AA1', 'Notaría A', array['XII']::sector_av[]),
       ('bbbbbbbb-0000-0000-0000-000000000002', 'FUGA010101BB2', 'Exchange B', array['XVI']::sector_av[])
on conflict (id) do nothing;
insert into auth.users (id, email) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'ana@notariaa.mx'),
  ('bbbbbbbb-2222-0000-0000-000000000002', 'beto@exchangeb.mx')
on conflict (id) do nothing;
insert into user_profile (id, organization_id, nombre, email) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ana', 'ana@notariaa.mx'),
  ('bbbbbbbb-2222-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Beto', 'beto@exchangeb.mx')
on conflict (id) do nothing;
insert into user_roles (user_id, organization_id, rol) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'oc'),
  ('bbbbbbbb-2222-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'oc')
on conflict do nothing;
update user_profile set organization_id = 'aaaaaaaa-0000-0000-0000-000000000001'
 where id = 'aaaaaaaa-1111-0000-0000-000000000001';

-- =====================================================================
-- A · Cómo estaba antes de la 0022
-- =====================================================================
drop policy if exists "user_profile_update_admin_or_self" on user_profile;
create policy "user_profile_update_admin_or_self" on user_profile
  for update using (
    id = auth.uid() or (organization_id = public.current_org_id() and public.has_rol('admin'))
  );
-- CREATE OR REPLACE VIEW conserva las opciones existentes, así que para
-- volver al estado vulnerable hay que quitar la opción explícitamente.
alter view public.v_user_roles_simple reset (security_invoker);
grant select on v_user_roles_simple to probador;

set role probador;
set "ikan.uid" = 'aaaaaaaa-1111-0000-0000-000000000001';

select case when count(*) > 1
            then 'A1 · FUGA REPRODUCIDA: Ana ve ' || count(*) || ' usuarios, incluidos los de otra organización'
            else 'A1 · inesperado: la vista no filtró como se creía (' || count(*) || ')' end as antes
  from v_user_roles_simple;

do $$
begin
  update user_profile set organization_id = 'bbbbbbbb-0000-0000-0000-000000000002'
   where id = 'aaaaaaaa-1111-0000-0000-000000000001';
  raise notice 'A2 · Ana SÍ se pudo mudar de organización';
exception when others then
  -- Hallazgo del 29/08/2026: la mudanza NUNCA fue explotable. No la frenaba la
  -- política de UPDATE —que efectivamente carecía de with check— sino la de
  -- SELECT: PostgreSQL exige que la fila resultante siga siendo visible bajo
  -- las políticas de lectura, y `organization_id = current_org_id()` deja de
  -- cumplirse en cuanto cambias de organización. El with check de la 0022 se
  -- pone igual, para no depender de un efecto lateral de otra política.
  raise notice 'A2 · la mudanza ya estaba bloqueada, pero por la política de SELECT, no por la de UPDATE (%)', sqlerrm;
end $$;
reset role;

-- =====================================================================
-- B · Con el arreglo de la 0022
-- =====================================================================
alter view public.v_user_roles_simple set (security_invoker = true);
drop policy if exists "user_profile_update_admin_or_self" on user_profile;
create policy "user_profile_update_admin_or_self" on user_profile
  for update using (
    id = auth.uid() or (organization_id = public.current_org_id() and public.has_rol('admin'))
  )
  with check (
    organization_id = public.current_org_id()
    and (id = auth.uid() or public.has_rol('admin'))
  );

set role probador;
set "ikan.uid" = 'aaaaaaaa-1111-0000-0000-000000000001';

select case when count(*) = 1
            then 'B1 · CERRADA: Ana ve sólo ' || count(*) || ' usuario, el de su organización'
            else 'B1 · FALLA: Ana sigue viendo ' || count(*) || ' usuarios' end as despues
  from v_user_roles_simple;

do $$
begin
  update user_profile set organization_id = 'bbbbbbbb-0000-0000-0000-000000000002'
   where id = 'aaaaaaaa-1111-0000-0000-000000000001';
  raise exception 'B2 · FALLA: Ana se pudo mudar de organización';
exception when insufficient_privilege then
  raise notice 'B2 · la mudanza de organización queda bloqueada';
end $$;

do $$
begin
  update user_profile set nombre = 'Ana María'
   where id = 'aaaaaaaa-1111-0000-0000-000000000001';
  if not found then raise exception 'B3 · FALLA: Ana ya no puede editar su propio perfil'; end if;
  raise notice 'B3 · Ana sigue pudiendo editar su propio perfil';
end $$;

select 'B4 · las dos funciones del RLS con search_path fijo: ' ||
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('current_org_id','has_rol')
           and array_to_string(p.proconfig, ',') like '%search_path%')::text || ' de 2' as despues;
reset role;
