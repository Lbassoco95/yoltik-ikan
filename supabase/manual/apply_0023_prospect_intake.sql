-- =====================================================================
-- Ikán · Aplicar migration 0023 en el SQL Editor / API de gestión
-- =====================================================================
-- `prospect_intake` ya existe en producción, así que aquí esta migration es un
-- NO-OP. No cambia nada.
--
-- Lo que sí hace es COMPARAR: la verificación coteja columna por columna lo que
-- declara el repo contra lo que hay en la base, y revienta si difieren. Es la
-- red que faltaba — el DDL se transcribió de una consulta a producción, y si me
-- equivoqué en un tipo, esto lo dice en vez de dejar que el repo y la base se
-- separen en silencio.
--
-- Idempotente y en transacción.
-- =====================================================================

begin;

-- =====================================================================
-- Ikán · Migration 0023 · prospect_intake
-- =====================================================================
-- Esta tabla EXISTE en producción desde antes y no tenía migration en ningún
-- repo. Era el último objeto sin respaldo: sin ella, un `supabase db reset` o
-- una base nueva quedaban sin la tabla que la Edge Function `on-prospect-intake`
-- necesita, y nadie se enteraba hasta que un prospecto llenara el formulario.
--
-- El DDL NO está reconstruido de memoria ni deducido del código de la Edge
-- Function: sale de consultar `information_schema` en producción el 30 de
-- agosto de 2026. Orden de columnas, nulabilidad y defaults son los que
-- devolvió esa consulta.
--
-- En producción esta migration es un no-op (`if not exists`). Su valor está en
-- las bases nuevas y en la verificación del bundle, que compara columna por
-- columna contra lo que haya en la base: si el repo y producción se separan,
-- lo dice en vez de dejarlo pasar.
-- =====================================================================

create table if not exists prospect_intake (
  id uuid primary key default gen_random_uuid(),

  razon_social text not null,
  rfc text not null,
  regimen_fiscal text,
  -- Varias fracciones del artículo 17 a la vez: un sujeto obligado puede
  -- operar más de una actividad vulnerable.
  actividad_vulnerable text[] not null,
  estado_operacion text,

  volumen_ops_mes integer,
  clientes_activos integer,
  tiene_oc_designado boolean,
  registrado_sppld boolean,
  tiene_manual_pld boolean,

  contacto_nombre text not null,
  contacto_cargo text,
  contacto_email text not null,
  contacto_telefono text,

  ciudad text,
  estado_republica text,
  origen text,
  notas text,

  consentimiento_privacidad boolean not null,
  consentimiento_contacto boolean not null,

  created_at timestamptz default now(),
  status text default 'nuevo',
  -- Respuestas propias del fedatario que no caben en las columnas fijas.
  extra_fedatario jsonb,
  updated_at timestamptz not null default now()
);

comment on table prospect_intake is
  'Prospectos que llenan el formulario público. La escribe la Edge Function on-prospect-intake con service_role. RLS activo y CERO políticas a propósito: ver el comentario de abajo.';

-- ---------------------------------------------------------------------
-- RLS activo y sin políticas — es correcto, no es un descuido
-- ---------------------------------------------------------------------
-- Con RLS activo y ninguna política, la tabla es ilegible e inescribible para
-- todo rol que pase por RLS. Es exactamente lo que se busca:
--
--   · La Edge Function `on-prospect-intake` escribe con SUPABASE_SERVICE_ROLE_KEY,
--     que salta RLS por diseño. Por eso funciona.
--   · Nadie más debe leerla. Son datos de contacto de prospectos —nombre,
--     correo, teléfono, y qué tan avanzado va su cumplimiento—: información
--     comercial sensible que no le toca a ninguna organización cliente.
--
-- SI ALGUIEN VE QUE `select * from prospect_intake` DEVUELVE VACÍO: no está
-- rota. Está haciendo su trabajo. Añadirle un `using (true)` para "arreglarla"
-- publicaría la lista de prospectos de Kawiil a todos los usuarios de todos los
-- clientes.
alter table prospect_intake enable row level security;

