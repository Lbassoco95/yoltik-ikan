-- =====================================================================
-- Ikán · Migration 0015 · Carga de archivo para listas de snapshot
-- =====================================================================
-- La 0012 dejó lista la captura por oficio (UIF). Falta la otra mitad: las
-- fuentes que publican un ARCHIVO COMPLETO (OFAC, ONU, UE, 69-B, 69-B Bis).
--
-- ---------------------------------------------------------------------
-- El problema del alcance, que no es obvio
-- ---------------------------------------------------------------------
-- En una fuente de snapshot, "lo que ya no viene en el archivo se da de baja".
-- Pero eso SÓLO es cierto si el archivo es el listado COMPLETO.
--
-- El SAT publica el 69-B en cinco archivos: uno completo y cuatro por
-- situación. Si alguien sube "Definitivos.xls" y el sistema aplicara la
-- diferencia, daría de baja a los 838 presuntos, los 340 desvirtuados y las
-- 1,666 sentencias favorables, que no están ahí porque van en otro archivo,
-- no porque hayan salido de la lista. Sería una pérdida de datos silenciosa
-- y con consecuencias: alguien dejaría de aparecer sin que nadie lo decidiera.
--
-- Por eso cada carga declara su ALCANCE:
--   'completa'  el archivo es el universo de la fuente → se aplica la
--               diferencia y se desactiva lo ausente.
--   'parcial'   el archivo es un subconjunto → sólo agrega y actualiza.
--               Nunca da de baja.
--
-- Ante la duda, 'parcial': dejar de más es recuperable, dar de baja de menos
-- a alguien que sigue sancionado no lo es.
-- =====================================================================

do $$ begin
  create type alcance_carga_lista as enum ('completa', 'parcial');
exception when duplicate_object then null; end $$;

alter table lista_carga
  add column if not exists alcance alcance_carga_lista not null default 'parcial',
  add column if not exists archivo_nombre text,
  add column if not exists registros_desactivados int not null default 0;

comment on column lista_carga.alcance is
  'completa = el archivo es el universo de la fuente y se aplica la diferencia. parcial = sólo agrega y actualiza, nunca da de baja. Ante la duda, parcial.';
comment on column lista_carga.registros_desactivados is
  'Cuántos registros salieron de la lista al cerrar una carga completa. Cero en las parciales.';

