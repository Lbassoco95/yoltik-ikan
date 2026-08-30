-- =====================================================================
-- Ikán · Aplicar migration 0020 + seeds 13, 14 y 15 en el SQL Editor
-- =====================================================================
-- Pega TODO este archivo en un solo envío y ejecuta. Al final imprime
-- "OK · N pruebas pasaron" o revienta con el número de la prueba que falló.
--
-- Es idempotente: se puede correr dos veces sin efecto adicional.
--
-- Qué deja: los catálogos del layout con sus valores reales —25 de 26
-- cargados, 924 claves salidas de las plantillas del SAT— y la clave de
-- actividad vulnerable de las dos organizaciones demo.
--
-- El único que queda vacío es 'codigos_postales_de_sepomex' (32,353 valores):
-- se carga desde la consola de plataforma con
-- docs/catalogos-uif/codigos_postales.csv, porque un archivo de ese tamaño no
-- pasa cómodo por el SQL Editor.
-- =====================================================================

-- Todo lo que sigue va en UNA transacción, verificación incluida: si una
-- comprobación del final falla, no queda nada a medias en la base. Se agregó
-- después de notar que estos cuatro bundles no la traían y los anteriores sí.
begin;

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
  ('actividades_vulnerables', 'actividades vulnerables', 'fep', array['clave_actividad']::text[], '^[A-Z0-9]{3}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('cargo_de_accionista', 'CARGO DE ACCIONISTA', 'fep', array['cargo_accionista']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('codigos_postales_de_sepomex', 'Códigos Postales de SEPOMEX', 'fep', array['codigo_postal']::text[], '^[A-Z0-9]{5}$', 'uif', 'Referenciado por 2 campo(s) del instructivo.'),
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
-- Seed 14 · Valores de los catálogos de la UIF (layout de fe pública)
-- =====================================================================
-- ARCHIVO GENERADO — no editar a mano.
-- Regenerar con: node scripts/generar-seed-catalogos-uif.mjs
-- Datos y procedencia: docs/catalogos-uif/catalogos_fep.json
--
-- 25 catálogos, 924 valores. Ninguno inventado: todos salen de la
-- hoja oculta `Combos` de las plantillas de captura que publica el SAT
-- (Fedatario*.xlsm), que es la lista contra la que valida el portal. Cada
-- bloque dice de qué archivo y de qué columna salió.
--
-- Requiere el seed 13 aplicado (registro de los catálogos).
-- Es idempotente: no duplica valores ya vigentes.
-- =====================================================================

-- actividad_economica · 167 valores · FedatarioPoder_v4_3.xlsm, hoja Combos, columna 5
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1000000', 'NO APLICA', 1),
    ('1110100', 'AGRICULTURA Y SILVICULTURA - ADMINISTRADORES O TRABAJADORES AGRICOLAS', 2),
    ('1110400', 'AGRICULTURA Y SILVICULTURA - ADMINISTRADORES O TRABAJADORES SILVICOLAS Y FORESTALES', 3),
    ('1220100', 'GANADERIA - APICULTORES', 4),
    ('1220200', 'GANADERIA - ADMINISTRADORES, CRIADORES O SUPERVISORES AVICOLAS Y GANADEROS', 5),
    ('1330200', 'PESCA Y ACUACULTURA - PESCADORES Y TRABAJADORES EN LA CRIA Y CULTIVO DE ESPECIES MARINAS', 6),
    ('2130100', 'MINERIA, EXTRACCION Y SUMINISTRO - TECNICOS GEOLOGICOS Y DE MINERALES', 7),
    ('2140100', 'MINERIA, EXTRACCION Y SUMINISTRO - INGENIEROS, OPERADORES O AYUDANTES EN LA EXTRACCION Y REFINACION MINERA', 8),
    ('2210100', 'MINERIA, EXTRACCION Y SUMINISTRO - AYUDANTES EN LA PERFORACION DE POZOS DE PETROLEO Y GAS NATURAL', 9),
    ('2240200', 'MINERIA, EXTRACCION Y SUMINISTRO - INGENIEROS PETROLEROS', 10),
    ('2420100', 'MINERIA, EXTRACCION Y SUMINISTRO - OPERADORES DE CENTRALES O SISTEMAS DE ENERGIA ELECTRICAS', 11),
    ('2420200', 'MINERIA, EXTRACCION Y SUMINISTRO - OPERADORES DE MAQUINAS DE VAPOR', 12),
    ('2530100', 'MINERIA, EXTRACCION Y SUMINISTRO - GERENTE, SUPERVISOR U OPERADORES DE TRATAMIENTO Y POTABILIZACION, ABASTECIMIENTO Y RECOLECCION DE AGUA', 13),
    ('3130100', 'CONSTRUCCION - DECORADORES DE INTERIORES', 14),
    ('3130300', 'CONSTRUCCION - INGENIEROS, TECNICOS Y OPERADORES DE LA CONSTRUCCION', 15),
    ('3310300', 'CONSTRUCCION - COLOCADORES DE PRODUCTOS PREFABRICADOS EN INMUEBLES', 16),
    ('3310400', 'CONSTRUCCION - PINTORES', 17),
    ('3310600', 'CONSTRUCCION - VIDRIEROS', 18),
    ('3410200', 'CONSTRUCCION - REPARADORES DE VIAS DE COMUNICACION', 19),
    ('3420100', 'CONSTRUCCION - PLOMEROS E INSTALADORES DE TUBERIA', 20),
    ('3420200', 'CONSTRUCCION - ARQUITECTOS', 21),
    ('4130300', 'MECANICA - MECANICOS DE EQUIPO PESADO', 22),
    ('4130500', 'MECANICA - INGENIERO O MECANICOS INSTALADORES DE MAQUINARIA INDUSTRIAL', 23),
    ('4131000', 'MECANICA - INGENIERO O TECNICO EN MECANICA DE VEHICULOS TERRESTRES, AEREOS Y ACUATICOS', 24),
    ('4230200', 'ELECTRICIDAD - INGENIEROS O TECNICOS ELECTRICISTAS', 25),
    ('4230500', 'ELECTRICIDAD - TECNICOS EN REFRIGERACION, AIRE ACONDICIONADO Y CALEFACCION', 26),
    ('4330100', 'ELECTRONICA - MECANICOS DE INSTRUMENTOS INDUSTRIALES', 27),
    ('4330200', 'ELECTRONICA - INGENIERO O TECNICOS EN ELECTRONICA', 28),
    ('4430200', 'INFORMATICA - INGENIERO O TECNICOS PROGRAMADORES EN INFORMATICA', 29),
    ('4440100', 'INFORMATICA - PROFESIONISTAS O TECNICOS DE SISTEMAS DE INFORMACION Y PROCESAMIENTO DE DATOS', 30),
    ('4530200', 'TELECOMUNICACIONES - INGENIERO, INSTALADORES Y REPARADORES DE EQUIPOS Y ACCESORIOS DE TELECOMUNICACIONES', 31),
    ('4530500', 'TELECOMUNICACIONES - TELEGRAFISTAS Y RADIO-OPERADORES', 32),
    ('4630100', 'PROCESOS INDUSTRIALES - INGENIERO O TECNICOS INDUSTRIAL Y DE PRODUCCION', 33),
    ('4640300', 'PROCESOS INDUSTRIALES - INGENIEROS METALURGICOS Y DE MATERIALES', 34),
    ('5110100', 'MINERALES NO METALICOS - OPERADORES O TRABAJADORES DE VIDRIO Y CONCRETO', 35),
    ('5121300', 'MINERALES NO METALICOS - OPERADORES DE MAQUINAS PROCESADORAS DE MINERALES NO METALICOS', 36),
    ('5210100', 'METALES - SUPERVISORES U OPERADORES DE PROCESAMIENTO Y FUNDICION DE METALES', 37),
    ('5310700', 'ALIMENTOS Y BEBIDAS - TRABAJADORES EN LA ELABORACION Y PROCESAMIENTO DE ALIMENTOS, BEBIDAS Y TABACO', 38),
    ('5410100', 'TEXTILES Y PRENDAS DE VESTIR - TRABAJADORES EN LA PRODUCCION DE TEXTILES, PRENDAS DE VESTIR Y CALZADO', 39),
    ('5420700', 'TEXTILES Y PRENDAS DE VESTIR - TRABAJADORES DE REPARACION DE PRENDAS DE VESTIR Y CALZADO', 40),
    ('5510100', 'MADERA, PAPEL, Y PIEL - TRABAJADORES EN LA FABRICACION DE MUEBLES O PRODUCTOS DE MADERA Y/O PIEL', 41),
    ('5610200', 'PRODUCTOS QUIMICOS - TRABAJADORES EN EL PROCESAMIENTO Y FABRICACION DE PRODUCTOS QUIMICOS Y FARMACOQUIMICAS', 42),
    ('5710200', 'PRODUCTOS METALICOS Y DE HULE Y PLASTICO - TRABAJADORES EN LA FABRICACION DE PRODUCTOS METALICOS, DE HULE Y PLASTICOS', 43),
    ('5720800', 'PRODUCTOS METALICOS Y DE HULE Y PLASTICO - ENSAMBLADORES Y ACABADORES DE PRODUCTOS DE PLASTICO', 44),
    ('5720900', 'PRODUCTOS METALICOS Y DE HULE Y PLASTICO - FABRICANTES DE HERRAMIENTAS Y TROQUELES', 45),
    ('5721000', 'PRODUCTOS METALICOS Y DE HULE Y PLASTICO - HERREROS Y FORJADORES', 46),
    ('5721100', 'PRODUCTOS METALICOS Y DE HULE Y PLASTICO - JOYEROS Y ORFEBRES', 47),
    ('5722900', 'PRODUCTOS METALICOS Y DE HULE Y PLASTICO - SOLDADORES Y OXICORTADORES', 48),
    ('5730600', 'PRODUCTOS METALICOS Y DE HULE Y PLASTICO - TRABAJADORES EN EL ENSAMBLADO DE VEHICULOS, MOLDEADO, LAMINADO Y MONTAJE DE PIEZAS METALICAS, HULE O PLASTICO', 49),
    ('5731100', 'PRODUCTOS METALICOS Y DE HULE Y PLASTICO - SUPERVISORES EN LA FABRICACION Y MONTAJE DE ARTICULOS DEPORTIVOS, DE JUGUETES Y SIMILARES', 50),
    ('5810200', 'PRODUCTOS ELECTRICOS Y ELECTRONICOS - TRABAJADORES EN LA FABRICACION DE PRODUCTOS ELECTRICOS Y ELECTRONICOS', 51),
    ('5910400', 'PRODUCTOS IMPRESOS - TRABAJADORES EN LA ELABORACION DE PRODUCTOS IMPRESOS', 52),
    ('6120100', 'TRANSPORTE FERROVIARIO - CONDUCTORES Y OPERADORES DE TREN SUBTERRANEO Y DE TREN LIGERO', 53),
    ('6120200', 'TRANSPORTE FERROVIARIO - TRABAJADORES DE FERROCARRILES', 54),
    ('6220100', 'TRANSPORTE TERRESTRE - CONDUCTORES DE VEHICULOS DE TRANSPORTE, SERVICIOS DE CARGA Y/O REPARTO', 55),
    ('6330100', 'TRANSPORTE AEREO - COORDINADORES Y SUPERVISORES EN SERVICIOS DE TRANSPORTE AEREO', 56),
    ('6330200', 'TRANSPORTE AEREO - DESPACHADORES DE VUELO Y ESPECIALISTAS EN SERVICIOS AEREOS', 57),
    ('6330400', 'TRANSPORTE AEREO - SUPERVISORES DE SISTEMAS DE COMUNICACION PARA LA AERONAVEGACION', 58),
    ('6330500', 'TRANSPORTE AEREO - PILOTOS DE AVIACION E INSTRUCTORES DE VUELO', 59),
    ('6330600', 'TRANSPORTE AEREO - SOBRECARGOS', 60),
    ('6420100', 'TRANSPORTE MARITIMO Y FLUVIAL - CONDUCTORES DE EMBARCACIONES', 61),
    ('6430100', 'TRANSPORTE MARITIMO Y FLUVIAL - JEFES Y CONTROLADORES DE TRAFICO MARITIMO', 62),
    ('6430300', 'TRANSPORTE MARITIMO Y FLUVIAL - PILOTOS, CAPITANES DE PUERTOS Y OFICIALES DE CUBIERTA', 63),
    ('7110200', 'COMERCIO - DESPACHADORES DE GASOLINERA', 64),
    ('7110300', 'COMERCIO - EMPACADORES DE MERCANCIAS', 65),
    ('7110500', 'COMERCIO - TAQUILLEROS', 66),
    ('7110600', 'COMERCIO - VENDEDORES AMBULANTES', 67),
    ('7120100', 'COMERCIO - CAJEROS REGISTRADORES', 68),
    ('7130200', 'COMERCIO - REPRESENTANTES DE VENTAS POR TELEFONO O POR TELEVISION', 69),
    ('7130400', 'COMERCIO - VENDEDORES ESPECIALIZADOS', 70),
    ('7140100', 'COMERCIO - GERENTES O SUPERVISOR DE ESTABLECIMIENTO COMERCIAL', 71),
    ('7140200', 'COMERCIO - GERENTES O EMPLEADOS DE VENTAS', 72),
    ('7210100', 'ALIMENTACION Y HOSPEDAJE - TRABAJADORES DE SERVICIO DE ALIMENTOS Y BEBIDAS', 73),
    ('7230200', 'ALIMENTACION Y HOSPEDAJE - JEFES DE COCINA, RESTAURANTE Y/O BAR', 74),
    ('7240200', 'ALIMENTACION Y HOSPEDAJE - TRABAJADORES DE SERVICIOS DE ALOJAMIENTO', 75),
    ('7330200', 'TURISMO - COORDINADORES DE OPERACIONES EN AGENCIAS DE VIAJES', 76),
    ('7330300', 'TURISMO - GUIAS DE EXCURSIONES O ECOTURISTICO', 77),
    ('7430100', 'DEPORTE Y ESPARCIMIENTO - ANIMADORES RECREATIVOS', 78),
    ('7430200', 'DEPORTE Y ESPARCIMIENTO - ATLETAS, ENTRENADORES O INSTRUCTORES EN DEPORTE Y RECREACION', 79),
    ('7430400', 'DEPORTE Y ESPARCIMIENTO - OFICIALES, JUECES Y ARBITROS DEPORTIVOS', 80),
    ('7530100', 'SERVICIOS PERSONALES - ESTILISTAS, ESTETICISTAS Y MASAJISTAS', 81),
    ('7540100', 'SERVICIOS PERSONALES - TRBAJADORES DE SERVICIOS FUNERARIOS O CEMENTERIOS', 82),
    ('7620100', 'REPARACION DE ARTICULOS DE USO DOMESTICO Y PERSONAL - CERRAJEROS', 83),
    ('7620200', 'REPARACION DE ARTICULOS DE USO DOMESTICO Y PERSONAL - REPARADORES DE ARTICULOS DE HULE', 84),
    ('7630100', 'REPARACION DE ARTICULOS DE USO DOMESTICO Y PERSONAL - RELOJEROS Y REPARADORES DE RELOJES', 85),
    ('7630200', 'REPARACION DE ARTICULOS DE USO DOMESTICO Y PERSONAL - REPARADORES DE APARATOS ELECTRICOS', 86),
    ('7720100', 'LIMPIEZA - SERVICIOS DE CAMARISTAS Y ASEADORES', 87),
    ('7720200', 'LIMPIEZA - TRABAJADORES DE TINTORERIA Y LAVANDERIA', 88),
    ('7720300', 'LIMPIEZA - FUMIGADORES DE PLAGAS', 89),
    ('7810200', 'SERVICIO POSTAL Y MENSAJERIA - EMPLEADOS DE SERVICIOS DE MENSAJERIA', 90),
    ('8120100', 'BOLSA, BANCA Y SEGUROS - GERENTES O TRABAJADORES DE SERVICIOS Y PRODUCTOS FINANCIEROS', 91),
    ('8130500', 'BOLSA, BANCA Y SEGUROS - VALUADORES', 92),
    ('8140100', 'BOLSA, BANCA Y SEGUROS - AGENTES DE VALORES, PROMOTORES Y CORREDORES DE INVERSION', 93),
    ('8210100', 'ADMINISTRACION - TRABAJADORES DE ARCHIVO, ALMACEN DE INVENTARIOS', 94),
    ('8220400', 'ADMINISTRACION - CAPTURISTA Y OPERADORES DE TELEFONO', 95),
    ('8220600', 'ADMINISTRACION - PAGADORES Y COBRADORES', 96),
    ('8230300', 'ADMINISTRACION - DIRECTORES, GERENTES Y EMPLEADOS DE COMPRAS, FINANZAS, RECURSOS HUMANOS Y SERVICIOS ADMINISTRATIVOS', 97),
    ('8240100', 'ADMINISTRACION - ASISTENTES ADMINISTRATIVOS', 98),
    ('8240200', 'ADMINISTRACION - CONTADORES Y AUDITORES', 99),
    ('8240600', 'ADMINISTRACION - DIRECTORES, GERENTES Y EMPLEADOS DE PRODUCCION', 100),
    ('8240700', 'ADMINISTRACION - DIRECTORES, GERENTES Y EMPLEADOS DE SERVICIOS DE TRANSPORTE', 101),
    ('8250100', 'ADMINISTRACION - CONSULTORES', 102),
    ('8250200', 'ADMINISTRACION - DIRECTORES, GERENTES Y EMPLEADOS DE COMERCIALIZACION', 103),
    ('8250800', 'ADMINISTRACION - DIRECTORES, GERENTES Y EMPELADOS ADMINISTRATIVOS', 104),
    ('8340100', 'SERVICIOS LEGALES - ABOGADOS Y ASESORES LEGALES', 105),
    ('8340300', 'SERVICIOS LEGALES - NOTARIOS Y CORREDORES PUBLICOS', 106),
    ('9120700', 'SERVICIOS MEDICOS - ENFERMERAS Y/O PARAMEDICOS', 107),
    ('9130300', 'SERVICIOS MEDICOS - DIETISTAS Y NUTRIOLOGOS', 108),
    ('9131200', 'SERVICIOS MEDICOS - TECNICOS DE LABORATORIO MEDICO', 109),
    ('9140200', 'SERVICIOS MEDICOS - DIRECTORES DE INSTITUCIONES EN EL CUIDADO DE LA SALUD', 110),
    ('9140400', 'SERVICIOS MEDICOS - FARMACEUTICOS', 111),
    ('9140500', 'SERVICIOS MEDICOS - FISIOTERAPEUTAS Y QUIROPRACTICOS', 112),
    ('9140700', 'SERVICIOS MEDICOS - MEDICOS ESPECIALISTAS', 113),
    ('9140800', 'SERVICIOS MEDICOS - MEDICOS GENERALES Y FAMILIARES', 114),
    ('9230100', 'INSPECCION - INSPECTORES DE SALUD AMBIENTAL, SANIDAD Y DEL TRABAJO', 115),
    ('9230200', 'INSPECCION - INSPECTORES DE TRANSPORTE DE CARGA Y DE PASAJEROS', 116),
    ('9230300', 'INSPECCION - INSPECTORES FISCALES Y DE PRECIOS', 117),
    ('9230400', 'INSPECCION - INSPECTORES SANITARIOS Y DE CONTROL DE CALIDAD DE PRODUCTOS CARNICOS, PESQUEROS Y AGRICOLAS', 118),
    ('9330100', 'SEGURIDAD SOCIAL - CONSEJEROS DE EMPLEO', 119),
    ('9330300', 'SEGURIDAD SOCIAL - TRABAJADORES DE SERVICIO SOCIAL Y DE LA COMUNIDAD', 120),
    ('9420100', 'PROTECCION DE BIENES Y/O PERSONAS - BOMBEROS', 121),
    ('9420300', 'PROTECCION DE BIENES Y/O PERSONAS - GUARDIAS DE SEGURIDAD', 122),
    ('9430100', 'PROTECCION DE BIENES Y/O PERSONAS - DETECTIVES PRIVADOS', 123),
    ('1014010', 'RADIO, CINE, TELEVISION Y TEATRO - DISEÑADORES GRAFICOS', 124),
    ('1014030', 'RADIO, CINE, TELEVISION Y TEATRO - EDITORES, PERIODISTAS, REPORTEROS Y REDACTORES', 125),
    ('1023010', 'RADIO, CINE, TELEVISION Y TEATRO - ASISTENTES Y/U OPERADORES DE PRODUCCION DE CINE, RADIO Y TELEVISION', 126),
    ('1023070', 'RADIO, CINE, TELEVISION Y TEATRO - LOCUTORES, COMENTARISTAS Y CRONISTAS DE RADIO Y TELEVISION', 127),
    ('1024020', 'RADIO, CINE, TELEVISION Y TEATRO - PRODUCTORES Y DIRECTORES DE CINE, TELEVISION Y TEATRO', 128),
    ('1033010', 'INTERPRETACION ARTISTICA - ACTORES, BAILARINES, MUSICOS, ESCRITORES', 129),
    ('1033020', 'INTERPRETACION ARTISTICA - ARTESANOS', 130),
    ('1033040', 'INTERPRETACION ARTISTICA - FOTOGRAFOS', 131),
    ('1034010', 'INTERPRETACION ARTISTICA - ARTISTAS PLASTICOS', 132),
    ('1044010', 'TRADUCCION E INTERPRETACION LINGüISTICA - INTERPRETES Y/O TRADUCTORES', 133),
    ('1052010', 'PUBLICIDAD, PROPAGANDA Y RELACIONES PUBLICAS - MODELOS Y EDECANES', 134),
    ('1054010', 'PUBLICIDAD, PROPAGANDA Y RELACIONES PUBLICAS - DIRECTORES, GERENTES Y EMPLEADOS DE PUBLICIDAD', 135),
    ('1112010', 'INVESTIGACION - ENCUESTADORES Y CODIFICADORES', 136),
    ('1113010', 'INVESTIGACION - ASISTENTES DE INVESTIGADORES', 137),
    ('1113020', 'INVESTIGACION - QUIMICOS Y/O TECNICOS EN QUIMICA', 138),
    ('1114010', 'INVESTIGACION - BIOLOGOS Y CIENTIFICOS RELACIONADOS', 139),
    ('1114020', 'INVESTIGACION - ECONOMISTAS Y POLITOLOGOS (NO FUNCIONARIOS PUBLICOS)', 140),
    ('1114030', 'INVESTIGACION - FISICOS ASTRONOMOS', 141),
    ('1114040', 'INVESTIGACION - GEOLOGOS, GEOQUIMICOS, GEOFISICOS Y GEOGRAFOS', 142),
    ('1114050', 'INVESTIGACION - INVESTIGADORES Y CONSULTORES EN MERCADOTECNIA', 143),
    ('1114060', 'INVESTIGACION - MATEMATICOS, ESTADISTICOS Y ACTUARIOS', 144),
    ('1114070', 'INVESTIGACION - METEOROLOGOS', 145),
    ('1114090', 'INVESTIGACION - SOCIOLOGOS, ANTROPOLOGOS E HISTORIADORES', 146),
    ('1123020', 'ENSEÑANZA - CAPACITADORES E INSTRUCTORES', 147),
    ('1124070', 'ENSEÑANZA - PROFESORES O DOCENTES', 148),
    ('1125010', 'ENSEÑANZA - DIRECTORES GENERALES DE EDUCACION', 149),
    ('1133010', 'DIFUSION CULTURAL - PROMOTORES DE DIFUSION CULTURAL', 150),
    ('1134010', 'DIFUSION CULTURAL - TRABAJADORES DE BIBLIOTECA, ARCHIVO, MUSEO Y GALERIA DE ARTE', 151),
    ('1135010', 'OTRAS OCUPACIONES - ESTUDIANTE O MENOR DE EDAD SIN OCUPACION', 152),
    ('1135080', 'OTRAS OCUPACIONES - PROPIETARIO, ACCIONISTA O SOCIO', 153),
    ('1135020', 'OTRAS OCUPACIONES - DESEMPLEADO', 154),
    ('1135030', 'OTRAS OCUPACIONES - JUBILADO O PENSIONADO', 155),
    ('1135050', 'OTRAS OCUPACIONES - AMA DE CASA O QUEHACERES DEL HOGAR', 156),
    ('1135060', 'OTRAS OCUPACIONES - MINISTROS DE CULTO RELIGIOSO (SACERDOTE, PASTOR, MONJA, ETC)', 157),
    ('1135070', 'OTRAS OCUPACIONES - AGENTE ADUANAL', 158),
    ('1136010', 'SECTOR PUBLICO - EMPLEADO DEL PODER EJECUTIVO FEDERAL', 159),
    ('1136020', 'SECTOR PUBLICO - EMPLEADO PODER EJECUTIVO ESTATAL O DEL DISTRITO FEDERAL', 160),
    ('1136030', 'SECTOR PUBLICO - EMPLEADO DEL PODER EJECUTIVO MUNICIPAL O DELEGACIONAL', 161),
    ('1136040', 'SECTOR PUBLICO - EMPLEADO DEL PODER JUDICIAL FEDERAL', 162),
    ('1136070', 'SECTOR PUBLICO - EMPLEADO DEL PODER JUDICIAL ESTATAL O DEL DISTRITO FEDERAL', 163),
    ('1136050', 'SECTOR PUBLICO - EMPLEADO DEL PODER LEGISLATIVO FEDERAL', 164),
    ('1136060', 'SECTOR PUBLICO - EMPLEADO DEL PODER LEGISLATIVO ESTATAL O DEL DISTRITO FEDERAL', 165),
    ('1136090', 'SECTOR PUBLICO - EJERCITO, ARMADA Y FUERZA AEREA', 166),
    ('1136080', 'ORGANISMOS INTERNACIONALES Y EXTRATERRITORIALES - EMPLEADOS DE ORGANISMOS INTERNACIONALES Y EXTRATERRITORIALES', 167)
) as v(clave, descripcion, orden)
where c.codigo = 'actividad_economica'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- actividades_vulnerables · 20 valores · 0InformeEnCeros.xlsm, hoja Combos, columna 1
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('ADU', 'SERVICIOS DE COMERCIO EXTERIOR', 1),
    ('ARI', 'DERECHOS PERSONALES DE USO O GOCE DE INMUEBLES', 2),
    ('AVI', 'OPERACIONES CON ACTIVOS VIRTUALES', 3),
    ('BLI', 'SERVICIO DE BLINDAJE', 4),
    ('CHV', 'CHEQUES DE VIAJERO', 5),
    ('DIN', 'DESARROLLOS INMOBILIARIOS', 6),
    ('DON', 'RECEPCION DE DONATIVOS', 7),
    ('FEP', 'FE PUBLICA', 8),
    ('FES', 'SERVIDORES PUBLICOS', 9),
    ('INM', 'TRANSMISION DE DERECHOS SOBRE BIENES INMUEBLES', 10),
    ('JYS', 'JUEGOS CON APUESTAS, CONCURSOS O SORTEOS', 11),
    ('MJR', 'METALES Y PIEDRAS PRECIOSOS, JOYAS O RELOJES', 12),
    ('MPC', 'MUTUO, PRESTAMOS O CREDITO', 13),
    ('OBA', 'OBRAS DE ARTE', 14),
    ('SPR', 'SERVICIOS PROFESIONALES', 15),
    ('TCV', 'TRASLADO O CUSTODIA DE DINERO O VALORES', 16),
    ('TDR', 'MONEDEROS Y CERTIFICADOS DE DEVOLUCIONES O RECOMPENSAS', 17),
    ('TPP', 'TARJETAS PREPAGADAS, VALES O CUPONES', 18),
    ('TSC', 'TARJETAS DE SERVICIO O DE CREDITO', 19),
    ('VEH', 'VEHICULOS AEREOS, MARITIMOS O TERRESTRES', 20)
) as v(clave, descripcion, orden)
where c.codigo = 'actividades_vulnerables'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- cargo_de_accionista · 5 valores · FedatarioConstitucionPM_v4_4.xlsm, hoja Combos, columna 66
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Administrador único', 1),
    ('2', 'Presidente del consejo de administración u órgano equivalente', 2),
    ('3', 'Otro miembro del consejo de administración u órgano equivalente', 3),
    ('4', 'Comisario o Miembro del consejo de vigilancia u órgano equivalente', 4),
    ('5', 'No aplica', 5)
) as v(clave, descripcion, orden)
where c.codigo = 'cargo_de_accionista'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- entidad_federativa · 32 valores · FedatarioConstitucionPM_v4_4.xlsm, hoja Combos, columna 36
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'AGUASCALIENTES', 1),
    ('2', 'BAJA CALIFORNIA', 2),
    ('3', 'BAJA CALIFORNIA SUR', 3),
    ('4', 'CAMPECHE', 4),
    ('5', 'COAHUILA DE ZARAGOZA', 5),
    ('6', 'COLIMA', 6),
    ('7', 'CHIAPAS', 7),
    ('8', 'CHIHUAHUA', 8),
    ('9', 'DISTRITO FEDERAL', 9),
    ('10', 'DURANGO', 10),
    ('11', 'GUANAJUATO', 11),
    ('12', 'GUERRERO', 12),
    ('13', 'HIDALGO', 13),
    ('14', 'JALISCO', 14),
    ('15', 'MÉXICO', 15),
    ('16', 'MICHOACÁN DE OCAMPO', 16),
    ('17', 'MORELOS', 17),
    ('18', 'NAYARIT', 18),
    ('19', 'NUEVO LEÓN', 19),
    ('20', 'OAXACA', 20),
    ('21', 'PUEBLA', 21),
    ('22', 'QUERÉTARO', 22),
    ('23', 'QUINTANA ROO', 23),
    ('24', 'SAN LUIS POTOSÍ', 24),
    ('25', 'SINALOA', 25),
    ('26', 'SONORA', 26),
    ('27', 'TABASCO', 27),
    ('28', 'TAMAULIPAS', 28),
    ('29', 'TLAXCALA', 29),
    ('30', 'VERACRUZ DE IGNACIO DE LA LLAVE', 30),
    ('31', 'YUCATÁN', 31),
    ('32', 'ZACATECAS', 32)
) as v(clave, descripcion, orden)
where c.codigo = 'entidad_federativa'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- giro_mercantil · 136 valores · FedatarioConstitucionPM_v4_4.xlsm, hoja Combos, columna 7
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1000000', 'NO APLICA', 1),
    ('1100001', 'SECTOR PRIMARIO - AGRICULTURA', 2),
    ('1200001', 'SECTOR PRIMARIO - GANADERIA', 3),
    ('1300001', 'SECTOR PRIMARIO - EXPLOTACION DE OTROS ANIMALES (AVICULTURA, APICULTURA, ETC.)', 4),
    ('1400002', 'SECTOR PRIMARIO - APROVECHAMIENTO FORESTAL', 5),
    ('1500001', 'SECTOR PRIMARIO - PESCA', 6),
    ('2100002', 'MINERIA - MINERIA DE OTROS RECURSOS', 7),
    ('2200002', 'MINERIA - ACTIVIDADES RELACIONADAS CON EL PETROLEO Y EL GAS', 8),
    ('2300003', 'MINERIA - ORO', 9),
    ('2400002', 'MINERIA - PLATA', 10),
    ('2500002', 'MINERIA - PIEDRAS PRECIOSAS', 11),
    ('2600003', 'GENERACION, TRANSMISION Y DISTRIBUCION DE ENERGIA ELECTRICA, SUMINISTRO DE AGUA Y DE GAS', 12),
    ('2710004', 'CONSTRUCCION - OTRAS ACTIVIDADES RELACIONADAS CON LA CONSTRUCCION', 13),
    ('2720004', 'CONSTRUCCION - EDIFICACION RESIDENCIAL Y NO RESIDENCIAL', 14),
    ('2730004', 'CONSTRUCCION - OBRAS DE INGENIERIA CIVIL', 15),
    ('2740004', 'CONSTRUCCION - TRABAJOS ESPECIALIZADOS PARA LA CONSTRUCCION', 16),
    ('2754004', 'CONSTRUCCION - SERVICIOS DE BLINDAJE PARCIAL O TOTAL DE INMUEBLES', 17),
    ('3110005', 'INDUSTRIA - ALIMENTARIA', 18),
    ('3120005', 'INDUSTRIA - BEBIDAS Y DEL TABACO', 19),
    ('3140005', 'INDUSTRIA - PRODUCTOS TEXTILES', 20),
    ('3150005', 'INDUSTRIA - PRENDAS DE VESTIR', 21),
    ('3210005', 'INDUSTRIA - MADERA', 22),
    ('3220005', 'INDUSTRIA - PAPEL', 23),
    ('3230005', 'INDUSTRIA - IMPRESION E INDUSTRIAS CONEXAS', 24),
    ('3240005', 'INDUSTRIA - PRODUCTOS DERIVADOS DEL PETROLEO Y DEL CARBON', 25),
    ('3250005', 'INDUSTRIA - QUIMICA', 26),
    ('3260005', 'INDUSTRIA - PLASTICO Y DEL HULE', 27),
    ('3270005', 'INDUSTRIA - PRODUCTOS A BASE DE MINERALES NO METALICOS (ALFARERIA, PORCELANA, LOZA, VIDRIO, CEMENTO)', 28),
    ('3310005', 'INDUSTRIA - METALICAS BASICAS', 29),
    ('3320005', 'INDUSTRIA - PRODUCTOS METALICOS (HERRAMIENTAS, UTENSILIOS, ESTRUCTURAS, PIEZAS)', 30),
    ('3330005', 'INDUSTRIA - MAQUINARIA Y EQUIPO', 31),
    ('3340005', 'INDUSTRIA - EQUIPO DE COMPUTACION, COMUNICACION, MEDICION Y DE OTROS EQUIPOS, COMPONENTES Y ACCESORIOS ELECTRONICOS', 32),
    ('3350005', 'INDUSTRIA - ACCESORIOS, APARATOS ELECTRICOS Y EQUIPO DE GENERACION DE ENERGIA ELECTRICA', 33),
    ('3360005', 'INDUSTRIA - EQUIPO DE TRANSPORTE SIN MOTOR', 34),
    ('3370005', 'INDUSTRIA - AUTOMOTRIZ', 35),
    ('3380005', 'INDUSTRIA - VEHICULOS BLINDADOS Y EQUIPO PARA EL BLINDAJE DE VEHICULOS', 36),
    ('3410005', 'INDUSTRIA - MUEBLES, COLCHONES Y PERSIANAS', 37),
    ('3420005', 'INDUSTRIA - OTRAS INDUSTRIAS MANUFACTURERAS', 38),
    ('3430005', 'INDUSTRIA - ORFEBRERIA Y JOYERIA DE METALES Y PIEDRAS PRECIOSOS', 39),
    ('3440005', 'INDUSTRIA - JOYERIA DE METALES Y PIEDRAS NO PRECIOSOS Y DE OTROS MATERIALES', 40),
    ('4310006', 'COMERCIO - ABARROTES, ALIMENTOS, BEBIDAS, HIELO Y TABACO', 41),
    ('4320006', 'COMERCIO - PRODUCTOS FARMACEUTICOS, DE PERFUMERIA, ARTICULOS PARA EL ESPARCIMIENTO, ELECTRODOMESTICOS Y APARATOS DE LINEA BLANCA', 42),
    ('4330006', 'COMERCIO - MATERIAS PRIMAS AGROPECUARIAS Y FORESTALES, PARA LA INDUSTRIA, Y MATERIALES DE DESECHO', 43),
    ('4340006', 'COMERCIO - MAQUINARIA, EQUIPO DE COMPUTO Y MOBILIARIO DE USO GENERAL', 44),
    ('4620006', 'COMERCIO - TIENDAS DE AUTOSERVICIO Y DEPARTAMENTALES', 45),
    ('4630006', 'COMERCIO - PRODUCTOS TEXTILES, BISUTERIA, ACCESORIOS DE VESTIR Y CALZADO', 46),
    ('4650006', 'COMERCIO - ARTICULOS DE PAPELERIA', 47),
    ('4660026', 'COMERCIO - ARTICULOS DE JOYERIA Y RELOJES', 48),
    ('4670006', 'COMERCIO - ARTICULOS PARA LA DECORACION DE INTERIORES', 49),
    ('4680006', 'COMERCIO - ANTIGÜEDADES Y OBRAS DE ARTE', 50),
    ('4710006', 'COMERCIO - ARTICULOS DE FERRETERIA, TLAPALERIA Y VIDRIOS', 51),
    ('4720006', 'COMERCIO - VEHICULOS NUEVOS', 52),
    ('4730006', 'COMERCIO - VEHICULOS USADOS', 53),
    ('4740006', 'COMERCIO - PARTES Y REFACCIONES PARA VEHICULOS', 54),
    ('4750006', 'COMERCIO - COMBUSTIBLES Y LUBRICANTES', 55),
    ('4760006', 'COMERCIO - A TRAVES DE INTERNET, Y CATALOGOS IMPRESOS, TELEVISION Y SIMILARES', 56),
    ('4810007', 'TRANSPORTE - AEREO', 57),
    ('4820007', 'TRANSPORTE - FERROVIARIO', 58),
    ('4830007', 'TRANSPORTE - MARITIMO Y FLUVIAL', 59),
    ('4850007', 'TRANSPORTE - TERRESTRE', 60),
    ('4860007', 'TRANSPORTE - TRANSPORTACION Y DISTRIBUCION POR DUCTOS', 61),
    ('4880007', 'TRANSPORTE - SERVICIOS RELACIONADOS CON EL TRANSPORTE', 62),
    ('4890007', 'TRANSPORTE - SERVICIOS DE AGENCIAS ADUANALES', 63),
    ('4840007', 'TRANSPORTE - SERVICIOS DE TRANSPORTE Y/O CUSTODIA DE VALORES', 64),
    ('4910008', 'SERVICIOS POSTALES', 65),
    ('4920009', 'SERVICIOS DE MENSAJERIA Y PAQUETERIA', 66),
    ('4930010', 'SERVICIOS DE ALMACENAMIENTO', 67),
    ('5100011', 'INFORMACION EN MEDIOS MASIVOS', 68),
    ('5180012', 'PROCESAMIENTO ELECTRONICO DE INFORMACION Y OTROS SERVICIOS WEB', 69),
    ('5210013', 'SERVICIOS FINANCIEROS - BANCA CENTRAL', 70),
    ('5220013', 'SERVICIOS FINANCIEROS - BANCA MULTIPLE', 71),
    ('5230013', 'SERVICIOS FINANCIEROS - BANCA DE DESARROLLO', 72),
    ('5240013', 'SERVICIOS FINANCIEROS - FONDOS Y FIDEICOMISOS FINANCIEROS', 73),
    ('5250013', 'SERVICIOS FINANCIEROS - UNIONES DE CREDITO', 74),
    ('5260013', 'SREVICIOS FINANCIEROS - CAJAS DE AHORRO POPULAR', 75),
    ('5270013', 'SERVICIOS FINANCIEROS - OTRAS INSTITUCIONES DE INTERMEDIACION CREDITICIA Y FINANCIERA NO BURSATIL (OPERACION Y PROMOCION DE TARJETAS DE CREDITO NO BANCARIAS, FINANCIAMIENTO DE BIENES DURADEROS), SOCIEDADES FINANCIERAS DE OBJETO LIMITADO', 76),
    ('5280013', 'SERVICIOS FINANCIEROS - OTRAS INSTITUCIONES DE AHORRO Y PRESTAMO', 77),
    ('5290013', 'SERVICIOS FINANCIEROS - COMPAÑIAS DE AUTOFINANCIAMIENTO', 78),
    ('5310013', 'SERVICIOS FINANCIEROS - MONTEPIOS', 79),
    ('5320013', 'SERVICIOS FINANCIEROS - CASAS DE EMPEÑO', 80),
    ('5330013', 'SERVICIOS FINANCIEROS - SOCIEDADES FINANCIERAS DE OBJETO MULTIPLE', 81),
    ('5350013', 'SERVICIOS FINANCIEROS - CASAS DE BOLSA', 82),
    ('5360013', 'SERVICIOS FINANCIEROS - CASAS DE CAMBIO Y CENTROS CAMBIARIOS', 83),
    ('5370013', 'SERVICIOS FINANCIEROS - TRANSMISORES DE DINERO', 84),
    ('5390013', 'SERVICIOS FINANCIEROS - OTROS SERVICIOS RELACIONADOS CON LA INTERMEDIACION BURSATIL', 85),
    ('5410013', 'SERVICIOS FINANCIEROS - COMPAÑIAS DE SEGUROS', 86),
    ('5420013', 'SERVICIOS FINANCIEROS - COMPAÑIAS AFIANZADORAS', 87),
    ('5430013', 'SERVICIOS FINANCIEROS - AGENTES, AJUSTADORES Y GESTORES DE SEGUROS Y FIANZAS', 88),
    ('5440013', 'SERVICIOS FINANCIEROS - ADMINISTRACION DE FONDOS PARA EL RETIRO', 89),
    ('5450013', 'SERVICIOS FINANCIEROS - EMISORA Y/O COMERCIALIZACION DE CHEQUES DE VIAJERO', 90),
    ('5340013', 'OTRAS EMPRESAS DE INTERMEDIACION CREDITICIA NO FINANCIERAS', 91),
    ('5510014', 'SERVICIOS INMOBILIARIOS Y DE ALQUILER - ALQUILER SIN INTERMEDIACION DE BIENES RAICES', 92),
    ('5520014', 'SERVICIOS INMOBILIARIOS Y DE ALQUILER - INMOBILIARIAS Y CORREDORES DE BIENES RAICES', 93),
    ('5530014', 'SERVICIOS INMOBILIARIOS Y DE ALQUILER - SERVICIOS DE ALQUILER DE BIENES MUEBLES EXCEPTO VEHICULOS', 94),
    ('5540014', 'SERVICIOS INMOBILIARIOS Y DE ALQUILER - ALQUILER DE VEHICULOS', 95),
    ('5550014', 'SERVICIOS INMOBILIARIOS Y DE ALQUILER - SERVICIOS DE ALQUILER DE MARCAS REGISTRADAS, PATENTES Y FRANQUICIAS', 96),
    ('5610015', 'SERVICIOS PROFESIONALES Y TECNICOS - SERVICIOS JURIDICOS', 97),
    ('5620015', 'SERVICIOS PROFESIONALES Y TECNICOS - NOTARIA Y CORREDURIA PUBLICA', 98),
    ('5690015', 'SERVICIOS PROFESIONALES Y TECNICOS - CONTABILIDAD Y AUDITORIA', 99),
    ('5630015', 'SERVICIOS PROFESIONALES Y TECNICOS - ARQUITECTURA, INGENIERIA Y ACTIVIDADES RELACIONADAS', 100),
    ('5640015', 'SERVICIOS PROFESIONALES Y TECNICOS - DISEÑO DE SISTEMAS DE COMPUTO Y SERVICIOS RELACIONADOS', 101),
    ('5650015', 'SERVICIOS PROFESIONALES Y TECNICOS - CONSULTORIA ADMINISTRATIVA, CIENTIFICA Y TECNICA', 102),
    ('5660015', 'SERVICIOS PROFESIONALES Y TECNICOS - INVESTIGACION CIENTIFICA Y DESARROLLO', 103),
    ('5670015', 'SERVICIOS PROFESIONALES Y TECNICOS - PUBLICIDAD Y ACTIVIDADES RELACIONADAS', 104),
    ('5680015', 'SERVICIOS PROFESIONALES Y TECNICOS - OTROS SERVICIOS DE OUTSOURCING', 105),
    ('5710016', 'SERVICIOS DE APOYO A LOS NEGOCIOS - SERVICIOS DE ADMINISTRACION DE NEGOCIOS', 106),
    ('5720016', 'SERVICIOS DE APOYO A LOS NEGOCIOS - AGENCIAS DE COBRANZA, DESPACHOS DE INVESTIGACION', 107),
    ('5730016', 'SERVICIOS DE APOYO A LOS NEGOCIOS - SERVICIOS DE PROTECCION Y SEGURIDAD', 108),
    ('5740016', 'SERVICIOS DE APOYO A LOS NEGOCIOS - SERVICIOS DE LIMPIEZA Y MANTENIMIENTO', 109),
    ('5750016', 'SERVICIOS DE APOYO A LOS NEGOCIOS - OTROS SERVICIOS', 110),
    ('6100017', 'SERVICIOS EDUCATIVOS', 111),
    ('6200018', 'SERVICIOS DE SALUD Y DE ASISTENCIA SOCIAL', 112),
    ('7110019', 'SERVICIOS DE ESPARCIMIENTO CULTURALES Y DEPORTIVOS, Y OTROS SERVICIOS RECREATIVOS', 113),
    ('7120019', 'SERVICIOS DE ESPARCIMIENTO - MUSEOS, SITIOS HISTORICOS, ZOOLOGICOS Y SIMILARES', 114),
    ('7130019', 'SERVICIOS DE ESPARCIMIENTO - CASAS DE JUEGOS ELECTRONICOS', 115),
    ('7140019', 'SERVICIOS DE ESPARCIMIENTO - CASINOS O CENTROS DE APUESTA', 116),
    ('7150019', 'SERVICIOS DE ESPARCIMIENTO - VENTA DE BILLETES DE LOTERIA, PRONOSTICOS DEPORTIVOS U OTROS SORTEOS', 117),
    ('7200020', 'SERVICIOS DE ALOJAMIENTO TEMPORAL Y DE PREPARACION DE ALIMENTOS Y BEBIDAS', 118),
    ('8100021', 'SERVICIOS DE REPARACION Y MANTENIMIENTO - EQUIPO INDUSTRIAL, COMERCIAL, SERVICIOS Y AUTOMOTRIZ', 119),
    ('8200022', 'SERVICIOS PERSONALES - LAVANDERIAS, SERVICIOS FUNERARIOS, BAÑOS PUBLICOS, SERVICIOS DE ESTACIONAMIENTO, REVELADO E IMPRESION DE FOTOGRAFIAS', 120),
    ('8310023', 'ASOCIACIONES - ORGANIZACIONES Y CAMARAS DE PRODUCTORES, COMERCIANTES Y PRESTADORES DE SERVICIOS', 121),
    ('8320023', 'ASOCIACIONES - ORGANIZACIONES LABORALES Y SINDICALES', 122),
    ('8330023', 'ASOCIACIONES - ORGANIZACIONES DE PROFESIONISTAS', 123),
    ('8340023', 'ASOCIACIONES - ORGANIZACIONES DE ACTIVIDADES RECREATIVAS', 124),
    ('8350023', 'ASOCIACIONES - ORGANIZACIONES RELIGIOSAS', 125),
    ('8360023', 'ASOCIACIONES - ORGANIZACIONES POLITICAS', 126),
    ('8370023', 'ASOCIACIONES - ORGANIZACIONES CIVILES', 127),
    ('9100025', 'ORGANISMOS INTERNACIONALES Y EXTRATERRITORIALES', 128),
    ('9810024', 'SECTOR PUBLICO - PODER EJECUTIVO FEDERAL', 129),
    ('9820024', 'SECTOR PUBLICO - PODER EJECUTIVO ESTATAL Y DEL DISTRITO FEDERAL', 130),
    ('9830024', 'SECTOR PUBLICO - PODER EJECUTIVO MUNICIPAL Y DELEGACIONAL', 131),
    ('9840024', 'SECTOR PUBLICO - PODER JUDICIAL FEDERAL', 132),
    ('9850024', 'SECTOR PUBLICO - PODER JUDICIAL ESTATAL Y DEL DISTRITO FEDERAL', 133),
    ('9860024', 'SECTOR PUBLICO - PODER LEGISLATIVO FEDERAL', 134),
    ('9870024', 'SECTOR PUBLICO - PODER LEGISLATIVO ESTATAL Y DEL DISTRITO FEDERAL', 135),
    ('9880024', 'SECTOR PUBLICO - ORGANOS AUTONOMOS Y ENTIDADES PARAESTATALES', 136)
) as v(clave, descripcion, orden)
where c.codigo = 'giro_mercantil'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- instrumentos_monetarios · 17 valores · FedatarioCompraVenta_v4_3.xlsm, hoja Combos, columna 24
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Efectivo', 1),
    ('2', 'Tarjeta de Crédito', 2),
    ('3', 'Tarjeta de Debito', 3),
    ('4', 'Tarjeta de Prepago', 4),
    ('5', 'Cheque Nominativo', 5),
    ('6', 'Cheque de Caja', 6),
    ('7', 'Cheques de Viajero', 7),
    ('8', 'Transferencia Interbancaria', 8),
    ('9', 'Transferencia Misma Institución', 9),
    ('10', 'Transferencia Internacional', 10),
    ('11', 'Orden de Pago', 11),
    ('12', 'Giro', 12),
    ('13', 'Oro o Platino Amonedados', 13),
    ('14', 'Plata Amonedada', 14),
    ('15', 'Metales Preciosos', 15),
    ('16', 'Activos Virtuales', 16),
    ('99', 'Otros', 17)
) as v(clave, descripcion, orden)
where c.codigo = 'instrumentos_monetarios'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- monedas_o_divisas · 184 valores · FedatarioCompraVenta_v4_3.xlsm, hoja Combos, columna 26
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Peso mexicano', 1),
    ('2', 'Dólar estadounidense', 2),
    ('3', 'Euro', 3),
    ('4', 'Dirham de los Emiratos Árabes Unidos', 4),
    ('5', 'Afgani afgano', 5),
    ('6', 'Lek albanés', 6),
    ('7', 'Dram armenio', 7),
    ('8', 'Florín antillano neerlandés', 8),
    ('9', 'Kwanza angoleño', 9),
    ('10', 'Peso argentino', 10),
    ('11', 'Dólar australiano', 11),
    ('12', 'Florín arubeño', 12),
    ('13', 'Manat azerbaiyano', 13),
    ('14', 'Manat azerbaiyano', 14),
    ('15', 'Marco convertible de Bosnia-Herzegovina', 15),
    ('16', 'Dólar de Barbados', 16),
    ('17', 'Taka de Bangladesh', 17),
    ('18', 'Lev búlgaro', 18),
    ('19', 'Dinar bahreiní', 19),
    ('20', 'Franco burundés', 20),
    ('21', 'Dólar de Bermuda', 21),
    ('22', 'Dólar de Brunéi', 22),
    ('23', 'Boliviano', 23),
    ('24', 'Real brasileño', 24),
    ('25', 'Dólar bahameño', 25),
    ('26', 'Ngultrum de Bután', 26),
    ('27', 'Pula de Botsuana', 27),
    ('28', 'Rublo bielorruso', 28),
    ('29', 'Dólar de Belice', 29),
    ('30', 'Dólar canadiense', 30),
    ('31', 'Franco congoleño, o congolés', 31),
    ('32', 'Franco suizo', 32),
    ('33', 'Peso chileno', 33),
    ('34', 'Yuan chino', 34),
    ('35', 'Peso colombiano', 35),
    ('36', 'Colón costarricense', 36),
    ('37', 'Dinar serbio', 37),
    ('38', 'Peso cubano convertible', 38),
    ('39', 'Peso cubano', 39),
    ('40', 'Escudo caboverdiano', 40),
    ('41', 'Koruna checa', 41),
    ('42', 'Franco yibutiano', 42),
    ('43', 'Corona danesa', 43),
    ('44', 'Peso dominicano', 44),
    ('45', 'Dinar algerino', 45),
    ('46', 'Libra egipcia', 46),
    ('47', 'Nakfa eritreo', 47),
    ('48', 'Birr etíope', 48),
    ('49', 'Dólar fiyiano', 49),
    ('50', 'Libra malvinense', 50),
    ('51', 'Libra esterlina (libra de Gran Bretaña)', 51),
    ('52', 'Lari georgiano', 52),
    ('53', 'Cedi ghanés', 53),
    ('54', 'Libra de Gibraltar', 54),
    ('55', 'Dalasi gambiano', 55),
    ('56', 'Franco guineano', 56),
    ('57', 'Quetzal guatemalteco', 57),
    ('58', 'Dólar guyanés', 58),
    ('59', 'Dólar de Hong Kong', 59),
    ('60', 'Lempira hondureño', 60),
    ('61', 'Kuna croata', 61),
    ('62', 'Gourde haitiano', 62),
    ('63', 'Forint húngaro', 63),
    ('64', 'Rupiah indonesia', 64),
    ('65', 'Nuevo shéquel israelí', 65),
    ('66', 'Rupia india', 66),
    ('67', 'Dinar iraquí', 67),
    ('68', 'Rial iraní', 68),
    ('69', 'Króna islandesa', 69),
    ('70', 'Dólar jamaicano', 70),
    ('71', 'Dinar jordano', 71),
    ('72', 'Yen japonés', 72),
    ('73', 'Chelín keniata', 73),
    ('74', 'Som kirguís (de Kirguistán)', 74),
    ('75', 'Riel camboyano', 75),
    ('76', 'Franco comoriano (de Comoras)', 76),
    ('77', 'Won norcoreano', 77),
    ('78', 'Won surcoreano', 78),
    ('79', 'Dinar kuwaití', 79),
    ('80', 'Dólar caimano (de Islas Caimán)', 80),
    ('81', 'Tenge kazajo', 81),
    ('82', 'Kip lao', 82),
    ('83', 'Libra libanesa', 83),
    ('84', 'Rupia de Sri Lanka', 84),
    ('85', 'Dólar liberiano', 85),
    ('86', 'Loti lesotense', 86),
    ('87', 'Litas lituano', 87),
    ('88', 'Lat letón', 88),
    ('89', 'Dinar libio', 89),
    ('90', 'Dirham marroquí', 90),
    ('91', 'Leu moldavo', 91),
    ('92', 'Ariary malgache', 92),
    ('93', 'Denar macedonio', 93),
    ('94', 'Kyat birmano', 94),
    ('95', 'Tughrik mongol', 95),
    ('96', 'Pataca de Macao', 96),
    ('97', 'Ouguiya mauritana', 97),
    ('98', 'Rupia mauricia', 98),
    ('99', 'Rufiyaa maldiva', 99),
    ('100', 'Kwacha malauí', 100),
    ('101', 'Ringgit malayo', 101),
    ('102', 'Metical mozambiqueño', 102),
    ('103', 'Dólar namibio', 103),
    ('104', 'Naira nigeriana', 104),
    ('105', 'Córdoba nicaragüense', 105),
    ('106', 'Corona noruega', 106),
    ('107', 'Rupia nepalesa', 107),
    ('108', 'Dólar neozelandés', 108),
    ('109', 'Rial omaní', 109),
    ('110', 'Balboa panameña', 110),
    ('111', 'Nuevo sol peruano', 111),
    ('112', 'Kina de Papúa Nueva Guinea', 112),
    ('113', 'Peso filipino', 113),
    ('114', 'Rupia pakistaní', 114),
    ('115', 'zloty polaco', 115),
    ('116', 'Guaraní paraguayo', 116),
    ('117', 'Rial qatarí', 117),
    ('118', 'Leu rumano', 118),
    ('119', 'Dinar serbio', 119),
    ('120', 'Rublo ruso', 120),
    ('121', 'Franco ruandés', 121),
    ('122', 'Riyal saudí', 122),
    ('123', 'Dólar de las Islas Salomón', 123),
    ('124', 'Rupia de Seychelles', 124),
    ('125', 'Dinar sudanés', 125),
    ('126', 'Corona sueca', 126),
    ('127', 'Dólar de Singapur', 127),
    ('128', 'Libra de Santa Helena', 128),
    ('129', 'Leone de Sierra Leona', 129),
    ('130', 'Chelín somalí', 130),
    ('131', 'Dólar surinamés', 131),
    ('132', 'Libra de Sudán del Sur', 132),
    ('133', 'Dobra de Santo Tomé y Príncipe', 133),
    ('134', 'Colón Salvadoreño', 134),
    ('135', 'Libra siria', 135),
    ('136', 'Lilangeni suazi', 136),
    ('137', 'Baht tailandés', 137),
    ('138', 'Somoni tayik (de Tayikistán)', 138),
    ('139', 'Manat turcomano', 139),
    ('140', 'Dinar tunecino', 140),
    ('141', 'Pa''anga tongano', 141),
    ('142', 'Lira turca', 142),
    ('143', 'Dólar de Trinidad y Tobago', 143),
    ('144', 'Dólar taiwanés', 144),
    ('145', 'Chelín tanzano', 145),
    ('146', 'Grivna ucraniana', 146),
    ('147', 'Chelín ugandés', 147),
    ('148', 'Peso uruguayo', 148),
    ('149', 'Som uzbeko', 149),
    ('150', 'Bolívar fuerte venezolano', 150),
    ('151', 'Dong vietnamita', 151),
    ('152', 'Vatu vanuatense', 152),
    ('153', 'Tala samoana', 153),
    ('154', 'Rial yemení (de Yemen)', 154),
    ('155', 'Rand sudafricano', 155),
    ('156', 'Kwacha zambiano', 156),
    ('157', 'Kwacha zambiano', 157),
    ('158', 'Dólar zimbabuense', 158),
    ('159', 'CENTENARIO', 159),
    ('160', 'AZTECA', 160),
    ('161', 'HIDALGO', 161),
    ('162', '1/2 HIDALGO', 162),
    ('163', '1/4 HIDALGO', 163),
    ('164', '1/5 HIDALGO', 164),
    ('165', '1 OZ LIBERTAD DE ORO', 165),
    ('166', '1/2 OZ LIBERTAD DE ORO', 166),
    ('167', '1/4 OZ LIBERTAD DE ORO', 167),
    ('168', '1/10 OZ LIBERTAD DE ORO', 168),
    ('169', '1/20 OZ LIBERTAD DE ORO', 169),
    ('170', '1 OZ LIBERTAD DE PLATA', 170),
    ('171', '1/2 OZ LIBERTAD DE PLATA', 171),
    ('172', '1/4 OZ LIBERTAD DE PLATA', 172),
    ('173', '1/10 OZ LIBERTAD DE PLATA', 173),
    ('174', '1/20 OZ LIBERTAD DE PLATA', 174),
    ('175', 'Onza de plata', 175),
    ('176', 'Onza de oro', 176),
    ('177', 'Franco de oro (Special settlement currency)', 177),
    ('178', 'Onza de paladio', 178),
    ('179', 'Onza de platino', 179),
    ('180', 'Franco CFA de África Central', 180),
    ('181', 'Dólar del Caribe Oriental', 181),
    ('182', 'Franco UIC (Special settlement currency)', 182),
    ('183', 'Franco CFA de África Occidental', 183),
    ('184', 'Franco CFP', 184)
) as v(clave, descripcion, orden)
where c.codigo = 'monedas_o_divisas'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- motivo_cosntitucion_modificacion · 3 valores · FedatarioConstitucionPM_v4_4.xlsm, hoja Combos, columna 68
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Fusión', 1),
    ('2', 'Escisión', 2),
    ('3', 'Contrato privado', 3)
) as v(clave, descripcion, orden)
where c.codigo = 'motivo_cosntitucion_modificacion'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- pais · 249 valores · FedatarioPoder_v4_3.xlsm, hoja Combos, columna 3
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('AF', 'AFGANISTAN', 1),
    ('AL', 'ALBANIA', 2),
    ('DE', 'ALEMANIA', 3),
    ('AD', 'ANDORRA', 4),
    ('AO', 'ANGOLA', 5),
    ('AI', 'ANGUILA', 6),
    ('AQ', 'ANTARTIDA', 7),
    ('AG', 'ANTIGUA Y BARBUDA', 8),
    ('AN', 'ANTILLAS NEERLANDESAS', 9),
    ('SA', 'ARABIA SAUDI', 10),
    ('DZ', 'ARGELIA', 11),
    ('AR', 'ARGENTINA', 12),
    ('AM', 'ARMENIA', 13),
    ('AW', 'ARUBA', 14),
    ('AU', 'AUSTRALIA', 15),
    ('AT', 'AUSTRIA', 16),
    ('AZ', 'AZERBAIYAN', 17),
    ('BS', 'BAHAMAS', 18),
    ('BH', 'BAHREIN', 19),
    ('BD', 'BANGLADESH', 20),
    ('BB', 'BARBADOS', 21),
    ('BY', 'BELARUS', 22),
    ('BE', 'BELGICA', 23),
    ('BZ', 'BELICE', 24),
    ('BJ', 'BENIN', 25),
    ('BM', 'BERMUDAS', 26),
    ('BT', 'BHUTAN', 27),
    ('BO', 'BOLIVIA', 28),
    ('BA', 'BOSNIA Y HERZEGOVINA', 29),
    ('BW', 'BOTSUANA', 30),
    ('BR', 'BRASIL', 31),
    ('BN', 'BRUNEI', 32),
    ('BG', 'BULGARIA', 33),
    ('BF', 'BURKINA FASO', 34),
    ('BI', 'BURUNDI', 35),
    ('CV', 'CABO VERDE', 36),
    ('KH', 'CAMBOYA', 37),
    ('CM', 'CAMERUN', 38),
    ('CA', 'CANADA', 39),
    ('TD', 'CHAD', 40),
    ('CZ', 'CHEQUIA', 41),
    ('CL', 'CHILE', 42),
    ('CN', 'CHINA', 43),
    ('CY', 'CHIPRE', 44),
    ('CP', 'CLIPPERTON', 45),
    ('CO', 'COLOMBIA', 46),
    ('KM', 'COMORAS', 47),
    ('CG', 'CONGO', 48),
    ('KP', 'COREA DEL NORTE', 49),
    ('KR', 'COREA DEL SUR', 50),
    ('CI', 'COSTA DE MARFIL', 51),
    ('CR', 'COSTA RICA', 52),
    ('HR', 'CROACIA', 53),
    ('CU', 'CUBA', 54),
    ('CW', 'CURAZAO', 55),
    ('DK', 'DINAMARCA', 56),
    ('DM', 'DOMINICA', 57),
    ('EC', 'ECUADOR', 58),
    ('EG', 'EGIPTO', 59),
    ('SV', 'EL SALVADOR', 60),
    ('AE', 'EMIRATOS ARABES UNIDOS', 61),
    ('ER', 'ERITREA', 62),
    ('SK', 'ESLOVAQUIA', 63),
    ('SI', 'ESLOVENIA', 64),
    ('ES', 'ESPAÑA', 65),
    ('US', 'ESTADOS UNIDOS', 66),
    ('EE', 'ESTONIA', 67),
    ('ET', 'ETIOPIA', 68),
    ('PH', 'FILIPINAS', 69),
    ('FI', 'FINLANDIA', 70),
    ('FJ', 'FIYI', 71),
    ('FR', 'FRANCIA', 72),
    ('GA', 'GABON', 73),
    ('GM', 'GAMBIA', 74),
    ('GE', 'GEORGIA', 75),
    ('GS', 'GEORGIA DEL SUR E ISLAS SANDWICH DEL SUR', 76),
    ('GH', 'GHANA', 77),
    ('GI', 'GIBRALTAR', 78),
    ('GD', 'GRANADA', 79),
    ('EL', 'GRECIA', 80),
    ('GL', 'GROENLANDIA', 81),
    ('GP', 'GUADALUPE', 82),
    ('GU', 'GUAM', 83),
    ('GT', 'GUATEMALA', 84),
    ('GF', 'GUAYANA FRANCESA', 85),
    ('GG', 'GUERNESEY', 86),
    ('GN', 'GUINEA', 87),
    ('GQ', 'GUINEA ECUATORIAL', 88),
    ('GW', 'GUINEA-BISSAU', 89),
    ('GY', 'GUYANA', 90),
    ('HT', 'HAITI', 91),
    ('HN', 'HONDURAS', 92),
    ('HK', 'HONG KONG', 93),
    ('HU', 'HUNGRIA', 94),
    ('IN', 'INDIA', 95),
    ('ID', 'INDONESIA', 96),
    ('IR', 'IRAN', 97),
    ('IQ', 'IRAQ', 98),
    ('IE', 'IRLANDA', 99),
    ('BV', 'ISLA BOUVET', 100),
    ('CX', 'ISLA CHRISTMAS', 101),
    ('IM', 'ISLA DE MAN', 102),
    ('NF', 'ISLA NORFOLK', 103),
    ('IS', 'ISLANDIA', 104),
    ('AX', 'ISLAS ÅLAND', 105),
    ('KY', 'ISLAS CAIMAN', 106),
    ('CC', 'ISLAS COCOS', 107),
    ('CK', 'ISLAS COOK', 108),
    ('FO', 'ISLAS FEROE', 109),
    ('HM', 'ISLAS HEARD Y MCDONALD', 110),
    ('FK', 'ISLAS MALVINAS', 111),
    ('MP', 'ISLAS MARIANAS DEL NORTE', 112),
    ('MH', 'ISLAS MARSHALL', 113),
    ('UM', 'ISLAS MENORES ALEJADAS DE LOS ESTADOS UNIDOS', 114),
    ('PN', 'ISLAS PITCAIRN', 115),
    ('SB', 'ISLAS SALOMON', 116),
    ('TC', 'ISLAS TURCAS Y CAICOS', 117),
    ('VG', 'ISLAS VIRGENES BRITANICAS', 118),
    ('VI', 'ISLAS VIRGENES DE LOS ESTADOS UNIDOS', 119),
    ('IL', 'ISRAEL', 120),
    ('IT', 'ITALIA', 121),
    ('JM', 'JAMAICA', 122),
    ('JP', 'JAPON', 123),
    ('JE', 'JERSEY', 124),
    ('JO', 'JORDANIA', 125),
    ('KZ', 'KAZAJSTAN', 126),
    ('KE', 'KENIA', 127),
    ('KG', 'KIRGUISTAN', 128),
    ('KI', 'KIRIBATI', 129),
    ('XK', 'KOSOVO', 130),
    ('KW', 'KUWAIT', 131),
    ('LA', 'LAOS', 132),
    ('LS', 'LESOTHO', 133),
    ('LV', 'LETONIA', 134),
    ('LB', 'LIBANO', 135),
    ('LR', 'LIBERIA', 136),
    ('LY', 'LIBIA', 137),
    ('LI', 'LIECHTENSTEIN', 138),
    ('LT', 'LITUANIA', 139),
    ('LU', 'LUXEMBURGO', 140),
    ('MO', 'MACAO', 141),
    ('MK', 'MACEDONIA', 142),
    ('MG', 'MADAGASCAR', 143),
    ('MY', 'MALASIA', 144),
    ('MW', 'MALAWI', 145),
    ('MV', 'MALDIVAS', 146),
    ('ML', 'MALI', 147),
    ('MT', 'MALTA', 148),
    ('MA', 'MARRUECOS', 149),
    ('MQ', 'MARTINICA', 150),
    ('MU', 'MAURICIO', 151),
    ('MR', 'MAURITANIA', 152),
    ('YT', 'MAYOTTE', 153),
    ('MX', 'MEXICO', 154),
    ('FM', 'MICRONESIA', 155),
    ('MD', 'MOLDOVA', 156),
    ('MC', 'MONACO', 157),
    ('MN', 'MONGOLIA', 158),
    ('ME', 'MONTENEGRO', 159),
    ('MS', 'MONTSERRAT', 160),
    ('MZ', 'MOZAMBIQUE', 161),
    ('MM', 'MYANMAR', 162),
    ('NA', 'NAMIBIA', 163),
    ('NR', 'NAURU', 164),
    ('NP', 'NEPAL', 165),
    ('NI', 'NICARAGUA', 166),
    ('NE', 'NIGER', 167),
    ('NG', 'NIGERIA', 168),
    ('NU', 'NIUE', 169),
    ('NO', 'NORUEGA', 170),
    ('NC', 'NUEVA CALEDONIA', 171),
    ('NZ', 'NUEVA ZELANDA', 172),
    ('OM', 'OMAN', 173),
    ('NL', 'PAISES BAJOS', 174),
    ('PK', 'PAKISTAN', 175),
    ('PW', 'PALAOS', 176),
    ('PA', 'PANAMA', 177),
    ('PG', 'PAPUA NUEVA GUINEA', 178),
    ('PY', 'PARAGUAY', 179),
    ('PE', 'PERU', 180),
    ('PF', 'POLINESIA FRANCESA', 181),
    ('PL', 'POLONIA', 182),
    ('PT', 'PORTUGAL', 183),
    ('PR', 'PUERTO RICO', 184),
    ('QA', 'QATAR', 185),
    ('UK', 'REINO UNIDO', 186),
    ('CF', 'REPUBLICA CENTROAFRICANA', 187),
    ('CD', 'REPUBLICA DEMOCRATICA DEL CONGO', 188),
    ('DO', 'REPUBLICA DOMINICANA', 189),
    ('RE', 'REUNION', 190),
    ('RW', 'RUANDA', 191),
    ('RO', 'RUMANIA', 192),
    ('RU', 'RUSIA', 193),
    ('EH', 'SAHARA OCCIDENTAL', 194),
    ('WS', 'SAMOA', 195),
    ('AS', 'SAMOA AMERICANA', 196),
    ('BL', 'SAN BARTOLOME', 197),
    ('KN', 'SAN CRISTOBAL Y NIEVES', 198),
    ('SM', 'SAN MARINO', 199),
    ('MF', 'SAN MARTIN', 200),
    ('PM', 'SAN PEDRO Y MIQUELON', 201),
    ('VC', 'SAN VICENTE Y LAS GRANADINAS', 202),
    ('SH', 'SANTA ELENA', 203),
    ('LC', 'SANTA LUCIA', 204),
    ('VA', 'SANTA SEDE / ESTADO DE LA CIUDAD DEL VATICANO', 205),
    ('ST', 'SANTO TOME Y PRINCIPE', 206),
    ('SN', 'SENEGAL', 207),
    ('RS', 'SERBIA', 208),
    ('SC', 'SEYCHELLES', 209),
    ('SL', 'SIERRA LEONA', 210),
    ('SG', 'SINGAPUR', 211),
    ('SY', 'SIRIA', 212),
    ('SO', 'SOMALIA', 213),
    ('LK', 'SRI LANKA', 214),
    ('SZ', 'SUAZILANDIA', 215),
    ('ZA', 'SUDAFRICA', 216),
    ('SD', 'SUDAN', 217),
    ('SE', 'SUECIA', 218),
    ('CH', 'SUIZA', 219),
    ('SR', 'SURINAM', 220),
    ('SJ', 'SVALBARD Y JAN MAYEN', 221),
    ('TH', 'TAILANDIA', 222),
    ('TW', 'TAIWAN', 223),
    ('TZ', 'TANZANIA', 224),
    ('TJ', 'TAYIKISTAN', 225),
    ('IO', 'TERRITORIO BRITANICO DEL OCEANO INDICO', 226),
    ('TF', 'TERRITORIOS AUSTRALES FRANCESES', 227),
    ('PS', 'TERRITORIOS PALESTINOS', 228),
    ('TL', 'TIMOR ORIENTAL', 229),
    ('TG', 'TOGO', 230),
    ('TK', 'TOKELAU', 231),
    ('TO', 'TONGA', 232),
    ('TT', 'TRINIDAD Y TOBAGO', 233),
    ('TN', 'TUNEZ', 234),
    ('TM', 'TURKMENISTAN', 235),
    ('TR', 'TURQUIA', 236),
    ('TV', 'TUVALU', 237),
    ('UA', 'UCRANIA', 238),
    ('UG', 'UGANDA', 239),
    ('UY', 'URUGUAY', 240),
    ('UZ', 'UZBEKISTAN', 241),
    ('VU', 'VANUATU', 242),
    ('VE', 'VENEZUELA', 243),
    ('VN', 'VIETNAM', 244),
    ('WF', 'WALLIS Y FUTUNA', 245),
    ('YE', 'YEMEN', 246),
    ('DJ', 'YIBUTI', 247),
    ('ZM', 'ZAMBIA', 248),
    ('ZW', 'ZIMBABUE', 249)
) as v(clave, descripcion, orden)
where c.codigo = 'pais'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- prioridad · 2 valores · FedatarioPoder_v4_3.xlsm, hoja Combos, columna 28
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'NORMAL', 1),
    ('2', '24 HORAS CON OPERACIONES', 2)
) as v(clave, descripcion, orden)
where c.codigo = 'prioridad'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipo_alerta · 19 valores · FedatarioPoder_v4_3.xlsm, hoja Combos, columna 1
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('100', 'Sin alerta.', 1),
    ('3501', 'Los sujetos o partes involucradas se rehúsan a proporcionar documentos personales que los identifiquen.', 2),
    ('3502', 'La operación no es acorde con la actividad económica o giro mercantil declarado por el cliente.', 3),
    ('3503', 'Hay indicios, o certeza, que los sujetos o partes involucradas no están actuando en nombre propio y están tratando de ocultar la identidad del beneficiario o controlador real.', 4),
    ('3504', 'La información y documentación presentada por las partes involucradas es inconsistente o de difícil verificación por parte del Sujeto Obligado.', 5),
    ('3505', 'Los sujetos o partes involucradas intentan sobornar, extorsionar o amenazan con el fin de realizar la operación fuera de los parámetros establecidos, o con la finalidad de evitar el envío del Aviso.', 6),
    ('3506', 'De acuerdo con medios informativos u otras fuentes de información pública, se tiene conocimiento o sospecha de que el cliente, un familiar o persona relacionada, está vinculado con actividades ilícitas o se encuentra bajo proceso de investigación.', 7),
    ('3507', 'El cliente o partes involucradas no quiere(n) ser relacionado(s) con la operación realizada.', 8),
    ('3508', 'Los sujetos o partes involucradas realizan múltiples operaciones en un periodo muy corto de tiempo sin justificación aparente.', 9),
    ('3509', 'Los sujetos o partes involucradas hacen uso de un intermediario (ejemplo: apoderado o representante legal) para realizar la operación o acto sin que exista una causa que lo justifique.', 10),
    ('3510', 'El cliente desea liquidar la operación con monedas virtuales.', 11),
    ('3511', 'Se constituye una Sociedad por Acciones Simplificadas (SAS), en la que no hay forma de corroborar la identidad de los accionistas.', 12),
    ('3512', 'Hay indicios, o certeza de que una de las partes involucradas está siendo presionada para que realice la operación.', 13),
    ('3513', 'Hay indicios de que existe suplantación de identidad de alguna de las partes involucradas en la operación.', 14),
    ('3514', 'El cliente realiza múltiples operaciones de constitución de personas morales en un periodo corto de tiempo.', 15),
    ('3515', 'Se tiene conocimiento de que otro notario se negó a realizar la operación.', 16),
    ('3516', 'El pago de la operación es realizado por un tercero sin relación aparente con el cliente o alguna de las partes involucradas.', 17),
    ('3517', 'El cliente (personas físicas y morales), declara una ocupación o actividad distinta a la que aparece en su Cédula de Identificación Fiscal.', 18),
    ('9999', 'Otra alerta.', 19)
) as v(clave, descripcion, orden)
where c.codigo = 'tipo_alerta'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipo_de_bien_donado · 8 valores · FedatarioAvaluo_v4_3.xlsm, hoja Combos, columna 86
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('2', 'Vehículo terrestre', 1),
    ('3', 'Vehículo aéreo', 2),
    ('4', 'Vehículo marítimo', 3),
    ('5', 'Priedras Preciosas', 4),
    ('6', 'Metales Preciosos', 5),
    ('7', 'Joyas o relojes', 6),
    ('8', 'Obras de arte o antigüedades', 7),
    ('99', 'Otro (Especificar)', 8)
) as v(clave, descripcion, orden)
where c.codigo = 'tipo_de_bien_donado'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipo_de_cesion · 4 valores · FedatarioCesion_v4_3.xlsm, hoja Combos, columna 79
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('3', 'Cesión de derechos del fideicomitente a título oneroso', 1),
    ('4', 'Cesión de derechos del fideicomitente a título gratuito', 2),
    ('5', 'Cesión de derechos del fideicomisario a título oneroso', 3),
    ('6', 'Cesión de derechos del fideicomisario a título gratuito', 4)
) as v(clave, descripcion, orden)
where c.codigo = 'tipo_de_cesion'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipo_de_fideicomiso · 4 valores · FedatarioConstitucionFid_v4_8.xlsm, hoja Combos, columna 69
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Traslativo de Dominio', 1),
    ('2', 'Garantía sobre Inmuebles', 2),
    ('3', 'Traslativo de domino y garantía sobre inmuebles', 3),
    ('4', 'Otro (Especificar)', 4)
) as v(clave, descripcion, orden)
where c.codigo = 'tipo_de_fideicomiso'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipo_de_modificacion_patrimonial · 3 valores · FedatarioModifPatrimonial_v4_4.xlsm, hoja Combos, columna 69
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Aumento', 1),
    ('2', 'Disminución', 2),
    ('3', 'Sin modificación', 3)
) as v(clave, descripcion, orden)
where c.codigo = 'tipo_de_modificacion_patrimonial'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipo_de_movimiento · 4 valores · FedatarioConstitucionFid_v4_8.xlsm, hoja Combos, columna 67
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Constitucion', 1),
    ('2', 'Modificación - Aumento del patrimonio', 2),
    ('3', 'Modificación - Disminución del patrimonio', 3),
    ('6', 'Modificación de incorporación y/o destitución sin cambios al patrimonio', 4)
) as v(clave, descripcion, orden)
where c.codigo = 'tipo_de_movimiento'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipo_de_persona_moral · 16 valores · FedatarioConstitucionPM_v4_4.xlsm, hoja Combos, columna 64
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Asociación Civil (A.C.)', 1),
    ('2', 'Sociedad Civil (S.C.)', 2),
    ('3', 'Sociedad en Nombre Colectivo', 3),
    ('4', 'Comandita Simple (S. en C.)', 4),
    ('5', 'Comandita por Acciones (S. en C. por A.)', 5),
    ('6', 'Sociedad Anónima (S.A.)', 6),
    ('7', 'Sociedad de Responsabilidad Limitada (S. de R. L.)', 7),
    ('8', 'Sociedad Cooperativa Limitada (S. C. L.)', 8),
    ('9', 'Sociedad Cooperativa Suplementada (S. C. S.)', 9),
    ('11', 'Sociedad Mutualista de Seguros de Vida o de Daño', 10),
    ('12', 'Sociedad Nacional de Crédito y/o Institución Bancaria de Desarrollo (S. N. C.)', 11),
    ('13', 'Sociedad de Solidaridad Social (S. de S. S.)', 12),
    ('14', 'Sociedad de Producción Rural de Responsabilidad Limitada', 13),
    ('15', 'Sociedad de Producción Rural de Responsabilidad Ilimitada', 14),
    ('16', 'Sociedad de Producción Rural de Responsabilidad Suplementada', 15),
    ('99', 'Otra (especificar)', 16)
) as v(clave, descripcion, orden)
where c.codigo = 'tipo_de_persona_moral'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipo_de_poder · 3 valores · FedatarioPoder_v4_3.xlsm, hoja Combos, columna 64
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'de administración', 1),
    ('2', 'de dominio', 2),
    ('3', 'de administración y de dominio', 3)
) as v(clave, descripcion, orden)
where c.codigo = 'tipo_de_poder'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipo_fusion · 2 valores · FedatarioFusion_v4_3.xlsm, hoja Combos, columna 64
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Absorción', 1),
    ('2', 'Integración', 2)
) as v(clave, descripcion, orden)
where c.codigo = 'tipo_fusion'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipo_movimiento_fideicomisario · 3 valores · FedatarioConstitucionFid_v4_8.xlsm, hoja Combos, columna 71
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Incorporación', 1),
    ('2', 'Destitución', 2),
    ('3', 'Sin modificación', 3)
) as v(clave, descripcion, orden)
where c.codigo = 'tipo_movimiento_fideicomisario'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipo_movimiento_fideicomitente · 3 valores · FedatarioConstitucionFid_v4_8.xlsm, hoja Combos, columna 71
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Incorporación', 1),
    ('2', 'Destitución', 2),
    ('3', 'Sin modificación', 3)
) as v(clave, descripcion, orden)
where c.codigo = 'tipo_movimiento_fideicomitente'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipos_de_garantia · 14 valores · FedatarioMutuo_v4_4.xlsm, hoja Combos, columna 84
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Sin garantía', 1),
    ('2', 'Inmueble', 2),
    ('3', 'Vehículo terrestre', 3),
    ('4', 'Vehículo aéreo', 4),
    ('5', 'Vehículo marítimo', 5),
    ('6', 'Priedras Preciosas', 6),
    ('7', 'Metales Preciosos', 7),
    ('8', 'Joyas o relojes', 8),
    ('9', 'Obras de arte o antigüedades', 9),
    ('10', 'Acciones o partes sociales', 10),
    ('11', 'Derechos fiduciarios', 11),
    ('12', 'Derechos de crédito', 12),
    ('15', 'Garantía Quirografaria', 13),
    ('99', 'Otro (Especificar)', 14)
) as v(clave, descripcion, orden)
where c.codigo = 'tipos_de_garantia'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipos_de_inmueble · 19 valores · FedatarioConstitucionFid_v4_8.xlsm, hoja Combos, columna 62
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Casa /Casa en condominio', 1),
    ('2', 'Departamento', 2),
    ('3', 'Edificio habitacional', 3),
    ('4', 'Edificio comercial', 4),
    ('5', 'Edificio oficinas', 5),
    ('6', 'Local comercial independiente', 6),
    ('7', 'Local en centro comercial', 7),
    ('8', 'Oficina', 8),
    ('9', 'Bodega comercial', 9),
    ('10', 'Bodega industrial', 10),
    ('11', 'Nave Industrial', 11),
    ('12', 'Terreno urbano habitacional', 12),
    ('13', 'Terreno no urbano habitacional', 13),
    ('14', 'Terreno urbano comercial o industrial', 14),
    ('15', 'Terreno no urbano comercial o industrial', 15),
    ('16', 'Terreno ejidal', 16),
    ('17', 'Rancho/Hacienda/Quinta', 17),
    ('18', 'Huerta', 18),
    ('99', 'Otro', 19)
) as v(clave, descripcion, orden)
where c.codigo = 'tipos_de_inmueble'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipos_de_operacion · 5 valores · FedatarioCompraVenta_v4_3.xlsm, hoja Combos, columna 5
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Contado', 1),
    ('2', 'Diferido o en parcialidades', 2),
    ('3', 'Dación en pago', 3),
    ('4', 'Préstamo o crédito', 4),
    ('5', 'Permuta', 5)
) as v(clave, descripcion, orden)
where c.codigo = 'tipos_de_operacion'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- tipos_de_otorgamiento · 2 valores · FedatarioMutuo_v4_4.xlsm, hoja Combos, columna 82
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
    ('1', 'Otorgamiento de Mutuo, Préstamo o Crédito sin Garantía', 1),
    ('2', 'Otorgamiento de Mutuo, Préstamo o Crédito con Garantía', 2)
) as v(clave, descripcion, orden)
where c.codigo = 'tipos_de_otorgamiento'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

