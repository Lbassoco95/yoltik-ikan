-- =====================================================================
-- 0062 · Consulta a la Secretaría de Economía
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 5, 01/09/2026,
-- Instrucciones 63–65.
--
-- Diseño:
--   - Una fila por cliente, con `estado = 'no_aplica'` cuando es persona física,
--     para distinguir «no aplica» de «se nos olvidó».
--   - Cinco campos mínimos: estado, fecha/medio/folio/resultado, evidencia,
--     quién la realizó y bajo qué versión del expediente.
--   - La fecha de obligación manual es el 1 de marzo de 2027; el campo y la
--     evidencia se construyen ahora, sin automatización.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catálogos cerrados
-- ---------------------------------------------------------------------
do $$
begin
  create type estado_consulta_se as enum (
    'no_aplica',
    'pendiente',
    'realizada',
    'no_disponible'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type resultado_consulta_se as enum (
    'coincide',
    'discrepa',
    'sin_informacion'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 2. Tabla
-- ---------------------------------------------------------------------
create table if not exists cliente_consulta_secretaria_economia (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references organizations(id) on delete cascade,
  client_id                uuid not null references client(id) on delete cascade,

  estado                   estado_consulta_se not null default 'pendiente',
  fecha_consulta           timestamptz,
  medio_empleado           text,
  folio_acuse              text,
  resultado                resultado_consulta_se,
  motivo_no_disponible     text,
  evidencia_storage_path   text,
  realizada_por            uuid references auth.users(id) on delete set null,
  version_expediente       text,
  cliente_aprobacion_relacion_id uuid references cliente_aprobacion_relacion(id) on delete set null,

  vigencia_desde           timestamptz,
  vigencia_hasta           timestamptz,

  creado_por               uuid references auth.users(id) on delete set null,
  creado_en                timestamptz not null default now(),

  -- Si está realizada, los campos mínimos deben existir.
  constraint chk_consulta_se_realizada_completa
    check (
      estado <> 'realizada'
      or (
        fecha_consulta is not null
        and medio_empleado is not null
        and resultado is not null
        and realizada_por is not null
      )
    ),

  -- Si no está disponible, el motivo es obligatorio.
  constraint chk_consulta_se_no_disponible_motivo
    check (
      estado <> 'no_disponible'
      or motivo_no_disponible is not null
    )
);

comment on table cliente_consulta_secretaria_economia is
  'Consulta a la Secretaría de Economía (Registros Públicos de Comercio). '
  'Obligatoria manual desde el 1 de marzo de 2027 para personas morales de riesgo alto. '
  'La automatización queda sin fecha comprometida; el campo y la evidencia se '
  'construyen ahora.';
comment on column cliente_consulta_secretaria_economia.estado is
  '`no_aplica` se usa para personas físicas, para distinguirlo de un pendiente '
  'sin registrar. La ausencia de fila es indistinguible de una omisión.';

-- ---------------------------------------------------------------------
-- 3. Valor por defecto según tipo de persona y riesgo
-- ---------------------------------------------------------------------
create or replace function public.trg_cliente_consulta_se_default()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tipo tipo_persona;
  v_nivel nivel_kyc;
begin
  select tipo_persona, nivel_kyc into v_tipo, v_nivel
    from client
   where id = NEW.client_id;

  if NEW.vigencia_desde is null then
    NEW.vigencia_desde := now();
  end if;

  if v_tipo = 'fisica' then
    NEW.estado := 'no_aplica';
    NEW.vigencia_hasta := NEW.vigencia_desde + interval '100 years'; -- No vence: no aplica.
  elsif v_nivel = 'N3' then
    NEW.estado := 'pendiente';
    NEW.vigencia_hasta := '2027-03-01T00:00:00+00:00'::timestamptz;
  else
    NEW.estado := 'no_aplica';
    NEW.vigencia_hasta := NEW.vigencia_desde + interval '100 years';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_cliente_consulta_se_default on cliente_consulta_secretaria_economia;
create trigger trg_cliente_consulta_se_default
  before insert on cliente_consulta_secretaria_economia
  for each row execute function public.trg_cliente_consulta_se_default();

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table cliente_consulta_secretaria_economia enable row level security;

drop policy if exists "cliente_consulta_se_select_org" on cliente_consulta_secretaria_economia;
create policy "cliente_consulta_se_select_org"
  on cliente_consulta_secretaria_economia
  for select using (
    organization_id = public.current_org_id()
  );

drop policy if exists "cliente_consulta_se_write_oc_admin" on cliente_consulta_secretaria_economia;
create policy "cliente_consulta_se_write_oc_admin"
  on cliente_consulta_secretaria_economia
  for all using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

revoke all on cliente_consulta_secretaria_economia from anon;
grant select, insert, update, delete on cliente_consulta_secretaria_economia to authenticated;

-- ---------------------------------------------------------------------
-- 5. Bitácora
-- ---------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org
                  and tipo = 'consulta_secretaria_economia_modelo') then
      continue;
    end if;

    perform public.registrar_evento(
      v_org,
      'consulta_secretaria_economia_modelo',
      'client',
      null,
      jsonb_build_object(
        'fuente', 'Kawiil Mx · Célula de Cumplimiento, Adenda 5, Instrucciones 63–65, 01/09/2026.',
        'estados', 'no_aplica, pendiente, realizada, no_disponible. `no_aplica` para personas físicas.',
        'campos', 'Estado, fecha de consulta, medio, folio, resultado, evidencia, realizada_por, version_expediente.',
        'exigibilidad', 'Acto manual obligatorio desde 1 de marzo de 2027 para personas morales de riesgo alto. '
                       || 'Automatización sin fecha comprometida.'
      ),
      'sistema',
      null
    );
  end loop;
end $$;
