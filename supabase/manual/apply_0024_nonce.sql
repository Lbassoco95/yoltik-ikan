-- =====================================================================
-- Ikán · Aplicar migration 0024 en el SQL Editor / API de gestión
-- =====================================================================
-- URGENTE. Mientras esto no corra, la base NO ACEPTA ALTAS: la bitácora de la
-- 0021 cuelga de siete triggers —client, operation, hallazgo,
-- hallazgo_bitacora, catalogo_valor, lista_movimiento y parametro_regulatorio—
-- y su función revienta, así que revienta el INSERT que la disparó. No es que
-- no se registre el evento: es que no se registra el compareciente.
--
-- Causa: el nonce salía de `gen_random_bytes()`, de pgcrypto. En Supabase esa
-- extensión vive en el esquema `extensions` y la función corre con
-- `search_path = public`, así que no la ve. En un PostgreSQL común pgcrypto
-- cae en `public`, y por eso las pruebas locales no lo detectaron.
--
-- El arreglo quita la dependencia en vez de calificar el esquema:
-- `gen_random_uuid()` vive en pg_catalog desde PostgreSQL 13 y siempre es
-- visible.
--
-- Los eventos ya registrados NO se tocan: su nonce viejo sigue siendo válido y
-- la cadena sigue verificando.
--
-- Idempotente y en transacción.
-- =====================================================================

begin;

-- =====================================================================
-- Ikán · Migration 0024 · Quitar la dependencia de pgcrypto en la bitácora
-- =====================================================================
-- URGENTE cuando se aplica: mientras `registrar_evento` no exista corregida,
-- la base NO ACEPTA altas. La bitácora cuelga de siete triggers —client,
-- operation, hallazgo, hallazgo_bitacora, catalogo_valor, lista_movimiento y
-- parametro_regulatorio— y si la función revienta, revienta el INSERT que la
-- disparó. No es que no se registre el evento: es que no se registra el
-- compareciente.
--
-- Qué pasó: la 0021 armaba el nonce con `gen_random_bytes(16)`, de pgcrypto.
-- En Supabase esa extensión vive en el esquema `extensions`, y la función tiene
-- `search_path = ''`, así que no la veía. En un PostgreSQL común pgcrypto cae
-- en `public` y por eso las pruebas locales no lo detectaron: el entorno de
-- prueba era más permisivo que el real.
--
-- El arreglo no califica el esquema ni lo agrega al search_path —las dos
-- opciones atan el código a cómo Supabase acomoda sus extensiones—: quita la
-- dependencia. `gen_random_uuid()` vive en pg_catalog desde PostgreSQL 13 y
-- siempre es visible.
--
-- La 0021 quedó corregida también, para que una base nueva no nazca rota. Esta
-- migration existe para las que ya la tienen aplicada.
--
-- Los eventos ya registrados NO se tocan: su nonce viejo sigue siendo válido y
-- la cadena sigue verificando. El formato del nonce no entra en el hash, sólo
-- su valor.
-- =====================================================================

