-- =====================================================================
-- Ikán · Aplicación manual · Migration 0011 + seed 10 (parámetros)
-- =====================================================================
-- Generado concatenando:
--   supabase/migrations/0011_parametros_regulatorios.sql
--   supabase/seed/10_parametros_regulatorios.sql
--
-- Envuelto en begin/commit: si algo truena a media, revierte todo y el
-- proyecto queda como estaba (seguro para reintentar), nunca a medias.
--
-- A DIFERENCIA del bundle 0001–0005, este archivo SÍ es idempotente
-- (`create ... if not exists`, `create or replace`, `where not exists`):
-- se puede correr más de una vez sin romper nada.
--
-- REQUISITO: la migration 0008 debe estar aplicada, porque la política de
-- escritura usa `es_admin_kawiil()`, que nace ahí.
--
-- Verificación posterior (debe devolver la UMA vigente):
--   select public.parametro_vigente('uma_diaria');
--   select codigo, sector, valor_numerico, confirmado_por
--   from v_parametros_vigentes order by codigo;
-- =====================================================================

begin;

-- ============================================================
-- >>> supabase/migrations/0011_parametros_regulatorios.sql
-- ============================================================
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

-- ============================================================
-- >>> supabase/seed/10_parametros_regulatorios.sql
-- ============================================================
-- =====================================================================
-- Seed · Parámetros regulatorios (catálogo de plataforma)
-- =====================================================================
-- Requiere la migration 0011.
--
-- Idempotente por `where not exists`: la tabla tiene restricción de
-- EXCLUSIÓN (no de unicidad), y `on conflict` no opera sobre exclusiones.
--
-- TODOS los NULL van casteados. En una lista VALUES, PostgreSQL infiere el
-- tipo de cada columna a partir de las filas; si TODAS las filas traen NULL sin
-- tipo, la infiere como `text` y el insert truena contra una columna `date`:
--   ERROR: column "confirmado_en" is of type date but expression is of type text
-- Pasó de verdad al aplicar este seed. El casteo explícito también evita que
-- reordenar las filas cambie la inferencia.
--
-- REGLA: no se siembra ninguna cifra sin fuente. Las que Kawiil-Cumplimiento
-- todavía no valida se siembran con `confirmado_por = null`, y la UI las
-- marca como referencia. Sembrarlas sin marca sería peor que no tenerlas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- UMA — publicada por INEGI, con vigencia del 1 de febrero al 31 de enero
-- ---------------------------------------------------------------------
-- Corrige el error que traía el repo: había 113.07 en el código (el valor de
-- 2025 mal transcrito; el real fue 113.14) y 132.59 en el mock que veía el
-- usuario, sin respaldo. El motor calculaba los umbrales por debajo del real.
insert into parametro_regulatorio
  (codigo, nombre, valor_numerico, unidad, sector, vigente_desde, vigente_hasta,
   fuente, publicacion_dof, url_fuente, confirmado_por, confirmado_en, notas)
select * from (values
  ('uma_diaria', 'UMA · valor diario 2025', 113.1400, 'mxn', '*',
   date '2025-02-01', date '2026-02-01',
   'INEGI · Unidad de Medida y Actualización',
   'DOF · valores UMA 2025', 'https://www.inegi.org.mx/temas/uma/',
   null::text, null::date,
   'Valor histórico. Se conserva para poder recalcular actos de 2025 con la UMA que les correspondía.'),

  ('uma_diaria', 'UMA · valor diario 2026', 117.3100, 'mxn', '*',
   date '2026-02-01', null::date,
   'INEGI · comunicado de prensa 1/26 del 8 de enero de 2026',
   'DOF 09/01/2026', 'https://www.inegi.org.mx/temas/uma/',
   null::text, null::date,
   'Vigencia 1 feb 2026 – 31 ene 2027. Incremento de 3.69% sobre los 113.14 de 2025, por variación anual del INPC a diciembre de 2025. Verificado contra fuentes secundarias coincidentes; falta el visto bueno formal de Kawiil-Cumplimiento contra el DOF.')
) as v(codigo, nombre, valor_numerico, unidad, sector, vigente_desde, vigente_hasta,
       fuente, publicacion_dof, url_fuente, confirmado_por, confirmado_en, notas)
