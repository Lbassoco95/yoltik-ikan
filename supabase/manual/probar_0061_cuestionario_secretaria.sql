-- =====================================================================
-- Pruebas de comportamiento de la 0061 · cuestionario reforzado y la SE
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql.
--
-- Lo que hay que demostrar, y la primera es la corrección que la Adenda 5 me
-- hizo:
--
--   · Que DIDIT NO FIRMA. El resultado de una verificación de identidad es
--     evidencia de atribución, no de integridad, y no basta para tener por
--     firmado un cuestionario. Confundirlos es el mismo error de categoría que
--     la Adenda 3 corrigió con los programas de sanciones.
--
--   · Que firmado significa mecanismo + atribución + integridad + fecha. Las
--     cuatro o ninguna: un cuestionario que «parece firmado» es peor que uno
--     sin firmar, porque nadie vuelve a mirarlo.
--
--   · Que un cuestionario a medias y uno sin empezar se distinguen.
--
--   · Que la consulta a la Secretaría de Economía tiene dónde asentarse desde
--     hoy, aunque no sea exigible hasta el 1 de marzo de 2027: un pendiente sin
--     lugar donde asentar el resultado no es un pendiente, es una omisión con
--     nombre amable.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_org    uuid;
  v_cli    uuid;
  v_ver    uuid;
  v_oc     uuid := '66666666-0000-0000-0000-000000000031';
  v_txt    text;
  v_num    numeric;
  v_n      int;
  v_msg    text;
