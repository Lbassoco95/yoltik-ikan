-- =====================================================================
-- Ikán · Pruebas de comportamiento de la migration 0021 (bitácora encadenada)
-- =====================================================================
-- NO se corre en el remoto: apaga RLS, escribe filas y APAGA el trigger de
-- inmutabilidad para simular a alguien con acceso directo a la base. Es para
-- el Postgres desechable donde se valida la migration.
--
-- Las 12 primeras comprueban que los eventos se emiten solos y encadenan bien.
-- De la 13 a la 16, que la manipulación se detecta: alterar un payload,
-- borrar un evento intermedio, truncar por el final, y recalcular el eslabón
-- para tapar un payload alterado.
--
-- La 18 comprueba lo CONTRARIO a propósito: reescribir la cadena entera desde
-- la base NO se detecta con la cadena sola. Está como prueba y no como
-- comentario para que nadie llegue después creyendo que basta. Eso lo cierra
-- el anclaje externo (B8.2).
--
-- Imprime "OK · 12 pruebas pasaron (parte 1)" y luego OK 13 a OK 18.
-- =====================================================================

alter table client disable row level security;
alter table operation disable row level security;
alter table organizations disable row level security;
alter table evento_auditoria disable row level security;
alter table cadena_auditoria disable row level security;

do $$
declare
  PLATAFORMA constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ok int := 0;
  v_org uuid;
  v_cli uuid;
  v_n int;
  v_txt text;
  v_hash text;
  v_seq bigint;
  r record;
begin
  insert into organizations (rfc, razon_social, sectores, perfil_actividad)
  values ('BIT' || to_char(clock_timestamp(),'YYMMDDHH24MISSMS'), 'Notaría bitácora', array['XII']::sector_av[], 'notarias')
  returning id into v_org;

  -- 1. el alta de un compareciente deja evento, sin que nadie lo pida
  insert into client (organization_id, tipo_persona, nombre_razon_social, nombre, apellido_paterno)
  values (v_org, 'fisica', 'x', 'Juan', 'Pérez') returning id into v_cli;
  select count(*) into v_n from evento_auditoria where organization_id = v_org and entidad = 'client';
  if v_n <> 1 then raise exception 'FALLA 1: % eventos de client', v_n; end if;
  v_ok := v_ok + 1;

  -- 2. el primer eslabón cuelga del hash de génesis
  select hash_anterior, secuencia into v_txt, v_seq
    from evento_auditoria where organization_id = v_org order by secuencia limit 1;
  if v_txt <> repeat('0',64) or v_seq <> 1 then
    raise exception 'FALLA 2: primer evento anterior=% secuencia=%', left(v_txt,8), v_seq;
  end if;
  v_ok := v_ok + 1;

  -- 3. el payload guarda la fila completa, no un resumen
  select payload ->> 'apellido_paterno' into v_txt
    from evento_auditoria where organization_id = v_org order by secuencia limit 1;
  if v_txt <> 'Pérez' then raise exception 'FALLA 3: payload sin el apellido (%)', v_txt; end if;
  v_ok := v_ok + 1;

  -- 4. un acto encadena con el evento anterior
  insert into operation (organization_id, client_id, tipo, monto_mxn, instrumento_publico)
  values (v_org, v_cli, 'otro', 1500000, '45321');
  select count(*) into v_n from evento_auditoria where organization_id = v_org;
  if v_n < 2 then raise exception 'FALLA 4: % eventos', v_n; end if;
  select e.hash_anterior into v_txt from evento_auditoria e
   where e.organization_id = v_org and e.secuencia = 2;
  select e.cadena_hash into v_hash from evento_auditoria e
   where e.organization_id = v_org and e.secuencia = 1;
  if v_txt <> v_hash then raise exception 'FALLA 4b: el eslabón 2 no apunta al 1'; end if;
  v_ok := v_ok + 1;

  -- 5. la cadena verifica limpia
  if exists (select 1 from public.verificar_cadena(v_org)) then
    select motivo into v_txt from public.verificar_cadena(v_org) limit 1;
    raise exception 'FALLA 5: cadena rota de origen: %', v_txt;
  end if;
  v_ok := v_ok + 1;

  -- 6. la cabeza coincide con el último eslabón
  select ultima_secuencia, ultimo_hash into v_seq, v_txt
    from cadena_auditoria where organization_id = v_org;
  select max(secuencia) into v_n from evento_auditoria where organization_id = v_org;
  if v_seq <> v_n then raise exception 'FALLA 6: cabeza en % y último evento en %', v_seq, v_n; end if;
  v_ok := v_ok + 1;

  -- 7. un evento NO se puede modificar
  begin
    update evento_auditoria set payload_canonico = '{}' where organization_id = v_org;
    raise exception 'FALLA 7: se pudo modificar un evento';
  exception when others then
    if sqlerrm not like '%sólo escritura%' then raise; end if;
    v_ok := v_ok + 1;
  end;

  -- 8. ni borrar
  begin
    delete from evento_auditoria where organization_id = v_org;
    raise exception 'FALLA 8: se pudo borrar un evento';
  exception when others then
    if sqlerrm not like '%sólo escritura%' then raise; end if;
    v_ok := v_ok + 1;
  end;

  -- 9. lo de plataforma va a la cadena de Kawiil, no a la del cliente
  insert into parametro_regulatorio (codigo, nombre, valor_numerico, unidad, vigente_desde, fuente)
  values ('PRUEBA_BITACORA_' || to_char(clock_timestamp(),'YYMMDDHH24MISSMS'),
          'Parámetro de prueba', 1, 'mxn', current_date, 'prueba');
  select count(*) into v_n from evento_auditoria
   where organization_id = PLATAFORMA and entidad = 'parametro_regulatorio';
  if v_n < 1 then raise exception 'FALLA 9: el parámetro no dejó evento de plataforma'; end if;
  select count(*) into v_n from evento_auditoria
   where organization_id = v_org and entidad = 'parametro_regulatorio';
  if v_n <> 0 then raise exception 'FALLA 9b: se filtró a la cadena del cliente'; end if;
  v_ok := v_ok + 1;

  -- 10. el actor se registra: el motor no es una persona
  insert into client (organization_id, tipo_persona, nombre_razon_social)
  values (v_org, 'moral', 'ACME SA');
  select actor_tipo into v_txt from evento_auditoria
   where organization_id = v_org order by secuencia desc limit 1;
  if v_txt <> 'persona' then raise exception 'FALLA 10: actor_tipo = %', v_txt; end if;
  v_ok := v_ok + 1;

  -- 11. JSON canónico: claves ordenadas, sin espacios
  if public.json_canonico('{"b":2,"a":1}'::jsonb) <> '{"a":1,"b":2}' then
    raise exception 'FALLA 11: canónico = %', public.json_canonico('{"b":2,"a":1}'::jsonb);
  end if;
  if public.json_canonico('{"a":1,"b":2}'::jsonb) <> public.json_canonico('{"b":2,"a":1}'::jsonb) then
    raise exception 'FALLA 11b: el orden de captura cambia el hash';
  end if;
  v_ok := v_ok + 1;

  -- 12. el arreglo SÍ conserva su orden (no es un conjunto)
  if public.json_canonico('[2,1]'::jsonb) = public.json_canonico('[1,2]'::jsonb) then
    raise exception 'FALLA 12: se perdió el orden del arreglo';
  end if;
  if public.json_canonico('{"a":[1,{"z":1,"y":2}],"b":null}'::jsonb)
     <> '{"a":[1,{"y":2,"z":1}],"b":null}' then
    raise exception 'FALLA 12b: anidado = %', public.json_canonico('{"a":[1,{"z":1,"y":2}],"b":null}'::jsonb);
  end if;
  v_ok := v_ok + 1;

  raise notice 'OK · % pruebas pasaron (parte 1)', v_ok;
