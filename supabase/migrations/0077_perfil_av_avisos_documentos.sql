-- =====================================================================
-- 0077 · Perfil AV por organización + máquina de avisos + documentos
-- =====================================================================
-- 1. Sin perfil de actividad vulnerable no hay captura de cliente/operación.
-- 2. Aviso: estados explícitos; acuse de rechazo NO cierra.
-- 3. Documentos (XML, huellas, acuses) inmutables: nunca se sobrescriben.
-- 4. Reloj de 24 h desde el conocimiento (sin exigir operación celebrada).
-- 5. Modificatorio: a lo sumo una vez en 30 días.
-- 6. Constancia de configuración de organización.
--
-- Reversa (manual):
--   drop trigger if exists trg_bloqueo_sin_perfil_client on client;
--   drop trigger if exists trg_bloqueo_sin_perfil_operation on operation;
--   drop function if exists public.organizacion_tiene_perfil_av(uuid);
--   drop function if exists public.exigir_perfil_av();
--   drop function if exists public.transicionar_aviso(uuid, estado_aviso, jsonb);
--   drop table if exists organizacion_config_constancia cascade;
--   drop table if exists aviso_documento cascade;
--   drop table if exists organizacion_actividad_vulnerable cascade;
--   -- columnas nuevas de aviso: ver alter al final (drop column)
--   -- valores nuevos de enums no se pueden quitar fácilmente en PG
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ampliar enums de aviso
-- ---------------------------------------------------------------------
alter type tipo_aviso add value if not exists 'modificatorio';
alter type tipo_aviso add value if not exists 'informe_sin_operaciones';

-- Estados nuevos. 'acusado' se conserva por filas existentes (= acuse_aceptado).
alter type estado_aviso add value if not exists 'validado';
alter type estado_aviso add value if not exists 'generado';
alter type estado_aviso add value if not exists 'presentado';
alter type estado_aviso add value if not exists 'acuse_aceptado';
alter type estado_aviso add value if not exists 'acuse_rechazo';
-- 'cerrado' sólo tras acuse aceptado (o cierre administrativo explícito).
alter type estado_aviso add value if not exists 'cerrado';

-- ---------------------------------------------------------------------
-- 2. Perfil de actividad vulnerable por organización
-- ---------------------------------------------------------------------
create table organizacion_actividad_vulnerable (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- Fracción del art. 17 tal cual se cita: 'I', 'II a)', 'V Bis', 'XII', 'XVI'…
  fraccion text not null,
  -- Anexo de formato oficial asociado (puede ser pendiente: '4', '10', '14').
  codigo_anexo text not null,
  formato_id uuid references formato_oficial(id) on delete set null,
  -- Clave de actividad vulnerable del padrón (3 chars) cuando exista.
  clave_actividad text,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  configurado_en timestamptz not null default now(),
  configurado_por uuid references auth.users(id),
  notas text,
  check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  check (clave_actividad is null or clave_actividad ~ '^[A-Z0-9]{3}$')
);

comment on table organizacion_actividad_vulnerable is
  'Perfil de actividad(es) vulnerable(s) de la organización. Sin al menos una '
  'fila vigente no se permite capturar clientes ni operaciones.';

create unique index organizacion_av_activa_unica
  on organizacion_actividad_vulnerable (organization_id, fraccion, codigo_anexo)
  where vigente_hasta is null;

create index idx_org_av_org on organizacion_actividad_vulnerable(organization_id);

alter table organizacion_actividad_vulnerable enable row level security;

create policy "org_av_select" on organizacion_actividad_vulnerable
  for select using (organization_id = public.current_org_id());

create policy "org_av_write_admin" on organizacion_actividad_vulnerable
  for all using (
    organization_id = public.current_org_id() and public.has_rol('admin')
  )
  with check (
    organization_id = public.current_org_id() and public.has_rol('admin')
  );

-- ¿Tiene perfil vigente?
create or replace function public.organizacion_tiene_perfil_av(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organizacion_actividad_vulnerable
     where organization_id = p_org
       and vigente_desde <= current_date
       and (vigente_hasta is null or vigente_hasta > current_date)
  );
