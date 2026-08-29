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
