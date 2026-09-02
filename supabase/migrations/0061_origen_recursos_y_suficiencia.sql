-- =====================================================================
-- 0061 · Origen de recursos, documentos admitidos y reglas de suficiencia
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 5, 01/09/2026,
-- Instrucciones 60–62.
--
-- Diseño:
--   - Catálogo cerrado y versionado de orígenes de recursos; cada fila
--     lleva los documentos admitidos para ese origen.
--   - `cliente_origen_recurso` declara, para un cliente o acto, qué origen
--     explica los recursos y en qué monto.
--   - `cliente_documento_soporte` guarda cada archivo con los cuatro metadatos
--     obligatorios (tipo, emisor, fecha/periodo, monto).
--   - Las reglas de suficiencia duras son CHECKs; las blandas (monto total,
--     documento de tercero) son flags calculados en una vista, porque la
--     Adenda pide bandera y revisión del OC, no bloqueo automático.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catálogo de orígenes de recursos
-- ---------------------------------------------------------------------
create table if not exists catalogo_origen_recurso (
  id                 uuid primary key default gen_random_uuid(),
  version            int not null default 1,
  vigente_desde      date not null default current_date,
  vigente_hasta      date,
  clave              text not null,
  nombre             text not null,
  documentos_admitidos jsonb not null default '[]'::jsonb,
  requiere_justificacion boolean not null default false,
  activo             boolean not null default true,

  constraint chk_catalogo_origen_version_vigencia
    check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

-- Si la tabla ya fue creada sin esta restricción, la añadimos antes del ON CONFLICT.
alter table catalogo_origen_recurso
  drop constraint if exists uq_catalogo_origen_recurso_clave_version,
  add constraint uq_catalogo_origen_recurso_clave_version
    unique (clave, version);

comment on table catalogo_origen_recurso is
  'Catálogo cerrado y versionado de orígenes de recursos. Cada versión '
  'declara qué documentos admite como soporte. La versión con la que se capturó '
  'se guarda en el registro del cliente, para que una edición futura del catálogo '
  'no cambie en silencio expedientes antiguos.';

-- ---------------------------------------------------------------------
-- 2. Semilla de orígenes (v1) — textos de la Adenda 5, apartado 4.1
-- ---------------------------------------------------------------------
insert into catalogo_origen_recurso (clave, nombre, documentos_admitidos)
values
  ('sueldos_salarios', 'Sueldos y salarios',
   '["CFDI de nómina","Constancia de percepciones y retenciones","Estado de cuenta donde se refleje el depósito"]'),
  ('actividad_empresarial', 'Actividad empresarial o profesional',
   '["Declaración anual del ISR","Pagos provisionales","Estados de cuenta de la actividad","CFDI emitidos representativos"]'),
  ('enajenacion_inmueble', 'Enajenación de un bien inmueble',
   '["Escritura pública de la enajenación previa","CFDI o comprobante de la operación","Constancia de pago del ISR por enajenación","Avalúo"]'),
  ('enajenacion_otros_bienes', 'Enajenación de otros bienes',
   '["Contrato de compraventa","Factura o CFDI","Comprobante de la transferencia recibida"]'),
  ('credito_financiamiento', 'Crédito o financiamiento',
   '["Contrato de crédito","Estado de cuenta del crédito","Carta de autorización o instrucción de disposición de la institución"]'),
  ('herencia_legado', 'Herencia o legado',
   '["Escritura de adjudicación por herencia","Resolución judicial","Declaración informativa cuando aplique"]'),
  ('donacion', 'Donación',
   '["Escritura o contrato de donación","Comprobante de la transferencia"]'),
  ('dividendos_reduccion_capital', 'Dividendos o reducción de capital',
   '["Acta de asamblea que los decreta","Constancia de retención","Estado de cuenta"]'),
  ('ahorro_acumulado', 'Ahorro acumulado',
   '["Estados de cuenta de al menos los doce meses previos que muestren la acumulación"]'),
  ('enajenacion_activos_virtuales', 'Enajenación de activos virtuales',
   '["Comprobante de la plataforma con identificación de cuenta y trazabilidad","Estado de cuenta bancario del retiro a nombre del cliente"]'),
  ('indemnizacion_seguro_premio', 'Indemnización, seguro o premio',
   '["Póliza y comprobante de pago","Constancia de entrega del premio y su retención"]'),
  ('recursos_tercero', 'Recursos de un tercero',
   '["Identificación del tercero","Documento que acredite el origen en el patrimonio del tercero","Documento que acredite el vínculo","Contrato o instrucción que documente la entrega"]')
on conflict (clave, version) do nothing;

-- ---------------------------------------------------------------------
-- 3. Origen de recursos declarado por cliente/acto
-- ---------------------------------------------------------------------
create table if not exists cliente_origen_recurso (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references organizations(id) on delete cascade,
  client_id                 uuid not null references client(id) on delete cascade,
  operation_id              uuid references operation(id) on delete set null,
  catalogo_origen_recurso_id uuid not null references catalogo_origen_recurso(id) on delete restrict,
  version_catalogo          int not null,
  monto_declarado         numeric not null,
  moneda                  text not null default 'MXN',
  justificacion           text,
  oc_revisado             boolean not null default false,
  capturado_por           uuid references auth.users(id) on delete set null,
  capturado_en            timestamptz not null default now()
);

comment on table cliente_origen_recurso is
  'Origen de recursos declarado para un cliente o acto. La versión del catálogo '
  'se congela al insertar para no alterar expedientes históricos.';

-- ---------------------------------------------------------------------
-- 4. Orígenes `otro` requieren justificación
-- ---------------------------------------------------------------------
create or replace function public.trg_cliente_origen_recurso_otro_justificado()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_requiere boolean;
begin
  select requiere_justificacion into v_requiere
    from catalogo_origen_recurso
   where id = NEW.catalogo_origen_recurso_id;

  if v_requiere and (NEW.justificacion is null or btrim(NEW.justificacion) = '') then
    raise exception 'El origen % requiere justificación', NEW.catalogo_origen_recurso_id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_cliente_origen_recurso_otro_justificado on cliente_origen_recurso;
create trigger trg_cliente_origen_recurso_otro_justificado
  before insert or update on cliente_origen_recurso
  for each row execute function public.trg_cliente_origen_recurso_otro_justificado();

-- ---------------------------------------------------------------------
-- 5. Congelar versión del catálogo al insertar
-- ---------------------------------------------------------------------
create or replace function public.trg_cliente_origen_recurso_version_catalogo()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_version int;
begin
  select version into v_version from catalogo_origen_recurso where id = NEW.catalogo_origen_recurso_id;
  NEW.version_catalogo := v_version;
  return NEW;
end;
$$;

drop trigger if exists trg_cliente_origen_recurso_version_catalogo on cliente_origen_recurso;
create trigger trg_cliente_origen_recurso_version_catalogo
  before insert on cliente_origen_recurso
  for each row execute function public.trg_cliente_origen_recurso_version_catalogo();

-- ---------------------------------------------------------------------
-- 6. Documentos de soporte
-- ---------------------------------------------------------------------
create table if not exists cliente_documento_soporte (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references organizations(id) on delete cascade,
  client_id                uuid not null references client(id) on delete cascade,
  cliente_origen_recurso_id uuid references cliente_origen_recurso(id) on delete cascade,
  operation_id             uuid references operation(id) on delete set null,

  storage_path             text not null,
  nombre_archivo           text not null,
  mime_type                text,
  tamano_bytes             bigint,

  -- Cuatro metadatos obligatorios
  tipo_documento           text not null,
  emisor                   text not null check (emisor in ('propio', 'tercero')),
  emisor_nombre            text,
  fecha_documento          date,
  periodo_cubre_inicio     date,
  periodo_cubre_fin        date,
  monto_acreditado         numeric,
  moneda                   text not null default 'MXN',

  es_identificacion        boolean not null default false,
  justificacion            text,

  subido_por               uuid references auth.users(id) on delete set null,
  subido_en                timestamptz not null default now(),

  -- Dura: el documento de identificación nunca cuenta como soporte de origen.
  constraint chk_documento_soporte_no_es_identificacion
    check (es_identificacion = false),
  -- Dura: el emisor debe existir.
  constraint chk_documento_soporte_emisor_nombre
    check (emisor = 'propio' or emisor_nombre is not null)
);

comment on table cliente_documento_soporte is
  'Documentos que sostienen el origen de los recursos. Cada archivo trae los '
  'cuatro metadatos obligatorios: tipo, emisor, fecha/periodo y monto.';
comment on column cliente_documento_soporte.es_identificacion is
  'Bandera para rechazar documentos tipificados como identificación como soporte '
  'de origen de recursos, aunque se suban en este apartado.';

-- ---------------------------------------------------------------------
-- 6. Validar que el tipo de documento esté en el catálogo del origen
-- ---------------------------------------------------------------------
create or replace function public.trg_cliente_documento_soporte_tipo_admitido()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_admitidos jsonb;
  v_origen_id uuid;
begin
  if NEW.cliente_origen_recurso_id is null then
    return NEW;
  end if;

  select catalogo_origen_recurso_id into v_origen_id
    from cliente_origen_recurso
   where id = NEW.cliente_origen_recurso_id;

  select documentos_admitidos into v_admitidos
    from catalogo_origen_recurso
   where id = v_origen_id;

  if v_admitidos is null or not (v_admitidos ? NEW.tipo_documento) then
    raise exception 'El tipo de documento % no está admitido para este origen de recursos', NEW.tipo_documento;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_cliente_documento_soporte_tipo_admitido on cliente_documento_soporte;
create trigger trg_cliente_documento_soporte_tipo_admitido
  before insert or update on cliente_documento_soporte
  for each row execute function public.trg_cliente_documento_soporte_tipo_admitido();

-- ---------------------------------------------------------------------
-- 7. Vista de suficiencia (blanda: banderas, no bloqueos)
-- ---------------------------------------------------------------------
create or replace view v_suficiencia_origen_recursos with (security_invoker = true) as
select
  oor.id as origen_recursos_id,
  oor.client_id,
  oor.operation_id,
  oor.catalogo_origen_recurso_id,
  oor.monto_declarado,
  coalesce(o.monto_mxn, oor.monto_declarado) as monto_a_cubrir,
  coalesce(sum(cds.monto_acreditado), 0) as monto_acreditado,
  bool_or(cds.id is not null) as tiene_documento,
  bool_or(cds.emisor = 'tercero') as tiene_documento_tercero,
  (coalesce(sum(cds.monto_acreditado), 0) >= coalesce(o.monto_mxn, oor.monto_declarado)) as monto_suficiente,
  (cor.requiere_justificacion and not oor.oc_revisado) as otro_requiere_revision,
  bool_or(cds.es_identificacion = true) as tiene_identificacion_rechazada
from cliente_origen_recurso oor
join catalogo_origen_recurso cor on cor.id = oor.catalogo_origen_recurso_id
left join cliente_documento_soporte cds
  on cds.cliente_origen_recurso_id = oor.id
left join operation o on o.id = oor.operation_id
group by
  oor.id,
  oor.client_id,
  oor.operation_id,
  oor.catalogo_origen_recurso_id,
  oor.monto_declarado,
  oor.oc_revisado,
  cor.requiere_justificacion,
  o.monto_mxn;

comment on view v_suficiencia_origen_recursos is
  'Banderas de suficiencia de origen de recursos, no bloqueos. El OC revisa '
  'montos insuficientes, falta de documento de tercero en riesgo alto y '
  'orígenes con justificación pendiente.';

-- ---------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------
alter table cliente_origen_recurso enable row level security;
alter table cliente_documento_soporte enable row level security;

-- `catalogo_origen_recurso` es global; todos los usuarios autenticados pueden leerlo.
alter table catalogo_origen_recurso enable row level security;

drop policy if exists "catalogo_origen_recurso_select" on catalogo_origen_recurso;
create policy "catalogo_origen_recurso_select"
  on catalogo_origen_recurso
  for select using (true);

drop policy if exists "cliente_origen_recurso_select_org" on cliente_origen_recurso;
create policy "cliente_origen_recurso_select_org"
  on cliente_origen_recurso
  for select using (organization_id = public.current_org_id());

drop policy if exists "cliente_origen_recurso_write" on cliente_origen_recurso;
create policy "cliente_origen_recurso_write"
  on cliente_origen_recurso
  for all using (
    organization_id = public.current_org_id()
    and (public.has_rol('operador') or public.has_rol('oc') or public.has_rol('admin'))
  );

drop policy if exists "cliente_documento_soporte_select_org" on cliente_documento_soporte;
create policy "cliente_documento_soporte_select_org"
  on cliente_documento_soporte
  for select using (organization_id = public.current_org_id());

drop policy if exists "cliente_documento_soporte_write" on cliente_documento_soporte;
create policy "cliente_documento_soporte_write"
  on cliente_documento_soporte
  for all using (
    organization_id = public.current_org_id()
    and (public.has_rol('operador') or public.has_rol('oc') or public.has_rol('admin'))
  );

revoke all on catalogo_origen_recurso from anon;
grant select on catalogo_origen_recurso to authenticated;

revoke all on cliente_origen_recurso, cliente_documento_soporte from anon;
grant select, insert, update, delete on cliente_origen_recurso, cliente_documento_soporte to authenticated;

-- ---------------------------------------------------------------------
-- 9. Bitácora
-- ---------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org
                  and tipo = 'origen_recursos_modelo') then
      continue;
    end if;

    perform public.registrar_evento(
      v_org,
      'origen_recursos_modelo',
      'client',
      null,
      jsonb_build_object(
        'fuente', 'Kawiil Mx · Célula de Cumplimiento, Adenda 5, Instrucciones 60–62, 01/09/2026.',
        'catalogo', 'catalogo_origen_recurso, versionado y con documentos_admitidos.',
        'metadatos', 'cliente_documento_soporte: tipo_documento, emisor, fecha/periodo, monto.',
        'suficiencia', 'v_suficiencia_origen_recursos: banderas blandas para revisión del OC; '
                      || 'checks duros: no identificación como soporte, tipo admitido, emisor con nombre.'
      ),
      'sistema',
      null
    );
  end loop;
end $$;