$$;

revoke all on function public.organizacion_tiene_perfil_av(uuid)
  from public, anon, authenticated;
grant execute on function public.organizacion_tiene_perfil_av(uuid)
  to authenticated, service_role;

-- Bloqueo de captura sin perfil
create or replace function public.exigir_perfil_av()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.organizacion_tiene_perfil_av(new.organization_id) then
    raise exception
      'Sin perfil de actividad vulnerable no se puede capturar. Configure la fracción y el anexo en la organización antes de dar de alta clientes u operaciones.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.exigir_perfil_av() from public, anon, authenticated;

drop trigger if exists trg_bloqueo_sin_perfil_client on client;
create trigger trg_bloqueo_sin_perfil_client
  before insert on client
  for each row execute function public.exigir_perfil_av();

drop trigger if exists trg_bloqueo_sin_perfil_operation on operation;
create trigger trg_bloqueo_sin_perfil_operation
  before insert on operation
  for each row execute function public.exigir_perfil_av();

-- ---------------------------------------------------------------------
-- 3. Columnas nuevas en aviso
-- ---------------------------------------------------------------------
alter table aviso
  add column if not exists formato_id uuid references formato_oficial(id),
  add column if not exists fecha_acto date,
  add column if not exists fecha_conocimiento timestamptz,
  add column if not exists plazo_limite_24h timestamptz,
  add column if not exists aviso_original_id uuid references aviso(id),
  add column if not exists modificatorio_en_ventana boolean not null default false,
  add column if not exists canal_presentacion text not null default 'manual',
  add column if not exists presentado_en timestamptz,
  add column if not exists presentado_por uuid references auth.users(id),
  add column if not exists validacion_completa boolean not null default false,
  add column if not exists campos_no_validados text[] not null default '{}',
  add column if not exists xml_sha256 text,
  add column if not exists acuse_resultado text,
  add column if not exists regimen_aplicado regimen_formato_uif;

comment on column aviso.fecha_conocimiento is
  'Inicio del reloj de 24 h. No exige que la operación esté celebrada.';
comment on column aviso.plazo_limite_24h is
  'fecha_conocimiento + 24 horas. Contador visible para el OC.';
comment on column aviso.validacion_completa is
  'false si algún campo dependiente de catálogo ausente quedó sin validar. '
  'Sin validación completa no se presenta como verificado.';
comment on column aviso.canal_presentacion is
  'Hoy sólo `manual`: generar/descargar, confirmar presentación, registrar acuse. Sin API real.';
comment on column aviso.acuse_resultado is
  'aceptado | rechazo. Un rechazo NO cierra el aviso (estado acuse_rechazo).';
comment on column aviso.aviso_original_id is
  'Para modificatorio: apunta al aviso presentado que se corrige.';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'aviso_canal_presentacion_chk'
  ) then
    alter table aviso add constraint aviso_canal_presentacion_chk
      check (canal_presentacion in ('manual'));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'aviso_acuse_resultado_chk'
  ) then
    alter table aviso add constraint aviso_acuse_resultado_chk
      check (acuse_resultado is null or acuse_resultado in ('aceptado', 'rechazo'));
  end if;
end $$;

-- Un modificatorio exige original.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'aviso_modificatorio_tiene_original'
  ) then
    alter table aviso add constraint aviso_modificatorio_tiene_original
      check (tipo <> 'modificatorio' or aviso_original_id is not null);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Documentos del aviso (inmutables)
