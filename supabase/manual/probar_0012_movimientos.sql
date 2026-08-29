-- ============================================================
-- Prueba · Ciclo de altas y bajas (migrations 0012 + 0013)
-- ============================================================
-- SQL puro, sin meta-comandos: corre tal cual en el SQL Editor de Supabase.
-- (La versión anterior usaba \echo, que es de psql y el editor no entiende.)
--
-- Se limpia sola: no deja ninguna fila. Datos ficticios.
--
-- Si TODO pasa, devuelve una fila diciéndolo. Si algo falla, devuelve un
-- ERROR con la prueba exacta que no se cumplió. No hay resultado ambiguo.
-- ============================================================
do $$
declare
  v_fuente uuid;
  v_carga1 uuid := 'aaaaaaaa-0000-0000-0000-00000000f001';
  v_carga2 uuid := 'aaaaaaaa-0000-0000-0000-00000000f002';
  v_activo boolean;
  v_baja text;
  v_alta text;
  v_n int;
begin
  select id into v_fuente from lista_fuente where codigo = 'uif_bloqueadas';
  if v_fuente is null then
    raise exception 'FALLA: no existe la fuente uif_bloqueadas. ¿Corriste el seed 11?';
  end if;

  -- ---------- Carga 1: oficio de bloqueo ----------
  insert into lista_carga (id, fuente_id, tipo, estado, fecha_publicacion_fuente, notas)
  values (v_carga1, v_fuente, 'captura_manual', 'aplicada', date '2026-03-10', 'PRUEBA — bloqueo');

  insert into lista_movimiento (carga_id, accion, nombre, rfc, oficio_numero, oficio_fecha, motivo)
  values
    (v_carga1, 'alta', 'Juan Ramírez Peña (PRUEBA)', 'rapj800101ab1',
     '110-05/2026-0341', date '2026-03-10', 'Bloqueo'),
    (v_carga1, 'alta', 'María de la Cruz Sánchez (PRUEBA)', null,
     '110-05/2026-0342', date '2026-03-10', 'Bloqueo');

  -- 1. El RFC se guarda normalizado a mayúsculas
  select rfc into v_alta from lista_registro where nombre like 'Juan Ramírez%(PRUEBA)';
  if v_alta is distinct from 'RAPJ800101AB1' then
    raise exception 'FALLA 1: el RFC no se normalizó a mayúsculas (quedó %)', v_alta;
  end if;

  -- 2. Ambas quedan vigentes
  select count(*) into v_n from v_listas_vigentes where nombre like '%(PRUEBA)%';
  if v_n <> 2 then
    raise exception 'FALLA 2: se esperaban 2 personas vigentes, hay %', v_n;
  end if;

  -- ---------- Carga 2: oficio de desbloqueo ----------
  -- Nombre SIN acentos y RFC en mayúsculas a propósito: debe cotejar igual.
  insert into lista_carga (id, fuente_id, tipo, estado, fecha_publicacion_fuente, notas)
  values (v_carga2, v_fuente, 'captura_manual', 'aplicada', date '2026-06-20', 'PRUEBA — desbloqueo');

  insert into lista_movimiento (carga_id, accion, nombre, rfc, oficio_numero, oficio_fecha, motivo)
  values (v_carga2, 'baja', 'Juan Ramirez Pena (PRUEBA)', 'RAPJ800101AB1',
          '110-05/2026-0899', date '2026-06-20', 'Desbloqueo');

  -- 3. La baja cotejó pese a los acentos y quedó desactivado, no borrado
  select activo, baja_oficio into v_activo, v_baja
  from lista_registro where rfc = 'RAPJ800101AB1';
  if v_activo is not false then
    raise exception 'FALLA 3: la baja no se aplicó (el cotejo sin acentos no funcionó)';
  end if;
  if v_baja is distinct from '110-05/2026-0899' then
    raise exception 'FALLA 3b: no se guardó el oficio de baja (quedó %)', v_baja;
  end if;

  -- 4. Sale de vigentes pero la fila se conserva
  select count(*) into v_n from v_listas_vigentes where nombre like '%(PRUEBA)%';
  if v_n <> 1 then
    raise exception 'FALLA 4: se esperaba 1 vigente tras la baja, hay %', v_n;
  end if;
  select count(*) into v_n from lista_registro where nombre like '%(PRUEBA)%';
  if v_n <> 2 then
    raise exception 'FALLA 4b: la baja borró la fila en vez de desactivarla';
  end if;

  -- 5. Evidencia histórica: bloqueada entre marzo y junio, no antes ni después
  if public.listado_en_fecha('uif_bloqueadas', date '2026-02-01', 'RAPJ800101AB1') then
    raise exception 'FALLA 5: aparece bloqueada ANTES de su oficio de alta';
  end if;
  if not public.listado_en_fecha('uif_bloqueadas', date '2026-04-15', 'RAPJ800101AB1') then
    raise exception 'FALLA 5b: NO aparece bloqueada el 15/abr, cuando sí lo estaba';
  end if;
  if public.listado_en_fecha('uif_bloqueadas', date '2026-07-01', 'RAPJ800101AB1') then
    raise exception 'FALLA 5c: sigue apareciendo bloqueada después de su baja';
  end if;

  -- 6. Cotejo por nombre, sin RFC, con y sin acentos
  if not public.listado_en_fecha('uif_bloqueadas', date '2026-05-01', null, 'MARIA DE LA CRUZ SANCHEZ (PRUEBA)') then
    raise exception 'FALLA 6: el cotejo por nombre sin acentos no encontró a la persona';
  end if;

  -- 7. Una baja sin alta previa se rechaza
  begin
    insert into lista_movimiento (carga_id, accion, nombre, oficio_numero)
    values (v_carga2, 'baja', 'Nadie Inexistente (PRUEBA)', 'X-1');
    raise exception 'FALLA 7: se aceptó una baja de alguien que nunca fue dado de alta';
  exception when others then
    if sqlerrm like 'FALLA 7%' then raise; end if;
  end;

  -- 8. La bitácora no se puede editar
  begin
    update lista_movimiento set oficio_numero = 'ALTERADO' where carga_id = v_carga1;
    raise exception 'FALLA 8: se pudo editar un movimiento de la bitácora';
  exception when others then
    if sqlerrm like 'FALLA 8%' then raise; end if;
  end;

  -- 9. Un movimiento suelto no se puede borrar
  begin
    delete from lista_movimiento where carga_id = v_carga1;
    raise exception 'FALLA 9: se pudo borrar un movimiento suelto';
  exception when others then
    if sqlerrm like 'FALLA 9%' then raise; end if;
  end;

  -- ---------- Limpieza: revertir las dos cargas ----------
  -- Marca 'revertida' primero, que es lo que autoriza el borrado (0013).
  update lista_carga set estado = 'revertida' where id in (v_carga1, v_carga2);
  delete from lista_movimiento where carga_id in (v_carga1, v_carga2);
  delete from lista_registro where nombre like '%(PRUEBA)%';
  delete from lista_carga where id in (v_carga1, v_carga2);

  -- 10. No quedó rastro
  select count(*) into v_n from lista_registro where nombre like '%(PRUEBA)%';
  if v_n <> 0 then
    raise exception 'FALLA 10: quedaron % filas de prueba sin limpiar', v_n;
  end if;
end
$$;

select 'OK · 10 pruebas pasaron: alta, baja por oficio, cotejo sin acentos, '
       'evidencia histórica, bitácora inmutable y limpieza sin rastro' as resultado;
