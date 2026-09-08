-- =====================================================================
-- Ikán · Migration 0067 · Alias, identificador de fuente, y el barrido
-- =====================================================================
-- Con los tres lectores hechos —SAT, OFAC y ONU— el modelo se queda corto en
-- dos cosas, y las dos se descubrieron midiendo los archivos reales.
--
-- ---------------------------------------------------------------------
-- 1. Los alias no tenían dónde vivir
-- ---------------------------------------------------------------------
-- `lista_registro` tiene `nombres_alternos` desde la 0012, pero
-- `lista_movimiento` NO, así que el camino de carga no podía llenarla. Y el
-- cotejo usa `nombre_normalizado`, que es una columna generada a partir del
-- nombre primario y nada más.
--
-- Cargar OFAC así guardaría 19,846 nombres y tiraría 30,309 alias. La ONU
-- aporta otros 3,186. Un designado opera bajo cualquiera de sus nombres, y un
-- nombre árabe o cirílico se translitera de varias formas: cotejar sólo el
-- primario sería un control que corre y no encuentra, que es la familia de
-- fallas que este criterio lleva doce documentos persiguiendo.
--
-- ---------------------------------------------------------------------
-- 2. Resolver IDENTIDAD y COTEJAR un barrido no son lo mismo
-- ---------------------------------------------------------------------
-- Hoy comparten código y eso ya no puede ser:
--
--   RESOLVER IDENTIDAD  es decidir a qué registro afecta un movimiento que
--                       entra. Tiene que ser ESTRICTO. Si mirara alias, dos
--                       entidades distintas que comparten un a.k.a. se
--                       fusionarían en una, y con 33,495 alias eso pasaría.
--
--   COTEJAR UN BARRIDO  es preguntar si un compareciente coincide con algo.
--                       Tiene que ser AMPLIO, porque la persona puede venir
--                       bajo cualquiera de sus nombres.
--
-- Por eso entra `identificador_fuente` —el `id` de OFAC, el
-- `REFERENCE_NUMBER` de la ONU— como llave fuerte de resolución, que es
-- exactamente lo que Cumplimiento mandó: «el identificador es el del propio
-- registro, nunca la posición en el archivo ni el nombre traducido»
-- (instrucción 245 y su punto 1.2). Y el cotejo se va a una función aparte que
-- sí mira alias y que NO resuelve identidad.
--
-- ---------------------------------------------------------------------
-- 3. Los alias débiles se distinguen, no se mezclan
-- ---------------------------------------------------------------------
-- La ONU califica sus alias: 1,535 «Good» y 628 «Low». OFAC hace lo mismo con
-- `isLowQuality`. Un alias débil es una variante ortográfica dudosa: sirve para
-- levantar un candidato a revisar, no para afirmar una coincidencia.
--
-- El barrido los devuelve marcados como `alias_debil` y NO decide qué son. Si
-- un cotejo débil es hallazgo o sólo candidato es criterio de cumplimiento y
-- está pendiente de la célula; hasta entonces se enseñan como lo que son, y ni
-- se esconden ni se presentan como confirmados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Normalizar una lista de nombres
-- ---------------------------------------------------------------------
-- Inmutable, porque alimenta columnas generadas. Es cotejo EXACTO sobre el
-- nombre normalizado, igual que `normalizar_nombre`: el puntaje de similitud
-- es de otra capa y esta función no lo hace.
create or replace function public.normalizar_nombres(p_nombres text[])
returns text[]
language sql
immutable
as $norm$
  select coalesce(
    (select array_agg(distinct n order by n)
       from unnest(coalesce(p_nombres, '{}'::text[])) x
       cross join lateral (select public.normalizar_nombre(x) as n) t
      where n is not null),
    '{}'::text[])
$norm$;

comment on function public.normalizar_nombres(text[]) is
  'Normaliza una lista de nombres para cotejo exacto, sin duplicados. Inmutable porque alimenta columnas generadas.';

-- ---------------------------------------------------------------------
-- El identificador que da la propia fuente
-- ---------------------------------------------------------------------
alter table lista_movimiento
  add column if not exists identificador_fuente text,
  add column if not exists nombres_alternos text[] not null default '{}',
  add column if not exists nombres_alternos_debiles text[] not null default '{}';

comment on column lista_movimiento.identificador_fuente is
  'El identificador estable que da la fuente: el id de la entidad en OFAC, el REFERENCE_NUMBER de la ONU. Es la llave fuerte para resolver a qué registro afecta este movimiento. Null en fuentes que no lo publican (el 69-B usa el RFC).';
comment on column lista_movimiento.nombres_alternos_debiles is
  'Los alias que la propia fuente marca de baja calidad (QUALITY=Low en la ONU, isLowQuality en OFAC). Van aparte porque levantan un candidato, no una coincidencia.';

alter table lista_registro
  add column if not exists identificador_fuente text,
  add column if not exists nombres_alternos_debiles text[] not null default '{}';

comment on column lista_registro.identificador_fuente is
  'El identificador estable de la fuente. Único por fuente: es lo que permite que una republicación actualice el registro correcto aunque el nombre haya cambiado de grafía.';

