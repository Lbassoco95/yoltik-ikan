-- =====================================================================
-- Ikán · Pruebas de comportamiento de la migration 0019
-- =====================================================================
-- NO se corre en el remoto: escribe filas de prueba. Es para el Postgres
-- desechable donde se valida la migration antes de mandarla al SQL Editor.
--
-- Comprueba lo que un CHECK no dice por sí solo: que el nombre de despliegue
-- se recompone desde las partes, que un alta antigua sin partes NO se toca
-- (nadie adivina dónde termina el nombre y empieza el apellido), y que dos
-- actos de la misma escritura conviven.
--
-- Imprime "OK · 12 pruebas pasaron".
-- =====================================================================

alter table organizations disable row level security;
alter table client disable row level security;
alter table operation disable row level security;

do $$
declare
  v_org uuid;
  v_cli uuid;
  v_nombre text;
  v_ok int := 0;
  v_msg text;
begin
  insert into organizations (rfc, razon_social, sectores, perfil_actividad)
  values ('NOT' || to_char(clock_timestamp(), 'YYMMDDHH24MISS'), 'Notaría de prueba', array['XII']::sector_av[], 'notarias')
  returning id into v_org;

  -- 1. claves del padrón con formato válido
  update organizations set clave_sujeto_obligado = 'NOTA900101AB1',
                           clave_entidad_colegiada = 'CNM900101XY2',
                           clave_actividad = 'FEP'
  where id = v_org;
  v_ok := v_ok + 1;

  -- 2. clave con formato inválido se rechaza
  begin
    update organizations set clave_actividad = 'FEPX' where id = v_org;
    raise exception 'FALLA 2: aceptó clave_actividad de 4 caracteres';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- 3. alta de persona física con partes: el nombre de despliegue se compone
  insert into client (organization_id, tipo_persona, nombre_razon_social,
                      nombre, apellido_paterno, apellido_materno, fecha_nacimiento,
                      pais_nacionalidad_clave, actividad_economica_clave)
  values (v_org, 'fisica', 'se recompone', 'Juan Carlos', 'Pérez', 'López',
          date '1980-05-02', 'MX', '1234567')
  returning id, nombre_razon_social into v_cli, v_nombre;
  if v_nombre <> 'Juan Carlos Pérez López' then
    raise exception 'FALLA 3: nombre compuesto = %', v_nombre;
  end if;
  v_ok := v_ok + 1;

  -- 4. sin apellido materno también compone
  update client set apellido_materno = null where id = v_cli;
  select nombre_razon_social into v_nombre from client where id = v_cli;
  if v_nombre <> 'Juan Carlos Pérez' then
    raise exception 'FALLA 4: nombre sin materno = %', v_nombre;
  end if;
  v_ok := v_ok + 1;

  -- 5. persona moral NO se toca (no tiene partes)
  insert into client (organization_id, tipo_persona, nombre_razon_social, fecha_constitucion)
  values (v_org, 'moral', 'Inmobiliaria del Bajío, S.A. de C.V.', date '2015-03-10')
  returning nombre_razon_social into v_nombre;
  if v_nombre <> 'Inmobiliaria del Bajío, S.A. de C.V.' then
    raise exception 'FALLA 5: alteró la razón social = %', v_nombre;
  end if;
  v_ok := v_ok + 1;

  -- 6. alta antigua sin partes: nombre_razon_social intacto
  insert into client (organization_id, tipo_persona, nombre_razon_social)
  values (v_org, 'fisica', 'MARIA GUADALUPE HERNANDEZ RUIZ')
  returning nombre_razon_social into v_nombre;
  if v_nombre <> 'MARIA GUADALUPE HERNANDEZ RUIZ' then
    raise exception 'FALLA 6: adivinó cómo partir el nombre = %', v_nombre;
  end if;
  v_ok := v_ok + 1;

  -- 7. clave de país inválida se rechaza
  begin
    update client set pais_nacionalidad_clave = 'MEX' where id = v_cli;
    raise exception 'FALLA 7: aceptó clave de país de 3 letras';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- 8. actividad económica de 6 dígitos se rechaza
  begin
    update client set actividad_economica_clave = '123456' where id = v_cli;
    raise exception 'FALLA 8: aceptó actividad económica de 6 dígitos';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- 9. acto con instrumento y detalle
  insert into operation (organization_id, client_id, tipo, monto_mxn, fecha,
                         contraparte, instrumento_publico, datos_acto)
  values (v_org, v_cli, 'otro', 1500000, timestamptz '2026-08-14 12:00:00-06',
          '{"tipo_acto":"otorgamiento_poder"}'::jsonb, '45,321',
          '{"tipo_poder":"1"}'::jsonb);
  v_ok := v_ok + 1;

  -- 10. datos_acto tiene default, no null
  if exists (select 1 from operation where datos_acto is null) then
    raise exception 'FALLA 10: datos_acto quedó null';
  end if;
  v_ok := v_ok + 1;

  -- 11. instrumento de más de 20 caracteres se rechaza
  begin
    update operation set instrumento_publico = repeat('9', 21) where client_id = v_cli;
    raise exception 'FALLA 11: aceptó instrumento de 21 caracteres';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- 12. dos actos en la MISMA escritura conviven (no hay unicidad)
  insert into operation (organization_id, client_id, tipo, monto_mxn, instrumento_publico,
                         contraparte)
  values (v_org, v_cli, 'otro', 0, '45,321', '{"tipo_acto":"constitucion_personas_morales"}'::jsonb);
  v_ok := v_ok + 1;

  raise notice 'OK · % pruebas pasaron', v_ok;
end $$;
