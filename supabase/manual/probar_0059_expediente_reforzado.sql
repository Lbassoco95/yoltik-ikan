-- =====================================================================
-- Pruebas de comportamiento de la 0059 · expediente reforzado y allegados
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql.
--
-- Lo que hay que demostrar, y las tres primeras son las que la Adenda 5
-- subraya:
--
--   · Que el OPERADOR no aprueba. Ni por delegación ni por ausencia del
--     titular: si el titular no está, el expediente espera. Un permiso que se
--     afloja «sólo por hoy» deja de ser un control.
--
--   · Que la autoaprobación la CALCULA la base comparando identidades. Un dato
--     declarado sobre uno mismo, en el campo que sirve para señalar el
--     conflicto, es el que nunca se marca.
--
--   · Que una respuesta NEGATIVA se guarda con fecha. «No tiene cónyuge» y
--     «nadie ha preguntado» son cosas distintas ante una verificación, y el
--     campo vacío las representa igual.
--
--   · Que la documentación de allegados escala SÓLO con PPE extranjera. En
--     cualquier otro supuesto serían documentos de personas que no son
--     clientes, pedidos sin fundamento.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_org    uuid;
  v_tpl    uuid;
  v_cli    uuid;
  v_cli2   uuid;
  v_oc     uuid := '66666666-0000-0000-0000-000000000011';
  v_op     uuid := '66666666-0000-0000-0000-000000000012';
  v_dir    uuid := '66666666-0000-0000-0000-000000000013';
  v_txt    text;
  v_bool   boolean;
  v_n      int;
  v_seq    bigint;
  v_seq2   bigint;
  v_msg    text;
