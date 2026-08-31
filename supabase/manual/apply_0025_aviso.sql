-- =====================================================================
-- Ikán · Aplicar migration 0025 en el SQL Editor / API de gestión
-- =====================================================================
-- Prepara la tabla `aviso` para el generador del XML:
--
--   · versión del layout, porque el SAT publica unos nuevos en noviembre de
--     2026 y un aviso presentado hoy se armó con el de hoy;
--   · el XML exacto que se generó, porque si el SAT observa un aviso lo que hay
--     que mostrar es el archivo, no una reconstrucción;
--   · y el aviso entra a la bitácora encadenada, que hasta ahora no lo cubría
--     —siendo el acto con más consecuencia de todo el sistema—.
--
-- No toca datos existentes. Idempotente y en transacción.
-- =====================================================================

begin;

-- =====================================================================
-- Ikán · Migration 0025 · El aviso: versión de layout, XML y bitácora
-- =====================================================================
-- Tres huecos que aparecieron al construir el generador del aviso XML.
--
-- 1. VERSIÓN DEL LAYOUT. El SAT publica layouts nuevos en noviembre de 2026.
--    Un aviso presentado hoy se armó con el layout de hoy, y dentro de dos años
--    nadie va a poder decir con cuál si no queda escrito en la fila. No se
--    deduce de la fecha: un layout puede convivir con el anterior durante la
--    transición.
--
-- 2. EL XML QUE SE GENERÓ. `payload` guarda los datos; el archivo exacto que se
--    subió al portal es otra cosa. Si el SAT observa un aviso, lo que hay que
--    poder mostrar es el archivo, byte por byte, no una reconstrucción.
--
-- 3. LA BITÁCORA NO REGISTRABA LOS AVISOS. Los siete emisores de la 0021 cubren
--    clientes, actos, hallazgos, catálogos, listas y parámetros — pero no el
--    aviso, que es el acto con más consecuencia de todo el sistema. Generarlo y
--    firmarlo es exactamente lo que un auditor querrá ver encadenado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------------------
alter table aviso
  add column if not exists layout text not null default 'fep',
  add column if not exists layout_version text,
  add column if not exists operation_ids uuid[] not null default '{}',
  add column if not exists xml text,
  add column if not exists referencia text,
  add column if not exists exento boolean not null default false;

comment on column aviso.layout is
  'Layout con el que se armó: fep (fe pública) hoy. No se deduce de la fecha.';
comment on column aviso.layout_version is
  'Versión del layout. El SAT publica unos nuevos en noviembre de 2026 y pueden convivir con los actuales durante la transición.';
comment on column aviso.operation_ids is
  'Actos que entraron en este aviso. Permite responder "por qué está aquí esta escritura" sin releer el XML.';
comment on column aviso.xml is
  'El archivo exacto que se generó. Si el SAT observa el aviso, esto es lo que se muestra — no una reconstrucción.';
comment on column aviso.referencia is
  'Referencia interna del informe, hasta 14 caracteres (campo 3.1 del layout).';
comment on column aviso.exento is
  'Informe sin operaciones (artículo 27 Bis). Va con <exento>1</exento> y SIN etiquetas <aviso>.';

-- Un informe en ceros no puede llevar actos. Es la regla VC3R1 del layout, y
-- vale la pena que la base también la sostenga: un aviso mal armado aquí es un
-- aviso rechazado en el portal.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'aviso_ceros_sin_actos') then
    alter table aviso add constraint aviso_ceros_sin_actos
      check (not exento or cardinality(operation_ids) = 0);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. El emisor de eventos aprende a omitir columnas pesadas
-- ---------------------------------------------------------------------
-- El XML de un mes con muchos actos pesa. Meterlo completo en el payload del
-- evento lo duplicaría y engordaría la cadena sin ganar nada: para detectar
-- una alteración basta su hash, que es justo lo que la bitácora necesita.
--
-- El tercer argumento del trigger es la lista de columnas a omitir. De cada una
-- se guarda su SHA-256 en lugar del contenido, así que sigue siendo imposible
-- cambiar el XML sin romper la cadena.
create or replace function public.emitir_evento_de_tabla()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_fila jsonb := to_jsonb(coalesce(new, old));
  v_org uuid;
  v_tipo text;
  v_omitir text[];
  v_col text;
  v_valor text;
