-- =====================================================================
-- Pruebas de comportamiento · Migration 0074
-- =====================================================================
-- Qué se prueba: los tres desenlaces de la compuerta, que el corroborante
-- tenga que COINCIDIR y no sólo existir, que las suprimidas se cuenten en vez
-- de callarse, y que la compuerta NO se aplique a las coincidencias fuertes —
-- pedirle una fecha a un cotejo exacto de RFC sería descartar hallazgos buenos.
--
-- Corre después de migrations + seeds. Se limpia sola.

\set ON_ERROR_STOP on
\pset pager off

do $$
declare
  v_txt    text;
  v_n      int;
  v_m      int;
  v_msg    text;
  v_ok     int := 0;
  v_fuente uuid;
  v_carga  uuid := 'aaaaaaaa-0000-0000-0000-00000000c001';
  v_id_con uuid;
  v_id_sin uuid;
  v_id_rfc uuid;
begin
  -- ------------------------------------------------------------------
  -- Montaje
  -- ------------------------------------------------------------------
  -- Fuente propia y OPERATIVA: es lo que la compuerta de la 298 permite ya, y
  -- sin una fuente operativa el barrido no devuelve nada y estas pruebas no
  -- comprobarían nada.
  insert into lista_fuente
    (codigo, nombre, autoridad, naturaleza, modo_actualizacion,
     obligatoria, activa, determinacion, efecto, fundamento, modo_operacion, notas)
  values
    ('prueba_corroborante', 'FUENTE DE PRUEBA · compuerta del corroborante',
     'Ninguna: es una fixture', 'sancion_aml', 'snapshot',
     false, true, 'aplica', 'impedimento', 'informativa', 'operativa',
     'La crea y la borra probar_0074_corroborante.sql.')
  on conflict (codigo) do update set modo_operacion = 'operativa', activa = true
  returning id into v_fuente;

  insert into lista_carga (id, fuente_id, tipo, estado, fecha_publicacion_fuente, notas)
  values (v_carga, v_fuente, 'archivo', 'aplicada', date '2026-09-07', 'PRUEBA')
  on conflict (id) do nothing;

  -- Tres designados, y cada uno prueba una cosa distinta:
  --   · CON FECHA trae dos fechas exactas, como hace la ONU con 20 de sus
  --     registros. Sirve para corroborada y para contradicha.
  --   · SIN FECHA no trae ninguna. Sirve para no_corroborable.
  --   · CON RFC coteja por RFC, para comprobar que la compuerta NO se le
  --     aplica.
  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, rfc, oficio_numero, oficio_fecha,
     nombres_alternos_debiles, identificadores)
  values
    (v_carga, 'alta', 'persona', 'ABDALLAH CON FECHA', null, 'PC-1', date '2026-09-07',
     array['ABDULA CON FECHA'],
     '{"fechas_nacimiento_exactas": ["1965-12-28", "1965-12-29"]}'::jsonb),
    (v_carga, 'alta', 'persona', 'ABDALLAH SIN FECHA', null, 'PC-2', date '2026-09-07',
     array['ABDULA SIN FECHA'],
     '{"fechas_nacimiento_exactas": []}'::jsonb),
    (v_carga, 'alta', 'persona', 'ABDALLAH CON RFC', 'ACR800101AA1', 'PC-3', date '2026-09-07',
     array['ABDULA CON RFC'],
     '{"fechas_nacimiento_exactas": []}'::jsonb);

  select id into v_id_con from lista_registro
   where fuente_id = v_fuente and nombre = 'ABDALLAH CON FECHA';
  select id into v_id_sin from lista_registro
   where fuente_id = v_fuente and nombre = 'ABDALLAH SIN FECHA';
  select id into v_id_rfc from lista_registro
   where fuente_id = v_fuente and nombre = 'ABDALLAH CON RFC';

  -- ------------------------------------------------------------------
  -- 1. Corroborada: la fecha coincide, y con la SEGUNDA de la lista
  -- ------------------------------------------------------------------
  -- La segunda a propósito. La ONU publica varias fechas candidatas y mi
  -- lector las unía en una cadena; si la compuerta comparara contra la primera
  -- o contra la cadena, este caso fallaría — y son 20 registros reales.
  select desenlace::text into v_txt
    from public.corroborar_coincidencia(v_id_con, date '1965-12-29');
  if v_txt is distinct from 'corroborada' then
    raise exception 'PRUEBA 1: la segunda fecha de la lista también corrobora, y dijo "%"',
      coalesce(v_txt, '(nulo)');
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  1 OK · corrobora contra cualquiera de las fechas publicadas';

  -- ------------------------------------------------------------------
  -- 2. Contradicha: los dos traen el dato y no coinciden
  -- ------------------------------------------------------------------
  select desenlace::text, campo into v_txt, v_msg
    from public.corroborar_coincidencia(v_id_con, date '1980-01-01');
  if v_txt is distinct from 'contradicha' then
    raise exception 'PRUEBA 2: se esperaba contradicha y se obtuvo "%"', coalesce(v_txt, '(nulo)');
  end if;
  if v_msg is distinct from 'fecha_nacimiento' then
    raise exception 'PRUEBA 2: la 329 pide decir qué campo la descartó, y dijo "%"',
      coalesce(v_msg, '(nulo)');
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  2 OK · contradicha, diciendo qué campo la descartó';

  -- ------------------------------------------------------------------
  -- 3. No corroborable, en sus dos formas
  -- ------------------------------------------------------------------
  -- La lista no trae el dato…
  select desenlace::text into v_txt
    from public.corroborar_coincidencia(v_id_sin, date '1965-12-28');
  if v_txt is distinct from 'no_corroborable' then
    raise exception 'PRUEBA 3: sin fecha en la lista es no_corroborable, y dijo "%"', v_txt;
  end if;
  -- …y el compareciente no lo aportó.
  select desenlace::text into v_txt
    from public.corroborar_coincidencia(v_id_con, null);
  if v_txt is distinct from 'no_corroborable' then
    raise exception 'PRUEBA 3: sin fecha del compareciente es no_corroborable, y dijo "%"', v_txt;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  3 OK · no corroborable cuando falta el dato en cualquiera de los dos';

  -- ------------------------------------------------------------------
  -- 4. Existir NO es corroborar
  -- ------------------------------------------------------------------
  -- Instrucción 328, y es el punto entero. Si bastara con que el campo
  -- existiera, el caso de la prueba 2 —fecha presente en los dos y distinta—
  -- habría salido corroborado y una no-coincidencia demostrada se habría
  -- mostrado como hipótesis.
  if (select desenlace::text from public.corroborar_coincidencia(v_id_con, date '1980-01-01'))
     = 'corroborada' then
    raise exception 'PRUEBA 4: el campo tiene que COINCIDIR, no sólo existir';
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  4 OK · el corroborante tiene que coincidir, no sólo existir';

  -- ------------------------------------------------------------------
  -- 5. El barrido sólo devuelve la corroborada
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from public.coincidencias_en_listas('ABDULA CON FECHA', null, true, date '1965-12-28');
  if v_n <> 1 then
    raise exception 'PRUEBA 5: la corroborada tiene que salir, y salieron %', v_n;
  end if;
  select count(*) into v_n
    from public.coincidencias_en_listas('ABDULA CON FECHA', null, true, date '1980-01-01');
  if v_n <> 0 then
    raise exception 'PRUEBA 5: la contradicha NO puede salir, y salieron %', v_n;
  end if;
  select count(*) into v_n
    from public.coincidencias_en_listas('ABDULA SIN FECHA', null, true, date '1965-12-28');
  if v_n <> 0 then
    raise exception 'PRUEBA 5: la no corroborable NO puede salir, y salieron %', v_n;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  5 OK · sólo la corroborada llega a la pantalla';

  -- ------------------------------------------------------------------
  -- 6. Y dice cómo se corroboró
  -- ------------------------------------------------------------------
  -- Sin esto, quien revisa no puede distinguir una hipótesis levantada por un
  -- alias débil corroborado de una coincidencia por nombre primario.
  select corroboracion::text, corroborado_por into v_txt, v_msg
    from public.coincidencias_en_listas('ABDULA CON FECHA', null, true, date '1965-12-28');
  if v_txt is distinct from 'corroborada' or v_msg is distinct from 'fecha_nacimiento' then
    raise exception 'PRUEBA 6: el barrido debe decir cómo se corroboró, y dijo "%" / "%"',
      coalesce(v_txt, '(nulo)'), coalesce(v_msg, '(nulo)');
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  6 OK · el barrido declara el desenlace y el campo';

  -- ------------------------------------------------------------------
  -- 7. La compuerta NO se aplica a un cotejo por RFC
  -- ------------------------------------------------------------------
  -- Lo más importante de esta migration después de los tres desenlaces. Si la
  -- compuerta se aplicara a todo, un cotejo exacto de RFC sin fecha de
  -- nacimiento se suprimiría — un falso negativo sobre la coincidencia más
  -- fuerte que existe, y en una lista que impide operar.
  select count(*), min(corroboracion::text) into v_n, v_txt
    from public.coincidencias_en_listas(null, 'ACR800101AA1', true, null);
  if v_n <> 1 then
    raise exception 'PRUEBA 7: el cotejo por RFC no pasa por la compuerta y debe salir; '
      'salieron %', v_n;
  end if;
  if v_txt is not null then
    raise exception 'PRUEBA 7: una coincidencia fuerte no lleva desenlace de corroboración, '
      'y llevó "%"', v_txt;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  7 OK · el cotejo por RFC no pasa por la compuerta';

  -- ------------------------------------------------------------------
  -- 8. Tampoco al nombre primario ni al alias bueno
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from public.coincidencias_en_listas('ABDALLAH SIN FECHA', null, true, null);
  if v_n <> 1 then
    raise exception 'PRUEBA 8: el nombre primario no pasa por la compuerta; salieron %', v_n;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  8 OK · el nombre primario tampoco pasa por la compuerta';

  -- ------------------------------------------------------------------
  -- 9. Las suprimidas se cuentan
  -- ------------------------------------------------------------------
  -- Instrucción 330. Suprimir es la decisión correcta; suprimir en silencio no.
  select no_corroborables, contradichas into v_n, v_m
    from public.coincidencias_suprimidas('ABDULA CON FECHA', null, date '1980-01-01');
  if v_m <> 1 then
    raise exception 'PRUEBA 9: la contradicha debe contarse, y contó %', v_m;
  end if;
  select no_corroborables, contradichas into v_n, v_m
    from public.coincidencias_suprimidas('ABDULA SIN FECHA', null, date '1965-12-28');
  if v_n <> 1 then
    raise exception 'PRUEBA 9: la no corroborable debe contarse, y contó %', v_n;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  9 OK · las suprimidas se cuentan, por su motivo';

  -- ------------------------------------------------------------------
  -- 10. La contradicha queda con nombre y con el campo que la descartó
  -- ------------------------------------------------------------------
  -- Instrucción 329. Es la que la Nota 5 llama la más valiosa: mejor prueba de
  -- que el control corrió que no haberla producido nunca.
  select count(*), min(campo), min(detalle) into v_n, v_txt, v_msg
    from public.coincidencias_descartadas('ABDULA CON FECHA', null, date '1980-01-01');
  if v_n <> 1 then
    raise exception 'PRUEBA 10: la contradicha debe quedar asentada, y hay % filas', v_n;
  end if;
  if v_txt is distinct from 'fecha_nacimiento' then
    raise exception 'PRUEBA 10: debe decir qué campo la descartó, y dijo "%"', v_txt;
  end if;
  if v_msg is null or v_msg !~ '1965-12-28' then
    raise exception 'PRUEBA 10: el detalle debe traer el dato de la lista, y dijo "%"', v_msg;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA 10 OK · la contradicha queda asentada, con el campo y el dato';

  -- ------------------------------------------------------------------
  -- 11. Una fuente en validación sigue sin barrerse
  -- ------------------------------------------------------------------
  -- La 297 no se cae por la 298: son controles distintos y los dos siguen.
  update lista_fuente set modo_operacion = 'validacion' where id = v_fuente;
  select count(*) into v_n
    from public.coincidencias_en_listas('ABDULA CON FECHA', null, true, date '1965-12-28');
  if v_n <> 0 then
    raise exception 'PRUEBA 11: en validación no barre ni con la compuerta abierta; salieron %',
      v_n;
  end if;
  update lista_fuente set modo_operacion = 'operativa' where id = v_fuente;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA 11 OK · la 297 sigue en pie con la compuerta abierta';

  -- ------------------------------------------------------------------
  -- 12. Y ahora sí se puede poner una fuente a operar
  -- ------------------------------------------------------------------
  -- Era lo que la 298 impedía. Que se pueda no significa que alguna lo esté:
  -- el catálogo sigue entero en validación y pasar cada una es decisión de
  -- quien la valide.
  if not public.cotejo_con_calidad_de_alias() then
    raise exception 'PRUEBA 12: la compuerta de la 298 debería estar abierta';
  end if;
  select count(*) into v_n from lista_fuente
   where modo_operacion = 'operativa' and codigo <> 'prueba_corroborante';
  if v_n <> 0 then
    raise exception 'PRUEBA 12: abrir la compuerta no pone nada a operar, y hay % operando',
      v_n;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA 12 OK · la compuerta abre, y el catálogo sigue en validación';

  -- ------------------------------------------------------------------
  -- Limpieza
  -- ------------------------------------------------------------------
  update lista_carga set estado = 'revertida' where id = v_carga;
  delete from lista_movimiento where carga_id = v_carga;
  delete from lista_registro where fuente_id = v_fuente;
  delete from lista_carga where id = v_carga;
  delete from lista_fuente where codigo = 'prueba_corroborante';

  select count(*) into v_n from lista_fuente where codigo = 'prueba_corroborante';
  if v_n <> 0 then
    raise exception 'quedó la fuente de prueba sin limpiar';
  end if;

  raise notice '--- 0074: % de 12 ---', v_ok;

exception when others then
  get stacked diagnostics v_msg = message_text;
  raise notice 'FALLO: %', v_msg;
  raise;
end $$;
