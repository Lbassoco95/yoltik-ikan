-- =====================================================================
-- Ikán · Migration 0065 · El 69-B se resuelve por fecha, no por posición
-- =====================================================================
-- Corrige el criterio que fijó la 0064, a instancia de Kawiil-Cumplimiento
-- (respuesta del 8 de septiembre de 2026, punto B1, instrucciones 247 a 250).
--
-- ---------------------------------------------------------------------
-- Qué estaba mal
-- ---------------------------------------------------------------------
-- La 0064 resolvía el RFC repetido quedándose con la ÚLTIMA FILA del archivo,
-- razonando que el SAT publica primero la determinación y después su
-- resolución. Cumplimiento no lo ratificó, y tenía razón por dos motivos.
--
-- El de principio: la posición de una fila en un archivo no es un hecho
-- jurídico. El día que el SAT cambie el orden de concatenación o regenere un
-- listado, el criterio falla en silencio.
--
-- El de hecho, que es peor: al leer las 20 columnas del archivo —la 0064 sólo
-- usaba cuatro— resulta que las dos filas de un RFC repetido NO son dos
-- versiones del mismo expediente. Son DOS PROCEDIMIENTOS distintos contra el
-- mismo contribuyente, cada uno con su oficio global y sus fechas, y el
-- archivo no los ordena cronológicamente.
--
--   AAS110331G59
--     fila 164  definitivo           publicado en el DOF el 07/07/2020
--     fila 165  sentencia favorable  publicado en el DOF el 27/01/2020
--
--   La sentencia favorable es de un procedimiento ANTERIOR. «La última fila»
--   lo dejaba sin bloquear; por fecha queda como definitivo, que es lo que
--   es.
--
-- Reprocesados los 77 RFC repetidos del listado completo del 31 de julio de
-- 2026: 38 dan igual, 37 CAMBIAN de resultado y 2 no se pueden resolver. De
-- los 37, treinta y cinco pasan a definitivo. Es decir: el criterio anterior
-- estaba dejando pasar a 35 EFOS confirmados por el SAT.
--
-- ---------------------------------------------------------------------
-- Qué se guarda ahora
-- ---------------------------------------------------------------------
-- La fecha de publicación de la situación vigente de cada fila, y el oficio
-- global que la respalda. El DOF manda —es la publicación que surte efectos—
-- y la página del SAT queda de respaldo.
--
-- `orden_origen` se conserva: es un dato de procedencia legítimo y sirve para
-- señalar una fila del archivo. Lo que deja de hacer es decidir.
-- =====================================================================

alter table lista_movimiento
  add column if not exists fecha_situacion date,
  add column if not exists oficio_situacion text;

comment on column lista_movimiento.fecha_situacion is
  'Publicación de la situación que fija este movimiento: DOF si viene, si no la página del SAT. Es lo que resuelve cuando un mismo RFC aparece varias veces. Null en captura manual, donde manda oficio_fecha.';
comment on column lista_movimiento.oficio_situacion is
  'Número y fecha del oficio global que respalda la situación, tal como lo escribe la autoridad. Es la cita que va al expediente.';

alter table lista_registro
  add column if not exists fecha_situacion date,
  add column if not exists oficio_situacion text,
  add column if not exists requiere_revision boolean not null default false,
  add column if not exists motivo_revision text;

comment on column lista_registro.requiere_revision is
  'true cuando la carga no pudo determinar la situación vigente y hace falta que la vea una persona. NUNCA se resuelve por posición en el archivo: se marca.';

create index if not exists idx_lista_registro_revision
  on lista_registro (fuente_id) where requiere_revision;

-- ---------------------------------------------------------------------
-- Etapa procesal, para desempatar a igualdad de fecha
-- ---------------------------------------------------------------------
-- Presunto → desvirtuado o definitivo → sentencia favorable. Devuelve 0 para
-- lo que no conoce, que nunca gana un desempate.
create or replace function public.orden_etapa_69b(p_situacion text)
returns int
language sql
immutable
as $etapa$
  select case p_situacion
    when 'presunto' then 1
    when 'desvirtuado' then 2
    when 'definitivo' then 3
    when 'sentencia_favorable' then 4
    else 0
  end
$etapa$;

comment on function public.orden_etapa_69b(text) is
  'Qué tan avanzada está una etapa del 69-B. Desempata a igualdad de fecha de publicación, según el criterio de Cumplimiento del 08/09/2026.';

