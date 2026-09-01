-- =====================================================================
-- Pruebas de comportamiento de la 0045 · snapshot GAFI junio 2026
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql, nunca contra
-- el remoto.
--
-- Lo que hay que demostrar:
--
--   · Que los cinco países que el GAFI QUITÓ dejaron de calificar. Es lo que
--     más fácil se rompe con un update en sitio, y lo que peor se nota: un país
--     que salió de la lista hace año y medio sumando riesgo en silencio.
--
--   · Que los once que ENTRARON califican, en TODAS las organizaciones.
--
--   · Que el snapshot anterior se conserva cerrado y sellado con su plenario.
--     Sin él, los expedientes que calificó no se pueden explicar.
--
--   · Que correrla dos veces no duplica nada. Es la comprobación que cazó un
--     defecto real de esta migration.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_n     int;
  v_txt   text;
  v_orgs  int;
  v_msg   text;
begin
  select count(distinct organization_id) into v_orgs
    from country_risk_list where fuente in ('gafi_gris','gafi_negra');

  -- ------------------------------------------------------------------
  -- 1. Los cinco que salieron ya no califican
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from country_risk_list
   where iso2 in ('DZ','BF','HR','NG','ZW')
     and fuente in ('gafi_gris','gafi_negra') and vigente_hasta is null;
  insert into resultado values (1, 'Argelia, Burkina Faso, Croacia, Nigeria y Zimbabue salieron',
    '0 vigentes', v_n::text || ' vigentes', v_n = 0);

  -- ...pero siguen en el registro, cerrados: no se borraron.
  select count(*) into v_n
    from country_risk_list
   where iso2 in ('DZ','BF','HR','NG','ZW') and vigente_hasta is not null;
  insert into resultado values (2, 'Y siguen en el registro, cerrados',
    'más de 0', v_n::text, v_n > 0);

  -- ------------------------------------------------------------------
  -- 3. Las once altas califican en todas las organizaciones
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from (select iso2 from country_risk_list
           where iso2 in ('BO','BA','IQ','VG','KW','LA','MC','NP','PG','SS','VN')
             and fuente = 'gafi_gris' and vigente_hasta is null
           group by iso2 having count(distinct organization_id) = v_orgs) d;
  insert into resultado values (3, 'Las 11 altas, en todas las organizaciones',
    '11', v_n::text, v_n = 11);

  -- ------------------------------------------------------------------
  -- 4. Veintidós grises y tres negras por organización
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from (select organization_id from country_risk_list
           where fuente = 'gafi_gris' and vigente_hasta is null
           group by organization_id having count(*) <> 22) d;
  insert into resultado values (4, 'Cada organización con 22 grises',
    '0 con otra cuenta', v_n::text || ' con otra cuenta', v_n = 0);

  select count(*) into v_n
    from (select organization_id from country_risk_list
           where fuente = 'gafi_negra' and vigente_hasta is null
           group by organization_id having count(*) <> 3) d;
  insert into resultado values (5, 'Cada organización con 3 negras',
    '0 con otra cuenta', v_n::text || ' con otra cuenta', v_n = 0);

  -- ------------------------------------------------------------------
  -- 6. Ningún país duplicado en la lista vigente
  -- ------------------------------------------------------------------
  -- Cazó un defecto real: al correr la migration dos veces recalculaba la fecha
  -- de corte contando las filas que acababa de insertar, salía un día después,
  -- y el `on conflict (…, vigente_desde)` dejaba de atrapar nada.
  select count(*) into v_n
    from (select organization_id, iso2, fuente from country_risk_list
           where fuente in ('gafi_gris','gafi_negra') and vigente_hasta is null
           group by 1,2,3 having count(*) > 1) d;
  insert into resultado values (6, 'Ningún país duplicado en la lista vigente',
    '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 7. Todo lo vigente del GAFI dice de qué plenario es
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from country_risk_list
   where fuente in ('gafi_gris','gafi_negra') and vigente_hasta is null
     and plenario is distinct from '2026-06';
  insert into resultado values (7, 'Todo lo vigente al plenario 2026-06',
    '0 fuera', v_n::text || ' fuera', v_n = 0);

  -- ------------------------------------------------------------------
  -- 8. El snapshot anterior quedó sellado, no huérfano
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from country_risk_list
   where fuente in ('gafi_gris','gafi_negra') and vigente_hasta is not null
     and plenario is null;
  insert into resultado values (8, 'Ninguna fila cerrada sin plenario',
    '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 9. Myanmar lleva escrito que NO es contramedidas
  -- ------------------------------------------------------------------
  -- El GAFI pide diligencia reforzada para Myanmar y lo dice con esas palabras.
  -- El indicador de la matriz habla de contramedidas; el matiz vive en el dato.
  select count(*) into v_n
    from country_risk_list
   where iso2 = 'MM' and vigente_hasta is null
     and notas ilike '%NO contramedidas%';
  insert into resultado values (9, 'Myanmar: la nota dice que no son contramedidas',
    'más de 0', v_n::text, v_n > 0);

  -- ------------------------------------------------------------------
  -- 10. Correrla otra vez no cambia nada
  -- ------------------------------------------------------------------
  select count(*) into v_n from country_risk_list;
  perform public.cargar_snapshot_gafi_2026_06();
  select count(*) into v_orgs from country_risk_list;
  insert into resultado values (10, 'Volver a cargar no añade filas',
    v_n::text, v_orgs::text, v_n = v_orgs);

  -- ------------------------------------------------------------------
  -- 11. La cadena de bitácora sigue íntegra
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  insert into resultado values (11, 'Ninguna cadena rota', '0', v_n::text, v_n = 0);

exception when others then
  get stacked diagnostics v_msg = message_text;
  insert into resultado values (99, 'La prueba corrió sin errores',
    'sin errores', v_msg, false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
