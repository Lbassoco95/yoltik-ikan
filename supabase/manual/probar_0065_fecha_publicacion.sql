-- =====================================================================
-- Pruebas de comportamiento · Migration 0065 · Resolución por fecha
-- =====================================================================
-- El caso que da nombre a la migration es real: AAS110331G59 viene dos veces
-- en el listado completo del 31/07/2026, y la fila POSTERIOR del archivo
-- trae una sentencia favorable ANTERIOR en el tiempo. El criterio de la 0064
-- lo dejaba sin bloquear; por fecha queda como definitivo.
-- =====================================================================

\set ON_ERROR_STOP on
\pset pager off

do $probar$
declare
  v_fuente uuid;
  v_carga uuid;
  v_sit text;
  v_rev boolean;
  v_n int;
begin
  select id into v_fuente from lista_fuente where codigo = 'sat_69b';

  -- -------------------------------------------------------------------
  -- 1. El caso real: la fila posterior trae la resolución MÁS VIEJA
  -- -------------------------------------------------------------------
  insert into lista_carga (fuente_id, tipo, estado, alcance, fecha_publicacion_fuente)
  values (v_fuente, 'archivo', 'aplicada', 'completa', '2026-07-31')
  returning id into v_carga;

  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen, fecha_situacion)
  values
    (v_carga, 'alta', 'empresa', 'ABIRA & SAFFI', 'AAS110331G59', 'definitivo', 164, '2020-07-07'),
    (v_carga, 'alta', 'empresa', 'ABIRA & SAFFI // sentencia', 'AAS110331G59', 'sentencia_favorable', 165, '2020-01-27');

  select situacion into v_sit from lista_registro
   where fuente_id = v_fuente and rfc = 'AAS110331G59';
  if v_sit is distinct from 'definitivo' then
    raise exception
      'PRUEBA 1 FALLA: la fila posterior traía una sentencia ANTERIOR y ganó. Quedó "%".', v_sit;
  end if;
  raise notice 'PRUEBA  1 OK · gana la publicación más reciente, no la última fila';

  -- -------------------------------------------------------------------
  -- 2. …y da igual el orden en que lleguen
  -- -------------------------------------------------------------------
  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen, fecha_situacion)
  values
    (v_carga, 'alta', 'empresa', 'OTRA // sentencia', 'OTR110331AB1', 'sentencia_favorable', 900, '2019-05-01');
  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen, fecha_situacion)
  values
    (v_carga, 'alta', 'empresa', 'OTRA', 'OTR110331AB1', 'definitivo', 899, '2021-03-10');

  select situacion into v_sit from lista_registro
   where fuente_id = v_fuente and rfc = 'OTR110331AB1';
  if v_sit is distinct from 'definitivo' then
    raise exception 'PRUEBA 2 FALLA: esperaba definitivo (2021 > 2019), quedó "%".', v_sit;
  end if;
  raise notice 'PRUEBA  2 OK · el orden de llegada no influye';

  -- -------------------------------------------------------------------
  -- 3. A igualdad de fecha gana la etapa más avanzada
  -- -------------------------------------------------------------------
  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen, fecha_situacion)
  values
    (v_carga, 'alta', 'empresa', 'EMPATE', 'EMP110331CD2', 'presunto', 910, '2022-01-01'),
    (v_carga, 'alta', 'empresa', 'EMPATE // definitivo', 'EMP110331CD2', 'definitivo', 911, '2022-01-01');

  select situacion into v_sit from lista_registro
   where fuente_id = v_fuente and rfc = 'EMP110331CD2';
  if v_sit is distinct from 'definitivo' then
    raise exception 'PRUEBA 3 FALLA: a igualdad de fecha debe ganar la etapa mayor. Quedó "%".', v_sit;
  end if;
  raise notice 'PRUEBA  3 OK · a igualdad de fecha manda la etapa procesal';

  -- -------------------------------------------------------------------
  -- 4. Definitivo y desvirtuado con la misma fecha NO se resuelven
  -- -------------------------------------------------------------------
  -- Es una combinación contradictoria. Inventar un ganador sería peor que
  -- decir que hace falta que lo vea una persona.
  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen, fecha_situacion)
  values
    (v_carga, 'alta', 'empresa', 'CONTRA', 'CON110331EF3', 'definitivo', 920, '2023-04-04'),
    (v_carga, 'alta', 'empresa', 'CONTRA // desvirtuado', 'CON110331EF3', 'desvirtuado', 921, '2023-04-04');

  select requiere_revision into v_rev from lista_registro
   where fuente_id = v_fuente and rfc = 'CON110331EF3';
  if v_rev is not true then
    raise exception 'PRUEBA 4 FALLA: definitivo y desvirtuado con la misma fecha debe escalarse.';
  end if;
  raise notice 'PRUEBA  4 OK · la combinación contradictoria se escala, no se inventa';

  -- -------------------------------------------------------------------
  -- 5. Sin fecha NO se cae de vuelta a la posición
  -- -------------------------------------------------------------------
  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen, fecha_situacion)
  values
    (v_carga, 'alta', 'empresa', 'SINFECHA', 'SIN110331GH4', 'definitivo', 930, '2024-02-02'),
    (v_carga, 'alta', 'empresa', 'SINFECHA // sin fecha', 'SIN110331GH4', 'sentencia_favorable', 931, null);

  select requiere_revision, situacion into v_rev, v_sit from lista_registro
   where fuente_id = v_fuente and rfc = 'SIN110331GH4';
  if v_rev is not true then
    raise exception 'PRUEBA 5 FALLA: una fila sin fecha en un RFC repetido debe marcarse.';
  end if;
  if v_sit is distinct from 'definitivo' then
    raise exception
      'PRUEBA 5 FALLA: la fila sin fecha pisó a la que sí la tenía. Quedó "%".', v_sit;
  end if;
  raise notice 'PRUEBA  5 OK · sin fecha se marca y NO se resuelve por posición';

  -- -------------------------------------------------------------------
  -- 6. Los movimientos superados siguen en la bitácora
  -- -------------------------------------------------------------------
  -- Instrucción 249: el historial es parte del expediente.
  select count(*) into v_n from lista_movimiento
   where carga_id = v_carga and rfc = 'AAS110331G59';
  if v_n <> 2 then
    raise exception 'PRUEBA 6 FALLA: la bitácora tiene % movimientos, esperaba 2.', v_n;
  end if;
  raise notice 'PRUEBA  6 OK · se conservan todas las filas del historial';

  -- -------------------------------------------------------------------
  -- 7. Entre CARGAS distintas manda el archivo nuevo
  -- -------------------------------------------------------------------
  -- El no-retroceso es dentro de un archivo. Un snapshot posterior sustituye
  -- al anterior aunque su fecha de situación sea más vieja: eso es lo que
  -- significa que la fuente publique el estado completo.
  declare v_carga2 uuid;
  begin
    insert into lista_carga (fuente_id, tipo, estado, alcance, fecha_publicacion_fuente)
    values (v_fuente, 'archivo', 'aplicada', 'completa', '2026-08-31')
    returning id into v_carga2;

    insert into lista_movimiento
      (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen, fecha_situacion)
    values
      (v_carga2, 'alta', 'empresa', 'ABIRA & SAFFI // sentencia nueva', 'AAS110331G59',
       'sentencia_favorable', 1, '2019-01-01');

    select situacion into v_sit from lista_registro
     where fuente_id = v_fuente and rfc = 'AAS110331G59';
    if v_sit is distinct from 'sentencia_favorable' then
      raise exception
        'PRUEBA 7 FALLA: el archivo nuevo no sustituyó al anterior. Quedó "%".', v_sit;
    end if;
  end;
  raise notice 'PRUEBA  7 OK · entre archivos manda siempre el más nuevo';

  -- -------------------------------------------------------------------
  -- 8. La evidencia histórica usa la fecha de la situación
  -- -------------------------------------------------------------------
  if public.listado_en_fecha('sat_69b', '2020-08-01', 'OTR110331AB1') is not true then
    raise exception 'PRUEBA 8 FALLA: debería aparecer listada.';
  end if;
  raise notice 'PRUEBA  8 OK · listado_en_fecha resuelve con la fecha de publicación';

  -- -------------------------------------------------------------------
  -- 9. conflictos_de_carga muestra las fechas y saca primero lo que urge
  -- -------------------------------------------------------------------
  select count(*) into v_n from public.conflictos_de_carga(v_carga);
  if v_n < 4 then
    raise exception 'PRUEBA 9 FALLA: esperaba al menos 4 conflictos, hubo %.', v_n;
  end if;
  if (select requiere_revision from public.conflictos_de_carga(v_carga) limit 1) is not true then
    raise exception 'PRUEBA 9 FALLA: los que exigen revisión deben salir primero.';
  end if;
  raise notice 'PRUEBA  9 OK · los conflictos que exigen revisión salen primero';

  raise notice '--- 0065: 9 de 9 ---';
end
$probar$;
