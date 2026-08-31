-- =====================================================================
-- Ikán · Migration 0012 · Listas de plataforma (personas y entidades)
-- =====================================================================
-- Saca las listas restrictivas del ámbito de la organización.
--
-- PROBLEMA QUE RESUELVE: las tablas de la migration 0003
-- (country_risk_list, entity_risk_list, sanctions_list_entry) llevan
-- `organization_id not null`, así que cada organización guarda su propia
-- copia de las MISMAS listas globales. El seed 08 lo dejó documentado:
--   «El motor filtra country_risk_list por organización; la org notaría
--    necesita sus propias filas para que XII-03 dispare.»
-- Con veinte notarías eso es veinte copias de la misma verdad y veinte
-- oportunidades de desincronizarse.
--
-- Aquí el catálogo se mantiene UNA vez, lo administra Kawiil
-- (platform_admin, migration 0008) y lo consume toda organización sin
-- importar su actividad.
--
-- ALCANCE DE ESTA MIGRATION: personas y entidades. Las jurisdicciones
-- (GAFI) y la migración de country_risk_list van en la siguiente, para
-- mantener el bloque revisable.
--
-- ---------------------------------------------------------------------
-- Los dos patrones de actualización (la decisión de diseño central)
-- ---------------------------------------------------------------------
-- Las fuentes NO se actualizan todas igual, y forzarlas al mismo molde
-- rompería una de las dos:
--
--   'snapshot'    OFAC, ONU, UE, SAT 69-B. Publican el archivo COMPLETO.
--                 La carga nueva reemplaza el estado anterior y las bajas
--                 se deducen por diferencia: lo que ya no viene en el
--                 archivo se desactiva.
--
--   'movimientos' Lista de Personas Bloqueadas de la UIF. No publica un
--                 archivo que se reemplace: emite OFICIOS. Un oficio da de
--                 alta a una persona, otro la da de baja. El estado vigente
--                 es el resultado de aplicar los movimientos en orden.
--
-- Por eso `lista_movimiento` es la bitácora inmutable de lo que pasó y
-- `lista_registro` es el estado vigente derivado. Una baja NUNCA borra:
-- desactiva y deja el rastro. Eso es lo que permite sostener «al 18 de
-- agosto de 2026 esta persona SÍ estaba en la lista», que es la evidencia
-- que le sirve al notario aunque la persona salga de la lista después.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Normalización de nombres (para cotejo)
-- ---------------------------------------------------------------------
-- Inmutable a propósito: se usa en una columna generada. Quita acentos,
-- pasa a mayúsculas y colapsa todo lo que no sea alfanumérico. Es cotejo
-- básico, NO cotejo difuso: el puntaje de similitud es del screening, no
-- de esta función.
create or replace function public.normalizar_nombre(p_texto text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      regexp_replace(
        upper(translate(coalesce(p_texto, ''),
          'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
          'AAAAAEEEEIIIIOOOOOUUUUNCAAAAAEEEEIIIIOOOOOUUUUNC')),
        '[^A-Z0-9]+', ' ', 'g')
    ),
  '')
$$;

comment on function public.normalizar_nombre(text) is
  'Normaliza un nombre para cotejo exacto: sin acentos, en mayúsculas, sin puntuación. No hace cotejo difuso.';

-- ---------------------------------------------------------------------
-- 1. Catálogo de fuentes
-- ---------------------------------------------------------------------
do $$ begin
  create type modo_actualizacion_lista as enum ('snapshot', 'movimientos');
exception when duplicate_object then null; end $$;

do $$ begin
  create type naturaleza_lista as enum ('sancion_aml', 'fiscal', 'jurisdiccion', 'pep', 'interna');
exception when duplicate_object then null; end $$;

create table if not exists lista_fuente (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  autoridad text not null,

  -- Distinguir la naturaleza NO es cosmético: el 69-B del SAT es materia
  -- FISCAL (operaciones simuladas), no una sanción de lavado. Mezclarlos
  -- llevaría al OC a tratar un EFOS como si fuera un sancionado OFAC.
  naturaleza naturaleza_lista not null,
  modo_actualizacion modo_actualizacion_lista not null,

  url_oficial text,
  -- Propuesta técnica, NO valor regulatorio. La confirma Kawiil-Cumplimiento.
  frecuencia_objetivo text,
  -- Si es true, toda organización la consume y no puede desactivarla.
  obligatoria boolean not null default true,
  activa boolean not null default true,
  notas text,
  creado_en timestamptz not null default now()
);

