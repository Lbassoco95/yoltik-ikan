-- =====================================================================
-- Ikán · Migration 0001 · Schema base (orgs, users, roles, RLS, bitácora)
-- =====================================================================
-- Documentación de referencia:
--   - docs/ARCHITECTURE.md
--   - .brief-temporal/01-brief-original.md (Chunk 3)
-- =====================================================================

create extension if not exists "pgcrypto" with schema public;

-- =====================================================================
-- ENUMs de dominio
-- =====================================================================
create type sector_av as enum ('IV', 'V', 'VII', 'VIII', 'XV', 'XVI');
create type rol_usuario as enum ('operador', 'oc', 'admin');
create type tipo_persona as enum ('fisica', 'moral');
create type clasificacion_riesgo as enum ('bajo', 'medio', 'alto', 'alto_oficio');
create type nivel_kyc as enum ('N1', 'N2', 'N3');
create type severidad_tipologia as enum ('baja', 'media', 'alta', 'critica');
create type estado_hallazgo as enum (
  'abierto', 'en_revision', 'confirmado_inusual',
  'confirmado_preocupante', 'descartado', 'falso_positivo'
);
create type tipo_aviso as enum ('24h', 'mensual');
create type estado_aviso as enum ('borrador', 'listo_firma', 'enviado', 'acusado');
create type estado_aprobacion as enum ('pendiente', 'aprobada', 'rechazada');

-- =====================================================================
-- Organizaciones (sujetos obligados)
-- =====================================================================
create table organizations (
  id uuid primary key default gen_random_uuid(),
  rfc text not null unique,
  razon_social text not null,
  sectores sector_av[] not null default '{}',
  oficio_alta_sat text,
  fecha_alta_sat date,
  representante_legal text,
  domicilio_fiscal text,
  creada_en timestamptz not null default now(),
  creada_por uuid references auth.users(id)
);
comment on table organizations is 'Sujetos obligados / clientes de Ikán';

-- =====================================================================
-- Perfiles de usuario + roles (muchos-a-muchos)
-- =====================================================================
create table user_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete restrict,
  nombre text not null,
  email text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
comment on table user_profile is 'Perfil de usuario ligado a auth.users';

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profile(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  rol rol_usuario not null,
  otorgado_por uuid references auth.users(id),
  otorgado_en timestamptz not null default now(),
  unique (user_id, organization_id, rol)
);
comment on table user_roles is 'Roles que un usuario tiene dentro de una organización';

create index idx_user_roles_user on user_roles(user_id);
create index idx_user_roles_org on user_roles(organization_id);

-- =====================================================================
-- Aprobaciones pendientes (Admin propone → OC aprueba)
-- =====================================================================
create table pending_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  tipo_recurso text not null,            -- 'metodologia' | 'tipologia' | 'catalogo' | 'regla'
  recurso_id uuid,
  payload jsonb not null,
  estado estado_aprobacion not null default 'pendiente',
  solicitado_por uuid not null references auth.users(id),
  solicitado_en timestamptz not null default now(),
  resuelto_por uuid references auth.users(id),
  resuelto_en timestamptz,
  motivo text
);
comment on table pending_approvals is 'Cola de cambios técnicos que el OC debe aprobar';

create index idx_pending_approvals_org on pending_approvals(organization_id);
create index idx_pending_approvals_estado on pending_approvals(estado);

-- =====================================================================
-- Bitácora de auditoría
-- =====================================================================
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  actor uuid references auth.users(id),
  rol_activo rol_usuario,
  accion text not null,
  recurso_tipo text not null,
  recurso_id uuid,
  antes jsonb,
  despues jsonb,
  ip inet,
  user_agent text,
  ts timestamptz not null default now()
);
comment on table audit_log is 'Bitácora trazable de toda acción relevante';

create index idx_audit_org_ts on audit_log(organization_id, ts desc);
create index idx_audit_recurso on audit_log(recurso_tipo, recurso_id);

-- =====================================================================
-- Helpers de seguridad (RLS)
-- =====================================================================

create or replace function public.current_org_id()
returns uuid
language sql stable security definer
as $$
  select organization_id
  from user_profile
  where id = auth.uid()
  limit 1
$$;

create or replace function public.has_rol(target_rol rol_usuario)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1
    from user_roles ur
    where ur.user_id = auth.uid()
      and ur.organization_id = public.current_org_id()
      and ur.rol = target_rol
  )
$$;

-- =====================================================================
-- RLS policies
-- =====================================================================
alter table organizations enable row level security;
alter table user_profile enable row level security;
alter table user_roles enable row level security;
alter table pending_approvals enable row level security;
alter table audit_log enable row level security;

create policy "org_select_own" on organizations
  for select using (id = public.current_org_id());

create policy "user_profile_select_same_org" on user_profile
  for select using (organization_id = public.current_org_id());

create policy "user_profile_insert_admin" on user_profile
  for insert with check (
    organization_id = public.current_org_id() and public.has_rol('admin')
  );

create policy "user_profile_update_admin_or_self" on user_profile
  for update using (
    id = auth.uid() or (organization_id = public.current_org_id() and public.has_rol('admin'))
  );

create policy "user_roles_select_same_org" on user_roles
  for select using (organization_id = public.current_org_id());

create policy "user_roles_write_admin" on user_roles
  for all using (
    organization_id = public.current_org_id() and public.has_rol('admin')
  );

create policy "pending_select_oc_admin" on pending_approvals
  for select using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

create policy "pending_insert_admin" on pending_approvals
  for insert with check (
    organization_id = public.current_org_id() and public.has_rol('admin')
  );

create policy "pending_update_oc" on pending_approvals
  for update using (
    organization_id = public.current_org_id() and public.has_rol('oc')
  );

create policy "audit_select_same_org" on audit_log
  for select using (organization_id = public.current_org_id());

-- =====================================================================
-- Vistas auxiliares
-- =====================================================================
create or replace view v_user_roles_simple as
  select up.id as user_id, up.nombre, up.email, up.organization_id,
         coalesce(array_agg(ur.rol order by ur.rol) filter (where ur.rol is not null), '{}') as roles
  from user_profile up
  left join user_roles ur on ur.user_id = up.id
  group by up.id;