begin
  select id into v_org from organizations where 'XII' = any(sectores) order by creada_en limit 1;

  insert into auth.users (id) values (v_oc) on conflict do nothing;
  insert into user_profile (id, organization_id, email, nombre)
  values (v_oc, v_org, 'oc.a5.cuest@kawiil.mx', 'OC de prueba') on conflict (id) do nothing;
  insert into user_roles (user_id, organization_id, rol)
  values (v_oc, v_org, 'oc') on conflict do nothing;
  perform set_config('ikan.uid', v_oc::text, true);

  insert into client (organization_id, tipo_persona, nombre_razon_social, capturado_por)
  values (v_org, 'moral', 'Sociedad de prueba del cuestionario, S.A. de C.V.', v_oc)
  returning id into v_cli;

  -- ------------------------------------------------------------------
  -- 1. Los cinco bloques empiezan pendientes
  -- ------------------------------------------------------------------
  select count(*) into v_n from public.bloques_cuestionario_pendientes(v_cli);
  insert into resultado values (1, 'Sin cuestionario, los cinco bloques están pendientes',
    '5', v_n::text, v_n = 5);

  -- ------------------------------------------------------------------
  -- 2. Un cuestionario a medias se distingue de uno sin empezar
  -- ------------------------------------------------------------------
  insert into cuestionario_reforzado (organization_id, client_id, respuestas, aplicado_por)
  values (v_org, v_cli,
          '{"origen": {"actividad": "Enajenación de inmueble propio"},
            "destino": {"uso": "Adquisición de casa habitación"}}'::jsonb,
          v_oc);
  select count(*) into v_n from public.bloques_cuestionario_pendientes(v_cli);
  insert into resultado values (2, 'Con dos bloques contestados quedan tres pendientes',
    '3', v_n::text, v_n = 3);

  select string_agg(bloque, ',' order by bloque) into v_txt
    from public.bloques_cuestionario_pendientes(v_cli);
  insert into resultado values (3, 'Y dice cuáles son los que faltan',
    'cierre,operacion,vinculos', coalesce(v_txt, '(nada)'),
    v_txt = 'cierre,operacion,vinculos');

  -- Un bloque presente pero VACÍO no cuenta como contestado: la llave existe y
  -- la respuesta no, que es la misma trampa que el campo vacío en los
  -- allegados.
  update cuestionario_reforzado
     set respuestas = respuestas || '{"operacion": {}}'::jsonb
   where client_id = v_cli;
  select count(*) into v_n from public.bloques_cuestionario_pendientes(v_cli);
  insert into resultado values (4, 'Un bloque presente pero vacío sigue contando como pendiente',
    '3', v_n::text, v_n = 3);

  update cuestionario_reforzado
     set respuestas = respuestas
       || '{"operacion": {"origen_relacion": "Recomendación de cliente previo"},
             "vinculos": {"pep": "No"},
             "cierre": {"veracidad": "Sí"}}'::jsonb
   where client_id = v_cli;
  select count(*) into v_n from public.bloques_cuestionario_pendientes(v_cli);
  insert into resultado values (5, 'Contestados los cinco, no queda ninguno pendiente',
    '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 6. Didit no firma
  -- ------------------------------------------------------------------
  -- Se cuelga del cuestionario una verificación de identidad APROBADA y se
  -- intenta darlo por firmado con eso. Tiene que rechazarse: es evidencia de
  -- atribución, no de integridad.
  insert into verificacion_identidad
    (organization_id, client_id, didit_session_id, url, estado, canal, solicitada_por)
  values (v_org, v_cli, 'sess-prueba-a5', 'https://verify.didit.me/prueba-a5',
          'aprobada', 'correo', v_oc)
  returning id into v_ver;

  begin
    update cuestionario_reforzado
       set verificacion_id = v_ver, firmado_en = now()
     where client_id = v_cli;
    insert into resultado values (6, 'Una verificación de Didit NO da por firmado el cuestionario',
      'excepción', 'lo dio por firmado', false);
  exception when check_violation then
    insert into resultado values (6, 'Una verificación de Didit NO da por firmado el cuestionario',
      'excepción', 'excepción', true);
  end;

  -- Y la verificación sí se puede colgar, en su propio campo, sin firmar nada.
  update cuestionario_reforzado set verificacion_id = v_ver where client_id = v_cli;
  select count(*) into v_n
    from cuestionario_reforzado
   where client_id = v_cli and verificacion_id is not null and firmado_en is null;
  insert into resultado values (7, 'La verificación viaja en su propio campo, sin firmar',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 8. Firmado significa las cuatro cosas
  -- ------------------------------------------------------------------
  -- Mecanismo sin evidencia de integridad: bajo el Código de Comercio la firma
  -- no es fiable si no se puede detectar la alteración posterior del mensaje.
  begin
    update cuestionario_reforzado
       set mecanismo = 'prestador_reconocido',
           evidencia_atribucion = '{"certificado": "PSC-0001"}'::jsonb,
           firmado_en = now()
     where client_id = v_cli;
    insert into resultado values (8, 'Firmar sin evidencia de INTEGRIDAD se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (8, 'Firmar sin evidencia de INTEGRIDAD se rechaza',
      'excepción', 'excepción', true);
  end;

  -- Y sin evidencia de atribución tampoco: no se sabría de quién es la firma.
  begin
    update cuestionario_reforzado
       set mecanismo = 'prestador_reconocido',
           evidencia_integridad = '{"sha256": "abc"}'::jsonb,
           firmado_en = now()
     where client_id = v_cli;
    insert into resultado values (9, 'Firmar sin evidencia de ATRIBUCIÓN se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (9, 'Firmar sin evidencia de ATRIBUCIÓN se rechaza',
      'excepción', 'excepción', true);
  end;

  -- Un mecanismo sin fecha tampoco: una firma sin cuándo no acredita que se
  -- diera antes del acto.
  begin
    update cuestionario_reforzado
       set mecanismo = 'prestador_reconocido',
           evidencia_atribucion = '{"certificado": "PSC-0001"}'::jsonb,
           evidencia_integridad = '{"sha256": "abc"}'::jsonb,
           firmado_en = null
     where client_id = v_cli;
    insert into resultado values (10, 'Un mecanismo de firma sin fecha se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (10, 'Un mecanismo de firma sin fecha se rechaza',
      'excepción', 'excepción', true);
  end;

  -- Con las cuatro, sí.
  update cuestionario_reforzado
     set mecanismo = 'prestador_reconocido',
         evidencia_atribucion = '{"certificado": "PSC-0001", "correo": "cliente@ejemplo.mx"}'::jsonb,
         evidencia_integridad = '{"sha256": "3a7f...", "sellado": "2026-09-01T12:00:00Z"}'::jsonb,
         firmado_en = now()
   where client_id = v_cli;
  select mecanismo::text into v_txt from cuestionario_reforzado where client_id = v_cli;
  insert into resultado values (11, 'Con mecanismo, atribución, integridad y fecha, sí firma',
    'prestador_reconocido', coalesce(v_txt, '(nulo)'), v_txt = 'prestador_reconocido');

  -- ------------------------------------------------------------------
  -- 12. Una casilla de aceptación no es un mecanismo de firma
  -- ------------------------------------------------------------------
  -- El enum está cerrado a propósito: nada de casillas, nombres escritos en un
  -- campo de texto ni firmas trazadas con el dedo sin datos de atribución.
  begin
    update cuestionario_reforzado set mecanismo = 'casilla_aceptacion' where client_id = v_cli;
    insert into resultado values (12, 'Una casilla de aceptación no es mecanismo de firma',
      'excepción', 'se admitió', false);
  exception when invalid_text_representation then
    insert into resultado values (12, 'Una casilla de aceptación no es mecanismo de firma',
      'excepción', 'excepción', true);
  end;

  -- Un cuestionario por cliente: no hay dos versiones firmadas conviviendo.
  begin
    insert into cuestionario_reforzado (organization_id, client_id) values (v_org, v_cli);
    insert into resultado values (13, 'Hay un solo cuestionario por expediente',
      'excepción', 'se admitió el segundo', false);
  exception when unique_violation then
    insert into resultado values (13, 'Hay un solo cuestionario por expediente',
      'excepción', 'excepción', true);
  end;

  -- ------------------------------------------------------------------
  -- 14. La Secretaría de Economía: hay dónde asentarla
  -- ------------------------------------------------------------------
  insert into consulta_secretaria_economia (organization_id, client_id, estado)
  values (v_org, v_cli, 'pendiente');
  select estado::text into v_txt from consulta_secretaria_economia where client_id = v_cli;
  insert into resultado values (14, 'La consulta pendiente se puede asentar desde hoy',
    'pendiente', coalesce(v_txt, '(nada)'), v_txt = 'pendiente');

  -- «Realizada» sin fecha, medio ni resultado es una casilla marcada.
  begin
    update consulta_secretaria_economia set estado = 'realizada' where client_id = v_cli;
    insert into resultado values (15, 'Marcarla como realizada sin fecha ni resultado se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (15, 'Marcarla como realizada sin fecha ni resultado se rechaza',
      'excepción', 'excepción', true);
  end;

  begin
    update consulta_secretaria_economia
       set estado = 'realizada', fecha_consulta = current_date, medio = '   ',
           resultado = 'coincide'
     where client_id = v_cli;
    insert into resultado values (16, 'Y sin decir por qué medio se consultó, tampoco',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (16, 'Y sin decir por qué medio se consultó, tampoco',
      'excepción', 'excepción', true);
  end;

  update consulta_secretaria_economia
     set estado = 'realizada', fecha_consulta = current_date,
         medio = 'Portal del Registro Público de Comercio (SIGER)',
         resultado = 'discrepa', folio = 'RPC-2026-0001', realizada_por = v_oc
   where client_id = v_cli;
  select resultado::text into v_txt from consulta_secretaria_economia where client_id = v_cli;
  insert into resultado values (17, 'Con fecha, medio y resultado, la consulta queda asentada',
    'discrepa', coalesce(v_txt, '(nada)'), v_txt = 'discrepa');

  -- La imposibilidad también es un resultado, y se distingue del pendiente.
  update consulta_secretaria_economia
     set estado = 'no_disponible_causa_externa', fecha_consulta = null, medio = null,
         resultado = null
   where client_id = v_cli;
  select estado::text into v_txt from consulta_secretaria_economia where client_id = v_cli;
  insert into resultado values (18, '«No disponible por causa externa» se distingue de pendiente',
    'no_disponible_causa_externa', coalesce(v_txt, '(nada)'),
    v_txt = 'no_disponible_causa_externa');

  -- ------------------------------------------------------------------
  -- 19. La fecha de exigibilidad, corregida
  -- ------------------------------------------------------------------
  -- La Adenda 4 la fechó al 01/06/2027 por agruparla con los mecanismos
  -- automatizados. La consulta es un ACTO MANUAL: 01/03/2027. Lo que espera es
  -- la automatización, no la obligación.
  select valor_numerico into v_num
    from parametro_regulatorio where codigo = 'FECHA_EXIGIBLE_CONSULTA_SE';
  insert into resultado values (19, 'La consulta a la SE es exigible desde el 01/03/2027',
    '20270301', coalesce(v_num::bigint::text, '(sin parámetro)'), v_num = 20270301);
  insert into resultado values (20, 'Y NO desde el 01/06/2027, que era la fecha de la Adenda 4',
    'distinta de 20270601', coalesce(v_num::bigint::text, '(sin parámetro)'), v_num <> 20270601);

  -- ------------------------------------------------------------------
  -- 21. Queda el asiento en la bitácora
  -- ------------------------------------------------------------------
  select count(*) into v_n from evento_auditoria
   where organization_id = v_org and tipo = 'expediente_reforzado_incorporado';
  insert into resultado values (21, 'La incorporación de la Adenda 5 quedó en la bitácora',
    '1', v_n::text, v_n = 1);

  select payload ->> 'firma' into v_txt from evento_auditoria
   where organization_id = v_org and tipo = 'expediente_reforzado_incorporado' limit 1;
  insert into resultado values (22, 'Y el asiento deja escrito que Didit no firma',
    'lo dice', coalesce(left(v_txt, 20), '(nada)'), v_txt like '%Didit NO firma%');

  delete from consulta_secretaria_economia where client_id = v_cli;
  delete from cuestionario_reforzado where client_id = v_cli;
  delete from verificacion_identidad where client_id = v_cli;
  delete from client where id = v_cli;

exception when others then
  get stacked diagnostics v_msg = message_text;
  insert into resultado values (99, 'La prueba corrió sin errores',
    'sin errores', v_msg, false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
