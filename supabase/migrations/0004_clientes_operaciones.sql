-- =====================================================================
-- Ikán · Migration 0004 · Clientes finales y operaciones
-- =====================================================================

create table client (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  tipo_persona tipo_persona not null,
  nombre_razon_social text not null,
  curp text,
  rfc text,
  nacionalidad text,
  entidad_federativa text,
  pais_residencia_iso2 text,
  datos_kyc jsonb not null default '{}',
  datos_kyb jsonb,
  beneficiario_controlador jsonb,
  nivel_kyc nivel_kyc not null default 'N1',
  alto_de_oficio boolean not null default false,
  triggers_oficio text[] not null default '{}',
  moffin_case_id text,
  activo boolean not null default true,
  capturado_por uuid references auth.users(id),
  capturado_en timestamptz not null default now()
);
comment on table client is 'Cliente final / usuario del sujeto obligado';

create index idx_client_org on client(organization_id);
create index idx_client_capturado_por on client(capturado_por);

create table client_risk_assessment (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client(id) on delete cascade,
  template_id uuid not null references client_risk_template(id),
  respuestas jsonb not null,
  subtotales jsonb not null,
  score_total int not null,
  clasificacion clasificacion_riesgo not null,
  evaluado_por uuid references auth.users(id),
  evaluado_en timestamptz not null default now(),
  motivo_alto_de_oficio text
);

create index idx_assessment_client on client_risk_assessment(client_id);

create type tipo_operacion as enum (
  'compra_fiat_cripto', 'venta_cripto_fiat', 'retiro_cripto', 'deposito_fiat', 'otro'
);

create table operation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references client(id) on delete restrict,
  tipo tipo_operacion not null,
  monto_mxn numeric(14,2) not null check (monto_mxn >= 0),
  moneda_origen text not null default 'MXN',
  activo_virtual text,
  contraparte jsonb,
  fecha timestamptz not null default now(),

  requiere_aviso boolean not null default false,
  identificada_en timestamptz,
  motor_version_aplicada int,

  capturado_por uuid references auth.users(id),
  capturado_en timestamptz not null default now()
);

create index idx_operation_org_fecha on operation(organization_id, fecha desc);
create index idx_operation_client on operation(client_id);
create index idx_operation_capturado_por on operation(capturado_por);
create index idx_operation_requiere_aviso on operation(organization_id, requiere_aviso) where requiere_aviso = true;

-- =====================================================================
-- RLS
-- =====================================================================
alter table client enable row level security;
alter table client_risk_assessment enable row level security;
alter table operation enable row level security;

create policy "client_select" on client
  for select using (
    organization_id = public.current_org_id()
    and (
      public.has_rol('oc') or public.has_rol('admin')
      or (public.has_rol('operador') and capturado_por = auth.uid())
    )
  );

create policy "client_insert" on client
  for insert with check (
    organization_id = public.current_org_id()
    and (public.has_rol('operador') or public.has_rol('oc') or public.has_rol('admin'))
    and capturado_por = auth.uid()
  );

create policy "client_update_oc_admin" on client
  for update using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

create policy "assessment_select" on client_risk_assessment
  for select using (
    exists (select 1 from client c
            where c.id = client_id and c.organization_id = public.current_org_id()
              and (
                public.has_rol('oc') or public.has_rol('admin')
                or (public.has_rol('operador') and c.capturado_por = auth.uid())
              ))
  );

create policy "assessment_insert" on client_risk_assessment
  for insert with check (
    exists (select 1 from client c
            where c.id = client_id and c.organization_id = public.current_org_id())
  );

create policy "operation_select" on operation
  for select using (
    organization_id = public.current_org_id()
    and (
      public.has_rol('oc') or public.has_rol('admin')
      or (public.has_rol('operador') and capturado_por = auth.uid())
    )
  );

create policy "operation_insert" on operation
  for insert with check (
    organization_id = public.current_org_id()
    and (public.has_rol('operador') or public.has_rol('oc') or public.has_rol('admin'))
    and capturado_por = auth.uid()
  );

create policy "operation_update_motor_or_oc" on operation
  for update using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );
