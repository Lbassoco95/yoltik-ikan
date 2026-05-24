-- =====================================================================
-- Ikán · Migration 0005 · Motor PLD (tipologías por AV, hallazgos, runs)
-- =====================================================================
-- Modelo central del producto. Una tipología es una regla parametrizada
-- en `regla_dsl` (JSONB declarativo) que el motor evalúa contra operaciones
-- y su contexto. Cuando dispara, genera un `hallazgo` con snapshot inmutable.
-- =====================================================================

create table tipologia_av (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  sector sector_av not null,
  codigo text not null,
  nombre text not null,
  descripcion text not null,
  regla_dsl jsonb not null,
  severidad severidad_tipologia not null,
  activa boolean not null default true,
  version int not null default 1,
  fuente text,
  aprobada_por_oc_en timestamptz,
  aprobada_por_oc uuid references auth.users(id),
  creada_en timestamptz not null default now(),
  unique (organization_id, sector, codigo, version)
);

create index idx_tipologia_org_sector on tipologia_av(organization_id, sector) where activa = true;

create table hallazgo (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  operation_id uuid references operation(id) on delete set null,
  client_id uuid references client(id) on delete set null,

  tipologia_id uuid not null references tipologia_av(id),
  tipologia_codigo text not null,
  tipologia_nombre text not null,
  tipologia_version int not null,
  severidad severidad_tipologia not null,

  regla_payload jsonb not null,

  estado estado_hallazgo not null default 'abierto',
  asignado_a uuid references auth.users(id),
  resolucion text,
  resuelto_por uuid references auth.users(id),
  resuelto_en timestamptz,

  aviso_id uuid,

  creado_en timestamptz not null default now(),

  unique (operation_id, tipologia_id, tipologia_version)
);

create index idx_hallazgo_org_estado on hallazgo(organization_id, estado);
create index idx_hallazgo_op on hallazgo(operation_id);

create table motor_run (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  trigger_tipo text not null,
  triggered_by uuid references auth.users(id),
  operaciones_procesadas int not null default 0,
  hallazgos_creados int not null default 0,
  duracion_ms int,
  metadata jsonb,
  ts timestamptz not null default now()
);

create index idx_motor_run_org_ts on motor_run(organization_id, ts desc);

create table aviso (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  tipo tipo_aviso not null,
  periodo text,
  payload jsonb not null,
  hallazgo_ids uuid[] not null default '{}',
  estado estado_aviso not null default 'borrador',
  generado_por uuid references auth.users(id),
  generado_en timestamptz not null default now(),
  firmado_por uuid references auth.users(id),
  firmado_en timestamptz,
  acuse jsonb
);

create index idx_aviso_org_periodo on aviso(organization_id, tipo, periodo);

-- =====================================================================
-- RLS
-- =====================================================================
alter table tipologia_av enable row level security;
alter table hallazgo enable row level security;
alter table motor_run enable row level security;
alter table aviso enable row level security;

create policy "tipologia_select" on tipologia_av
  for select using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

create policy "tipologia_write_admin" on tipologia_av
  for all using (
    organization_id = public.current_org_id() and public.has_rol('admin')
  );

create policy "hallazgo_select_oc_admin" on hallazgo
  for select using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

create policy "hallazgo_update_oc" on hallazgo
  for update using (
    organization_id = public.current_org_id() and public.has_rol('oc')
  );

create policy "motor_run_select_oc_admin" on motor_run
  for select using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

create policy "aviso_select_oc_admin" on aviso
  for select using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

create policy "aviso_update_oc" on aviso
  for update using (
    organization_id = public.current_org_id() and public.has_rol('oc')
  );
