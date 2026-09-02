-- =====================================================================
-- Pruebas de comportamiento de la 0057 · niveles de diligencia
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql.
--
-- Lo que hay que demostrar, y la última es la que sostiene todo:
--
--   · Que un expediente nuevo nace en N2 y no en N1. N1 es diligencia
--     simplificada y nacer ahí afirma que un cliente del que no se sabe nada
--     cumple los supuestos que las Reglas permiten simplificar.
--
--   · Que sube solo en cuanto los hechos lo exigen, sin que nadie lo pida.
--
--   · Que NO BAJA con un update. Si bastara un update, la regla viviría sólo en
--     la pantalla y se saltaría desde el SQL Editor, un script o un cliente
--     REST, sin dejar rastro de que se saltó.
--
--   · Que ni firmando se puede bajar por debajo de lo que los hechos exigen:
--     firmar no convierte un piso activo en inexistente.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_org   uuid;
  v_tpl   uuid;
  v_cli   uuid;
  v_oc    uuid := '66666666-0000-0000-0000-000000000001';
  v_txt   text;
  v_n     int;
  v_msg   text;
begin
  -- Por sector y no por `es_referencia`: la marca la pone un seed y la prueba
  -- tiene que correr también sobre una base donde no se haya cargado.
  select id into v_org from organizations where 'XII' = any(sectores) order by creada_en limit 1;
  select id into v_tpl from client_risk_template where organization_id = v_org and activa limit 1;

  insert into auth.users (id) values (v_oc) on conflict do nothing;
  insert into user_profile (id, organization_id, email, nombre)
  values (v_oc, v_org, 'oc.prueba@kawiil.mx', 'OC de prueba') on conflict (id) do nothing;
  insert into user_roles (user_id, organization_id, rol)
  values (v_oc, v_org, 'oc') on conflict do nothing;
  perform set_config('ikan.uid', v_oc::text, true);

  -- ------------------------------------------------------------------
  -- 1. Nace en N2
  -- ------------------------------------------------------------------
  insert into client (organization_id, tipo_persona, nombre_razon_social, capturado_por)
  values (v_org, 'fisica', 'Compareciente de prueba', v_oc)
  returning id into v_cli;

  select nivel_kyc::text into v_txt from client where id = v_cli;
  insert into resultado values (1, 'Un expediente nuevo nace en N2, no en N1',
    'N2', v_txt, v_txt = 'N2');

  -- ------------------------------------------------------------------
  -- 2. Una evaluación baja no lo mueve
  -- ------------------------------------------------------------------
  insert into client_risk_assessment
    (client_id, template_id, respuestas, subtotales, score_total, clasificacion, evaluado_por)
  values (v_cli, v_tpl, '{}'::jsonb, '{}'::jsonb, 10, 'bajo', v_oc);
  select nivel_kyc::text into v_txt from client where id = v_cli;
  insert into resultado values (2, 'Una evaluación de riesgo bajo lo deja en N2',
    'N2', v_txt, v_txt = 'N2');

  -- ------------------------------------------------------------------
  -- 3. Sube solo con la banda alta
  -- ------------------------------------------------------------------
  insert into client_risk_assessment
    (client_id, template_id, respuestas, subtotales, score_total, clasificacion, evaluado_por)
  values (v_cli, v_tpl, '{}'::jsonb, '{}'::jsonb, 80, 'alto', v_oc);
  select nivel_kyc::text into v_txt from client where id = v_cli;
  insert into resultado values (3, 'La banda alta lo sube a N3 sin que nadie lo pida',
    'N3', v_txt, v_txt = 'N3');

  -- Y queda asentado, con motivo y marcado como automático.
  select motivo into v_txt from cambio_nivel_diligencia
   where client_id = v_cli and hacia = 'N3' order by registrado_en desc limit 1;
  insert into resultado values (4, 'La promoción queda asentada con su motivo',
    'banda alta', coalesce(v_txt, '(nulo)'), v_txt like '%banda alta%');

  -- ------------------------------------------------------------------
  -- 5. Una evaluación posterior MÁS BAJA no lo degrada
  -- ------------------------------------------------------------------
  -- El caso que importa. Si degradara, bastaría con volver a evaluar para
  -- limpiar el expediente.
  insert into client_risk_assessment
    (client_id, template_id, respuestas, subtotales, score_total, clasificacion, evaluado_por)
  values (v_cli, v_tpl, '{}'::jsonb, '{}'::jsonb, 20, 'bajo', v_oc);
  select nivel_kyc::text into v_txt from client where id = v_cli;
  insert into resultado values (5, 'Una evaluación posterior más baja NO lo degrada',
    'N3', v_txt, v_txt = 'N3');

  -- ------------------------------------------------------------------
  -- 6. Un update directo tampoco
  -- ------------------------------------------------------------------
  begin
    update client set nivel_kyc = 'N2' where id = v_cli;
    insert into resultado values (6, 'Un update directo no puede bajar el nivel',
      'excepción', 'lo bajó', false);
  exception when others then
    insert into resultado values (6, 'Un update directo no puede bajar el nivel',
      'excepción', 'excepción', true);
  end;

  -- ------------------------------------------------------------------
  -- 7. Ni firmando, mientras los hechos exijan N3
  -- ------------------------------------------------------------------
  -- Firmar no convierte un piso activo en inexistente. Hace falta un piso
  -- VIVO: tras la evaluación baja del paso 5 los hechos ya exigían N2, así que
  -- bajar habría sido legítimo y la prueba no habría probado el candado.
  insert into client_risk_assessment
    (client_id, template_id, respuestas, subtotales, score_total, clasificacion,
     motivo_alto_de_oficio, evaluado_por)
  values (v_cli, v_tpl, '{}'::jsonb, '{}'::jsonb, 95, 'alto_oficio',
          'País bajo embargo territorial amplio', v_oc);
  begin
    perform public.bajar_nivel_diligencia(v_cli, 'N2', 'El cliente dejó de operar hace meses.');
    insert into resultado values (7, 'Ni el OC puede bajar por debajo de lo que los hechos exigen',
      'excepción', 'lo bajó', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (7, 'Ni el OC puede bajar por debajo de lo que los hechos exigen',
      'excepción', 'excepción', v_msg like '%los hechos%');
  end;

  -- ------------------------------------------------------------------
  -- 8. Cuando los hechos cambian, el OC sí puede bajar
  -- ------------------------------------------------------------------
  -- Se cierran las evaluaciones anteriores dejando sólo una baja como la
  -- última: es lo que hace la reevaluación semestral cuando el acto que
  -- produjo el piso ya se cerró.
  delete from client_risk_assessment where client_id = v_cli;
  insert into client_risk_assessment
    (client_id, template_id, respuestas, subtotales, score_total, clasificacion, evaluado_por)
  values (v_cli, v_tpl, '{}'::jsonb, '{}'::jsonb, 15, 'bajo', v_oc);
  -- Ese insert dispara la sincronización, que NO baja: sigue en N3.
  select nivel_kyc::text into v_txt from client where id = v_cli;
  insert into resultado values (8, 'Cambiados los hechos, sigue en N3 hasta que alguien firme',
    'N3', v_txt, v_txt = 'N3');

  -- Guardada: si un paso anterior dejó el expediente en otro nivel, esta
  -- llamada levantaría una excepción que tiraría el bloque entero y perdería
  -- TODOS los resultados anteriores —el manejador de arriba revierte hasta el
  -- principio—. Con la guarda, el fallo se ve en su fila y las demás sobreviven.
  begin
    perform public.bajar_nivel_diligencia(v_cli, 'N2',
      'Reevaluación semestral: el acto que produjo el piso se cerró y la nueva evaluación sale en '
      || 'banda baja. Cap. III Bis.');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (9, 'Con los hechos cambiados y firma, baja a N2',
      'N2', 'excepción: ' || v_msg, false);
  end;
  select nivel_kyc::text into v_txt from client where id = v_cli;
  insert into resultado values (9, 'Con los hechos cambiados y firma, baja a N2',
    'N2', v_txt, v_txt = 'N2');

  select count(*) into v_n from cambio_nivel_diligencia
   where client_id = v_cli and automatico = false and firmado_por is not null;
  insert into resultado values (10, 'La bajada queda firmada, no sólo asentada',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 11. Sin motivo escrito no se puede bajar
  -- ------------------------------------------------------------------
  insert into client_risk_assessment
    (client_id, template_id, respuestas, subtotales, score_total, clasificacion,
     motivo_alto_de_oficio, evaluado_por)
  values (v_cli, v_tpl, '{}'::jsonb, '{}'::jsonb, 90, 'alto_oficio', 'País bajo embargo', v_oc);
  select nivel_kyc::text into v_txt from client where id = v_cli;
  insert into resultado values (11, 'Un piso activo lo vuelve a subir a N3',
    'N3', v_txt, v_txt = 'N3');

  delete from client_risk_assessment where client_id = v_cli;
  insert into client_risk_assessment
    (client_id, template_id, respuestas, subtotales, score_total, clasificacion, evaluado_por)
  values (v_cli, v_tpl, '{}'::jsonb, '{}'::jsonb, 15, 'bajo', v_oc);
  begin
    perform public.bajar_nivel_diligencia(v_cli, 'N2', '   ');
    insert into resultado values (12, 'Sin motivo escrito no se puede bajar',
      'excepción', 'lo bajó', false);
  exception when others then
    insert into resultado values (12, 'Sin motivo escrito no se puede bajar',
      'excepción', 'excepción', true);
  end;

  -- ------------------------------------------------------------------
  -- 13. Quien no es OC no puede bajar
  -- ------------------------------------------------------------------
  delete from user_roles where user_id = v_oc and rol = 'oc';
  begin
    perform public.bajar_nivel_diligencia(v_cli, 'N2', 'Motivo cualquiera.');
    insert into resultado values (13, 'Quien no es Oficial de Cumplimiento no puede bajar',
      'excepción', 'lo bajó', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (13, 'Quien no es Oficial de Cumplimiento no puede bajar',
      'excepción', 'excepción', v_msg like '%Oficial de Cumplimiento%');
  end;
  insert into user_roles (user_id, organization_id, rol) values (v_oc, v_org, 'oc')
    on conflict do nothing;

  -- ------------------------------------------------------------------
  -- 14. El paso III sube a N3 sin volver a evaluar
  -- ------------------------------------------------------------------
  insert into cascada_bc (organization_id, client_id, paso, estado, nota)
  values (v_org, v_cli, 'I', 'practicado_sin_resultado', 'Sin socios al umbral.'),
         (v_org, v_cli, 'II', 'practicado_sin_resultado', 'Sin control por otros medios.'),
         (v_org, v_cli, 'III', 'practicado_con_resultado', 'Funcionario de mayor grado.')
    on conflict (client_id, paso) do update set estado = excluded.estado;
  select nivel_kyc::text into v_txt from client where id = v_cli;
  insert into resultado values (14, 'El paso III sube a N3 sin necesidad de reevaluar la matriz',
    'N3', v_txt, v_txt = 'N3');

  -- ------------------------------------------------------------------
  -- 15. Y ninguno quedó en N1
  -- ------------------------------------------------------------------
  select count(*) into v_n from client where nivel_kyc = 'N1';
  insert into resultado values (15, 'Ningún expediente quedó en N1: se declara, no se hereda',
    '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 16. La cadena de bitácora sigue íntegra
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  insert into resultado values (16, 'Ninguna cadena rota', '0', v_n::text, v_n = 0);

exception when others then
  get stacked diagnostics v_msg = message_text;
  insert into resultado values (99, 'La prueba corrió sin errores',
    'sin errores', v_msg, false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
