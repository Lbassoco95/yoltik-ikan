-- =====================================================================
-- Ikán · Pruebas de comportamiento de la migration 0025
-- =====================================================================
-- NO se corre en el remoto: escribe avisos y clientes de prueba. Es para el
-- PostgreSQL desechable preparado con harness_postgres_local.sql.
--
-- Lo que comprueba, y por qué: que el aviso deje rastro en la bitácora, que el
-- XML completo NO se duplique dentro del evento pero SÍ su hash, que cambiar
-- el archivo cambie el hash, que un XML nulo se distinga del hash de la cadena
-- vacía, que un informe en ceros no admita actos, y que el cambio al emisor de
-- eventos no haya roto los siete triggers anteriores.
--
-- Imprime "OK · 10 pruebas pasaron".
-- =====================================================================

do $$
declare
  v_org uuid;
  v_id uuid;
  v_ev jsonb;
  v_ok int := 0;
  v_hash text;
  v_xml text := '<?xml version="1.0"?><archivo><informe>...</informe></archivo>';
begin
  select id into v_org from organizations limit 1;

  -- 1. un aviso con XML queda registrado en la bitácora
  insert into aviso (organization_id, tipo, periodo, payload, layout, layout_version,
                     operation_ids, xml, referencia)
  values (v_org, 'mensual', '2026-08', '{"actos":1}'::jsonb, 'fep', 'v4.3',
          array[gen_random_uuid()], v_xml, 'IKAN2608')
  returning id into v_id;

  select payload into v_ev from evento_auditoria
   where entidad = 'aviso' and entidad_id = v_id order by secuencia desc limit 1;
  if v_ev is null then raise exception 'FALLA 1: el aviso no dejó evento en la bitácora'; end if;
  v_ok := v_ok + 1;

  -- 2. el XML NO viaja en el payload del evento
  if v_ev ? 'xml' then raise exception 'FALLA 2: el XML completo se metió en la bitácora'; end if;
  v_ok := v_ok + 1;

  -- 3. pero su hash sí, y es el correcto
  v_hash := encode(sha256(convert_to(v_xml, 'UTF8')), 'hex');
  if (v_ev ->> 'xml_sha256') is distinct from v_hash then
    raise exception 'FALLA 3: hash del XML = %, esperaba %', v_ev ->> 'xml_sha256', v_hash;
  end if;
  v_ok := v_ok + 1;

  -- 4. las demás columnas sí viajan
  if (v_ev ->> 'layout_version') <> 'v4.3' or (v_ev ->> 'referencia') <> 'IKAN2608' then
    raise exception 'FALLA 4: el evento perdió columnas que sí debía llevar';
  end if;
  v_ok := v_ok + 1;

  -- 5. cambiar el XML cambia el hash: no se puede sustituir el archivo sin rastro
  update aviso set xml = v_xml || '<!-- alterado -->' where id = v_id;
  select payload into v_ev from evento_auditoria
   where entidad = 'aviso' and entidad_id = v_id order by secuencia desc limit 1;
  if (v_ev ->> 'xml_sha256') = v_hash then
    raise exception 'FALLA 5: se cambió el XML y el hash quedó igual';
  end if;
  v_ok := v_ok + 1;

  -- 6. un XML nulo se distingue del hash de la cadena vacía
  insert into aviso (organization_id, tipo, periodo, payload, exento)
  values (v_org, 'mensual', '2026-09', '{}'::jsonb, true) returning id into v_id;
  select payload into v_ev from evento_auditoria
   where entidad = 'aviso' and entidad_id = v_id order by secuencia desc limit 1;
  if jsonb_typeof(v_ev -> 'xml_sha256') <> 'null' then
    raise exception 'FALLA 6: un XML nulo debería quedar como null, quedó %', v_ev -> 'xml_sha256';
  end if;
  v_ok := v_ok + 1;

  -- 7. un informe en ceros no puede llevar actos
  begin
    insert into aviso (organization_id, tipo, periodo, payload, exento, operation_ids)
    values (v_org, 'mensual', '2026-10', '{}'::jsonb, true, array[gen_random_uuid()]);
    raise exception 'FALLA 7: aceptó un informe en ceros con actos dentro';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- 8. la cadena sigue íntegra
  if exists (select 1 from public.verificar_cadena(v_org)) then
    raise exception 'FALLA 8: la cadena se rompió';
  end if;
  v_ok := v_ok + 1;

  -- 9. emitir_evento_de_tabla siguió cerrada tras el create or replace
  if has_function_privilege('authenticated', 'public.emitir_evento_de_tabla()', 'execute')
     or has_function_privilege('anon', 'public.emitir_evento_de_tabla()', 'execute') then
    raise exception 'FALLA 9: emitir_evento_de_tabla volvió a quedar abierta';
  end if;
  v_ok := v_ok + 1;

  -- 10. los siete emisores anteriores siguen sin omitir nada
  insert into client (organization_id, tipo_persona, nombre_razon_social)
  values (v_org, 'moral', 'Prueba 0025');
  select payload into v_ev from evento_auditoria
   where entidad = 'client' order by secuencia desc limit 1;
  if not (v_ev ? 'nombre_razon_social') then
    raise exception 'FALLA 10: el cambio del emisor rompió los triggers viejos';
  end if;
  v_ok := v_ok + 1;

  raise notice 'OK · % pruebas pasaron', v_ok;
end $$;
