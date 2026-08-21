-- =====================================================================
-- Ikán · Migration 0006 · Perfil de actividad (multi-vertical) + sector XII
-- =====================================================================
-- Aditiva y no destructiva. Habilita la demo de Notarías (fracción XII, fe
-- pública) sin reestructurar nada:
--   - `sector_av` gana el valor 'XII' (fe pública / notarías).
--   - `organizations.perfil_actividad` (nullable) permite "vestir" la UI por
--     vertical (ej. 'notarias'); null = genérico.
--
-- IMPORTANTE (regla de PostgreSQL): un valor de enum recién agregado con
-- ALTER TYPE ... ADD VALUE no puede USARSE en la MISMA transacción. Por eso
-- esta migration solo AGREGA el valor; su uso (sembrar tipologías sector 'XII')
-- va en el seed 08, que corre en una transacción posterior. Al aplicar a mano
-- en el SQL Editor, corre esta migration en un envío y el seed en otro.
-- =====================================================================

alter type sector_av add value if not exists 'XII';

alter table organizations add column if not exists perfil_actividad text;
comment on column organizations.perfil_actividad is
  'Vertical para "vestir" la UI (ej. notarias). Null = genérico. Mismo motor, distinta cara.';