-- ---------------------------------------------------------------------
create table aviso_documento (
  id uuid primary key default gen_random_uuid(),
  aviso_id uuid not null references aviso(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  -- xml | huella | acuse | constancia
  tipo text not null,
  nombre_archivo text,
  contenido text,
  contenido_bytea bytea,
  sha256 text not null,
  metadata jsonb not null default '{}',
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  check (tipo in ('xml', 'huella', 'acuse', 'constancia')),
  check (contenido is not null or contenido_bytea is not null)
);

comment on table aviso_documento is
  'XML, huellas y acuses del aviso. Nunca se actualizan ni se borran en operación '
  'normal: una nueva versión es una fila nueva.';

create index idx_aviso_documento_aviso on aviso_documento(aviso_id);
create index idx_aviso_documento_org on aviso_documento(organization_id, tipo);

-- Sin UPDATE/DELETE para authenticated: la inmutabilidad es de política.
alter table aviso_documento enable row level security;

create policy "aviso_documento_select" on aviso_documento
  for select using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

create policy "aviso_documento_insert_oc" on aviso_documento
  for insert with check (
    organization_id = public.current_org_id() and public.has_rol('oc')
  );

revoke update, delete on aviso_documento from anon, authenticated;

-- Bitácora: omitir contenido pesado
drop trigger if exists trg_evento_aviso_documento on aviso_documento;
create trigger trg_evento_aviso_documento
  after insert on aviso_documento
  for each row execute function
    public.emitir_evento_de_tabla('aviso_documento', 'persona', 'contenido,contenido_bytea');

-- ---------------------------------------------------------------------
-- 5. Transiciones de estado (máquina explícita)
-- ---------------------------------------------------------------------
-- Grafo permitido:
--   borrador → validado | listo_firma
--   validado → listo_firma | borrador
--   listo_firma → generado | borrador
--   generado → presentado | borrador
--   presentado → acuse_aceptado | acuse_rechazo
--   acuse_aceptado → cerrado
--   acuse_rechazo → generado | borrador   ← NO cierra
--   cerrado → (terminal)
--   enviado → presentado | acuse_aceptado | acuse_rechazo  (compat filas viejas)
--   acusado → cerrado | acuse_aceptado                     (compat)

create or replace function public.transicion_aviso_permitida(
  p_desde estado_aviso,
  p_hasta estado_aviso
) returns boolean
language sql immutable as $$
  select case
    when p_desde = p_hasta then true
    when p_desde = 'borrador' and p_hasta in ('validado', 'listo_firma') then true
    when p_desde = 'validado' and p_hasta in ('listo_firma', 'borrador') then true
    when p_desde = 'listo_firma' and p_hasta in ('generado', 'borrador', 'enviado') then true
    when p_desde = 'generado' and p_hasta in ('presentado', 'borrador', 'enviado') then true
    when p_desde = 'enviado' and p_hasta in ('presentado', 'acuse_aceptado', 'acuse_rechazo', 'acusado') then true
    when p_desde = 'presentado' and p_hasta in ('acuse_aceptado', 'acuse_rechazo', 'acusado') then true
    when p_desde = 'acuse_aceptado' and p_hasta in ('cerrado', 'acusado') then true
    when p_desde = 'acusado' and p_hasta in ('cerrado', 'acuse_aceptado') then true
    when p_desde = 'acuse_rechazo' and p_hasta in ('generado', 'borrador', 'listo_firma') then true
    else false
  end;
$$;

create or replace function public.guardar_transicion_aviso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.estado is distinct from new.estado then
    if not public.transicion_aviso_permitida(old.estado, new.estado) then
      raise exception
        'Transición de aviso no permitida: % → %. El acuse de rechazo no cierra el aviso.',
        old.estado, new.estado
        using errcode = 'P0001';
    end if;
    -- Rechazo nunca marca cerrado ni acusado como terminal de éxito.
    if new.estado = 'acuse_rechazo' then
      new.acuse_resultado := 'rechazo';
    elsif new.estado in ('acuse_aceptado', 'acusado', 'cerrado') then
      new.acuse_resultado := coalesce(new.acuse_resultado, 'aceptado');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_transicion_aviso on aviso;
create trigger trg_transicion_aviso
  before update of estado on aviso
  for each row execute function public.guardar_transicion_aviso();

-- Modificatorio: a lo sumo 1 en ventana de 30 días desde la presentación del original
create or replace function public.validar_modificatorio_ventana()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_presentado timestamptz;
  v_previos int;
begin
  if new.tipo <> 'modificatorio' then
    return new;
  end if;
  if new.aviso_original_id is null then
    raise exception 'Un modificatorio requiere aviso_original_id.' using errcode = 'P0001';
  end if;

  select presentado_en into v_presentado
    from aviso where id = new.aviso_original_id;
  if v_presentado is null then
    -- Compat: firmado_en / generado_en de filas viejas
    select coalesce(firmado_en, generado_en) into v_presentado
      from aviso where id = new.aviso_original_id;
  end if;
  if v_presentado is null then
    raise exception 'El aviso original aún no está presentado.' using errcode = 'P0001';
  end if;
  if now() > v_presentado + interval '30 days' then
    raise exception
      'Ventana de modificatorio vencida: sólo se admite dentro de los 30 días posteriores a la presentación del original.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_previos
    from aviso
   where aviso_original_id = new.aviso_original_id
     and tipo = 'modificatorio'
     and id is distinct from new.id
     and estado not in ('borrador'); -- un borrador abandonado no cuenta

  if v_previos >= 1 then
    raise exception
      'Ya existe un modificatorio para este aviso. Sólo se admite uno en la ventana de 30 días.'
      using errcode = 'P0001';
  end if;

  new.modificatorio_en_ventana := true;
  return new;
end;
$$;

drop trigger if exists trg_modificatorio_ventana on aviso;
create trigger trg_modificatorio_ventana
  before insert or update of tipo, aviso_original_id on aviso
  for each row execute function public.validar_modificatorio_ventana();

-- Informe sin operaciones no puede llevar actos (además de exento)
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'aviso_sin_ops_sin_actos'
  ) then
    alter table aviso add constraint aviso_sin_ops_sin_actos
      check (
        tipo <> 'informe_sin_operaciones'
        or cardinality(operation_ids) = 0
      );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Constancia de configuración de organización
