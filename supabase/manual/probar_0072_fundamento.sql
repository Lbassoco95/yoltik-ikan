-- =====================================================================
-- Pruebas de comportamiento · Migration 0072
-- =====================================================================
-- Qué se prueba: que la insignia «Obligatoria» ya no sea lo que sostiene la
-- pantalla, que cada fuente consultable declare de dónde nace la exigencia, y
-- —lo que de verdad importa— que NO se pueda afirmar que una fuente está
-- prevista en un Manual que no existe.
--
-- Corre después de migrations + seeds. Se limpia sola.

\set ON_ERROR_STOP on
\pset pager off

do $$
declare
  v_txt   text;
  v_n     int;
  v_msg   text;
  v_ok    int := 0;
  v_org   uuid := '11111111-1111-1111-1111-111111111111';
  v_user  uuid := 'eeeeeeee-0000-0000-0000-0000000000f1';
begin
  -- ------------------------------------------------------------------
  -- 1. Toda fuente consultable declara su fundamento
  -- ------------------------------------------------------------------
  -- Es la guarda de la migration, comprobada desde fuera: una fuente que se
  -- muestra sin poder decir por qué se consulta es la insignia vieja con otro
  -- nombre.
  select string_agg(codigo, ', ') into v_txt
    from lista_fuente
   where activa and determinacion = 'aplica' and fundamento is null;
  if v_txt is not null then
    raise exception 'PRUEBA 1: fuentes activas que aplican sin fundamento: %', v_txt;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  1 OK · toda fuente consultable dice de dónde nace la exigencia';

  -- ------------------------------------------------------------------
  -- 2. Sólo UNA fuente es obligación de ley
  -- ------------------------------------------------------------------
  -- El art. 18 no ordena consultar listas de sanciones. Si algún día dos
  -- fuentes dicen «obligación de ley», alguien volvió a meter la afirmación
  -- que la Nota 2 desarmó.
  select string_agg(codigo, ', ') into v_txt
    from lista_fuente where activa and fundamento = 'obligacion_ley';
  if v_txt is distinct from 'ppe_cargos_68a' then
    raise exception 'PRUEBA 2: la única obligación de ley es el catálogo de cargos de PPE, '
      'y salieron: %', coalesce(v_txt, '(ninguna)');
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  2 OK · sólo el catálogo de cargos es obligación de ley';

  -- ------------------------------------------------------------------
  -- 3. Las de sanciones y fiscales son metodología, no ley
  -- ------------------------------------------------------------------
  select count(*) into v_n from lista_fuente
   where activa and fundamento = 'metodologia_manual'
     and codigo in ('onu_consolidada', 'ofac_sdn', 'ofac_consolidada', 'sat_69b', 'sat_69b_bis');
  if v_n <> 5 then
    raise exception 'PRUEBA 3: se esperaban 5 fuentes de metodología del Manual y hay %', v_n;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  3 OK · ONU, las dos de OFAC y las dos del SAT son metodología';

  -- ------------------------------------------------------------------
  -- 4. La ONU: mismo fundamento que OFAC, distinto efecto
  -- ------------------------------------------------------------------
  -- Instrucción 339, y es el punto que hace que separar las dos etiquetas
  -- valga la pena. El peso jurídico de una lista se expresa en lo que pasa
  -- cuando hay coincidencia, no en una insignia que diga que la ley obliga a
  -- mirarla.
  if (select fundamento from lista_fuente where codigo = 'onu_consolidada')
     is distinct from (select fundamento from lista_fuente where codigo = 'ofac_sdn') then
    raise exception 'PRUEBA 4: la ONU y OFAC comparten fundamento; la diferencia va en el efecto';
  end if;
  if (select efecto::text from lista_fuente where codigo = 'onu_consolidada') <> 'impedimento'
     or (select efecto::text from lista_fuente where codigo = 'ofac_sdn') <> 'eleva_diligencia' then
    raise exception 'PRUEBA 4: la ONU impide y OFAC eleva; ahí sí se separan';
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  4 OK · la ONU y OFAC: mismo fundamento, distinto efecto';

  -- ------------------------------------------------------------------
  -- 5. La fuente que no se puede consultar NO declara fundamento
  -- ------------------------------------------------------------------
  -- No es un hueco: una etiqueta de fundamento ahí insinuaría que hay algo
  -- que consultar, y no lo hay.
  if (select fundamento from lista_fuente where codigo = 'ppe_oficial') is not null then
    raise exception 'PRUEBA 5: la Lista de PPE de la UIF no se puede consultar, así que no '
      'puede declarar de dónde nace la exigencia de consultarla';
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  5 OK · la fuente no obtenible no declara fundamento';

  -- ------------------------------------------------------------------
  -- 6. Sin sesión de organización, nunca se afirma el Manual
  -- ------------------------------------------------------------------
  -- La consola de Kawiil lee esta vista sin organización en contexto. Ahí la
  -- etiqueta tiene que caer del lado seguro.
  -- Las dos formas de decir «no hay sesión», porque `auth.uid()` se resuelve
  -- distinto según dónde corra esto: el harness local lo lee de `ikan.uid` y
  -- producción del JWT de Supabase. Fijar sólo una dejaría la prueba pasando
  -- por el motivo equivocado en el otro entorno.
  perform set_config('ikan.uid', '', true);
  perform set_config('request.jwt.claims', '', true);
  select fundamento_efectivo into v_txt from v_listas_estado where codigo = 'onu_consolidada';
  if v_txt is distinct from 'pendiente_manual' then
    raise exception 'PRUEBA 6: sin organización en contexto no se puede afirmar el Manual, '
      'y dijo "%"', coalesce(v_txt, '(nulo)');
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  6 OK · sin sesión de organización cae en pendiente_manual';

  -- ------------------------------------------------------------------
  -- Se monta una sesión de organización para las dos que siguen
  -- ------------------------------------------------------------------
  -- `user_profile.id` referencia `auth.users`, así que hay que crear el
  -- usuario de auth primero. Es la única forma de ejercitar
  -- `current_org_id()` sin Supabase Auth corriendo, y sin ejercitarlo la
  -- regla de la 337 sería código que nadie probó.
  insert into auth.users (id, email) values (v_user, 'prueba-0072@ejemplo.mx')
    on conflict (id) do nothing;
  insert into user_profile (id, organization_id, nombre, email)
  values (v_user, v_org, 'Probador 0072', 'prueba-0072@ejemplo.mx')
    on conflict (id) do update set organization_id = excluded.organization_id;
  perform set_config('ikan.uid', v_user::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user::text)::text, true);

  if public.current_org_id() is distinct from v_org then
    raise exception 'PRUEBA: no se pudo montar la sesión de organización; current_org_id() = %',
      coalesce(public.current_org_id()::text, '(nulo)');
  end if;

  -- ------------------------------------------------------------------
  -- 7. Con organización pero SIN Manual asentado: pendiente
  -- ------------------------------------------------------------------
  -- Instrucción 337. Es el estado de hoy de toda organización, porque el dato
  -- no existía hasta esta migration. Afirmar que el cribado está previsto en
  -- un documento que nadie ha visto es el mismo error que la insignia vieja.
  update organizations set manual_pld_asentado_en = null where id = v_org;
  select fundamento_efectivo into v_txt from v_listas_estado where codigo = 'ofac_sdn';
  if v_txt is distinct from 'pendiente_manual' then
    raise exception 'PRUEBA 7: sin Manual asentado tiene que decir pendiente_manual, y dijo "%"',
      coalesce(v_txt, '(nulo)');
  end if;
  -- Y las otras dos etiquetas NO dependen del Manual: no se contagian.
  select fundamento_efectivo into v_txt from v_listas_estado where codigo = 'ppe_cargos_68a';
  if v_txt is distinct from 'obligacion_ley' then
    raise exception 'PRUEBA 7: la obligación de ley no depende del Manual, y dijo "%"', v_txt;
  end if;
  select fundamento_efectivo into v_txt from v_listas_estado where codigo = 'ue_sanciones';
  if v_txt is distinct from 'informativa' then
    raise exception 'PRUEBA 7: la informativa no depende del Manual, y dijo "%"', v_txt;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  7 OK · sin Manual asentado sólo cambian las de metodología';

  -- ------------------------------------------------------------------
  -- 8. Con el Manual asentado: sí se puede afirmar
  -- ------------------------------------------------------------------
  -- La otra mitad, y hay que probarla o la regla de la 337 sería una rama
  -- muerta que siempre dice lo mismo.
  update organizations set manual_pld_asentado_en = date '2026-09-01' where id = v_org;
  select fundamento_efectivo into v_txt from v_listas_estado where codigo = 'ofac_sdn';
  if v_txt is distinct from 'metodologia_manual' then
    raise exception 'PRUEBA 8: con Manual asentado tiene que decir metodologia_manual, y dijo "%"',
      coalesce(v_txt, '(nulo)');
  end if;
  select count(*) into v_n from v_listas_estado where fundamento_efectivo = 'metodologia_manual';
  if v_n <> 5 then
    raise exception 'PRUEBA 8: se esperaban 5 fuentes de metodología y hay %', v_n;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  8 OK · con el Manual asentado las cinco lo afirman';

  -- ------------------------------------------------------------------
  -- Limpieza
  -- ------------------------------------------------------------------
  update organizations set manual_pld_asentado_en = null where id = v_org;
  perform set_config('ikan.uid', '', true);
  perform set_config('request.jwt.claims', '', true);
  delete from user_profile where id = v_user;
  delete from auth.users where id = v_user;

  select count(*) into v_n from user_profile where id = v_user;
  if v_n <> 0 then
    raise exception 'PRUEBA: quedó el usuario de prueba sin limpiar';
  end if;

  raise notice '--- 0072: % de 8 ---', v_ok;

exception when others then
  get stacked diagnostics v_msg = message_text;
  raise notice 'FALLO: %', v_msg;
  raise;
end $$;