where not exists (
  select 1 from parametro_regulatorio p
  where p.codigo = v.codigo and p.sector = v.sector and p.vigente_desde = v.vigente_desde
);

-- ---------------------------------------------------------------------
-- Umbrales generales
-- ---------------------------------------------------------------------
-- Se trasladan tal cual venían en el código (src/lib/utils.ts y
-- OperationsPage), conservando la cita que ya traía el repo. NO se cambia su
-- alcance: seguían aplicándose a todas las actividades, así que entran como
-- sector '*'. Si Kawiil-Cumplimiento determina que son específicos de una
-- fracción, se corrige con una fila por sector, que gana sobre la global.
--
-- `vigente_desde` se fija al inicio del ejercicio en curso, NO a la fecha de
-- entrada en vigor de la ley, porque esa fecha no está documentada en el repo
-- y no se inventa. Se corrige cuando Kawiil-Cumplimiento la confirme.
insert into parametro_regulatorio
  (codigo, nombre, valor_numerico, unidad, sector, vigente_desde,
   fuente, confirmado_por, notas)
select * from (values
  ('umbral_identificacion_uma', 'Umbral de identificación', 645.0000, 'uma', '*',
   date '2026-01-01', 'Art. 17 LFPIORPI (cita heredada de src/lib/utils.ts)', null::text,
   'Trasladado del código sin cambiar su valor ni su alcance. Confirmar fecha de vigencia de origen y si aplica a todas las fracciones.'),

  ('umbral_restriccion_uma', 'Umbral de restricción', 3210.0000, 'uma', '*',
   date '2026-01-01', 'Heredado de src/pages/OperationsPage.tsx', null::text,
   'Trasladado del código. El repo lo usaba sin cita explícita; confirmar fundamento y alcance.')
) as v(codigo, nombre, valor_numerico, unidad, sector, vigente_desde,
       fuente, confirmado_por, notas)
where not exists (
  select 1 from parametro_regulatorio p
  where p.codigo = v.codigo and p.sector = v.sector and p.vigente_desde = v.vigente_desde
);

-- ---------------------------------------------------------------------
-- Umbrales de la fracción XII (fe pública) — SIN CONFIRMAR
-- ---------------------------------------------------------------------
-- Vienen marcados como "referencia sujeta a confirmación" desde que se
-- sembraron en 08_notarias_demo.sql. Al entrar aquí dejan de ser una nota en
-- un comentario y pasan a poder decidir avisos, así que la marca importa más:
-- `confirmado_por` null es lo que hace que la UI los muestre con banner.
insert into parametro_regulatorio
  (codigo, nombre, valor_numerico, unidad, sector, vigente_desde,
   fuente, confirmado_por, notas)
select * from (values
  ('umbral_xii_inmueble_uma', 'Transmisión de inmueble · umbral de aviso', 16000.0000, 'uma', 'XII',
   date '2026-01-01', 'Art. 17 fr. XII LFPIORPI (referencia, sin confirmar)', null::text,
   'PENDIENTE_CONFIRMAR con Kawiil-Cumplimiento. Proviene de fuentes secundarias no cruzadas con el texto legal vigente.'),

  ('umbral_xii_persona_moral_uma', 'Constitución de persona moral · umbral de aviso', 8025.0000, 'uma', 'XII',
   date '2026-01-01', 'Art. 17 fr. XII LFPIORPI (referencia, sin confirmar)', null::text,
   'PENDIENTE_CONFIRMAR con Kawiil-Cumplimiento. Proviene de fuentes secundarias no cruzadas con el texto legal vigente.')
) as v(codigo, nombre, valor_numerico, unidad, sector, vigente_desde,
       fuente, confirmado_por, notas)
where not exists (
  select 1 from parametro_regulatorio p
  where p.codigo = v.codigo and p.sector = v.sector and p.vigente_desde = v.vigente_desde
);

commit;
