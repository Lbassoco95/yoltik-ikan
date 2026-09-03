-- =====================================================================
-- Ikán · Migration 0064 · Orden de origen en las cargas de lista
-- =====================================================================
-- Nace de cargar el listado completo del 69-B de verdad (14,523 registros,
-- publicación del 31 de julio de 2026) y medir qué pasaba. Salieron dos
-- problemas, uno de correctitud y otro de tiempo, y ninguno se veía sin el
-- archivo real delante.
--
-- ---------------------------------------------------------------------
-- 1. El empate que decidía quién queda bloqueado
-- ---------------------------------------------------------------------
-- En el listado completo hay 77 RFC que aparecen MÁS DE UNA VEZ, y 50 de
-- ellos con situaciones distintas. No es un error del SAT: es el historial.
-- Un contribuyente declarado definitivo que después gana un juicio aparece
-- en el listado de definitivos Y en el de sentencias favorables, y el
-- listado completo concatena los dos. El propio SAT lo dice en el nombre de
-- la segunda fila:
--
--     ABIRA & SAFFI CORPORATIVO, S. DE R.L. DE C.V. // En cumplimiento a la
--     [sentencia] ...
--
-- Las filas van juntas y en orden: primero la determinación, después su
-- resolución. Leer el archivo en el orden en que el SAT lo escribió da la
-- respuesta correcta.
--
-- El problema es que ese orden no se guardaba en ningún lado. `aplicado_en`
-- es `now()`, que dentro de una transacción es CONSTANTE: las 500 filas de
-- un lote comparten timestamp al milisegundo. Así que:
--
--   · Qué situación quedaba vigente dependía del orden en que el trigger
--     procesara las filas dentro del INSERT y de dónde cayera la frontera
--     del lote. Cambiar el tamaño de lote cambiaba el estado de 50
--     contribuyentes.
--
--   · Peor: `listado_en_fecha()` —la función que sostiene «al 18 de agosto
--     esta empresa SÍ estaba listada», que es la razón de ser de toda la
--     bitácora— ordena por `coalesce(oficio_fecha, fecha_publicacion_fuente,
--     aplicado_en)`. Para dos filas de la misma carga los tres son iguales,
--     así que el desempate era arbitrario. La evidencia salía a volados.
--
-- La diferencia no es cosmética: 33 de esos casos son
-- «definitivo → sentencia_favorable» (un tribunal lo sacó: NO bloquea) y 5
-- son «presunto → definitivo» (el SAT lo confirmó: SÍ bloquea).
--
-- Se guarda el número de fila del archivo y se usa como desempate. Esto NO
-- es inventar una regla de cumplimiento: es leer el documento de la
-- autoridad en su propio orden. Aun así queda expuesto —ver
-- `conflictos_de_carga()`— para que quien carga vea cuántos vinieron con
-- más de una situación y con cuál se quedó el sistema.
--
-- ---------------------------------------------------------------------
-- 2. El conteo que crecía al cuadrado
-- ---------------------------------------------------------------------
-- `contar_movimientos_carga` era un trigger FOR EACH ROW que por cada fila
-- hacía `count(*)` sobre los movimientos de la carga y actualizaba
-- `lista_carga`. Con 14,523 filas eso es 14,523 conteos sobre una tabla que
-- crece, y 14,523 UPDATE sobre la MISMA fila.
--
-- Medido en Postgres local, sin red: el primer lote de 500 tardó 267 ms y
-- el lote 26 tardó 3,218 ms. 56 segundos en total, degradando en línea
-- recta. En Supabase el rol `authenticated` tiene un `statement_timeout` de
-- 8 segundos, así que los últimos lotes quedaban a un pelo de abortar la
-- carga a medio camino —y `registrarCargaArchivo` revierte la carga
-- completa cuando un lote falla, así que el usuario habría esperado un
-- minuto para no cargar nada—.
--
-- Pasa a ser un trigger FOR EACH STATEMENT con tabla de transición: 30
-- conteos en vez de 14,523.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La columna de orden
-- ---------------------------------------------------------------------
alter table lista_movimiento add column if not exists orden_origen int;

comment on column lista_movimiento.orden_origen is
  'Número de fila en el archivo de origen. Es el desempate cuando un mismo RFC viene varias veces en la misma carga: el SAT publica primero la determinación y después su resolución. Null en captura manual, donde el oficio trae su propia fecha.';

create index if not exists idx_lista_movimiento_orden
  on lista_movimiento (carga_id, orden_origen);

-- El estado vigente recuerda de dónde vino, para no retroceder.
alter table lista_registro
  add column if not exists carga_ultima uuid references lista_carga(id) on delete set null,
  add column if not exists orden_origen_ultimo int;

-- Índices para las dos ramas del cotejo del trigger. Los de la 0012 son por
-- rfc y por nombre sueltos; el trigger siempre filtra además por fuente, y
-- sin la fuente en el índice la búsqueda recorre registros de otras listas.
create index if not exists idx_lista_registro_fuente_rfc
  on lista_registro (fuente_id, rfc) where rfc is not null;