create or replace function public.registrar_evento(
  p_organization_id uuid,
  p_tipo text,
  p_entidad text,
  p_entidad_id uuid,
  p_payload jsonb,
  p_actor_tipo text default 'persona',
  p_actor_id uuid default null,
  p_versiones jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_secuencia bigint;
  v_anterior text;
  v_canonico text;
  v_nonce text;
  v_evento_hash text;
  v_cadena_hash text;
  v_id uuid;
begin
  insert into cadena_auditoria (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  select ultima_secuencia + 1, ultimo_hash
    into v_secuencia, v_anterior
    from cadena_auditoria
   where organization_id = p_organization_id
     for update;

  v_canonico := public.json_canonico(coalesce(p_payload, '{}'::jsonb));

  -- pg_catalog, no pgcrypto. Ver el encabezado.
  v_nonce := replace(gen_random_uuid()::text, '-', '');

  -- sha256() también es de pg_catalog desde PostgreSQL 11: no hay que tocarla.
  v_evento_hash := encode(sha256(convert_to(v_canonico || '|' || v_nonce, 'UTF8')), 'hex');
  v_cadena_hash := encode(
    sha256(convert_to(v_anterior || '|' || v_evento_hash || '|' || v_secuencia::text, 'UTF8')), 'hex');

  insert into evento_auditoria (
    organization_id, secuencia, tipo, entidad, entidad_id,
    actor_tipo, actor_id, versiones,
    payload_canonico, nonce, evento_hash, cadena_hash, hash_anterior
  ) values (
    p_organization_id, v_secuencia, p_tipo, p_entidad, p_entidad_id,
    p_actor_tipo, coalesce(p_actor_id, auth.uid()), coalesce(p_versiones, '{}'::jsonb),
    v_canonico, v_nonce, v_evento_hash, v_cadena_hash, v_anterior
  ) returning id into v_id;

  update cadena_auditoria
     set ultima_secuencia = v_secuencia,
         ultimo_hash = v_cadena_hash,
         actualizado_en = now()
   where organization_id = p_organization_id;

  return v_id;
end $$;

-- `create or replace function` REINICIA los permisos al valor por omisión, y en
-- Supabase ese valor incluye EXECUTE para anon y authenticated (hay un ALTER
-- DEFAULT PRIVILEGES puesto). Sin repetir el revoke, esta migration reabriría
-- justo el hueco que cerró la 0021: un cliente podría fabricar eventos en la
-- cadena de cualquier organización.
revoke all on function public.registrar_evento(uuid, text, text, uuid, jsonb, text, uuid, jsonb)
  from public, anon, authenticated;

-- =====================================================================
-- Verificación
-- =====================================================================
do $$
declare
  v_id uuid;
  v_org constant uuid := '00000000-0000-0000-0000-000000000000';
  v_antes bigint;
  v_txt text;
begin
  -- 1. La prueba de verdad: registrar un evento. Si pgcrypto sigue estorbando,
  --    esto revienta aquí y no en la siguiente alta de un cliente real.
  select coalesce(max(ultima_secuencia), 0) into v_antes
    from cadena_auditoria where organization_id = v_org;

  select public.registrar_evento(
    v_org, 'verificacion.0024', 'migration', null,
    jsonb_build_object('nota', 'prueba de que el nonce ya no depende de pgcrypto')
  ) into v_id;

  if v_id is null then raise exception 'FALLA 1: registrar_evento no devolvió id'; end if;

  -- 2. El nonce tiene la forma esperada: 32 hexadecimales.
  select nonce into v_txt from evento_auditoria where id = v_id;
  if v_txt !~ '^[0-9a-f]{32}$' then
    raise exception 'FALLA 2: el nonce no son 32 hexadecimales (%)', v_txt;
  end if;

  -- 3. La cadena sigue íntegra mezclando nonces de los dos formatos.
  select motivo into v_txt from public.verificar_cadena(v_org) limit 1;
  if v_txt is not null then
    raise exception 'FALLA 3: la cadena quedó rota: %', v_txt;
  end if;

  -- 4. `create or replace function` reinicia permisos, y en Supabase el valor
  --    por omisión incluye EXECUTE para anon y authenticated. Si el revoke no
  --    se repitió, aquí se nota.
  if has_function_privilege('authenticated',
       'public.registrar_evento(uuid,text,text,uuid,jsonb,text,uuid,jsonb)', 'execute')
     or has_function_privilege('anon',
       'public.registrar_evento(uuid,text,text,uuid,jsonb,text,uuid,jsonb)', 'execute') then
    raise exception 'FALLA 4: registrar_evento volvió a quedar abierta a los clientes';
  end if;
end $$;

select 'nonce sin pgcrypto' as bundle,
       'registra eventos sin pgcrypto' as prueba,
       (select count(*) from evento_auditoria
         where tipo = 'verificacion.0024')::text || ' evento(s) de prueba' as escritos,
       (select coalesce((select motivo from public.verificar_cadena(
                 '00000000-0000-0000-0000-000000000000'::uuid) limit 1), 'íntegra')) as cadena,
       'cerrada a los clientes' as registrar_evento,
       '4 comprobaciones pasaron' as verificacion;

commit;
