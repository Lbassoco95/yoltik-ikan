-- =====================================================================
-- Ikán · Los actos de la notaría y qué tipología los mira
-- =====================================================================
-- SÓLO LECTURA. Es el ensayo en seco del demo: sin correr el motor, enseña qué
-- hay capturado y si alguna tipología lo está mirando.
--
-- Existe porque el SELECT de la 0030 devolvió cero constituciones de persona
-- moral y cero fideicomisos en una notaría que tiene seis actos. O los actos
-- son otros, o su `tipo_acto` no es el que buscan las tipologías.
--
-- Y esa segunda posibilidad es la peligrosa: una tipología `lookup` que coteja
-- contra un valor que nadie escribe NO falla, simplemente no dispara. En el
-- demo eso se ve como una bandeja tranquila, que es lo peor que puede pasar en
-- un producto de cumplimiento.
-- =====================================================================

drop table if exists pg_temp.ikan_actos;
create temp table ikan_actos (seccion text, orden int, que text, detalle text, dato text);

-- ---------------------------------------------------------------------
-- 1. Qué actos hay, y a cuántas UMA equivalen
-- ---------------------------------------------------------------------
insert into ikan_actos
select '1 · Actos capturados',
       row_number() over (order by o.fecha)::int,
       coalesce(o.contraparte->>'tipo_acto', '(sin tipo_acto)'),
       to_char(o.monto_mxn, 'FM$999,999,990.00')
         || ' = ' || to_char(o.monto_mxn / nullif(public.parametro_vigente('uma_diaria'), 0), 'FM999,999') || ' UMA',
       to_char(o.fecha, 'DD/MM/YYYY')
from public.operation o
where o.organization_id = '12121212-1212-1212-1212-121212121212';

-- ---------------------------------------------------------------------
-- 2. Las tipologías activas y contra qué cotejan
-- ---------------------------------------------------------------------
insert into ikan_actos
select '2 · Tipologías activas', row_number() over (order by t.codigo)::int,
       t.codigo || ' v' || t.version,
       case t.regla_dsl->>'tipo'
         when 'lookup' then 'coteja ' || (t.regla_dsl->>'campo') || ' contra '
                            || coalesce((t.regla_dsl->'valores')::text, (t.regla_dsl->'fuentes')::text, '?')
         when 'agregado' then 'suma ' || (t.regla_dsl->'ventana')::text || ' >= '
                            || coalesce(t.regla_dsl->'condicion'->'suma_monto_uma'->>'valor', '?') || ' UMA'
         else t.regla_dsl->>'tipo'
       end,
       t.nombre
from public.tipologia_av t
where t.organization_id = '12121212-1212-1212-1212-121212121212' and t.activa;

-- ---------------------------------------------------------------------
-- 3. LO QUE IMPORTA: actos que ninguna tipología `lookup` menciona
-- ---------------------------------------------------------------------
-- Se excluyen los que sí tienen una regla de MONTO que los cubre: un acto
-- puede dispararse por importe sin aparecer en ninguna lista de valores, y
-- marcarlo aquí sería un falso positivo. Lo que queda son los actos que
-- ninguna regla mira, ni por tipo ni por monto.
insert into ikan_actos
select '3 · Sin tipología que los mire', 1,
       coalesce(o.contraparte->>'tipo_acto', '(sin tipo_acto)'),
       count(*) || ' acto(s)',
       'NINGUNA tipología activa lo mira: ni por tipo de acto ni por monto'
from public.operation o
where o.organization_id = '12121212-1212-1212-1212-121212121212'
  and not exists (
    select 1 from public.tipologia_av t
     where t.organization_id = o.organization_id and t.activa
       and t.regla_dsl->>'campo' = 'contraparte.tipo_acto'
       and t.regla_dsl->'valores' ? (o.contraparte->>'tipo_acto'))
  -- ni una regla de monto que ya lo alcance
  and not exists (
    select 1 from public.tipologia_av t
     where t.organization_id = o.organization_id and t.activa
       and t.regla_dsl->>'tipo' = 'agregado'
       and o.monto_mxn >= (t.regla_dsl->'condicion'->'suma_monto_uma'->>'valor')::numeric
                          * public.parametro_vigente('uma_diaria'))
group by 1, 2, coalesce(o.contraparte->>'tipo_acto', '(sin tipo_acto)');

insert into ikan_actos
select '3 · Sin tipología que los mire', 2, 'ninguno',
       'todos los actos capturados los mira al menos una tipología activa', ''
where not exists (select 1 from ikan_actos where seccion = '3 · Sin tipología que los mire');

-- ---------------------------------------------------------------------
-- 4. Lo que el motor ya produjo
-- ---------------------------------------------------------------------
insert into ikan_actos
select '4 · Hallazgos', row_number() over (order by h.creado_en)::int,
       coalesce(t.codigo, '(tipología borrada)') || ' v' || coalesce(t.version::text, '?'),
       h.estado::text,
       to_char(h.creado_en, 'DD/MM/YYYY HH24:MI')
from public.hallazgo h
left join public.tipologia_av t on t.id = h.tipologia_id
where h.organization_id = '12121212-1212-1212-1212-121212121212';

select seccion, orden, que, detalle, dato from ikan_actos order by seccion, orden, que;
