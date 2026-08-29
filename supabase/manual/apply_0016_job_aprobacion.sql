-- =====================================================================
-- Ikán · Aplicación manual · Migration 0016 (job con aprobación humana)
-- =====================================================================
-- El job PROPONE y una persona DISPONE. Un job que descarga y aplica sin que
-- nadie mire es un riesgo mal entendido como automatización: si el SAT cambia
-- una columna o publica un archivo truncado, la lista queda corrupta y nadie
-- se entera hasta que un notario firma con un barrido equivocado.
--
-- No relaja el modelo de acceso: las listas siguen siendo escribibles sólo
-- por Kawiil, y las organizaciones cliente sólo las leen.
--
-- Transaccional e idempotente. REQUISITO: la 0015 aplicada.
-- =====================================================================

begin;

-- =====================================================================
-- Ikán · Migration 0016 · Job de listas con aprobación humana
-- =====================================================================
-- Regla del producto, y conviene dejarla escrita donde vive:
--
--   Las listas SÓLO se actualizan desde la consola de Kawiil, por personal
--   de plataforma. Las organizaciones cliente las CONSUMEN, nunca las
--   escriben. La RLS de la 0012 ya lo garantiza: `lista_carga` y
--   `lista_movimiento` son invisibles para un cliente, y `lista_registro`
--   es de sólo lectura. Esta migration no relaja nada de eso.
--
-- ---------------------------------------------------------------------
-- Por qué el job no aplica solo
-- ---------------------------------------------------------------------
-- Un job que descarga y aplica sin que nadie mire es un riesgo mal
-- entendido como automatización: si el SAT cambia una columna, o publica un
-- archivo truncado, la lista queda corrupta y nadie se entera hasta que un
-- notario firma una escritura con un barrido equivocado.
--
-- Por eso el job PROPONE y una persona DISPONE:
--
--   1. El job descarga, valida y deja una carga en estado 'borrador',
--      con sus filas en zona de espera. NO toca `lista_registro`.
--   2. Si algo falla, queda registrado con su error y aparece en la consola.
--      No hay fallo silencioso.
--   3. Un responsable ve la diferencia propuesta —cuántos entran, cuántos
--      cambian de situación, cuántos saldrían— y acepta o descarta.
--   4. Sólo al aceptar se promueven las filas a movimientos y el estado
--      vigente cambia.
--
-- La carga manual desde la consola no pasa por aquí: ahí la persona ya está
-- viendo la vista previa y su clic ES la aprobación. Pedirle que apruebe dos
-- veces sería ceremonia, no control.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Zona de espera: filas propuestas, todavía sin efecto
-- ---------------------------------------------------------------------
create table if not exists lista_carga_fila (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references lista_carga(id) on delete cascade,
  tipo_entidad text not null default 'empresa',
  nombre text not null,
  rfc text,
  curp text,
  pais text,
  situacion text,
  identificadores jsonb not null default '{}',
  fila_origen int
);

create index if not exists idx_carga_fila_carga on lista_carga_fila (carga_id);
create index if not exists idx_carga_fila_rfc on lista_carga_fila (carga_id, rfc);

comment on table lista_carga_fila is
  'Filas propuestas por un job, en espera de aprobación. NO afectan el estado vigente hasta que alguien promueve la carga.';

alter table lista_carga_fila enable row level security;
drop policy if exists "carga_fila_kawiil" on lista_carga_fila;
create policy "carga_fila_kawiil" on lista_carga_fila
  for all using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());

-- ---------------------------------------------------------------------
-- 2. Bitácora de ejecuciones del job
-- ---------------------------------------------------------------------
-- Un job que falla en silencio es peor que no tener job: da una sensación de
-- cobertura que no existe. Cada corrida deja rastro, haya salido bien o mal.
do $$ begin
  create type resultado_job_lista as enum ('exito', 'sin_cambios', 'error');
exception when duplicate_object then null; end $$;

