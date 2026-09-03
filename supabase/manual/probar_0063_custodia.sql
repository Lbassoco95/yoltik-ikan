-- =====================================================================
-- Pruebas de comportamiento de la 0063 · custodia de artefactos
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql.
--
-- Lo que hay que demostrar:
--
--   · Que un expediente cuya copia del documento vive SÓLO en el proveedor se
--     reporta como no exportable. Guardar una liga no es custodia: es una
--     dependencia, y el plazo de conservación corre igual.
--
--   · Que la huella es obligatoria y con forma. A diez años hay que poder
--     demostrar que es EL archivo, no que se tiene un archivo.
--
--   · Que la conciliación no acumula la misma alerta abierta. Corre
--     periódicamente; si duplicara, la bandeja se volvería ruido y se
--     dejaría de mirar.
--
--   · Que el parámetro que autoriza reducir la retención en Didit nace en CERO.
--     Invertir ese orden vuelve irrecuperable un aviso perdido.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_org   uuid;
  v_cli   uuid;
  v_ver   uuid;
  v_oc    uuid := '66666666-0000-0000-0000-000000000051';
  v_n     int;
  v_txt   text;
  v_bool  boolean;
  v_num   numeric;
  v_msg   text;
begin
  select id into v_org from organizations where 'XII' = any(sectores) order by creada_en limit 1;
  insert into auth.users (id) values (v_oc) on conflict do nothing;
  insert into user_profile (id, organization_id, email, nombre)
  values (v_oc, v_org, 'oc.0063@kawiil.mx', 'OC de prueba') on conflict (id) do nothing;
  insert into user_roles (user_id, organization_id, rol)
  values (v_oc, v_org, 'oc') on conflict do nothing;
  perform set_config('ikan.uid', v_oc::text, true);

  insert into client (organization_id, tipo_persona, nombre_razon_social, capturado_por)
  values (v_org, 'fisica', 'Compareciente de custodia', v_oc)
  returning id into v_cli;

  insert into verificacion_identidad
    (organization_id, client_id, didit_session_id, url, estado, canal, solicitada_por)
  values (v_org, v_cli, 'sess-custodia-1', 'https://verify.didit.me/x', 'aprobada', 'correo', v_oc)
  returning id into v_ver;

  -- ------------------------------------------------------------------
  -- 1. Sin artefactos, el expediente NO se puede leer sin el proveedor
  -- ------------------------------------------------------------------
  select listo, detalle into v_bool, v_txt
    from public.expediente_exportable(v_cli)
   where seccion = 'Copia del documento de identidad (art. 18 fr. I)';
  insert into resultado values (1, 'Sin la copia custodiada, el expediente no es exportable',
    'false', coalesce(v_bool::text, '(nada)'), v_bool is false);
  insert into resultado values (2, 'Y lo dice con todas sus letras',
    'lo dice', coalesce(left(v_txt, 22), '(nada)'), v_txt like '%SÓLO EN EL PROVEEDOR%');

  select count(*) into v_n from public.artefactos_faltantes(v_ver);
  insert into resultado values (3, 'Faltan las dos caras del documento',
    '2', v_n::text, v_n = 2);

  -- ------------------------------------------------------------------
  -- 4. La huella es obligatoria, y con forma
  -- ------------------------------------------------------------------
  begin
    insert into artefacto_verificacion
      (organization_id, client_id, verificacion_id, tipo, storage_path, nombre_archivo, sha256)
    values (v_org, v_cli, v_ver, 'documento_frente', v_org || '/x/frente.jpg', 'frente.jpg',
            'no-es-un-sha');
    insert into resultado values (4, 'Una huella que no es SHA-256 se rechaza',
      'excepción', 'se admitió', false);
  exception when check_violation then
    insert into resultado values (4, 'Una huella que no es SHA-256 se rechaza',
      'excepción', 'excepción', true);
  end;

  begin
    insert into artefacto_verificacion
      (organization_id, client_id, verificacion_id, tipo, storage_path, nombre_archivo)
    values (v_org, v_cli, v_ver, 'documento_frente', v_org || '/x/frente2.jpg', 'frente.jpg');
    insert into resultado values (5, 'Un artefacto sin huella se rechaza',
      'excepción', 'se admitió', false);
  exception when not_null_violation then
    insert into resultado values (5, 'Un artefacto sin huella se rechaza',
      'excepción', 'excepción', true);
  end;

  -- ------------------------------------------------------------------
  -- 6. Con las dos caras custodiadas, el expediente ya se sostiene solo
  -- ------------------------------------------------------------------
  insert into artefacto_verificacion
    (organization_id, client_id, verificacion_id, tipo, storage_path, nombre_archivo,
     mime_type, tamano_bytes, sha256, url_origen)
  values
    (v_org, v_cli, v_ver, 'documento_frente', v_org || '/' || v_cli || '/frente.jpg',
     'frente.jpg', 'image/jpeg', 184320,
     'a3f1c0de4b5a6978231e0d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a7988',
     'https://s3.example/firmada-que-vence'),
    (v_org, v_cli, v_ver, 'documento_reverso', v_org || '/' || v_cli || '/reverso.jpg',
     'reverso.jpg', 'image/jpeg', 172032,
     'b4e2d1ef5c6b7a89342f1e5d6c7b8a992e3f4d5c6b7a89342f1e5d6c7b8a9920',
     'https://s3.example/firmada-que-vence-2');

  select count(*) into v_n from public.artefactos_faltantes(v_ver);
  insert into resultado values (6, 'Custodiadas las dos caras, no falta ninguna',
    '0', v_n::text, v_n = 0);

  select listo into v_bool from public.expediente_exportable(v_cli)
   where seccion = 'Copia del documento de identidad (art. 18 fr. I)';
  insert into resultado values (7, 'Y el expediente ya se puede leer sin el proveedor',
    'true', coalesce(v_bool::text, '(nada)'), v_bool is true);

  -- ------------------------------------------------------------------
  -- 8. Un artefacto por tipo y por verificación
  -- ------------------------------------------------------------------
  -- Idempotencia: un reintento no debe duplicar el expediente.
  begin
    insert into artefacto_verificacion
      (organization_id, client_id, verificacion_id, tipo, storage_path, nombre_archivo, sha256)
    values (v_org, v_cli, v_ver, 'documento_frente', v_org || '/otro/frente.jpg', 'frente.jpg',
            'c5f3e2f06d7c8b9a453f2e6d7c8b9aa03f4e5d6c7b8a94503f2e6d7c8b9aa031');
    insert into resultado values (8, 'Un reintento no duplica el artefacto',
      'excepción', 'se duplicó', false);
  exception when unique_violation then
    insert into resultado values (8, 'Un reintento no duplica el artefacto',
      'excepción', 'excepción', true);
  end;

  -- ------------------------------------------------------------------
  -- 9. La conciliación no acumula la misma alerta abierta
  -- ------------------------------------------------------------------
  -- Corre periódicamente. Si duplicara, la bandeja se volvería ruido y se
  -- dejaría de mirar, que es la forma más común de perder un control.
  perform public.registrar_hallazgo_conciliacion(
    'sess-perdida-1', 'sin_registro', v_org, null, 'Existe en Didit y no en Ikán.');
  perform public.registrar_hallazgo_conciliacion(
    'sess-perdida-1', 'sin_registro', v_org, null, 'Existe en Didit y no en Ikán.');
  select count(*) into v_n from conciliacion_verificacion
   where didit_session_id = 'sess-perdida-1' and resuelta_en is null;
  insert into resultado values (9, 'Dos corridas de conciliación dejan UNA alerta',
    '1', v_n::text, v_n = 1);

  -- Pero un hallazgo DISTINTO sobre la misma sesión sí entra: son problemas
  -- distintos y se resuelven distinto.
  perform public.registrar_hallazgo_conciliacion(
    'sess-perdida-1', 'sin_artefactos', v_org, null, 'Hay registro y no hay archivos.');
  select count(*) into v_n from conciliacion_verificacion
   where didit_session_id = 'sess-perdida-1' and resuelta_en is null;
  insert into resultado values (10, 'Un hallazgo distinto sobre la misma sesión sí entra',
    '2', v_n::text, v_n = 2);

  -- Y queda en la bitácora, porque la extracción también se audita.
  select count(*) into v_n from evento_auditoria
   where organization_id = v_org and tipo = 'conciliacion_hallazgo';
  insert into resultado values (11, 'Los hallazgos de conciliación quedan en la bitácora',
    '2', v_n::text, v_n = 2);

  -- Resuelta, deja de contar como abierta; y si vuelve a aparecer, es una
  -- alerta nueva y no un revivir de la anterior.
  update conciliacion_verificacion
     set resuelta_en = now(), resuelta_por = v_oc, nota_resolucion = 'Reingerida a mano.'
   where didit_session_id = 'sess-perdida-1' and hallazgo = 'sin_registro';
  perform public.registrar_hallazgo_conciliacion(
    'sess-perdida-1', 'sin_registro', v_org, null, 'Volvió a faltar.');
  select count(*) into v_n from conciliacion_verificacion
   where didit_session_id = 'sess-perdida-1' and hallazgo = 'sin_registro';
  insert into resultado values (12, 'Resuelta y vuelta a detectar, son dos alertas distintas',
    '2', v_n::text, v_n = 2);

  -- ------------------------------------------------------------------
  -- 13. El orden que no se puede invertir
  -- ------------------------------------------------------------------
  select valor_numerico into v_num
    from parametro_regulatorio where codigo = 'CONCILIACION_PROBADA';
  insert into resultado values (13, 'El permiso para reducir la retención en Didit nace en CERO',
    '0', coalesce(v_num::text, '(sin parámetro)'), v_num = 0);

  -- ------------------------------------------------------------------
  -- 14. Los módulos que corrieron de VERDAD
  -- ------------------------------------------------------------------
  -- No los que el workflow tiene hoy: la primera verificación de producción
  -- corrió sin barrido de listas porque el módulo se encendió después.
  update verificacion_identidad
     set features_aplicadas = array['ID_VERIFICATION','LIVENESS','FACE_MATCH','IP_ANALYSIS'],
         workflow_version = 1
   where id = v_ver;
  select 'AML' = any(features_aplicadas) into v_bool
    from verificacion_identidad where id = v_ver;
  insert into resultado values (14, 'Se puede saber que a ESTA sesión no se le corrió AML',
    'false', coalesce(v_bool::text, '(nulo)'), v_bool is false);

  -- ------------------------------------------------------------------
  -- 15. El bucket es privado
  -- ------------------------------------------------------------------
  select public into v_bool from storage.buckets where id = 'expedientes-identidad';
  insert into resultado values (15, 'El bucket de documentos de identidad NO es público',
    'false', coalesce(v_bool::text, '(sin bucket)'), v_bool is false);

  delete from artefacto_verificacion where client_id = v_cli;
  delete from conciliacion_verificacion where didit_session_id = 'sess-perdida-1';
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