comment on table lista_fuente is
  'Catálogo de plataforma: qué listas existen, quién las emite y cómo se actualizan. Una fila por fuente, no por registro.';

-- ---------------------------------------------------------------------
-- 2. Cargas
-- ---------------------------------------------------------------------
-- Cada carga agrupa los movimientos que entraron juntos: un archivo, o una
-- captura manual en la consola de Kawiil.
do $$ begin
  create type tipo_carga_lista as enum ('archivo', 'captura_manual', 'api');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_carga_lista as enum ('borrador', 'aplicada', 'revertida');
exception when duplicate_object then null; end $$;

create table if not exists lista_carga (
  id uuid primary key default gen_random_uuid(),
  fuente_id uuid not null references lista_fuente(id) on delete restrict,
  tipo tipo_carga_lista not null,
  estado estado_carga_lista not null default 'borrador',

  -- Cuándo lo publicó la autoridad, NO cuándo lo cargamos nosotros. Es la
  -- fecha que sirve como evidencia.
  fecha_publicacion_fuente date,

  -- El original en Storage privado, con su huella. Sin archivo no hay
  -- evidencia de qué se cargó; para captura manual va nulo.
  archivo_path text,
  archivo_hash text,

  num_movimientos int not null default 0,
  cargada_por uuid references auth.users(id),
  cargada_en timestamptz not null default now(),
  notas text
);

create index if not exists idx_lista_carga_fuente on lista_carga (fuente_id, cargada_en desc);

comment on table lista_carga is
  'Cada carga de lista: un archivo o una captura manual. Agrupa los movimientos que entraron juntos.';

-- ---------------------------------------------------------------------
-- 3. Movimientos (la bitácora inmutable)
-- ---------------------------------------------------------------------
do $$ begin
  create type accion_movimiento_lista as enum ('alta', 'baja');
exception when duplicate_object then null; end $$;

create table if not exists lista_movimiento (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references lista_carga(id) on delete cascade,
  accion accion_movimiento_lista not null,

  -- Identificación de la persona o entidad
  tipo_entidad text not null default 'persona'
    check (tipo_entidad in ('persona', 'empresa', 'embarcacion', 'aeronave')),
  nombre text not null,
  rfc text,
  curp text,
  identificadores jsonb not null default '{}',
  pais text,

  -- El oficio que respalda el movimiento. En la lista de la UIF es EL dato
  -- que justifica por qué alguien entró o salió; sin él la baja no es
  -- defendible ante una revisión.
  oficio_numero text,
  oficio_fecha date,
  motivo text,

  -- El registro al que afectó. Lo resuelve el trigger, no quien inserta.
  registro_id uuid,
  aplicado_en timestamptz not null default now()
);

create index if not exists idx_lista_movimiento_carga on lista_movimiento (carga_id);
create index if not exists idx_lista_movimiento_registro on lista_movimiento (registro_id, aplicado_en desc);
create index if not exists idx_lista_movimiento_oficio on lista_movimiento (oficio_numero) where oficio_numero is not null;

comment on table lista_movimiento is
  'Bitácora inmutable de altas y bajas, con el oficio que las respalda. No se actualiza ni se borra: se agrega un movimiento contrario.';