-- Marca como cargados los catálogos que quedaron con valores.
update catalogo_sat c
   set version = greatest(c.version, 1),
       actualizado_en = coalesce(c.actualizado_en, now())
 where c.codigo in ('actividad_economica', 'actividades_vulnerables', 'cargo_de_accionista', 'entidad_federativa', 'giro_mercantil', 'instrumentos_monetarios', 'monedas_o_divisas', 'motivo_cosntitucion_modificacion', 'pais', 'prioridad', 'tipo_alerta', 'tipo_de_bien_donado', 'tipo_de_cesion', 'tipo_de_fideicomiso', 'tipo_de_modificacion_patrimonial', 'tipo_de_movimiento', 'tipo_de_persona_moral', 'tipo_de_poder', 'tipo_fusion', 'tipo_movimiento_fideicomisario', 'tipo_movimiento_fideicomitente', 'tipos_de_garantia', 'tipos_de_inmueble', 'tipos_de_operacion', 'tipos_de_otorgamiento')
   and exists (select 1 from catalogo_valor v where v.catalogo_id = c.id and v.vigente_hasta is null);

-- =====================================================================
-- Seed 15 · Clave de actividad vulnerable de las organizaciones demo
-- =====================================================================
-- <clave_actividad> (campo 2.3 del layout) es una de las tres claves sin las
-- cuales el XML no pasa validación. Ya no hay que adivinarla: viene del
-- catálogo de actividades vulnerables que publica el SAT en la plantilla
-- 0InformeEnCeros.xlsm — "FEP, FE PUBLICA" y "AVI, OPERACIONES CON ACTIVOS
-- VIRTUALES" (ver seed 14).
--
-- Las otras dos —clave_sujeto_obligado y clave_entidad_colegiada— NO se
-- siembran: el SAT las asigna a cada sujeto obligado al inscribirse en el
-- padrón, no se derivan de nada, y ponerles un valor plausible sería fabricar
-- la identidad con la que se reporta. Se quedan en null y la pantalla de
-- pendientes las reclama.
-- =====================================================================

