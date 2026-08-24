-- =====================================================================
-- Ikán · Aplicar TODO el esquema + seeds al Supabase remoto (una vez)
-- =====================================================================
-- Generado concatenando migrations/0001..0005 + seed/01..07 EN ORDEN.
-- ENVUELTO EN TRANSACCIÓN (begin/commit): si algo truena a media, revierte
-- TODO y el proyecto queda vacío (estado seguro para reintentar), nunca a
-- medias. Úsalo en un proyecto vacío (las migrations no son idempotentes).
-- Pégalo completo en el SQL Editor y córrelo una vez.
-- Después corre supabase/manual/bootstrap_usuario_maestro.sql.
-- CLI alterna: supabase link --project-ref cibpguwwggwzdhhpdomz && supabase db push
-- =====================================================================

begin;


-- ============================================================
-- >>> supabase/migrations/0001_initial_schema.sql
-- ============================================================
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


-- ============================================================
-- >>> supabase/migrations/0002_risk_methodology.sql
-- ============================================================
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


-- ============================================================
-- >>> supabase/migrations/0003_catalogos.sql
-- ============================================================
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


-- ============================================================
-- >>> supabase/migrations/0004_clientes_operaciones.sql
-- ============================================================
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


-- ============================================================
-- >>> supabase/migrations/0005_motor_pld.sql
-- ============================================================
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


-- ============================================================
-- >>> supabase/seed/01_organization_ixim_pay.sql
-- ============================================================
-- =====================================================================
-- Seed · Ixim Pay como organización demo
-- =====================================================================
-- Datos derivados de "Metodologia PLD-FT - Ixim Pay.docx".
-- Uso autorizado por el representante legal de Ixim Pay para demos
-- Kawiil/Yoltik. Para demos a terceros sin contexto Kawiil, crear seed
-- paralelo "01b_demo_generica_xvi.sql" con datos sintéticos (Sprint D-2+).
-- =====================================================================

insert into organizations (id, rfc, razon_social, sectores, oficio_alta_sat,
                           fecha_alta_sat, representante_legal, domicilio_fiscal)
values (
  '11111111-1111-1111-1111-111111111111',
  'FRA250514B41',
  'IXIM PAY, S.A. DE C.V.',
  ARRAY['XVI']::sector_av[],
  '600-07-01-00-2025-2068',
  '2025-12-10',
  'Leopoldo Bassoco Nova',
  'Calle Tuxpan No. 63, Interior 402, Colonia Roma Sur, Cuauhtémoc, CDMX, C.P. 06760'
)
on conflict (rfc) do update set
  razon_social = excluded.razon_social,
  sectores = excluded.sectores;


-- ============================================================
-- >>> supabase/seed/02_metodologia_ebr_xvi.sql
-- ============================================================
-- =====================================================================
-- Seed · Metodología EBR sector XVI (Ixim Pay)
-- =====================================================================
-- Valores exactos del archivo "Metodologia EBR - Ixim Pay.xlsx".
-- 5 Elementos con pesos institucionales, sus indicadores con peso interno
-- y nivel inherente.
-- =====================================================================

-- Metodología
insert into risk_methodology (id, organization_id, sector, version,
                              apetito_riesgo, frecuencia_revision, notas)
values (
  '22222222-2222-2222-2222-222222222201',
  '11111111-1111-1111-1111-111111111111',
  'XVI', 1, 'medio', 'anual',
  'Metodología EBR base Ixim Pay — Activos Virtuales (Art. 17 fr. XVI LFPIORPI).'
)
on conflict (organization_id, sector, version) do nothing;

-- ============================
-- ELEMENTO 1 — Productos y Servicios (peso 0.25, impacto 75%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E1_PRODUCTOS',
          'Productos y Servicios', 0.25, 75, 1)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E1-01', 'On/off ramp (fiat⇄cripto)', 'Anonimato o falta de identificación del Usuario', 0.35::numeric, 2, 1),
  ('E1-02', 'On/off ramp (fiat⇄cripto)', 'Producto que facilita la transferencia de valor', 0.40::numeric, 3, 2),
  ('E1-03', 'On/off ramp (fiat⇄cripto)', 'Manipulación de grandes volúmenes de recursos', 0.25::numeric, 3, 3)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;

-- ============================
-- ELEMENTO 2 — Tipos de Usuario (peso 0.20, impacto 50%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E2_USUARIO',
          'Tipos de Usuario', 0.20, 50, 2)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E2-01', 'Persona Física', 'Tipo de persona', 0.15::numeric, 2, 1),
  ('E2-02', 'Persona Física', 'Edad', 0.10::numeric, 2, 2),
  ('E2-03', 'Persona Física', 'Nacionalidad', 0.15::numeric, 2, 3),
  ('E2-04', 'Persona Física', 'Ocupación / actividad económica', 0.15::numeric, 2, 4),
  ('E2-05', 'Persona Física', 'Identificados en listas PEPs o bloqueados', 0.20::numeric, 3, 5),
  ('E2-06', 'Persona Moral', 'Antigüedad / tipo de sociedad / BC', 0.15::numeric, 3, 6),
  ('E2-07', 'Persona Moral', 'Beneficiario Controlador (transparencia)', 0.10::numeric, 3, 7)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;