create table if not exists lista_job_ejecucion (
  id uuid primary key default gen_random_uuid(),
  fuente_id uuid not null references lista_fuente(id) on delete cascade,
  iniciado_en timestamptz not null default now(),
  terminado_en timestamptz,
  resultado resultado_job_lista,
  /** La carga en borrador que produjo, si llegó a producir alguna. */
  carga_id uuid references lista_carga(id) on delete set null,
  archivo_hash text,
  registros_leidos int,
  filas_descartadas int,
  error_mensaje text,
  /** Detalle para diagnosticar sin entrar al servidor: URL, tamaño, etc. */
  detalle jsonb not null default '{}',
  /** Se marca cuando alguien lo revisó, para no repetir avisos ya atendidos. */
  atendido_por uuid references auth.users(id),
  atendido_en timestamptz
);

create index if not exists idx_job_fuente on lista_job_ejecucion (fuente_id, iniciado_en desc);
create index if not exists idx_job_pendientes on lista_job_ejecucion (resultado, atendido_en)
  where resultado = 'error' and atendido_en is null;

comment on table lista_job_ejecucion is
  'Cada corrida del job de listas, con o sin éxito. Un error sin atender es lo que la consola muestra como aviso.';

alter table lista_job_ejecucion enable row level security;
drop policy if exists "job_ejecucion_kawiil" on lista_job_ejecucion;
create policy "job_ejecucion_kawiil" on lista_job_ejecucion
  for all using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());