create index if not exists idx_lista_registro_fuente_nombre
  on lista_registro (fuente_id, nombre_normalizado) where rfc is null;

comment on column lista_registro.orden_origen_ultimo is
  'Fila del archivo que fijó la situación vigente. Junto con carga_ultima impide que una fila anterior del mismo archivo pise a una posterior si el motor las procesa fuera de orden.';

-- ---------------------------------------------------------------------
-- 2. El trigger no retrocede
-- ---------------------------------------------------------------------
-- El movimiento SIEMPRE se asienta —la bitácora tiene que estar completa,
-- incluida la fila que quedó superada—. Lo que no se hace es dejar que una
-- fila ANTERIOR del mismo archivo pise la situación que fijó una posterior.
--
-- Sólo aplica dentro de una misma carga. Entre cargas distintas manda
-- siempre la nueva: un archivo posterior sustituye al anterior, que es
-- justamente lo que significa una fuente de snapshot.
create or replace function public.aplicar_movimiento_lista()
returns trigger
language plpgsql
security definer
set search_path = public
as $aplicar$
declare
  v_fuente uuid;
  v_registro uuid;
  v_rfc text := nullif(upper(btrim(coalesce(new.rfc, ''))), '');
  v_nombre_norm text := public.normalizar_nombre(new.nombre);
  v_situaciones text[];
  v_carga_ultima uuid;
  v_orden_ultimo int;
  v_superado boolean := false;
begin
  select fuente_id into v_fuente from lista_carga where id = new.carga_id;
  if v_fuente is null then
    raise exception 'La carga % no existe', new.carga_id;
  end if;

  new.rfc := v_rfc;

  select situaciones into v_situaciones from lista_fuente where id = v_fuente;
  if new.situacion is not null then
    if v_situaciones is null then
      raise exception
        'Esta fuente no maneja situaciones, pero el movimiento traía "%".', new.situacion;
    elsif not (new.situacion = any (v_situaciones)) then
      raise exception
        'Situación "%" no válida para esta fuente. Válidas: %', new.situacion, v_situaciones;
    end if;
  end if;

  -- El cotejo va en DOS consultas y no en una con OR, aunque la lógica sea
  -- idéntica. Con el OR, los `v_rfc is not null` son variables de PL/pgSQL:
  -- el plan genérico no puede plegarlos y la búsqueda degrada sobre una
  -- tabla que crece. Cargando el listado completo del 69-B eso se veía como
  -- lotes que iban de 267 ms a más de 3 s conforme avanzaba el archivo.
  -- Separadas, cada rama entra por su índice.
  if v_rfc is not null then
    select r.id, r.carga_ultima, r.orden_origen_ultimo
      into v_registro, v_carga_ultima, v_orden_ultimo
    from lista_registro r
    where r.fuente_id = v_fuente and r.rfc = v_rfc
    order by r.activo desc, r.actualizado_en desc
    limit 1;
  else
    select r.id, r.carga_ultima, r.orden_origen_ultimo
      into v_registro, v_carga_ultima, v_orden_ultimo
    from lista_registro r
    where r.fuente_id = v_fuente
      and r.rfc is null
      and r.nombre_normalizado = v_nombre_norm
    order by r.activo desc, r.actualizado_en desc
    limit 1;
  end if;

  -- ¿Esta fila viene ANTES que la que ya fijó el estado, en el mismo archivo?
  v_superado :=
    v_registro is not null
    and v_carga_ultima = new.carga_id
    and new.orden_origen is not null
    and v_orden_ultimo is not null
    and new.orden_origen < v_orden_ultimo;

  if new.accion = 'alta' then
    if v_registro is null then
      insert into lista_registro (
        fuente_id, tipo_entidad, nombre, rfc, curp, identificadores, pais,
        activo, situacion, alta_oficio, alta_fecha, raw_payload,
        carga_ultima, orden_origen_ultimo
      ) values (
        v_fuente, new.tipo_entidad, new.nombre, v_rfc, new.curp,
        new.identificadores, new.pais,
        true, new.situacion, new.oficio_numero, new.oficio_fecha, to_jsonb(new),
        new.carga_id, new.orden_origen
      )
      returning id into v_registro;

    elsif v_superado then
      -- Se asienta el movimiento pero NO se toca el estado vigente: esta
      -- fila ya quedó superada por una posterior del mismo archivo.
      null;

    else
      update lista_registro set
        nombre = new.nombre,
        curp = coalesce(new.curp, curp),
        identificadores = case when new.identificadores = '{}'::jsonb
                               then identificadores else new.identificadores end,
        pais = coalesce(new.pais, pais),
        activo = true,
        situacion = new.situacion,
        alta_oficio = coalesce(new.oficio_numero, alta_oficio),
        alta_fecha = coalesce(new.oficio_fecha, alta_fecha),
        baja_oficio = null,
        baja_fecha = null,
        carga_ultima = new.carga_id,
        orden_origen_ultimo = new.orden_origen,
        actualizado_en = now()
      where id = v_registro;
    end if;

  else -- baja
    if v_registro is null then
      raise exception
        'No hay registro en esta lista que coincida con % (RFC %). Una baja sólo procede sobre alguien previamente dado de alta.',
        new.nombre, coalesce(v_rfc, 'sin RFC');
    end if;

    if not v_superado then
      update lista_registro set
        activo = false,
        baja_oficio = new.oficio_numero,
        baja_fecha = new.oficio_fecha,
        carga_ultima = new.carga_id,
        orden_origen_ultimo = new.orden_origen,
        actualizado_en = now()
      where id = v_registro;
    end if;
  end if;

  new.registro_id := v_registro;
  return new;
