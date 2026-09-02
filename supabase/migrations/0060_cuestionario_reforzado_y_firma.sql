-- =====================================================================
-- 0060 · Cuestionario reforzado y firma
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 5, 01/09/2026,
-- Instrucciones 57–59.
--
-- Diseño:
--   - El cuestionario es del cliente; `operation_id` es el acto que lo ocasionó,
--     y puede ser null cuando se aplica sin acto específico (por ejemplo en una
--     reclasificación semestral).
--   - Sólo aplica a clientes de riesgo alto (`N3` o clasificación `alto`/`alto_oficio`).
--   - Los cinco bloques (Origen, Destino, Operación y relación, Vínculos y
--     calidad, Cierre) viven en `respuestas` como JSON.
--   - La firma es electrónica en sentido del Código de Comercio: no es e.firma
--     del SAT ni Didit. Didit aporta verificación de identidad; el mecanismo
--     de firma aporta atribución e integridad; el paquete de evidencia guarda
--     ambos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catálogos cerrados
-- ---------------------------------------------------------------------
do $$
begin
  create type firma_mecanismo as enum (
    'efirma_sat',
    'prestador_certificacion',
    'conservacion_mensajes_datos'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type estado_cuestionario as enum (
    'borrador',
    'firmado',
    'obsoleto'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 2. Tabla del cuestionario
-- ---------------------------------------------------------------------
create table if not exists cliente_cuestionario_reforzado (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references organizations(id) on delete cascade,
  client_id                   uuid not null references client(id) on delete cascade,
  operation_id                uuid references operation(id) on delete set null,
  cliente_aprobacion_relacion_id uuid references cliente_aprobacion_relacion(id) on delete set null,

  -- Cinco bloques del cuestionario
  respuestas                  jsonb not null default '{}'::jsonb,

  -- Firma
  firma_mecanismo             firma_mecanismo,
  firma_paquete_evidencia     jsonb,
  firma_verificacion_identidad_id uuid references verificacion_identidad(id) on delete set null,
  firmado_por                 uuid references auth.users(id) on delete set null,
  firmado_en                  timestamptz,
  estado                      estado_cuestionario not null default 'borrador',

  -- Vigencia: se actualiza en reclasificaciones o cuando aparece un piso
  vigencia_desde              timestamptz,
  vigencia_hasta              timestamptz,

  creado_por                  uuid references auth.users(id) on delete set null,
  creado_en                   timestamptz not null default now(),

  -- El cuestionario no es firma sin datos de atribución e integridad.
  constraint chk_cuestionario_firma_completa
    check (
      estado <> 'firmado'
      or (
        firma_mecanismo is not null
        and firma_paquete_evidencia is not null
        and firmado_por is not null
        and firmado_en is not null
      )
    )
);

comment on table cliente_cuestionario_reforzado is
  'Cuestionario reforzado del art. 23 Ter 3 de las RCG, aplicable sólo a clientes '
  'de riesgo alto. Cinco bloques en `respuestas`; firma electrónica de Código de '
  'Comercio, no e.firma. Didit verifica identidad; el mecanismo de firma aporta '
  'atribución e integridad.';
comment on column cliente_cuestionario_reforzado.firma_paquete_evidencia is
  'Datos de atribución e integridad: hash del mensaje, identidad del firmante, '
  'mecanismo, constancia de conservación cuando aplique, y referencia a la '
  'verificación Didit que sustenta la identidad.';

-- ---------------------------------------------------------------------
-- 3. Sólo aplica a clientes de riesgo alto
-- ---------------------------------------------------------------------
create or replace function public.trg_cliente_cuestionario_riesgo_alto()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nivel_kyc nivel_kyc;
  v_clasificacion clasificacion_riesgo;
begin
  select nivel_kyc into v_nivel_kyc from client where id = NEW.client_id;

  if v_nivel_kyc = 'N3' then
    return NEW;
  end if;

  select clasificacion
    into v_clasificacion
    from client_risk_assessment
   where client_id = NEW.client_id
   order by evaluado_en desc
   limit 1;

  if v_clasificacion in ('alto', 'alto_oficio') then
    return NEW;
  end if;

  raise exception 'El cuestionario reforzado sólo aplica a clientes de riesgo alto (N3, alto o alto_oficio)';
end;
$$;

drop trigger if exists trg_cliente_cuestionario_riesgo_alto on cliente_cuestionario_reforzado;
create trigger trg_cliente_cuestionario_riesgo_alto
  before insert on cliente_cuestionario_reforzado
  for each row execute function public.trg_cliente_cuestionario_riesgo_alto();

-- ---------------------------------------------------------------------
-- 4. Vigencia por defecto: 6 meses
-- ---------------------------------------------------------------------
create or replace function public.trg_cliente_cuestionario_vigencia()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.vigencia_desde is null then
    NEW.vigencia_desde := coalesce(NEW.firmado_en, NEW.creado_en, now());
  end if;

  if NEW.vigencia_hasta is null then
    NEW.vigencia_hasta := NEW.vigencia_desde + interval '6 months';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_cliente_cuestionario_vigencia on cliente_cuestionario_reforzado;
create trigger trg_cliente_cuestionario_vigencia
  before insert on cliente_cuestionario_reforzado
  for each row execute function public.trg_cliente_cuestionario_vigencia();

-- ---------------------------------------------------------------------
-- 5. No marcar como firmado si falta mecanismo o evidencia
-- ---------------------------------------------------------------------
create or replace function public.trg_cliente_cuestionario_firma_completa()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.estado = 'firmado' then
    if NEW.firma_mecanismo is null
      or NEW.firma_paquete_evidencia is null
      or NEW.firmado_por is null
      or NEW.firmado_en is null
    then
      raise exception 'Para firmar el cuestionario se requiere mecanismo, paquete de evidencia, firmante y fecha';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_cliente_cuestionario_firma_completa on cliente_cuestionario_reforzado;
create trigger trg_cliente_cuestionario_firma_completa
  before insert or update on cliente_cuestionario_reforzado
  for each row execute function public.trg_cliente_cuestionario_firma_completa();

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
alter table cliente_cuestionario_reforzado enable row level security;

drop policy if exists "cliente_cuestionario_select_org" on cliente_cuestionario_reforzado;
create policy "cliente_cuestionario_select_org"
  on cliente_cuestionario_reforzado
  for select using (
    organization_id = public.current_org_id()
  );

drop policy if exists "cliente_cuestionario_write_operador_oc_admin" on cliente_cuestionario_reforzado;
create policy "cliente_cuestionario_write_operador_oc_admin"
  on cliente_cuestionario_reforzado
  for all using (
    organization_id = public.current_org_id()
    and (public.has_rol('operador') or public.has_rol('oc') or public.has_rol('admin'))
  );

revoke all on cliente_cuestionario_reforzado from anon;
grant select, insert, update, delete on cliente_cuestionario_reforzado to authenticated;

-- ---------------------------------------------------------------------
-- 7. Bitácora
-- ---------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org
                  and tipo = 'cuestionario_reforzado_modelo') then
      continue;
    end if;

    perform public.registrar_evento(
      v_org,
      'cuestionario_reforzado_modelo',
      'client',
      null,
      jsonb_build_object(
        'fuente', 'Kawiil Mx · Célula de Cumplimiento, Adenda 5, Instrucciones 57–59, 01/09/2026.',
        'sujeto', 'cliente; operation_id es el acto detonante y puede ser null.',
        'alcance', 'Sólo clientes N3, alto o alto_oficio.',
        'firma', 'Firma Electrónica en sentido Código de Comercio. No es e.firma ni Didit; '
                || 'Didit sustenta identidad; el mecanismo de firma aporta atribución e integridad.'
      ),
      'sistema',
      null
    );
  end loop;
end $$;