update organizations
   set clave_actividad = 'FEP'
 where id = '12121212-1212-1212-1212-121212121212'
   and clave_actividad is null;

update organizations
   set clave_actividad = 'AVI'
 where id = '11111111-1111-1111-1111-111111111111'
   and clave_actividad is null;

-- Comprobación: las claves sembradas existen en el catálogo.
do $$
begin
  if exists (
    select 1 from organizations o
    where o.clave_actividad is not null
      and not public.clave_valida_en_catalogo('actividades_vulnerables', o.clave_actividad)
  ) then
    raise exception 'Alguna organización quedó con una clave_actividad fuera del catálogo';
  end if;
end $$;

-- =====================================================================
-- Verificación
-- =====================================================================
do $$
declare
  v_ok int := 0;
  v_n int;
  v_txt text;
begin
  -- 1. las dos tablas existen
  if to_regclass('public.catalogo_sat') is null or to_regclass('public.catalogo_valor') is null then
    raise exception 'FALLA 1: faltan las tablas de catálogo';
  end if;
  v_ok := v_ok + 1;

  -- 2. los catálogos del layout quedaron registrados
  select count(*) into v_n from catalogo_sat where layout = 'fep';
  if v_n < 26 then raise exception 'FALLA 2: sólo % catálogos registrados', v_n; end if;
  v_ok := v_ok + 1;

  -- 3. 25 de 26 traen valores; el de códigos postales se carga aparte
  select count(*) into v_n from v_catalogos_estado where valores_vigentes > 0;
  if v_n <> 25 then raise exception 'FALLA 3: % catálogos con valores (esperaba 25)', v_n; end if;
  v_ok := v_ok + 1;

  select valores_vigentes into v_n from v_catalogos_estado where codigo = 'codigos_postales_de_sepomex';
  if v_n <> 0 then raise exception 'FALLA 3b: códigos postales no debería venir sembrado'; end if;
  v_ok := v_ok + 1;

  -- 4. los que la notaría toca todos los días, con su cuenta exacta
  select valores_vigentes into v_n from v_catalogos_estado where codigo = 'entidad_federativa';
  if v_n <> 32 then raise exception 'FALLA 4: entidad_federativa tiene % valores', v_n; end if;
  select valores_vigentes into v_n from v_catalogos_estado where codigo = 'pais';
  if v_n <> 249 then raise exception 'FALLA 4b: pais tiene % valores', v_n; end if;
  v_ok := v_ok + 1;

  -- 5. la clave lleva su descripción, no un número suelto
  select descripcion into v_txt from v_catalogo_vigente
   where catalogo = 'entidad_federativa' and clave = '14';
  if v_txt <> 'JALISCO' then raise exception 'FALLA 5: la clave 14 dice %', v_txt; end if;
  select descripcion into v_txt from v_catalogo_vigente where catalogo = 'pais' and clave = 'MX';
  if v_txt <> 'MEXICO' then raise exception 'FALLA 5b: la clave MX dice %', v_txt; end if;
  v_ok := v_ok + 1;

  -- 6. toda clave cargada cumple el patrón declarado en el registro
  select count(*) into v_n
    from catalogo_valor v join catalogo_sat c on c.id = v.catalogo_id
   where c.clave_patron is not null and v.clave !~ c.clave_patron;
  if v_n <> 0 then raise exception 'FALLA 6: % claves no cumplen su patrón', v_n; end if;
  v_ok := v_ok + 1;

  -- 7. la restricción de no traslape está puesta
  if not exists (select 1 from pg_constraint where conname = 'catalogo_valor_sin_traslape') then
    raise exception 'FALLA 7: falta catalogo_valor_sin_traslape';
  end if;
  v_ok := v_ok + 1;

  -- 8. un catálogo sin cargar no valida ninguna clave; uno cargado sí
  if public.clave_valida_en_catalogo('codigos_postales_de_sepomex', '44100') then
    raise exception 'FALLA 8: validó contra un catálogo vacío';
  end if;
  if not public.clave_valida_en_catalogo('tipo_de_poder', '3') then
    raise exception 'FALLA 8b: no reconoce el poder de administración y dominio';
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

  -- 11. ninguna organización quedó con una clave de actividad fuera del
  -- catálogo. No se exige que existan las organizaciones demo: este bundle
  -- también corre en un despliegue que no las tenga.
  select count(*) into v_n from organizations o
   where o.clave_actividad is not null
     and not public.clave_valida_en_catalogo('actividades_vulnerables', o.clave_actividad);
  if v_n <> 0 then raise exception 'FALLA 11: % organización(es) con clave_actividad inválida', v_n; end if;
  v_ok := v_ok + 1;

  select count(*) into v_n from organizations where clave_actividad is not null;
  raise notice 'Organizaciones con clave de actividad: %', v_n;

  raise notice 'OK · % pruebas pasaron', v_ok;
end $$;

-- La API de gestión de Supabase NO devuelve los RAISE NOTICE: por ahí este
-- bundle se veía como un `[]` indistinguible de "no hizo nada". El bloque de
-- arriba revienta y revierte si algo falla, así que ver esta tabla ya significa
-- que las comprobaciones pasaron.
select 'catálogos del layout' as bundle,
       (select count(*) from v_catalogos_estado where valores_vigentes > 0)::text
         || ' de ' || (select count(*) from v_catalogos_estado)::text
         || ' catálogos con valores' as catalogos,
       (select sum(valores_vigentes) from v_catalogos_estado)::text || ' claves cargadas' as claves,
       (select descripcion from v_catalogo_vigente
         where catalogo = 'entidad_federativa' and clave = '14') as prueba_jalisco,
       (select count(*) from organizations where clave_actividad is not null)::text
         || ' organización(es) con clave de actividad' as padron,
       '12 comprobaciones pasaron' as verificacion;

commit;
