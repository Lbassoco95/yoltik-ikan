-- =====================================================================
-- Ikán · Migration 0021 · Bitácora encadenada (RCG0.B8.1)
-- =====================================================================
-- Qué resuelve: hoy la evidencia está repartida —`audit_log`,
-- `hallazgo_bitacora`, `lista_movimiento`— y varias acciones no dejan rastro.
-- Aquí queda UN flujo canónico de eventos, encadenado por hashes, del que se
-- puede demostrar ante un tercero que no se alteró.
--
-- Lo que esta migration SÍ garantiza:
--   Borrar o modificar un evento pasado ROMPE la cadena y se detecta
--   recalculando. Nadie puede reescribir la historia sin dejar la rotura.
--
-- Lo que NO garantiza, y hay que decirlo:
--   Que el dato capturado sea VERDADERO. Una cadena certifica lo que le
--   entregaron. Si el operador capturó un monto falso, queda un monto falso
--   certificado. Prometer lo contrario en un producto de cumplimiento es un
--   pasivo, no un argumento.
--
--   Tampoco prueba, por sí sola, que NOSOTROS no reescribimos la cadena
--   entera: es una cadena dentro de la base que administramos. Eso lo cierra
--   el anclaje externo de raíces Merkle (bloque B8.2, OpenTimestamps).
--
-- Ver docs/TRAZABILIDAD_Y_ANCLAJE.md.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. JSON canónico
-- ---------------------------------------------------------------------
-- El hash se calcula sobre TEXTO, así que ese texto tiene que ser único para
-- un contenido dado: si el mismo evento pudiera serializarse de dos maneras,
-- dos hashes distintos describirían lo mismo y la verificación no querría
-- decir nada. Claves ordenadas, sin espacios, recursivo.
--
-- En plpgsql y no en SQL porque la función se llama a sí misma y el validador
-- de cuerpos SQL la rechazaría al crearla.
create or replace function public.json_canonico(p jsonb)
returns text language plpgsql immutable as $$
declare
  v_partes text[];
  v_k text;
  v_e jsonb;
begin
  if p is null then return 'null'; end if;

  case jsonb_typeof(p)
    when 'object' then
      v_partes := '{}';
      for v_k in select k from jsonb_object_keys(p) k order by k collate "C" loop
        v_partes := v_partes || (to_json(v_k)::text || ':' || public.json_canonico(p -> v_k));
      end loop;
      return '{' || array_to_string(v_partes, ',') || '}';
    when 'array' then
      v_partes := '{}';
      for v_e in select e from jsonb_array_elements(p) e loop
        v_partes := v_partes || public.json_canonico(v_e);
      end loop;
      return '[' || array_to_string(v_partes, ',') || ']';
    else
      -- Escalares: jsonb ya los imprime en su forma mínima ("texto", 12.5,
      -- true, null).
      return p::text;
  end case;
end $$;

comment on function public.json_canonico(jsonb) is
  'JSON con claves ordenadas y sin espacios. Determinista: es lo que se hashea.';

-- ---------------------------------------------------------------------
-- 2. Cabeza de la cadena
-- ---------------------------------------------------------------------
-- Una cadena por organización, más una de plataforma (UUID de ceros) para lo
-- que Kawiil hace y afecta a todos: catálogos, listas, parámetros. Separarlas
-- permite que una organización verifique la suya sin ver las demás, y que el
-- paquete de verificación de un cliente no filtre el volumen de otro.
--
-- Sin llave foránea a propósito: si una organización se borra, su bitácora
-- tiene que sobrevivir. Un rastro de auditoría que desaparece con lo auditado
-- no es un rastro de auditoría.
create table if not exists cadena_auditoria (
  organization_id uuid primary key,
  ultima_secuencia bigint not null default 0,
  -- 64 ceros es el hash de génesis: la cadena vacía.
  ultimo_hash text not null default repeat('0', 64),
  actualizado_en timestamptz not null default now()
);

comment on table cadena_auditoria is
  'Cabeza de cada cadena de eventos. organization_id = 00000000-...-0 es la cadena de plataforma (Kawiil).';