-- ============================
-- ELEMENTO 3 — Países y Áreas Geográficas (peso 0.10, impacto 45%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E3_PAISES',
          'Países y Áreas Geográficas', 0.10, 45, 3)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E3-01', 'Países (contraparte externa)', 'Regímenes fiscales preferentes', 0.15::numeric, 2, 1),
  ('E3-02', 'Países (contraparte externa)', 'Medidas deficientes en LD/FT (GAFI)', 0.15::numeric, 3, 2),
  ('E3-03', 'Países (contraparte externa)', 'Alto nivel de corrupción', 0.10::numeric, 2, 3),
  ('E3-04', 'Países (contraparte externa)', 'Alto nivel de delincuencia', 0.15::numeric, 3, 4),
  ('E3-05', 'Países (contraparte externa)', 'Sancionados OFAC/ONU', 0.15::numeric, 3, 5),
  ('E3-06', 'Áreas geográficas nacionales (México)', 'Entidades de incidencia delictiva alta', 0.15::numeric, 3, 6),
  ('E3-07', 'Áreas geográficas nacionales (México)', 'Entidades con frontera y puertos internacionales', 0.15::numeric, 2, 7)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;

-- ============================
-- ELEMENTO 4 — Canales (peso 0.15, impacto 55%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E4_CANALES',
          'Canales de contratación, fondeo y retiro', 0.15, 55, 4)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E4-01', 'Alta no presencial (web/app)', 'Canales no presenciales', 0.30::numeric, 3, 1),
  ('E4-02', 'SPEI fiat in/out', 'Acceso inmediato a recursos', 0.25::numeric, 3, 2),
  ('E4-03', 'Retiro on-chain', 'Canales que permiten operaciones por montos altos', 0.25::numeric, 3, 3),
  ('E4-04', 'Retiro on-chain', 'Canales con exposición a wallets externas / cripto-nativas', 0.20::numeric, 3, 4)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;

-- ============================
-- ELEMENTO 5 — Transacciones (peso 0.30, impacto 70%)
-- ============================
with e as (
  insert into risk_element (methodology_id, codigo, nombre, peso, impacto_pct, orden)
  values ('22222222-2222-2222-2222-222222222201', 'E5_TRANSACCIONES',
          'Transacciones (calibrado con Ops 2025)', 0.30, 70, 5)
  on conflict (methodology_id, codigo) do update set peso = excluded.peso returning id
)
insert into risk_indicator (element_id, codigo, variable, indicador, peso, nivel_inherente, orden)
select e.id, x.codigo, x.variable, x.indicador, x.peso, x.nivel, x.orden
from e, (values
  ('E5-01', 'Compra fiat→cripto', 'Monto de las transacciones (ticket promedio)', 0.20::numeric, 2, 1),
  ('E5-02', 'Compra fiat→cripto', 'Volumen mensual acumulado', 0.20::numeric, 2, 2),
  ('E5-03', 'Venta cripto→fiat', 'Frecuencia transaccional', 0.15::numeric, 2, 3),
  ('E5-04', 'Compra + venta', 'Origen de las transacciones (fiat in)', 0.15::numeric, 2, 4),
  ('E5-05', 'Compra + venta', 'Destino de las transacciones (cripto out)', 0.15::numeric, 3, 5),
  ('E5-06', 'Compra + venta', 'Exposición on-chain (mixers, sanctioned, darknet)', 0.15::numeric, 3, 6)
) as x(codigo, variable, indicador, peso, nivel, orden)
on conflict (element_id, codigo) do nothing;


-- ============================================================
-- >>> supabase/seed/03_tipologias_xvi.sql
-- ============================================================
-- =====================================================================
-- Seed · Tipologías sector XVI (Activos Virtuales)
-- =====================================================================
-- 8 tipologías derivadas de la metodología Ixim Pay y de las señales de
-- alerta UIF para activos virtuales (Anexo D de la metodología PLD-FT).
-- Cada `regla_dsl` es declarativa: el Motor PLD las interpreta sin código.
-- =====================================================================

insert into tipologia_av (id, organization_id, sector, codigo, nombre, descripcion,
                          regla_dsl, severidad, version, fuente)
