-- =====================================================================
-- Pruebas de comportamiento · Migration 0064 · Orden de origen
-- =====================================================================
-- AVISO: el criterio de desempate que introdujo la 0064 —«gana la última fila
-- del archivo»— quedó SUSTITUIDO por la 0065, a instancia de
-- Kawiil-Cumplimiento. Las pruebas de aquel criterio viven ahora en
-- `probar_0065_fecha_publicacion.sql` y comprueban lo contrario.
--
-- Este archivo conserva lo que la 0064 sí aportó y sigue vigente:
--
--   · `orden_origen` se guarda. Dejó de decidir, pero sigue siendo un dato de
--     procedencia legítimo: permite señalar una fila concreta del archivo.
--   · El conteo de movimientos pasó de un trigger por fila —que hacía la carga
--     cuadrática, 56 s para 14,523 registros contra un statement_timeout de
--     8 s— a uno por sentencia.
--   · `conflictos_de_carga()` existe y sólo reporta situaciones distintas.
--
-- Por qué no se borra: la 0064 está aplicada en producción y su rastro tiene
-- que poder comprobarse. Un archivo de pruebas que desaparece cuando cambia un
-- criterio deja sin cubrir lo que ese cambio NO tocó.
-- =====================================================================

\set ON_ERROR_STOP on
\pset pager off

do $probar$
declare
  v_fuente uuid;
  v_carga uuid;
  v_n int;
  v_orden int;
begin
  select id into v_fuente from lista_fuente where codigo = 'sat_69b';
  if v_fuente is null then
    raise exception 'No hay fuente sat_69b: el seed de listas no corrió.';
  end if;

  insert into lista_carga (fuente_id, tipo, estado, alcance, fecha_publicacion_fuente)
  values (v_fuente, 'archivo', 'aplicada', 'parcial', '2026-07-31')
  returning id into v_carga;

  -- -------------------------------------------------------------------
  -- 1. El orden de origen se conserva
  -- -------------------------------------------------------------------
  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen, fecha_situacion)
  values (v_carga, 'alta', 'empresa', 'PROCEDENCIA, S.A.', 'PRO110101AA1',
          'definitivo', 4321, '2024-01-01');

  select orden_origen into v_orden from lista_movimiento
   where carga_id = v_carga and rfc = 'PRO110101AA1';
  if v_orden <> 4321 then
    raise exception 'PRUEBA 1 FALLA: orden_origen quedó en % y esperaba 4321.', v_orden;
  end if;

  select orden_origen_ultimo into v_orden from lista_registro
   where fuente_id = v_fuente and rfc = 'PRO110101AA1';
  if v_orden <> 4321 then
    raise exception 'PRUEBA 1 FALLA: el registro no guardó la fila de origen.';
  end if;
  raise notice 'PRUEBA  1 OK · la fila del archivo se conserva como procedencia';

  -- -------------------------------------------------------------------
  -- 2. El conteo es por sentencia, no por fila
  -- -------------------------------------------------------------------
  -- Es lo que evita que la carga sea cuadrática. Si el trigger volviera a ser
  -- FOR EACH ROW esta prueba seguiría pasando, pero la de abajo —un INSERT
  -- multi-fila— es la que ataría el conteo a la tabla de transición.
  select num_movimientos into v_n from lista_carga where id = v_carga;
  if v_n <> (select count(*) from lista_movimiento where carga_id = v_carga) then
    raise exception 'PRUEBA 2 FALLA: num_movimientos dice % y hay %.',
      v_n, (select count(*) from lista_movimiento where carga_id = v_carga);
  end if;
  raise notice 'PRUEBA  2 OK · el conteo cuadra con la bitácora';

  -- -------------------------------------------------------------------
  -- 3. Un INSERT multi-fila deja el conteo correcto
  -- -------------------------------------------------------------------
  -- Es el caso real: la consola inserta de 500 en 500.
  declare v_carga2 uuid;
  begin
    insert into lista_carga (fuente_id, tipo, estado, alcance)
    values (v_fuente, 'archivo', 'aplicada', 'parcial')
    returning id into v_carga2;

    insert into lista_movimiento
      (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen, fecha_situacion)
    select v_carga2, 'alta', 'empresa', 'LOTE ' || g,
           'LOT' || lpad(g::text, 6, '0') || 'X' || lpad(g::text, 2, '0'),
           'definitivo', g, '2024-01-01'
    from generate_series(1, 50) g;

    select num_movimientos into v_n from lista_carga where id = v_carga2;
    if v_n <> 50 then
      raise exception 'PRUEBA 3 FALLA: tras un INSERT de 50 filas el conteo dice %.', v_n;
    end if;
  end;
  raise notice 'PRUEBA  3 OK · el conteo es correcto tras un INSERT multi-fila';

  -- -------------------------------------------------------------------
  -- 4. Un RFC repetido con la MISMA situación no es conflicto
  -- -------------------------------------------------------------------
  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, rfc, situacion, orden_origen, fecha_situacion)
  values
    (v_carga, 'alta', 'empresa', 'REPETIDO IGUAL, S.A.', 'RI0110101CC3', 'definitivo', 300, '2024-02-01'),
    (v_carga, 'alta', 'empresa', 'REPETIDO IGUAL, S.A.', 'RI0110101CC3', 'definitivo', 301, '2024-03-01');

  select count(*) into v_n from public.conflictos_de_carga(v_carga);
  if v_n <> 0 then
    raise exception
      'PRUEBA 4 FALLA: un RFC repetido con la misma situación no es conflicto, y salieron %.', v_n;
  end if;
  raise notice 'PRUEBA  4 OK · sólo cuentan como conflicto las situaciones distintas';

  raise notice '--- 0064: 4 de 4 (el criterio de desempate se prueba en la 0065) ---';
end
$probar$;
