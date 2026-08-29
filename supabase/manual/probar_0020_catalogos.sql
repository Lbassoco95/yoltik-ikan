-- =====================================================================
-- Ikán · Pruebas de comportamiento de la migration 0020
-- =====================================================================
-- NO se corre en el remoto: reemplaza el es_admin_kawiil() real por un
-- interruptor de prueba y escribe valores de catálogo. Es para el Postgres
-- desechable donde se valida la migration antes de mandarla al SQL Editor.
--
-- Comprueba lo que un CHECK no dice: que un no-admin no puede cargar, que una
-- carga con una clave mal formada se rechaza ENTERA (no a medias), que
-- reemplazar cierra la vigencia en vez de borrar, y que un catálogo sin cargar
-- no valida ninguna clave.
--
-- Imprime "OK · 16 pruebas pasaron".
-- =====================================================================

-- Harness: en el Postgres desechable no hay sesión, así que se finge el admin.
create or replace function public.es_admin_kawiil() returns boolean
language sql stable as $f$ select current_setting('ikan.admin', true) = 'si' $f$;

do $$
declare
  v_ok int := 0;
  v_n int;
  v_desc text;
begin
  -- 1. sin ser admin de plataforma, la carga se rechaza
  perform set_config('ikan.admin', 'no', true);
  begin
    perform public.reemplazar_valores_catalogo('entidad_federativa',
      '[{"clave":"14","descripcion":"Jalisco"}]'::jsonb);
    raise exception 'FALLA 1: un no-admin cargó un catálogo';
  exception when others then
    if sqlerrm not like '%administrador de plataforma%' then raise; end if;
    v_ok := v_ok + 1;
  end;

  perform set_config('ikan.admin', 'si', true);

  -- 2. carga válida
  select public.reemplazar_valores_catalogo('entidad_federativa',
    '[{"clave":"9","descripcion":"Ciudad de Mexico"},{"clave":"14","descripcion":"Jalisco"}]'::jsonb,
    'carga de prueba') into v_n;
  if v_n <> 2 then raise exception 'FALLA 2: insertó % valores', v_n; end if;
  v_ok := v_ok + 1;

  -- 3. la vista vigente los devuelve con su clave
  select descripcion into v_desc from v_catalogo_vigente
   where catalogo = 'entidad_federativa' and clave = '14';
  if v_desc <> 'Jalisco' then raise exception 'FALLA 3: descripción = %', v_desc; end if;
  v_ok := v_ok + 1;

  -- 4. respeta el orden del archivo, no alfabetiza por su cuenta
  select clave into v_desc from public.catalogo_en_fecha('entidad_federativa') limit 1;
  if v_desc <> '9' then raise exception 'FALLA 4: primer valor = %', v_desc; end if;
  v_ok := v_ok + 1;

  -- 5. clave que no cumple el patrón: se rechaza TODA la carga
  begin
    perform public.reemplazar_valores_catalogo('entidad_federativa',
      '[{"clave":"JAL","descripcion":"Jalisco"}]'::jsonb);
    raise exception 'FALLA 5: aceptó una clave alfabética en un catálogo numérico';
  exception when others then
    if sqlerrm not like '%no cumple el formato%' then raise; end if;
    v_ok := v_ok + 1;
  end;

  -- 6. y no dejó el catálogo a medias
  select count(*) into v_n from v_catalogo_vigente where catalogo = 'entidad_federativa';
  if v_n <> 2 then raise exception 'FALLA 6: la carga fallida dejó % valores', v_n; end if;
  v_ok := v_ok + 1;

  -- 7. claves repetidas: se rechaza
  begin
    perform public.reemplazar_valores_catalogo('entidad_federativa',
      '[{"clave":"14","descripcion":"Jalisco"},{"clave":"14","descripcion":"Jalisco bis"}]'::jsonb);
    raise exception 'FALLA 7: aceptó claves repetidas';
  exception when others then
    if sqlerrm not like '%repetidas%' then raise; end if;
    v_ok := v_ok + 1;
  end;

  -- 8. valor sin descripción: se rechaza
  begin
    perform public.reemplazar_valores_catalogo('entidad_federativa',
      '[{"clave":"14","descripcion":""}]'::jsonb);
    raise exception 'FALLA 8: aceptó un valor sin descripción';
  exception when others then
    if sqlerrm not like '%sin descripción%' then raise; end if;
    v_ok := v_ok + 1;
  end;

  -- 9. catálogo inexistente
  begin
    perform public.reemplazar_valores_catalogo('no_existe',
      '[{"clave":"1","descripcion":"x"}]'::jsonb);
    raise exception 'FALLA 9: cargó un catálogo inexistente';
  exception when others then
    if sqlerrm not like '%No existe el catálogo%' then raise; end if;
    v_ok := v_ok + 1;
  end;

  -- 10. reemplazo: la versión nueva sustituye, la vieja NO se borra
  select public.reemplazar_valores_catalogo('entidad_federativa',
    '[{"clave":"14","descripcion":"Jalisco"},{"clave":"15","descripcion":"Estado de Mexico"}]'::jsonb)
    into v_n;
  select count(*) into v_n from v_catalogo_vigente where catalogo = 'entidad_federativa';
  if v_n <> 2 then raise exception 'FALLA 10: quedaron % valores vigentes', v_n; end if;
  if not exists (select 1 from catalogo_valor cv join catalogo_sat c on c.id = cv.catalogo_id
                  where c.codigo = 'entidad_federativa' and cv.clave = '9'
                    and cv.vigente_hasta is not null) then
    raise exception 'FALLA 10b: la clave 9 se borró en vez de cerrarse';
  end if;
  v_ok := v_ok + 1;

  -- 11. la versión del catálogo subió
  select version into v_n from catalogo_sat where codigo = 'entidad_federativa';
  if v_n <> 2 then raise exception 'FALLA 11: version = %', v_n; end if;
  v_ok := v_ok + 1;

  -- 12. una clave retirada ya no valida hoy
  if public.clave_valida_en_catalogo('entidad_federativa', '9') then
    raise exception 'FALLA 12: la clave retirada sigue validando';
  end if;
  v_ok := v_ok + 1;

  -- 12b. Reemplazar DOS VECES EL MISMO DÍA deja el primer valor con vigencia
  -- vacía: nunca estuvo vigente en ningún día completo. Es a propósito —una
  -- corrección hecha el mismo día no es historia—, pero la fila se conserva
  -- para la auditoría. Se documenta con una prueba para que no se “arregle”
  -- por accidente.
  select count(*) into v_n from catalogo_valor cv
    join catalogo_sat c on c.id = cv.catalogo_id
   where c.codigo = 'entidad_federativa' and cv.clave = '9'
     and cv.vigente_desde = cv.vigente_hasta;
  if v_n <> 1 then raise exception 'FALLA 12b: esperaba una vigencia vacía, hay %', v_n; end if;
  v_ok := v_ok + 1;

  -- 12c. Un catálogo cargado en una fecha anterior SÍ se reconstruye. Se simula
  -- insertando el valor con fecha vieja, que es lo que habría hecho una carga
  -- de hace diez días.
  insert into catalogo_valor (catalogo_id, clave, descripcion, orden, vigente_desde, version_carga)
  select c.id, '31', 'Yucatan (carga vieja)', 99, current_date - 10, 0
    from catalogo_sat c where c.codigo = 'entidad_federativa';
  if not public.clave_valida_en_catalogo('entidad_federativa', '31', current_date - 5) then
    raise exception 'FALLA 12c: no se ve el valor cargado hace diez días';
  end if;
  perform public.reemplazar_valores_catalogo('entidad_federativa',
    '[{"clave":"14","descripcion":"Jalisco"}]'::jsonb);
  if public.clave_valida_en_catalogo('entidad_federativa', '31') then
    raise exception 'FALLA 12c: la clave 31 sigue vigente tras el reemplazo';
  end if;
  if not public.clave_valida_en_catalogo('entidad_federativa', '31', current_date - 5) then
    raise exception 'FALLA 12c: se perdió el catálogo de hace cinco días';
  end if;
  v_ok := v_ok + 1;

  -- 13. un catálogo sin cargar no valida nada (no se puede afirmar contra lo
  -- que no se tiene). Se usa el de códigos postales porque es el único que el
  -- seed deja vacío a propósito: se carga desde la consola.
  if public.clave_valida_en_catalogo('codigos_postales_de_sepomex', '44100') then
    raise exception 'FALLA 13: validó contra un catálogo vacío';
  end if;
  v_ok := v_ok + 1;

  -- 14. carga vacía: se rechaza
  begin
    perform public.reemplazar_valores_catalogo('entidad_federativa', '[]'::jsonb);
    raise exception 'FALLA 14: aceptó una carga vacía';
  exception when others then
    if sqlerrm not like '%sin valores%' then raise; end if;
    v_ok := v_ok + 1;
  end;

  raise notice 'OK · % pruebas pasaron', v_ok;
end $$;

-- Deja el harness como estaba.
create or replace function public.es_admin_kawiil() returns boolean
language sql stable security definer set search_path = public as $f$
  select exists (select 1 from platform_admin where user_id = auth.uid())
$f$;