-- ---------------------------------------------------------------------
-- 4. Estado vigente
-- ---------------------------------------------------------------------
create table if not exists lista_registro (
  id uuid primary key default gen_random_uuid(),
  fuente_id uuid not null references lista_fuente(id) on delete cascade,

  tipo_entidad text not null default 'persona',
  nombre text not null,
  -- Columna generada: es la llave de cotejo y no puede quedar desalineada
  -- del nombre. Por eso se calcula, no se escribe.
  nombre_normalizado text generated always as (public.normalizar_nombre(nombre)) stored,
  nombres_alternos text[] not null default '{}',

  rfc text,
  curp text,
  identificadores jsonb not null default '{}',
  pais text,

  -- Una baja desactiva; NUNCA borra. El historial es la evidencia.
  activo boolean not null default true,

  -- Copia desnormalizada del último movimiento de cada tipo, para poder
  -- mostrar «entró por el oficio X, salió por el oficio Y» sin join.
  alta_oficio text,
  alta_fecha date,
  baja_oficio text,
  baja_fecha date,

  raw_payload jsonb,
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_lista_registro_fuente_activo on lista_registro (fuente_id, activo);
create index if not exists idx_lista_registro_nombre on lista_registro (nombre_normalizado);
create index if not exists idx_lista_registro_rfc on lista_registro (rfc) where rfc is not null;

comment on table lista_registro is
  'Estado vigente de cada persona o entidad en una lista. Derivado de lista_movimiento por trigger; no se escribe a mano.';
comment on column lista_registro.activo is
  'false = dada de baja. La fila se conserva para poder sostener que en una fecha pasada SÍ estaba listada.';

-- ---------------------------------------------------------------------
-- 5. Aplicación de movimientos
-- ---------------------------------------------------------------------
-- Trigger BEFORE INSERT: al insertar un movimiento se resuelve a qué
-- registro afecta y se actualiza el estado vigente. Misma filosofía que la
-- bitácora de la 0007: el estado lo mantiene la base, no el front, así que
-- cualquier ruta que cargue una lista queda registrada.
create or replace function public.aplicar_movimiento_lista()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fuente uuid;
  v_registro uuid;
  v_rfc text := nullif(upper(btrim(coalesce(new.rfc, ''))), '');
  v_nombre_norm text := public.normalizar_nombre(new.nombre);
begin
  select fuente_id into v_fuente from lista_carga where id = new.carga_id;
  if v_fuente is null then
    raise exception 'La carga % no existe', new.carga_id;
  end if;

  new.rfc := v_rfc;

  -- Cotejo: por RFC cuando lo hay (es el identificador fuerte), por nombre
  -- normalizado cuando no. Nunca entre fuentes distintas: una persona en la
  -- lista de la UIF y otra en OFAC son registros separados aunque coincidan.
  select r.id into v_registro
  from lista_registro r
  where r.fuente_id = v_fuente
    and (
      (v_rfc is not null and r.rfc = v_rfc)
      or (v_rfc is null and r.rfc is null and r.nombre_normalizado = v_nombre_norm)
    )
  order by r.activo desc, r.actualizado_en desc
  limit 1;

  if new.accion = 'alta' then
    if v_registro is null then
      insert into lista_registro (
        fuente_id, tipo_entidad, nombre, rfc, curp, identificadores, pais,
        activo, alta_oficio, alta_fecha, raw_payload
      ) values (
        v_fuente, new.tipo_entidad, new.nombre, v_rfc, new.curp,
        new.identificadores, new.pais,
        true, new.oficio_numero, new.oficio_fecha, to_jsonb(new)
      )
      returning id into v_registro;
    else
      -- Reactivación o actualización de datos. Se limpia el rastro de baja
      -- porque el registro vuelve a estar vigente; el movimiento anterior
      -- sigue en la bitácora.
      update lista_registro set
        nombre = new.nombre,
        curp = coalesce(new.curp, curp),
        identificadores = case when new.identificadores = '{}'::jsonb
                               then identificadores else new.identificadores end,
        pais = coalesce(new.pais, pais),
        activo = true,
        alta_oficio = coalesce(new.oficio_numero, alta_oficio),
        alta_fecha = coalesce(new.oficio_fecha, alta_fecha),
        baja_oficio = null,
        baja_fecha = null,
        actualizado_en = now()
      where id = v_registro;
    end if;

  else -- baja
    if v_registro is null then
      raise exception
        'No hay registro en esta lista que coincida con % (RFC %). Una baja sólo procede sobre alguien previamente dado de alta.',
        new.nombre, coalesce(v_rfc, 'sin RFC');
    end if;

    update lista_registro set
      activo = false,
      baja_oficio = new.oficio_numero,
      baja_fecha = new.oficio_fecha,
      actualizado_en = now()
    where id = v_registro;
  end if;

  new.registro_id := v_registro;
  return new;
end
$$;

drop trigger if exists trg_lista_movimiento on lista_movimiento;
create trigger trg_lista_movimiento
  before insert on lista_movimiento
  for each row execute function public.aplicar_movimiento_lista();

-- Mantiene el conteo de la carga al día.
create or replace function public.contar_movimientos_carga()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update lista_carga
     set num_movimientos = (select count(*) from lista_movimiento where carga_id = new.carga_id)
   where id = new.carga_id;
  return null;
end
$$;

drop trigger if exists trg_lista_carga_conteo on lista_movimiento;
create trigger trg_lista_carga_conteo
  after insert on lista_movimiento
  for each row execute function public.contar_movimientos_carga();

-- La bitácora es inmutable: corregir un error es agregar el movimiento
-- contrario, no reescribir el pasado.
create or replace function public.lista_movimiento_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'lista_movimiento es inmutable. Para corregir, registra el movimiento contrario con su oficio.';
end
$$;

drop trigger if exists trg_lista_movimiento_inmutable on lista_movimiento;
create trigger trg_lista_movimiento_inmutable
  before update or delete on lista_movimiento
  for each row execute function public.lista_movimiento_inmutable();

-- ---------------------------------------------------------------------
-- 5b. Consulta histórica: ¿estaba listada en tal fecha?
-- ---------------------------------------------------------------------
-- Es LA pregunta que le sirve al notario, y la razón de ser de la bitácora.
-- Si barrió a un compareciente en marzo, cuando la persona sí estaba
-- bloqueada, y la UIF la desbloqueó en junio, el barrido de marzo fue
-- correcto. Sin esta consulta el sistema sólo puede decir «hoy no aparece»,
-- que no es lo que se defiende en una verificación.
--
-- Se resuelve por la fecha del OFICIO, no por cuándo Kawiil lo capturó: lo
-- que importa es cuándo la autoridad lo determinó. Si un oficio no trae
-- fecha se usa la de captura, que es lo más cercano defendible.
create or replace function public.listado_en_fecha(
  p_fuente text,
  p_fecha date,
  p_rfc text default null,
  p_nombre text default null
)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select m.accion = 'alta'
       from lista_movimiento m
       join lista_registro r  on r.id = m.registro_id
       join lista_fuente  f   on f.id = r.fuente_id
      where f.codigo = p_fuente
        and (
          (p_rfc is not null and r.rfc = nullif(upper(btrim(p_rfc)), ''))
          or (p_rfc is null and p_nombre is not null
              and r.nombre_normalizado = public.normalizar_nombre(p_nombre))
        )
        and coalesce(m.oficio_fecha, m.aplicado_en::date) <= p_fecha
      order by coalesce(m.oficio_fecha, m.aplicado_en::date) desc, m.aplicado_en desc
      limit 1),
    false)