-- Único por fuente. Los NULL no compiten entre sí en Postgres, así que las
-- fuentes que no publican identificador —el 69-B— no se ven afectadas.
create unique index if not exists idx_lista_registro_identificador
  on lista_registro (fuente_id, identificador_fuente)
  where identificador_fuente is not null;

-- ---------------------------------------------------------------------
-- Los alias, normalizados y con índice para cotejar
-- ---------------------------------------------------------------------
-- Columnas GENERADAS y no escritas: la llave de cotejo no puede quedar
-- desalineada de los nombres. Misma razón que `nombre_normalizado` en la 0012.
alter table lista_registro
  add column if not exists nombres_alternos_norm text[]
    generated always as (public.normalizar_nombres(nombres_alternos)) stored,
  add column if not exists nombres_alternos_debiles_norm text[]
    generated always as (public.normalizar_nombres(nombres_alternos_debiles)) stored;

create index if not exists idx_lista_registro_alias_norm
  on lista_registro using gin (nombres_alternos_norm);
create index if not exists idx_lista_registro_alias_debil_norm
  on lista_registro using gin (nombres_alternos_debiles_norm);

-- ---------------------------------------------------------------------
-- El trigger: resolución ESTRICTA, ahora por identificador
-- ---------------------------------------------------------------------
-- Orden de resolución, de la llave más fuerte a la más débil:
--   1. `identificador_fuente`, cuando la fuente lo publica.
--   2. El RFC, que es la llave fuerte del 69-B.
--   3. El nombre normalizado, sólo cuando no hay ninguna de las dos.
--
-- Los ALIAS no entran aquí a propósito, y es la decisión central de esta
-- migration: con 33,495 alias, resolver identidad por alias fusionaría
-- entidades distintas que comparten un a.k.a. Los alias son para el barrido.
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
  v_ident text := nullif(btrim(coalesce(new.identificador_fuente, '')), '');
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
  new.identificador_fuente := v_ident;

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

  if v_ident is not null then
    select r.id, r.carga_ultima, r.fecha_situacion, r.situacion
      into v_registro, v_carga_ultima, v_fecha_ultima, v_situacion_actual
    from lista_registro r
    where r.fuente_id = v_fuente and r.identificador_fuente = v_ident;

  elsif v_rfc is not null then
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
      and r.identificador_fuente is null
      and r.nombre_normalizado = v_nombre_norm
    order by r.activo desc, r.actualizado_en desc
    limit 1;
  end if;

  -- El no-retroceso de la 0065: dentro de una misma carga gana la publicación
  -- más reciente. Entre archivos manda siempre el nuevo.
  --
  -- Y SÓLO PARA LAS ALTAS. Esto corrige una regresión que la 0065 introdujo sin
  -- que ninguna prueba la cazara: la regla existe para resolver entre varias
  -- afirmaciones de SITUACIÓN que compiten, y una baja no es eso —es una
  -- instrucción explícita, respaldada por un oficio—. Al aplicarla también a
  -- las bajas, un alta seguida de una baja de la misma persona en la misma
  -- carga no hacía nada, en silencio.
  --
  -- Es justo el flujo de la Lista de Personas Bloqueadas de la UIF, donde una
  -- captura puede traer los dos movimientos, y el contrato que documenta
  -- `registrarCarga` desde la 0012: «un alta seguida de una baja de la misma
  -- persona en la misma carga tiene que cotejar». `probar_0012` no lo detectó
  -- porque usa una carga por oficio.
  if new.accion = 'alta' and v_registro is not null and v_carga_ultima = new.carga_id then
    if new.fecha_situacion is null or v_fecha_ultima is null then
      v_revisar := true;
      v_motivo := 'El archivo trae este registro más de una vez y a alguna fila le falta la '
               || 'fecha de publicación de su situación. No se resuelve automáticamente.';
      v_superado := true;

    elsif new.fecha_situacion < v_fecha_ultima then
      v_superado := true;

    elsif new.fecha_situacion = v_fecha_ultima then
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
        carga_ultima, orden_origen_ultimo, fecha_situacion, oficio_situacion,
        identificador_fuente, nombres_alternos, nombres_alternos_debiles
      ) values (
        v_fuente, new.tipo_entidad, new.nombre, v_rfc, new.curp,
        new.identificadores, new.pais,
        true, new.situacion, new.oficio_numero, new.oficio_fecha, to_jsonb(new),
        new.carga_id, new.orden_origen, new.fecha_situacion, new.oficio_situacion,
        v_ident, new.nombres_alternos, new.nombres_alternos_debiles
      )
      returning id into v_registro;

    elsif v_superado then
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
        identificador_fuente = coalesce(v_ident, identificador_fuente),
        -- Los alias se REEMPLAZAN, no se acumulan: la fuente republica su
        -- estado completo, y un alias que ya no viene es un alias que la
        -- autoridad retiró. Acumular convertiría el registro en un archivo
        -- histórico de grafías que nadie depuró.
        nombres_alternos = case when new.nombres_alternos = '{}'::text[]
                                then nombres_alternos else new.nombres_alternos end,
        nombres_alternos_debiles = case when new.nombres_alternos_debiles = '{}'::text[]
                                        then nombres_alternos_debiles
                                        else new.nombres_alternos_debiles end,
        requiere_revision = case when v_revisar then true else requiere_revision end,
        motivo_revision = case when v_revisar then v_motivo else motivo_revision end,
        actualizado_en = now()
      where id = v_registro;
    end if;

  else -- baja
    if v_registro is null then
      raise exception
        'No hay registro en esta lista que coincida con % (identificador %, RFC %). Una baja sólo procede sobre alguien previamente dado de alta.',
        new.nombre, coalesce(v_ident, 'sin identificador'), coalesce(v_rfc, 'sin RFC');
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
-- El barrido: AMPLIO, y no resuelve nada
-- ---------------------------------------------------------------------
-- Es lo que no existía. Hasta ahora las listas eran un catálogo consultable a
-- mano y unos conteos; nada preguntaba «¿este compareciente coincide con
-- algo?».
--
-- Devuelve CÓMO coincidió, porque no es lo mismo:
--   rfc          el identificador fuerte. No hay duda.
--   nombre       el nombre primario, normalizado.
--   alias        un a.k.a. que la fuente da por bueno.
--   alias_debil  una variante que la fuente misma marca dudosa.
--
-- Y devuelve el EFECTO declarado de la fuente (migration 0066), que puede ser
-- null cuando la fuente todavía no lo declaró. Esta función NO decide si una
-- coincidencia impide, eleva o informa: eso es atributo de la fuente y lo fijó
-- Cumplimiento. Tampoco decide qué hacer con un cotejo débil: eso está
-- pendiente de la célula y hasta entonces se entrega marcado.
create or replace function public.coincidencias_en_listas(
  p_nombre text default null,
  p_rfc text default null,
  /** Por omisión se incluyen: esconderlas sería decidir que no importan. */
  p_incluir_debiles boolean default true
)
returns table (
  fuente text,
  fuente_nombre text,
  registro_id uuid,
  nombre text,
  tipo_entidad text,
  situacion text,
  identificador_fuente text,
  pais text,
  coincide_por text,
  efecto efecto_lista,
  determinacion_fuente text,
  datos jsonb
)
language sql
stable
security definer
set search_path = public
as $barrido$
  with objetivo as (
    select nullif(upper(btrim(coalesce(p_rfc, ''))), '') as rfc,
           public.normalizar_nombre(p_nombre) as nombre_norm
  )
  select f.codigo,
         f.nombre,
         r.id,
         r.nombre,
         r.tipo_entidad,
         r.situacion,
         r.identificador_fuente,
         r.pais,
         case
           when o.rfc is not null and r.rfc = o.rfc then 'rfc'
           when o.nombre_norm is not null and r.nombre_normalizado = o.nombre_norm then 'nombre'
           when o.nombre_norm is not null and o.nombre_norm = any (r.nombres_alternos_norm)
             then 'alias'
           else 'alias_debil'
         end,
         public.efecto_de_coincidencia(f.codigo, r.situacion),
         f.determinacion::text,
         r.identificadores
  from lista_registro r
  join lista_fuente f on f.id = r.fuente_id
  cross join objetivo o
  where r.activo
    and f.activa
    and (
      (o.rfc is not null and r.rfc = o.rfc)
      or (o.nombre_norm is not null and (
            r.nombre_normalizado = o.nombre_norm
            or o.nombre_norm = any (r.nombres_alternos_norm)
            or (p_incluir_debiles and o.nombre_norm = any (r.nombres_alternos_debiles_norm))
          ))
    )
  -- Lo más fuerte primero: quien lea la pantalla debe ver el impedimento antes
  -- que la variante ortográfica dudosa.
  order by
    case
      when o.rfc is not null and r.rfc = o.rfc then 1
      when o.nombre_norm is not null and r.nombre_normalizado = o.nombre_norm then 2
      when o.nombre_norm is not null and o.nombre_norm = any (r.nombres_alternos_norm) then 3
      else 4
    end,
    case public.efecto_de_coincidencia(f.codigo, r.situacion)
      when 'impedimento' then 1 when 'eleva_diligencia' then 2 when 'dato' then 3 else 0
    end,
    f.codigo,
    r.nombre
$barrido$;

comment on function public.coincidencias_en_listas(text, text, boolean) is
  'Barre un nombre y/o un RFC contra todas las listas activas, MIRANDO LOS ALIAS. Devuelve cómo coincidió (rfc, nombre, alias, alias_debil) y el efecto declarado de la fuente. No decide nada: el efecto es atributo de la fuente y qué hacer con un cotejo débil está pendiente de Cumplimiento.';

revoke all on function public.coincidencias_en_listas(text, text, boolean) from public;
revoke all on function public.normalizar_nombres(text[]) from public;
do $permisos$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.coincidencias_en_listas(text, text, boolean) to authenticated';
    execute 'grant execute on function public.normalizar_nombres(text[]) to authenticated';
  end if;
end $permisos$;