-- ---------------------------------------------------------------------
-- Cerrar una carga completa: aplicar la diferencia
-- ---------------------------------------------------------------------
-- Se ejecuta DESPUÉS de insertar todos los movimientos, no por trigger: el
-- trigger corre por fila y no puede saber si el archivo terminó.
--
-- La salida se registra INSERTANDO un movimiento de baja, no actualizando el
-- registro a mano. La primera versión actualizaba directo y parecía funcionar:
-- el registro quedaba inactivo y la pantalla lo mostraba bien. Pero la
-- bitácora no se enteraba, así que `listado_en_fecha()` seguía diciendo que la
-- persona estaba listada después de haber salido. La evidencia histórica —que
-- es la razón de ser de todo este diseño— quedaba en silencio equivocada.
--
-- Con el movimiento, el trigger de la 0012 hace el trabajo y hay una sola
-- ruta de escritura. No borra: desactiva.
create or replace function public.cerrar_carga_completa(p_carga_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fuente uuid;
  v_alcance alcance_carga_lista;
  v_fecha date;
  v_desactivados int := 0;
begin
  if not public.es_admin_kawiil() then
    raise exception 'Sólo un administrador de Kawiil puede cerrar una carga de lista.';
  end if;

  select fuente_id, alcance into v_fuente, v_alcance
  from lista_carga where id = p_carga_id;

  if v_fuente is null then
    raise exception 'La carga % no existe.', p_carga_id;
  end if;

  -- Cerrar una parcial no es un error, simplemente no aplica diferencia.
  if v_alcance <> 'completa' then
    return 0;
  end if;

  select fecha_publicacion_fuente into v_fecha from lista_carga where id = p_carga_id;

  -- Los que seguían activos y no vinieron en este archivo.
  insert into lista_movimiento
    (carga_id, accion, tipo_entidad, nombre, rfc, curp, pais, situacion,
     oficio_numero, oficio_fecha, motivo)
  select p_carga_id, 'baja', r.tipo_entidad, r.nombre, r.rfc, r.curp, r.pais, r.situacion,
         'Ausente del listado completo', v_fecha,
         'Ya no aparece en el listado completo de la fuente'
  from lista_registro r
  where r.fuente_id = v_fuente
    and r.activo
    and not exists (
      select 1 from lista_movimiento m
      where m.carga_id = p_carga_id and m.registro_id = r.id
    );

  get diagnostics v_desactivados = row_count;

  update lista_carga set registros_desactivados = v_desactivados where id = p_carga_id;
  return v_desactivados;
end
$$;

comment on function public.cerrar_carga_completa(uuid) is
  'Aplica la diferencia de una carga completa: desactiva lo que la fuente ya no reporta. No borra. Devuelve cuántos salieron.';

revoke all on function public.cerrar_carga_completa(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.cerrar_carga_completa(uuid) to authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Bucket privado para el archivo original
-- ---------------------------------------------------------------------
-- Sin el archivo no hay evidencia de qué se cargó. Se guarda el original tal
-- cual lo publicó la autoridad, junto con su huella, para poder demostrar
-- después que el contenido no se alteró.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listas-archivos',
  'listas-archivos',
  false,
  157286400,  -- 150 MB: el SDN_ADVANCED de OFAC ronda los 126 MB
  array['text/csv', 'text/plain', 'application/xml', 'text/xml',
        'application/zip', 'application/vnd.ms-excel', 'application/octet-stream']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "listas_archivos_select" on storage.objects;
create policy "listas_archivos_select" on storage.objects
  for select using (bucket_id = 'listas-archivos' and public.es_admin_kawiil());

drop policy if exists "listas_archivos_insert" on storage.objects;
create policy "listas_archivos_insert" on storage.objects
  for insert with check (bucket_id = 'listas-archivos' and public.es_admin_kawiil());

-- ---------------------------------------------------------------------
-- Corrección de `listado_en_fecha` (nace en la 0012)
-- ---------------------------------------------------------------------
-- La versión original resolvía la fecha efectiva de un movimiento como
-- `coalesce(oficio_fecha, aplicado_en)`. Funciona para la captura por oficio,
-- donde cada movimiento trae su fecha. Pero en una carga de ARCHIVO no hay
-- oficio por fila: la fecha que vale es la de publicación del archivo, y con
-- el coalesce anterior se caía a `aplicado_en`, o sea a cuándo Kawiil lo
-- cargó.
--
-- El efecto era una inversión completa de la evidencia: un contribuyente
-- publicado en julio y retirado en octubre aparecía como NO listado en agosto
-- y SÍ listado en noviembre. Exactamente al revés.
--
-- Orden correcto: la fecha del oficio, si la hay; si no, la de publicación de
-- la fuente; y sólo como último recurso la de captura.
create or replace function public.listado_en_fecha(
  p_fuente text,
  p_fecha date,
  p_rfc text default null,
  p_nombre text default null
)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select m.accion = 'alta'
       from lista_movimiento m
       join lista_carga    c on c.id = m.carga_id
       join lista_registro r  on r.id = m.registro_id
       join lista_fuente   f  on f.id = r.fuente_id
      where f.codigo = p_fuente
        and (
          (p_rfc is not null and r.rfc = nullif(upper(btrim(p_rfc)), ''))
          or (p_rfc is null and p_nombre is not null
              and r.nombre_normalizado = public.normalizar_nombre(p_nombre))
        )
        and coalesce(m.oficio_fecha, c.fecha_publicacion_fuente, m.aplicado_en::date) <= p_fecha
      order by coalesce(m.oficio_fecha, c.fecha_publicacion_fuente, m.aplicado_en::date) desc,
               m.aplicado_en desc
      limit 1),
    false)
$$;

comment on function public.listado_en_fecha(text, date, text, text) is
  'Si una persona estaba en una lista en una fecha dada. La fecha efectiva es la del oficio, o la de publicación del archivo, nunca la de captura.';
