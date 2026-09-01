-- =====================================================================
-- Ikán · Verificar las migrations 0045 y 0046 en UNA sola tabla
-- =====================================================================
-- El SQL Editor de Supabase sólo muestra el resultado de la última consulta,
-- así que las comprobaciones que vienen dentro de cada bundle no se alcanzan a
-- ver todas. Esto las junta en un solo resultado que se puede copiar entero.
--
-- SÓLO LEE. No escribe nada, no cambia nada, y se puede correr contra
-- producción las veces que haga falta.
--
-- Correr DESPUÉS de aplicar apply_0045 y apply_0046.
-- =====================================================================

with
orgs as (
  select count(distinct organization_id) n
    from country_risk_list where fuente in ('gafi_gris','gafi_negra')
),
gris as (
  select count(*) n from (
    select organization_id from country_risk_list
     where fuente = 'gafi_gris' and vigente_hasta is null
     group by organization_id having count(*) = 22) d
),
negra as (
  select count(*) n from (
    select organization_id from country_risk_list
     where fuente = 'gafi_negra' and vigente_hasta is null
     group by organization_id having count(*) = 3) d
),
duplicados as (
  select count(*) n from (
    select organization_id, iso2, fuente from country_risk_list
     where fuente in ('gafi_gris','gafi_negra') and vigente_hasta is null
     group by 1,2,3 having count(*) > 1) d
),
salieron as (
  select count(*) n from country_risk_list
   where iso2 in ('DZ','BF','HR','NG','ZW')
     and fuente in ('gafi_gris','gafi_negra') and vigente_hasta is null
),
altas as (
  select count(*) n from (
    select iso2 from country_risk_list
     where iso2 in ('BO','BA','IQ','VG','KW','LA','MC','NP','PG','SS','VN')
       and fuente = 'gafi_gris' and vigente_hasta is null
     group by iso2 having count(distinct organization_id) = (select n from orgs)) d
),
sin_plenario as (
  select count(*) n from country_risk_list
   where fuente in ('gafi_gris','gafi_negra')
     and vigente_hasta is null and plenario is null
),
cerrado as (
  select count(*) n from country_risk_list
   where fuente in ('gafi_gris','gafi_negra')
     and vigente_hasta is not null and plenario = '2025-02'
),
bitacora_gafi as (
  select count(*) n from evento_auditoria where tipo = 'snapshot_gafi_2026_06'
),
restriccion as (
  select count(*) n from pg_constraint
   where conrelid = 'public.operation'::regclass
     and conname = 'operation_efectivo_con_monto' and not convalidated
),
por_corregir as (
  select count(*) n from operation
   where forma_pago in ('mixto','efectivo') and coalesce(efectivo_mxn, 0) <= 0
),
bitacora_efectivo as (
  select count(*) n from evento_auditoria where tipo = 'candado_efectivo_sin_monto'
),
matriz as (
  select count(*) n from client_risk_template
   where sector = 'XII' and activa and version = 3
),
f as (
  select
    (select n from orgs) orgs, (select n from gris) gris, (select n from negra) negra,
    (select n from duplicados) dup, (select n from salieron) sal, (select n from altas) alt,
    (select n from sin_plenario) sinpl, (select n from cerrado) cerr,
    (select n from bitacora_gafi) bgafi, (select n from restriccion) restr,
    (select n from por_corregir) porcor, (select n from bitacora_efectivo) befe,
    (select n from matriz) mat
)
select * from (
  select 1 n, '0045 · Organizaciones con listas GAFI' c, '2 o más' esp, orgs::text obt,
         orgs >= 2 ok from f
  union all select 2, '0045 · Organizaciones con 22 grises vigentes', orgs::text, gris::text, gris = orgs from f
  union all select 3, '0045 · Organizaciones con 3 negras vigentes', orgs::text, negra::text, negra = orgs from f
  union all select 4, '0045 · Países duplicados en lista vigente', '0', dup::text, dup = 0 from f
  union all select 5, '0045 · Los 5 que salieron, aún vigentes', '0', sal::text, sal = 0 from f
  union all select 6, '0045 · Las 11 altas, en todas las orgs', '11', alt::text, alt = 11 from f
  union all select 7, '0045 · Filas GAFI vigentes sin plenario', '0', sinpl::text, sinpl = 0 from f
  union all select 8, '0045 · Snapshot 2025-02 cerrado y sellado', 'más de 0', cerr::text, cerr > 0 from f
  union all select 9, '0045 · Eventos de bitácora', orgs::text, bgafi::text, bgafi = orgs from f
  union all select 10, '0046 · Restricción existe y es NOT VALID', '1', restr::text, restr = 1 from f
  union all select 11, '0046 · Eventos de bitácora', 'más de 0', befe::text, befe > 0 from f
  union all select 12, '0046 · ACTOS POR CORREGIR (ver abajo)', '0', porcor::text, porcor = 0 from f
  union all select 13, 'Matriz XII v3 activa', '1', mat::text, mat = 1 from f
) d
order by n;

-- ---------------------------------------------------------------------
-- SÓLO si el renglón 12 salió distinto de 0
-- ---------------------------------------------------------------------
-- Cada renglón es un acto declarado como pagado en efectivo o mixto sobre el
-- que el artículo 32 nunca se evaluó. Se corrigen con el notario, mirando el
-- instrumento: NO se borran ni se les inventa un importe.
--
--   select id, fecha, monto_mxn, forma_pago,
--          contraparte ->> 'tipo_acto' as tipo_acto, instrumento_publico
--     from operation
--    where forma_pago in ('mixto','efectivo') and coalesce(efectivo_mxn, 0) <= 0
--    order by fecha desc;
