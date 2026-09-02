-- =====================================================================
-- 0055 aplicada POR PASOS
-- =====================================================================
-- Mismo contenido que `supabase/migrations/0055_errata_paarss_balcanes_atencion.sql`.
--
--   Paso 1 · el nivel por país, el catálogo de atención y su vista
--   Paso 2 · aplicar la errata: PAARSS, los ocho de Balcanes y Siria
--   Paso 3 · la proyección con el tercer nivel (upsert idempotente)
--   Paso 4 · el cargador corregido, o la errata se deshace en la primera recarga
--   Paso 5 · correr la carga y la proyección, y comprobar
--
-- El paso 3 es el que escribe en country_risk_list. El 4 es imprescindible:
-- sin él, cualquier recarga vuelve a poner PAARSS como territorial.
-- =====================================================================


-- #####################################################################
-- PASO 1 · El nivel por país y el catálogo de atención
-- #####################################################################
-- ---------------------------------------------------------------------
-- El nivel y su derivación, por país
-- ---------------------------------------------------------------------
alter table regimen_pais
  add column if not exists nivel_territorial text
    check (nivel_territorial in ('prohibicion', 'riesgo_alto', 'atencion')),
  add column if not exists derivacion text;

comment on column regimen_pais.nivel_territorial is
  'Sobrescribe el nivel del régimen para ESTE país. Null = hereda el del régimen. '
  'Existe porque Balcanes alcanza ocho jurisdicciones y no todas al mismo nivel: '
  'Croacia y Eslovenia son miembros de la Unión Europea y marcarlas como riesgo '
  'alto produciría falsos positivos sin ganancia de detección.';
comment on column regimen_pais.derivacion is
  'Por qué este país está en este nivel, cuando no es el del régimen. Sin '
  'derivación escrita, una excepción al nivel del régimen es indistinguible de '
  'un error de carga.';

-- Una excepción al nivel del régimen SIN justificación escrita no se admite:
-- es la garantía de que el nivel por país no se convierta en un cajón donde
-- meter lo incómodo.
alter table regimen_pais drop constraint if exists regimen_pais_nivel_derivado;
alter table regimen_pais
  add constraint regimen_pais_nivel_derivado
  check (nivel_territorial is null or coalesce(btrim(derivacion), '') <> '');

-- ---------------------------------------------------------------------
-- El catálogo del nivel de atención, para lo que no sale de un régimen
-- ---------------------------------------------------------------------
-- Siria es el primer caso: ya no tiene programa territorial de OFAC ni régimen
-- del Consejo de Seguridad, así que ningún régimen la produce. Entra por aquí.
--
-- Versionado y con derivación OBLIGATORIA por entrada. Es la garantía de que
-- este nivel no se llene de jurisdicciones «plausibles»: si el campo está
-- vacío, la fila no entra.
create table if not exists jurisdiccion_atencion (
  iso2 text primary key check (length(iso2) = 2),
  nombre text not null,
  /** Por qué está aquí. Obligatoria, y no por formalismo: una lista de
   *  jurisdicciones «de atención» sin derivación es una opinión con apariencia
   *  de metodología. */
  derivacion text not null check (btrim(derivacion) <> ''),
  /** Quién la firmó. Null mientras la carga la haga una migration; se llena
   *  cuando el responsable de cumplimiento la asiente. */
  firmada_por uuid references auth.users(id),
  vigente_desde date not null default current_date,
  vigente_hasta date,
  /** Cuándo toca revisarla. Acoplada a la reevaluación semestral del Cap. III
   *  Bis: una lista que nadie revisa deja de describir el riesgo y nadie se
   *  entera. */
  revisar_en date not null default (current_date + interval '6 months')
);

comment on table jurisdiccion_atencion is
  'El nivel 3 del eje territorial de la Adenda 3: jurisdicciones sin programa '
  'propio pero con exposición identificada. Derivación escrita OBLIGATORIA por '
  'entrada, y ninguna sale por antigüedad: sale por decisión firmada, con la '
  'misma formalidad con la que entró.';

alter table jurisdiccion_atencion enable row level security;
drop policy if exists "jurisdiccion_atencion_select" on jurisdiccion_atencion;
create policy "jurisdiccion_atencion_select" on jurisdiccion_atencion for select using (true);
drop policy if exists "jurisdiccion_atencion_write_kawiil" on jurisdiccion_atencion;
create policy "jurisdiccion_atencion_write_kawiil" on jurisdiccion_atencion for all
  using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());
revoke all on jurisdiccion_atencion from anon;
revoke insert, update, delete on jurisdiccion_atencion from authenticated;
grant select on jurisdiccion_atencion to authenticated;

-- ---------------------------------------------------------------------
-- Todo lo que está en nivel de atención, venga de donde venga
-- ---------------------------------------------------------------------
-- Croacia y Eslovenia llegan por la excepción de nivel del régimen de
-- Balcanes; Siria por el catálogo. Son dos caminos y una sola lista, y la vista
-- evita duplicar las filas en dos tablas —que es como se desincronizan—.
drop view if exists v_jurisdiccion_atencion;
create view v_jurisdiccion_atencion with (security_invoker = true) as
  select ja.iso2, ja.nombre, ja.derivacion, 'catálogo'::text as origen
    from jurisdiccion_atencion ja
   where ja.vigente_hasta is null
  union
  select rp.iso2,
         coalesce(cv.descripcion, rp.iso2),
         rp.derivacion,
         'excepción de nivel · ' || r.clave
    from regimen_pais rp
    join regimen_sancion r on r.id = rp.regimen_id and r.vigente
    left join catalogo_valor cv
           on cv.clave = rp.iso2 and cv.vigente_hasta is null
          and cv.catalogo_id = (select id from catalogo_sat where codigo = 'pais')
   where rp.nivel_territorial = 'atencion';

comment on view v_jurisdiccion_atencion is
  'Las jurisdicciones en nivel de atención, por los dos caminos por los que se '
  'llega: el catálogo propio y la excepción de nivel dentro de un régimen. Una '
  'sola lista en vez de dos tablas que se desincronicen.';



