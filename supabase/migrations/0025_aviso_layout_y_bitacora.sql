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