-- ---------------------------------------------------------------------
-- El trigger, ahora por fecha
-- ---------------------------------------------------------------------
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
  v_fecha_ultima date;
  v_situacion_actual text;
  v_superado boolean := false;
  v_revisar boolean := false;
  v_motivo text;
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

  if v_rfc is not null then
    select r.id, r.carga_ultima, r.fecha_situacion, r.situacion
      into v_registro, v_carga_ultima, v_fecha_ultima, v_situacion_actual
    from lista_registro r
    where r.fuente_id = v_fuente and r.rfc = v_rfc
    order by r.activo desc, r.actualizado_en desc
    limit 1;
  else
    select r.id, r.carga_ultima, r.fecha_situacion, r.situacion
      into v_registro, v_carga_ultima, v_fecha_ultima, v_situacion_actual
    from lista_registro r
    where r.fuente_id = v_fuente
      and r.rfc is null
      and r.nombre_normalizado = v_nombre_norm
    order by r.activo desc, r.actualizado_en desc
    limit 1;
  end if;

  -- El desempate SÓLO opera dentro de una misma carga: entre archivos manda
  -- siempre el nuevo, que es lo que significa una fuente de snapshot. Dentro
  -- del archivo, gana la publicación más reciente.
  if v_registro is not null and v_carga_ultima = new.carga_id then
    if new.fecha_situacion is null or v_fecha_ultima is null then
      -- Sin fecha NO se cae de vuelta a la posición: se marca y se deja a una
      -- persona. Es exactamente el error que esta migration corrige.
      v_revisar := true;
      v_motivo := 'El archivo trae este RFC más de una vez y a alguna fila le falta la '
               || 'fecha de publicación de su situación. No se resuelve automáticamente.';
      v_superado := true;

    elsif new.fecha_situacion < v_fecha_ultima then
      v_superado := true;

    elsif new.fecha_situacion = v_fecha_ultima then
      -- Definitivo y desvirtuado con la misma fecha es una combinación que no
      -- debería existir. Se escala en vez de inventar un ganador.
      if (new.situacion = 'definitivo' and v_situacion_actual = 'desvirtuado')
         or (new.situacion = 'desvirtuado' and v_situacion_actual = 'definitivo') then
        v_revisar := true;
        v_motivo := 'Definitivo y desvirtuado con la misma fecha de publicación ('
                 || v_fecha_ultima || '). Combinación contradictoria: la resuelve una persona.';
        v_superado := true;
      elsif public.orden_etapa_69b(new.situacion)
            <= public.orden_etapa_69b(v_situacion_actual) then
        v_superado := true;
      end if;
    end if;
  end if;

  if new.accion = 'alta' then
    if v_registro is null then
      insert into lista_registro (
        fuente_id, tipo_entidad, nombre, rfc, curp, identificadores, pais,
        activo, situacion, alta_oficio, alta_fecha, raw_payload,
        carga_ultima, orden_origen_ultimo, fecha_situacion, oficio_situacion
      ) values (
        v_fuente, new.tipo_entidad, new.nombre, v_rfc, new.curp,
        new.identificadores, new.pais,
        true, new.situacion, new.oficio_numero, new.oficio_fecha, to_jsonb(new),
        new.carga_id, new.orden_origen, new.fecha_situacion, new.oficio_situacion
      )
      returning id into v_registro;

    elsif v_superado then
      -- El movimiento queda asentado en la bitácora —el historial es parte del
      -- expediente, instrucción 249— pero no fija el estado vigente. Si hizo
      -- falta escalarlo, eso sí se marca.
      if v_revisar then
        update lista_registro
           set requiere_revision = true,
               motivo_revision = v_motivo,
               actualizado_en = now()
         where id = v_registro;
      end if;

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
        fecha_situacion = new.fecha_situacion,
        oficio_situacion = new.oficio_situacion,
        requiere_revision = case when v_revisar then true else requiere_revision end,
        motivo_revision = case when v_revisar then v_motivo else motivo_revision end,
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
-- La evidencia histórica, con la fecha correcta
-- ---------------------------------------------------------------------
-- `fecha_situacion` entra ANTES que la fecha de publicación del archivo: es la
-- fecha en que la autoridad publicó ESA situación, que es más precisa que la
-- del archivo que la transporta. El orden de origen deja de desempatar.
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
        and coalesce(m.oficio_fecha, m.fecha_situacion,
                     c.fecha_publicacion_fuente, m.aplicado_en::date) <= p_fecha
      order by coalesce(m.oficio_fecha, m.fecha_situacion,
                        c.fecha_publicacion_fuente, m.aplicado_en::date) desc,
               public.orden_etapa_69b(m.situacion) desc,
               m.aplicado_en desc,
               m.id desc
      limit 1),
    false)
$listado$;

comment on function public.listado_en_fecha(text, date, text, text) is
  'Si una persona estaba en una lista en una fecha dada. La fecha efectiva es la del oficio, o la de publicación de la situación, o la del archivo; nunca la de captura. Desempata la etapa procesal, nunca la posición en el archivo.';

-- ---------------------------------------------------------------------
-- Los conflictos, ahora con sus fechas
-- ---------------------------------------------------------------------
-- Cambia el tipo de retorno —se le añaden las fechas y la marca de revisión—,
-- y `create or replace` no puede alterar los parámetros OUT de una función que
-- devuelve tabla. Hay que soltarla primero.
drop function if exists public.conflictos_de_carga(uuid);

create or replace function public.conflictos_de_carga(p_carga_id uuid)
returns table (
  rfc text,
  nombre text,
  situaciones text[],
  fechas date[],
  situacion_vigente text,
  fecha_vigente date,
  requiere_revision boolean
)
language sql
stable
security definer
set search_path = public
as $conflictos$
  select m.rfc,
         max(m.nombre) as nombre,
         array_agg(m.situacion order by m.fecha_situacion nulls first) as situaciones,
         array_agg(m.fecha_situacion order by m.fecha_situacion nulls first) as fechas,
         max(r.situacion) as situacion_vigente,
         max(r.fecha_situacion) as fecha_vigente,
         bool_or(r.requiere_revision) as requiere_revision
  from lista_movimiento m
  left join lista_registro r on r.id = m.registro_id
  where m.carga_id = p_carga_id
    and m.rfc is not null
  group by m.rfc
  having count(*) > 1
     and count(distinct m.situacion) > 1
  order by bool_or(r.requiere_revision) desc, m.rfc
$conflictos$;

comment on function public.conflictos_de_carga(uuid) is
  'RFC que vinieron más de una vez en la misma carga con situaciones distintas, con la fecha de publicación de cada una y con cuál quedaron. Los que exigen revisión humana salen primero.';

revoke all on function public.conflictos_de_carga(uuid) from public;
do $permisos$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.conflictos_de_carga(uuid) to authenticated';
    execute 'grant execute on function public.orden_etapa_69b(text) to authenticated';
  end if;
end $permisos$;