-- ---------------------------------------------------------------------
-- 3. Los eventos
-- ---------------------------------------------------------------------
create table if not exists evento_auditoria (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  -- Posición dentro de SU cadena. Empieza en 1.
  secuencia bigint not null,

  tipo text not null,
  entidad text not null,
  entidad_id uuid,

  -- De dónde viene el evento. Es lo que vuelve el registro utilizable como
  -- evidencia: no basta el dato, hace falta saber quién y qué lo produjo.
  actor_tipo text not null check (actor_tipo in ('persona', 'motor', 'job', 'sistema')),
  actor_id uuid,
  -- Versiones vigentes al momento (motor, catálogos, parámetros). Lo que
  -- permite juzgar un acto de 2025 con las reglas de 2025.
  versiones jsonb not null default '{}'::jsonb,

  -- Texto exacto que se hashea. Es la fuente de verdad del evento; `payload`
  -- se deriva de él para poder consultarlo, y por eso no pueden discrepar.
  payload_canonico text not null,
  payload jsonb generated always as (payload_canonico::jsonb) stored,

  -- Aleatorio por evento. Sin él, el hash de un evento con pocos campos
  -- posibles se rompe probando combinaciones.
  nonce text not null,

  evento_hash text not null,
  cadena_hash text not null,
  hash_anterior text not null,

  registrado_en timestamptz not null default now(),

  unique (organization_id, secuencia)
);

create index if not exists idx_evento_org_secuencia on evento_auditoria(organization_id, secuencia desc);
create index if not exists idx_evento_entidad on evento_auditoria(entidad, entidad_id);
create index if not exists idx_evento_tipo on evento_auditoria(organization_id, tipo, registrado_en desc);

comment on column evento_auditoria.payload_canonico is
  'Texto exacto sobre el que se calculó evento_hash. No se recalcula al verificar: se hashea tal cual.';
comment on column evento_auditoria.cadena_hash is
  'SHA-256 de (hash_anterior || evento_hash || secuencia). Rompe si se altera cualquier evento previo.';

-- Append-only, sin excepciones. En las listas se permitió deshacer una carga
-- equivocada porque ahí existe el concepto de "carga"; aquí no: una corrección
-- es un evento nuevo, nunca la edición de uno viejo.
create or replace function public.evento_auditoria_inmutable()
returns trigger language plpgsql as $$
begin
  raise exception 'La bitácora es de sólo escritura: un evento no se modifica ni se borra. Registra uno nuevo que corrija.';
end $$;

drop trigger if exists trg_evento_inmutable on evento_auditoria;
create trigger trg_evento_inmutable
  before update or delete on evento_auditoria
  for each row execute function public.evento_auditoria_inmutable();

-- ---------------------------------------------------------------------
-- 4. Registrar un evento
-- ---------------------------------------------------------------------
/**
 * Agrega un evento al final de la cadena de su organización.
 *
 * Toma el candado de la cabeza para que dos escrituras simultáneas no reciban
 * la misma secuencia: si eso pasara, la cadena tendría dos ramas y la
 * verificación sería ambigua. Serializa los eventos de UNA organización, no de
 * todas.
 */
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
  v_nonce := encode(gen_random_bytes(16), 'hex');

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

-- ---------------------------------------------------------------------
-- 5. Verificar
-- ---------------------------------------------------------------------
/**
 * Recorre la cadena de una organización y devuelve la PRIMERA rotura.
 *
 * Sin filas = íntegra. Comprueba tres cosas distintas, porque fallan por
 * razones distintas: que el hash del evento corresponda a su contenido, que el
 * eslabón corresponda al anterior, y que no falten secuencias.
 */
create or replace function public.verificar_cadena(p_organization_id uuid)
returns table (secuencia bigint, evento_id uuid, motivo text)
language plpgsql stable as $$
declare
  r record;
  v_esperado_anterior text := repeat('0', 64);
  v_esperada_secuencia bigint := 1;
  v_evento_hash text;
  v_cadena_hash text;
