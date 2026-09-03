-- =====================================================================
-- Pruebas de comportamiento de la 0060 · origen de recursos y su soporte
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql.
--
-- Lo que hay que demostrar:
--
--   · Que el documento de identificación NO acredita origen de recursos. Es la
--     única de las cinco reglas que BLOQUEA, y por eso vive en un check y no en
--     un informe: admitirla «en ese apartado» dejaría expedientes donde la
--     identificación pasa por soporte patrimonial.
--
--   · Y que sí cuenta en el único origen donde acredita algo: «recursos de un
--     tercero», donde lo que prueba es QUIÉN es el tercero.
--
--   · Que hace falta un documento por CADA origen declarado. Dos orígenes con
--     un solo soporte dejan uno sin acreditar, y sin la regla no se ve.
--
--   · Que en riesgo alto hace falta al menos un documento de TERCERO. Un
--     documento que el propio cliente emite no corrobora su dicho, lo reitera.
--
--   · Que los cuatro metadatos son obligatorios de verdad: sin ellos el
--     documento es un archivo con etiqueta y hay que abrirlo para saber qué es.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_org    uuid;
  v_tpl    uuid;
  v_cli    uuid;
  v_oc     uuid := '66666666-0000-0000-0000-000000000021';
  v_txt    text;
  v_bool   boolean;
  v_n      int;
  v_msg    text;