values
  -- XVI-01 Structuring
  ('33333333-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-01', 'Structuring (fraccionamiento)',
   'Al menos 3 operaciones del mismo cliente en 72 horas cuya suma alcance o supere 645 UMA.',
   '{
      "tipo": "agregado",
      "ventana": "72h",
      "agrupar_por": "client_id",
      "condicion": {
        "count": { "op": ">=", "valor": 3 },
        "suma_monto_uma": { "op": ">=", "valor": 645 }
      }
    }'::jsonb,
   'alta', 1, 'UIF Guía 24h · ENR 2023 · Guía señales LD/FT'),

  -- XVI-02 Layering
  ('33333333-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-02', 'Layering (retiro inmediato post-fondeo)',
   'Retiro on-chain >= 90% del saldo dentro de 24 horas posteriores a fondeo fiat.',
   '{
      "tipo": "secuencia",
      "ventana": "24h",
      "secuencia": ["deposito_fiat", "retiro_cripto"],
      "condicion": { "razon_retiro_saldo": { "op": ">=", "valor": 0.9 } }
    }'::jsonb,
   'alta', 1, 'GAFI Recomendación 15 · Anexo D Metodología Ixim Pay'),

  -- XVI-03 Exposición on-chain
  ('33333333-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-03', 'Exposición on-chain a mixers o sanctioned',
   'Wallet contraparte con exposición > 10% a Tornado Cash, ChipMixer, OFAC SDN, ransomware o darknet.',
   '{
      "tipo": "score",
      "fuente": "blockchain_analytics_mock",
      "condicion": {
        "exposicion_pct": { "op": ">", "valor": 10 },
        "categorias": ["mixer", "ofac_sdn", "ransomware", "darknet"]
      }
    }'::jsonb,
   'critica', 1, 'Anexo D · señales on-chain UIF'),

  -- XVI-04 Operación con país de alto riesgo
  ('33333333-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-04', 'Operación con país de alto riesgo',
   'Origen o destino en lista negra/gris GAFI o sancionado OFAC/ONU.',
   '{
      "tipo": "lookup",
      "campo": "contraparte.pais_iso2",
      "fuentes": ["gafi_negra", "gafi_gris", "ofac_sancionado", "onu"]
    }'::jsonb,
   'critica', 1, 'GAFI 02/2025 · OFAC · ONU consolidada'),

  -- XVI-05 Smurfing por dispositivo / biometría
  ('33333333-0000-0000-0000-000000000005',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-05', 'Smurfing por dispositivo o biometría',
   'Dos o más cuentas con coincidencia de device_id, IP o biometría facial.',
   '{
      "tipo": "duplicado",
      "campos": ["device_id", "ip", "biometric_hash"],
      "umbral_cuentas": 2
    }'::jsonb,
   'alta', 1, 'Señales de alerta UIF · estructuración'),

  -- XVI-06 VPN / Tor sistemática
  ('33333333-0000-0000-0000-000000000006',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-06', 'Uso sistemático de VPN o Tor',
   'Cinco o más accesos del cliente desde IPs de VPN/Tor conocidas en el mes.',
   '{
      "tipo": "agregado",
      "ventana": "1M",
      "agrupar_por": "client_id",
      "condicion": { "count_ip_anonima": { "op": ">=", "valor": 5 } }
    }'::jsonb,
   'media', 1, 'Anexo D · señales on-chain · GAFI 2021 VASPs'),

  -- XVI-07 Operación fuera de perfil
  ('33333333-0000-0000-0000-000000000007',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-07', 'Operación fuera del perfil transaccional',
   'Volumen mensual del cliente > 3x el promedio histórico declarado.',
   '{
      "tipo": "desviacion",
      "factor": 3.0,
      "comparar": "promedio_historico_mensual"
    }'::jsonb,
   'alta', 1, 'Metodología Ixim Pay §6 — perfil transaccional'),

  -- XVI-08 Privacy coins
  ('33333333-0000-0000-0000-000000000008',
   '11111111-1111-1111-1111-111111111111',
   'XVI', 'XVI-08', 'Uso de privacy coins',
   'Operación con activos virtuales de privacidad (Monero, Zcash shielded, Dash PrivateSend).',
   '{
      "tipo": "lookup",
      "campo": "activo_virtual",
      "valores": ["XMR", "ZEC", "DASH"]
    }'::jsonb,
   'media', 1, 'GAFI Recomendación 15 · Banxico Circular 4/2019')
on conflict (organization_id, sector, codigo, version) do nothing;


-- ============================================================
-- >>> supabase/seed/04_catalogos_paises_entidades.sql
-- ============================================================
-- =====================================================================
-- Seed · Catálogos auxiliares (países GAFI/OFAC, entidades MX, señales on-chain)
-- =====================================================================
-- Fuentes:
--   - GAFI Lista Negra/Gris (corte febrero 2025)
--   - OFAC países/regiones sancionados
--   - LISR Art. 176 / regla 3.1.15 paraísos fiscales
--   - ENR 2023 + SESNSP para clasificación de entidades MX
-- =====================================================================

-- =================== Países GAFI Lista Negra ===================
insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
values
  ('11111111-1111-1111-1111-111111111111', 'KP', 'Corea del Norte (RPDC)', 3, 'gafi_negra'),
  ('11111111-1111-1111-1111-111111111111', 'IR', 'Irán', 3, 'gafi_negra'),
  ('11111111-1111-1111-1111-111111111111', 'MM', 'Myanmar', 3, 'gafi_negra')
on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

-- =================== Países GAFI Lista Gris (feb 2025) ===================
insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
values
  ('11111111-1111-1111-1111-111111111111', 'DZ', 'Argelia', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'AO', 'Angola', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'BG', 'Bulgaria', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'BF', 'Burkina Faso', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'CM', 'Camerún', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'CI', 'Costa de Marfil', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'HR', 'Croacia', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'CD', 'República Democrática del Congo', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'HT', 'Haití', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'KE', 'Kenia', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'LB', 'Líbano', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'NG', 'Nigeria', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'SY', 'Siria', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'VE', 'Venezuela', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'YE', 'Yemen', 3, 'gafi_gris'),
  ('11111111-1111-1111-1111-111111111111', 'ZW', 'Zimbabue', 3, 'gafi_gris')