-- #####################################################################
-- PASO 2 · Aplicar la errata
-- #####################################################################
-- =====================================================================
-- Aplicar la errata y las tres cargas
-- =====================================================================
do $$
declare
  v_lectura constant date := date '2026-09-01';
  v_paarss  uuid;
  v_balk    uuid;
  v_n       int;
begin
  if not public.puede_provisionar() then
    raise exception 'Sólo un administrador de Kawiil puede corregir los regímenes de sanciones.';
  end if;

  -- En un proyecto NUEVO los regímenes todavía no están cargados: las
  -- migrations corren antes que los seeds, y la carga la hace
  -- `cargar_regimenes_2026_09` desde el seed 18. Sin esta guarda, las
  -- comprobaciones de más abajo fallaban contra cero regímenes y tiraban la
  -- migration entera.
  --
  -- No es un salto silencioso: el cargador que esta misma migration redefine
  -- más abajo ya trae la clasificación correcta, así que un proyecto nuevo
  -- llega al mismo estado por el otro camino. Se avisa para que se vea.
  if not exists (select 1 from regimen_sancion where leido_en = v_lectura) then
    raise notice 'Sin regímenes cargados con fecha %: la errata no aplica y el cargador '
      'redefinido más abajo ya trae la clasificación corregida.', v_lectura;
    return;
  end if;

  -- -----------------------------------------------------------------
  -- 1. PAARSS pasa a personal
  -- -----------------------------------------------------------------
  select id into v_paarss from regimen_sancion
   where autoridad = 'ofac'
     and clave = 'Promoting Accountability for Assad and Regional Stabilization (PAARSS)'
     and leido_en = v_lectura;

  if v_paarss is not null then
    update regimen_sancion
       set clase = 'personal',
           nivel_territorial = null,
           notas = 'ERRATA de la Adenda 3, corregida por la Adenda 4 (01/09/2026). La Orden '
                || 'Ejecutiva 14312 del 30/06/2025 revocó las sanciones amplias sobre Siria y '
                || 'OFAC eliminó las Syrian Sanctions Regulations (31 CFR parte 542) con efecto '
                || 'del 26/08/2025. PAARSS autoriza designaciones sobre Bashar al-Assad y sus '
                || 'asociados: designa PERSONAS, no jurisdicciones. No produce país.'
     where id = v_paarss;

    -- Y su país se va. Un programa personal no produce jurisdicciones, y
    -- dejar la fila haría que la reclasificación no sirviera de nada.
    delete from regimen_pais where regimen_id = v_paarss;
  end if;

  -- -----------------------------------------------------------------
  -- 2. Los ocho de Balcanes
  -- -----------------------------------------------------------------
  -- 31 CFR § 588.315: «the territory of the former Socialist Federal Republic
  -- of Yugoslavia and the Republic of Albania». La traducción de ese territorio
  -- a siete jurisdicciones actuales es interpretación de Kawiil, no del
  -- reglamento, y así queda citada.
  select id into v_balk from regimen_sancion
   where autoridad = 'ofac' and clave = 'Balkans-Related Sanctions' and leido_en = v_lectura;

  if v_balk is not null then
    update regimen_sancion
       set notas = 'Alcance definido en 31 CFR § 588.315: el territorio de la antigua República '
                || 'Federativa Socialista de Yugoslavia más Albania. La traducción de ese '
                || 'territorio a siete jurisdicciones actuales es interpretación de Kawiil, no '
                || 'del reglamento.'
     where id = v_balk;

    -- Las seis en riesgo alto heredan el nivel del régimen: sin excepción, sin
    -- derivación que escribir.
    insert into regimen_pais (regimen_id, iso2)
    select v_balk, m.iso2
      from (values ('AL'), ('BA'), ('MK'), ('ME'), ('RS'), ('XK')) as m(iso2)
        on conflict do nothing;

    -- Y las dos que bajan de nivel, con su derivación. El check de la tabla no
    -- admite una sin la otra.
    insert into regimen_pais (regimen_id, iso2, nivel_territorial, derivacion)
    values
      (v_balk, 'HR', 'atencion',
       'Croacia está dentro de la definición reglamentaria del programa, pero dejó de ser '
       || 'destino de sus designaciones y es Estado miembro de la Unión Europea desde 2013, lo '
       || 'que implica un marco de supervisión equivalente. Marcarla como riesgo alto produciría '
       || 'falsos positivos con costo reputacional y sin ganancia de detección. Adenda 4, '
       || 'apartado 1.'),
      (v_balk, 'SI', 'atencion',
       'Eslovenia está dentro de la definición reglamentaria del programa, pero dejó de ser '
       || 'destino de sus designaciones y es Estado miembro de la Unión Europea desde 2004, lo '
       || 'que implica un marco de supervisión equivalente. Marcarla como riesgo alto produciría '
       || 'falsos positivos con costo reputacional y sin ganancia de detección. Adenda 4, '
       || 'apartado 1.')
        on conflict (regimen_id, iso2) do update
       set nivel_territorial = excluded.nivel_territorial,
           derivacion = excluded.derivacion;
  end if;

  -- -----------------------------------------------------------------
  -- 3. Siria, al nivel de atención
  -- -----------------------------------------------------------------
  insert into jurisdiccion_atencion (iso2, nombre, derivacion)
  values ('SY', 'Siria',
    'Jurisdicción en transición tras la revocación de un régimen comprehensivo: la Orden '
    || 'Ejecutiva 14312 del 30/06/2025 revocó las sanciones amplias y OFAC eliminó las Syrian '
    || 'Sanctions Regulations con efecto del 26/08/2025. Quedan designaciones individuales '
    || 'activas bajo PAARSS, no hay régimen del Consejo de Seguridad propio, y está en la lista '
    || 'de monitoreo intensificado del GAFI. No es prohibición ni riesgo alto por programa '
    || 'territorial: es atención por historia reciente y por concentración de designados. '
    || 'Adenda 4, apartado 3.')
      on conflict (iso2) do update
     set derivacion = excluded.derivacion, nombre = excluded.nombre;

  -- -----------------------------------------------------------------
  -- Comprobaciones que tienen que sostenerse
  -- -----------------------------------------------------------------
  select count(*) into v_n from regimen_sancion
   where autoridad = 'ofac' and leido_en = v_lectura and clase = 'territorial';
  if v_n <> 23 then
    raise exception 'Tras la errata debían quedar 23 programas territoriales de OFAC y hay %.', v_n;
  end if;

  select count(*) into v_n from regimen_sancion
   where autoridad = 'ofac' and leido_en = v_lectura and clase = 'personal';
  if v_n <> 14 then
    raise exception 'Tras la errata debían quedar 14 programas personales de OFAC y hay %.', v_n;
  end if;

  select count(*) into v_n from regimen_pais where regimen_id = v_balk;
  if v_n <> 8 then
    raise exception 'Balcanes debía alcanzar 8 jurisdicciones y alcanza %.', v_n;
  end if;

  perform public.registrar_evento(
    (select id from organizations where es_referencia and 'XII' = any(sectores) limit 1),
    'errata_regimenes_sanciones', 'regimen_sancion', v_paarss,
    jsonb_build_object(
      'fuente', 'Kawiil Mx · Célula de Cumplimiento, Adenda 4 del 01/09/2026.',
      'errata', 'La Adenda 3 clasificó PAARSS como territorial y lo mapeó a Siria. La OE 14312 '
             || 'del 30/06/2025 revocó las sanciones amplias sobre Siria y OFAC eliminó las Syrian '
             || 'Sanctions Regulations con efecto del 26/08/2025. PAARSS designa personas: es '
             || 'personal y no produce país.',
      'recuento', 'OFAC pasa de 24 territoriales y 13 personales a 23 y 14.',
      'siria', 'De riesgo alto a atención, con derivación escrita. Estaba en producción como '
            || 'riesgo alto por una vía que no existe: un falso positivo vivo.',
      'balcanes', '31 CFR § 588.315 define el alcance como el territorio de la antigua RFSY más '
               || 'Albania: ocho jurisdicciones. Croacia y Eslovenia entran en atención por ser '
               || 'miembros de la Unión Europea y haber dejado de ser destino de las '
               || 'designaciones; marcarlas como riesgo alto produciría falsos positivos sin '
               || 'ganancia de detección.',
      'interpretacion', 'La traducción de «territorio de la antigua RFSY» a siete jurisdicciones '
                     || 'actuales es de Kawiil, no del reglamento.',
      'pendiente', 'Cuántos puntos suma el nivel de atención. La variable de país tiene tres '
                || 'claves y ninguna corresponde a «en atención»; elegir un valor sería inventar '
                || 'metodología. Hoy se almacena, se proyecta y se muestra, y NO levanta el piso.'
    ),
    'sistema', null
  );
