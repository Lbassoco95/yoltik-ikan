-- =====================================================================
-- Pruebas de comportamiento de la 0034 · entorno de demostración
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql, nunca contra
-- el remoto: crea y BORRA datos.
--
-- Lo que hay que demostrar no es que la marca se guarde —eso es una columna—
-- sino las dos cosas que evitan un accidente: que un aviso de demostración no
-- se pueda firmar, y que retirar los datos de prueba no se lleve por delante
-- la bitácora ni pueda apuntar por error a un cliente real.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_kawiil uuid := 'aaaaaaaa-0000-0000-0000-000000000034';
  v_demo   uuid := 'dddddddd-0000-0000-0000-000000000034';
  v_real   uuid := 'eeeeeeee-0000-0000-0000-000000000034';
  v_cli    uuid;
  v_aviso  uuid;
  v_aviso_real uuid;
  v_msg    text;
  v_n      int;
  v_res    jsonb;
  v_eventos_antes bigint;
  v_retiros_antes bigint;
begin
  insert into auth.users (id, email) values (v_kawiil, 'kawiil34@prueba.mx') on conflict do nothing;
  insert into platform_admin (user_id, nombre) values (v_kawiil, 'Kawiil') on conflict do nothing;

  insert into organizations (id, rfc, razon_social, es_demostracion)
  values (v_demo, 'DEM900101AB1', 'Notaría de Demostración', true),
         (v_real, 'REA900101AB1', 'Notaría Real', false)
    on conflict (id) do update set es_demostracion = excluded.es_demostracion;

  insert into client (organization_id, tipo_persona, nombre_razon_social)
  values (v_demo, 'fisica', 'Compareciente de prueba') returning id into v_cli;

  perform set_config('ikan.uid', v_kawiil::text, false);

  -- ------------------------------------------------------------------
  -- 1. El aviso hereda la marca al nacer, sin que nadie se la ponga
  -- ------------------------------------------------------------------
  insert into aviso (organization_id, tipo, payload)
  values (v_demo, 'mensual', '{}'::jsonb) returning id into v_aviso;
  select count(*) into v_n from aviso where id = v_aviso and de_demostracion;
  insert into resultado values (1, 'El aviso nace marcado', '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 2. Y un aviso de una organización real NO se marca
  -- ------------------------------------------------------------------
  insert into aviso (organization_id, tipo, payload)
  values (v_real, 'mensual', '{}'::jsonb) returning id into v_aviso_real;
  select count(*) into v_n from aviso where id = v_aviso_real and de_demostracion;
  insert into resultado values (2, 'El de una organización real no', '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 3. LA PRUEBA QUE IMPORTA: no se puede firmar
  -- ------------------------------------------------------------------
  -- Un aviso firmado es el que alguien sube al portal sin volver a mirarlo.
  begin
    update aviso set firmado_por = v_kawiil, firmado_en = now() where id = v_aviso;
    insert into resultado values (3, 'Un aviso de demostración NO se firma', 'excepción', 'se firmó', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (3, 'Un aviso de demostración NO se firma', 'excepción',
      left(v_msg, 55), v_msg like '%no puede firmarse%');
  end;

  -- ------------------------------------------------------------------
  -- 4. El de la organización real sí se firma: el candado es del demo
  -- ------------------------------------------------------------------
  begin
    -- Acotado al aviso de ESTA corrida. Contando por organización, la segunda
    -- vez que se corre la suite salen los de la anterior: el mismo defecto que
    -- ya se corrigió en probar_0028 y se repitió aquí.
    update aviso set firmado_por = v_kawiil, firmado_en = now() where id = v_aviso_real;
    select count(*) into v_n from aviso where id = v_aviso_real and firmado_por is not null;
    insert into resultado values (4, 'El de una organización real sí', '1', v_n::text, v_n = 1);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (4, 'El de una organización real sí', '1', left(v_msg,50), false);
  end;

  -- ------------------------------------------------------------------
  -- 5. Retirar datos de una organización REAL: se niega
  -- ------------------------------------------------------------------
  -- Es el candado contra el dedazo en el UUID. Esto no tiene deshacer.
  begin
    perform public.retirar_datos_de_demostracion(v_real, 'Me equivoqué de organización');
    insert into resultado values (5, 'NO vacía una organización real', 'excepción', 'la vació', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (5, 'NO vacía una organización real', 'excepción',
      left(v_msg, 55), v_msg like '%NO está marcada%');
  end;

  -- ------------------------------------------------------------------
  -- 6. Sin motivo tampoco
  -- ------------------------------------------------------------------
  begin
    perform public.retirar_datos_de_demostracion(v_demo, 'ya');
    insert into resultado values (6, 'Sin motivo no se vacía', 'excepción', 'se vació', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (6, 'Sin motivo no se vacía', 'excepción',
      left(v_msg, 55), v_msg like '%motivo%');
  end;

  -- ------------------------------------------------------------------
  -- 7. Con motivo sí, y dice qué retiró
  -- ------------------------------------------------------------------
  select count(*) into v_eventos_antes from evento_auditoria where organization_id = v_demo;
  select count(*) into v_retiros_antes from evento_auditoria
   where organization_id = v_demo and tipo = 'datos_de_demostracion_retirados';

  select public.retirar_datos_de_demostracion(
    v_demo, 'La notaría contrató y va a cargar información real') into v_res;
  insert into resultado values (7, 'Vacía y reporta lo que quitó', '1 cliente',
    (v_res->'retirado'->>'client') || ' cliente', (v_res->'retirado'->>'client') = '1');

  select count(*) into v_n from client where organization_id = v_demo;
  insert into resultado values (8, 'Los datos de prueba se fueron', '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 9. LA OTRA PRUEBA QUE IMPORTA: la bitácora se quedó, y creció
  -- ------------------------------------------------------------------
  -- Sin ella la organización tendría meses de silencio y nadie sabría si es
  -- que no operó o que alguien limpió algo.
  select count(*) into v_n from evento_auditoria where organization_id = v_demo;
  insert into resultado values (9, 'La bitácora sobrevive al vaciado',
    'más que antes (' || v_eventos_antes || ')', v_n::text, v_n > v_eventos_antes);

  -- Contra el conteo previo, no contra un reloj: registrar_evento sella con
  -- now(), que es el inicio de la transacción y por tanto ANTERIOR a cualquier
  -- clock_timestamp() tomado dentro del bloque. Filtrar por tiempo daba cero.
  select count(*) into v_n from evento_auditoria
   where organization_id = v_demo and tipo = 'datos_de_demostracion_retirados'
     and payload->>'motivo' like 'La notaría contrató%';
  insert into resultado values (10, 'Y explica el hueco que deja',
    'uno más que antes', (v_n - v_retiros_antes)::text, v_n = v_retiros_antes + 1);

  select count(*) into v_n from public.verificar_cadena(v_demo);
  insert into resultado values (11, 'La cadena sigue íntegra', '0 roturas', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 12. La organización sigue en pie y su configuración también
  -- ------------------------------------------------------------------
  -- Si esto se borrara, habría que resembrar para volver a demostrar.
  select count(*) into v_n from organizations where id = v_demo and es_demostracion;
  insert into resultado values (12, 'La organización sigue ahí', '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 13. Un cliente no puede vaciar nada, ni su propia organización
  -- ------------------------------------------------------------------
  perform set_config('ikan.uid', '', false);
  begin
    perform public.retirar_datos_de_demostracion(v_demo, 'Quiero borrar mis datos de prueba');
    insert into resultado values (13, 'Sin ser Kawiil no se vacía', 'excepción', 'se vació', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (13, 'Sin ser Kawiil no se vacía', 'excepción',
      left(v_msg, 55), v_msg like '%administrador de plataforma%');
  end;
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
