-- =====================================================================
-- Ikán · Migration 0002 · Metodología EBR (institucional) y matriz de cliente
-- =====================================================================
-- Generaliza el EBR Ixim Pay. Fuente: "Metodologia EBR - Ixim Pay.xlsx".
-- =====================================================================

create table risk_methodology (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  sector sector_av not null,
  version int not null default 1,
  apetito_riesgo clasificacion_riesgo not null default 'medio',
  frecuencia_revision text not null default 'anual',
  activa_desde date not null default current_date,
  activa_hasta date,
  notas text,
  creada_por uuid references auth.users(id),
  creada_en timestamptz not null default now(),
  unique (organization_id, sector, version)
);

create table risk_element (
  id uuid primary key default gen_random_uuid(),
  methodology_id uuid not null references risk_methodology(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  peso numeric(5,4) not null check (peso >= 0 and peso <= 1),
  impacto_pct numeric(5,2) not null check (impacto_pct >= 0 and impacto_pct <= 100),
  orden int not null default 0,
  unique (methodology_id, codigo)
);

create table risk_indicator (
  id uuid primary key default gen_random_uuid(),
  element_id uuid not null references risk_element(id) on delete cascade,
  codigo text not null,
  variable text not null,
  indicador text not null,
  peso numeric(5,4) not null check (peso >= 0 and peso <= 1),
  nivel_inherente int not null check (nivel_inherente between 1 and 3),
  orden int not null default 0,
  unique (element_id, codigo)
);

create table risk_mitigant (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references risk_indicator(id) on delete cascade,
  descripcion text not null,
  factor numeric(5,4) not null check (factor >= 0 and factor <= 1)
);

-- =====================================================================
-- Plantilla de matriz de riesgo del cliente (por sector)
-- =====================================================================
create table client_risk_template (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  sector sector_av not null,
  version int not null default 1,
  configuracion jsonb not null,
  activa boolean not null default true,
  creada_en timestamptz not null default now(),
  unique (organization_id, sector, version)
);

-- =====================================================================
-- RLS
-- =====================================================================
alter table risk_methodology enable row level security;
alter table risk_element enable row level security;
alter table risk_indicator enable row level security;
alter table risk_mitigant enable row level security;
alter table client_risk_template enable row level security;

create policy "methodology_select_same_org" on risk_methodology
  for select using (organization_id = public.current_org_id());

create policy "methodology_write_admin" on risk_methodology
  for all using (organization_id = public.current_org_id() and public.has_rol('admin'));

create policy "element_select_via_methodology" on risk_element
  for select using (
    exists (select 1 from risk_methodology m
            where m.id = methodology_id and m.organization_id = public.current_org_id())
  );

create policy "element_write_admin" on risk_element
  for all using (
    public.has_rol('admin')
    and exists (select 1 from risk_methodology m
                where m.id = methodology_id and m.organization_id = public.current_org_id())
  );

create policy "indicator_select_via_element" on risk_indicator
  for select using (
    exists (
      select 1 from risk_element e
      join risk_methodology m on m.id = e.methodology_id
      where e.id = element_id and m.organization_id = public.current_org_id()
    )
  );

create policy "indicator_write_admin" on risk_indicator
  for all using (
    public.has_rol('admin')
    and exists (
      select 1 from risk_element e
      join risk_methodology m on m.id = e.methodology_id
      where e.id = element_id and m.organization_id = public.current_org_id()
    )
  );

create policy "mitigant_select_via_indicator" on risk_mitigant
  for select using (
    exists (
      select 1 from risk_indicator i
      join risk_element e on e.id = i.element_id
      join risk_methodology m on m.id = e.methodology_id
      where i.id = indicator_id and m.organization_id = public.current_org_id()
    )
  );

create policy "mitigant_write_admin" on risk_mitigant
  for all using (
    public.has_rol('admin')
    and exists (
      select 1 from risk_indicator i
      join risk_element e on e.id = i.element_id
      join risk_methodology m on m.id = e.methodology_id
      where i.id = indicator_id and m.organization_id = public.current_org_id()
    )
  );

create policy "template_select_same_org" on client_risk_template
  for select using (organization_id = public.current_org_id());

create policy "template_write_admin" on client_risk_template
  for all using (organization_id = public.current_org_id() and public.has_rol('admin'));