begin
  select id into v_org from organizations where 'XII' = any(sectores) order by creada_en limit 1;
  select id into v_tpl from client_risk_template where organization_id = v_org and activa limit 1;

  insert into auth.users (id) values (v_oc) on conflict do nothing;
  insert into user_profile (id, organization_id, email, nombre)
  values (v_oc, v_org, 'oc.a5.origen@kawiil.mx', 'OC de prueba') on conflict (id) do nothing;
  insert into user_roles (user_id, organization_id, rol)
  values (v_oc, v_org, 'oc') on conflict do nothing;
  perform set_config('ikan.uid', v_oc::text, true);

  -- ------------------------------------------------------------------
  -- 1. Los catálogos están cargados y son cerrados
  -- ------------------------------------------------------------------
  select count(*) into v_n from origen_recursos where vigente;
  insert into resultado values (1, 'Están los doce orígenes de recursos',
    '12', v_n::text, v_n = 12);

  select count(*) into v_n from tipo_documento_origen where vigente;
  insert into resultado values (2, 'Están los treinta tipos de documento',
    '30', v_n::text, v_n = 30);

  -- «Otro» se admite en todos los orígenes, porque el mundo no cabe en una
  -- lista. Lo que impide que sea la salida fácil es su justificación y su
  -- revisión, que se prueban más abajo.
  select count(*) into v_n from documento_admitido_por_origen where tipo_clave = 'otro';
  insert into resultado values (3, '«Otro» se admite en los doce orígenes',
    '12', v_n::text, v_n = 12);

  -- Y el resto de combinaciones es una lista corta por origen: un desplegable
  -- con los treinta tipos en cualquier origen es otra forma de texto libre.
  select count(*) into v_n from documento_admitido_por_origen where tipo_clave <> 'otro';
  insert into resultado values (4, 'Cada origen admite sólo los tipos que le tocan',
    '34', v_n::text, v_n = 34);

  select count(*) into v_n
    from documento_admitido_por_origen
   where origen_clave = 'sueldos_salarios' and tipo_clave = 'escritura_adjudicacion';
  insert into resultado values (5, 'Una escritura de herencia NO se ofrece en sueldos y salarios',
    '0', v_n::text, v_n = 0);

  -- El bucket es privado: son documentos patrimoniales de personas físicas.
  select public into v_bool from storage.buckets where id = 'origen-recursos';
  insert into resultado values (6, 'El bucket de origen de recursos NO es público',
    'false', coalesce(v_bool::text, '(sin bucket)'), v_bool is false);

  -- ------------------------------------------------------------------
  -- 7. La identificación no acredita origen de recursos
  -- ------------------------------------------------------------------
  -- La quinta regla, la única que bloquea.
  insert into client (organization_id, tipo_persona, nombre_razon_social, capturado_por)
  values (v_org, 'fisica', 'Compareciente con origen de prueba', v_oc)
  returning id into v_cli;

  insert into origen_declarado (organization_id, client_id, origen_clave, monto_mxn, declarado_por)
  values (v_org, v_cli, 'sueldos_salarios', 900000, v_oc);

  begin
    insert into documento_origen
      (organization_id, client_id, origen_clave, tipo_clave, emisor, emitido_por_tercero,
       fecha_documento, monto_acreditado, storage_path, nombre_archivo)
    values (v_org, v_cli, 'sueldos_salarios', 'identificacion_tercero', 'INE', true,
            '2026-01-15', 900000, v_org || '/prueba/ine.pdf', 'ine.pdf');
    insert into resultado values (7, 'Una identificación NO se admite como soporte de sueldos',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (7, 'Una identificación NO se admite como soporte de sueldos',
      'excepción', 'excepción', true);
  end;

  -- Pero sí en el único origen donde acredita algo: quién es el tercero.
  insert into origen_declarado (organization_id, client_id, origen_clave, monto_mxn, declarado_por)
  values (v_org, v_cli, 'tercero', 100000, v_oc);
  insert into documento_origen
    (organization_id, client_id, origen_clave, tipo_clave, emisor, emitido_por_tercero,
     fecha_documento, monto_acreditado, storage_path, nombre_archivo)
  values (v_org, v_cli, 'tercero', 'identificacion_tercero', 'INE', true,
          '2026-01-15', null, v_org || '/prueba/ine-tercero.pdf', 'ine-tercero.pdf');
  select count(*) into v_n
    from documento_origen where client_id = v_cli and tipo_clave = 'identificacion_tercero';
  insert into resultado values (8, 'Y sí se admite en «recursos de un tercero», que es su lugar',
    '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 9. Un documento por CADA origen declarado
  -- ------------------------------------------------------------------
  -- Ahora mismo hay dos orígenes y sólo el del tercero tiene soporte.
  select cumple, detalle into v_bool, v_txt
    from public.suficiencia_origen_recursos(v_cli)
   where regla = 'Un documento por cada origen declarado';
  insert into resultado values (9, 'Con un origen sin soporte, la regla no se cumple',
    'false', coalesce(v_bool::text, '(nada)'), v_bool is false);
  insert into resultado values (10, 'Y dice CUÁL es el que quedó sin soporte',
    'nombra sueldos y salarios', coalesce(v_txt, '(nada)'),
    v_txt like '%Sueldos y salarios%');

  -- Se le pone el suyo, emitido por el propio cliente.
  insert into documento_origen
    (organization_id, client_id, origen_clave, tipo_clave, emisor, emitido_por_tercero,
     fecha_documento, periodo_desde, periodo_hasta, monto_acreditado,
     storage_path, nombre_archivo)
  values (v_org, v_cli, 'sueldos_salarios', 'cfdi_emitido', 'El propio cliente', false,
          '2026-01-31', '2026-01-01', '2026-01-31', 400000,
          v_org || '/prueba/cfdi.pdf', 'cfdi.pdf');

  select cumple into v_bool
    from public.suficiencia_origen_recursos(v_cli)
   where regla = 'Un documento por cada origen declarado';
  insert into resultado values (11, 'Con soporte en los dos orígenes, la regla se cumple',
    'true', coalesce(v_bool::text, '(nada)'), v_bool is true);

  -- ------------------------------------------------------------------
  -- 12. En riesgo alto, al menos uno de TERCERO
  -- ------------------------------------------------------------------
  -- En N2 la regla ni siquiera aplica.
  select cumple, detalle into v_bool, v_txt
    from public.suficiencia_origen_recursos(v_cli)
   where regla = 'En riesgo alto, al menos un documento de tercero';
  insert into resultado values (12, 'Fuera de riesgo alto, la regla del tercero no aplica',
    'true y lo dice', coalesce(v_bool::text, '(nada)') || ' / ' || coalesce(left(v_txt, 12), ''),
    v_bool is true and v_txt like 'No aplica%');

  -- Se sube a N3 por la vía real y se quita el documento de tercero.
  insert into client_risk_assessment
    (client_id, template_id, respuestas, subtotales, score_total, clasificacion, evaluado_por)
  values (v_cli, v_tpl, '{}'::jsonb, '{}'::jsonb, 80, 'alto', v_oc);
  delete from documento_origen where client_id = v_cli and tipo_clave = 'identificacion_tercero';

  select cumple, detalle into v_bool, v_txt
    from public.suficiencia_origen_recursos(v_cli)
   where regla = 'En riesgo alto, al menos un documento de tercero';
  insert into resultado values (13, 'En riesgo alto, sólo documentos del propio cliente no basta',
    'false', coalesce(v_bool::text, '(nada)'), v_bool is false);
  insert into resultado values (14, 'Y la razón queda escrita: reitera en vez de corroborar',
    'lo dice', coalesce(left(v_txt, 20), '(nada)'), v_txt like '%no corrobora su dicho%');

  insert into documento_origen
    (organization_id, client_id, origen_clave, tipo_clave, emisor, emitido_por_tercero,
     fecha_documento, monto_acreditado, storage_path, nombre_archivo)
  values (v_org, v_cli, 'sueldos_salarios', 'estado_cuenta', 'BBVA México', true,
          '2026-02-01', 500000, v_org || '/prueba/edo-cuenta.pdf', 'edo-cuenta.pdf');
  select cumple into v_bool
    from public.suficiencia_origen_recursos(v_cli)
   where regla = 'En riesgo alto, al menos un documento de tercero';
  insert into resultado values (15, 'Con un estado de cuenta bancario, la regla se cumple',
    'true', coalesce(v_bool::text, '(nada)'), v_bool is true);

  -- ------------------------------------------------------------------
  -- 16. Lo acreditado contra el monto de la operación
  -- ------------------------------------------------------------------
  -- Van acreditados 900 000 entre los dos documentos con monto.
  select cumple into v_bool
    from public.suficiencia_origen_recursos(v_cli, 2500000)
   where regla = 'Lo acreditado alcanza el monto de la operación';
  insert into resultado values (16, 'Acreditar 900 mil contra una operación de 2.5 millones falla',
    'false', coalesce(v_bool::text, '(nada)'), v_bool is false);

  select cumple into v_bool
    from public.suficiencia_origen_recursos(v_cli, 800000)
   where regla = 'Lo acreditado alcanza el monto de la operación';
  insert into resultado values (17, 'Y contra una de 800 mil, se cumple',
    'true', coalesce(v_bool::text, '(nada)'), v_bool is true);

  -- Sin monto con el que comparar, la regla no inventa un veredicto adverso.
  select cumple, detalle into v_bool, v_txt
    from public.suficiencia_origen_recursos(v_cli)
   where regla = 'Lo acreditado alcanza el monto de la operación';
  insert into resultado values (18, 'Sin monto de operación, la regla lo dice y no reprueba',
    'true y lo dice', coalesce(v_bool::text, '(nada)'),
    v_bool is true and v_txt like 'Sin monto%');

  -- ------------------------------------------------------------------
  -- 19. «Otro» exige justificación y revisión del OC
  -- ------------------------------------------------------------------
  begin
    insert into documento_origen
      (organization_id, client_id, origen_clave, tipo_clave, emisor, emitido_por_tercero,
       fecha_documento, storage_path, nombre_archivo)
    values (v_org, v_cli, 'sueldos_salarios', 'otro', 'Quien sea', false,
            '2026-02-10', v_org || '/prueba/otro-sin.pdf', 'otro-sin.pdf');
    insert into resultado values (19, 'Un documento «otro» sin justificación se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (19, 'Un documento «otro» sin justificación se rechaza',
      'excepción', 'excepción', true);
  end;

  insert into documento_origen
    (organization_id, client_id, origen_clave, tipo_clave, emisor, emitido_por_tercero,
     fecha_documento, storage_path, nombre_archivo, justificacion)
  values (v_org, v_cli, 'sueldos_salarios', 'otro', 'Empleador extranjero', true,
          '2026-02-10', v_org || '/prueba/otro-con.pdf', 'otro-con.pdf',
          'Carta patronal del extranjero, sin equivalente en el catálogo mexicano.');

  select cumple, detalle into v_bool, v_txt
    from public.suficiencia_origen_recursos(v_cli)
   where regla = 'Los documentos «otro» revisados por el Oficial de Cumplimiento';
  insert into resultado values (20, 'Con justificación pero sin revisar, la regla no se cumple',
    'false', coalesce(v_bool::text, '(nada)'), v_bool is false);

  update documento_origen
     set revisado_por_oc = v_oc, revisado_en = now()
   where client_id = v_cli and tipo_clave = 'otro';
  select cumple into v_bool
    from public.suficiencia_origen_recursos(v_cli)
   where regla = 'Los documentos «otro» revisados por el Oficial de Cumplimiento';
  insert into resultado values (21, 'Revisado por el OC, la regla se cumple',
    'true', coalesce(v_bool::text, '(nada)'), v_bool is true);

  -- ------------------------------------------------------------------
  -- 22. Los cuatro metadatos son obligatorios
  -- ------------------------------------------------------------------
  -- Sin ellos hay que abrir el archivo para saber qué es, que es exactamente lo
  -- que el catálogo pretendía evitar.
  begin
    insert into documento_origen
      (organization_id, client_id, origen_clave, tipo_clave, emisor, emitido_por_tercero,
       fecha_documento, storage_path, nombre_archivo)
    values (v_org, v_cli, 'sueldos_salarios', 'estado_cuenta', '   ', true,
            '2026-02-10', v_org || '/prueba/sin-emisor.pdf', 'sin-emisor.pdf');
    insert into resultado values (22, 'Un documento sin emisor se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (22, 'Un documento sin emisor se rechaza',
      'excepción', 'excepción', true);
  end;

  begin
    insert into documento_origen
      (organization_id, client_id, origen_clave, tipo_clave, emisor, emitido_por_tercero,
       storage_path, nombre_archivo)
    values (v_org, v_cli, 'sueldos_salarios', 'estado_cuenta', 'BBVA México', true,
            v_org || '/prueba/sin-fecha.pdf', 'sin-fecha.pdf');
    insert into resultado values (23, 'Un documento sin fecha se rechaza',
      'excepción', 'se admitió', false);
  exception when not_null_violation then
    insert into resultado values (23, 'Un documento sin fecha se rechaza',
      'excepción', 'excepción', true);
  end;

  begin
    insert into documento_origen
      (organization_id, client_id, origen_clave, tipo_clave, emisor,
       fecha_documento, storage_path, nombre_archivo)
    values (v_org, v_cli, 'sueldos_salarios', 'estado_cuenta', 'BBVA México',
            '2026-02-10', v_org || '/prueba/sin-emisor-tercero.pdf', 'sin-emisor-tercero.pdf');
    insert into resultado values (24, 'Un documento sin decir si lo emitió un tercero se rechaza',
      'excepción', 'se admitió', false);
  exception when not_null_violation then
    insert into resultado values (24, 'Un documento sin decir si lo emitió un tercero se rechaza',
      'excepción', 'excepción', true);
  end;

  -- Y un periodo al revés tampoco: un estado de cuenta que termina antes de
  -- empezar es un error de captura, no un dato.
  begin
    insert into documento_origen
      (organization_id, client_id, origen_clave, tipo_clave, emisor, emitido_por_tercero,
       fecha_documento, periodo_desde, periodo_hasta, storage_path, nombre_archivo)
    values (v_org, v_cli, 'sueldos_salarios', 'estado_cuenta', 'BBVA México', true,
            '2026-02-10', '2026-03-01', '2026-01-01',
            v_org || '/prueba/periodo.pdf', 'periodo.pdf');
    insert into resultado values (25, 'Un periodo que termina antes de empezar se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (25, 'Un periodo que termina antes de empezar se rechaza',
      'excepción', 'excepción', true);
  end;

  -- ------------------------------------------------------------------
  -- 26. Sin origen declarado, la primera regla lo dice
  -- ------------------------------------------------------------------
  -- Un expediente donde nadie preguntó de dónde salió el dinero y uno donde el
  -- cliente contestó tienen que verse distintos.
  delete from documento_origen where client_id = v_cli;
  delete from origen_declarado where client_id = v_cli;
  select cumple, detalle into v_bool, v_txt
    from public.suficiencia_origen_recursos(v_cli)
   where regla = 'Un documento por cada origen declarado';
  insert into resultado values (26, 'Sin ningún origen declarado, la regla NO se da por cumplida',
    'false', coalesce(v_bool::text, '(nada)'), v_bool is false);
  insert into resultado values (27, 'Y lo dice con todas sus letras',
    'lo dice', coalesce(v_txt, '(nada)'), v_txt like '%No hay ningún origen declarado%');

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