end $$;

-- =====================================================================
-- Parte 2 · Detección de manipulación
-- =====================================================================
-- Se apaga el trigger de inmutabilidad a propósito: es la única manera de
-- simular a alguien con acceso directo a la base, que es justo el ataque que
-- la cadena tiene que delatar. Todo va dentro de una transacción que se
-- revierte, para no dejar la bitácora rota.

begin;
alter table evento_auditoria disable trigger trg_evento_inmutable;

-- 13. alterar el contenido de un evento se detecta
update evento_auditoria e
   set payload_canonico = '{"monto_mxn":"1.00"}'
  from cadena_auditoria c
 where e.organization_id = c.organization_id
   and c.organization_id <> '00000000-0000-0000-0000-000000000000'
   and e.secuencia = 2;
select case when count(*) = 1 and min(motivo) like '%se alteró el payload%'
            then 'OK 13 · payload alterado detectado'
            else 'FALLA 13 · ' || coalesce(min(motivo), 'no detectó nada') end as resultado
  from public.verificar_cadena((select organization_id from cadena_auditoria
                                 where organization_id <> '00000000-0000-0000-0000-000000000000'
                                 order by actualizado_en desc limit 1));
rollback;

begin;
alter table evento_auditoria disable trigger trg_evento_inmutable;

-- 14. borrar un evento intermedio se detecta
delete from evento_auditoria e
 using cadena_auditoria c
 where e.organization_id = c.organization_id
   and c.organization_id <> '00000000-0000-0000-0000-000000000000'
   and e.secuencia = 2;
select case when count(*) = 1 and (min(motivo) like '%hueco%' or min(motivo) like '%eslabón%')
            then 'OK 14 · evento borrado detectado'
            else 'FALLA 14 · ' || coalesce(min(motivo), 'no detectó nada') end as resultado
  from public.verificar_cadena((select organization_id from cadena_auditoria
                                 where organization_id <> '00000000-0000-0000-0000-000000000000'
                                 order by actualizado_en desc limit 1));