-- =====================================================================
-- Verificación · el repo contra la base
-- =====================================================================
do $$
declare
  v_dif text;
  v_n int;
begin
  -- 1. Las 25 columnas, con su tipo y nulabilidad, tal como las declara el repo.
  --    `udt_name` y no `data_type` a propósito: data_type dice 'ARRAY' para
  --    cualquier arreglo y no distingue text[] de varchar[], que es justo la
  --    diferencia que hay que atrapar.
  select string_agg(esperado.columna || ' (repo: ' || esperado.tipo ||
                    ', base: ' || coalesce(real.udt_name, 'NO EXISTE') || ')', '; ')
    into v_dif
  from (values
    ('id','uuid'), ('razon_social','text'), ('rfc','text'), ('regimen_fiscal','text'),
    ('actividad_vulnerable','_text'), ('estado_operacion','text'),
    ('volumen_ops_mes','int4'), ('clientes_activos','int4'),
    ('tiene_oc_designado','bool'), ('registrado_sppld','bool'), ('tiene_manual_pld','bool'),
    ('contacto_nombre','text'), ('contacto_cargo','text'), ('contacto_email','text'),
    ('contacto_telefono','text'), ('ciudad','text'), ('estado_republica','text'),
    ('origen','text'), ('notas','text'),
    ('consentimiento_privacidad','bool'), ('consentimiento_contacto','bool'),
    ('created_at','timestamptz'), ('status','text'), ('extra_fedatario','jsonb'),
    ('updated_at','timestamptz')
  ) as esperado(columna, tipo)
  left join information_schema.columns real
    on real.table_schema = 'public' and real.table_name = 'prospect_intake'
   and real.column_name = esperado.columna
  where real.udt_name is distinct from esperado.tipo;

  if v_dif is not null then
    raise exception 'El repo y la base no coinciden en prospect_intake: %', v_dif;
  end if;

  -- 2. Nada de columnas en la base que el repo no conozca.
  select string_agg(column_name, ', ') into v_dif
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'prospect_intake'
     and c.column_name not in (
       'id','razon_social','rfc','regimen_fiscal','actividad_vulnerable','estado_operacion',
       'volumen_ops_mes','clientes_activos','tiene_oc_designado','registrado_sppld',
       'tiene_manual_pld','contacto_nombre','contacto_cargo','contacto_email',
       'contacto_telefono','ciudad','estado_republica','origen','notas',
       'consentimiento_privacidad','consentimiento_contacto','created_at','status',
       'extra_fedatario','updated_at');
  if v_dif is not null then
    raise exception 'La base tiene columnas que el repo no declara: %', v_dif;
  end if;

  -- 3. RLS activo. Sin esto la tabla sería legible por cualquiera.
  if not exists (select 1 from pg_class
                  where oid = 'public.prospect_intake'::regclass and relrowsecurity) then
    raise exception 'prospect_intake quedó SIN RLS: sería legible por cualquier usuario';
  end if;

  -- 4. Y CERO políticas. Si alguien le puso una, hay que mirarla antes de seguir:
  --    un `using (true)` publicaría la lista de prospectos de Kawiil.
  select count(*) into v_n from pg_policy where polrelid = 'public.prospect_intake'::regclass;
  if v_n <> 0 then
    raise exception 'prospect_intake tiene % política(s). Debe tener CERO: la escribe service_role, que salta RLS, y nadie más debe leerla.', v_n;
  end if;
end $$;

select 'prospect_intake' as bundle,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'prospect_intake')::text
         || ' columnas, iguales al repo' as esquema,
       case when (select relrowsecurity from pg_class where oid = 'public.prospect_intake'::regclass)
            then 'activo' else 'APAGADO — revisar' end as rls,
       (select count(*) from pg_policy where polrelid = 'public.prospect_intake'::regclass)::text
         || ' políticas (debe ser 0)' as politicas,
       (select count(*) from prospect_intake)::text || ' prospectos registrados' as datos;

commit;
