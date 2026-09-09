-- =====================================================================
-- Pruebas de comportamiento · Migration 0073
-- =====================================================================
-- Qué se prueba: que una fuente en validación se VEA pero NO barra, que el
-- candado de la 298 no se pueda esquivar, y —lo que de verdad importa— que un
-- resultado vacío del barrido venga siempre acompañado de contra qué NO se
-- barrió. Un «sin coincidencias» que calla las fuentes excluidas es la mentira
-- más cara que este producto puede decir.
--
-- Corre después de migrations + seeds. Se limpia sola.

\set ON_ERROR_STOP on
\pset pager off

do $$
declare
  v_txt    text;
  v_n      int;
  v_bool   boolean;
  v_msg    text;
  v_ok     int := 0;
  v_fuente uuid;
  v_carga  uuid := 'aaaaaaaa-0000-0000-0000-00000000d001';
begin
  -- ------------------------------------------------------------------
  -- Montaje: una fuente propia con un registro cargado
  -- ------------------------------------------------------------------
  -- Fuente propia y no una del catálogo: lo que se prueba es el mecanismo de
  -- validación, no qué listas trae el catálogo hoy. Ya me pasó con la 0012 que
  -- una prueba de mecanismo colgada del catálogo se cae cuando Cumplimiento
  -- cambia una determinación.
  insert into lista_fuente
    (codigo, nombre, autoridad, naturaleza, modo_actualizacion,
     obligatoria, activa, determinacion, efecto, fundamento, modo_operacion, notas)
  values
    ('prueba_validacion', 'FUENTE DE PRUEBA · modo de operación',
     'Ninguna: es una fixture', 'sancion_aml', 'snapshot',
     false, true, 'aplica', 'impedimento', 'informativa', 'validacion',
     'La crea y la borra probar_0073_validacion.sql.')
  on conflict (codigo) do update set modo_operacion = 'validacion', activa = true
  returning id into v_fuente;

  insert into lista_carga (id, fuente_id, tipo, estado, fecha_publicacion_fuente, notas)
  values (v_carga, v_fuente, 'archivo', 'aplicada', date '2026-09-07', 'PRUEBA')
  on conflict (id) do nothing;

  insert into lista_movimiento (carga_id, accion, nombre, oficio_numero, oficio_fecha, motivo)
  values (v_carga, 'alta', 'Zorrilla Prueba Validacion', 'PV-1', date '2026-09-07', 'Prueba');

  -- ------------------------------------------------------------------
  -- 1. Cargada y en validación: se VE, con sus datos
  -- ------------------------------------------------------------------
  -- Es la mitad que suele olvidarse. Si validar implicara esconder, no se
  -- podría validar nada: el punto de cargarla es mirar sus cifras y su fecha.
  select estado, registros_vigentes into v_txt, v_n
    from v_listas_estado where codigo = 'prueba_validacion';
  if v_txt is distinct from 'en_validacion' then
    raise exception 'PRUEBA 1: se esperaba en_validacion y se obtuvo %', coalesce(v_txt, '(nulo)');
  end if;
  if v_n <> 1 then
    raise exception 'PRUEBA 1: la fuente en validación debe mostrar sus registros, y mostró %', v_n;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  1 OK · una fuente en validación se ve, con su fecha y sus conteos';

  -- ------------------------------------------------------------------
  -- 2. Y NO barre
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from public.coincidencias_en_listas('Zorrilla Prueba Validacion', null, true) c
   where c.fuente = 'prueba_validacion';
  if v_n <> 0 then
    raise exception 'PRUEBA 2: una fuente en validación no puede producir coincidencias, y '
      'produjo %', v_n;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  2 OK · en validación no produce coincidencias';

  -- ------------------------------------------------------------------
  -- 3. Pero el barrido DICE que no la miró
  -- ------------------------------------------------------------------
  -- La otra mitad de la 297, y la que hace que la 2 no sea un agujero. Un cero
  -- silencioso y un cero explicado son lo mismo para la base de datos y cosas
  -- opuestas para quien firma el expediente.
  select se_barrio, motivo into v_bool, v_txt
    from public.cobertura_del_barrido() where fuente = 'prueba_validacion';
  if v_bool is not false then
    raise exception 'PRUEBA 3: la cobertura debe decir que NO se barrió';
  end if;
  if v_txt is null or v_txt !~ 'validación' then
    raise exception 'PRUEBA 3: el motivo tiene que decir que está en validación, y dijo "%"',
      coalesce(v_txt, '(nulo)');
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  3 OK · la cobertura declara que no se barrió, y por qué';

  -- ------------------------------------------------------------------
  -- 4. Una fuente sin registros también se declara
  -- ------------------------------------------------------------------
  -- Es el otro motivo por el que un barrido no acredita nada, y se veía igual
  -- que el anterior desde fuera.
  select motivo into v_txt
    from public.cobertura_del_barrido() where fuente = 'onu_consolidada';
  if v_txt is null then
    raise exception 'PRUEBA 4: la ONU está vacía y la cobertura no lo dice';
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  4 OK · una fuente vacía también se declara, con su propio motivo';

  -- ------------------------------------------------------------------
  -- 5. La compuerta de la 298 ya está abierta
  -- ------------------------------------------------------------------
  -- Esta prueba nació afirmando lo contrario, y tenía razón ese día: la 0073
  -- cerró la compuerta porque la del corroborante no existía. La 0074 la
  -- construyó y la abrió. Se afirma el estado de hoy.
  if not public.cotejo_con_calidad_de_alias() then
    raise exception 'PRUEBA 5: la compuerta debería estar abierta desde la 0074';
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  5 OK · la compuerta del corroborante está abierta';

  -- ------------------------------------------------------------------
  -- 6. Y el candado sigue funcionando si se cierra
  -- ------------------------------------------------------------------
  -- El candado es lo que hace que la 298 sea un control y no una intención, y
  -- con la compuerta abierta no se puede observar. Se cierra a propósito para
  -- verlo, y se restaura.
  --
  -- Reemplazar la función dentro de la prueba es deliberado y ruidoso. No es
  -- un atajo para la aplicación: `create or replace function` exige ser dueño
  -- de la función y el rol con que corre la app no lo es. Si esta prueba
  -- fallara antes de restaurar, el rollback de la transacción lo deshace.
  create or replace function public.cotejo_con_calidad_de_alias()
  returns boolean language sql immutable set search_path = public
  as $cerrada$ select false $cerrada$;

  begin
    update lista_fuente set modo_operacion = 'operativa' where codigo = 'prueba_validacion';
    raise exception 'PRUEBA 6 FALLA: se pudo pasar a operativa con la compuerta cerrada';
  exception when others then
    if sqlerrm like 'PRUEBA 6 FALLA%' then raise; end if;
    if sqlerrm !~ 'instrucción 298' then
      raise exception 'PRUEBA 6: se rechazó por el motivo equivocado: %', sqlerrm;
    end if;
  end;

  select modo_operacion::text into v_txt from lista_fuente where codigo = 'prueba_validacion';
  if v_txt is distinct from 'validacion' then
    raise exception 'PRUEBA 6: quedó en % después del intento', v_txt;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  6 OK · con la compuerta cerrada el candado impide operar';

  -- ------------------------------------------------------------------
  -- 7. Tampoco naciendo operativa
  -- ------------------------------------------------------------------
  -- El candado tiene que cubrir el INSERT y no sólo el UPDATE: si no, basta
  -- crear la fuente ya operativa para esquivarlo, que es la primera cosa que
  -- alguien hace sin querer. Sigue con la compuerta cerrada de la prueba 6.
  begin
    insert into lista_fuente
      (codigo, nombre, autoridad, naturaleza, modo_actualizacion,
       obligatoria, activa, determinacion, efecto, fundamento, modo_operacion)
    values
      ('prueba_nace_operativa', 'FUENTE DE PRUEBA · nace operativa',
       'Ninguna', 'sancion_aml', 'snapshot',
       false, true, 'aplica', 'dato', 'informativa', 'operativa');
    raise exception 'PRUEBA 7 FALLA: se pudo crear una fuente ya operativa';
  exception when others then
    if sqlerrm like 'PRUEBA 7 FALLA%' then raise; end if;
    if sqlerrm !~ 'instrucción 298' then
      raise exception 'PRUEBA 7: se rechazó por el motivo equivocado: %', sqlerrm;
    end if;
  end;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  7 OK · tampoco se puede crear una fuente naciendo operativa';

  -- Se restaura la compuerta al estado que dejó la 0074.
  create or replace function public.cotejo_con_calidad_de_alias()
  returns boolean language sql immutable set search_path = public
  as $abierta$ select true $abierta$;

  -- ------------------------------------------------------------------
  -- 8. Hoy NINGUNA fuente del catálogo es operativa
  -- ------------------------------------------------------------------
  -- La regla que gobierna a todas, comprobada sobre el catálogo real y no
  -- sobre la fixture.
  select string_agg(codigo, ', ') into v_txt
    from lista_fuente where modo_operacion = 'operativa';
  if v_txt is not null then
    raise exception 'PRUEBA 8: hay fuentes operativas y la compuerta está cerrada: %', v_txt;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  8 OK · ninguna fuente del catálogo está operando';

  -- ------------------------------------------------------------------
  -- 9. La cobertura sólo habla de fuentes que aplican
  -- ------------------------------------------------------------------
  -- Meter en la constancia una fuente que se determinó que no aplica, o una
  -- que no se puede obtener, sugeriría un hueco de cobertura donde no lo hay.
  select count(*) into v_n
    from public.cobertura_del_barrido()
   where fuente in ('ue_sanciones', 'ppe_oficial');
  if v_n <> 0 then
    raise exception 'PRUEBA 9: la cobertura incluyó fuentes que no aplican (% filas)', v_n;
  end if;
  v_ok := v_ok + 1;
  raise notice 'PRUEBA  9 OK · la cobertura no inventa huecos con fuentes que no aplican';

  -- ------------------------------------------------------------------
  -- Limpieza
  -- ------------------------------------------------------------------
  update lista_carga set estado = 'revertida' where id = v_carga;
  delete from lista_movimiento where carga_id = v_carga;
  delete from lista_registro where fuente_id = v_fuente;
  delete from lista_carga where id = v_carga;
  delete from lista_fuente where codigo in ('prueba_validacion', 'prueba_nace_operativa');

  select count(*) into v_n from lista_fuente where codigo like 'prueba_%';
  if v_n <> 0 then
    raise exception 'quedaron % fuentes de prueba sin limpiar', v_n;
  end if;

  raise notice '--- 0073: % de 9 ---', v_ok;

exception when others then
  get stacked diagnostics v_msg = message_text;
  raise notice 'FALLO: %', v_msg;
  raise;
end $$;
