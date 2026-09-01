-- =====================================================================
-- Verificación de la 0050 · provisionar una organización
-- =====================================================================
-- Se corre DESPUÉS de aplicar la migration, contra el remoto, en el SQL Editor.
-- No provisiona nada: sólo comprueba que quedó puesto lo que hace falta y
-- diagnostica lo que YA está en producción.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lo que la migration dejó puesto
-- ---------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
    where table_name = 'organizations' and column_name = 'es_referencia')          as columna_referencia,
  (select count(*) from organizations where es_referencia)                          as orgs_de_referencia,
  (select count(*) from pg_proc where proname = 'provisionar_organizacion')         as fn_provisionar,
  (select count(*) from pg_proc where proname = 'diagnostico_organizacion')         as fn_diagnostico;
-- Esperado: 1, 2, 1, 1
--   (2 organizaciones de referencia: Ixim Pay para XVI y la notaría para XII)

-- ---------------------------------------------------------------------
-- 2. Cuáles quedaron marcadas como referencia
-- ---------------------------------------------------------------------
select razon_social, sectores, es_demostracion
  from organizations where es_referencia
 order by razon_social;

-- ---------------------------------------------------------------------
-- 3. EL DIAGNÓSTICO DE LO QUE YA ESTÁ EN PRODUCCIÓN
-- ---------------------------------------------------------------------
-- Esto es lo que de verdad importa de esta verificación: los huecos que nombra
-- se ven todos iguales desde la aplicación —verde— y hasta hoy no había forma
-- de distinguirlos. Si alguna organización sale con `listo = false` en matriz,
-- GAFI o tipologías, está calificando expedientes a ciegas HOY.
select o.razon_social, d.concepto, d.cuantos, d.listo, d.detalle
  from organizations o
 cross join lateral public.diagnostico_organizacion(o.id) d
 order by o.razon_social, d.listo, d.concepto;

-- ---------------------------------------------------------------------
-- 4. Sólo las banderas rojas, para leerlo de un vistazo
-- ---------------------------------------------------------------------
select o.razon_social, d.concepto, d.detalle
  from organizations o
 cross join lateral public.diagnostico_organizacion(o.id) d
 where not d.listo
 order by o.razon_social, d.concepto;
-- Lo deseable aquí es que no salga NADA, o a lo sumo «Usuarios con rol» en una
-- organización recién creada a la que todavía no se le dan de alta usuarios.
