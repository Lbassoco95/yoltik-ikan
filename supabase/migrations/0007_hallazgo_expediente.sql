-- =====================================================================
-- Ikán · Migration 0007 · Expediente del hallazgo
-- =====================================================================
-- El OC deja de ver una tarjeta pasiva: cada hallazgo se convierte en un
-- expediente con soporte documental y bitácora trazable.
--
-- Agrega, de forma aditiva y no destructiva sobre `hallazgo` (migration 0005):
--   1. `hallazgo.clasificacion_urgencia` ('24_horas' | 'por_umbral'), SLA
--      operativo interno derivado automáticamente de la regla que generó el
--      hallazgo, editable a mano por el OC.
--   2. `hallazgo_documento` — soporte cargado a Supabase Storage.
--   3. `hallazgo_bitacora` — registro de actividad del expediente. Los cambios
--      de estado y las cargas de documento se escriben aquí por TRIGGER, no
--      desde el front: cualquier ruta que toque el hallazgo queda registrada.
--   4. Bucket privado `hallazgo-documentos` + políticas de Storage.
--
-- IMPORTANTE: la clasificación de urgencia es un SLA OPERATIVO INTERNO para
-- priorizar la bandeja del OC. NO es un plazo regulatorio distinto al de la
-- fracción XII ni sustituye ningún cómputo legal.
-- =====================================================================

-- =====================================================================
-- 1. Enums
-- =====================================================================
do $$ begin
  create type clasificacion_urgencia as enum ('24_horas', 'por_umbral');
exception when duplicate_object then null; end $$;

comment on type clasificacion_urgencia is
  'SLA operativo interno de la bandeja del OC. 24_horas = regla de "aviso siempre" (atención inmediata); por_umbral = regla de umbral monetario (flujo normal). No es un plazo regulatorio.';

do $$ begin
  create type tipo_bitacora_hallazgo as enum (
    'cambio_estado', 'nota', 'documento_subido', 'cambio_urgencia'
  );
exception when duplicate_object then null; end $$;

-- =====================================================================
-- 2. Derivación de la urgencia desde regla_dsl
-- =====================================================================
-- Espejo exacto de `clasificacionUrgencia()` en
-- supabase/functions/motor-pld/evaluadores.ts. Si cambia una, cambia la otra.
--
-- Criterio (NO inventa umbrales; solo lee la forma de la regla ya sembrada):
--   · `desviacion`  → compara contra el perfil transaccional declarado, es un
--                     umbral monetario  → por_umbral.
--   · condición sobre una métrica de monto (suma_monto_uma / suma_monto_mxn /
--     monto_uma / monto_mxn) → por_umbral. Es el caso de XII-01
--     (transmisión de inmueble ≥ 16,000 UMA).
--   · todo lo demás (lookup, score, duplicado, secuencia, y `agregado` que solo
--     cuenta operaciones) es una regla de "aviso siempre", sin umbral de monto
--     → 24_horas. Es el caso de XII-02 (poder irrevocable) y XII-03.
--
-- Fail-safe: ante regla nula o desconocida se clasifica 24_horas, es decir
-- hacia la atención más inmediata.
create or replace function public.urgencia_de_regla(regla jsonb)
returns clasificacion_urgencia
language sql
immutable
as $$
  select case
    when regla is null then '24_horas'::clasificacion_urgencia
    when regla->>'tipo' = 'desviacion' then 'por_umbral'::clasificacion_urgencia
    when jsonb_typeof(regla->'condicion') = 'object'
      and (regla->'condicion') ?| array['suma_monto_uma', 'suma_monto_mxn', 'monto_uma', 'monto_mxn']
      then 'por_umbral'::clasificacion_urgencia
    else '24_horas'::clasificacion_urgencia
  end
$$;

comment on function public.urgencia_de_regla(jsonb) is
  'Deriva el SLA operativo de la bandeja del OC a partir de la forma de regla_dsl. Espejo de clasificacionUrgencia() en evaluadores.ts.';

-- =====================================================================
-- 3. Columna en `hallazgo` + trigger de default derivado
-- =====================================================================
alter table hallazgo
  add column if not exists clasificacion_urgencia clasificacion_urgencia;

comment on column hallazgo.clasificacion_urgencia is
  'SLA operativo interno. Se deriva de la regla al insertar (trigger trg_hallazgo_urgencia) y el OC puede corregirlo a mano.';

-- Sin DEFAULT de columna a propósito: el trigger BEFORE INSERT es el que
-- resuelve el valor leyendo la tipología, y solo actúa si viene nulo (así el
-- motor puede mandarlo explícito y el OC puede corregirlo después).
create or replace function public.hallazgo_set_urgencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regla jsonb;
begin
  if new.clasificacion_urgencia is null then
    select regla_dsl into v_regla from tipologia_av where id = new.tipologia_id;
    new.clasificacion_urgencia := public.urgencia_de_regla(v_regla);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hallazgo_urgencia on hallazgo;
create trigger trg_hallazgo_urgencia
  before insert on hallazgo
  for each row execute function public.hallazgo_set_urgencia();

-- Backfill de los hallazgos que ya existían antes de esta migration.
update hallazgo h
set clasificacion_urgencia = public.urgencia_de_regla(t.regla_dsl)
from tipologia_av t
where t.id = h.tipologia_id
  and h.clasificacion_urgencia is null;

-- Red de seguridad: hallazgo cuya tipología ya no se puede resolver.
update hallazgo
set clasificacion_urgencia = '24_horas'
where clasificacion_urgencia is null;

alter table hallazgo alter column clasificacion_urgencia set not null;