end $$;



-- #####################################################################
-- PASO 3 · La proyección con el tercer nivel
-- #####################################################################
-- =====================================================================
-- La proyección, con el tercer nivel y su inversión
-- =====================================================================
-- Cambia respecto de la 0053 en tres cosas:
--
--   · Honra el nivel POR PAÍS de `regimen_pais` cuando está puesto.
--   · Traduce el tercer nivel al entero 1, no al 3. La adenda llama «nivel 3» a
--     la simple atención y esta columna llama 3 a lo más severo: escribir un 3
--     porque la adenda dice «3» dejaría a Siria calificada como jurisdicción
--     bajo embargo, que es lo contrario de lo que la Adenda 4 resolvió.
--   · Suma el catálogo de atención, que no viene de ningún régimen.
drop function if exists public.proyectar_sanciones_a_paises(date);
create or replace function public.proyectar_sanciones_a_paises(
  p_lectura date default date '2026-09-01'
)
returns table (organizacion text, lista text, vigentes int, cerradas int)
language plpgsql security definer set search_path = public as $$
declare
  v_org       uuid;
  v_nombre    text;
  v_fuente    fuente_lista;
  v_autoridad text;
  v_vigentes  int;
  v_cerradas  int;
begin
  if not public.puede_provisionar() then
    raise exception 'Sólo un administrador de Kawiil puede proyectar las listas de sanciones.';
  end if;

  if not exists (select 1 from regimen_sancion where leido_en = p_lectura) then
    raise exception 'No hay regímenes cargados con fecha de lectura %. Corre primero el cargador.', p_lectura;
  end if;

  for v_org, v_nombre in select id, razon_social from organizations order by razon_social loop
    foreach v_autoridad in array array['onu', 'ofac', 'atencion'] loop
      v_fuente := case v_autoridad
                    when 'onu' then 'onu'::fuente_lista
                    when 'ofac' then 'ofac_sancionado'::fuente_lista
                    -- El catálogo propio va con fuente `manual`: es criterio de
                    -- Kawiil y no de una autoridad externa, y atribuirlo a la
                    -- ONU o a OFAC sería decir que lo dijo alguien que no lo dijo.
                    else 'manual'::fuente_lista
                  end;

      -- El conjunto que debe quedar vigente, en una tabla temporal para poder
      -- compararlo con lo que hay.
      create temp table nuevo_conjunto (
        iso2 text primary key, nombre text, nivel int, detalle text
      ) on commit drop;

      if v_autoridad = 'atencion' then
        insert into nuevo_conjunto
        select ja.iso2, ja.nombre, 1, ja.derivacion
          from jurisdiccion_atencion ja
         where ja.vigente_hasta is null;
      else
        insert into nuevo_conjunto
        select x.iso2,
               coalesce(cv.descripcion, x.iso2),
               -- LA TRADUCCIÓN, en un solo sitio de todo el sistema. El entero
               -- de esta tabla va AL REVÉS que los niveles de la adenda: aquí 3
               -- es lo más severo y allá el 1. Escribir un 3 porque la adenda
               -- dice «nivel 3» dejaría a una jurisdicción de simple atención
               -- calificada como si estuviera bajo embargo.
               case min(case x.nivel when 'prohibicion' then 1
                                     when 'riesgo_alto' then 2 else 3 end)
                 when 1 then 3
                 when 2 then 2
                 else 1
               end,
               string_agg(x.detalle, ' · ' order by x.detalle)
          from (
            select rp.iso2,
                   coalesce(rp.nivel_territorial, r.nivel_territorial) as nivel,
                   r.clave || coalesce(' [' || rp.nivel_territorial || ': ' || rp.derivacion || ']', '')
                     as detalle
              from regimen_sancion r
              join regimen_pais rp on rp.regimen_id = r.id
             where r.leido_en = p_lectura
               and r.autoridad = v_autoridad
               and r.vigente
               and r.clase in ('territorial', 'mixto')
               and coalesce(rp.nivel_territorial, r.nivel_territorial) is not null
          ) x
          left join catalogo_valor cv
                 on cv.clave = x.iso2 and cv.vigente_hasta is null
                and cv.catalogo_id = (select id from catalogo_sat where codigo = 'pais')
         group by x.iso2, cv.descripcion;
      end if;

      -- Poner el conjunto nuevo. Upsert y NO «cerrar todo y volver a insertar»:
      -- el índice único es (organización, país, fuente, vigente_desde), así que
      -- reproyectar el MISMO día cerraba las filas y el insert chocaba con
      -- ellas sin poner nada. El resultado era una organización con cero
      -- jurisdicciones vigentes y ninguna señal de que algo hubiera pasado, que
      -- es la peor forma de fallar que tiene esto.
      insert into country_risk_list
        (organization_id, iso2, nombre, nivel, fuente, vigente_desde, plenario, notas)
      select v_org, n.iso2, n.nombre, n.nivel, v_fuente, p_lectura,
             'lectura ' || to_char(p_lectura, 'DD/MM/YYYY'), n.detalle
        from nuevo_conjunto n
          on conflict (organization_id, iso2, fuente, vigente_desde) do update
         set nombre = excluded.nombre,
             nivel = excluded.nivel,
             notas = excluded.notas,
             plenario = excluded.plenario,
             vigente_hasta = null;
      get diagnostics v_vigentes = row_count;

      -- Y cerrar SÓLO lo que ya no está en el conjunto nuevo. Con
      -- `vigente_hasta` y no con un delete: un expediente calificado contra una
      -- fila tiene que poder explicarse después.
      update country_risk_list c
         set vigente_hasta = greatest(p_lectura, c.vigente_desde)
       where c.organization_id = v_org
         and c.fuente = v_fuente
         and c.vigente_hasta is null
         and not exists (select 1 from nuevo_conjunto n where n.iso2 = c.iso2);
      get diagnostics v_cerradas = row_count;

      drop table nuevo_conjunto;

      organizacion := v_nombre;
      lista := case v_autoridad when 'atencion' then 'atención (criterio propio)' else v_autoridad end;
      vigentes := v_vigentes;
      cerradas := v_cerradas;
      return next;
    end loop;

    perform public.registrar_evento(
      v_org, 'sanciones_proyectadas', 'country_risk_list', null,
      jsonb_build_object(
        'lectura', p_lectura,
        'fuente', 'Kawiil Mx · Adendas 3 y 4 del 01/09/2026, leídas de las páginas oficiales del '
               || 'Consejo de Seguridad y de OFAC el 01/09/2026.',
        'criterio', 'Sólo los regímenes territoriales y mixtos. Los personales no producen '
                 || 'países: un programa de contraterrorismo designa personas, y meterlas en '
                 || 'una variable de país marca a quien no debe y deja de marcar a quien sí.',
        'traduccion_de_nivel', 'El entero de country_risk_list va al revés que los niveles de la '
                            || 'adenda: aquí 3 es lo más severo y allá el 1. prohibición→3, '
                            || 'riesgo alto→2, atención→1. La traducción vive sólo en esta función.',
        'nivel_por_pais', 'Un régimen puede alcanzar jurisdicciones a niveles distintos —Balcanes '
                       || 'incluye a Croacia y Eslovenia, miembros de la UE— y la excepción exige '
                       || 'derivación escrita.',
        'idempotencia', 'Upsert y cierre selectivo. Cerrar todo y volver a insertar dejaba la '
                     || 'lista VACÍA al reproyectar el mismo día, porque el índice único incluye '
                     || 'vigente_desde y el insert chocaba con las filas recién cerradas.',
        'no_borrado', 'Lo que sale se cierra con vigente_hasta, no se borra: los expedientes '
                   || 'calificados contra esas filas tienen que poder explicarse.'
      ),
      'persona', auth.uid()
    );
  end loop;