-- ---------------------------------------------------------------------
-- 3. La diferencia propuesta, antes de aplicar nada
-- ---------------------------------------------------------------------
-- Es lo que el responsable necesita ver para decidir. Se calcula al vuelo
-- contra el estado vigente: no se guarda, porque el estado puede haber
-- cambiado desde que el job corrió y lo que importa es la diferencia HOY.
create or replace function public.diferencia_carga_borrador(p_carga_id uuid)
returns table (
  concepto text,
  cantidad bigint,
  nota text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fuente uuid;
  v_alcance alcance_carga_lista;
begin
  if not public.es_admin_kawiil() then
    raise exception 'Sólo un administrador de Kawiil puede revisar una carga.';
  end if;

  select fuente_id, alcance into v_fuente, v_alcance
  from lista_carga where id = p_carga_id;
  if v_fuente is null then
    raise exception 'La carga % no existe.', p_carga_id;
  end if;

  return query
  with propuestas as (
    select f.*, coalesce(nullif(upper(btrim(f.rfc)), ''), null) as rfc_norm,
           public.normalizar_nombre(f.nombre) as nombre_norm
    from lista_carga_fila f where f.carga_id = p_carga_id
  ),
  emparejadas as (
    select p.*, r.id as registro_id, r.situacion as situacion_actual, r.activo
    from propuestas p
    left join lista_registro r
      on r.fuente_id = v_fuente
     and ((p.rfc_norm is not null and r.rfc = p.rfc_norm)
       or (p.rfc_norm is null and r.rfc is null and r.nombre_normalizado = p.nombre_norm))
  )
  select 'Nuevos'::text, count(*),
         'No estaban en la lista'::text
    from emparejadas where registro_id is null
  union all
  select 'Reactivados', count(*),
         'Estaban dados de baja y vuelven a aparecer'
    from emparejadas where registro_id is not null and not activo
  union all
  select 'Cambian de situación', count(*),
         'Siguen en la lista pero con otra situación'
    from emparejadas
   where registro_id is not null and activo
     and situacion is distinct from situacion_actual
  union all
  select 'Sin cambio', count(*), 'Ya estaban igual'
    from emparejadas
   where registro_id is not null and activo
     and situacion is not distinct from situacion_actual
  union all
  select 'Saldrían de la lista',
         case when v_alcance = 'completa' then (
           select count(*) from lista_registro r
            where r.fuente_id = v_fuente and r.activo
              and not exists (
                select 1 from emparejadas e where e.registro_id = r.id
              )
         ) else 0 end,
         case when v_alcance = 'completa'
              then 'Activos que no vienen en este archivo'
              else 'Carga parcial: no da de baja a nadie' end;
end
$$;

-- ---------------------------------------------------------------------
-- 4. Promover: el momento en que la propuesta se vuelve efectiva
-- ---------------------------------------------------------------------
-- Convierte las filas en espera en movimientos reales. A partir de ahí
-- manda el trigger de la 0012 y todo queda en la bitácora como cualquier
-- otra carga: quién la aprobó queda en `lista_carga.aprobada_por`.
alter table lista_carga
  add column if not exists aprobada_por uuid references auth.users(id),
  add column if not exists aprobada_en timestamptz;

comment on column lista_carga.aprobada_por is
  'Quién aceptó una carga propuesta por el job. Null en las cargas manuales, donde la aprobación es el propio acto de cargar.';

create or replace function public.promover_carga_borrador(p_carga_id uuid)
returns table (promovidos int, desactivados int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado estado_carga_lista;
  v_promovidos int := 0;
  v_desactivados int := 0;
begin
  if not public.es_admin_kawiil() then
    raise exception 'Sólo un administrador de Kawiil puede aprobar una carga de lista.';
  end if;

  select estado into v_estado from lista_carga where id = p_carga_id;
  if v_estado is null then
    raise exception 'La carga % no existe.', p_carga_id;
  end if;
  if v_estado <> 'borrador' then
    raise exception 'La carga ya está en estado "%": sólo se promueve un borrador.', v_estado;
  end if;

  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, rfc, curp, pais, situacion, identificadores)
  select f.carga_id, 'alta', f.tipo_entidad, f.nombre, f.rfc, f.curp, f.pais,
         f.situacion, f.identificadores
  from lista_carga_fila f
  where f.carga_id = p_carga_id;
  get diagnostics v_promovidos = row_count;

  update lista_carga
     set estado = 'aplicada',
         aprobada_por = auth.uid(),
         aprobada_en = now()
   where id = p_carga_id;

  -- La diferencia se aplica después de promover, igual que en la carga
  -- manual: hasta aquí no se sabía qué traía el archivo.
  select public.cerrar_carga_completa(p_carga_id) into v_desactivados;

  -- Las filas en espera ya cumplieron: su contenido vive en la bitácora.
  delete from lista_carga_fila where carga_id = p_carga_id;

  return query select v_promovidos, v_desactivados;
end
$$;

comment on function public.promover_carga_borrador(uuid) is
  'Acepta una carga propuesta por el job: promueve sus filas a movimientos y aplica la diferencia. Es el único camino por el que un job llega a afectar el estado vigente.';

-- Descartar una propuesta sin aplicarla. No deja rastro en el estado vigente
-- porque nunca lo tocó; sí queda la carga marcada, para saber que se revisó.
create or replace function public.descartar_carga_borrador(p_carga_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin_kawiil() then
    raise exception 'Sólo un administrador de Kawiil puede descartar una carga.';
  end if;

  update lista_carga
     set estado = 'revertida',
         notas = coalesce(notas, '') || ' · DESCARTADA sin aplicar: ' || coalesce(p_motivo, 'sin motivo'),
         aprobada_por = auth.uid(),
         aprobada_en = now()
   where id = p_carga_id and estado = 'borrador';

  if not found then
    raise exception 'No hay una carga en borrador con ese id.';
  end if;

  delete from lista_carga_fila where carga_id = p_carga_id;
end
$$;

revoke all on function public.promover_carga_borrador(uuid) from public;
revoke all on function public.descartar_carga_borrador(uuid, text) from public;
revoke all on function public.diferencia_carga_borrador(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.promover_carga_borrador(uuid) to authenticated';
    execute 'grant execute on function public.descartar_carga_borrador(uuid, text) to authenticated';
    execute 'grant execute on function public.diferencia_carga_borrador(uuid) to authenticated';
  end if;
end $$;

commit;
