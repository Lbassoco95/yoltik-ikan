-- =====================================================================
-- Pruebas de comportamiento de la 0062 · OC designado y aprobación del acto
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql.
--
-- Lo que hay que demostrar:
--
--   · Que el acto de un compareciente N3 NO entra sin aprobación vigente. Una
--     aprobación que no impide operar sin ella es una constancia, no un
--     control: se cumple cuando alguien se acuerda.
--
--   · Que una evaluación posterior TUMBA la aprobación. Una firma no se estira
--     sola a hechos que nadie miró al aprobar.
--
--   · Que la autoaprobación se calcula contra el OC DESIGNADO y no contra el
--     conjunto de quienes tengan el rol: dar el rol a una segunda persona no
--     puede cambiar el cálculo sin que nadie lo decida.
--
--   · Que los actos ya registrados NO se invalidan hacia atrás, y que aun así
--     los expedientes que quedaron sin aprobación se pueden listar. Un control
--     que sólo mira hacia adelante deja un hueco que nadie vuelve a ver.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_org    uuid;
  v_tpl    uuid;
  v_cli    uuid;
  v_bajo   uuid;
  v_oc     uuid := '66666666-0000-0000-0000-000000000041';
  v_oc2    uuid := '66666666-0000-0000-0000-000000000042';
  v_op     uuid := '66666666-0000-0000-0000-000000000043';
  v_adm    uuid := '66666666-0000-0000-0000-000000000044';
  v_bool   boolean;
  v_txt    text;
  v_n      int;
  v_antes  int;
  v_msg    text;