on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

-- =================== Países / regiones sancionadas OFAC ===================
insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
values
  ('11111111-1111-1111-1111-111111111111', 'CU', 'Cuba', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'IR', 'Irán', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'KP', 'Corea del Norte', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'SY', 'Siria', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'BY', 'Bielorrusia', 3, 'ofac_sancionado'),
  ('11111111-1111-1111-1111-111111111111', 'VE', 'Venezuela (sectorial)', 3, 'ofac_sancionado')
on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

-- =================== Paraísos fiscales (LISR 176) ===================
insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
values
  ('11111111-1111-1111-1111-111111111111', 'KY', 'Islas Caimán', 3, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'BM', 'Bermudas', 3, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'VG', 'Islas Vírgenes Británicas', 3, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'PA', 'Panamá', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'BZ', 'Belice', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'BS', 'Bahamas', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'SC', 'Seychelles', 3, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'JE', 'Jersey', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'GG', 'Guernsey', 2, 'paraiso_fiscal_mx'),
  ('11111111-1111-1111-1111-111111111111', 'IM', 'Isla de Man', 2, 'paraiso_fiscal_mx')
on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

-- =================== Entidades MX — riesgo Alto ===================
insert into entity_risk_list (organization_id, entidad, nivel, fuente, notas)
values
  ('11111111-1111-1111-1111-111111111111', 'Baja California', 3, 'entidad_alta_mx', 'Frontera, ENR 2023 + SESNSP'),
  ('11111111-1111-1111-1111-111111111111', 'Chihuahua', 3, 'entidad_alta_mx', 'Frontera, ENR 2023'),
  ('11111111-1111-1111-1111-111111111111', 'Guanajuato', 3, 'entidad_alta_mx', 'Alta incidencia delictiva'),
  ('11111111-1111-1111-1111-111111111111', 'Guerrero', 3, 'entidad_alta_mx', 'Alta incidencia delictiva'),
  ('11111111-1111-1111-1111-111111111111', 'Jalisco', 3, 'entidad_alta_mx', 'Puerto / ruta'),
  ('11111111-1111-1111-1111-111111111111', 'Michoacán', 3, 'entidad_alta_mx', 'Puerto / ruta'),
  ('11111111-1111-1111-1111-111111111111', 'Morelos', 3, 'entidad_alta_mx', 'Incidencia delictiva'),
  ('11111111-1111-1111-1111-111111111111', 'Nuevo León', 3, 'entidad_alta_mx', 'Frontera'),
  ('11111111-1111-1111-1111-111111111111', 'Sonora', 3, 'entidad_alta_mx', 'Frontera'),
  ('11111111-1111-1111-1111-111111111111', 'Tamaulipas', 3, 'entidad_alta_mx', 'Frontera'),
  ('11111111-1111-1111-1111-111111111111', 'Zacatecas', 3, 'entidad_alta_mx', 'Ruta')
on conflict (organization_id, entidad, fuente) do nothing;