begin
  -- Sin SECURITY DEFINER a propósito: la verificación corre con los permisos
  -- de quien pregunta, así que nadie audita una cadena ajena. Pero entonces
  -- una cadena invisible se vería vacía, y "vacía" se reportaría como
  -- "íntegra". Decirle a alguien que la cadena de otra organización está
  -- íntegra sería afirmar algo que no se comprobó.
  if not exists (select 1 from cadena_auditoria where organization_id = p_organization_id) then
    raise exception 'No hay una cadena visible para esa organización: nada que verificar';
  end if;

  for r in
    select * from evento_auditoria
     where organization_id = p_organization_id
     order by secuencia
  loop
    if r.secuencia <> v_esperada_secuencia then
      secuencia := r.secuencia; evento_id := r.id;
      motivo := format('falta la secuencia %s: hay un hueco en la cadena', v_esperada_secuencia);
      return next; return;
    end if;

    v_evento_hash := encode(sha256(convert_to(r.payload_canonico || '|' || r.nonce, 'UTF8')), 'hex');
    if v_evento_hash <> r.evento_hash then
      secuencia := r.secuencia; evento_id := r.id;
      motivo := 'el contenido del evento no corresponde a su hash: se alteró el payload';
      return next; return;
    end if;

    if r.hash_anterior <> v_esperado_anterior then
      secuencia := r.secuencia; evento_id := r.id;
      motivo := 'el eslabón no apunta al evento previo: se borró o se insertó un evento';
      return next; return;
    end if;

    v_cadena_hash := encode(
      sha256(convert_to(r.hash_anterior || '|' || r.evento_hash || '|' || r.secuencia::text, 'UTF8')), 'hex');
    if v_cadena_hash <> r.cadena_hash then
      secuencia := r.secuencia; evento_id := r.id;
      motivo := 'el eslabón no corresponde a sus partes: se alteró el encadenamiento';
      return next; return;
    end if;

    v_esperado_anterior := r.cadena_hash;
    v_esperada_secuencia := v_esperada_secuencia + 1;
  end loop;

  -- La cabeza tiene que coincidir con el último eslabón: si no, se truncó la
  -- cadena por el final, que es la manipulación que no rompe ningún eslabón.
  if exists (
    select 1 from cadena_auditoria c
     where c.organization_id = p_organization_id
       and (c.ultimo_hash <> v_esperado_anterior or c.ultima_secuencia <> v_esperada_secuencia - 1)
  ) then
    secuencia := v_esperada_secuencia - 1; evento_id := null;
    motivo := 'la cabeza de la cadena no coincide con el último evento: se truncó por el final';
    return next; return;
  end if;

  return;
end $$;

comment on function public.verificar_cadena(uuid) is
  'Devuelve la primera rotura de la cadena, o ninguna fila si está íntegra.';

-- ---------------------------------------------------------------------
-- 6. Emisores automáticos
-- ---------------------------------------------------------------------
-- Los eventos se emiten desde TRIGGERS, no desde el código de la aplicación.
-- Si dependieran de que alguien se acuerde de llamar a una función, tarde o
-- temprano una ruta nueva se olvidaría de hacerlo y el hueco no se notaría
-- hasta que alguien buscara ese evento y no estuviera.
create or replace function public.emitir_evento_de_tabla()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_fila jsonb := to_jsonb(coalesce(new, old));
  v_org uuid;
  v_tipo text;
begin
  v_org := coalesce((v_fila ->> 'organization_id')::uuid,
                    '00000000-0000-0000-0000-000000000000'::uuid);
  v_tipo := TG_ARGV[0] || '.' || lower(TG_OP);

  perform public.registrar_evento(
    v_org,
    v_tipo,
    TG_ARGV[0],
    (v_fila ->> 'id')::uuid,
    v_fila,
    coalesce(TG_ARGV[1], 'persona')
  );
  return coalesce(new, old);
end $$;

drop trigger if exists trg_evento_client on client;
create trigger trg_evento_client after insert or update on client
  for each row execute function public.emitir_evento_de_tabla('client');

drop trigger if exists trg_evento_operation on operation;
create trigger trg_evento_operation after insert or update on operation
  for each row execute function public.emitir_evento_de_tabla('operation');

drop trigger if exists trg_evento_hallazgo on hallazgo;
create trigger trg_evento_hallazgo after insert or update on hallazgo
  for each row execute function public.emitir_evento_de_tabla('hallazgo', 'motor');

drop trigger if exists trg_evento_hallazgo_bitacora on hallazgo_bitacora;
create trigger trg_evento_hallazgo_bitacora after insert on hallazgo_bitacora
  for each row execute function public.emitir_evento_de_tabla('hallazgo_bitacora');