end $$;

revoke all on function public.proyectar_sanciones_a_paises(date) from public, anon, authenticated;
grant execute on function public.proyectar_sanciones_a_paises(date) to authenticated;



-- #####################################################################
-- PASO 4 · El cargador corregido
-- #####################################################################
-- =====================================================================
-- El cargador también, o la errata se deshace sola
-- =====================================================================
-- Lo cazó la prueba de comportamiento de la 0053: corregir las filas no basta.
-- `cargar_regimenes_2026_09` lleva la clasificación y el mapeo de países
-- escritos dentro, así que la primera recarga volvía a poner PAARSS como
-- territorial y a mapearle Siria. Una corrección que la siguiente ejecución
-- deshace no es una corrección.
--
-- Se redefine la función completa. La 0053 se queda como está —es el registro
-- de lo que se aplicó ese día— y un proyecto nuevo corre las dos en orden y
-- acaba igual que producción.
create or replace function public.cargar_regimenes_2026_09()
returns table (autoridad_leida text, regimenes int, jurisdicciones int)
language plpgsql security definer set search_path = public as $$
declare
  v_lectura   constant date := date '2026-09-01';
  v_esp_onu   constant int  := 15;
  v_esp_ofac  constant int  := 37;
  -- Tras la errata de la Adenda 4: PAARSS pasa de territorial a personal.
  v_esp_terr  constant int  := 23;
  v_esp_pers  constant int  := 14;
  v_n         int;
  v_faltan    text;