-- =================== Entidades MX — riesgo Medio ===================
insert into entity_risk_list (organization_id, entidad, nivel, fuente, notas)
values
  ('11111111-1111-1111-1111-111111111111', 'CDMX', 2, 'entidad_media_mx', 'Riesgo moderado'),
  ('11111111-1111-1111-1111-111111111111', 'Colima', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Puebla', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'San Luis Potosí', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Sinaloa', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Tabasco', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Aguascalientes', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Chiapas', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Oaxaca', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Campeche', 2, 'entidad_media_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Durango', 2, 'entidad_media_mx', '')
on conflict (organization_id, entidad, fuente) do nothing;

-- =================== Entidades MX — riesgo Bajo ===================
insert into entity_risk_list (organization_id, entidad, nivel, fuente, notas)
values
  ('11111111-1111-1111-1111-111111111111', 'Querétaro', 1, 'entidad_baja_mx', 'Baja incidencia'),
  ('11111111-1111-1111-1111-111111111111', 'Hidalgo', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Nayarit', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Coahuila', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Tlaxcala', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Yucatán', 1, 'entidad_baja_mx', ''),
  ('11111111-1111-1111-1111-111111111111', 'Baja California Sur', 1, 'entidad_baja_mx', '')
on conflict (organization_id, entidad, fuente) do nothing;

-- =================== Señales on-chain ===================
insert into alerta_on_chain_signal (organization_id, codigo, descripcion)
values
  ('11111111-1111-1111-1111-111111111111', 'MIXER_INTERACTION',  'Interacción directa con mixers / tumblers (Tornado Cash, ChipMixer, Samourai Whirlpool).'),
  ('11111111-1111-1111-1111-111111111111', 'RANSOMWARE_LINKED',  'Direcciones vinculadas a ransomware, darknet markets, stolen funds o hacks reportados.'),
  ('11111111-1111-1111-1111-111111111111', 'OFAC_SDN_WALLET',    'Wallet contraparte en OFAC SDN list.'),
  ('11111111-1111-1111-1111-111111111111', 'IMMEDIATE_WITHDRAW', 'Retiros inmediatos del 100% del saldo a wallets externas después de fondeo fiat.'),
  ('11111111-1111-1111-1111-111111111111', 'STRUCTURED_DEPOSITS','Depósitos fiat estructurados por debajo del umbral 645 UMA con patrón sistemático.'),
  ('11111111-1111-1111-1111-111111111111', 'VPN_FROM_SANCTIONED','IP/dispositivo desde país sancionado OFAC/ONU o VPN sistemática.'),
  ('11111111-1111-1111-1111-111111111111', 'DEVICE_BIOMETRIC_OVERLAP', 'Coincidencia de dispositivo / biometría / INE entre varias cuentas (smurfing).'),
  ('11111111-1111-1111-1111-111111111111', 'EXTORTION_PATTERN',  'Beneficiario o tercero repetido recibe múltiples depósitos pequeños sin relación.'),
  ('11111111-1111-1111-1111-111111111111', 'LOW_CAP_ASSET',      'Operación en activos virtuales de baja capitalización o sin prueba de reservas.'),
  ('11111111-1111-1111-1111-111111111111', 'PROFILE_INCONSISTENT','Volumen inconsistente con perfil declarado (ingresos, ocupación).'),
  ('11111111-1111-1111-1111-111111111111', 'PRIVACY_COINS_ONLY', 'Uso exclusivo de privacy coins (Monero, Zcash shielded, Dash PrivateSend).')
on conflict (organization_id, codigo) do nothing;


-- ============================================================
-- >>> supabase/seed/05_plantilla_matriz_cliente_xvi.sql
-- ============================================================
-- =====================================================================
-- Seed · Plantilla de matriz de riesgo del cliente (sector XVI)
-- =====================================================================
-- Replica las preguntas de "Matriz de Riesgos Clientes - Ixim Pay.xlsx",
-- hoja Evaluación Cliente. Escala fija 15–39 (Bajo / Medio / Alto).
-- =====================================================================

insert into client_risk_template (id, organization_id, sector, version, configuracion, activa)
values (
  '44444444-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'XVI', 1,
  '{
    "elementos": [
      {
        "codigo": "E1_PRODUCTOS",
        "nombre": "Productos y Servicios",
        "variables": [
          {
            "codigo": "PROD-01",
            "pregunta": "Producto: Compra/venta fiat ⇄ cripto (on/off ramp)",
            "criterio": "Intercambio de activos virtuales",
            "peso": 1,
            "opciones": [
              { "valor": 1, "label": "Bajo: Compra únicamente" },
              { "valor": 2, "label": "Medio: Compra y venta" },
              { "valor": 3, "label": "Alto: Compra, venta y retiro on-chain a wallet externa" }
            ]
          }
        ]
      },
      {
        "codigo": "E2_CLIENTE_PF",
        "nombre": "Persona Física",
        "aplica_si": "tipo_persona == ''fisica''",
        "variables": [
          {
            "codigo": "CLI-PF-01",
            "pregunta": "Listas de bloqueados / PEP",
            "opciones": [
              { "valor": 1, "label": "Sin coincidencia" },
              { "valor": 2, "label": "PEP estatal/municipal" },
              { "valor": 3, "label": "PEP federal o PEP extranjero / OFAC (ALTO DE OFICIO)" }
            ]
          },
          {
            "codigo": "CLI-PF-02",
            "pregunta": "Edad",
            "opciones": [
              { "valor": 1, "label": "51+ años" },
              { "valor": 2, "label": "36–50 años" },
              { "valor": 3, "label": "18–35 años" }
            ]
          },
          {
            "codigo": "CLI-PF-03",
            "pregunta": "Nacionalidad",
            "opciones": [
              { "valor": 1, "label": "Mexicana" },
              { "valor": 2, "label": "Extranjera (país no GAFI)" },
              { "valor": 3, "label": "Extranjera (país GAFI gris/negra)" }
            ]
          },
          {
            "codigo": "CLI-PF-04",
            "pregunta": "Ocupación / Actividad económica",
            "opciones": [
              { "valor": 1, "label": "Empleado formal / asalariado" },
              { "valor": 2, "label": "Profesional independiente" },
              { "valor": 3, "label": "Actividad Vulnerable (Art. 17) o giro en efectivo" }
            ]
          },
          {
            "codigo": "CLI-PF-05",
            "pregunta": "Origen de recursos",
            "opciones": [
              { "valor": 1, "label": "Nómina/salario comprobable" },
              { "valor": 2, "label": "Honorarios/negocio comprobable" },
              { "valor": 3, "label": "Inversiones/herencia sin comprobante sólido" }
            ]
          }
        ]
      },
      {
        "codigo": "E2_CLIENTE_PM",
        "nombre": "Persona Moral",
        "aplica_si": "tipo_persona == ''moral''",
        "variables": [
          {
            "codigo": "CLI-PM-01",
            "pregunta": "Listas bloqueados / PEP (integrantes / BC)",
            "opciones": [
              { "valor": 1, "label": "Sin coincidencia" },
              { "valor": 2, "label": "Integrante con PEP estatal/municipal" },
              { "valor": 3, "label": "Integrante PEP federal / extranjero / OFAC (ALTO DE OFICIO)" }
            ]
          },
          {
            "codigo": "CLI-PM-02",
            "pregunta": "Antigüedad de constitución",
            "opciones": [
              { "valor": 1, "label": "Más de 5 años" },
              { "valor": 2, "label": "Entre 2 y 5 años" },
              { "valor": 3, "label": "Menos de 2 años" }
            ]
          },
          {
            "codigo": "CLI-PM-03",
            "pregunta": "Nacionalidad de la sociedad",
            "opciones": [
              { "valor": 1, "label": "México" },
              { "valor": 2, "label": "Extranjera no GAFI" },
              { "valor": 3, "label": "Extranjera lista gris/negra GAFI o paraíso fiscal" }
            ]
          },
          {
            "codigo": "CLI-PM-04",
            "pregunta": "Actividad económica / giro",
            "opciones": [
              { "valor": 1, "label": "Giro de bajo riesgo" },
              { "valor": 2, "label": "Comercio / servicios con efectivo moderado" },
              { "valor": 3, "label": "Realiza AV (Art. 17) o giro intensivo en efectivo" }
            ]
          },
          {
            "codigo": "CLI-PM-05",
            "pregunta": "Tipo de sociedad o entidad",
            "opciones": [
              { "valor": 1, "label": "Afores / Seguros / Fianzas / Asesores Inv." },
              { "valor": 2, "label": "Casa de cambio / Banca desarrollo / SOCAP / SOFOM" },
              { "valor": 3, "label": "Banca Múltiple / Centros Cambiarios / SOFOMER" }
            ]
          },
          {
            "codigo": "CLI-PM-06",
            "pregunta": "Estructura accionaria (BC)",
            "opciones": [
              { "valor": 1, "label": "BC identificado y único" },
              { "valor": 2, "label": "Estructura 2–5 niveles, todos identificados" },
              { "valor": 3, "label": "Múltiples niveles / fideicomisos / acciones al portador" }
            ]
          }
        ]
      },
      {
        "codigo": "E3_PAISES",
        "nombre": "Países y Áreas Geográficas",
        "variables": [
          {
            "codigo": "PAIS-01",
            "pregunta": "País de residencia fiscal del cliente",
            "opciones": [
              { "valor": 1, "label": "México" },
              { "valor": 2, "label": "Extranjero (no GAFI)" },
              { "valor": 3, "label": "GAFI gris/negra, OFAC/ONU o paraíso fiscal" }
            ]
          },
          {
            "codigo": "PAIS-02",
            "pregunta": "Entidad federativa de domicilio (MX)",
            "opciones": [
              { "valor": 1, "label": "Baja (Querétaro, Hidalgo, BCS, etc.)" },
              { "valor": 2, "label": "Media (CDMX, Colima, Puebla, etc.)" },
              { "valor": 3, "label": "Alta (BC, Chih, Gto, Gro, Jal, Mich, NL, Son, Tamps, Zac, Mor)" }
            ]
          },
          {
            "codigo": "PAIS-03",
            "pregunta": "País contraparte (origen o destino de fondos)",
            "opciones": [
              { "valor": 1, "label": "México" },
              { "valor": 2, "label": "Extranjero (no GAFI)" },
              { "valor": 3, "label": "GAFI, OFAC, paraíso fiscal" }
            ]
          }
        ]
      },
      {
        "codigo": "E4_CANALES",
        "nombre": "Canales de Contratación, Fondeo y Retiro",
        "variables": [
          {
            "codigo": "CAN-01",
            "pregunta": "Canal de alta (KYC)",
            "opciones": [
              { "valor": 1, "label": "Presencial con oficial" },
              { "valor": 2, "label": "No presencial con liveness + biometría + INE/RENAPO" },
              { "valor": 3, "label": "No presencial sin biometría reforzada" }
            ]
          },
          {
            "codigo": "CAN-02",
            "pregunta": "Canal de fondeo en fiat (MXN)",
            "opciones": [
              { "valor": 1, "label": "SPEI desde cuenta a nombre del mismo cliente" },
              { "valor": 2, "label": "SPEI de tercero autorizado (familia/patrón)" },
              { "valor": 3, "label": "Depósito en efectivo / fuentes no rastreables" }
            ]
          },
          {
            "codigo": "CAN-03",
            "pregunta": "Canal de retiro",
            "opciones": [
              { "valor": 1, "label": "SPEI a cuenta del mismo cliente" },
              { "valor": 2, "label": "Retiro cripto a wallet propia declarada" },
              { "valor": 3, "label": "Retiro cripto a wallet externa no declarada" }
            ]
          }
        ]
      },
      {
        "codigo": "E5_TRANSACCIONES",
        "nombre": "Características de las Transacciones",
        "variables": [
          {
            "codigo": "TRX-01",
            "pregunta": "Monto promedio por operación",
            "opciones": [
              { "valor": 1, "label": "< $20,000 MXN (≤ p50)" },
              { "valor": 2, "label": "$20,000 – $75,000 MXN (umbral 645 UMA)" },
              { "valor": 3, "label": "> $75,000 MXN (≥ umbral identificación)" }
            ]
          },
          {
            "codigo": "TRX-02",
            "pregunta": "Volumen mensual acumulado",
            "opciones": [
              { "valor": 1, "label": "< $75,000 MXN" },
              { "valor": 2, "label": "$75,000 – $300,000 MXN" },
              { "valor": 3, "label": "> $300,000 MXN (≥ 4x umbral)" }
            ]
          },
          {
            "codigo": "TRX-03",
            "pregunta": "Frecuencia transaccional",
            "opciones": [
              { "valor": 1, "label": "≤ 5 ops/mes" },
              { "valor": 2, "label": "6–15 ops/mes" },
              { "valor": 3, "label": "> 15 ops/mes" }
            ]
          },
          {
            "codigo": "TRX-04",
            "pregunta": "Origen de las transacciones (fiat in)",
            "opciones": [
              { "valor": 1, "label": "Desde México / cuenta propia" },
              { "valor": 2, "label": "Desde país extranjero no GAFI" },
              { "valor": 3, "label": "Desde país GAFI gris/negra, OFAC o paraíso fiscal" }
            ]
          },
          {
            "codigo": "TRX-05",
            "pregunta": "Destino de retiros (cripto out)",
            "opciones": [
              { "valor": 1, "label": "Wallet del mismo cliente en exchange regulado" },
              { "valor": 2, "label": "Wallet externa propia declarada" },
              { "valor": 3, "label": "Wallet en país sancionado / mixer" }
            ]
          },
          {
            "codigo": "TRX-06",
            "pregunta": "Exposición on-chain (análisis blockchain)",
            "opciones": [
              { "valor": 1, "label": "Sin exposición a wallets de alto riesgo" },
              { "valor": 2, "label": "Exposición indirecta < 10%" },
              { "valor": 3, "label": "Exposición directa a mixers/OFAC" }
            ]
          },
          {
            "codigo": "TRX-07",
            "pregunta": "Tipo de activo virtual operado",
            "opciones": [
              { "valor": 1, "label": "Stablecoin auditada (USDC/USDT) o BTC/ETH" },
              { "valor": 2, "label": "Otros tokens en cadena transparente" },
              { "valor": 3, "label": "Privacy coins (Monero, Zcash shielded, Dash PrivateSend)" }
            ]
          }
        ]
      }
    ],
    "escala_cliente": {
      "bajo":  { "min": 15, "max": 22, "acciones": "Debida Diligencia Simplificada. Monitoreo estándar. Revisión anual." },
      "medio": { "min": 23, "max": 30, "acciones": "Debida Diligencia Estándar. Monitoreo mensual. Revisión semestral." },
      "alto":  { "min": 31, "max": 39, "acciones": "Debida Diligencia Reforzada (DDR). Aprobación escrita OC. Monitoreo continuo. Revisión cada 6 meses." }
    },
    "triggers_alto_de_oficio": [
      { "codigo": "OFAC_SDN", "descripcion": "Coincidencia en lista OFAC SDN" },
      { "codigo": "ONU_CONSOLIDADA", "descripcion": "Coincidencia en lista ONU consolidada" },
      { "codigo": "PEP_FED_MX", "descripcion": "PEP federal mexicano" },
      { "codigo": "PEP_EXTRANJERO", "descripcion": "PEP extranjero" },
      { "codigo": "WALLET_SANCIONADA", "descripcion": "Wallet sancionada (OFAC SDN o ransomware)" },
      { "codigo": "GAFI_NEGRA", "descripcion": "País de residencia o contraparte en lista negra GAFI" }
    ]
  }'::jsonb,
  true
)
on conflict (organization_id, sector, version) do nothing;


