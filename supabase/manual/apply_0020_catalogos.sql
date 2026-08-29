-- =====================================================================
-- Ikán · Aplicar migration 0020 + seed 13 en el SQL Editor de Supabase
-- =====================================================================
-- Pega TODO este archivo en un solo envío y ejecuta. Al final imprime
-- "OK · N pruebas pasaron" o revienta con el número de la prueba que falló.
--
-- Es idempotente: se puede correr dos veces sin efecto adicional.
--
-- Qué deja: los catálogos del layout REGISTRADOS y vacíos, salvo 'prioridad'
-- (el único cuyos valores enumera el propio instructivo). Los demás se cargan
-- desde la consola de plataforma, en Catálogos del layout.
-- =====================================================================

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
  v_item jsonb;
  v_clave text;
  v_i int := 0;
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
  for v_item in select * from jsonb_array_elements(p_valores) loop
    v_clave := btrim(coalesce(v_item->>'clave', ''));
    if v_clave = '' then
      raise exception 'Hay un valor sin clave en la carga de %', p_codigo;
    end if;
    if btrim(coalesce(v_item->>'descripcion', '')) = '' then
      raise exception 'La clave % viene sin descripción', v_clave;
    end if;
    if v_patron is not null and v_clave !~ v_patron then
      raise exception 'La clave % no cumple el formato del catálogo % (%)', v_clave, p_codigo, v_patron;
    end if;
  end loop;

  if (select count(distinct btrim(x->>'clave')) from jsonb_array_elements(p_valores) x)
     <> jsonb_array_length(p_valores) then
    raise exception 'La carga de % trae claves repetidas', p_codigo;
  end if;

  -- Cierra lo vigente.
  update catalogo_valor
     set vigente_hasta = current_date
   where catalogo_id = v_cat.id
     and (vigente_hasta is null or vigente_hasta > current_date);

  -- Abre lo nuevo.
  for v_item in select * from jsonb_array_elements(p_valores) loop
    v_i := v_i + 1;
    insert into catalogo_valor (catalogo_id, clave, descripcion, orden, vigente_desde, version_carga)
    values (
      v_cat.id,
      btrim(v_item->>'clave'),
      btrim(v_item->>'descripcion'),
      coalesce((v_item->>'orden')::int, v_i),
      current_date,
      v_cat.version + 1
    );
    v_insertados := v_insertados + 1;
  end loop;

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

-- =====================================================================
-- Seed 13 · Registro de los catálogos del layout de fe pública
-- =====================================================================
-- ARCHIVO GENERADO — no editar a mano.
-- Regenerar con: node scripts/generar-catalogos-fep.mjs
--
-- REGISTRA los catálogos, no los CARGA. Los archivos de catálogo de la UIF no
-- vienen en el instructivo; aquí sólo queda constancia de cuáles existen, qué
-- campos los usan y qué forma tiene su clave. Quedan en version = 0 (sin
-- valores) hasta que Kawiil los cargue desde la consola de plataforma.
--
-- La única excepción es 'prioridad': el instructivo sí enumera sus dos valores
-- (campo 3.3), así que se siembra.
-- =====================================================================

