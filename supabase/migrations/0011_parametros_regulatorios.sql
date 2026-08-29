-- =====================================================================
-- Ikán · Migration 0011 · Parámetros regulatorios versionados
-- =====================================================================
-- Saca del código las cifras que fija una autoridad. Antes de esta
-- migration la UMA vivía en TRES constantes con DOS valores distintos:
--
--   src/lib/utils.ts                        UMA_MXN   = 113.07
--   supabase/functions/motor-pld/evaluadores.ts  UMA_MXN   = 113.07
--   src/data/_legacy_mock.ts                UMA_VALUE = 132.59  ← lo que veía el usuario
--
-- Ninguno de los dos era correcto (UMA 2025 = 113.14; UMA 2026 = 117.31),
-- así que el motor calculaba los umbrales por debajo del valor real.
--
-- Un parámetro es un valor CON VIGENCIA y CON FUENTE. La vigencia importa:
-- un acto de agosto de 2026 se juzga con la UMA de 2026 aunque la revisión
-- ocurra en 2029. Con una constante en código eso es irrecuperable.
--
-- Ámbito: catálogo de PLATAFORMA. Lo mantiene Kawiil (platform_admin de la
-- migration 0008) y lo consume toda organización sin importar su actividad.
-- No lleva organization_id a propósito.
-- =====================================================================

-- Necesaria para la restricción de no-traslape (gist sobre daterange + texto).
create extension if not exists btree_gist;

create table if not exists parametro_regulatorio (
  id uuid primary key default gen_random_uuid(),

  codigo text not null,
  nombre text not null,
  valor_numerico numeric(16,4) not null,
  unidad text not null check (unidad in ('mxn', 'uma', 'dia', 'anio', 'porcentaje')),

  -- Sector como TEXTO, no como el enum `sector_av`, por dos razones:
  --   1. '*' significa "aplica a todas las actividades" y el enum no lo admite.
  --   2. El cast enum→text no es utilizable con seguridad dentro de una
  --      restricción de exclusión; con texto la comparación es trivialmente
  --      inmutable. Aquí el sector es una etiqueta de alcance, no una FK.
  sector text not null default '*'
    check (sector in ('*', 'IV', 'V', 'VII', 'VIII', 'XII', 'XV', 'XVI')),

  vigente_desde date not null,
  vigente_hasta date,                      -- null = sigue vigente
  check (vigente_hasta is null or vigente_hasta > vigente_desde),

  -- Trazabilidad de dónde salió la cifra. Sin fuente no se siembra.
  fuente text not null,
  publicacion_dof text,
  url_fuente text,

  -- Kawiil-Cumplimiento valida antes de que el motor use el valor. Un
  -- parámetro sin confirmar SÍ se puede sembrar y mostrar, pero la UI debe
  -- marcarlo (misma regla que los umbrales de la fracción XII, que viajan
  -- como "referencia sujeta a confirmación" desde que se sembraron).
  confirmado_por text,
  confirmado_en date,

  notas text,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id)
);

comment on table parametro_regulatorio is
  'Catálogo de plataforma: valores fijados por una autoridad, con vigencia y fuente. Sustituye a las constantes en código. Lo mantiene Kawiil (platform_admin).';
comment on column parametro_regulatorio.sector is
  'Alcance del parámetro. ''*'' = todas las actividades. Un valor por sector gana sobre el global.';
comment on column parametro_regulatorio.confirmado_por is
  'Null = sembrado pero NO validado por Kawiil-Cumplimiento. La UI debe marcarlo como referencia.';

-- Un mismo parámetro no puede tener dos valores vigentes el mismo día para
-- el mismo alcance. Es la garantía de que `parametro_vigente()` nunca es ambiguo.
alter table parametro_regulatorio drop constraint if exists parametro_sin_traslape;
alter table parametro_regulatorio
  add constraint parametro_sin_traslape
  exclude using gist (
    codigo with =,
    sector with =,
    daterange(vigente_desde, vigente_hasta, '[)') with &&
  );

create index if not exists idx_parametro_codigo_vigencia
  on parametro_regulatorio (codigo, sector, vigente_desde desc);

-- =====================================================================
-- Resolución
-- =====================================================================
-- Devuelve el valor vigente a una fecha. Un parámetro específico del sector
-- gana sobre el global ('*'). Devuelve null si no hay ninguno vigente: quien
-- llama decide si eso es un error (el motor) o un guion en pantalla (el front).
create or replace function public.parametro_vigente(
  p_codigo text,
  p_fecha date default current_date,
  p_sector text default '*'
)
returns numeric
language sql
stable
set search_path = public
as $$
  select p.valor_numerico
  from parametro_regulatorio p
  where p.codigo = p_codigo
    and p.sector in (p_sector, '*')
    and p.vigente_desde <= p_fecha
    and (p.vigente_hasta is null or p.vigente_hasta > p_fecha)
  -- El específico del sector primero; si no hay, el global.
  order by (p.sector <> '*') desc
  limit 1
$$;

comment on function public.parametro_vigente(text, date, text) is
  'Valor de un parámetro regulatorio a una fecha dada. El parámetro por sector gana sobre el global.';

-- Vista de conveniencia: todo lo vigente hoy, en una sola consulta para el front.
--
-- `security_invoker = true` NO es opcional: desde PostgreSQL 15 una vista corre
-- por omisión con los permisos de su dueño, lo que haría que la vista SALTARA
-- la RLS de la tabla y expusiera el catálogo incluso a sesiones anónimas. Con
-- security_invoker la vista respeta la política de quien consulta.
create or replace view v_parametros_vigentes
with (security_invoker = true) as
  select codigo, nombre, valor_numerico, unidad, sector,
         vigente_desde, fuente, publicacion_dof, url_fuente,
         confirmado_por, confirmado_en, notas
  from parametro_regulatorio
  where vigente_desde <= current_date
    and (vigente_hasta is null or vigente_hasta > current_date);

comment on view v_parametros_vigentes is
  'Parámetros regulatorios vigentes hoy. Es lo que consume el front; no consultar la tabla directamente.';

-- =====================================================================
-- RLS
-- =====================================================================
alter table parametro_regulatorio enable row level security;

-- Lectura para cualquier usuario autenticado: es un catálogo regulatorio
-- común, no información de una organización.
drop policy if exists "parametro_select_autenticado" on parametro_regulatorio;
create policy "parametro_select_autenticado" on parametro_regulatorio
  for select using (auth.uid() is not null);

-- Escritura sólo para admins de Kawiil. Ninguna organización cliente puede
-- cambiar un umbral de ley desde su propia consola.
drop policy if exists "parametro_write_kawiil" on parametro_regulatorio;
create policy "parametro_write_kawiil" on parametro_regulatorio
  for all using (public.es_admin_kawiil()) with check (public.es_admin_kawiil());
