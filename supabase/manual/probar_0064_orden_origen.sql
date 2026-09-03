-- =====================================================================
-- Pruebas de comportamiento · Migration 0064 · Orden de origen
-- =====================================================================
-- Lo que se prueba es la consecuencia, no la implementación: que un mismo
-- RFC con dos situaciones en el mismo archivo quede SIEMPRE con la última,
-- sin importar en qué orden le lleguen las filas al motor.
-- =====================================================================

\set ON_ERROR_STOP on
\pset pager off

do $probar$
declare
  v_fuente uuid;
  v_carga uuid;
  v_carga2 uuid;
  v_sit text;
  v_n int;
  v_ok boolean;
begin
  select id into v_fuente from lista_fuente where codigo = 'sat_69b';
  if v_fuente is null then
    raise exception 'No hay fuente sat_69b: el seed de listas no corrió.';
  end if;

  -- -------------------------------------------------------------------
  -- 1. Una fila posterior gana a una anterior
  -- -------------------------------------------------------------------
  insert into lista_carga (fuente_id, tipo, estado, alcance, fecha_publicacion_fuente)
  values (v_fuente, 'archivo', 'aplicada', 'parcial', '2026-07-31')
  returning id into v_carga;

  insert into lista_movimiento (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen)
  values
    (v_carga, 'alta', 'empresa', 'PRUEBA UNO, S.A. DE C.V.', 'PU0110101AA1', 'definitivo', 100),
    (v_carga, 'alta', 'empresa', 'PRUEBA UNO, S.A. DE C.V. // sentencia', 'PU0110101AA1', 'sentencia_favorable', 101);

  select situacion into v_sit from lista_registro
   where fuente_id = v_fuente and rfc = 'PU0110101AA1';
  if v_sit is distinct from 'sentencia_favorable' then
    raise exception 'PRUEBA 1 FALLA: esperaba sentencia_favorable, quedó "%".', v_sit;
  end if;
  raise notice 'PRUEBA  1 OK · la fila posterior fija la situación';

  -- -------------------------------------------------------------------
  -- 2. …y sigue ganando aunque las filas lleguen al revés
  -- -------------------------------------------------------------------
  -- Es LA prueba de la migration. Antes de la 0064 el resultado dependía
  -- del orden de proceso, y por tanto del tamaño de lote.
  insert into lista_carga (fuente_id, tipo, estado, alcance, fecha_publicacion_fuente)
  values (v_fuente, 'archivo', 'aplicada', 'parcial', '2026-07-31')
  returning id into v_carga2;

  insert into lista_movimiento (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen)
  values (v_carga2, 'alta', 'empresa', 'PRUEBA DOS // sentencia', 'PD0110101BB2', 'sentencia_favorable', 201);
  insert into lista_movimiento (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen)
  values (v_carga2, 'alta', 'empresa', 'PRUEBA DOS, S.A. DE C.V.', 'PD0110101BB2', 'definitivo', 200);

  select situacion into v_sit from lista_registro
   where fuente_id = v_fuente and rfc = 'PD0110101BB2';
  if v_sit is distinct from 'sentencia_favorable' then
    raise exception
      'PRUEBA 2 FALLA: una fila ANTERIOR del mismo archivo pisó a la posterior. Quedó "%".', v_sit;
  end if;
  raise notice 'PRUEBA  2 OK · una fila anterior no pisa a una posterior aunque llegue después';

  -- -------------------------------------------------------------------
  -- 3. El movimiento superado SÍ queda en la bitácora
  -- -------------------------------------------------------------------
  -- No aplicar el estado no es lo mismo que no registrar. La bitácora tiene
  -- que poder enseñar que el SAT publicó las dos filas.
  select count(*) into v_n from lista_movimiento
   where carga_id = v_carga2 and rfc = 'PD0110101BB2';
  if v_n <> 2 then
    raise exception 'PRUEBA 3 FALLA: la bitácora tiene % movimientos, esperaba 2.', v_n;
  end if;
  raise notice 'PRUEBA  3 OK · el movimiento superado queda asentado';

  -- -------------------------------------------------------------------
  -- 4. Entre CARGAS distintas manda siempre la nueva
  -- -------------------------------------------------------------------
  -- El no-retroceso es sólo dentro de un archivo. Un archivo posterior
  -- sustituye al anterior aunque su número de fila sea más bajo: eso es lo
  -- que significa una fuente de snapshot.
  declare v_carga3 uuid;
  begin
    insert into lista_carga (fuente_id, tipo, estado, alcance, fecha_publicacion_fuente)
    values (v_fuente, 'archivo', 'aplicada', 'parcial', '2026-08-31')
    returning id into v_carga3;

    insert into lista_movimiento (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen)
    values (v_carga3, 'alta', 'empresa', 'PRUEBA DOS, S.A. DE C.V.', 'PD0110101BB2', 'definitivo', 5);

    select situacion into v_sit from lista_registro
     where fuente_id = v_fuente and rfc = 'PD0110101BB2';
    if v_sit is distinct from 'definitivo' then
      raise exception
        'PRUEBA 4 FALLA: el archivo nuevo no sustituyó al anterior. Quedó "%".', v_sit;
    end if;
  end;
  raise notice 'PRUEBA  4 OK · un archivo posterior sustituye al anterior';

  -- -------------------------------------------------------------------
  -- 5. conflictos_de_carga() ve el conflicto, y sólo el conflicto
  -- -------------------------------------------------------------------
  insert into lista_movimiento (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen)
  values
    (v_carga, 'alta', 'empresa', 'REPETIDO IGUAL, S.A.', 'RI0110101CC3', 'definitivo', 300),
    (v_carga, 'alta', 'empresa', 'REPETIDO IGUAL, S.A.', 'RI0110101CC3', 'definitivo', 301);

  select count(*) into v_n from public.conflictos_de_carga(v_carga);
  if v_n <> 1 then
    raise exception
      'PRUEBA 5 FALLA: esperaba 1 conflicto (sólo el de situaciones distintas), hubo %.', v_n;
  end if;
  raise notice 'PRUEBA  5 OK · un RFC repetido con la MISMA situación no es conflicto';

  -- -------------------------------------------------------------------
  -- 6. listado_en_fecha desempata, y no a volados
  -- -------------------------------------------------------------------
  -- Se llama dos veces: si el desempate fuera arbitrario podría dar
  -- resultados distintos entre corridas. Aquí lo que importa es que sea la
  -- fila posterior la que manda.
  select public.listado_en_fecha('sat_69b', '2026-08-01', 'PU0110101AA1') into v_ok;
  if v_ok is not true then
    raise exception 'PRUEBA 6 FALLA: debería seguir listada (un alta, aunque sea sentencia favorable).';
  end if;
  raise notice 'PRUEBA  6 OK · la evidencia histórica resuelve con orden de origen';

  -- -------------------------------------------------------------------
  -- 7. El conteo por sentencia cuadra
  -- -------------------------------------------------------------------
  -- El trigger pasó de FOR EACH ROW a FOR EACH STATEMENT. Si la tabla de
  -- transición estuviera mal, el número quedaría corto.
  select num_movimientos into v_n from lista_carga where id = v_carga;
  if v_n <> (select count(*) from lista_movimiento where carga_id = v_carga) then
    raise exception 'PRUEBA 7 FALLA: num_movimientos dice % y hay %.',
      v_n, (select count(*) from lista_movimiento where carga_id = v_carga);
  end if;
  raise notice 'PRUEBA  7 OK · el conteo por sentencia cuadra con la bitácora';

  -- -------------------------------------------------------------------
  -- 8. Un INSERT multi-fila deja el conteo correcto
  -- -------------------------------------------------------------------
  -- Es el caso real: la consola inserta de 500 en 500.
  declare v_carga4 uuid;
  begin
    insert into lista_carga (fuente_id, tipo, estado, alcance)
    values (v_fuente, 'archivo', 'aplicada', 'parcial')
    returning id into v_carga4;

    insert into lista_movimiento (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen)
    select v_carga4, 'alta', 'empresa',
           'LOTE ' || g, 'LOT' || lpad(g::text, 6, '0') || 'X' || lpad(g::text, 2, '0'),
           'definitivo', g
    from generate_series(1, 50) g;

    select num_movimientos into v_n from lista_carga where id = v_carga4;
    if v_n <> 50 then
      raise exception 'PRUEBA 8 FALLA: tras un INSERT de 50 filas el conteo dice %.', v_n;
    end if;
  end;
  raise notice 'PRUEBA  8 OK · el conteo es correcto tras un INSERT multi-fila';

  raise notice '--- 0064: 8 de 8 ---';
end
$probar$;