end
$aplicar$;

-- ---------------------------------------------------------------------
-- 3. El conteo, una vez por sentencia
-- ---------------------------------------------------------------------
create or replace function public.contar_movimientos_carga()
returns trigger
language plpgsql
security definer
set search_path = public
as $contar$
begin
  update lista_carga c
     set num_movimientos = (
       select count(*) from lista_movimiento m where m.carga_id = c.id
     )
   where c.id in (select distinct n.carga_id from nuevas n);
  return null;
end
$contar$;

drop trigger if exists trg_lista_carga_conteo on lista_movimiento;
create trigger trg_lista_carga_conteo
  after insert on lista_movimiento
  referencing new table as nuevas
  for each statement execute function public.contar_movimientos_carga();

-- ---------------------------------------------------------------------
-- 4. El desempate en la evidencia histórica
-- ---------------------------------------------------------------------
-- Mismo orden que antes —fecha del oficio, fecha de publicación, fecha de
-- captura— y al final `orden_origen`, que es lo que resuelve el empate
-- entre dos filas del mismo archivo. Sin él, para los 50 RFC repetidos con
-- situación distinta, esta función devolvía cualquiera de las dos.
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
as $listado$
  select coalesce(
    (select m.accion = 'alta'
       from lista_movimiento m
       join lista_carga    c on c.id = m.carga_id
       join lista_registro r  on r.id = m.registro_id
       join lista_fuente   f  on f.id = r.fuente_id
      where f.codigo = p_fuente
        and (
          (p_rfc is not null and r.rfc = nullif(upper(btrim(p_rfc)), ''))
          or (p_rfc is null and p_nombre is not null
              and r.nombre_normalizado = public.normalizar_nombre(p_nombre))
        )
        and coalesce(m.oficio_fecha, c.fecha_publicacion_fuente, m.aplicado_en::date) <= p_fecha
      order by coalesce(m.oficio_fecha, c.fecha_publicacion_fuente, m.aplicado_en::date) desc,
               m.aplicado_en desc,
               m.orden_origen desc nulls last,
               m.id desc
      limit 1),
    false)
$listado$;

comment on function public.listado_en_fecha(text, date, text, text) is
  'Si una persona estaba en una lista en una fecha dada. La fecha efectiva es la del oficio, o la de publicación del archivo, nunca la de captura. Entre dos filas del mismo archivo desempata el orden de origen.';

-- ---------------------------------------------------------------------
-- 5. Los conflictos, a la vista
-- ---------------------------------------------------------------------
-- Que el sistema resuelva el empate bien no quita que haya que poder verlo.
-- Un archivo donde de pronto aparezcan 3,000 RFC repetidos no es el mismo
-- caso que uno con 50, y la diferencia sólo se nota si alguien la mira.
create or replace function public.conflictos_de_carga(p_carga_id uuid)
returns table (
  rfc text,
  nombre text,
  situaciones text[],
  situacion_vigente text,
  filas int[]
)
language sql
stable
security definer
set search_path = public
as $conflictos$
  select m.rfc,
         max(m.nombre) as nombre,
         array_agg(m.situacion order by m.orden_origen) as situaciones,
         max(r.situacion) as situacion_vigente,
         array_agg(m.orden_origen order by m.orden_origen) as filas
  from lista_movimiento m
  left join lista_registro r on r.id = m.registro_id
  where m.carga_id = p_carga_id
    and m.rfc is not null
  group by m.rfc
  having count(*) > 1
     and count(distinct m.situacion) > 1
  order by m.rfc
$conflictos$;

comment on function public.conflictos_de_carga(uuid) is
  'RFC que vinieron más de una vez en la misma carga CON SITUACIONES DISTINTAS, y con cuál quedaron. En el listado completo del 69-B son ~50 y es normal: el SAT concatena sus listados por situación y un contribuyente con sentencia favorable aparece en dos.';

revoke all on function public.conflictos_de_carga(uuid) from public;
do $permisos$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.conflictos_de_carga(uuid) to authenticated';
  end if;
end $permisos$;
