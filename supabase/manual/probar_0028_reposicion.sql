-- =====================================================================
-- Pruebas de comportamiento de la 0028 · reponer el segundo factor
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql, nunca contra
-- el remoto: crea usuarios, les inventa factores y los borra.
--
-- Lo que de verdad se está probando: que la función que puede dejar a alguien
-- entrando con sólo su contraseña no se pueda llamar desde una organización
-- cliente, no se pueda llamar sin motivo, y no pueda pasar sin dejar rastro.
-- Que borre el factor es lo fácil; lo que hay que demostrar es lo otro.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_kawiil  uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_org     uuid := 'cccccccc-0000-0000-0000-000000000001';
  v_oc      uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  v_n       int;
  v_msg     text;
  v_res     jsonb;
  v_sec     bigint;
begin
  -- ------------------------------------------------------------------
  -- Montaje: un admin de Kawiil, una notaría, y su OC con factor y sesión
  -- ------------------------------------------------------------------
  insert into auth.users (id, email) values (v_kawiil, 'kawiil@prueba.mx') on conflict do nothing;
  insert into platform_admin (user_id, nombre) values (v_kawiil, 'Kawiil de prueba') on conflict do nothing;

  insert into organizations (id, rfc, razon_social)
  values (v_org, 'ORG900101AB1', 'Notaría Cliente') on conflict do nothing;

  insert into auth.users (id, email) values (v_oc, 'oc@notaria.mx') on conflict do nothing;
  insert into user_profile (id, organization_id, nombre, email)
  values (v_oc, v_org, 'Oficial de Cumplimiento', 'oc@notaria.mx') on conflict do nothing;
  insert into user_roles (user_id, organization_id, rol)
  values (v_oc, v_org, 'oc') on conflict do nothing;

  insert into auth.mfa_factors (user_id, friendly_name, status)
  values (v_oc, 'Teléfono viejo', 'verified');
  insert into auth.sessions (user_id) values (v_oc), (v_oc);

  select coalesce(ultima_secuencia, 0) into v_sec
    from cadena_auditoria where organization_id = v_org;
  v_sec := coalesce(v_sec, 0);

  -- ------------------------------------------------------------------
  -- 1. Un cliente no ve el padrón de usuarios de las demás organizaciones
  -- ------------------------------------------------------------------
  perform set_config('ikan.uid', v_oc::text, false);
  set local role probador;
  select count(*) into v_n from public.usuarios_de_plataforma();
  reset role;
  insert into resultado values (1, 'Un cliente NO ve el padrón', '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 2. Kawiil sí, y ve el estado del factor
  -- ------------------------------------------------------------------
  perform set_config('ikan.uid', v_kawiil::text, false);
  set local role probador;
  select count(*) into v_n
    from public.usuarios_de_plataforma()
   where user_id = v_oc and factores_verificados = 1;
  reset role;
  insert into resultado values (2, 'Kawiil ve al OC con su factor', '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 3. Un cliente NO puede reponerle el factor a nadie. La prueba que importa:
  --    con esto abierto, cualquiera se quita a sí mismo el segundo factor y
  --    la obligatoriedad del 2FA deja de existir.
  -- ------------------------------------------------------------------
  perform set_config('ikan.uid', v_oc::text, false);
  begin
    set local role probador;
    perform public.reponer_segundo_factor(v_oc, 'me quiero quitar el 2FA');
    reset role;
    insert into resultado values (3, 'Un cliente NO puede reponer', 'excepción', 'pasó', false);
  exception when others then
    reset role;
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (3, 'Un cliente NO puede reponer', 'excepción',
      left(v_msg, 60), v_msg like '%administrador de plataforma%');
  end;

  -- ------------------------------------------------------------------
  -- 4. Sin motivo, ni Kawiil
  -- ------------------------------------------------------------------
  perform set_config('ikan.uid', v_kawiil::text, false);
  begin
    perform public.reponer_segundo_factor(v_oc, '  ');
    insert into resultado values (4, 'Sin motivo no se repone', 'excepción', 'pasó', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (4, 'Sin motivo no se repone', 'excepción',
      left(v_msg, 60), v_msg like '%motivo%');
  end;

  -- ------------------------------------------------------------------
  -- 5. Con motivo sí, y devuelve lo que hizo
  -- ------------------------------------------------------------------
  select public.reponer_segundo_factor(v_oc, 'Perdió el teléfono el 30/08; lo confirmó por videollamada')
    into v_res;
  insert into resultado values (5, 'Repone y reporta lo que hizo',
    '1 factor, 2 sesiones',
    (v_res->>'factores_eliminados') || ' factor, ' || (v_res->>'sesiones_cerradas') || ' sesiones',
    v_res->>'factores_eliminados' = '1' and v_res->>'sesiones_cerradas' = '2');

  -- ------------------------------------------------------------------
  -- 6. El factor ya no está…
  -- ------------------------------------------------------------------
  select count(*) into v_n from auth.mfa_factors where user_id = v_oc;
  insert into resultado values (6, 'El factor se fue', '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 7. …y la sesión del teléfono perdido tampoco. Reponer el factor sin
  --    cerrar la sesión resuelve la mitad del problema y deja la peligrosa.
  -- ------------------------------------------------------------------
  select count(*) into v_n from auth.sessions where user_id = v_oc;
  insert into resultado values (7, 'Las sesiones vivas se cerraron', '0', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 8. Quedó en la cadena de LA NOTARÍA, no en la de plataforma: el sujeto
  --    obligado tiene que poder enseñarlo en su propio paquete.
  -- ------------------------------------------------------------------
  -- Acotado a los eventos de ESTA corrida (`secuencia > v_sec`, capturada en
  -- el montaje). Sin eso la prueba contaba el histórico de la cadena y fallaba
  -- la segunda vez que se corría sobre la misma base: encontraba 3 donde
  -- esperaba 1, y la culpa era de la prueba, no del código.
  select count(*) into v_n
    from evento_auditoria
   where organization_id = v_org
     and secuencia > v_sec
     and tipo = 'segundo_factor_repuesto'
     and entidad_id = v_oc
     and payload->>'motivo' like 'Perdió el teléfono%'
     and (payload->>'repuesto_por')::uuid = v_kawiil;
  insert into resultado values (8, 'El evento quedó en la cadena de la notaría', '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 9. Y la cadena sigue íntegra después de escribirlo
  -- ------------------------------------------------------------------
  select count(*) into v_n from public.verificar_cadena(v_org);
  insert into resultado values (9, 'La cadena de la notaría sigue íntegra', '0 roturas', v_n::text, v_n = 0);

  -- ------------------------------------------------------------------
  -- 10. Repetir la reposición no inventa un evento fantasma: si ya no hay
  --     factor, lo honesto es decirlo, no fingir que se hizo algo.
  -- ------------------------------------------------------------------
  begin
    perform public.reponer_segundo_factor(v_oc, 'Otra vez, por si acaso, con motivo largo');
    insert into resultado values (10, 'Sin factor que reponer, avisa', 'excepción', 'pasó', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (10, 'Sin factor que reponer, avisa', 'excepción',
      left(v_msg, 60), v_msg like '%no hay nada que reponer%');
  end;

  -- ------------------------------------------------------------------
  -- 11. Un usuario que no existe tampoco pasa
  -- ------------------------------------------------------------------
  begin
    perform public.reponer_segundo_factor(
      '99999999-9999-9999-9999-999999999999', 'Motivo suficientemente largo');
    insert into resultado values (11, 'Usuario inexistente, excepción', 'excepción', 'pasó', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (11, 'Usuario inexistente, excepción', 'excepción',
      left(v_msg, 60), v_msg like '%No existe ese usuario%');
  end;

  -- ------------------------------------------------------------------
  -- 12. Ninguna de las dos funciones quedó al alcance de anon. En Supabase el
  --     ALTER DEFAULT PRIVILEGES las abre solo; ya nos costó la 0021.
  -- ------------------------------------------------------------------
  v_n := 0;
  if has_function_privilege('anon', 'public.usuarios_de_plataforma()', 'execute') then v_n := v_n + 1; end if;
  if has_function_privilege('anon', 'public.reponer_segundo_factor(uuid,text)', 'execute') then v_n := v_n + 1; end if;
  insert into resultado values (12, 'anon no puede llamarlas', '0', v_n::text, v_n = 0);

  perform set_config('ikan.uid', '', false);
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
