-- =====================================================================
-- Pruebas de comportamiento de la 0026 · anclaje de la bitácora
-- =====================================================================
-- Se corren sobre un PostgreSQL DESECHABLE preparado con
-- supabase/manual/harness_postgres_local.sql, nunca contra el remoto:
-- insertan y borran datos.
--
--   createdb prueba
--   psql -d prueba -f supabase/manual/harness_postgres_local.sql
--   psql -d prueba -f supabase/migrations/0001_initial_schema.sql  (…y siguientes)
--   psql -d prueba -f supabase/manual/probar_0026_anclaje.sql
--
-- Cada prueba deja una fila en el resumen final. Una sola tabla al final
-- porque el editor de Supabase sólo muestra el último resultado.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

-- El disparador que impide borrar un anclaje es justamente lo que se prueba en
-- el punto 10, así que la limpieza de la prueba lo apaga a propósito y lo
-- vuelve a encender al terminar. Sólo aquí, y sólo sobre una base desechable.
alter table anclaje disable trigger trg_anclaje_sin_borrado;
delete from anclaje
 where organization_id in ('11111111-1111-1111-1111-111111111111',
                           '99999999-9999-9999-9999-999999999999');
alter table anclaje enable trigger trg_anclaje_sin_borrado;

do $$
declare
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_otra uuid := '99999999-9999-9999-9999-999999999999';
  v_hash text := repeat('a', 64);
  v_id uuid;
  v_msg text;
  v_desde bigint;
  v_hasta bigint;
