-- =====================================================================
-- 0058 · Aprobación del expediente y del acto
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 5, 01/09/2026,
-- Instrucciones 49–53.
--
-- Diseño:
--   - El sujeto del dato es el cliente, el detonante es el acto.
--   - `cliente_aprobacion_relacion` aprueba entrar o continuar la relación
--     con un cliente N3; vence con la reevaluación semestral.
--   - `operation` apunta a esa aprobación, y también registra una aprobación
--     propia del acto cuando el piso lo dispare.
--   - `autoaprobacion` se escribe al momento de la aprobación; nunca se
--     deriva en lectura, para que un cambio de personal no cambie el pasado.
--   - `revision_total_auditoria` es una vista, no una columna escribible.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Designación del Oficial de Cumplimiento en la organización
-- ---------------------------------------------------------------------
-- El OC es una figura designada, no una inferencia de los roles vigentes.
-- Si aparece un segundo usuario con rol `oc`, el cálculo no cambia solo.
alter table organizations
  add column if not exists oc_encargado_user_id uuid references auth.users(id) on delete set null,
  add column if not exists oc_designado_en     timestamptz,
  add column if not exists oc_es_titular       boolean not null default false;

comment on column organizations.oc_encargado_user_id is
  'Usuario designado como Oficial de Cumplimiento ante la Secretaría. '
  'La autoaprobación se calcula comparando el aprobador con este usuario, '
  'no con el conjunto de quienes hoy tengan rol oc.';
comment on column organizations.oc_designado_en is
  'Fecha en que se registró la designación del OC. Auditable para la '
  'revisión anual, cuando el OC vigente puede no ser el que aprobó.';
comment on column organizations.oc_es_titular is
  'Verdadero cuando el Oficial de Cumplimiento es el notario titular o '
  'directivo único de la organización. La autoaprobación admite la '
  'estructura de una sola persona.';