begin
  -- Por sector y no por `es_referencia`: la marca la pone un seed y la prueba
  -- tiene que correr también sobre una base donde no se haya cargado.
  select id into v_org from organizations where 'XII' = any(sectores) order by creada_en limit 1;
  select id into v_tpl from client_risk_template where organization_id = v_org and activa limit 1;

  insert into auth.users (id) values (v_oc), (v_op), (v_dir) on conflict do nothing;
  insert into user_profile (id, organization_id, email, nombre) values
    (v_oc,  v_org, 'oc.a5@kawiil.mx',  'OC de prueba'),
    (v_op,  v_org, 'op.a5@kawiil.mx',  'Operador de prueba'),
    (v_dir, v_org, 'dir.a5@kawiil.mx', 'Notario titular de prueba')
  on conflict (id) do nothing;
  insert into user_roles (user_id, organization_id, rol) values
    (v_oc,  v_org, 'oc'),
    (v_op,  v_org, 'operador'),
    (v_dir, v_org, 'admin')
  on conflict do nothing;

  -- El expediente lo captura el OPERADOR, que es quien captura en la vida real.
  perform set_config('ikan.uid', v_op::text, true);
  insert into client (organization_id, tipo_persona, nombre_razon_social, capturado_por,
                      condicion_pep)
  values (v_org, 'fisica', 'Compareciente reforzado de prueba', v_op, 'no_pep')
  returning id into v_cli;

  -- Y llega a N3 por la vía real: una evaluación de banda alta.
  insert into client_risk_assessment
    (client_id, template_id, respuestas, subtotales, score_total, clasificacion, evaluado_por)
  values (v_cli, v_tpl, '{}'::jsonb, '{}'::jsonb, 80, 'alto', v_oc);
  select nivel_kyc::text into v_txt from client where id = v_cli;
  insert into resultado values (1, 'El expediente de la prueba está en N3',
    'N3', v_txt, v_txt = 'N3');

  -- ------------------------------------------------------------------
  -- 2. El operador NO aprueba
  -- ------------------------------------------------------------------
  -- Instrucción 51. Es la prueba que más importa de este archivo: si el
  -- operador pudiera aprobar, la separación del art. 23 Ter 5 sería decorativa.
  begin
    perform public.aprobar_expediente_reforzado(v_cli, 'notario_titular', 'Aprobación indebida.');
    insert into resultado values (2, 'El rol operador no puede aprobar el expediente reforzado',
      'excepción', 'aprobó', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (2, 'El rol operador no puede aprobar el expediente reforzado',
      'excepción', 'excepción', v_msg like '%no aprueba%');
  end;

  -- Y nada quedó a medias: un intento rechazado no deja fila.
  select count(*) into v_n from expediente_reforzado where client_id = v_cli;
  insert into resultado values (3, 'El intento del operador no deja fila ninguna',
    '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 4. El notario titular sí, y sin autoaprobación
  -- ------------------------------------------------------------------
  -- Hay separación real: quien capturó fue el operador, quien aprueba es el
  -- titular, y ninguno es el OC.
  perform set_config('ikan.uid', v_dir::text, true);
  perform public.aprobar_expediente_reforzado(v_cli, 'notario_titular', 'Revisado en ventanilla.');

  select autoaprobacion, calidad::text into v_bool, v_txt
    from expediente_reforzado where client_id = v_cli;
  insert into resultado values (4, 'El notario titular aprueba y NO sale como autoaprobación',
    'false', coalesce(v_bool::text, '(nulo)'), v_bool is false);
  insert into resultado values (5, 'Y queda asentada la calidad en que aprobó',
    'notario_titular', coalesce(v_txt, '(nulo)'), v_txt = 'notario_titular');

  -- ------------------------------------------------------------------
  -- 6. La autoaprobación se calcula, no se declara
  -- ------------------------------------------------------------------
  -- Instrucción 50. El OC aprueba el mismo expediente: la base tiene que
  -- marcarlo sola, sin que nadie toque el booleano.
  perform set_config('ikan.uid', v_oc::text, true);
  perform public.aprobar_expediente_reforzado(v_cli, 'oficial_cumplimiento', 'Firmo yo.');
  select autoaprobacion into v_bool from expediente_reforzado where client_id = v_cli;
  insert into resultado values (6, 'Cuando aprueba el OC, la base marca la autoaprobación sola',
    'true', coalesce(v_bool::text, '(nulo)'), v_bool is true);

  -- Y también cuando aprueba quien capturó, aunque no sea el OC. El titular de
  -- una notaría pequeña captura y aprueba: eso es autoaprobación igual.
  update client set capturado_por = v_dir where id = v_cli;
  perform set_config('ikan.uid', v_dir::text, true);
  perform public.aprobar_expediente_reforzado(v_cli, 'notario_titular', 'Capturé y apruebo.');
  select autoaprobacion into v_bool from expediente_reforzado where client_id = v_cli;
  insert into resultado values (7, 'Y también cuando aprueba quien capturó el expediente',
    'true', coalesce(v_bool::text, '(nulo)'), v_bool is true);

  -- Re-aprobar no duplica: hay una aprobación por expediente, la vigente.
  select count(*) into v_n from expediente_reforzado where client_id = v_cli;
  insert into resultado values (8, 'Aprobar tres veces deja UNA aprobación, la vigente',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 9. La aprobación se ancla a la versión del expediente
  -- ------------------------------------------------------------------
  -- Sin esto, una aprobación firmada hoy parecería cubrir lo que se añada
  -- mañana.
  select evaluacion_secuencia into v_seq from expediente_reforzado where client_id = v_cli;
  insert into client_risk_assessment
    (client_id, template_id, respuestas, subtotales, score_total, clasificacion, evaluado_por)
  values (v_cli, v_tpl, '{"nuevo": true}'::jsonb, '{}'::jsonb, 85, 'alto', v_oc);
  select max(secuencia) into v_seq2 from client_risk_assessment where client_id = v_cli;
  insert into resultado values (9, 'La aprobación NO se estira sola a la evaluación posterior',
    'la secuencia guardada es menor', v_seq || ' < ' || v_seq2, v_seq < v_seq2);

  -- ------------------------------------------------------------------
  -- 10. Media aprobación no es una aprobación
  -- ------------------------------------------------------------------
  -- Sobre un cliente REAL, para que lo que se rechace sea el check de la
  -- aprobación y no una llave foránea.
  insert into client (organization_id, tipo_persona, nombre_razon_social, capturado_por)
  values (v_org, 'fisica', 'Compareciente de media aprobación', v_op)
  returning id into v_cli2;

  begin
    insert into expediente_reforzado (organization_id, client_id, aprobado_por, aprobado_en)
    values (v_org, v_cli2, v_oc, now());
    insert into resultado values (10, 'Aprobado sin la calidad en que se aprobó se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (10, 'Aprobado sin la calidad en que se aprobó se rechaza',
      'excepción', 'excepción', true);
  end;

  -- Y al revés: una calidad sin quién ni cuándo tampoco es una aprobación.
  begin
    insert into expediente_reforzado (organization_id, client_id, calidad)
    values (v_org, v_cli2, 'notario_titular');
    insert into resultado values (11, 'Una calidad sin quién aprobó ni cuándo se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (11, 'Una calidad sin quién aprobó ni cuándo se rechaza',
      'excepción', 'excepción', true);
  end;

  -- Ninguna de las dos, en cambio, es un expediente reforzado que existe sin
  -- aprobar todavía, y eso sí se admite: el expediente se arma antes de que
  -- alguien lo firme.
  insert into expediente_reforzado (organization_id, client_id, notas)
  values (v_org, v_cli2, 'Armado, pendiente de aprobación.');
  select count(*) into v_n from expediente_reforzado where client_id = v_cli2;
  insert into resultado values (12, 'Un expediente armado y sin aprobar todavía sí se admite',
    '1', v_n::text, v_n = 1);
  delete from expediente_reforzado where client_id = v_cli2;
  delete from client where id = v_cli2;

  -- ------------------------------------------------------------------
  -- 13. La bandeja de revisión total
  -- ------------------------------------------------------------------
  -- Instrucción 53: el compensatorio de que la firma se dio a sí misma es que
  -- la auditoría anual los revise al cien por ciento, y para eso hay que
  -- poderlos listar.
  perform set_config('ikan.uid', v_oc::text, true);
  select count(*) into v_n from public.expedientes_para_revision_total(v_org)
   where client_id = v_cli;
  insert into resultado values (13, 'El autoaprobado de riesgo alto sale en la revisión total',
    '1', v_n::text, v_n = 1);

  -- Y cuando hay separación real, no sale.
  update expediente_reforzado set autoaprobacion = false where client_id = v_cli;
  select count(*) into v_n from public.expedientes_para_revision_total(v_org)
   where client_id = v_cli;
  insert into resultado values (14, 'Con separación real entre captura y firma, no sale',
    '0', v_n::text, v_n = 0);
  update expediente_reforzado set autoaprobacion = true where client_id = v_cli;

  -- ------------------------------------------------------------------
  -- 15. Los tres vínculos empiezan sin contestar
  -- ------------------------------------------------------------------
  select count(*) into v_n from public.allegados_sin_preguntar(v_cli);
  insert into resultado values (15, 'Un expediente nuevo tiene los tres vínculos sin preguntar',
    '3', v_n::text, v_n = 3);

  -- ------------------------------------------------------------------
  -- 16. Un allegado registrado contesta su vínculo
  -- ------------------------------------------------------------------
  insert into allegado (organization_id, client_id, vinculo, tipo_persona,
                        apellido_paterno, apellido_materno, nombre, fecha,
                        pais_clave, curp, capturado_por)
  values (v_org, v_cli, 'conyuge', 'fisica',
          'Ramírez', 'Solís', 'María Fernanda', '1986-04-11',
          'MX', 'RASM860411MDFMRR03', v_oc);
  select count(*) into v_n from public.allegados_sin_preguntar(v_cli);
  insert into resultado values (16, 'Con el cónyuge registrado quedan dos vínculos sin preguntar',
    '2', v_n::text, v_n = 2);

  -- ------------------------------------------------------------------
  -- 17. La respuesta NEGATIVA también contesta, y con fecha
  -- ------------------------------------------------------------------
  -- Instrucción 55. Es la prueba de que el sistema distingue «no tiene» de
  -- «nadie preguntó».
  insert into allegado_sin_declarar (organization_id, client_id, vinculo, declarado_por)
  values (v_org, v_cli, 'dependiente_economico', v_oc);
  select count(*) into v_n from public.allegados_sin_preguntar(v_cli);
  insert into resultado values (17, '«No declara dependientes» cuenta como respuesta',
    '1', v_n::text, v_n = 1);

  select declarado_en is not null into v_bool
    from allegado_sin_declarar
   where client_id = v_cli and vinculo = 'dependiente_economico';
  insert into resultado values (18, 'Y la negativa queda con fecha de cuándo se preguntó',
    'true', coalesce(v_bool::text, '(nulo)'), v_bool is true);

  -- ------------------------------------------------------------------
  -- 19. «Otro» sin justificación no entra
  -- ------------------------------------------------------------------
  -- Si entrara, «otro» sería el nuevo texto libre y el catálogo no habría
  -- servido de nada.
  begin
    insert into allegado (organization_id, client_id, vinculo, tipo_persona,
                          apellido_paterno, nombre)
    values (v_org, v_cli, 'otro', 'fisica', 'Sin', 'Justificar');
    insert into resultado values (19, 'Un vínculo «otro» sin justificación se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (19, 'Un vínculo «otro» sin justificación se rechaza',
      'excepción', 'excepción', true);
  end;

  -- Y una persona moral sin razón social tampoco: los cuatro campos son cuatro,
  -- pero son obligatorios.
  begin
    insert into allegado (organization_id, client_id, vinculo, tipo_persona, nombre)
    values (v_org, v_cli, 'sociedad_vinculo_patrimonial', 'moral', 'Nombre de pila');
    insert into resultado values (20, 'Una sociedad vinculada sin razón social se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (20, 'Una sociedad vinculada sin razón social se rechaza',
      'excepción', 'excepción', true);
  end;

  -- ------------------------------------------------------------------
  -- 21. La documentación escala SÓLO con PPE extranjera
  -- ------------------------------------------------------------------
  -- Instrucción 56. Pedirla en más casos sería recabar documentos de personas
  -- que no son clientes sin fundamento.
  select public.allegados_exigen_documentacion(v_cli) into v_bool;
  insert into resultado values (21, 'Con cliente no PPE, de los allegados sólo se piden datos',
    'false', coalesce(v_bool::text, '(nulo)'), v_bool is false);

  update client set condicion_pep = 'pep_nacional' where id = v_cli;
  select public.allegados_exigen_documentacion(v_cli) into v_bool;
  insert into resultado values (22, 'Con PPE NACIONAL tampoco escala a documentación',
    'false', coalesce(v_bool::text, '(nulo)'), v_bool is false);

  update client set condicion_pep = 'pep_extranjera' where id = v_cli;
  select public.allegados_exigen_documentacion(v_cli) into v_bool;
  insert into resultado values (23, 'Con PPE EXTRANJERA sí se recaba documentación de allegados',
    'true', coalesce(v_bool::text, '(nulo)'), v_bool is true);

  update client set condicion_pep = 'familiar_o_asociado' where id = v_cli;
  select public.allegados_exigen_documentacion(v_cli) into v_bool;
  insert into resultado values (24, 'Y con familiar o asociado de PPE extranjera, también',
    'true', coalesce(v_bool::text, '(nulo)'), v_bool is true);

  -- ------------------------------------------------------------------
  -- 25. El porcentaje de participación es un porcentaje
  -- ------------------------------------------------------------------
  begin
    insert into allegado (organization_id, client_id, vinculo, tipo_persona,
                          razon_social, porcentaje_participacion)
    values (v_org, v_cli, 'sociedad_vinculo_patrimonial', 'moral',
            'Inmobiliaria de prueba, S.A. de C.V.', 140);
    insert into resultado values (25, 'Un porcentaje de participación de 140 se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (25, 'Un porcentaje de participación de 140 se rechaza',
      'excepción', 'excepción', true);
  end;

  delete from allegado where client_id = v_cli;
  delete from allegado_sin_declarar where client_id = v_cli;
  delete from expediente_reforzado where client_id = v_cli;
  delete from client_risk_assessment where client_id = v_cli;
  delete from cambio_nivel_diligencia where client_id = v_cli;
  delete from client where id = v_cli;

exception when others then
  get stacked diagnostics v_msg = message_text;
  insert into resultado values (99, 'La prueba corrió sin errores',
    'sin errores', v_msg, false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