begin
  -- 1. Un anclaje normal entra.
  insert into anclaje (organization_id, desde_secuencia, hasta_secuencia,
                       raiz_merkle, cadena_hash_final, motivo)
  values (v_org, 1, 10, v_hash, v_hash, 'diario')
  returning id into v_id;
  insert into resultado values (1, 'Se crea un anclaje', 'ok', 'ok', true);

  -- 2. Una raíz que no es hex de 64 se rechaza: un ancla mal formada no ancla
  --    nada y descubrirlo al verificar es tarde.
  begin
    insert into anclaje (organization_id, desde_secuencia, hasta_secuencia,
                         raiz_merkle, cadena_hash_final, motivo)
    values (v_org, 11, 12, 'NO-ES-UN-HASH', v_hash, 'diario');
    insert into resultado values (2, 'Raíz mal formada', 'rechazada', 'aceptada', false);
  exception when check_violation then
    insert into resultado values (2, 'Raíz mal formada', 'rechazada', 'rechazada', true);
  end;

  -- 3. Dos anclajes de la misma organización no pueden cubrir el mismo evento:
  --    haría ambiguo cuál es la prueba de ese evento.
  begin
    insert into anclaje (organization_id, desde_secuencia, hasta_secuencia,
                         raiz_merkle, cadena_hash_final, motivo)
    values (v_org, 5, 20, v_hash, v_hash, 'diario');
    insert into resultado values (3, 'Tramos que se solapan', 'rechazados', 'aceptados', false);
  exception when exclusion_violation then
    insert into resultado values (3, 'Tramos que se solapan', 'rechazados', 'rechazados', true);
  end;

  -- 4. Otra organización sí puede tener el mismo tramo: las secuencias son
  --    por cadena, y cada organización tiene la suya.
  insert into anclaje (organization_id, desde_secuencia, hasta_secuencia,
                       raiz_merkle, cadena_hash_final, motivo)
  values (v_otra, 1, 10, v_hash, v_hash, 'diario');
  insert into resultado values (4, 'Mismo tramo en otra organización', 'aceptado', 'aceptado', true);

  -- 5. Un tramo al revés no entra.
  begin
    insert into anclaje (organization_id, desde_secuencia, hasta_secuencia,
                         raiz_merkle, cadena_hash_final, motivo)
    values (v_org, 30, 20, v_hash, v_hash, 'diario');
    insert into resultado values (5, 'Tramo invertido', 'rechazado', 'aceptado', false);
  exception when check_violation then
    insert into resultado values (5, 'Tramo invertido', 'rechazado', 'rechazado', true);
  end;

  -- 6. Un motivo inventado no entra: los tres son los que decidió el diseño.
  begin
    insert into anclaje (organization_id, desde_secuencia, hasta_secuencia,
                         raiz_merkle, cadena_hash_final, motivo)
    values (v_org, 11, 12, v_hash, v_hash, 'porque_si');
    insert into resultado values (6, 'Motivo fuera del catálogo', 'rechazado', 'aceptado', false);
  exception when check_violation then
    insert into resultado values (6, 'Motivo fuera del catálogo', 'rechazado', 'rechazado', true);
  end;

  -- 7. La prueba MADURA: pasar de pendiente a confirmado con su bloque es lo
  --    que hace OpenTimestamps unas horas después.
  update anclaje
     set estado = 'confirmado', ots = '\x0001'::bytea, bloque_btc = 900123,
         fecha_bloque = now()
   where id = v_id;
  insert into resultado
  select 7, 'La prueba madura a confirmado', 'confirmado', estado, estado = 'confirmado'
    from anclaje where id = v_id;

  -- 8. Pero el tramo NO se corrige. Un anclaje mal calculado se marca fallido
  --    y se hace otro; reescribirlo sería poder elegir qué certificó.
  begin
    update anclaje set hasta_secuencia = 99 where id = v_id;
    insert into resultado values (8, 'Mover el tramo', 'rechazado', 'aceptado', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (8, 'Mover el tramo', 'rechazado',
                                  left(v_msg, 40), v_msg like '%no se corrige%');
  end;

  -- 9. Ni la raíz.
  begin
    update anclaje set raiz_merkle = repeat('b', 64) where id = v_id;
    insert into resultado values (9, 'Cambiar la raíz', 'rechazado', 'aceptado', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (9, 'Cambiar la raíz', 'rechazado',
                                  left(v_msg, 40), v_msg like '%no se corrige%');
  end;

  -- 10. Y no se borra: es la prueba de que la bitácora no cambió.
  begin
    delete from anclaje where id = v_id;
    insert into resultado values (10, 'Borrar un anclaje', 'rechazado', 'aceptado', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado values (10, 'Borrar un anclaje', 'rechazado',
                                  left(v_msg, 40), v_msg like '%no se borra%');
  end;

  -- 11. El disparador fija actualizado_en, no quien escribe: una fecha
  --     puesta a mano no sobrevive. Se comprueba con una fecha imposible,
  --     porque dentro de una misma transacción now() no avanza y comparar
  --     contra creado_en no probaría nada.
  update anclaje set detalle = 'reintento', actualizado_en = '2000-01-01'::timestamptz
   where id = v_id;
  insert into resultado
  select 11, 'actualizado_en lo pone el disparador', 'no se respeta la fecha a mano',
         case when actualizado_en > '2020-01-01'::timestamptz
              then 'no se respeta' else 'se respetó' end,
         actualizado_en > '2020-01-01'::timestamptz
    from anclaje where id = v_id;

  -- 12. El tramo por anclar arranca después del último anclaje.
  insert into cadena_auditoria (organization_id, ultima_secuencia, ultimo_hash)
  values (v_org, 25, v_hash)
  on conflict (organization_id) do update
    set ultima_secuencia = 25, ultimo_hash = v_hash;
  select desde, hasta into v_desde, v_hasta from public.rango_por_anclar(v_org);
  insert into resultado values (12, 'Rango por anclar', '11..25',
                                coalesce(v_desde::text, '?') || '..' || coalesce(v_hasta::text, '?'),
                                v_desde = 11 and v_hasta = 25);

  -- 13. Sin nada nuevo, `hasta` queda por debajo de `desde`: quien llama NO
  --     debe crear un anclaje vacío.
  update cadena_auditoria set ultima_secuencia = 10 where organization_id = v_org;
  select desde, hasta into v_desde, v_hasta from public.rango_por_anclar(v_org);
  insert into resultado values (13, 'Nada nuevo que anclar', 'hasta < desde',
                                v_desde::text || '..' || v_hasta::text, v_hasta < v_desde);

  -- 14. La vista dice cuántos eventos van sin cobertura externa.
  update cadena_auditoria set ultima_secuencia = 42 where organization_id = v_org;
  insert into resultado
  select 14, 'Eventos sin anclar', '32', eventos_sin_anclar::text, eventos_sin_anclar = 32
    from v_anclaje_estado where organization_id = v_org;

  -- La cabeza de la cadena se REPONE, no se borra.
  --
  -- Borrarla dejaba los eventos de Ixim Pay sin cabeza: el siguiente
  -- `registrar_evento` la volvía a crear en cero y pedía la secuencia 1, que ya
  -- existía, y reventaba con llave duplicada. En una base compartida eso rompe
  -- todas las pruebas posteriores, no ésta —lo cazó la corrida completa, donde
  -- la 0053 falló sin tener nada que ver—.
  update cadena_auditoria c
     set ultima_secuencia = coalesce(u.secuencia, 0),
         ultimo_hash = coalesce(u.cadena_hash, repeat('0', 64))
    from (select e.organization_id, e.secuencia, e.cadena_hash
            from evento_auditoria e
           where e.organization_id = v_org
           order by e.secuencia desc limit 1) u
   where c.organization_id = v_org and u.organization_id = c.organization_id;

  -- La organización inventada de la prueba sí se va entera: no tiene eventos
  -- reales de los que quedar descolgada.
  delete from cadena_auditoria where organization_id = v_otra;
end;
$$;

alter table anclaje disable trigger trg_anclaje_sin_borrado;
delete from anclaje
 where organization_id in ('11111111-1111-1111-1111-111111111111',
                           '99999999-9999-9999-9999-999999999999');
alter table anclaje enable trigger trg_anclaje_sin_borrado;

select n as "#", prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as resultado
from resultado order by n;
