-- =====================================================================
-- 0074 · La compuerta del corroborante, con sus tres desenlaces
-- =====================================================================
-- Cierra las instrucciones 327, 328, 329 y 330 de la Nota 5 de la Célula de
-- Cumplimiento (9 de septiembre de 2026), y es lo que la 298 esperaba para
-- dejar que una fuente pase a operativa.
--
-- ---------------------------------------------------------------------
-- Qué problema resuelve
-- ---------------------------------------------------------------------
-- La ONU marca 628 de sus alias como `Low`: baja calidad declarada por ella
-- misma. Si el cotejo los trata igual que un nombre bueno, la tasa de falsos
-- positivos se dispara, y con la regla de que una coincidencia detiene el
-- flujo para revisión, la notaría se detiene constantemente y en dos semanas
-- empieza a palomear sin mirar. Un control que se dispara de más deja de ser
-- un control: no falla por no correr, falla por correr tanto que nadie lo lee.
--
-- La 294 pedía exigir un campo corroborante. La 328 precisa lo que faltaba: el
-- campo tiene que COINCIDIR, no sólo existir. Y de ahí salen tres desenlaces y
-- no dos.
--
--   corroborada      el registro y el compareciente traen el mismo dato en al
--                    menos uno de los campos → se muestra como hipótesis, para
--                    verificación humana
--   no_corroborable  el registro no trae ninguno, o el compareciente no los
--                    aportó → NO se muestra, se cuenta
--   contradicha      los dos traen el dato y no coinciden → NO se muestra, se
--                    registra como descartada con el campo que la descartó
--
-- El tercero es el que suele faltar y el más valioso: una coincidencia de
-- nombre con fecha de nacimiento distinta no es una coincidencia débil, es una
-- NO-COINCIDENCIA DEMOSTRADA. Registrarla como descartada con su motivo es
-- mejor prueba de que el control corrió que no haberla producido nunca.
--
-- ---------------------------------------------------------------------
-- Con qué se corrobora HOY, y con qué no
-- ---------------------------------------------------------------------
-- La 294 nombró tres candidatos. Se midió qué hay de cada uno en el archivo
-- real de la ONU del 7 de septiembre, sobre los 231 registros que tienen algún
-- alias de baja calidad —los únicos a los que la compuerta aplica—:
--
--   FECHA DE NACIMIENTO · 160 de 231 traen al menos una fecha EXACTA.
--     Se usa, y en las dos direcciones. Es un dato ISO en los dos lados y su
--     comparación no admite interpretación.
--     · Sólo las exactas. Un año suelto, un «1966 (aproximada)» o un «entre
--       1973 y 1974» no son el mismo dato que una fecha de nacimiento: con un
--       año igual, corroborar sería aceptar una coincidencia de 1 en 365; con
--       un año distinto, contradecir sería descartar sobre un dato que la
--       propia ONU marca como incierto.
--     · Y como LISTA, no como cadena. La ONU publica varias fechas candidatas
--       para la misma persona —20 de esos 231 traen más de una— y compararlas
--       unidas en «1965-12-28 · 1965-12-29» hace que ninguna iguale.
--
--   NACIONALIDAD · NO se usa, y no por descuido.
--     216 de 231 la traen, así que la tentación es grande. Pero la ONU la
--     publica con su nombre oficial en inglés —«Iran (Islamic Republic of)»,
--     «Democratic People's Republic of Korea»— y en esta base la nacionalidad
--     del cliente es texto libre más una clave del catálogo del SAT. No existe
--     mapeo entre las dos cosas, y una comparación de cadenas entre ellas casi
--     nunca acierta.
--     Lo grave no es que no corrobore: es que CONTRADIRÍA. Cada coincidencia
--     real se leería como «los dos traen el dato y no coinciden» y se
--     descartaría, silenciosamente, en la única lista que impide operar. Una
--     nacionalidad mal comparada no produce ruido, produce falsos negativos.
--     Se habilita cuando exista el mapeo, no antes.
--
--   NÚMERO DE DOCUMENTO · NO se usa: no existe en la base.
--     Ni el lector de la ONU ni el de OFAC extraen documentos de identidad,
--     aunque los dos archivos los traen. Es trabajo de lector y queda dicho
--     como pendiente, no como algo que la compuerta ya considere.
--
-- La consecuencia hay que asumirla y no maquillarla: hoy la compuerta suprime
-- las coincidencias débiles de los 71 registros sin fecha exacta. La Nota 5 lo
-- resuelve de frente —«Suprimirlo es la decisión correcta y hay que asumirla
-- como tal, no dejarla como pendiente»— con la condición de que la cuenta se
-- asiente. Para eso está el apartado 4.