insert into catalogo_sat (codigo, nombre, layout, etiquetas_layout, clave_patron, fuente, notas)
values
  ('actividad_economica', 'ACTIVIDAD ECONÓMICA', 'fep', array['actividad_economica']::text[], '^[0-9]{7}$', 'uif', 'Referenciado por 7 campo(s) del instructivo.'),
  ('actividades_vulnerables', 'actividades vulnerables', 'fep', array['clave_actividad']::text[], '^[0-9]{3}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('cargo_de_accionista', 'CARGO DE ACCIONISTA', 'fep', array['cargo_accionista']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('codigos_postales_de_sepomex', 'Códigos Postales de SEPOMEX', 'fep', array['codigo_postal']::text[], '^[0-9]{5}$', 'uif', 'Referenciado por 2 campo(s) del instructivo.'),
  ('entidad_federativa', 'ENTIDAD FEDERATIVA', 'fep', array['entidad_federativa']::text[], '^[0-9]{1,2}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('giro_mercantil', 'GIRO MERCANTIL', 'fep', array['giro_mercantil']::text[], '^[0-9]{7}$', 'uif', 'Referenciado por 13 campo(s) del instructivo.'),
  ('instrumentos_monetarios', 'Instrumentos Monetarios', 'fep', array['instrumento_monetario']::text[], '^[0-9]{1,2}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('monedas_o_divisas', 'Monedas o Divisas', 'fep', array['moneda']::text[], '^[0-9]{1,3}$', 'uif', 'Referenciado por 3 campo(s) del instructivo.'),
  ('motivo_cosntitucion_modificacion', 'MOTIVO COSNTITUCION MODIFICACION', 'fep', array['motivo_constitucion', 'motivo_modificacion']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 2 campo(s) del instructivo.'),
  ('pais', 'PAÍS', 'fep', array['pais_nacionalidad']::text[], '^[A-Z]{2}$', 'uif', 'Referenciado por 38 campo(s) del instructivo.'),
  ('tipo_alerta', 'Catálogo de <tipo_alerta>', 'fep', array['tipo_alerta']::text[], '^[0-9]{3,4}$', 'uif', 'El instructivo cita "el catálogo provisto por la UIF" sin nombrarlo. Al cargarlo, verificar si coincide con otro ya registrado.'),
  ('tipo_de_bien_donado', 'Tipo de bien donado', 'fep', array['tipo_bien']::text[], '^[0-9]{1,2}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipo_de_cesion', 'Tipo de Cesión', 'fep', array['tipo_cesion']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipo_de_fideicomiso', 'Tipo de Fideicomiso', 'fep', array['tipo_fideicomiso']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipo_de_modificacion_patrimonial', 'Tipo de Modificación Patrimonial', 'fep', array['tipo_modificacion_capital_fijo', 'tipo_modificacion_capital_variable']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 2 campo(s) del instructivo.'),
  ('tipo_de_movimiento', 'Tipo de Movimiento', 'fep', array['tipo_movimiento']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipo_de_persona_moral', 'Tipo de Persona Moral', 'fep', array['tipo_persona_moral']::text[], '^[0-9]{1,2}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipo_de_poder', 'Tipo de Poder', 'fep', array['tipo_poder']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipo_fusion', 'TIPO FUSION', 'fep', array['tipo_fusion']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipo_movimiento_fideicomisario', 'Catálogo de <tipo_movimiento_fideicomisario>', 'fep', array['tipo_movimiento_fideicomisario']::text[], '^[0-9]{1}$', 'uif', 'El instructivo cita "el catálogo provisto por la UIF" sin nombrarlo. Al cargarlo, verificar si coincide con otro ya registrado.'),
  ('tipo_movimiento_fideicomitente', 'Catálogo de <tipo_movimiento_fideicomitente>', 'fep', array['tipo_movimiento_fideicomitente']::text[], '^[0-9]{1}$', 'uif', 'El instructivo cita "el catálogo provisto por la UIF" sin nombrarlo. Al cargarlo, verificar si coincide con otro ya registrado.'),
  ('tipos_de_garantia', 'Tipos de Garantía', 'fep', array['tipo_garantia']::text[], '^[0-9]{1,2}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipos_de_inmueble', 'Tipos de Inmueble', 'fep', array['tipo_inmueble']::text[], '^[0-9]{1,2}$', 'uif', 'Referenciado por 2 campo(s) del instructivo.'),
  ('tipos_de_operacion', 'Tipos de Operación', 'fep', array['tipo_operacion']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipos_de_otorgamiento', 'Tipos de Otorgamiento', 'fep', array['tipo_otorgamiento']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.')
on conflict (codigo) do update set
  nombre = excluded.nombre,
  etiquetas_layout = excluded.etiquetas_layout,
  clave_patron = excluded.clave_patron,
  notas = excluded.notas;

-- Prioridad del aviso — campo 3.3. Valores tomados literalmente del
-- instructivo: "1 - Normal. 2 - 24 hrs. con operaciones".
insert into catalogo_sat (codigo, nombre, layout, etiquetas_layout, clave_patron, fuente, notas)
values ('prioridad', 'Prioridad de aviso', 'fep', array['prioridad']::text[], '^[0-9]$',
        'instructivo_fep', 'Único catálogo cuyos valores enumera el propio instructivo (campo 3.3).')
on conflict (codigo) do nothing;

insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values ('1', 'Normal', 1), ('2', '24 hrs. con operaciones', 2))
     as v(clave, descripcion, orden)
where c.codigo = 'prioridad'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

update catalogo_sat
   set version = greatest(version, 1), actualizado_en = coalesce(actualizado_en, now())
 where codigo = 'prioridad' and version = 0;

-- =====================================================================
-- Verificación
-- =====================================================================
do $$
declare
  v_ok int := 0;
  v_n int;
begin
  -- 1. las dos tablas existen
  if to_regclass('public.catalogo_sat') is null or to_regclass('public.catalogo_valor') is null then
    raise exception 'FALLA 1: faltan las tablas de catálogo';
  end if;
  v_ok := v_ok + 1;

  -- 2. los catálogos del layout quedaron registrados
  select count(*) into v_n from catalogo_sat where layout = 'fep';
  if v_n < 25 then raise exception 'FALLA 2: sólo % catálogos registrados', v_n; end if;
  v_ok := v_ok + 1;

  -- 3. los que la notaría toca todos los días están entre ellos
  select count(*) into v_n from catalogo_sat
   where codigo in ('entidad_federativa','pais','actividad_economica','giro_mercantil','tipo_de_poder');
  if v_n <> 5 then raise exception 'FALLA 3: faltan catálogos de uso diario (hay %)', v_n; end if;
  v_ok := v_ok + 1;

  -- 4. prioridad viene sembrado con sus dos valores
  select count(*) into v_n from v_catalogo_vigente where catalogo = 'prioridad';
  if v_n <> 2 then raise exception 'FALLA 4: prioridad tiene % valores', v_n; end if;
  v_ok := v_ok + 1;

  -- 5. el resto queda EXPLÍCITAMENTE vacío, no a medias
  select count(*) into v_n from v_catalogos_estado
   where codigo <> 'prioridad' and valores_vigentes > 0;
  if v_n <> 0 then raise exception 'FALLA 5: % catálogos traen valores no verificados', v_n; end if;
  v_ok := v_ok + 1;

  -- 6. la restricción de no traslape está puesta
  if not exists (select 1 from pg_constraint where conname = 'catalogo_valor_sin_traslape') then
    raise exception 'FALLA 6: falta catalogo_valor_sin_traslape';
  end if;
  v_ok := v_ok + 1;

  -- 7. un catálogo sin cargar no valida ninguna clave
  if public.clave_valida_en_catalogo('tipo_de_poder', '1') then
    raise exception 'FALLA 7: validó contra un catálogo vacío';
  end if;
  v_ok := v_ok + 1;

  -- 8. y uno cargado sí
  if not public.clave_valida_en_catalogo('prioridad', '2') then
    raise exception 'FALLA 8: no reconoce la prioridad 2';
  end if;
  v_ok := v_ok + 1;

  -- 9. la columna de clave de entidad federativa existe en client
  if not exists (select 1 from information_schema.columns
                  where table_name = 'client' and column_name = 'entidad_federativa_clave') then
    raise exception 'FALLA 9: falta client.entidad_federativa_clave';
  end if;
  v_ok := v_ok + 1;

  -- 10. RLS encendida en las dos tablas
  select count(*) into v_n from pg_class
   where relname in ('catalogo_sat','catalogo_valor') and relrowsecurity;
  if v_n <> 2 then raise exception 'FALLA 10: RLS apagada en % tabla(s)', 2 - v_n; end if;
  v_ok := v_ok + 1;

  raise notice 'OK · % pruebas pasaron', v_ok;
end $$;