begin
  if not public.puede_provisionar() then
    raise exception 'Sólo un administrador de Kawiil puede cargar regímenes de sanciones.';
  end if;

  -- La clasificación de los que YA están se pone al día: la fuente cambia y
  -- las adendas corrigen. Sin esto, la errata volvía a aparecer en la primera
  -- recarga y una corrección que la siguiente ejecución deshace no es una
  -- corrección. Lo cazó la prueba de comportamiento de la 0053.
  update regimen_sancion
     set clase = 'personal', nivel_territorial = null
   where autoridad = 'ofac' and leido_en = v_lectura
     and clave = 'Promoting Accountability for Assad and Regional Stabilization (PAARSS)'
     and clase <> 'personal';

  -- -----------------------------------------------------------------
  -- ONU · los 15 comités del Consejo de Seguridad
  -- -----------------------------------------------------------------
  -- La clave es el NÚMERO DE RESOLUCIÓN, que es el identificador estable. Los
  -- nombres de los comités cambian de forma; las resoluciones no.
  insert into regimen_sancion (autoridad, clave, nombre, clase, nivel_territorial, leido_en, notas)
  values
    ('onu', '2713', 'Al-Shabaab Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura, null),
    -- No tiene país: designa personas y entidades asociadas a ISIL y Al-Qaida
    -- en cualquier jurisdicción. No debe alimentar la variable de país.
    ('onu', '1267', 'ISIL (Da''esh) & Al-Qaida Sanctions Committee', 'tematico', null, v_lectura,
     'Designa personas y entidades en cualquier jurisdicción. No produce países: va al cribado de nombres.'),
    ('onu', '1518', '1518 Sanctions Committee (Iraq)', 'territorial', 'riesgo_alto', v_lectura, null),
    ('onu', '1533', 'The Democratic Republic of Congo Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura, null),
    ('onu', '1591', 'The Sudan Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura, null),
    -- Régimen de designación individual sin designados actuales. Se incluye por
    -- completitud; conviene distinguirlo de los que tienen medidas territoriales
    -- activas, y por eso lo dice su nota.
    ('onu', '1636', '1636 Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura,
     'Nace de la investigación del atentado contra Rafiq Hariri. Designación individual sin designados actuales.'),
    ('onu', '1718', '1718 Sanctions Committee (DPRK)', 'territorial', 'riesgo_alto', v_lectura, null),
    ('onu', '1737', '1737 Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura, null),
    ('onu', '1970', 'Libya Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura, null),
    -- Designa personas asociadas al Talibán. Es defendible mapearlo a
    -- Afganistán para la variable de país y OBLIGATORIO tratarlo como lista de
    -- personas. Se hacen las dos cosas y se marca mixto.
    ('onu', '1988', '1988 Sanctions Committee', 'mixto', 'riesgo_alto', v_lectura,
     'Designa personas asociadas al Talibán. Alimenta la variable de país (Afganistán) Y el cribado de nombres.'),
    ('onu', '2048', 'Guinea-Bissau Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura, null),
    ('onu', '2140', '2140 Sanctions Committee (Yemen)', 'territorial', 'riesgo_alto', v_lectura, null),
    ('onu', '2206', 'South Sudan Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura, null),
    ('onu', '2653', '2653 Sanctions Committee (Haiti)', 'territorial', 'riesgo_alto', v_lectura, null),
    -- No lleva el país en el nombre; su página de medidas confirma que se
    -- refiere a la República Centroafricana.
    ('onu', '2745', '2745 Sanctions Committee', 'territorial', 'riesgo_alto', v_lectura,
     'El nombre no lleva el país. Su página de medidas confirma que se refiere a la República Centroafricana.')
  on conflict (autoridad, clave, leido_en) do nothing;

  -- Las catorce jurisdicciones de la ONU, por resolución.
  insert into regimen_pais (regimen_id, iso2)
  select r.id, m.iso2
    from (values
      ('2713', 'SO'), ('1518', 'IQ'), ('1533', 'CD'), ('1591', 'SD'),
      ('1636', 'LB'), ('1718', 'KP'), ('1737', 'IR'), ('1970', 'LY'),
      ('1988', 'AF'), ('2048', 'GW'), ('2140', 'YE'), ('2206', 'SS'),
      ('2653', 'HT'), ('2745', 'CF')
    ) as m(clave, iso2)
    join regimen_sancion r
      on r.autoridad = 'onu' and r.clave = m.clave and r.leido_en = v_lectura
      on conflict do nothing;

  -- -----------------------------------------------------------------
  -- OFAC · los 37 programas activos
  -- -----------------------------------------------------------------
  -- La clave es el NOMBRE EXACTO del programa, que es lo que OFAC publica de
  -- forma estable. `actualizado_fuente` es su «Program Last Updated».
  --
  -- La columna `clase` NO es de OFAC. OFAC dice expresamente que no mantiene
  -- una lista de países; la separación territorial/personal la hace Kawiil a
  -- partir del objeto de cada programa. Veintitrés territoriales y catorce
  -- personales, tras la errata de PAARSS que corrigió la Adenda 4.
  insert into regimen_sancion (autoridad, clave, nombre, clase, nivel_territorial, actualizado_fuente, leido_en, notas)
  values
    ('ofac', 'Afghanistan-Related Sanctions', 'Afghanistan-Related Sanctions', 'territorial', 'riesgo_alto', date '2022-02-25', v_lectura, null),
    -- Su vinculación son «Balcanes occidentales», que no es un país. La Adenda
    -- 4 lo resolvió con la definición de 31 CFR § 588.315, y sus ocho
    -- jurisdicciones se cargan más abajo: seis heredan el nivel del régimen y
    -- Croacia y Eslovenia bajan a atención con su derivación escrita.
    ('ofac', 'Balkans-Related Sanctions', 'Balkans-Related Sanctions', 'territorial', 'riesgo_alto', date '2025-11-20', v_lectura,
     'Alcance definido en 31 CFR § 588.315: el territorio de la antigua República Federativa Socialista de Yugoslavia más Albania. La traducción de ese territorio a siete jurisdicciones actuales es interpretación de Kawiil, no del reglamento.'),
    ('ofac', 'Belarus Sanctions', 'Belarus Sanctions', 'territorial', 'riesgo_alto', date '2026-07-23', v_lectura, null),
    ('ofac', 'Burma-Related Sanctions', 'Burma-Related Sanctions', 'territorial', 'riesgo_alto', date '2026-05-28', v_lectura, null),
    ('ofac', 'Central African Republic Sanctions', 'Central African Republic Sanctions', 'territorial', 'riesgo_alto', date '2023-12-08', v_lectura, null),
    ('ofac', 'Chinese Military Companies Sanctions', 'Chinese Military Companies Sanctions', 'personal', null, date '2022-06-01', v_lectura,
     'Lista de empresas, no de jurisdicción. No produce países.'),
    ('ofac', 'Counter Narcotics Trafficking Sanctions', 'Counter Narcotics Trafficking Sanctions', 'personal', null, date '2026-08-20', v_lectura, null),
    ('ofac', 'Counter Terrorism Sanctions', 'Counter Terrorism Sanctions', 'personal', null, date '2026-08-28', v_lectura, null),
    ('ofac', 'Countering America''s Adversaries Through Sanctions Act-Related', 'Countering America''s Adversaries Through Sanctions Act-Related', 'personal', null, date '2026-02-24', v_lectura, null),
    ('ofac', 'Cuba Sanctions', 'Cuba Sanctions', 'territorial', 'prohibicion', date '2026-08-20', v_lectura,
     'Nivel 1: la propia OFAC cita a Cuba como ejemplo de programa «broad-based and oriented geographically».'),
    ('ofac', 'Cyber-Related Sanctions', 'Cyber-Related Sanctions', 'personal', null, date '2026-08-24', v_lectura, null),
    ('ofac', 'Democratic Republic of the Congo-Related Sanctions', 'Democratic Republic of the Congo-Related Sanctions', 'territorial', 'riesgo_alto', date '2026-07-10', v_lectura, null),
    ('ofac', 'Ethiopia-Related Sanctions', 'Ethiopia-Related Sanctions', 'territorial', 'riesgo_alto', date '2022-02-08', v_lectura, null),
    ('ofac', 'Foreign Interference in a United States Election Sanctions', 'Foreign Interference in a United States Election Sanctions', 'personal', null, date '2024-12-31', v_lectura, null),
    ('ofac', 'Global Magnitsky Sanctions', 'Global Magnitsky Sanctions', 'personal', null, date '2026-05-28', v_lectura, null),
    ('ofac', 'Hong Kong-Related Sanctions', 'Hong Kong-Related Sanctions', 'territorial', 'riesgo_alto', date '2026-07-17', v_lectura, null),
    ('ofac', 'Hostages and Wrongfully Detained U.S. Nationals Sanctions', 'Hostages and Wrongfully Detained U.S. Nationals Sanctions', 'personal', null, date '2025-03-25', v_lectura, null),
    ('ofac', 'International Criminal Court-Related Sanctions', 'International Criminal Court-Related Sanctions', 'personal', null, date '2026-08-18', v_lectura, null),
    ('ofac', 'Iran Sanctions', 'Iran Sanctions', 'territorial', 'prohibicion', date '2026-08-28', v_lectura,
     'Nivel 1: la propia OFAC cita a Irán como ejemplo de programa «broad-based and oriented geographically».'),
    ('ofac', 'Iraq-Related Sanctions', 'Iraq-Related Sanctions', 'territorial', 'riesgo_alto', date '2025-07-09', v_lectura, null),
    ('ofac', 'Lebanon-Related Sanctions', 'Lebanon-Related Sanctions', 'territorial', 'riesgo_alto', date '2026-02-27', v_lectura, null),
    ('ofac', 'Libya Sanctions', 'Libya Sanctions', 'territorial', 'riesgo_alto', date '2026-05-28', v_lectura, null),
    ('ofac', 'Magnitsky Sanctions', 'Magnitsky Sanctions', 'personal', null, date '2023-08-17', v_lectura,
     'De origen ruso, pero designa personas. No produce país.'),
    ('ofac', 'Mali-Related Sanctions', 'Mali-Related Sanctions', 'territorial', 'riesgo_alto', date '2026-05-28', v_lectura,
     'El régimen de la ONU sobre Malí terminó en 2023; el programa de OFAC sigue activo. Son fuentes independientes.'),
    ('ofac', 'Nicaragua-related Sanctions', 'Nicaragua-related Sanctions', 'territorial', 'riesgo_alto', date '2026-04-16', v_lectura, null),
    ('ofac', 'Non-Proliferation Sanctions', 'Non-Proliferation Sanctions', 'personal', null, date '2026-08-24', v_lectura, null),
    ('ofac', 'North Korea Sanctions', 'North Korea Sanctions', 'territorial', 'prohibicion', date '2026-03-12', v_lectura,
     'Nivel 1 por embargo amplio y territorial.'),
    -- ERRATA de la Adenda 3, corregida por la Adenda 4: es PERSONAL. La OE
    -- 14312 del 30/06/2025 revocó las sanciones amplias sobre Siria y OFAC
    -- eliminó las Syrian Sanctions Regulations con efecto del 26/08/2025.
    -- PAARSS autoriza designaciones sobre personas: no produce país.
    ('ofac', 'Promoting Accountability for Assad and Regional Stabilization (PAARSS)', 'Promoting Accountability for Assad and Regional Stabilization (PAARSS)', 'personal', null, date '2026-08-24', v_lectura,
     'Designa a Bashar al-Assad y asociados. No produce jurisdicción: Siria pasa al nivel de atención por el catálogo propio (Adenda 4, apartado 3).'),
    ('ofac', 'Rough Diamond Trade Controls', 'Rough Diamond Trade Controls', 'personal', null, date '2018-06-18', v_lectura, null),
    ('ofac', 'Russian Harmful Foreign Activities Sanctions', 'Russian Harmful Foreign Activities Sanctions', 'territorial', 'riesgo_alto', date '2026-08-26', v_lectura, null),
    ('ofac', 'Somalia Sanctions', 'Somalia Sanctions', 'territorial', 'riesgo_alto', date '2023-05-24', v_lectura, null),
    ('ofac', 'South Sudan-Related Sanctions', 'South Sudan-Related Sanctions', 'territorial', 'riesgo_alto', date '2023-12-08', v_lectura, null),
    ('ofac', 'Sudan and Darfur Sanctions', 'Sudan and Darfur Sanctions', 'territorial', 'riesgo_alto', date '2026-06-26', v_lectura, null),
    ('ofac', 'Transnational Criminal Organizations', 'Transnational Criminal Organizations', 'personal', null, date '2026-06-23', v_lectura, null),
    -- La adenda lo vincula a «Ucrania y Rusia» y lo cuenta entre los
    -- territoriales de nivel 2. El nivel 1 alcanza sólo a «las regiones
    -- cubiertas de Ucrania», no al país entero, y un ISO2 no distingue
    -- regiones. La Adenda 4 lo resolvió con una dimensión de subdivisión ISO
    -- 3166-2 —instrucciones 35 y 36—, que está pendiente de construir.
    ('ofac', 'Ukraine-/Russia-related Sanctions', 'Ukraine-/Russia-related Sanctions', 'territorial', 'riesgo_alto', date '2026-05-08', v_lectura,
     'El nivel 1 alcanza sólo las regiones cubiertas de Ucrania, no el país entero. Un ISO2 no distingue regiones; pendiente de criterio.'),
    ('ofac', 'Venezuela-Related Sanctions', 'Venezuela-Related Sanctions', 'territorial', 'riesgo_alto', date '2026-08-27', v_lectura, null),
    ('ofac', 'Yemen-related Sanctions', 'Yemen-related Sanctions', 'territorial', 'riesgo_alto', date '2021-11-18', v_lectura, null)
  on conflict (autoridad, clave, leido_en) do nothing;

  -- Las jurisdicciones de los programas territoriales de OFAC, con las seis de
  -- Balcanes que heredan el nivel del régimen. PAARSS no aparece: designa
  -- personas y no produce país.
  insert into regimen_pais (regimen_id, iso2)
  select r.id, m.iso2
    from (values
      ('Afghanistan-Related Sanctions', 'AF'),
      ('Belarus Sanctions', 'BY'),
      ('Burma-Related Sanctions', 'MM'),
      ('Central African Republic Sanctions', 'CF'),
      ('Cuba Sanctions', 'CU'),
      ('Democratic Republic of the Congo-Related Sanctions', 'CD'),
      ('Ethiopia-Related Sanctions', 'ET'),
      ('Hong Kong-Related Sanctions', 'HK'),
      ('Iran Sanctions', 'IR'),
      ('Iraq-Related Sanctions', 'IQ'),
      ('Lebanon-Related Sanctions', 'LB'),
      ('Libya Sanctions', 'LY'),
      ('Mali-Related Sanctions', 'ML'),
      ('Nicaragua-related Sanctions', 'NI'),
      ('North Korea Sanctions', 'KP'),
      ('Russian Harmful Foreign Activities Sanctions', 'RU'),
      ('Somalia Sanctions', 'SO'),
      ('South Sudan-Related Sanctions', 'SS'),
      ('Sudan and Darfur Sanctions', 'SD'),
      ('Ukraine-/Russia-related Sanctions', 'UA'),
      ('Ukraine-/Russia-related Sanctions', 'RU'),
      ('Venezuela-Related Sanctions', 'VE'),
      ('Yemen-related Sanctions', 'YE'),
      -- Los seis de Balcanes que heredan el nivel del régimen. Croacia y
      -- Eslovenia van aparte, con su excepción de nivel y su derivación.
      ('Balkans-Related Sanctions', 'AL'),
      ('Balkans-Related Sanctions', 'BA'),
      ('Balkans-Related Sanctions', 'MK'),
      ('Balkans-Related Sanctions', 'ME'),
      ('Balkans-Related Sanctions', 'RS'),
      ('Balkans-Related Sanctions', 'XK')
    ) as m(clave, iso2)
    join regimen_sancion r
      on r.autoridad = 'ofac' and r.clave = m.clave and r.leido_en = v_lectura
      on conflict do nothing;


  -- Las dos jurisdicciones de Balcanes que bajan de nivel, con su derivación.
  -- El check de la tabla no admite una sin la otra: una excepción al nivel del
  -- régimen sin justificación escrita es indistinguible de un error de carga.
  insert into regimen_pais (regimen_id, iso2, nivel_territorial, derivacion)
  select r.id, m.iso2, 'atencion', m.derivacion
    from (values
      ('HR', 'Croacia está dentro de la definición reglamentaria del programa, pero dejó de ser '
           || 'destino de sus designaciones y es Estado miembro de la Unión Europea desde 2013, lo '
           || 'que implica un marco de supervisión equivalente. Marcarla como riesgo alto '
           || 'produciría falsos positivos con costo reputacional y sin ganancia de detección. '
           || 'Adenda 4, apartado 1.'),
      ('SI', 'Eslovenia está dentro de la definición reglamentaria del programa, pero dejó de ser '
           || 'destino de sus designaciones y es Estado miembro de la Unión Europea desde 2004, lo '
           || 'que implica un marco de supervisión equivalente. Marcarla como riesgo alto '
           || 'produciría falsos positivos con costo reputacional y sin ganancia de detección. '
           || 'Adenda 4, apartado 1.')
    ) as m(iso2, derivacion)
    join regimen_sancion r
      on r.autoridad = 'ofac' and r.clave = 'Balkans-Related Sanctions' and r.leido_en = v_lectura
      on conflict (regimen_id, iso2) do update
     set nivel_territorial = excluded.nivel_territorial,
         derivacion = excluded.derivacion;

  -- Siria, al nivel de atención. No sale de ningún régimen —PAARSS designa
  -- personas y no produce país— así que entra por el catálogo propio.
  insert into jurisdiccion_atencion (iso2, nombre, derivacion)
  values ('SY', 'Siria',
    'Jurisdicción en transición tras la revocación de un régimen comprehensivo: la Orden '
    || 'Ejecutiva 14312 del 30/06/2025 revocó las sanciones amplias y OFAC eliminó las Syrian '
    || 'Sanctions Regulations con efecto del 26/08/2025. Quedan designaciones individuales '
    || 'activas bajo PAARSS, no hay régimen del Consejo de Seguridad propio, y está en la lista '
    || 'de monitoreo intensificado del GAFI. No es prohibición ni riesgo alto por programa '
    || 'territorial: es atención por historia reciente y por concentración de designados. '
    || 'Adenda 4, apartado 3.')
      on conflict (iso2) do update
     set derivacion = excluded.derivacion, nombre = excluded.nombre;

  -- Y por si la carga vieja dejó jurisdicciones colgando de un régimen que
  -- ahora designa personas: se limpian antes de comprobar.
  delete from regimen_pais rp
   using regimen_sancion r
   where r.id = rp.regimen_id and r.clase in ('personal', 'tematico');

  -- -----------------------------------------------------------------
  -- Que falle ruidosamente (instrucción 32)
  -- -----------------------------------------------------------------
  select count(*) into v_n from regimen_sancion where autoridad = 'onu' and leido_en = v_lectura;
  if v_n <> v_esp_onu then
    raise exception 'La ONU debía tener % regímenes en la lectura del % y hay %. Un cambio en una lista de sanciones no puede pasar en silencio.', v_esp_onu, v_lectura, v_n;
  end if;

  select count(*) into v_n from regimen_sancion where autoridad = 'ofac' and leido_en = v_lectura;
  if v_n <> v_esp_ofac then
    raise exception 'OFAC debía tener % programas en la lectura del % y hay %. Un cambio en una lista de sanciones no puede pasar en silencio.', v_esp_ofac, v_lectura, v_n;
  end if;

  -- También POR CLASE. Sin esta comprobación, una reclasificación silenciosa
  -- volvería a colar programas que designan personas en la variable de país, y
  -- el conteo total seguiría cuadrando.
  select count(*) into v_n from regimen_sancion
   where autoridad = 'ofac' and leido_en = v_lectura and clase = 'territorial';
  if v_n <> v_esp_terr then
    raise exception 'OFAC debía tener % programas territoriales y hay %.', v_esp_terr, v_n;
  end if;

  select count(*) into v_n from regimen_sancion
   where autoridad = 'ofac' and leido_en = v_lectura and clase = 'personal';
  if v_n <> v_esp_pers then
    raise exception 'OFAC debía tener % programas personales y hay %.', v_esp_pers, v_n;
  end if;

  select count(*) into v_n
    from regimen_pais rp join regimen_sancion r on r.id = rp.regimen_id
   where r.clase in ('personal', 'tematico');
  if v_n <> 0 then
    raise exception 'Hay % jurisdicciones colgando de regímenes que designan personas. Un programa personal no produce países.', v_n;
  end if;

  -- HUECOS CONOCIDOS Y DECLARADOS. 'SS': el catálogo de países de la UIF no
  -- incluye Sudán del Sur (ver la 0053 y la instrucción 47 de la Adenda 4).
  -- 'XK' para Kosovo es de uso convencional y tampoco es oficial en ISO 3166-1.
  select string_agg(distinct rp.iso2, ', ') into v_faltan
    from regimen_pais rp
    join regimen_sancion r on r.id = rp.regimen_id and r.leido_en = v_lectura
   where rp.iso2 not in ('SS', 'XK')
     and not exists (
       select 1 from catalogo_valor cv
         join catalogo_sat c on c.id = cv.catalogo_id and c.codigo = 'pais'
        where cv.clave = rp.iso2 and cv.vigente_hasta is null);
  if v_faltan is not null then
    raise exception 'Estos códigos de país no están en el catálogo de la UIF y no cruzarían con nada: %', v_faltan;
  end if;

  return query
    select r.autoridad, count(distinct r.id)::int, count(distinct rp.iso2)::int
      from regimen_sancion r
      left join regimen_pais rp on rp.regimen_id = r.id
     where r.leido_en = v_lectura
     group by r.autoridad
     order by r.autoridad;
end $$;

revoke all on function public.cargar_regimenes_2026_09() from public, anon, authenticated;
grant execute on function public.cargar_regimenes_2026_09() to authenticated;


-- #####################################################################
-- PASO 5 · Correr y comprobar
-- #####################################################################
-- Esperado: onu 15/14, ofac 37/30.
select * from public.cargar_regimenes_2026_09();

-- Esperado por organización: onu 14, ofac 30, atención 1. `cerradas` con lo
-- que salió (Siria por la vía de OFAC).
select * from public.proyectar_sanciones_a_paises();

-- Esperado: 33 por organización.
select o.razon_social,
       count(distinct c.iso2) filter (where c.fuente in ('onu','ofac_sancionado','manual')) as sancionadas,
       (select count(*) from public.diagnostico_organizacion(o.id) d where not d.listo) as banderas_rojas
  from organizations o
  left join country_risk_list c on c.organization_id = o.id and c.vigente_hasta is null
 group by o.id, o.razon_social
 order by 1;

-- Siria ya NO debe salir en nivel 2 por OFAC. Debe salir en nivel 1 por
-- `manual`, con su derivación. Croacia y Eslovenia en nivel 1; Albania y
-- Serbia en nivel 2.
select iso2, nivel, fuente, left(notas, 70) as detalle
  from country_risk_list
 where organization_id = (select id from organizations where es_referencia and 'XII' = any(sectores) limit 1)
   and iso2 in ('SY','HR','SI','AL','RS') and vigente_hasta is null
 order by iso2, fuente;

-- La lista de atención, por los dos caminos por los que se llega.
select * from v_jurisdiccion_atencion order by iso2;

-- Y que ningún régimen que designa PERSONAS haya quedado produciendo país.
-- Esperado: 0.
select count(*) as personales_con_pais
  from regimen_pais rp join regimen_sancion r on r.id = rp.regimen_id
 where r.clase in ('personal', 'tematico');