-- ---------------------------------------------------------------------
-- 1. El desenlace
-- ---------------------------------------------------------------------
do $$ begin
  create type desenlace_corroboracion as enum (
    'corroborada',
    'no_corroborable',
    'contradicha'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. La compuerta
-- ---------------------------------------------------------------------
-- Devuelve el desenlace y el campo que lo produjo. El campo importa tanto como
-- el desenlace: la 329 pide registrar la contradicha «indicando qué campo la
-- descartó», y sin eso una descartada es indistinguible de una que nunca
-- existió.
create or replace function public.corroborar_coincidencia(
  p_registro_id uuid,
  p_fecha_nacimiento date default null,
  /* Se reciben aunque no se usen todavía: así el día que exista el mapeo de
     países o el lector de documentos, quien llama no cambia. Declararlos
     ahora también evita que alguien crea que la compuerta ya los considera. */
  p_nacionalidad text default null,
  p_documento text default null
)
returns table (
  desenlace desenlace_corroboracion,
  campo text,
  detalle text
)
language plpgsql
stable
security definer
set search_path = public
as $compuerta$
declare
  v_fechas date[];
begin
  select coalesce(
           array_agg((x)::date order by (x)::date)
             filter (where x ~ '^\d{4}-\d{2}-\d{2}$'),
           '{}'::date[]
         )
    into v_fechas
    from lista_registro r
    left join lateral jsonb_array_elements_text(
      case
        when jsonb_typeof(r.identificadores -> 'fechas_nacimiento_exactas') = 'array'
          then r.identificadores -> 'fechas_nacimiento_exactas'
        else '[]'::jsonb
      end
    ) as x on true
   where r.id = p_registro_id;

  -- Fecha de nacimiento. El único corroborante habilitado hoy.
  if p_fecha_nacimiento is not null and array_length(v_fechas, 1) > 0 then
    if p_fecha_nacimiento = any (v_fechas) then
      return query select 'corroborada'::desenlace_corroboracion,
                          'fecha_nacimiento',
                          format('Coincide la fecha de nacimiento: %s.', p_fecha_nacimiento);
      return;
    end if;
    -- Contradicha, y con el dato a la vista: quien revise tiene que poder
    -- ver por qué se descartó sin volver a consultar la lista.
    return query select 'contradicha'::desenlace_corroboracion,
                        'fecha_nacimiento',
                        format(
                          'La lista publica %s y el compareciente declara %s. No es una '
                          || 'coincidencia débil: es una no-coincidencia demostrada.',
                          array_to_string(v_fechas, ' o '),
                          p_fecha_nacimiento);
    return;
  end if;

  -- Ni fecha en la lista, ni fecha del compareciente. No hay con qué, y no lo
  -- va a haber por más veces que se intente con estos datos.
  return query select 'no_corroborable'::desenlace_corroboracion,
                      null::text,
                      case
                        when p_fecha_nacimiento is null and array_length(v_fechas, 1) > 0
                          then 'El compareciente no aportó fecha de nacimiento.'
                        when p_fecha_nacimiento is not null
                          then 'La lista no publica una fecha de nacimiento exacta para este '
                               || 'registro.'
                        else 'Ni la lista ni el compareciente traen un campo corroborante.'
                      end;
end
$compuerta$;

comment on function public.corroborar_coincidencia(uuid, date, text, text) is
  'Compuerta del corroborante (instrucciones 327 a 330), con sus tres desenlaces. Hoy '
  'sólo corrobora por fecha de nacimiento EXACTA: la nacionalidad de la ONU viene en '
  'nombre oficial inglés y no hay mapeo al catálogo de esta base —compararla '
  'contradiría coincidencias reales, que es un falso negativo, no ruido— y ningún '
  'lector extrae documentos de identidad todavía.';

grant execute on function public.corroborar_coincidencia(uuid, date, text, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 3. El barrido, con la compuerta puesta
-- ---------------------------------------------------------------------
-- Se aplica SÓLO a las coincidencias por alias de baja calidad. Un cotejo por
-- RFC, por el nombre primario o por un alias bueno no pasa por aquí: pedirle
-- un corroborante a una coincidencia exacta de RFC sería descartar hallazgos
-- buenos por no traer una fecha.
drop function if exists public.coincidencias_en_listas(text, text, boolean);

create or replace function public.coincidencias_en_listas(
  p_nombre text default null,
  p_rfc text default null,
  p_incluir_debiles boolean default true,
  p_fecha_nacimiento date default null,
  p_nacionalidad text default null,
  p_documento text default null
)
returns table (
  fuente text,
  fuente_nombre text,
  registro_id uuid,
  nombre text,
  rfc text,
  tipo_entidad text,
  situacion text,
  identificador_fuente text,
  pais text,
  alta_fecha date,
  coincide_por text,
  efecto efecto_lista,
  determinacion_fuente text,
  datos jsonb,
  /* Nulos cuando la coincidencia no pasó por la compuerta —RFC, nombre o alias
     bueno—: eso es distinto de haber pasado y salir corroborada. */
  corroboracion desenlace_corroboracion,
  corroborado_por text,
  corroboracion_detalle text
)
language sql
stable
security definer
set search_path = public
as $barrido$
  with objetivo as (
    select nullif(upper(btrim(coalesce(p_rfc, ''))), '') as rfc,
           public.normalizar_nombre(p_nombre) as nombre_norm
  ),
  crudas as (
    select f.codigo as fuente,
           f.nombre as fuente_nombre,
           r.id as registro_id,
           r.nombre,
           r.rfc,
           r.tipo_entidad,
           r.situacion,
           r.identificador_fuente,
           r.pais,
           r.alta_fecha,
           case
             when o.rfc is not null and r.rfc = o.rfc then 'rfc'
             when o.nombre_norm is not null and r.nombre_normalizado = o.nombre_norm then 'nombre'
             when o.nombre_norm is not null and o.nombre_norm = any (r.nombres_alternos_norm)
               then 'alias'
             else 'alias_debil'
           end as coincide_por,
           public.efecto_de_coincidencia(f.codigo, r.situacion) as efecto,
           f.determinacion::text as determinacion_fuente,
           r.identificadores as datos
    from lista_registro r
    join lista_fuente f on f.id = r.fuente_id
    cross join objetivo o
    where r.activo
      and f.activa
      and f.modo_operacion = 'operativa'
      and (
        (o.rfc is not null and r.rfc = o.rfc)
        or (o.nombre_norm is not null and (
              r.nombre_normalizado = o.nombre_norm
              or o.nombre_norm = any (r.nombres_alternos_norm)
              or (p_incluir_debiles and o.nombre_norm = any (r.nombres_alternos_debiles_norm))
            ))
      )
  ),
  juzgadas as (
    select c.*,
           g.desenlace,
           g.campo,
           g.detalle
    from crudas c
    left join lateral public.corroborar_coincidencia(
      c.registro_id, p_fecha_nacimiento, p_nacionalidad, p_documento
    ) g on c.coincide_por = 'alias_debil'
  )
  select fuente, fuente_nombre, registro_id, nombre, rfc, tipo_entidad, situacion,
         identificador_fuente, pais, alta_fecha, coincide_por, efecto, determinacion_fuente,
         datos, desenlace, campo, detalle
  from juzgadas
  -- Instrucción 327: sólo la corroborada llega a la pantalla. La no
  -- corroborable y la contradicha se suprimen aquí, y se cuentan en
  -- `coincidencias_suprimidas()`.
  where coincide_por <> 'alias_debil' or desenlace = 'corroborada'
  order by
    case coincide_por
      when 'rfc' then 1 when 'nombre' then 2 when 'alias' then 3 else 4
    end,
    case efecto
      when 'impedimento' then 1 when 'eleva_diligencia' then 2 when 'dato' then 3 else 0
    end,
    fuente,
    nombre
$barrido$;

comment on function public.coincidencias_en_listas(text, text, boolean, date, text, text) is
  'Barre contra las listas OPERATIVAS mirando los alias, y aplica la compuerta del '
  'corroborante a las coincidencias por alias de baja calidad: sólo las corroboradas '
  'salen. Las suprimidas no se callan — `coincidencias_suprimidas()` las cuenta y '
  '`coincidencias_descartadas()` dice cuál fue y qué campo la descartó.';

grant execute on function
  public.coincidencias_en_listas(text, text, boolean, date, text, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 4. Lo que se suprimió, que es la condición para suprimir
-- ---------------------------------------------------------------------
-- Instrucción 330. La Nota 5 lo dice sin rodeos: «Lo que no puede pasar es que
-- se suprima en silencio. Si un día esa cuenta se dispara, es señal de que
-- algo cambió en la fuente y hay que mirarlo.»
create or replace function public.coincidencias_suprimidas(
  p_nombre text default null,
  p_rfc text default null,
  p_fecha_nacimiento date default null,
  p_nacionalidad text default null,
  p_documento text default null
)
returns table (
  no_corroborables bigint,
  contradichas bigint
)
language sql
stable
security definer
set search_path = public
as $conteo$
  with objetivo as (
    select public.normalizar_nombre(p_nombre) as nombre_norm
  ),
  debiles as (
    select r.id
    from lista_registro r
    join lista_fuente f on f.id = r.fuente_id
    cross join objetivo o
    where r.activo
      and f.activa
      and f.modo_operacion = 'operativa'
      and o.nombre_norm is not null
      and o.nombre_norm = any (r.nombres_alternos_debiles_norm)
      -- Sólo las que NO cotejaron por una vía fuerte: si el mismo registro
      -- coincide además por RFC o por su nombre primario, no se suprimió nada.
      and not (
        r.nombre_normalizado = o.nombre_norm
        or o.nombre_norm = any (r.nombres_alternos_norm)
        or (nullif(upper(btrim(coalesce(p_rfc, ''))), '') is not null
            and r.rfc = nullif(upper(btrim(coalesce(p_rfc, ''))), ''))
      )
  )
  select count(*) filter (where g.desenlace = 'no_corroborable'),
         count(*) filter (where g.desenlace = 'contradicha')
  from debiles d
  cross join lateral public.corroborar_coincidencia(
    d.id, p_fecha_nacimiento, p_nacionalidad, p_documento
  ) g
$conteo$;

comment on function public.coincidencias_suprimidas(text, text, date, text, text) is
  'Cuántas coincidencias por alias de baja calidad se suprimieron en este barrido y por '
  'qué (instrucción 330). Suprimir es la decisión correcta; suprimir en silencio no lo '
  'es. Si esta cuenta se dispara, algo cambió en la fuente.';

grant execute on function public.coincidencias_suprimidas(text, text, date, text, text)
  to authenticated;

-- Y las contradichas con nombre y apellido, porque una no-coincidencia
-- demostrada es evidencia y no un descarte silencioso (instrucción 329).
create or replace function public.coincidencias_descartadas(
  p_nombre text default null,
  p_rfc text default null,
  p_fecha_nacimiento date default null,
  p_nacionalidad text default null,
  p_documento text default null
)
returns table (
  fuente text,
  fuente_nombre text,
  registro_id uuid,
  nombre text,
  identificador_fuente text,
  campo text,
  detalle text
)
language sql
stable
security definer
set search_path = public
as $descartadas$
  with objetivo as (
    select public.normalizar_nombre(p_nombre) as nombre_norm,
           nullif(upper(btrim(coalesce(p_rfc, ''))), '') as rfc
  )
  select f.codigo, f.nombre, r.id, r.nombre, r.identificador_fuente, g.campo, g.detalle
  from lista_registro r
  join lista_fuente f on f.id = r.fuente_id
  cross join objetivo o
  cross join lateral public.corroborar_coincidencia(
    r.id, p_fecha_nacimiento, p_nacionalidad, p_documento
  ) g
  where r.activo
    and f.activa
    and f.modo_operacion = 'operativa'
    and o.nombre_norm is not null
    and o.nombre_norm = any (r.nombres_alternos_debiles_norm)
    and not (
      r.nombre_normalizado = o.nombre_norm
      or o.nombre_norm = any (r.nombres_alternos_norm)
      or (o.rfc is not null and r.rfc = o.rfc)
    )
    and g.desenlace = 'contradicha'
  order by f.codigo, r.nombre
$descartadas$;

comment on function public.coincidencias_descartadas(text, text, date, text, text) is
  'Las coincidencias por alias débil que se descartaron por CONTRADICCIÓN, con el campo '
  'que las descartó (instrucción 329). Es evidencia de que el control corrió: una '
  'coincidencia de nombre con fecha de nacimiento distinta es una no-coincidencia '
  'demostrada, y registrarla vale más que no haberla producido nunca.';

grant execute on function public.coincidencias_descartadas(text, text, date, text, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 5. La compuerta de la 298 se abre
-- ---------------------------------------------------------------------
-- Ahora el cotejo sí mira los alias con su calidad Y aplica el corroborante a
-- los de baja calidad, que era la condición. Que se abra aquí no pone ninguna
-- fuente a operar: `modo_operacion` sigue en validación en todas, y pasarlas
-- es una decisión explícita de quien las valide.
create or replace function public.cotejo_con_calidad_de_alias()
returns boolean
language sql
immutable
set search_path = public
as $compuerta$
  select true
$compuerta$;

comment on function public.cotejo_con_calidad_de_alias() is
  'Compuerta de la instrucción 298. ABIERTA desde la 0074: el cotejo separa los alias '
  'por calidad y aplica la compuerta del corroborante a los de baja calidad, con sus '
  'tres desenlaces. Abrirla no pone nada a operar — sólo deja de impedirlo.';

-- ---------------------------------------------------------------------
-- 6. Guarda
-- ---------------------------------------------------------------------
do $guarda$
begin
  if not public.cotejo_con_calidad_de_alias() then
    raise exception 'La compuerta debía quedar abierta al terminar esta migration.';
  end if;
end $guarda$;