begin
  v_org := coalesce((v_fila ->> 'organization_id')::uuid,
                    '00000000-0000-0000-0000-000000000000'::uuid);
  v_tipo := TG_ARGV[0] || '.' || lower(TG_OP);

  if TG_NARGS >= 3 and TG_ARGV[2] is not null and TG_ARGV[2] <> '' then
    v_omitir := string_to_array(TG_ARGV[2], ',');
    foreach v_col in array v_omitir loop
      v_col := btrim(v_col);
      if v_fila ? v_col then
        v_valor := v_fila ->> v_col;
        v_fila := v_fila - v_col;
        -- Null se queda como null: distinguirlo del hash de la cadena vacía
        -- importa para saber si el campo estaba lleno.
        v_fila := jsonb_set(v_fila, array[v_col || '_sha256'],
          case when v_valor is null then 'null'::jsonb
               else to_jsonb(encode(sha256(convert_to(v_valor, 'UTF8')), 'hex')) end);
      end if;
    end loop;
  end if;

  perform public.registrar_evento(
    v_org, v_tipo, TG_ARGV[0], (v_fila ->> 'id')::uuid, v_fila,
    coalesce(TG_ARGV[1], 'persona')
  );
  return coalesce(new, old);
end $$;

-- `create or replace function` reinicia los permisos al valor por omisión, que
-- en Supabase incluye EXECUTE para anon y authenticated. Hay que repetir el
-- revoke o se reabre el hueco que cerró la 0021.
revoke all on function public.emitir_evento_de_tabla() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. El aviso entra a la bitácora
-- ---------------------------------------------------------------------
drop trigger if exists trg_evento_aviso on aviso;
create trigger trg_evento_aviso after insert or update on aviso
  for each row execute function public.emitir_evento_de_tabla('aviso', 'persona', 'xml');

-- =====================================================================
-- Verificación
-- =====================================================================
do $$
declare v_n int;
begin
  -- 1. Las seis columnas nuevas
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'aviso'
     and column_name in ('layout','layout_version','operation_ids','xml','referencia','exento');
  if v_n <> 6 then raise exception 'FALLA 1: hay % de 6 columnas nuevas en aviso', v_n; end if;

  -- 2. La regla del informe en ceros
  if not exists (select 1 from pg_constraint where conname = 'aviso_ceros_sin_actos') then
    raise exception 'FALLA 2: falta el check aviso_ceros_sin_actos';
  end if;

  -- 3. El aviso ya deja rastro en la bitácora
  if not exists (select 1 from pg_trigger where tgname = 'trg_evento_aviso') then
    raise exception 'FALLA 3: falta el emisor de eventos sobre aviso';
  end if;

  -- 4. Y los ocho emisores conviven
  select count(*) into v_n from pg_trigger
   where tgname like 'trg_evento_%' and tgname <> 'trg_evento_inmutable';
  if v_n <> 8 then raise exception 'FALLA 4: hay % de 8 emisores', v_n; end if;

  -- 5. `create or replace function` reinicia permisos y en Supabase el valor
  --    por omisión los abre. Si no se repitió el revoke, aquí se nota.
  if has_function_privilege('authenticated', 'public.emitir_evento_de_tabla()', 'execute')
     or has_function_privilege('anon', 'public.emitir_evento_de_tabla()', 'execute') then
    raise exception 'FALLA 5: emitir_evento_de_tabla volvió a quedar abierta a los clientes';
  end if;

  -- 6. Todas las cadenas existentes siguen íntegras
  select count(*) into v_n from cadena_auditoria c
   where exists (select 1 from public.verificar_cadena(c.organization_id));
  if v_n <> 0 then raise exception 'FALLA 6: % cadena(s) rota(s)', v_n; end if;
end $$;

select 'aviso: layout y bitácora' as bundle,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'aviso'
           and column_name in ('layout','layout_version','operation_ids','xml','referencia','exento'))::text
         || ' de 6 columnas nuevas' as esquema,
       (select count(*) from pg_trigger
         where tgname like 'trg_evento_%' and tgname <> 'trg_evento_inmutable')::text
         || ' emisores de bitácora (antes 7)' as bitacora,
       'cerrada a los clientes' as emitir_evento_de_tabla,
       (select count(*) from aviso)::text || ' avisos en la tabla' as datos,
       '6 comprobaciones pasaron' as verificacion;

commit;