-- ============================================================
-- >>> supabase/seed/06_juan_perez_demo.sql
-- ============================================================
-- =====================================================================
-- Seed · Cliente Juan Pérez Ejemplo (persona ficticia)
-- =====================================================================
-- Cliente final de muestra para el walkthrough del demo.
-- Sus datos no corresponden a ninguna persona real.
-- =====================================================================

insert into client (id, organization_id, tipo_persona, nombre_razon_social,
                    curp, rfc, nacionalidad, entidad_federativa, pais_residencia_iso2,
                    datos_kyc, nivel_kyc, alto_de_oficio, activo)
values (
  '55555555-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'fisica',
  'Juan Pérez Ejemplo (DEMO)',
  'PEJU850101HDFXXX01',
  'PEJU850101ABC',
  'Mexicana',
  'CDMX',
  'MX',
  '{
    "telefono": "+52 55 0000 0000",
    "email": "juan.perez+demo@ejemplo.mx",
    "domicilio": "Calle Demo 123, CDMX",
    "ocupacion": "Empleado formal",
    "origen_recursos": "Nómina"
  }'::jsonb,
  'N1', false, true
)
on conflict (id) do nothing;

-- Evaluación de riesgo precargada (score 17 → Bajo)
insert into client_risk_assessment (client_id, template_id, respuestas, subtotales,
                                    score_total, clasificacion)
