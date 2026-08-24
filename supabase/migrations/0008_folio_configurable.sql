-- =====================================================================
-- Ikán · Migration 0008 · Folio configurable con candado por organización
-- =====================================================================
-- Sustituye el folio derivado del UUID (decisión #2 del expediente, PR #13).
--
-- Modelo: cada organización configura el formato de sus folios; en cuanto
-- emite el primero, la configuración queda bloqueada y solo un admin de
-- Kawiil (privilegio de plataforma, cruza organizaciones) puede cambiarla,
-- siempre con justificación y registro en `audit_log`.
--
-- Decisiones cerradas con el usuario (ver docs/PROPUESTA_FOLIO_CONFIGURABLE.md):
--   1. `platform_admin` como privilegio global, no un valor de `rol_usuario`.
--   2. Ámbito del secuencial: por prefijo y año; reinicia cada año.
--   3. Prefijo derivado del sector de la tipología (no fijo por organización).
--   4. El folio se emite al CREAR el hallazgo, no al abrir el expediente.
--   5. Backfill de los hallazgos existentes; cierra el candado de esas orgs.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Privilegio de plataforma (Kawiil)
-- ---------------------------------------------------------------------
create table if not exists platform_admin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  otorgado_por uuid references auth.users(id),
  otorgado_en timestamptz not null default now()
);
comment on table platform_admin is
  'Admins de Kawiil: privilegio de plataforma que cruza organizaciones. No vive en user_roles porque ese es por organización.';

alter table platform_admin enable row level security;

-- Solo un admin de Kawiil ve la lista; nadie la edita desde la app (se
-- administra con service_role, que salta RLS).
drop policy if exists "platform_admin_select" on platform_admin;
create policy "platform_admin_select" on platform_admin
  for select using (user_id = auth.uid());

create or replace function public.es_admin_kawiil() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admin where user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- 2. Configuración de folio por organización
-- ---------------------------------------------------------------------
do $$ begin
  create type ambito_secuencial as enum ('organizacion', 'prefijo', 'prefijo_anio');
exception when duplicate_object then null; end $$;

create table if not exists configuracion_folio (
  organization_id uuid primary key references organizations(id) on delete cascade,
  plantilla text not null default '{prefijo}-{anio}-{secuencial:4}',
  prefijo_fijo text,
  ambito_secuencial ambito_secuencial not null default 'prefijo_anio',
  iniciada_en timestamptz,
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now(),
  creada_en timestamptz not null default now()
);
comment on column configuracion_folio.prefijo_fijo is
  'Null = derivar el prefijo del sector de la tipología (XII, XVI). Texto = mismo prefijo para toda la organización.';
comment on column configuracion_folio.iniciada_en is
  'Momento del primer folio emitido. Null = el OC todavía puede configurar. No nulo = candado cerrado, solo Kawiil.';

create table if not exists folio_secuencial (
  organization_id uuid not null references organizations(id) on delete cascade,
  clave text not null,
  valor int not null default 0,
  primary key (organization_id, clave)
);
comment on table folio_secuencial is
  'Contadores vivos por organización. La clave depende del ámbito: "XII|2026", "XII" u "org".';

alter table hallazgo add column if not exists folio text;
create unique index if not exists idx_hallazgo_folio
  on hallazgo(organization_id, folio) where folio is not null;

alter table audit_log add column if not exists motivo text;
comment on column audit_log.motivo is
  'Justificación en texto libre. Obligatoria en cambios de formato de folio con candado cerrado.';

-- ---------------------------------------------------------------------
-- 3. Render de la plantilla
-- ---------------------------------------------------------------------
-- Placeholders soportados: {prefijo}, {anio}, {secuencial} y {secuencial:N}
-- (N = longitud con relleno de ceros). Un placeholder desconocido es un error
-- explícito: preferimos fallar a emitir un folio con basura literal.
create or replace function public.render_folio(
  p_plantilla text, p_prefijo text, p_anio int, p_secuencial int
) returns text
language plpgsql immutable set search_path = public as $$
declare
  v_out text := p_plantilla;
  v_len int;
  v_resto text;