rollback;

begin;
alter table evento_auditoria disable trigger trg_evento_inmutable;

-- 15. truncar la cadena por el final se detecta: es la manipulación que no
--     rompe ningún eslabón, sólo desaparece los últimos eventos.
delete from evento_auditoria e
 using cadena_auditoria c
 where e.organization_id = c.organization_id
   and c.organization_id <> '00000000-0000-0000-0000-000000000000'
   and e.secuencia = c.ultima_secuencia;
select case when count(*) = 1 and min(motivo) like '%truncó%'
            then 'OK 15 · truncamiento detectado'
            else 'FALLA 15 · ' || coalesce(min(motivo), 'no detectó nada') end as resultado
  from public.verificar_cadena((select organization_id from cadena_auditoria
                                 where organization_id <> '00000000-0000-0000-0000-000000000000'
                                 order by actualizado_en desc limit 1));
rollback;

begin;
alter table evento_auditoria disable trigger trg_evento_inmutable;

-- 16. reescribir el eslabón para tapar un payload alterado tampoco cuela:
--     el hash del evento sigue sin corresponder a su contenido.
update evento_auditoria e
   set payload_canonico = '{"monto_mxn":"1.00"}',
       cadena_hash = encode(sha256(convert_to(e.hash_anterior || '|' || e.evento_hash || '|' || e.secuencia::text, 'UTF8')), 'hex')
  from cadena_auditoria c
 where e.organization_id = c.organization_id
   and c.organization_id <> '00000000-0000-0000-0000-000000000000'
   and e.secuencia = 2;
select case when count(*) = 1 and min(motivo) like '%se alteró el payload%'
            then 'OK 16 · eslabón recalculado no salva el payload alterado'
            else 'FALLA 16 · ' || coalesce(min(motivo), 'no detectó nada') end as resultado
  from public.verificar_cadena((select organization_id from cadena_auditoria
                                 where organization_id <> '00000000-0000-0000-0000-000000000000'
                                 order by actualizado_en desc limit 1));
rollback;

-- 17. la cadena vuelve a estar íntegra tras revertir todo
select case when count(*) = 0 then 'OK 17 · cadena íntegra tras revertir'
            else 'FALLA 17 · ' || min(motivo) end as resultado
  from public.verificar_cadena((select organization_id from cadena_auditoria
                                 where organization_id <> '00000000-0000-0000-0000-000000000000'
                                 order by actualizado_en desc limit 1));

-- =====================================================================
-- Parte 3 · El límite de la cadena, escrito como prueba
-- =====================================================================
-- Quien tenga acceso directo a la base puede alterar un evento Y recalcular
-- todo lo que cuelga de él, cabeza incluida. Eso NO lo detecta
-- verificar_cadena, y no hay manera de que lo detecte: la cadena vive en la
-- base que esa persona controla.
--
-- Se deja como prueba, no como comentario, para que nadie llegue después
-- creyendo que la cadena por sí sola basta. Lo que cierra este hueco es el
-- anclaje externo de raíces Merkle (B8.2): una raíz publicada fuera ya no se
-- puede recalcular.

begin;
alter table evento_auditoria disable trigger trg_evento_inmutable;

do $$
declare
  v_org uuid;
  r record;
  v_anterior text := repeat('0', 64);
  v_evento_hash text;
  v_cadena_hash text;
begin
  select organization_id into v_org from cadena_auditoria
   where organization_id <> '00000000-0000-0000-0000-000000000000'
   order by actualizado_en desc limit 1;

  -- Se falsea el monto y se rehace la cadena entera desde ahí.
  update evento_auditoria set payload_canonico = '{"monto_mxn":"1.00"}'
   where organization_id = v_org and secuencia = 2;

  for r in select * from evento_auditoria where organization_id = v_org order by secuencia loop
    v_evento_hash := encode(sha256(convert_to(r.payload_canonico || '|' || r.nonce, 'UTF8')), 'hex');
    v_cadena_hash := encode(sha256(convert_to(v_anterior || '|' || v_evento_hash || '|' || r.secuencia::text, 'UTF8')), 'hex');
    update evento_auditoria
       set evento_hash = v_evento_hash, cadena_hash = v_cadena_hash, hash_anterior = v_anterior
     where id = r.id;
    v_anterior := v_cadena_hash;
  end loop;

  update cadena_auditoria set ultimo_hash = v_anterior where organization_id = v_org;
end $$;

select case when count(*) = 0
            then 'OK 18 · como se esperaba, reescribir la cadena ENTERA no lo detecta la cadena sola: para eso es el anclaje externo'
            else 'INESPERADO 18 · ' || min(motivo) end as resultado
  from public.verificar_cadena((select organization_id from cadena_auditoria
                                 where organization_id <> '00000000-0000-0000-0000-000000000000'
                                 order by actualizado_en desc limit 1));
rollback;
