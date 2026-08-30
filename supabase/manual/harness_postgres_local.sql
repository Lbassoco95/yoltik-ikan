-- =====================================================================
-- Ikán · Banco de pruebas local que se parece a Supabase
-- =====================================================================
-- Se corre UNA vez sobre una base PostgreSQL 16 desechable, ANTES de aplicarle
-- las migrations, para probar un bundle sin tocar producción.
--
-- No es un stub cualquiera: cada línea de aquí existe porque su ausencia dejó
-- pasar un error hasta producción. Un banco de pruebas más permisivo que el
-- entorno real no prueba nada — sólo da confianza falsa.
--
--   30/ago/2026 · La 0021 revocaba EXECUTE sólo de PUBLIC. En un PostgreSQL
--   limpio bastaba; en Supabase hay un ALTER DEFAULT PRIVILEGES que se lo da
--   DIRECTO a anon y authenticated, así que la función seguía abierta. Lo
--   atrapó la verificación al aplicarla, no las pruebas.
--
--   30/ago/2026 · La misma 0021 armaba el nonce con gen_random_bytes(), de
--   pgcrypto. En un PostgreSQL limpio pgcrypto cae en `public` y se veía; en
--   Supabase vive en el esquema `extensions` y la función, con search_path
--   fijo, no la alcanzaba. Rompió TODA alta en producción, porque la bitácora
--   cuelga de siete triggers.
--
-- Uso:
--   createdb prueba
--   psql -d prueba -f supabase/manual/harness_postgres_local.sql
--   psql -d prueba -f supabase/migrations/0001_initial_schema.sql   (y siguientes)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Esquemas que Supabase trae de fábrica
-- ---------------------------------------------------------------------
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

-- ---------------------------------------------------------------------
-- 2. Las extensiones viven en `extensions`, NO en `public`
-- ---------------------------------------------------------------------
-- Esto es lo que rompió la 0021. Una función con search_path fijo que llame a
-- gen_random_bytes, digest o crypt sin calificar, falla aquí igual que en
-- producción. Que falle aquí es el punto.
create extension if not exists pgcrypto schema extensions;
create extension if not exists btree_gist schema extensions;

-- ---------------------------------------------------------------------
-- 3. auth mínimo
-- ---------------------------------------------------------------------
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('ikan.uid', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb
  language sql stable as $$ select '{}'::jsonb $$;

-- ---------------------------------------------------------------------
-- 4. storage mínimo
-- ---------------------------------------------------------------------
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid, metadata jsonb
);
create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;

-- ---------------------------------------------------------------------
-- 5. Los roles de Supabase
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  -- Rol sin privilegios para probar RLS: un superusuario se salta el RLS
  -- SIEMPRE, incluso con FORCE, así que probar como postgres no prueba nada.
  if not exists (select 1 from pg_roles where rolname = 'probador') then create role probador; end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. El ALTER DEFAULT PRIVILEGES que sí tiene Supabase
-- ---------------------------------------------------------------------
-- Sin esta línea, un `revoke ... from public` parece suficiente y no lo es.
-- Ésta es la que hace que las pruebas encuentren el hueco.
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

grant usage on schema public, auth, extensions to anon, authenticated, service_role, probador;