$$;

comment on function public.listado_en_fecha(text, date, text, text) is
  'Si una persona estaba en una lista en una fecha dada, según los movimientos vigentes a esa fecha. Es la evidencia que sostiene un barrido pasado.';

-- ---------------------------------------------------------------------
-- 6. Vista de consumo
-- ---------------------------------------------------------------------
-- Es lo ÚNICO que deben consultar el motor y el screening. Ninguna
-- organización guarda copias: todas leen de aquí, así que publicar un
-- movimiento lo vuelve efectivo para todos en el mismo instante.
create or replace view v_listas_vigentes
with (security_invoker = true) as
  select r.id            as registro_id,
         f.codigo        as fuente,
         f.nombre        as fuente_nombre,
         f.naturaleza,
         r.tipo_entidad,
         r.nombre,
         r.nombre_normalizado,
         r.nombres_alternos,
         r.rfc,
         r.curp,
         r.identificadores,
         r.pais,
         r.alta_oficio,
         r.alta_fecha,
         r.actualizado_en
  from lista_registro r
  join lista_fuente f on f.id = r.fuente_id
  where r.activo
    and f.activa;

comment on view v_listas_vigentes is
  'Personas y entidades actualmente listadas. Lo consultan el motor y el screening; nunca las tablas directamente.';

-- ---------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------
alter table lista_fuente enable row level security;
alter table lista_carga enable row level security;
alter table lista_movimiento enable row level security;
alter table lista_registro enable row level security;

-- Lectura para cualquier usuario autenticado: el catálogo es común a todas
-- las organizaciones, y el punto de la migration es que nadie tenga copia.
drop policy if exists "lista_fuente_select" on lista_fuente;
create policy "lista_fuente_select" on lista_fuente
  for select using (auth.uid() is not null);
drop policy if exists "lista_registro_select" on lista_registro;
create policy "lista_registro_select" on lista_registro
  for select using (auth.uid() is not null);

-- Las cargas y los movimientos son el rastro de auditoría de Kawiil: sólo
-- un admin de plataforma los ve y los escribe.
drop policy if exists "lista_carga_kawiil" on lista_carga;
create policy "lista_carga_kawiil" on lista_carga
  for all using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());
drop policy if exists "lista_movimiento_kawiil" on lista_movimiento;
create policy "lista_movimiento_kawiil" on lista_movimiento
  for all using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());

-- Escritura del catálogo y del estado: sólo Kawiil. Ninguna organización
-- cliente puede meter o sacar a alguien de una lista restrictiva.
drop policy if exists "lista_fuente_write_kawiil" on lista_fuente;
create policy "lista_fuente_write_kawiil" on lista_fuente
  for all using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());
drop policy if exists "lista_registro_write_kawiil" on lista_registro;
create policy "lista_registro_write_kawiil" on lista_registro
  for all using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());
