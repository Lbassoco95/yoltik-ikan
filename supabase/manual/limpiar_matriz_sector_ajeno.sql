-- ============================================================
-- Limpieza · Matrices de un sector que la organización no opera
-- ============================================================
-- Origen del problema: MatrizRiesgoPage tenía el sector clavado a 'XVI'.
-- Al entrar con la notaría, la pantalla pedía la matriz de un exchange; si
-- alguien pulsaba «Nueva versión» y publicaba, quedaba una plantilla XVI
-- (el esqueleto "Elemento 1 / Pregunta 1", bandas 0-1/2-3/4-5) dentro de una
-- organización que sólo opera XII.
--
-- Eso no era sólo cosmético: `getPlantillaRiesgoActiva()` no filtraba por
-- sector, y el índice único permite una plantilla activa POR SECTOR, así que
-- un compareciente podía evaluarse con la matriz equivocada.
--
-- Este script borra únicamente las plantillas cuyo sector NO está en
-- `organizations.sectores`, y sólo si ningún cliente fue evaluado con ellas.
-- Si alguna tiene evaluaciones, la deja y lo reporta: borrarla se llevaría
-- por delante el historial de riesgo de un cliente.
-- ============================================================

-- 1. Qué hay
select 'ANTES' as momento,
       o.razon_social,
       o.sectores::text as sectores_de_la_org,
       t.sector::text   as sector_de_la_matriz,
       t.version,
       t.activa,
       t.estado::text,
       (select count(*) from client_risk_assessment a where a.template_id = t.id) as evaluaciones,
       case
         when t.sector::text = any (o.sectores::text[]) then 'correcta'
         else 'AJENA — sobra'
       end as diagnostico
from client_risk_template t
join organizations o on o.id = t.organization_id
order by o.razon_social, t.sector, t.version;

-- 2. Borrar sólo las ajenas y sin evaluaciones
delete from client_risk_template t
using organizations o
where o.id = t.organization_id
  and not (t.sector::text = any (o.sectores::text[]))
  and not exists (select 1 from client_risk_assessment a where a.template_id = t.id);

-- 3. Qué quedó. No debe aparecer ninguna 'AJENA'.
select 'DESPUES' as momento,
       o.razon_social,
       t.sector::text as sector_de_la_matriz,
       t.version,
       t.activa,
       (select count(*) from client_risk_assessment a where a.template_id = t.id) as evaluaciones,
       case
         when t.sector::text = any (o.sectores::text[]) then 'correcta'
         else 'AJENA — tiene evaluaciones, se conservó a propósito'
       end as diagnostico
from client_risk_template t
join organizations o on o.id = t.organization_id
order by o.razon_social, t.sector, t.version;