values (
  '55555555-0000-0000-0000-000000000001',
  '44444444-0000-0000-0000-000000000001',
  '{
    "PROD-01": 3,
    "CLI-PF-01": 1, "CLI-PF-02": 2, "CLI-PF-03": 1, "CLI-PF-04": 1, "CLI-PF-05": 1,
    "PAIS-01": 1, "PAIS-02": 2, "PAIS-03": 1,
    "CAN-01": 2, "CAN-02": 1, "CAN-03": 2,
    "TRX-01": 1, "TRX-02": 1, "TRX-03": 1, "TRX-04": 1, "TRX-05": 1, "TRX-06": 1, "TRX-07": 1
  }'::jsonb,
  '{
    "E1_PRODUCTOS": 3,
    "E2_CLIENTE": 6,
    "E3_PAISES": 4,
    "E4_CANALES": 5,
    "E5_TRANSACCIONES": 7
  }'::jsonb,
  17,
  'bajo'
);

-- NOTA: este cliente sirve para que el operador pueda capturar operaciones
-- adicionales y para que el Motor PLD tenga contra qué evaluar tipologías.


-- ============================================================
-- >>> supabase/seed/07_operaciones_demo.sql
-- ============================================================
-- =====================================================================
-- Seed · Operaciones DEMO de Juan Pérez (RCG0.B0)
-- =====================================================================
-- Operaciones ficticias para que el Motor PLD tenga contra qué evaluar en
-- el walkthrough. NO corresponden a operaciones reales. Cada bloque está
-- diseñado para disparar una tipología concreta de forma aislada:
--
--   XVI-01 (structuring)  → 3 compras en <72h que suman >= 645 UMA
--   XVI-04 (país riesgo)   → 1 operación con contraparte en Irán (gafi_negra/ofac)
--   XVI-03 (on-chain, MOCK)→ 1 operación con exposicion_pct alto y categoría "mixer"
--   XVI-08 (privacy coins) → 1 operación en XMR (Monero)
--
-- Las señales on-chain (exposicion_pct, categorias) y de sesión (device_id, ip)
-- viven en operation.contraparte (jsonb). Son MOCK: no hay analítica on-chain
-- real integrada — el front las muestra con banner ámbar "DEMO".
-- Umbral 645 UMA * 113.07 MXN/UMA ≈ 72,930 MXN (Art. 17 LFPIORPI).
-- =====================================================================

