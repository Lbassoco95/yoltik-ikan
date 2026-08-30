-- =====================================================================
-- Pruebas de comportamiento de la 0027 · prospectos visibles para Kawiil
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql, nunca contra
-- el remoto: inserta y borra datos.
--
-- Lo que de verdad se está probando: que abrir la puerta a Kawiil NO se la
-- haya abierto de paso a las organizaciones cliente. Son datos de contacto de
-- prospectos —correo, teléfono y qué tan avanzado va su cumplimiento— que no
-- le tocan a ningún cliente de Ikán.
-- =====================================================================

-- Quién es el usuario se simula con `ikan.uid`, que es de donde lee el
-- `auth.uid()` del banco de pruebas (ver harness_postgres_local.sql).
--
-- Y con ámbito de SESIÓN, no local: con ámbito local un bloque `exception`
-- hace rollback a su savepoint y se lleva por delante el usuario simulado, de
-- modo que la prueba siguiente corría con el anterior. Al final se limpia.
create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_kawiil uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_cliente uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  v_prospecto uuid;
  v_n int;
  v_msg text;
  v_notas text;
begin
  -- Un prospecto, escrito como lo escribe la Edge Function (service_role).
  insert into prospect_intake (
    razon_social, rfc, actividad_vulnerable, contacto_nombre, contacto_email,
    consentimiento_privacidad, consentimiento_contacto)
  values ('Notaría de Prueba', 'NPR900101AB1', array['XII'], 'Quien Sea',
          'quien@ejemplo.mx', true, true)
  returning id into v_prospecto;
  insert into resultado values (1, 'La Edge Function puede escribir', 'ok', 'ok', true);

  -- 2. Kawiil lo ve.
  insert into auth.users (id, email) values (v_kawiil, 'kawiil@prueba.mx')
    on conflict do nothing;
  insert into platform_admin (user_id, nombre) values (v_kawiil, 'Kawiil de prueba')
    on conflict do nothing;

  perform set_config('ikan.uid', v_kawiil::text, false);
  set local role probador;
  select count(*) into v_n from prospect_intake;
  reset role;
  insert into resultado values (2, 'Kawiil ve a los prospectos', '1 o más', v_n::text, v_n >= 1);

  -- 3. Una organización cliente NO los ve. Es la prueba que importa.
  insert into auth.users (id, email) values (v_cliente, 'oc@notaria.mx')
    on conflict do nothing;
  insert into organizations (id, rfc, razon_social)
  values ('cccccccc-0000-0000-0000-000000000001', 'ORG900101AB1', 'Notaría Cliente')
    on conflict do nothing;
  insert into user_profile (id, organization_id, nombre, email)
  values (v_cliente, 'cccccccc-0000-0000-0000-000000000001', 'OC', 'oc@notaria.mx')
    on conflict do nothing;
  insert into user_roles (user_id, organization_id, rol)
  values (v_cliente, 'cccccccc-0000-0000-0000-000000000001', 'admin')
    on conflict do nothing;

  perform set_config('ikan.uid', v_cliente::text, false);
  set local role probador;
  select count(*) into v_n from prospect_intake;
  reset role;
  insert into resultado values (3, 'Un cliente NO ve prospectos', '0', v_n::text, v_n = 0);

  -- 4. Y tampoco los ve por la vista de resumen: sin security_invoker, el
  --    conteo del embudo de Kawiil se le habría escapado a todo el mundo.
  perform set_config('ikan.uid', v_cliente::text, false);
  set local role probador;
  select count(*) into v_n from v_prospectos_resumen;
  reset role;
  insert into resultado values (4, 'Un cliente NO ve ni el resumen', '0', v_n::text, v_n = 0);

  -- 5. Kawiil sí ve el resumen.
  perform set_config('ikan.uid', v_kawiil::text, false);
  set local role probador;
  select count(*) into v_n from v_prospectos_resumen;
  reset role;
  insert into resultado values (5, 'Kawiil ve el resumen', '1 o más', v_n::text, v_n >= 1);

  -- 6. Un cliente no puede mover un prospecto.
  perform set_config('ikan.uid', v_cliente::text, false);
  begin
    perform public.marcar_prospecto(v_prospecto, 'cliente', 'me lo quedo');
    insert into resultado values (6, 'Un cliente mueve un prospecto', 'rechazado', 'aceptado', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (6, 'Un cliente mueve un prospecto', 'rechazado',
                                  left(v_msg, 40), v_msg like '%administrador de plataforma%');
  end;

  -- 7. Kawiil sí, y con su nota.
  perform set_config('ikan.uid', v_kawiil::text, false);
  perform public.marcar_prospecto(v_prospecto, 'contactado', 'Llamada del 30/08');
  insert into resultado
  select 7, 'Kawiil mueve el prospecto', 'contactado', status, status = 'contactado'
    from prospect_intake where id = v_prospecto;

  -- 8. Un estado inventado no entra.
  begin
    perform public.marcar_prospecto(v_prospecto, 'mas_o_menos', null);
    insert into resultado values (8, 'Estado inventado', 'rechazado', 'aceptado', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (8, 'Estado inventado', 'rechazado',
                                  left(v_msg, 40), v_msg like '%no válido%');
  end;

  -- 9. La segunda nota SE AÑADE. Sustituirla perdería el motivo por el que el
  --    prospecto está donde está.
  perform public.marcar_prospecto(v_prospecto, 'en_diagnostico', 'Agendado para el 2/09');
  select notas into v_notas from prospect_intake where id = v_prospecto;
  insert into resultado values (9, 'Las notas se acumulan', 'las dos',
                                case when v_notas like '%30/08%' and v_notas like '%2/09%'
                                     then 'las dos' else 'se perdió una' end,
                                v_notas like '%30/08%' and v_notas like '%2/09%');

  -- 10. Mover el prospecto NO toca lo que la persona escribió.
  insert into resultado
  select 10, 'El correo del registro no cambia', 'quien@ejemplo.mx', contacto_email,
         contacto_email = 'quien@ejemplo.mx'
    from prospect_intake where id = v_prospecto;

  -- 11. Un prospecto que no existe se dice, no se traga en silencio.
  begin
    perform public.marcar_prospecto('11111111-1111-1111-1111-111111111111', 'cliente', null);
    insert into resultado values (11, 'Prospecto inexistente', 'rechazado', 'aceptado', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (11, 'Prospecto inexistente', 'rechazado',
                                  left(v_msg, 30), v_msg like '%No existe el prospecto%');
  end;

  delete from prospect_intake where id = v_prospecto;
  perform set_config('ikan.uid', '', false);
end;
$$;

select n as "#", prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as resultado
from resultado order by n;