begin
  -- {secuencial:N} antes que {secuencial} para que el sufijo no se coma la N.
  for v_len in
    select distinct (regexp_matches(v_out, '\{secuencial:(\d+)\}', 'g'))[1]::int
  loop
    v_out := replace(v_out, '{secuencial:' || v_len || '}', lpad(p_secuencial::text, v_len, '0'));
  end loop;

  v_out := replace(v_out, '{secuencial}', p_secuencial::text);
  v_out := replace(v_out, '{prefijo}', coalesce(p_prefijo, ''));
  v_out := replace(v_out, '{anio}', p_anio::text);

  v_resto := substring(v_out from '\{[a-z_]+(?::\d+)?\}');
  if v_resto is not null then
    raise exception 'Placeholder no soportado en la plantilla de folio: %', v_resto
      using hint = 'Soportados: {prefijo}, {anio}, {secuencial}, {secuencial:N}';
  end if;

  return v_out;
end $$;

-- ---------------------------------------------------------------------
-- 4. Emisión atómica del folio
-- ---------------------------------------------------------------------
create or replace function public.emitir_folio_hallazgo(p_hallazgo_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_h           record;
  v_cfg         configuracion_folio;
  v_prefijo     text;
  v_anio        int;
  v_clave       text;
  v_secuencial  int;
  v_folio       text;
begin
  select h.id, h.organization_id, h.folio, h.creado_en, t.sector::text as sector
    into v_h
  from hallazgo h
  join tipologia_av t on t.id = h.tipologia_id
  where h.id = p_hallazgo_id;

  if not found then
    raise exception 'Hallazgo % no existe', p_hallazgo_id;
  end if;
  if v_h.folio is not null then
    return v_h.folio;  -- idempotente: nunca reasigna un folio ya emitido
  end if;

  insert into configuracion_folio (organization_id)
  values (v_h.organization_id)
  on conflict (organization_id) do nothing;

  select * into v_cfg from configuracion_folio
  where organization_id = v_h.organization_id for update;

  v_prefijo := coalesce(v_cfg.prefijo_fijo, v_h.sector);
  v_anio    := extract(year from v_h.creado_en)::int;

  v_clave := case v_cfg.ambito_secuencial
               when 'organizacion' then 'org'
               when 'prefijo'      then v_prefijo
               else v_prefijo || '|' || v_anio
             end;

  -- Incremento atómico: un select+update por separado entregaría folios
  -- duplicados cuando el motor inserta hallazgos en lote.
  insert into folio_secuencial (organization_id, clave, valor)
  values (v_h.organization_id, v_clave, 1)
  on conflict (organization_id, clave)
  do update set valor = folio_secuencial.valor + 1
  returning valor into v_secuencial;

  v_folio := public.render_folio(v_cfg.plantilla, v_prefijo, v_anio, v_secuencial);

  update hallazgo set folio = v_folio where id = p_hallazgo_id;

  -- Primer folio de la organización: se cierra el candado.
  update configuracion_folio
     set iniciada_en = now()
   where organization_id = v_h.organization_id and iniciada_en is null;

  return v_folio;
end $$;

-- Emisión automática al crear el hallazgo (decisión 4).
create or replace function public.trg_emitir_folio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.emitir_folio_hallazgo(new.id);
  return null;  -- AFTER trigger
end $$;

drop trigger if exists trg_hallazgo_folio on hallazgo;
create trigger trg_hallazgo_folio
  after insert on hallazgo
  for each row execute function public.trg_emitir_folio();

-- ---------------------------------------------------------------------
-- 5. El candado
-- ---------------------------------------------------------------------
-- `configuracion_folio` no lleva política de UPDATE a propósito: el único
-- camino de cambio es esta función, que exige justificación por firma.
create or replace function public.cambiar_formato_folio(
  p_organization_id uuid,
  p_plantilla text,
  p_prefijo_fijo text,
  p_ambito ambito_secuencial,
  p_justificacion text
) returns configuracion_folio
language plpgsql security definer set search_path = public as $$
declare
  v_antes  configuracion_folio;
  v_kawiil boolean := public.es_admin_kawiil();
  v_despues configuracion_folio;
begin
  insert into configuracion_folio (organization_id)
  values (p_organization_id) on conflict (organization_id) do nothing;

  select * into v_antes from configuracion_folio
  where organization_id = p_organization_id for update;

  if v_antes.iniciada_en is null then
    -- Todavía sin folios: el OC de esa organización puede configurar libremente.
    if not v_kawiil and not (
      p_organization_id = public.current_org_id() and public.has_rol('oc')
    ) then
      raise exception 'Solo el Oficial de Cumplimiento de la organización puede configurar el folio antes del primero emitido';
    end if;
  else
    -- Candado cerrado: solo Kawiil, y con justificación.
    if not v_kawiil then
      raise exception 'La organización ya emitió folios: solo un administrador de Kawiil puede cambiar el formato'
        using hint = 'Candado cerrado el ' || v_antes.iniciada_en::text;
    end if;
    if p_justificacion is null or btrim(p_justificacion) = '' then
      raise exception 'La justificación es obligatoria para cambiar el formato de folio de una organización iniciada';
    end if;
  end if;

  -- Validar la plantilla antes de guardarla (falla aquí, no al emitir).
  perform public.render_folio(p_plantilla, 'XX', 2000, 1);

  update configuracion_folio
     set plantilla = p_plantilla,
         prefijo_fijo = p_prefijo_fijo,
         ambito_secuencial = p_ambito,
         actualizado_por = auth.uid(),
         actualizado_en = now()
   where organization_id = p_organization_id
  returning * into v_despues;

  if v_antes.iniciada_en is not null then
    insert into audit_log (organization_id, actor, accion, recurso_tipo, recurso_id,
                           antes, despues, motivo)
    values (
      p_organization_id, auth.uid(), 'cambio_formato_folio', 'configuracion_folio',
      p_organization_id,
      jsonb_build_object('plantilla', v_antes.plantilla,
                         'prefijo_fijo', v_antes.prefijo_fijo,
                         'ambito_secuencial', v_antes.ambito_secuencial),
      jsonb_build_object('plantilla', v_despues.plantilla,
                         'prefijo_fijo', v_despues.prefijo_fijo,
                         'ambito_secuencial', v_despues.ambito_secuencial),
      p_justificacion
    );
  end if;

  return v_despues;
end $$;

-- ---------------------------------------------------------------------
-- 6. RLS de las tablas nuevas
-- ---------------------------------------------------------------------
alter table configuracion_folio enable row level security;
alter table folio_secuencial enable row level security;

drop policy if exists "configuracion_folio_select" on configuracion_folio;
create policy "configuracion_folio_select" on configuracion_folio
  for select using (
    organization_id = public.current_org_id() or public.es_admin_kawiil()
  );

-- Sin políticas de insert/update/delete: solo `cambiar_formato_folio` y
-- `emitir_folio_hallazgo` (security definer) escriben aquí.
drop policy if exists "folio_secuencial_select" on folio_secuencial;
create policy "folio_secuencial_select" on folio_secuencial
  for select using (
    organization_id = public.current_org_id() or public.es_admin_kawiil()
  );

-- ---------------------------------------------------------------------
-- 7. Backfill de hallazgos existentes (decisión 5)
-- ---------------------------------------------------------------------
-- En orden de creación para que la numeración respete la cronología real.
do $$
declare r record;
begin
  for r in select id from hallazgo where folio is null order by creado_en, id loop
    perform public.emitir_folio_hallazgo(r.id);
  end loop;
end $$;