-- ---------------------------------------------------------------------
create table organizacion_config_constancia (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- Snapshot de lo configurado al momento (perfil AV, claves padrón, formatos).
  snapshot jsonb not null,
  sha256 text not null,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  motivo text not null default 'cambio_configuracion'
);

comment on table organizacion_config_constancia is
  'Huella de la configuración del sujeto obligado. Cada cambio relevante deja '
  'constancia; no se reescribe.';

create index idx_org_config_constancia_org
  on organizacion_config_constancia(organization_id, creado_en desc);

alter table organizacion_config_constancia enable row level security;

create policy "org_config_constancia_select" on organizacion_config_constancia
  for select using (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

create policy "org_config_constancia_insert" on organizacion_config_constancia
  for insert with check (
    organization_id = public.current_org_id()
    and (public.has_rol('oc') or public.has_rol('admin'))
  );

revoke update, delete on organizacion_config_constancia from anon, authenticated;

drop trigger if exists trg_evento_org_config_constancia on organizacion_config_constancia;
create trigger trg_evento_org_config_constancia
  after insert on organizacion_config_constancia
  for each row execute function
    public.emitir_evento_de_tabla('organizacion_config_constancia', 'persona', 'snapshot');

-- Al configurar perfil AV, dejar constancia automáticamente
create or replace function public.constancia_al_configurar_av()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snap jsonb;
  v_hash text;
begin
  select jsonb_build_object(
    'organization_id', new.organization_id,
    'fraccion', new.fraccion,
    'codigo_anexo', new.codigo_anexo,
    'formato_id', new.formato_id,
    'clave_actividad', new.clave_actividad,
    'vigente_desde', new.vigente_desde,
    'vigente_hasta', new.vigente_hasta,
    'evento', tg_op,
    'en', now()
  ) into v_snap;
  v_hash := encode(sha256(convert_to(v_snap::text, 'UTF8')), 'hex');
  insert into organizacion_config_constancia
    (organization_id, snapshot, sha256, creado_por, motivo)
  values
    (new.organization_id, v_snap, v_hash, new.configurado_por, 'perfil_actividad_vulnerable');
  return new;
end;
$$;

drop trigger if exists trg_constancia_org_av on organizacion_actividad_vulnerable;
create trigger trg_constancia_org_av
  after insert or update on organizacion_actividad_vulnerable
  for each row execute function public.constancia_al_configurar_av();