create index if not exists idx_hallazgo_urgencia
  on hallazgo(organization_id, clasificacion_urgencia, estado);

-- =====================================================================
-- 4. Documentos de soporte
-- =====================================================================
create table if not exists hallazgo_documento (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  hallazgo_id uuid not null references hallazgo(id) on delete cascade,
  storage_path text not null unique,
  nombre_archivo text not null,
  mime_type text,
  tamano_bytes bigint,
  subido_por uuid references auth.users(id),
  subido_en timestamptz not null default now()
);

comment on table hallazgo_documento is
  'Soporte documental de un hallazgo. El archivo vive en el bucket privado hallazgo-documentos; aquí solo su metadato.';
comment on column hallazgo_documento.storage_path is
  'Ruta dentro del bucket: {organization_id}/{hallazgo_id}/{archivo}. El primer folder es la llave que usa la política de Storage.';

create index if not exists idx_hallazgo_documento_hallazgo
  on hallazgo_documento(hallazgo_id, subido_en desc);

-- =====================================================================
-- 5. Bitácora del expediente
-- =====================================================================
create table if not exists hallazgo_bitacora (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  hallazgo_id uuid not null references hallazgo(id) on delete cascade,
  tipo tipo_bitacora_hallazgo not null,
  descripcion text not null,
  estado_anterior estado_hallazgo,
  estado_nuevo estado_hallazgo,
  usuario uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

comment on table hallazgo_bitacora is
  'Registro de actividad del expediente del hallazgo. Los tipos cambio_estado, cambio_urgencia y documento_subido los escriben triggers; nota la captura el OC.';

create index if not exists idx_hallazgo_bitacora_hallazgo
  on hallazgo_bitacora(hallazgo_id, creado_en desc);

-- --- Trigger: todo cambio de estado o de urgencia queda registrado ----
create or replace function public.hallazgo_log_cambios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    insert into hallazgo_bitacora
      (organization_id, hallazgo_id, tipo, descripcion, estado_anterior, estado_nuevo, usuario)
    values
      (new.organization_id, new.id, 'cambio_estado',
       format('Cambio de estado: %s → %s', old.estado, new.estado),
       old.estado, new.estado, auth.uid());
  end if;

  if new.clasificacion_urgencia is distinct from old.clasificacion_urgencia then
    insert into hallazgo_bitacora
      (organization_id, hallazgo_id, tipo, descripcion, usuario)
    values
      (new.organization_id, new.id, 'cambio_urgencia',
       format('Clasificación de urgencia: %s → %s',
              old.clasificacion_urgencia, new.clasificacion_urgencia),
       auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_hallazgo_bitacora on hallazgo;
create trigger trg_hallazgo_bitacora
  after update on hallazgo
  for each row execute function public.hallazgo_log_cambios();

-- --- Trigger: cada documento cargado queda registrado -----------------
create or replace function public.hallazgo_log_documento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into hallazgo_bitacora
    (organization_id, hallazgo_id, tipo, descripcion, usuario)
  values
    (new.organization_id, new.hallazgo_id, 'documento_subido',
     format('Documento cargado: %s', new.nombre_archivo),
     coalesce(new.subido_por, auth.uid()));
  return new;
end;
$$;

drop trigger if exists trg_hallazgo_documento_bitacora on hallazgo_documento;
create trigger trg_hallazgo_documento_bitacora
  after insert on hallazgo_documento
  for each row execute function public.hallazgo_log_documento();

-- =====================================================================
-- 6. RLS
-- =====================================================================
-- Mismo criterio que `hallazgo` (migration 0005): lectura oc/admin, escritura
-- del OC, que es quien trabaja la bandeja.
alter table hallazgo_documento enable row level security;
alter table hallazgo_bitacora enable row level security;

drop policy if exists "hallazgo_documento_select_oc_admin" on hallazgo_documento;
create policy "hallazgo_documento_select_oc_admin" on hallazgo_documento
  for select using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

drop policy if exists "hallazgo_documento_insert_oc" on hallazgo_documento;
create policy "hallazgo_documento_insert_oc" on hallazgo_documento
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_rol('oc')
    and subido_por = auth.uid()
  );

-- Sin políticas de update/delete a propósito: el expediente no se reescribe.

drop policy if exists "hallazgo_bitacora_select_oc_admin" on hallazgo_bitacora;
create policy "hallazgo_bitacora_select_oc_admin" on hallazgo_bitacora
  for select using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

-- El OC captura notas manuales. Las entradas automáticas las insertan los
-- triggers, que corren dentro de la misma sesión del OC (auth.uid() vigente),
-- por lo que también pasan por esta política.
drop policy if exists "hallazgo_bitacora_insert_oc" on hallazgo_bitacora;
create policy "hallazgo_bitacora_insert_oc" on hallazgo_bitacora
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_rol('oc')
  );

-- =====================================================================
-- 7. Supabase Storage — bucket privado del soporte documental
-- =====================================================================
-- PDF e imagen, 20 MB por archivo. Bucket privado: la descarga se hace con
-- signed URL de corta vida desde el front.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hallazgo-documentos',
  'hallazgo-documentos',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Aislamiento multi-tenant por el primer folder de la ruta ({organization_id}).
drop policy if exists "hallazgo_docs_select" on storage.objects;
create policy "hallazgo_docs_select" on storage.objects
  for select to authenticated using (
    bucket_id = 'hallazgo-documentos'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

drop policy if exists "hallazgo_docs_insert" on storage.objects;
create policy "hallazgo_docs_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'hallazgo-documentos'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_rol('oc')
  );
