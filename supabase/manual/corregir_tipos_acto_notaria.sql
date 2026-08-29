-- ============================================================
-- Corrección · Tipos de acto de la notaría demo
-- ============================================================
-- Los actos sembrados usaban etiquetas inventadas
-- (compraventa_inmueble, poder_irrevocable, constitucion_sociedad,
-- fideicomiso) que NO existen en el layout de fe pública del SAT.
-- Un aviso armado con ellas falla la validación en el portal.
--
-- Se sustituyen por las oficiales del instructivo (rama 3.6.1.3).
-- Ver docs/layouts-sat/.
--
-- Idempotente: la segunda corrida no encuentra nada que cambiar.
-- ============================================================

select 'ANTES' as momento,
       contraparte->>'tipo_acto' as tipo_acto,
       count(*) as operaciones
from operation
where contraparte ? 'tipo_acto'
group by 1, 2 order by 2;

update operation
   set contraparte = jsonb_set(
         contraparte,
         '{tipo_acto}',
         to_jsonb(
           case contraparte->>'tipo_acto'
             when 'compraventa_inmueble'   then 'transmision_inmueble'
             when 'poder_irrevocable'      then 'otorgamiento_poder'
             when 'constitucion_sociedad'  then 'constitucion_personas_morales'
             when 'fideicomiso'            then 'constitucion_modificacion_fideicomiso'
             else contraparte->>'tipo_acto'
           end
         ))
 where contraparte->>'tipo_acto' in
       ('compraventa_inmueble', 'poder_irrevocable', 'constitucion_sociedad', 'fideicomiso');

-- La tipología XII-02 coteja contra el valor del acto: si no se actualiza,
-- deja de disparar en silencio, que es peor que fallar.
update tipologia_av
   set regla_dsl = jsonb_set(regla_dsl, '{valores}', '["otorgamiento_poder"]'::jsonb)
 where sector = 'XII'
   and regla_dsl->>'campo' = 'contraparte.tipo_acto'
   and regla_dsl->'valores' ? 'poder_irrevocable';

select 'DESPUES' as momento,
       contraparte->>'tipo_acto' as tipo_acto,
       count(*) as operaciones,
       case contraparte->>'tipo_acto'
         when 'transmision_inmueble' then 'DeclaraNOT'
         else 'SPPLD'
       end as canal
from operation
where contraparte ? 'tipo_acto'
group by 1, 2 order by 2;

-- La tipología debe cotejar el valor nuevo.
select codigo, regla_dsl->'valores' as coteja_contra
from tipologia_av where sector = 'XII' and regla_dsl->>'campo' = 'contraparte.tipo_acto';
