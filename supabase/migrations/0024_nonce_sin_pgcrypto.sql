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
