-- =====================================================================
-- Ikán · Migration 0020 · Catálogos del layout: la clave sale de la base
-- =====================================================================
-- Problema que resuelve:
--
--   Donde el aviso pide una clave de catálogo —estado, país, tipo de poder,
--   giro mercantil— la captura era un campo de texto libre. Quien captura no
--   tiene por qué saberse de memoria que Jalisco es tal número, y el portal
--   rechaza el aviso completo si la clave no existe en el catálogo de la UIF.
--
--   Aquí viven los catálogos: cada valor con LA CLAVE QUE VA EN EL INFORME y
--   la descripción que ve la persona. Las pantallas ofrecen una lista; lo que
--   se guarda es la clave.
--
-- Quién los mantiene: Kawiil, desde la consola de plataforma. Un sujeto
-- obligado los LEE, nunca los escribe — misma frontera que las listas
-- restrictivas (migration 0012). Que un cliente pudiera editarlos significaría
-- que puede fabricar la clave con la que reporta.
--
-- Lo que esta migration NO hace: cargar los valores. Los catálogos de la UIF
-- son archivos que el instructivo referencia pero no incluye. Se registran aquí
-- con nombre, campos que los usan y forma de la clave —todo eso sí sale del
-- instructivo— y se quedan VACÍOS hasta que Kawiil los cargue. Un catálogo
-- vacío es un estado explícito, no un silencio: la UI lo dice y cae a captura
-- manual con banner ámbar.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- 1. El catálogo
-- ---------------------------------------------------------------------
create table if not exists catalogo_sat (
  id uuid primary key default gen_random_uuid(),
  -- Identificador estable con el que lo pide el código. Nunca cambia.
  codigo text not null unique,
  -- Nombre tal como lo cita la regla de negocio del instructivo, erratas del
  -- original incluidas: es la manera de reconocerlo cuando llegue el archivo.
  nombre text not null,
  descripcion text,
  -- Layout del que sale. Hoy sólo fe pública; el modelo admite los demás.
  layout text not null default 'fep',
  -- Etiquetas XML que consumen este catálogo, según el instructivo.
  etiquetas_layout text[] not null default '{}',
  -- Forma de la clave, para rechazar una carga mal armada. Null = sin patrón
  -- conocido.
  clave_patron text,
  fuente text not null default 'uif',
  notas text,
  -- Sube en cada reemplazo de valores. 0 = nunca se ha cargado.
  version int not null default 0,
  actualizado_en timestamptz,
  actualizado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
comment on table catalogo_sat is
  'Catálogos de claves del layout de avisos. Los mantiene Kawiil; los sujetos obligados sólo los leen.';
comment on column catalogo_sat.version is
  '0 = registrado pero sin valores cargados. La UI debe distinguir "vacío" de "no existe".';

-- ---------------------------------------------------------------------
-- 2. Los valores
-- ---------------------------------------------------------------------
-- Los valores no se borran: se cierra su vigencia. Un aviso presentado el año
-- pasado se armó con el catálogo de entonces, y auditarlo exige poder
-- reconstruirlo.
create table if not exists catalogo_valor (
  id uuid primary key default gen_random_uuid(),
  catalogo_id uuid not null references catalogo_sat(id) on delete cascade,
  -- LO QUE VIAJA EN EL XML. Es el dato, no la descripción.
  clave text not null,
  -- Lo que ve quien captura.
  descripcion text not null,
  orden int,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  version_carga int not null default 1,
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
comment on column catalogo_valor.clave is
  'La clave que va en el informe. Lo que se guarda en las tablas de negocio y lo que valida el portal.';

create index if not exists idx_catalogo_valor_cat on catalogo_valor(catalogo_id);
create index if not exists idx_catalogo_valor_clave on catalogo_valor(catalogo_id, clave);

-- Una misma clave no puede estar vigente dos veces a la vez en el mismo
-- catálogo: si estuviera, un select por clave devolvería dos descripciones y
-- no habría forma de saber cuál se usó.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'catalogo_valor_sin_traslape') then
    alter table catalogo_valor add constraint catalogo_valor_sin_traslape
      exclude using gist (
        catalogo_id with =,
        clave with =,
        daterange(vigente_desde, vigente_hasta, '[)') with &&
      );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Consulta
-- ---------------------------------------------------------------------
create or replace view v_catalogo_vigente with (security_invoker = true) as
select
  c.codigo   as catalogo,
  c.nombre   as catalogo_nombre,
  v.clave,
  v.descripcion,
  v.orden,
  v.vigente_desde,
  v.vigente_hasta
from catalogo_valor v
join catalogo_sat c on c.id = v.catalogo_id
where v.vigente_desde <= current_date
  and (v.vigente_hasta is null or v.vigente_hasta > current_date);

comment on view v_catalogo_vigente is
  'Valores vigentes hoy. Para reconstruir un catálogo en una fecha pasada, usar catalogo_en_fecha().';

-- Estado de cada catálogo, para que la pantalla pueda decir "no cargado" en vez
-- de mostrar una lista vacía sin explicación.
create or replace view v_catalogos_estado with (security_invoker = true) as
select
  c.codigo,
  c.nombre,
  c.layout,
  c.etiquetas_layout,
  c.clave_patron,
  c.notas,
  c.version,
  c.actualizado_en,
  coalesce(count(v.id) filter (
    where v.vigente_desde <= current_date
      and (v.vigente_hasta is null or v.vigente_hasta > current_date)
  ), 0) as valores_vigentes
from catalogo_sat c
left join catalogo_valor v on v.catalogo_id = c.id
group by c.id;

/** Los valores de un catálogo tal como estaban en una fecha. Es lo que permite
    auditar un aviso viejo sin discutir qué decía el catálogo ese día. */
create or replace function public.catalogo_en_fecha(p_codigo text, p_fecha date default current_date)
returns table (clave text, descripcion text, orden int)
language sql stable as $$
  select v.clave, v.descripcion, v.orden
  from catalogo_valor v
  join catalogo_sat c on c.id = v.catalogo_id
  where c.codigo = p_codigo
    and v.vigente_desde <= p_fecha
    and (v.vigente_hasta is null or v.vigente_hasta > p_fecha)
  order by v.orden nulls last, v.clave
$$;

/** ¿Esa clave existía en ese catálogo en esa fecha? Un catálogo sin cargar
    devuelve false: no se puede afirmar que una clave es válida contra un
    catálogo que no se tiene. */
create or replace function public.clave_valida_en_catalogo(
  p_codigo text, p_clave text, p_fecha date default current_date
) returns boolean language sql stable as $$
  select exists (
    select 1 from public.catalogo_en_fecha(p_codigo, p_fecha) where clave = p_clave
  )
$$;

-- ---------------------------------------------------------------------
-- 4. Carga: reemplazar los valores de un catálogo
-- ---------------------------------------------------------------------
/**
 * Sustituye los valores vigentes de un catálogo por los del archivo cargado.
 *
 * No borra: cierra la vigencia de lo anterior y abre la de lo nuevo, ambos con
 * fecha de hoy. Los rangos quedan [.., hoy) y [hoy, ..), que no se traslapan.
 *
 * `p_valores` es un arreglo JSON: [{"clave":"14","descripcion":"Jalisco"}, ...]
 * El orden del arreglo se guarda como `orden`, para que la lista se muestre
 * como viene en el archivo oficial y no alfabetizada por nuestra cuenta.
 */
create or replace function public.reemplazar_valores_catalogo(
  p_codigo text,
  p_valores jsonb,
  p_motivo text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_cat catalogo_sat;
  v_patron text;
  v_insertados int := 0;
  v_clave text;
begin
  if not public.es_admin_kawiil() then
    raise exception 'Sólo un administrador de plataforma puede cargar catálogos';
  end if;

  select * into v_cat from catalogo_sat where codigo = p_codigo for update;
  if v_cat.id is null then
    raise exception 'No existe el catálogo %', p_codigo;
  end if;

  if jsonb_typeof(p_valores) <> 'array' or jsonb_array_length(p_valores) = 0 then
    raise exception 'El catálogo % se cargó sin valores', p_codigo;
  end if;

  -- Se valida TODO antes de tocar nada: una carga a medias deja el catálogo en
  -- un estado que nadie pidió.
  v_patron := v_cat.clave_patron;

  if exists (select 1 from jsonb_array_elements(p_valores) x
              where btrim(coalesce(x->>'clave', '')) = '') then
    raise exception 'Hay un valor sin clave en la carga de %', p_codigo;
  end if;

  select btrim(x->>'clave') into v_clave
    from jsonb_array_elements(p_valores) x
   where btrim(coalesce(x->>'descripcion', '')) = '' limit 1;
  if v_clave is not null then
    raise exception 'La clave % viene sin descripción', v_clave;
  end if;

  if v_patron is not null then
    select btrim(x->>'clave') into v_clave
      from jsonb_array_elements(p_valores) x
     where btrim(x->>'clave') !~ v_patron limit 1;
    if v_clave is not null then
      raise exception 'La clave % no cumple el formato del catálogo % (%)', v_clave, p_codigo, v_patron;
    end if;
  end if;

  if (select count(distinct btrim(x->>'clave')) from jsonb_array_elements(p_valores) x)
     <> jsonb_array_length(p_valores) then
    raise exception 'La carga de % trae claves repetidas', p_codigo;
  end if;

  -- Cierra lo vigente.
  update catalogo_valor
     set vigente_hasta = current_date
   where catalogo_id = v_cat.id
     and (vigente_hasta is null or vigente_hasta > current_date);

  -- Abre lo nuevo. En un solo INSERT, no fila por fila: el catálogo de códigos
  -- postales trae 32 mil valores y el ciclo tardaba segundos, lo bastante para
  -- rozar el tiempo máximo de sentencia de la conexión del cliente.
  with entrada as (
    select
      btrim(x.clave) as clave,
      btrim(x.descripcion) as descripcion,
      coalesce(x.orden, row_number() over ())::int as orden
    from jsonb_to_recordset(p_valores)
      as x(clave text, descripcion text, orden int)
  )
  insert into catalogo_valor (catalogo_id, clave, descripcion, orden, vigente_desde, version_carga)
  select v_cat.id, e.clave, e.descripcion, e.orden, current_date, v_cat.version + 1
  from entrada e;
  get diagnostics v_insertados = row_count;

  update catalogo_sat
     set version = version + 1,
         actualizado_en = now(),
         actualizado_por = auth.uid(),
         notas = coalesce(p_motivo, notas)
   where id = v_cat.id;

  return v_insertados;
end $$;

-- ---------------------------------------------------------------------
-- 5. Clave de entidad federativa del compareciente
-- ---------------------------------------------------------------------
-- `client.entidad_federativa` se queda con la etiqueta legible que ya traen las
-- altas existentes; la clave va aparte, igual que `nacionalidad` frente a
-- `pais_nacionalidad_clave` en la 0019. Reinterpretar la columna de texto como
-- clave habría convertido "Jalisco" en una clave inválida de la noche a la
-- mañana.
alter table client add column if not exists entidad_federativa_clave text;
comment on column client.entidad_federativa_clave is
  'Clave del catálogo ENTIDAD FEDERATIVA de la UIF. La etiqueta legible sigue en entidad_federativa.';

-- ---------------------------------------------------------------------
-- 6. RLS — todos leen, sólo Kawiil escribe
-- ---------------------------------------------------------------------
alter table catalogo_sat enable row level security;
alter table catalogo_valor enable row level security;

drop policy if exists "catalogo_sat_select" on catalogo_sat;
create policy "catalogo_sat_select" on catalogo_sat
  for select using (auth.uid() is not null);

drop policy if exists "catalogo_valor_select" on catalogo_valor;
create policy "catalogo_valor_select" on catalogo_valor
  for select using (auth.uid() is not null);

drop policy if exists "catalogo_sat_write_kawiil" on catalogo_sat;
create policy "catalogo_sat_write_kawiil" on catalogo_sat
  for all using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());

drop policy if exists "catalogo_valor_write_kawiil" on catalogo_valor;
create policy "catalogo_valor_write_kawiil" on catalogo_valor
  for all using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on catalogo_sat, catalogo_valor, v_catalogo_vigente, v_catalogos_estado to authenticated;
    grant execute on function public.catalogo_en_fecha(text, date) to authenticated;
    grant execute on function public.clave_valida_en_catalogo(text, text, date) to authenticated;
    grant execute on function public.reemplazar_valores_catalogo(text, jsonb, text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on catalogo_sat, catalogo_valor from anon;
  end if;
end $$;