-- --- XVI-01 Structuring: 3 compras del mismo cliente en <72h (suma ≈ 75,000 MXN > umbral) ---
insert into operation (id, organization_id, client_id, tipo, monto_mxn, moneda_origen,
                       activo_virtual, contraparte, fecha)
values
  ('66666666-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001',
   'compra_fiat_cripto', 25000.00, 'MXN', 'BTC',
   '{"pais_iso2": "MX", "nota_demo": "structuring 1/3"}'::jsonb,
   '2026-08-18T10:00:00Z'),
  ('66666666-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001',
   'compra_fiat_cripto', 25000.00, 'MXN', 'BTC',
   '{"pais_iso2": "MX", "nota_demo": "structuring 2/3"}'::jsonb,
   '2026-08-18T16:00:00Z'),
  ('66666666-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001',
   'compra_fiat_cripto', 25000.00, 'MXN', 'BTC',
   '{"pais_iso2": "MX", "nota_demo": "structuring 3/3"}'::jsonb,
   '2026-08-19T09:00:00Z')
on conflict (id) do nothing;

-- --- XVI-04 País de alto riesgo: contraparte en Irán (gafi_negra + ofac) ---
insert into operation (id, organization_id, client_id, tipo, monto_mxn, moneda_origen,
                       activo_virtual, contraparte, fecha)
values
  ('66666666-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001',
   'venta_cripto_fiat', 15000.00, 'MXN', 'USDT',
   '{"pais_iso2": "IR", "nota_demo": "contraparte pais de alto riesgo"}'::jsonb,
   '2026-08-19T11:00:00Z')
on conflict (id) do nothing;

-- --- XVI-03 Exposición on-chain (MOCK): wallet con 35% de exposición a mixer ---
insert into operation (id, organization_id, client_id, tipo, monto_mxn, moneda_origen,
                       activo_virtual, contraparte, fecha)
values
  ('66666666-0000-0000-0000-000000000005',
   '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001',
   'retiro_cripto', 40000.00, 'MXN', 'ETH',
   '{"pais_iso2": "MX", "exposicion_pct": 35, "categorias": ["mixer"], "fuente_mock": true, "nota_demo": "DEMO exposicion on-chain simulada"}'::jsonb,
   '2026-08-19T14:00:00Z')
on conflict (id) do nothing;

-- --- XVI-08 Privacy coins: operación en Monero (XMR) ---
insert into operation (id, organization_id, client_id, tipo, monto_mxn, moneda_origen,
                       activo_virtual, contraparte, fecha)
values
  ('66666666-0000-0000-0000-000000000006',
   '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001',
   'compra_fiat_cripto', 12000.00, 'MXN', 'XMR',
   '{"pais_iso2": "MX", "nota_demo": "privacy coin"}'::jsonb,
   '2026-08-19T15:00:00Z')
on conflict (id) do nothing;


commit;
