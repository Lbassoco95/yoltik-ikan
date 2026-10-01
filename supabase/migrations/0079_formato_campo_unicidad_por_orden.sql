-- =====================================================================
-- 0079 · Unicidad de campos de formato por orden (no por numero)
-- =====================================================================
-- El DOF reutiliza `numero` dentro del mismo anexo (p. ej. dos renglones
-- «3.5»). La extracción lo refleja; no se corrige. La clave natural estable
-- es `orden`. Ver docs/formatos-uif/INCONSISTENCIAS.md.
--
-- Reversa:
--   alter table formato_oficial_campo drop constraint if exists formato_oficial_campo_formato_id_orden_key;
-- =====================================================================

alter table formato_oficial_campo
  drop constraint if exists formato_oficial_campo_formato_id_numero_key;

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'formato_oficial_campo_formato_id_orden_key'
  ) then
    alter table formato_oficial_campo
      add constraint formato_oficial_campo_formato_id_orden_key
      unique (formato_id, orden);
  end if;
end $$;

comment on constraint formato_oficial_campo_formato_id_orden_key on formato_oficial_campo is
  'Unicidad por orden canónico del DOF. `numero` puede repetirse en el mismo anexo.';