-- Lo de plataforma va a la cadena de Kawiil: no tienen organization_id y
-- afectan a todos los clientes a la vez.
drop trigger if exists trg_evento_catalogo_valor on catalogo_valor;
create trigger trg_evento_catalogo_valor after insert or update on catalogo_valor
  for each row execute function public.emitir_evento_de_tabla('catalogo_valor', 'sistema');

drop trigger if exists trg_evento_lista_movimiento on lista_movimiento;
create trigger trg_evento_lista_movimiento after insert on lista_movimiento
  for each row execute function public.emitir_evento_de_tabla('lista_movimiento', 'sistema');

drop trigger if exists trg_evento_parametro on parametro_regulatorio;
create trigger trg_evento_parametro after insert or update on parametro_regulatorio
  for each row execute function public.emitir_evento_de_tabla('parametro_regulatorio', 'sistema');

-- ---------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------
-- Se LEE con rol de OC o admin de la propia organización; la de plataforma
-- sólo Kawiil. NADIE escribe directo: sólo los triggers y la función, que son
-- security definer.
alter table evento_auditoria enable row level security;
alter table cadena_auditoria enable row level security;

drop policy if exists "evento_select" on evento_auditoria;
create policy "evento_select" on evento_auditoria
  for select using (
    (organization_id = public.current_org_id()
      and (public.has_rol('oc') or public.has_rol('admin')))
    or public.es_admin_kawiil()
  );

drop policy if exists "cadena_select" on cadena_auditoria;
create policy "cadena_select" on cadena_auditoria
  for select using (
    (organization_id = public.current_org_id()
      and (public.has_rol('oc') or public.has_rol('admin')))
    or public.es_admin_kawiil()
  );

-- PostgreSQL otorga EXECUTE a PUBLIC en cada función nueva. Con una función
-- SECURITY DEFINER eso significa que cualquier usuario autenticado la puede
-- llamar CON LOS PERMISOS DEL DUEÑO. En `registrar_evento` eso sería fatal: un
-- cliente podría fabricar eventos en la cadena de cualquier organización, que
-- es exactamente lo que la bitácora existe para impedir.
--
-- Y con PUBLIC no basta. Supabase deja puesto un ALTER DEFAULT PRIVILEGES que
-- otorga EXECUTE a `anon`, `authenticated` y `service_role` sobre TODA función
-- nueva del esquema `public`. Ese grant es directo al rol, así que revocar de
-- PUBLIC no lo toca: la función sigue siendo llamable. La primera versión de
-- esta migration hacía justo eso y su propia verificación la rechazó al
-- aplicarla en producción — de ahí que haya que nombrar los roles uno por uno.
--
-- `service_role` se deja: ya salta RLS por diseño y es el rol de servidor de
-- confianza, así que quitarle EXECUTE no protege de nada y sí puede romper una
-- Edge Function el día que la haya.
--
-- REGLA para lo que venga: toda función SECURITY DEFINER que no compruebe
-- permisos por dentro necesita su revoke EXPLÍCITO a public, anon y
-- authenticated. No alcanza con "no otorgarla".
revoke all on function public.registrar_evento(uuid, text, text, uuid, jsonb, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.emitir_evento_de_tabla() from public, anon, authenticated;

-- Mismo problema, encontrado al revisar: `emitir_folio_hallazgo` es SECURITY
-- DEFINER, no comprueba nada y estaba abierta a cualquiera —además con grants
-- directos a anon y authenticated de antes—. Sólo la llama el trigger
-- `trg_emitir_folio`; nadie la invoca desde la aplicación. Quien la llamara
-- podía consumir folios de la secuencia de OTRA organización y abrir huecos en
-- una numeración que se supone continua.
revoke all on function public.emitir_folio_hallazgo(uuid) from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on evento_auditoria, cadena_auditoria to authenticated;
    grant execute on function public.verificar_cadena(uuid) to authenticated;
    grant execute on function public.json_canonico(jsonb) to authenticated;
    -- registrar_evento NO se otorga: los eventos los emiten los triggers.
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on evento_auditoria, cadena_auditoria from anon;
  end if;
end $$;
