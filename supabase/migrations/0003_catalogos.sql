-- =====================================================================
-- Ikán · Migration 0003 · Catálogos (países, entidades MX, listas)
-- =====================================================================
-- Fuentes:
--   - GAFI Lista Negra/Gris (corte febrero 2025)
--   - OFAC países/regiones sancionados
--   - LISR Art. 176 / regla 3.1.15 paraísos fiscales
--   - ENR 2023 + SESNSP para clasificación de entidades MX
-- =====================================================================

create type fuente_lista as enum (
  'gafi_negra', 'gafi_gris', 'ofac_sancionado', 'onu', 'paraiso_fiscal_mx',
  'entidad_alta_mx', 'entidad_media_mx', 'entidad_baja_mx',
  'pep_nacional', 'pep_extranjero', 'manual'
);

create table country_risk_list (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  iso2 text not null check (length(iso2) = 2),
  nombre text not null,
  nivel int not null check (nivel between 1 and 3),
  fuente fuente_lista not null,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  notas text,
  unique (organization_id, iso2, fuente, vigente_desde)
);

create table entity_risk_list (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  entidad text not null,
  nivel int not null check (nivel between 1 and 3),
  fuente fuente_lista not null,
  notas text,
  unique (organization_id, entidad, fuente)
);

create table alerta_on_chain_signal (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  codigo text not null,
  descripcion text not null,
  activa boolean not null default true,
  unique (organization_id, codigo)
);

create table sanctions_list_entry (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  fuente fuente_lista not null,
  tipo_entidad text not null,
  identificador text not null,
  metadata jsonb,
  agregado_en timestamptz not null default now()
);

-- RLS
alter table country_risk_list enable row level security;
alter table entity_risk_list enable row level security;
alter table alerta_on_chain_signal enable row level security;
alter table sanctions_list_entry enable row level security;

create policy "country_list_select_same_org" on country_risk_list
  for select using (organization_id = public.current_org_id());
create policy "country_list_write_admin" on country_risk_list
  for all using (organization_id = public.current_org_id() and public.has_rol('admin'));

create policy "entity_list_select_same_org" on entity_risk_list
  for select using (organization_id = public.current_org_id());
create policy "entity_list_write_admin" on entity_risk_list
  for all using (organization_id = public.current_org_id() and public.has_rol('admin'));

create policy "onchain_select_same_org" on alerta_on_chain_signal
  for select using (organization_id = public.current_org_id());
create policy "onchain_write_admin" on alerta_on_chain_signal
  for all using (organization_id = public.current_org_id() and public.has_rol('admin'));

create policy "sanctions_select_same_org" on sanctions_list_entry
  for select using (organization_id = public.current_org_id());
create policy "sanctions_write_admin" on sanctions_list_entry
  for all using (organization_id = public.current_org_id() and public.has_rol('admin'));
