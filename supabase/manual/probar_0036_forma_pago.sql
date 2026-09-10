-- =====================================================================
-- Pruebas de comportamiento de la 0036 · forma de pago y origen
-- =====================================================================
-- Sobre un PostgreSQL DESECHABLE con harness_postgres_local.sql, nunca contra
-- el remoto: crea datos.
--
-- Que las columnas existan lo dice \d. Lo que hay que demostrar es que sólo
-- admiten lo que la matriz nombra —una forma de pago inventada rompe el
-- pre-llenado en silencio, porque no encuentra opción y deja la variable sin
-- responder sin decir por qué— y que los actos viejos NO se rellenan solos.
-- =====================================================================

create temp table resultado (n int, prueba text, esperado text, obtenido text, paso boolean);

do $$
declare
  v_org uuid := 'cccccccc-0000-0000-0000-000000000036';
  v_cli uuid;
  v_op  uuid;
  v_n   int;
  v_msg text;
  v_eventos_antes bigint;
begin
  insert into organizations (id, rfc, razon_social)
  values (v_org, 'PAG900101AB1', 'Notaría de prueba 0036')
    on conflict (id) do nothing;

  insert into client (organization_id, tipo_persona, nombre_razon_social)
  values (v_org, 'fisica', 'Compareciente 0036') returning id into v_cli;

  -- ------------------------------------------------------------------
  -- 1. Un acto nuevo nace sin los dos datos
  -- ------------------------------------------------------------------
  -- No se infieren. Suponer que un acto se pagó por transferencia sería
  -- inventar justo el dato que la migration existe para empezar a tener.
  insert into operation (organization_id, client_id, tipo, monto_mxn, fecha)
  values (v_org, v_cli, 'otro', 2000000, '2026-08-18') returning id into v_op;

  select count(*) into v_n from operation
   where id = v_op and forma_pago is null and pais_origen_recursos is null;
  insert into resultado values (1, 'Nace sin forma de pago ni origen', '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 2. Las tres formas que la matriz nombra se aceptan
  -- ------------------------------------------------------------------
  -- El efectivo va junto con la forma de pago y no después: la 0046 añadió un
  -- disparador que rechaza «mixto» o «efectivo» sin el importe en efectivo,
  -- porque el artículo 32 se mide sobre ese importe y sin él no se puede saber
  -- si el acto está permitido. Esta prueba es anterior a esa regla y se quedó
  -- poniendo sólo la forma; lo que comprueba —que las tres formas de la matriz
  -- se aceptan— no cambia.
  --
  -- Mil pesos, no los dos millones del acto: lo que se prueba aquí es el
  -- catálogo de formas de pago, no el límite del 32.
  update operation set forma_pago = 'bancarizado' where id = v_op;
  update operation set forma_pago = 'mixto', efectivo_mxn = 1000 where id = v_op;
  update operation set forma_pago = 'efectivo', efectivo_mxn = 1000 where id = v_op;
  select count(*) into v_n from operation where id = v_op and forma_pago = 'efectivo';
  insert into resultado values (2, 'Acepta bancarizado, mixto y efectivo', '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 3. Una forma de pago inventada se rechaza
  -- ------------------------------------------------------------------
  -- Si entrara, el pre-llenado de la matriz no encontraría opción y dejaría la
  -- variable sin responder sin decir por qué: un hueco silencioso.
  begin
    update operation set forma_pago = 'tarjeta' where id = v_op;
    insert into resultado values (3, 'Rechaza una forma que la matriz no nombra',
      'excepción', 'la aceptó', false);
  exception when check_violation then
    insert into resultado values (3, 'Rechaza una forma que la matriz no nombra',
      'excepción', 'rechazada', true);
  end;

  -- ------------------------------------------------------------------
  -- 4. El país va en ISO2 y en mayúsculas
  -- ------------------------------------------------------------------
  -- 'mx' y 'MX' serían dos países distintos al cotejar contra las listas GAFI,
  -- y el de minúsculas no coincidiría con ninguna.
  update operation set pais_origen_recursos = 'KP' where id = v_op;
  select count(*) into v_n from operation where id = v_op and pais_origen_recursos = 'KP';
  insert into resultado values (4, 'Acepta un ISO2 en mayúsculas', '1', v_n::text, v_n = 1);

  begin
    update operation set pais_origen_recursos = 'mx' where id = v_op;
    insert into resultado values (5, 'Rechaza minúsculas', 'excepción', 'las aceptó', false);
  exception when check_violation then
    insert into resultado values (5, 'Rechaza minúsculas', 'excepción', 'rechazada', true);
  end;

  begin
    update operation set pais_origen_recursos = 'MEX' where id = v_op;
    insert into resultado values (6, 'Rechaza un código de tres letras',
      'excepción', 'lo aceptó', false);
  exception when check_violation then
    insert into resultado values (6, 'Rechaza un código de tres letras',
      'excepción', 'rechazada', true);
  end;

  -- ------------------------------------------------------------------
  -- 7. Nulo sigue siendo válido
  -- ------------------------------------------------------------------
  -- Los actos anteriores a la migration se quedan así, y el diferido del alta
  -- también los deja así.
  update operation set forma_pago = null, pais_origen_recursos = null where id = v_op;
  select count(*) into v_n from operation where id = v_op and forma_pago is null;
  insert into resultado values (7, 'Nulo sigue siendo válido', '1', v_n::text, v_n = 1);

  -- ------------------------------------------------------------------
  -- 8. Reaplicar no añade eventos
  -- ------------------------------------------------------------------
  -- El bloque se corre DOS veces y se mide la segunda. Medir contra el estado
  -- previo a la primera no probaría nada: la organización de prueba se crea
  -- aquí dentro, DESPUÉS de que la migration ya corrió, así que legítimamente
  -- no tiene evento y la primera pasada se lo pone. Lo que hay que demostrar es
  -- que la SEGUNDA no añade nada.
  --
  -- Y se compara contra el conteo previo, no contra una ventana de tiempo:
  -- registrar_evento sella con now(), que es el inicio de la transacción y por
  -- tanto siempre anterior a cualquier reloj leído aquí dentro.
  declare v_o uuid; v_pasada int;
  begin
    for v_pasada in 1..2 loop
      if v_pasada = 2 then
        select count(*) into v_eventos_antes from evento_auditoria
         where tipo = 'captura_forma_pago_y_origen_recursos';
      end if;

      for v_o in select id from organizations loop
        if exists (select 1 from evento_auditoria
                    where organization_id = v_o
                      and tipo = 'captura_forma_pago_y_origen_recursos') then
          continue;
        end if;
        perform public.registrar_evento(v_o, 'captura_forma_pago_y_origen_recursos',
          'operation', null, '{}'::jsonb, 'sistema', null);
      end loop;
    end loop;
  end;

  select count(*) into v_n from evento_auditoria
   where tipo = 'captura_forma_pago_y_origen_recursos';
  insert into resultado values (8, 'La segunda pasada no añade eventos',
    v_eventos_antes::text, v_n::text, v_n = v_eventos_antes);

  -- ------------------------------------------------------------------
  -- 9. Las cadenas siguen íntegras
  -- ------------------------------------------------------------------
  select count(*) into v_n
    from cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  insert into resultado values (9, 'Ninguna cadena rota', '0', v_n::text, v_n = 0);

  perform v_msg;
end $$;

select n, prueba, esperado, obtenido,
       case when paso then 'PASA' else 'FALLA' end as veredicto
from resultado order by n;