-- ---------------------------------------------------------------------
-- 2. Calidad en que se aprueba
-- ---------------------------------------------------------------------
do $$
begin
  create type calidad_aprobacion as enum (
    'notario_titular',
    'oficial_cumplimiento',
    'directivo_designado'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 3. Aprobación de la relación con un cliente de riesgo alto
-- ---------------------------------------------------------------------
create table if not exists cliente_aprobacion_relacion (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  client_id           uuid not null references client(id) on delete cascade,
  evaluacion_riesgo_id uuid references client_risk_assessment(id) on delete set null,
  aprobada_por        uuid references auth.users(id) on delete set null,
  aprobada_en         timestamptz,
  calidad_aprobacion  calidad_aprobacion,
  aprobada_rol_activo rol_usuario,
  autoaprobacion      boolean not null default false,
  vigencia_desde      timestamptz,
  vigencia_hasta      timestamptz,
  motivo              text,
  creado_por          uuid references auth.users(id) on delete set null,
  creado_en           timestamptz not null default now(),

  -- La aprobación es un paquete: todos los campos o ninguno.
  constraint chk_cliente_aprobacion_relacion_completa
    check (
      (aprobada_por is null and aprobada_en is null and calidad_aprobacion is null and aprobada_rol_activo is null)
      or
      (aprobada_por is not null and aprobada_en is not null and calidad_aprobacion is not null and aprobada_rol_activo is not null)
    ),

  -- El rol operador nunca aprueba, aunque tenga más roles.
  constraint chk_cliente_aprobacion_relacion_no_operador
    check (aprobada_rol_activo is null or aprobada_rol_activo <> 'operador'),

  -- La vigencia cubre un intervalo coherente.
  constraint chk_cliente_aprobacion_relacion_vigencia
    check (vigencia_hasta is null or vigencia_desde is null or vigencia_hasta >= vigencia_desde)
);

comment on table cliente_aprobacion_relacion is
  'Aprobación para entrar o continuar la relación con un cliente de riesgo alto. '
  'Una por cliente por evento de clasificación, con vigencia atada a la '
  'reevaluación semestral.';
comment on column cliente_aprobacion_relacion.autoaprobacion is
  'Calculado al escribir: aprobador = OC designado = autor del expediente. '
  'Nunca se deriva en lectura, para que los cambios de personal no alteren '
  'la bandera de una aprobación ya registrada.';

-- ---------------------------------------------------------------------
-- 4. Cálculo de la autoaprobación
-- ---------------------------------------------------------------------
create or replace function public.calcular_autoaprobacion(
  p_aprobador     uuid,
  p_autor         uuid,
  p_organization_id uuid
)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_oc uuid;
begin
  select oc_encargado_user_id into v_oc
    from organizations
   where id = p_organization_id;

  return p_aprobador is not null
    and p_autor is not null
    and p_organization_id is not null
    and p_aprobador = p_autor
    and p_aprobador = v_oc;
end;
$$;

create or replace function public.trg_cliente_aprobacion_relacion_autoaprobacion()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_autor uuid;
begin
  select capturado_por into v_autor
    from client
   where id = NEW.client_id;

  NEW.autoaprobacion := public.calcular_autoaprobacion(
    NEW.aprobada_por,
    v_autor,
    NEW.organization_id
  );

  return NEW;
end;
$$;

drop trigger if exists trg_cliente_aprobacion_relacion_autoaprobacion on cliente_aprobacion_relacion;
create trigger trg_cliente_aprobacion_relacion_autoaprobacion
  before insert or update on cliente_aprobacion_relacion
  for each row execute function public.trg_cliente_aprobacion_relacion_autoaprobacion();

-- ---------------------------------------------------------------------
-- Vigencia por defecto: seis meses desde la aprobación
-- ---------------------------------------------------------------------
create or replace function public.trg_cliente_aprobacion_relacion_vigencia()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.vigencia_desde is null then
    NEW.vigencia_desde := coalesce(NEW.aprobada_en, now());
  end if;

  if NEW.vigencia_hasta is null then
    NEW.vigencia_hasta := NEW.vigencia_desde + interval '6 months';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_cliente_aprobacion_relacion_vigencia on cliente_aprobacion_relacion;
create trigger trg_cliente_aprobacion_relacion_vigencia
  before insert or update on cliente_aprobacion_relacion
  for each row execute function public.trg_cliente_aprobacion_relacion_vigencia();

-- ---------------------------------------------------------------------
-- 5. Aprobación del acto
-- ---------------------------------------------------------------------
alter table operation
  add column if not exists aprobacion_relacion_id uuid references cliente_aprobacion_relacion(id) on delete set null,
  add column if not exists aprobada_por           uuid references auth.users(id) on delete set null,
  add column if not exists aprobada_en            timestamptz,
  add column if not exists calidad_aprobacion     calidad_aprobacion,
  add column if not exists aprobada_rol_activo    rol_usuario,
  add column if not exists autoaprobacion         boolean not null default false;

comment on column operation.aprobacion_relacion_id is
  'FK a la aprobación de relación con el cliente en la que se apoya este acto. '
  'Nullable: los actos de clientes bajos o medios no requieren aprobación de relación.';
comment on column operation.autoaprobacion is
  'Calculado al aprobar el acto: aprobador = OC designado = capturador del acto. '
  'Se escribe una sola vez; la historia no cambia si el personal cambia.';

alter table operation
  drop constraint if exists chk_operation_aprobacion_completa,
  drop constraint if exists chk_operation_aprobacion_no_operador;

alter table operation
  add constraint chk_operation_aprobacion_completa
    check (
      (aprobada_por is null and aprobada_en is null and calidad_aprobacion is null and aprobada_rol_activo is null)
      or
      (aprobada_por is not null and aprobada_en is not null and calidad_aprobacion is not null and aprobada_rol_activo is not null)
    ),
  add constraint chk_operation_aprobacion_no_operador
    check (aprobada_rol_activo is null or aprobada_rol_activo <> 'operador');

-- El paquete de aprobación se valida con `chk_operation_aprobacion_completa`;
-- no se añade un check adicional para no duplicar la condición.

-- ---------------------------------------------------------------------
-- 6. Cálculo de autoaprobación en operation
-- ---------------------------------------------------------------------
create or replace function public.trg_operation_autoaprobacion()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    NEW.autoaprobacion := public.calcular_autoaprobacion(
      NEW.aprobada_por,
      NEW.capturado_por,
      NEW.organization_id
    );
  elsif TG_OP = 'UPDATE' then
    if NEW.aprobada_por is distinct from OLD.aprobada_por
      or NEW.aprobada_en is distinct from OLD.aprobada_en
      or NEW.calidad_aprobacion is distinct from OLD.calidad_aprobacion
      or NEW.aprobada_rol_activo is distinct from OLD.aprobada_rol_activo
    then
      NEW.autoaprobacion := public.calcular_autoaprobacion(
        NEW.aprobada_por,
        NEW.capturado_por,
        NEW.organization_id
      );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_operation_autoaprobacion on operation;
create trigger trg_operation_autoaprobacion
  before insert or update on operation
  for each row execute function public.trg_operation_autoaprobacion();

-- ---------------------------------------------------------------------
-- 7. Vista de revisión total en auditoría
-- ---------------------------------------------------------------------
create or replace view v_revision_total_auditoria with (security_invoker = true) as
select
  o.id               as operation_id,
  o.organization_id,
  o.client_id,
  o.aprobada_por,
  o.aprobada_en,
  o.autoaprobacion,
  o.calidad_aprobacion,
  o.aprobacion_relacion_id,
  car.vigencia_hasta as relacion_vigencia_hasta,
  c.nivel_kyc
from operation o
join client c on c.id = o.client_id
left join cliente_aprobacion_relacion car
  on car.id = o.aprobacion_relacion_id
where o.autoaprobacion = true
  and (
    c.nivel_kyc = 'N3'
    or exists (
      select 1 from client_risk_assessment cra
       where cra.client_id = c.id
         and cra.clasificacion in ('alto', 'alto_oficio')
       order by cra.evaluado_en desc
       limit 1
    )
  );

comment on view v_revision_total_auditoria is
  'Actos de clientes de riesgo alto que se aprobaron a sí mismos, y que por '
  'tanto deben revisarse al cien por ciento en la auditoría interna anual. '
  'Es selección de muestra, no propiedad escribible del acto.';

-- ---------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------
alter table cliente_aprobacion_relacion enable row level security;

drop policy if exists "cliente_aprobacion_relacion_select_org" on cliente_aprobacion_relacion;
create policy "cliente_aprobacion_relacion_select_org"
  on cliente_aprobacion_relacion
  for select using (
    organization_id = public.current_org_id()
  );

drop policy if exists "cliente_aprobacion_relacion_write_oc_admin" on cliente_aprobacion_relacion;
create policy "cliente_aprobacion_relacion_write_oc_admin"
  on cliente_aprobacion_relacion
  for all using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

revoke all on cliente_aprobacion_relacion from anon;
grant select, insert, update, delete on cliente_aprobacion_relacion to authenticated;

-- `operation` ya tiene RLS; la aprobación del acto la actualiza quien ya
-- podía actualizar operaciones (oc o admin). El rol operador no entra.

-- ---------------------------------------------------------------------
-- 9. Bitácora
-- ---------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org
                  and tipo = 'aprobacion_expediente_modelo') then
      continue;
    end if;

    perform public.registrar_evento(
      v_org,
      'aprobacion_expediente_modelo',
      'organizations',
      v_org,
      jsonb_build_object(
        'fuente', 'Kawiil Mx · Célula de Cumplimiento, Adenda 5, Instrucciones 49–53, 01/09/2026.',
        'oc_designado', 'El OC se designa por campo en organizations, no por inferir de user_roles. '
                     || 'La autoaprobación se calcula y almacena en el acto; nunca se deriva en lectura.',
        'dos_niveles', 'cliente_aprobacion_relacion para la relación con cliente N3; '
                    || 'operation para el acto, con FK a la relación y columnas propias.',
        'revision_total', 'v_revision_total_auditoria es vista, no columna escribible. '
                       || 'Sólo actos de clientes de riesgo alto con autoaprobación = true.'
      ),
      'sistema',
      null
    );
  end loop;
end $$;