begin
  select id into v_org from organizations where 'XII' = any(sectores) order by creada_en limit 1;
  select id into v_tpl from client_risk_template where organization_id = v_org and activa limit 1;

  insert into auth.users (id) values (v_oc), (v_oc2), (v_op), (v_adm) on conflict do nothing;
  insert into user_profile (id, organization_id, email, nombre) values
    (v_oc,  v_org, 'oc.0062@kawiil.mx',  'OC designado'),
    (v_oc2, v_org, 'oc2.0062@kawiil.mx', 'Segundo con rol oc'),
    (v_op,  v_org, 'op.0062@kawiil.mx',  'Operador'),
    (v_adm, v_org, 'adm.0062@kawiil.mx', 'Administrador')
  on conflict (id) do nothing;
  insert into user_roles (user_id, organization_id, rol) values
    (v_oc,  v_org, 'oc'),
    (v_op,  v_org, 'operador'),
    (v_adm, v_org, 'admin')
  on conflict do nothing;

  -- ------------------------------------------------------------------
  -- 1. Designar al OC es un acto, y sólo lo hace un administrador
  -- ------------------------------------------------------------------
  perform set_config('ikan.uid', v_oc::text, true);
  begin
    perform public.designar_oficial_cumplimiento(v_org, v_oc, true);
    insert into resultado values (1, 'El propio OC no puede autodesignarse',
      'excepción', 'lo hizo', false);
  exception when others then
    insert into resultado values (1, 'El propio OC no puede autodesignarse',
      'excepción', 'excepción', true);
  end;

  -- Y no se designa a quien no tiene el rol: la designación hace constar el
  -- permiso, no lo otorga.
  perform set_config('ikan.uid', v_adm::text, true);
  begin
    perform public.designar_oficial_cumplimiento(v_org, v_op, false);
    insert into resultado values (2, 'No se designa OC a quien no tiene el rol',
      'excepción', 'lo hizo', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (2, 'No se designa OC a quien no tiene el rol',
      'excepción', 'excepción', v_msg like '%no lo otorga%' or v_msg like '%rol de Oficial%');
  end;

  -- La bitácora es append-only y esta prueba puede haber corrido antes sobre la
  -- misma base: se cuenta el INCREMENTO, no el total. Un asiento que
  -- desapareciera al repetir la designación sería el defecto, no el que se sume.
  select count(*) into v_antes from evento_auditoria
   where organization_id = v_org and tipo = 'oficial_cumplimiento_designado';

  perform public.designar_oficial_cumplimiento(v_org, v_oc, true);
  select oc_encargado_user_id = v_oc and oc_designado_en is not null and oc_es_titular
    into v_bool from organizations where id = v_org;
  insert into resultado values (3, 'La designación queda con su usuario, su fecha y si es titular',
    'true', coalesce(v_bool::text, '(nulo)'), v_bool is true);

  select count(*) into v_n from evento_auditoria
   where organization_id = v_org and tipo = 'oficial_cumplimiento_designado';
  insert into resultado values (4, 'Y queda asentada en la bitácora',
    '1 asiento nuevo', (v_n - v_antes)::text, v_n - v_antes = 1);

  -- ------------------------------------------------------------------
  -- 5. Un segundo usuario con rol oc NO cambia el cálculo
  -- ------------------------------------------------------------------
  -- Es la razón de que la designación exista. Antes, `has_rol('oc')` habría
  -- marcado autoaprobación para cualquiera de los dos.
  insert into user_roles (user_id, organization_id, rol)
  values (v_oc2, v_org, 'oc') on conflict do nothing;

  perform set_config('ikan.uid', v_op::text, true);
  insert into client (organization_id, tipo_persona, nombre_razon_social, capturado_por)
  values (v_org, 'fisica', 'Compareciente N3 de la 0062', v_op)
  returning id into v_cli;
  insert into client_risk_assessment
    (client_id, template_id, respuestas, subtotales, score_total, clasificacion, evaluado_por)
  values (v_cli, v_tpl, '{}'::jsonb, '{}'::jsonb, 80, 'alto', v_oc);

  perform set_config('ikan.uid', v_oc2::text, true);
  select public.hay_autoaprobacion(v_org, v_oc2, v_cli) into v_bool;
  insert into resultado values (5, 'Un segundo usuario con rol oc NO cuenta como autoaprobación',
    'false', coalesce(v_bool::text, '(nulo)'), v_bool is false);

  select public.hay_autoaprobacion(v_org, v_oc, v_cli) into v_bool;
  insert into resultado values (6, 'El OC DESIGNADO sí',
    'true', coalesce(v_bool::text, '(nulo)'), v_bool is true);

  -- Y quien capturó también, aunque no sea el OC: es la notaría de una sola
  -- persona, que captura y firma.
  select public.hay_autoaprobacion(v_org, v_op, v_cli) into v_bool;
  insert into resultado values (7, 'Y quien capturó el expediente, aunque no sea el OC',
    'true', coalesce(v_bool::text, '(nulo)'), v_bool is true);

  -- ------------------------------------------------------------------
  -- 8. El acto no entra sin aprobación
  -- ------------------------------------------------------------------
  perform set_config('ikan.uid', v_op::text, true);
  begin
    insert into operation (organization_id, client_id, tipo, monto_mxn, fecha, capturado_por)
    values (v_org, v_cli, 'otro', 1000000, now(), v_op);
    insert into resultado values (8, 'El acto de un N3 sin aprobación NO entra',
      'excepción', 'entró', false);
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (8, 'El acto de un N3 sin aprobación NO entra',
      'excepción', 'excepción', v_msg like '%ANTES de operar%');
  end;

  -- Y el de un compareciente que no es N3 entra sin más: el expediente
  -- reforzado es para riesgo alto, no un trámite universal.
  insert into client (organization_id, tipo_persona, nombre_razon_social, capturado_por)
  values (v_org, 'fisica', 'Compareciente N2 de la 0062', v_op)
  returning id into v_bajo;
  insert into operation (organization_id, client_id, tipo, monto_mxn, fecha, capturado_por)
  values (v_org, v_bajo, 'otro', 500000, now(), v_op);
  select count(*) into v_n from operation where client_id = v_bajo;
  insert into resultado values (9, 'El acto de un compareciente que no es N3 entra sin más',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 10. Aprobado, el acto entra y queda anclado a la aprobación
  -- ------------------------------------------------------------------
  perform set_config('ikan.uid', v_adm::text, true);
  perform public.aprobar_expediente_reforzado(v_cli, 'notario_titular', 'Revisado.');
  select public.expediente_reforzado_vigente(v_cli) into v_bool;
  insert into resultado values (10, 'Aprobado, el expediente queda vigente',
    'true', coalesce(v_bool::text, '(nulo)'), v_bool is true);

  perform set_config('ikan.uid', v_op::text, true);
  insert into operation (organization_id, client_id, tipo, monto_mxn, fecha, capturado_por)
  values (v_org, v_cli, 'otro', 1000000, now(), v_op);
  select count(*) into v_n from operation where client_id = v_cli;
  insert into resultado values (11, 'Y ahora el acto sí entra',
    '1', v_n::text, v_n = 1);

  select count(*) into v_n from operation o
    join expediente_reforzado e on e.id = o.aprobacion_expediente_id
   where o.client_id = v_cli;
  insert into resultado values (12, 'El acto queda anclado a CUÁL aprobación se apoyó',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 13. Una evaluación posterior tumba la aprobación
  -- ------------------------------------------------------------------
  -- Una firma no se estira sola a hechos que nadie miró al aprobar.
  insert into client_risk_assessment
    (client_id, template_id, respuestas, subtotales, score_total, clasificacion, evaluado_por)
  values (v_cli, v_tpl, '{"nuevo": true}'::jsonb, '{}'::jsonb, 90, 'alto', v_oc);

  select public.expediente_reforzado_vigente(v_cli) into v_bool;
  insert into resultado values (13, 'Una evaluación posterior deja la aprobación sin vigencia',
    'false', coalesce(v_bool::text, '(nulo)'), v_bool is false);

  begin
    insert into operation (organization_id, client_id, tipo, monto_mxn, fecha, capturado_por)
    values (v_org, v_cli, 'otro', 2000000, now(), v_op);
    insert into resultado values (14, 'Y el siguiente acto vuelve a frenarse',
      'excepción', 'entró', false);
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (14, 'Y el siguiente acto vuelve a frenarse',
      'excepción', 'excepción', v_msg like '%hechos nuevos%');
  end;

  -- ------------------------------------------------------------------
  -- 15. Lo ya registrado NO se invalida hacia atrás
  -- ------------------------------------------------------------------
  -- Una regla nueva no vuelve ilícito lo que era válido cuando se hizo.
  select count(*) into v_n from operation where client_id = v_cli;
  insert into resultado values (15, 'El acto que ya estaba registrado sigue ahí',
    '1', v_n::text, v_n = 1);

  -- Pero el expediente sale en la lista de los que están operando sin
  -- aprobación vigente: si no, el hueco quedaría invisible.
  perform set_config('ikan.uid', v_oc::text, true);
  select count(*) into v_n from public.n3_sin_aprobacion_vigente(v_org) where client_id = v_cli;
  insert into resultado values (16, 'Y sale en la lista de N3 sin aprobación vigente',
    '1', v_n::text, v_n = 1);

  select motivo into v_txt from public.n3_sin_aprobacion_vigente(v_org) where client_id = v_cli;
  insert into resultado values (17, 'Con el motivo escrito, no sólo la bandera',
    'lo dice', coalesce(left(v_txt, 30), '(nada)'), v_txt like '%hechos nuevos%');

  -- Reaprobado sobre los hechos nuevos, vuelve a operar.
  perform set_config('ikan.uid', v_adm::text, true);
  perform public.aprobar_expediente_reforzado(v_cli, 'notario_titular', 'Reaprobado.');
  perform set_config('ikan.uid', v_op::text, true);
  insert into operation (organization_id, client_id, tipo, monto_mxn, fecha, capturado_por)
  values (v_org, v_cli, 'otro', 2000000, now(), v_op);
  select count(*) into v_n from operation where client_id = v_cli;
  insert into resultado values (18, 'Reaprobado sobre los hechos nuevos, vuelve a operar',
    '2', v_n::text, v_n = 2);

  perform set_config('ikan.uid', v_oc::text, true);
  select count(*) into v_n from public.n3_sin_aprobacion_vigente(v_org) where client_id = v_cli;
  insert into resultado values (19, 'Y deja de salir en la lista',
    '0', v_n::text, v_n = 0);

  delete from operation where client_id in (v_cli, v_bajo);
  delete from expediente_reforzado where client_id = v_cli;
  delete from client_risk_assessment where client_id = v_cli;
  delete from cambio_nivel_diligencia where client_id in (v_cli, v_bajo);
  delete from client where id in (v_cli, v_bajo);
  delete from user_roles where user_id = v_oc2;
  update organizations set oc_encargado_user_id = null, oc_designado_en = null,
                           oc_es_titular = false where id = v_org;

exception when others then
  get stacked diagnostics v_msg = message_text;
  insert into resultado values (99, 'La prueba corrió sin errores',
    'sin errores', v_msg, false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
