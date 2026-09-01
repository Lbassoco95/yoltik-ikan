-- =====================================================================
-- Pruebas de comportamiento de la 0051 · diagnóstico por fuente
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql.
--
-- Lo que hay que demostrar:
--
--   · Que una fuente que una regla dice tamizar y no tiene ni una fila se
--     REPORTA. Es el caso que la 0050 dejaba pasar: el total de
--     `country_risk_list` salía en verde y la regla estaba tamizando contra
--     nada, dando por limpio lo que no revisó.
--
--   · Que el conteo de jurisdicciones del GAFI cuenta SÓLO el GAFI. Antes
--     sumaba OFAC y paraísos fiscales, y por eso una organización con 26 filas
--     y otra con 41 se veían las dos «cargadas» sin que nadie notara que no
--     medían lo mismo.
--
--   · Que `cobertura_de_listas` dice qué regla usa cada fuente. Sin eso, un
--     cero no se puede accionar: no se sabe qué deja de dispararse.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_admin uuid := '99999999-0000-0000-0000-000000000002';
  v_org   uuid;
  v_n     int;
  v_txt   text;
  v_bool  boolean;
  v_msg   text;
begin
  insert into auth.users (id) values (v_admin) on conflict do nothing;
  insert into platform_admin (user_id, nombre) values (v_admin, 'Prueba Kawiil') on conflict do nothing;
  perform set_config('ikan.uid', v_admin::text, true);

  insert into organizations (rfc, razon_social, sectores, perfil_actividad)
  values ('COB010101AAA', 'Notaría de cobertura', array['XII']::sector_av[], 'notarias')
  returning id into v_org;

  -- Una regla que dice tamizar CUATRO fuentes.
  insert into tipologia_av (organization_id, sector, codigo, nombre, descripcion,
                            regla_dsl, severidad, activa)
  values (v_org, 'XII', 'XII-03', 'País de alto riesgo', 'Contraparte en lista',
          '{"tipo":"lookup","campo":"contraparte.pais_iso2",
            "fuentes":["gafi_negra","gafi_gris","ofac_sancionado","onu"]}'::jsonb,
          'critica', true);

  -- Y datos para sólo DOS de ellas. Es el caso real de la notaría demo.
  insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
  values (v_org, 'IR', 'Irán', 3, 'gafi_negra'),
         (v_org, 'BO', 'Bolivia', 2, 'gafi_gris');

  -- ------------------------------------------------------------------
  -- 1. Las dos fuentes vacías se reportan
  -- ------------------------------------------------------------------
  select cuantos, listo, detalle into v_n, v_bool, v_txt
    from public.diagnostico_organizacion(v_org)
   where concepto = 'Fuentes que las tipologías tamizan sin datos';
  insert into resultado values (1, 'Cuenta las dos fuentes sin datos',
    '2', v_n::text, v_n = 2);
  insert into resultado values (2, 'Y no la da por lista',
    'false', v_bool::text, v_bool = false);
  insert into resultado values (3, 'Las nombra, para poder accionarlo',
    'ofac_sancionado y onu',
    v_txt, v_txt like '%ofac_sancionado%' and v_txt like '%onu%');

  -- ------------------------------------------------------------------
  -- 4. Con datos en las cuatro, deja de reportar
  -- ------------------------------------------------------------------
  insert into country_risk_list (organization_id, iso2, nombre, nivel, fuente)
  values (v_org, 'KP', 'Corea del Norte', 3, 'ofac_sancionado'),
         (v_org, 'KP', 'Corea del Norte', 3, 'onu');
  select cuantos, listo into v_n, v_bool
    from public.diagnostico_organizacion(v_org)
   where concepto = 'Fuentes que las tipologías tamizan sin datos';
  insert into resultado values (4, 'Cubiertas las cuatro, no queda nada que reportar',
    '0 y listo', v_n::text || ' y ' || v_bool::text, v_n = 0 and v_bool);

  -- ------------------------------------------------------------------
  -- 5. El conteo del GAFI cuenta SÓLO el GAFI
  -- ------------------------------------------------------------------
  -- Aquí hay 2 filas de GAFI y 2 de otras fuentes. Si contara todo diría 4, y
  -- dos organizaciones con listas distintas se verían igual de «cargadas».
  select cuantos into v_n
    from public.diagnostico_organizacion(v_org)
   where concepto = 'Jurisdicciones del GAFI';
  insert into resultado values (5, 'El GAFI no suma OFAC ni ONU ni paraísos',
    '2', v_n::text, v_n = 2);

  -- ------------------------------------------------------------------
  -- 6. La cobertura dice qué regla usa cada fuente
  -- ------------------------------------------------------------------
  select count(*) into v_n from public.cobertura_de_listas(v_org);
  insert into resultado values (6, 'Una fila por fuente tamizada',
    '4', v_n::text, v_n = 4);

  select tamizada_por into v_txt from public.cobertura_de_listas(v_org)
   where fuente = 'onu';
  insert into resultado values (7, 'Nombra la regla que dejaría de disparar',
    'XII-03', coalesce(v_txt, '(nulo)'), v_txt = 'XII-03');

  -- ------------------------------------------------------------------
  -- 8. Una tipología INACTIVA no exige cobertura
  -- ------------------------------------------------------------------
  -- Si la exigiera, apagar una regla dejaría una bandera roja que nadie puede
  -- bajar, y una alerta que no se puede accionar enseña a ignorar la lista.
  insert into tipologia_av (organization_id, sector, codigo, nombre, descripcion,
                            regla_dsl, severidad, activa)
  values (v_org, 'XII', 'XII-99', 'Apagada', 'No debe exigir cobertura',
          '{"tipo":"lookup","fuentes":["paraiso_fiscal_mx"]}'::jsonb, 'baja', false);
  select cuantos into v_n
    from public.diagnostico_organizacion(v_org)
   where concepto = 'Fuentes que las tipologías tamizan sin datos';
  insert into resultado values (8, 'Una regla apagada no levanta bandera',
    '0', v_n::text, v_n = 0);

exception when others then
  get stacked diagnostics v_msg = message_text;
  insert into resultado values (99, 'La prueba corrió sin errores',
    'sin errores', v_msg, false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
